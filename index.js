const {
    recordJoin,
    isSuspiciousAccount,
    isWhitelisted,
    kickMember,
    lockdown,
    unlock,
    isLockedDown,
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers

} = require("./antiRaid");

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
    isLockedDown
} = require("./antiRaid");

const config = require("./config");

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

// ========================================
// EXPRESS / RENDER
// ========================================

const app = express();

const PORT =
    process.env.PORT || 10000;

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
            `Web server running on port ${PORT}`
        );

    }
);

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMembers

    ]

});

// ========================================
// BOT READY
// ========================================

client.once(
    "ready",
    () => {

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
            // CHECK ACCOUNT AGE
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
                        `[PROTECTION] Kicked ${member.user.tag} because their account is less than 24 hours old.`
                    );
                }

                // Do not process this member further.
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
                    `[RAID] RAID DETECTED in ${member.guild.name}`
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
            // ADMINISTRATOR CHECK
            // ====================================

            if (
                !interaction.memberPermissions ||
                !interaction.memberPermissions.has(
                    "Administrator"
                )
            ) {

                await interaction.reply({

                    content:
                        "❌ You need Administrator permission to use this command.",

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
            "Discord client error:",
            error
        );

    }
);

client.on(
    "warn",
    warning => {

        console.warn(
            "Discord warning:",
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

// ========================================
// AUTHORIZATION CHECK
// ========================================

const isAdministrator =
    interaction.memberPermissions?.has(
        "Administrator"
    );

const isAuthorized =
    isAuthorizedUser(
        interaction.guild.id,
        interaction.user.id
    );

// Server administrators always have access.
// Otherwise the user must be authorized.

if (!isAdministrator && !isAuthorized) {

    await interaction.reply({
        content:
            "❌ You are not authorized to use Guardian Anti-Raid.",
        ephemeral: true
    });

    return;
}
