require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const database = require("./database");

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

const config = require("./config");

// ========================================
// ENVIRONMENT CHECK
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing.");
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing.");
    process.exit(1);
}

// ========================================
// EXPRESS / RENDER SERVER
// ========================================

const app = express();

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
    res.status(200).send(
        "🛡️ Guardian Anti-Raid is online."
    );
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        bot: client.isReady()
            ? "online"
            : "starting",
        database: databaseReady
            ? "online"
            : "starting"
    });
});

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let databaseReady = false;

// Start Render web server
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
// BOT READY
// ========================================

client.once(
    "ready",
    async () => {

        console.log("================================");
        console.log("🛡️ GUARDIAN ANTI-RAID ONLINE");
        console.log("================================");

        console.log(
            `Logged in as ${client.user.tag}`
        );

        console.log(
            `Monitoring ${client.guilds.cache.size} server(s)`
        );

        console.log(
            "New-account protection: 24 hours"
        );

        // ====================================
        // DATABASE INITIALIZATION
        // ====================================

        try {

            console.log(
                "🔄 Connecting to PostgreSQL..."
            );

            await database.initDatabase();

            await database.testDatabase();

            databaseReady = true;

            console.log(
                "✅ PostgreSQL database connected."
            );

            console.log(
                "✅ Blocked words will survive restarts and redeploys."
            );

        } catch (error) {

            databaseReady = false;

            console.error(
                "❌ Database startup failed:"
            );

            console.error(error);

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
            // ACCOUNT AGE CHECK
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
                        `[PROTECTION] Kicked ${member.user.tag} - account under 24 hours old.`
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
                `[JOIN RATE] ${recentJoins} joins in ${config.raidTimeWindow} seconds`
            );

            // ====================================
            // RAID DETECTION
            // ====================================

            if (
                recentJoins >= config.raidJoinThreshold &&
                !isLockedDown(member.guild.id)
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
                            channel.name === "raid-logs"
                    );

                if (logChannel) {

                    const embed =
                        new EmbedBuilder()
                            .setTitle("🚨 RAID DETECTED")
                            .setDescription(
                                "Guardian Anti-Raid detected a rapid increase in members."
                            )
                            .addFields(
                                {
                                    name: "Server",
                                    value: member.guild.name
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

            // Database must be ready
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
                `[WORD FILTER] ${message.author.tag} used blocked word: ${blockedWord}`
            );

            // ====================================
            // DELETE MESSAGE
            // ====================================

            try {

                if (message.deletable) {

                    await message.delete();

                    console.log(
                        `[WORD FILTER] Deleted message from ${message.author.tag}`
                    );

                } else {

                    console.warn(
                        `[WORD FILTER] Cannot delete message from ${message.author.tag}`
                    );

                }

            } catch (error) {

                console.error(
                    "❌ Could not delete banned-word message:",
                    error.message
                );

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
            // 24-HOUR TIMEOUT
            // ====================================

            const timeoutDuration =
                config.wordTimeoutDuration ||
                24 * 60 * 60 * 1000;

            if (!member.moderatable) {

                console.warn(
                    `[WORD FILTER] Cannot timeout ${message.author.tag}.`
                );

                console.warn(
                    "[WORD FILTER] Make sure Guardian's role is ABOVE the user's role and has Moderate Members permission."
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
// SAFE INTERACTION ERROR HANDLER
// ========================================

async function sendInteractionError(
    interaction,
    content
) {

    try {

        if (interaction.replied) {

            await interaction.followUp({
                content,
                ephemeral: true
            });

            return;

        }

        if (interaction.deferred) {

            await interaction.editReply({
                content
            });

            return;

        }

        await interaction.reply({
            content,
            ephemeral: true
        });

    } catch (error) {

        // 40060 means Discord already acknowledged
        // the interaction. Do not attempt another reply.

        if (error.code === 40060) {

            console.warn(
                "⚠️ Interaction was already acknowledged by Discord."
            );

            return;
        }

        console.error(
            "❌ Could not send interaction error:",
            error
        );

    }
}

// ========================================
// SLASH COMMANDS
// ========================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        try {

            // ====================================
            // SERVER CHECK
            // ====================================

            if (!interaction.guild) {

                await sendInteractionError(
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
                isAuthorizedUser(
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

                    await sendInteractionError(
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

                    await sendInteractionError(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                authorizeUser(
                    interaction.guild.id,
                    user.id
                );

                await interaction.reply({
                    content:
                        `✅ ${user} is now authorized to use Guardian.`,
                    ephemeral: true
                });

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

                    await sendInteractionError(
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

                    await sendInteractionError(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                const removed =
                    unauthorizeUser(
                        interaction.guild.id,
                        user.id
                    );

                await interaction.reply({
                    content:
                        removed
                            ? `✅ ${user} is no longer authorized to use Guardian.`
                            : `⚠️ ${user} was not authorized.`,
                    ephemeral: true
                });

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

                    await sendInteractionError(
                        interaction,
                        "❌ Only server administrators can view the authorized-user list."
                    );

                    return;
                }

                const users =
                    getAuthorizedUsers(
                        interaction.guild.id
                    );

                if (users.length === 0) {

                    await interaction.reply({
                        content:
                            "📋 No users are currently authorized.",
                        ephemeral: true
                    });

                    return;
                }

                const list =
                    users
                        .map(
                            id => `<@${id}>`
                        )
                        .join("\n");

                await interaction.reply({
                    content:
                        `🛡️ **Authorized Guardian Users**\n\n${list}`,
                    ephemeral: true
                });

                return;
            }

            // ====================================
            // AUTHORIZATION FOR OTHER COMMANDS
            // ====================================

            if (
                !isAdministrator &&
                !isAuthorized
            ) {

                await sendInteractionError(
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

                await interaction.reply(
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

                await interaction.reply(
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

                await interaction.reply(
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

                    await sendInteractionError(
                        interaction,
                        "❌ The database is not ready yet. Please try again in a moment."
                    );

                    return;
                }

                const word =
                    interaction.options
                        .getString("word")
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await sendInteractionError(
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

                await interaction.reply({
                    content:
                        added
                            ? `✅ **${word}** has been permanently added to the blocked-word list.\n\nMessages containing this word will be deleted and the user will be timed out for 24 hours.`
                            : `⚠️ **${word}** could not be added.`,
                    ephemeral: true
                });

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

                    await sendInteractionError(
                        interaction,
                        "❌ The database is not ready yet. Please try again in a moment."
                    );

                    return;
                }

                const word =
                    interaction.options
                        .getString("word")
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await sendInteractionError(
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

                await interaction.reply({
                    content:
                        removed
                            ? `✅ **${word}** has been removed from the blocked-word list.`
                            : `⚠️ **${word}** was not found.`,
                    ephemeral: true
                });

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

                    await sendInteractionError(
                        interaction,
                        "❌ The database is not ready yet. Please try again in a moment."
                    );

                    return;
                }

                const words =
                    await getBlockedWords(
                        interaction.guild.id
                    );

                if (!words || words.length === 0) {

                    await interaction.reply({
                        content:
                            "📋 No blocked words are configured.",
                        ephemeral: true
                    });

                    return;
                }

                const list =
                    words
                        .map(
                            word => `• ${word}`
                        )
                        .join("\n");

                await interaction.reply({
                    content:
                        `🚨 **Permanent Blocked Words**\n\n${list}`,
                    ephemeral: true
                });

                return;
            }

            // ====================================
            // UNKNOWN COMMAND
            // ====================================

            await sendInteractionError(
                interaction,
                "❌ Unknown Guardian command."
            );

        } catch (error) {

            console.error(
                "❌ Command error:",
                error
            );

            await sendInteractionError(
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
// LOGIN
// ========================================

client.login(
    process.env.DISCORD_TOKEN
);
