require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

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
            : "starting"
    });
});

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

        // ====================================
        // DATABASE
        // ====================================

        try {

            await database.initDatabase();

            await database.testDatabase();

        } catch (error) {

            console.error(
                "❌ Database startup failed:",
                error
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

                    await logChannel.send({
                        embeds: [embed]
                    });
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
            // CHECK FOR BLOCKED WORD
            // ====================================

            const blockedWord =
                findBlockedWord(
                    message.guild.id,
                    message.content
                );

            // No blocked word
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

                    console.log(
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
            // 24 HOUR TIMEOUT
            // ====================================

            const timeoutDuration =
                config.wordTimeoutDuration ||
                24 * 60 * 60 * 1000;

            if (member.moderatable) {

                await member.timeout(
                    timeoutDuration,
                    `Guardian Anti-Raid: used blocked word "${blockedWord}"`
                );

                console.log(
                    `[WORD FILTER] ⏱️ Timed out ${message.author.tag} for 24 hours.`
                );

            } else {

                console.log(
                    `[WORD FILTER] ❌ Cannot timeout ${message.author.tag}. Check bot role position and permissions.`
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
            // ADMIN CHECK
            // ====================================

            const isAdministrator =
                interaction.memberPermissions?.has(
                    "Administrator"
                );

            // ====================================
            // AUTHORIZED USER CHECK
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

                    await interaction.reply({
                        content:
                            "❌ Only server administrators can authorize users.",
                        ephemeral: true
                    });

                    return;
                }

                const user =
                    interaction.options.getUser(
                        "user"
                    );

                authorizeUser(
                    interaction.guild.id,
                    user.id
                );

                await interaction.reply({
                    content:
                        `✅ ${user} is now authorized to use Guardian.`,
                    ephemeral: true
                });

                console.log(
                    `[AUTH] ${user.tag} authorized by ${interaction.user.tag}`
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

                    await interaction.reply({
                        content:
                            "❌ Only server administrators can remove authorized users.",
                        ephemeral: true
                    });

                    return;
                }

                const user =
                    interaction.options.getUser(
                        "user"
                    );

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

                    await interaction.reply({
                        content:
                            "❌ Only server administrators can view the authorized-user list.",
                        ephemeral: true
                    });

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

                await interaction.reply({
                    content:
                        "❌ You are not authorized to use Guardian Anti-Raid.",
                    ephemeral: true
                });

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

                const word =
                    interaction.options
                        .getString("word")
                        .trim()
                        .toLowerCase();

                if (!word) {

                    await interaction.reply({
                        content:
                            "❌ You must provide a word.",
                        ephemeral: true
                    });

                    return;
                }

                addBlockedWord(
                    interaction.guild.id,
                    word
                );

                await interaction.reply({
                    content:
                        `✅ **${word}** has been added to the blocked-word list.\n\nUsers who say this word will have their message deleted and will be timed out for 24 hours.`,
                    ephemeral: true
                });

                console.log(
                    `[WORD FILTER] Added blocked word "${word}" in ${interaction.guild.name}`
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

                const word =
                    interaction.options
                        .getString("word")
                        .trim()
                        .toLowerCase();

                const removed =
                    removeBlockedWord(
                        interaction.guild.id,
                        word
                    );

                await interaction.reply({
                    content:
                        removed
                            ? `✅ **${word}** has been removed.`
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

                const words =
                    getBlockedWords(
                        interaction.guild.id
                    );

                if (words.length === 0) {

                    await interaction.reply({
                        content:
                            "📋 No blocked words are configured.",
                        ephemeral: true
                    });

                    return;
                }

                await interaction.reply({
                    content:
                        `🚨 **Blocked Words**\n\n${
                            words
                                .map(
                                    word =>
                                        `• ${word}`
                                )
                                .join("\n")
                        }`,
                    ephemeral: true
                });

                return;
            }

        } catch (error) {

            console.error(
                "❌ Command error:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({
                    content:
                        "❌ Something went wrong.",
                    ephemeral: true
                });

            } else {

                await interaction.reply({
                    content:
                        "❌ Something went wrong.",
                    ephemeral: true
                });
            }
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
