require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const database =
    require("./database");

const {

    recordJoin,
    isSuspiciousAccount,
    isWhitelisted,
    kickMember,

    lockdown,
    unlock,
    isLockedDown,

    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers,

    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord

} = require("./antiRaid");

const config =
    require("./config");

// ========================================
// ENVIRONMENT CHECK
// ========================================

if (!process.env.DISCORD_TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}

if (!process.env.CLIENT_ID) {

    console.error(
        "❌ CLIENT_ID is missing."
    );

    process.exit(1);
}

if (!process.env.DATABASE_URL) {

    console.error(
        "❌ DATABASE_URL is missing."
    );

    process.exit(1);
}

// ========================================
// DATABASE STATE
// ========================================

let databaseReady = false;

// ========================================
// EXPRESS / RENDER
// ========================================

const app =
    express();

const PORT =
    process.env.PORT || 10000;

// ========================================
// HOME
// ========================================

app.get(
    "/",
    (req, res) => {

        res.status(200).send(
            "🛡️ Guardian Anti-Raid is online."
        );
    }
);

// ========================================
// HEALTH
// ========================================

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            status: "online",

            bot:
                client.isReady()
                    ? "online"
                    : "starting",

            database:
                databaseReady
                    ? "online"
                    : "offline"

        });
    }
);

// ========================================
// DISCORD CLIENT
// ========================================

const client =
    new Client({

        intents: [

            GatewayIntentBits.Guilds,

            GatewayIntentBits.GuildMembers,

            GatewayIntentBits.GuildMessages,

            GatewayIntentBits.MessageContent

        ]

    });

// ========================================
// EXPRESS START
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🌐 Web server running on port ${PORT}`
        );

    }
);

// ========================================
// SAFE INTERACTION RESPONSE
// ========================================

async function safeReply(
    interaction,
    content
) {

    try {

        if (
            interaction.replied ||
            interaction.deferred
        ) {

            await interaction.followUp({

                content,

                ephemeral: true

            });

        } else {

            await interaction.reply({

                content,

                ephemeral: true

            });
        }

    } catch (error) {

        // Discord 40060 =
        // interaction was already acknowledged

        if (error.code === 40060) {

            console.warn(
                "⚠️ Discord interaction was already acknowledged."
            );

            return;
        }

        console.error(
            "❌ Interaction response error:",
            error
        );
    }
}

// ========================================
// BOT READY
// ========================================

client.once(
    "ready",
    async () => {

        console.log(
            "================================"
        );

        console.log(
            "🛡️ GUARDIAN ANTI-RAID ONLINE"
        );

        console.log(
            "================================"
        );

        console.log(
            `Logged in as ${client.user.tag}`
        );

        console.log(
            `Monitoring ${client.guilds.cache.size} server(s)`
        );

        console.log(
            "New-account protection: 24 hours"
        );

        if (databaseReady) {

            console.log(
                "🗄️ PostgreSQL: READY"
            );

            console.log(
                "🚫 Blocked words: PERSISTENT"
            );

            console.log(
                "🛡️ Authorized users: PERSISTENT"
            );

        } else {

            console.error(
                "❌ PostgreSQL is NOT ready."
            );
        }
    }
);

// ========================================
// MEMBER JOIN
// ========================================

client.on(
    "guildMemberAdd",
    async member => {

        try {

            console.log(
                `[JOIN] ${member.user.tag} joined ${member.guild.name}`
            );

            // Ignore bots
            if (member.user.bot) {
                return;
            }

            // Ignore whitelisted users
            if (isWhitelisted(member)) {
                return;
            }

            // ====================================
            // ACCOUNT AGE
            // ====================================

            const suspicious =
                isSuspiciousAccount(member);

            if (
                suspicious &&
                config.kickNewAccounts
            ) {

                const kicked =
                    await kickMember(
                        member,
                        "Guardian Anti-Raid: account is less than 24 hours old."
                    );

                if (kicked) {

                    console.log(
                        `[PROTECTION] Kicked ${member.user.tag}`
                    );
                }

                return;
            }

            // ====================================
            // RECORD JOIN
            // ====================================

            const recentJoins =
                recordJoin(
                    member.guild.id,
                    member.id
                );

            console.log(
                `[JOIN RATE] ${recentJoins} joins / ${config.raidTimeWindow} seconds`
            );

            // ====================================
            // RAID DETECTION
            // ====================================

            if (
                recentJoins >=
                    config.raidJoinThreshold &&

                !isLockedDown(
                    member.guild.id
                )
            ) {

                console.log(
                    `[RAID] 🚨 RAID DETECTED in ${member.guild.name}`
                );

                await lockdown(
                    member.guild,
                    `${recentJoins} members joined within ${config.raidTimeWindow} seconds`
                );

                // ====================================
                // RAID LOG
                // ====================================

                const logChannel =
                    member.guild.channels.cache.find(
                        channel =>
                            channel.name ===
                            "raid-logs"
                    );

                if (logChannel) {

                    const embed =
                        new EmbedBuilder()

                            .setTitle(
                                "🚨 RAID DETECTED"
                            )

                            .setDescription(
                                "Guardian Anti-Raid detected a rapid increase in members."
                            )

                            .addFields(

                                {
                                    name: "Server",
                                    value:
                                        member.guild.name
                                },

                                {
                                    name: "Join Rate",
                                    value:
                                        `${recentJoins} joins / ${config.raidTimeWindow} seconds`
                                },

                                {
                                    name: "Action",
                                    value:
                                        "🔒 Server lockdown activated"
                                }

                            )

                            .setTimestamp();

                    try {

                        await logChannel.send({
                            embeds: [embed]
                        });

                    } catch (error) {

                        console.error(
                            "❌ Could not send raid log:",
                            error.message
                        );
                    }
                }
            }

        } catch (error) {

            console.error(
                "❌ Member join handler error:",
                error
            );
        }
    }
);

// ========================================
// BANNED WORD FILTER
// ========================================

client.on(
    "messageCreate",
    async message => {

        try {

            // Ignore bots
            if (message.author.bot) {
                return;
            }

            // Ignore DMs
            if (!message.guild) {
                return;
            }

            // ====================================
            // DATABASE CHECK
            // ====================================

            if (!databaseReady) {

                console.warn(
                    "[WORD FILTER] Database is not ready."
                );

                return;
            }

            // ====================================
            // FIND BLOCKED WORD
            // ====================================

            const blockedWord =
                await findBlockedWord(
                    message.guild.id,
                    message.content
                );

            if (!blockedWord) {
                return;
            }

            console.log(
                `[WORD FILTER] ${message.author.tag} used "${blockedWord}"`
            );

            // ====================================
            // DELETE MESSAGE
            // ====================================

            if (message.deletable) {

                try {

                    await message.delete();

                    console.log(
                        `[WORD FILTER] Deleted message from ${message.author.tag}`
                    );

                } catch (error) {

                    console.error(
                        "❌ Could not delete banned-word message:",
                        error.message
                    );
                }
            }

            // ====================================
            // GET MEMBER
            // ====================================

            const member =
                message.member;

            if (!member) {
                return;
            }

            // ====================================
            // TIMEOUT
            // ====================================

            const timeoutDuration =
                config.wordTimeoutDuration ||
                24 * 60 * 60 * 1000;

            if (!member.moderatable) {

                console.warn(
                    `[WORD FILTER] Cannot timeout ${message.author.tag}.`
                );

                console.warn(
                    "[WORD FILTER] Check Guardian's role position and Moderate Members permission."
                );

                return;
            }

            try {

                await member.timeout(

                    timeoutDuration,

                    `Guardian Anti-Raid: used blocked word "${blockedWord}"`

                );

                console.log(
                    `[WORD FILTER] ⏱️ Timed out ${message.author.tag} for 24 hours.`
                );

            } catch (error) {

                console.error(
                    "❌ Could not timeout member:",
                    error.message
                );
            }

        } catch (error) {

            console.error(
                "❌ Banned word filter error:",
                error
            );
        }
    }
);

// ========================================
// SLASH COMMANDS
// ========================================

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        try {

            // ====================================
            // SERVER CHECK
            // ====================================

            if (!interaction.guild) {

                await safeReply(
                    interaction,
                    "❌ Guardian commands can only be used inside a server."
                );

                return;
            }

            // ====================================
            // ADMIN CHECK
            // ====================================

            const isAdministrator =
                interaction.memberPermissions?.has(
                    "Administrator"
                ) === true;

            // ====================================
            // AUTHORIZATION CHECK
            // ====================================

            const isAuthorized =
                await isAuthorizedUser(
                    interaction.guild.id,
                    interaction.user.id
                );

            // ====================================
            // /AUTHORIZE
            // ====================================

            if (
                interaction.commandName ===
                "authorize"
            ) {

                if (!isAdministrator) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can authorize users."
                    );

                    return;
                }

                const user =
                    interaction.options.getUser(
                        "user"
                    );

                if (!user) {

                    await safeReply(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                const authorized =
                    await authorizeUser(
                        interaction.guild.id,
                        user.id
                    );

                await safeReply(
                    interaction,

                    authorized
                        ? `✅ ${user} is now permanently authorized to use Guardian.`
                        : `⚠️ ${user} is already authorized.`
                );

                return;
            }

            // ====================================
            // /UNAUTHORIZE
            // ====================================

            if (
                interaction.commandName ===
                "unauthorize"
            ) {

                if (!isAdministrator) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can remove authorized users."
                    );

                    return;
                }

                const user =
                    interaction.options.getUser(
                        "user"
                    );

                if (!user) {

                    await safeReply(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                const removed =
                    await unauthorizeUser(
                        interaction.guild.id,
                        user.id
                    );

                await safeReply(
                    interaction,

                    removed
                        ? `✅ ${user} is no longer authorized to use Guardian.`
                        : `⚠️ ${user} was not authorized.`
                );

                return;
            }

            // ====================================
            // /AUTHORIZED-LIST
            // ====================================

            if (
                interaction.commandName ===
                "authorized-list"
            ) {

                if (!isAdministrator) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can view the authorized-user list."
                    );

                    return;
                }

                const users =
                    await getAuthorizedUsers(
                        interaction.guild.id
                    );

                if (
                    !users ||
                    users.length === 0
                ) {

                    await safeReply(
                        interaction,
                        "📋 No users are currently authorized."
                    );

                    return;
                }

                const list =
                    users
                        .map(
                            id => `<@${id}>`
                        )
                        .join("\n");

                await safeReply(
                    interaction,
                    `🛡️ **Authorized Guardian Users**\n\n${list}`
                );

                return;
            }

            // ====================================
            // AUTHORIZATION FOR OTHER COMMANDS
            // ====================================

            if (
                !isAdministrator &&
                !isAuthorized
            ) {

                await safeReply(
                    interaction,
                    "❌ You are not authorized to use Guardian Anti-Raid."
                );

                return;
            }

            // ====================================
            // /LOCKDOWN
            // ====================================

            if (
                interaction.commandName ===
                "lockdown"
            ) {

                await lockdown(
                    interaction.guild,
                    `Manual lockdown by ${interaction.user.tag}`
                );

                await safeReply(
                    interaction,
                    "🔒 **SERVER LOCKDOWN ACTIVATED**"
                );

                return;
            }

            // ====================================
            // /UNLOCK
            // ====================================

            if (
                interaction.commandName ===
                "unlock"
            ) {

                await unlock(
                    interaction.guild
                );

                await safeReply(
                    interaction,
                    "🔓 **SERVER LOCKDOWN REMOVED**"
                );

                return;
            }

            // ====================================
            // /RAIDSTATUS
            // ====================================

            if (
                interaction.commandName ===
                "raidstatus"
            ) {

                const locked =
                    isLockedDown(
                        interaction.guild.id
                    );

                await safeReply(
                    interaction,

                    locked
                        ? "🚨 **RAID LOCKDOWN ACTIVE**"
                        : "🟢 **NO RAID LOCKDOWN ACTIVE**"
                );

                return;
            }

            // ====================================
            // /WORD-ADD
            // ====================================

            if (
                interaction.commandName ===
                "word-add"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready yet. Please try again in a moment."
                    );

                    return;
                }

                const word =
                    interaction.options
                        .getString("word")
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await safeReply(
                        interaction,
                        "❌ You must provide a word."
                    );

                    return;
                }

                const added =
                    await addBlockedWord(
                        interaction.guild.id,
                        word
                    );

                await safeReply(
                    interaction,

                    added
                        ? `✅ **${word}** has been permanently added to the blocked-word database.`
                        : `⚠️ **${word}** is already in the blocked-word database.`
                );

                console.log(
                    `[WORD FILTER] Added "${word}" in ${interaction.guild.name}`
                );

                return;
            }

            // ====================================
            // /WORD-REMOVE
            // ====================================

            if (
                interaction.commandName ===
                "word-remove"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready yet."
                    );

                    return;
                }

                const word =
                    interaction.options
                        .getString("word")
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await safeReply(
                        interaction,
                        "❌ You must provide a word."
                    );

                    return;
                }

                const removed =
                    await removeBlockedWord(
                        interaction.guild.id,
                        word
                    );

                await safeReply(
                    interaction,

                    removed
                        ? `✅ **${word}** has been permanently removed from the blocked-word database.`
                        : `⚠️ **${word}** was not found.`
                );

                return;
            }

            // ====================================
            // /WORD-LIST
            // ====================================

            if (
                interaction.commandName ===
                "word-list"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready yet."
                    );

                    return;
                }

                const words =
                    await getBlockedWords(
                        interaction.guild.id
                    );

                if (
                    !words ||
                    words.length === 0
                ) {

                    await safeReply(
                        interaction,
                        "📋 No blocked words are configured."
                    );

                    return;
                }

                const list =
                    words
                        .map(
                            word =>
                                `• ${word}`
                        )
                        .join("\n");

                await safeReply(
                    interaction,
                    `🚨 **Permanent Blocked Words**\n\n${list}`
                );

                return;
            }

            // ====================================
            // UNKNOWN COMMAND
            // ====================================

            await safeReply(
                interaction,
                "❌ Unknown Guardian command."
            );

        } catch (error) {

            console.error(
                "❌ Command error:",
                error
            );

            await safeReply(
                interaction,
                "❌ Something went wrong while processing that command."
            );
        }
    }
);

// ========================================
// DISCORD ERRORS
// ========================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord client error:",
            error
        );
    }
);

client.on(
    "warn",
    warning => {

        console.warn(
            "⚠️ Discord warning:",
            warning
        );
    }
);

// ========================================
// START BOT
// DATABASE FIRST
// ========================================

async function startBot() {

    try {

        console.log(
            "================================"
        );

        console.log(
            "🗄️ CONNECTING TO POSTGRESQL"
        );

        console.log(
            "================================"
        );

        await database.initDatabase();

        await database.testDatabase();

        databaseReady = true;

        console.log(
            "✅ DATABASE READY"
        );

        console.log(
            "✅ Blocked words database ready."
        );

        console.log(
            "✅ Authorized users database ready."
        );

        console.log(
            "================================"
        );

        console.log(
            "🤖 STARTING DISCORD BOT"
        );

        console.log(
            "================================"
        );

        await client.login(
            process.env.DISCORD_TOKEN
        );

    } catch (error) {

        databaseReady = false;

        console.error(
            "================================"
        );

        console.error(
            "❌ BOT STARTUP FAILED"
        );

        console.error(
            error
        );

        console.error(
            "================================"
        );

        process.exit(1);
    }
}

startBot();
