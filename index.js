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
    isUnauthorizedUser,
    getAuthorizedUsers,
    getUnauthorizedUsers,

    authorizeRole,
    unauthorizeRole,
    isAuthorizedRole,
    isUnauthorizedRole,
    getAuthorizedRoles,
    getUnauthorizedRoles,

    canUseGuardian,

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
// DATABASE STATE
// ========================================

let databaseReady = false;

// ========================================
// EXPRESS / RENDER
// ========================================

const app = express();
const PORT = process.env.PORT || 10000;

// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {
    res.status(200).send(
        "🛡️ Guardian Anti-Raid is online."
    );
});

// ========================================
// HEALTH
// ========================================

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        bot: client.isReady() ? "online" : "starting",
        database: databaseReady ? "online" : "offline"
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

// ========================================
// EXPRESS START
// ========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `🌐 Web server running on port ${PORT}`
    );
});

// ========================================
// SAFE INTERACTION RESPONSE
// ========================================

async function safeReply(interaction, content) {
    try {
        if (!interaction || !interaction.isRepliable()) {
            return;
        }

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

        if (
            error.code === 10062 ||
            error.code === 40060 ||
            error.code === 10015
        ) {
            console.warn(
                `⚠️ Discord interaction could not be responded to (${error.code}).`
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
// DEFER INTERACTION
// ========================================

async function deferInteraction(interaction) {
    try {

        if (
            !interaction ||
            !interaction.isRepliable()
        ) {
            return false;
        }

        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return true;
        }

        await interaction.deferReply({
            ephemeral: true
        });

        return true;

    } catch (error) {

        console.error(
            "❌ Could not defer interaction:",
            error
        );

        return false;
    }
}

// ========================================
// ADMIN CHECK
// ========================================

function isAdministrator(interaction) {
    return (
        interaction.memberPermissions?.has(
            "Administrator"
        ) === true
    );
}

// ========================================
// BOT READY
// ========================================

client.once("ready", async () => {

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

    console.log(
        databaseReady
            ? "🗄️ PostgreSQL: READY"
            : "❌ PostgreSQL: NOT READY"
    );
});

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

            if (member.user.bot) {
                return;
            }

            if (isWhitelisted(member)) {
                return;
            }

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

            const recentJoins =
                recordJoin(
                    member.guild.id,
                    member.id
                );

            console.log(
                `[JOIN RATE] ${recentJoins} joins / ${config.raidTimeWindow} seconds`
            );

            if (
                recentJoins >=
                    config.raidJoinThreshold &&
                !isLockedDown(member.guild.id)
            ) {

                console.log(
                    `[RAID] 🚨 RAID DETECTED in ${member.guild.name}`
                );

                await lockdown(
                    member.guild,
                    `${recentJoins} members joined within ${config.raidTimeWindow} seconds`
                );

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
// BLOCKED WORD FILTER
// ========================================

client.on(
    "messageCreate",
    async message => {

        try {

            if (message.author.bot) {
                return;
            }

            if (!message.guild) {
                return;
            }

            if (!databaseReady) {
                return;
            }

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

            if (message.deletable) {

                try {

                    await message.delete();

                } catch (error) {

                    console.error(
                        "❌ Could not delete blocked-word message:",
                        error.message
                    );
                }
            }

            const member =
                message.member;

            if (!member) {
                return;
            }

            const timeoutDuration =
                config.wordTimeoutDuration ||
                24 * 60 * 60 * 1000;

            if (!member.moderatable) {

                console.warn(
                    `[WORD FILTER] Cannot timeout ${message.author.tag}`
                );

                return;
            }

            try {

                await member.timeout(
                    timeoutDuration,
                    `Guardian Anti-Raid: used blocked word "${blockedWord}"`
                );

                console.log(
                    `[WORD FILTER] Timed out ${message.author.tag}`
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

        if (!interaction.isChatInputCommand()) {
            return;
        }

        // ====================================
        // IMMEDIATELY ACKNOWLEDGE DISCORD
        // ====================================

        const deferred =
            await deferInteraction(interaction);

        if (!deferred) {
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

            const guildId =
                interaction.guild.id;

            const userId =
                interaction.user.id;

            const admin =
                isAdministrator(interaction);

            // ====================================
            // ADMIN MANAGEMENT COMMANDS
            // ====================================

            // /authorize

            if (
                interaction.commandName ===
                "authorize"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can authorize users."
                    );

                    return;
                }

                const user =
                    interaction.options.getUser("user");

                if (!user) {

                    await safeReply(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                const result =
                    await authorizeUser(
                        guildId,
                        user.id
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ ${user} is now authorized to use Guardian.`
                        : `⚠️ ${user} is already authorized.`
                );

                return;
            }

            // /unauthorize

            if (
                interaction.commandName ===
                "unauthorize"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can unauthorize users."
                    );

                    return;
                }

                const user =
                    interaction.options.getUser("user");

                if (!user) {

                    await safeReply(
                        interaction,
                        "❌ Please select a user."
                    );

                    return;
                }

                const result =
                    await unauthorizeUser(
                        guildId,
                        user.id
                    );

                await safeReply(
                    interaction,
                    result
                        ? `🚫 ${user} is now explicitly unauthorized.`
                        : `⚠️ ${user} was already unauthorized.`
                );

                return;
            }

            // /authorize-role

            if (
                interaction.commandName ===
                "authorize-role"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can authorize roles."
                    );

                    return;
                }

                const role =
                    interaction.options.getRole("role");

                if (!role) {

                    await safeReply(
                        interaction,
                        "❌ Please select a role."
                    );

                    return;
                }

                const result =
                    await authorizeRole(
                        guildId,
                        role.id
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ ${role} is now authorized to use Guardian.`
                        : `⚠️ ${role} is already authorized.`
                );

                return;
            }

            // /unauthorize-role

            if (
                interaction.commandName ===
                "unauthorize-role"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can unauthorize roles."
                    );

                    return;
                }

                const role =
                    interaction.options.getRole("role");

                if (!role) {

                    await safeReply(
                        interaction,
                        "❌ Please select a role."
                    );

                    return;
                }

                const result =
                    await unauthorizeRole(
                        guildId,
                        role.id
                    );

                await safeReply(
                    interaction,
                    result
                        ? `🚫 ${role} is now explicitly unauthorized.`
                        : `⚠️ ${role} was already unauthorized.`
                );

                return;
            }

            // /authorized-list

            if (
                interaction.commandName ===
                "authorized-list"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can view authorization lists."
                    );

                    return;
                }

                const users =
                    await getAuthorizedUsers(guildId);

                const roles =
                    await getAuthorizedRoles(guildId);

                let output =
                    "🛡️ **AUTHORIZED GUARDIAN ACCESS**\n\n";

                output += "**Users:**\n";

                output += users.length
                    ? users.map(
                        id => `• <@${id}>`
                    ).join("\n")
                    : "• None";

                output += "\n\n**Roles:**\n";

                output += roles.length
                    ? roles.map(
                        id => `• <@&${id}>`
                    ).join("\n")
                    : "• None";

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // /unauthorized-list

            if (
                interaction.commandName ===
                "unauthorized-list"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only server administrators can view authorization lists."
                    );

                    return;
                }

                const users =
                    await getUnauthorizedUsers(guildId);

                const roles =
                    await getUnauthorizedRoles(guildId);

                let output =
                    "🚫 **UNAUTHORIZED GUARDIAN ACCESS**\n\n";

                output += "**Users:**\n";

                output += users.length
                    ? users.map(
                        id => `• <@${id}>`
                    ).join("\n")
                    : "• None";

                output += "\n\n**Roles:**\n";

                output += roles.length
                    ? roles.map(
                        id => `• <@&${id}>`
                    ).join("\n")
                    : "• None";

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // GUARDIAN ACCESS CHECK
            // ====================================

            // Administrators bypass authorization.
            // Everyone else MUST be authorized.

            if (!admin) {

                const allowed =
                    await canUseGuardian(
                        interaction.member
                    );

                if (!allowed) {

                    await safeReply(
                        interaction,
                        "❌ **Access Denied**\nYou are not authorized to use Guardian Anti-Raid."
                    );

                    return;
                }
            }

            // ====================================
            // /LOCKDOWN
            // ====================================

            if (
                interaction.commandName ===
                "lockdown"
            ) {

                const activated =
                    await lockdown(
                        interaction.guild,
                        `Manual lockdown by ${interaction.user.tag}`
                    );

                await safeReply(
                    interaction,
                    activated
                        ? "🔒 **SERVER LOCKDOWN ACTIVATED**"
                        : "⚠️ Server lockdown is already active."
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

                const unlocked =
                    await unlock(
                        interaction.guild
                    );

                await safeReply(
                    interaction,
                    unlocked
                        ? "🔓 **SERVER LOCKDOWN REMOVED**"
                        : "🟢 Server was not locked down."
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
                    isLockedDown(guildId);

                await safeReply(
                    interaction,
                    locked
                        ? "🚨 **RAID LOCKDOWN ACTIVE**"
                        : "🟢 **NO RAID LOCKDOWN ACTIVE**"
                );

                return;
            }

            // ====================================
            // WORD COMMAND DATABASE CHECK
            // ====================================

            if (
                interaction.commandName ===
                    "word-add" ||
                interaction.commandName ===
                    "word-remove" ||
                interaction.commandName ===
                    "word-list"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready. Please try again."
                    );

                    return;
                }
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
                        guildId,
                        word
                    );

                await safeReply(
                    interaction,
                    added
                        ? `✅ **${word}** was added to the permanent blocked-word database.`
                        : `⚠️ **${word}** is already blocked.`
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
                        guildId,
                        word
                    );

                await safeReply(
                    interaction,
                    removed
                        ? `✅ **${word}** was removed from the blocked-word database.`
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

                const words =
                    await getBlockedWords(
                        guildId
                    );

                if (!words.length) {

                    await safeReply(
                        interaction,
                        "📋 No blocked words are configured."
                    );

                    return;
                }

                const list =
                    words
                        .map(
                            word => `• ${word}`
                        )
                        .join("\n");

                await safeReply(
                    interaction,
                    `🚫 **PERMANENT BLOCKED WORDS**\n\n${list}`
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

client.on("error", error => {
    console.error(
        "❌ Discord client error:",
        error
    );
});

client.on("warn", warning => {
    console.warn(
        "⚠️ Discord warning:",
        warning
    );
});

// ========================================
// AUTO MESSAGE WHEN CHANNEL IS CREATED
// ========================================

client.on(
    "channelCreate",
    async channel => {

        try {

            // Ignore DMs
            if (!channel.guild) {
                return;
            }

            // Database must be ready
            if (!databaseReady) {
                console.warn(
                    `[AUTO MESSAGE] Database not ready for #${channel.name}`
                );

                return;
            }

            const guildId =
                channel.guild.id;

            const channelId =
                channel.id;

            // Get configured auto message
            const autoMessage =
                await getAutoChannelMessage(
                    guildId,
                    channelId
                );

            // Nothing configured for this channel
            if (!autoMessage) {
                return;
            }

            // Only send where messages can actually be sent
            if (
                !channel.isTextBased() ||
                typeof channel.send !== "function"
            ) {
                return;
            }

            // Make sure Guardian can send messages
            const me =
                channel.guild.members.me;

            if (!me) {
                console.warn(
                    `[AUTO MESSAGE] Could not find Guardian member in ${channel.guild.name}`
                );

                return;
            }

            const permissions =
                channel.permissionsFor(me);

            if (
                !permissions ||
                !permissions.has("SendMessages")
            ) {
                console.warn(
                    `[AUTO MESSAGE] Guardian cannot send messages in #${channel.name}`
                );

                return;
            }

            await channel.send({
                content: autoMessage
            });

            console.log(
                `[AUTO MESSAGE] Sent automatic message in #${channel.name}`
            );

        } catch (error) {

            console.error(
                "❌ Auto channel message error:",
                error
            );
        }
    }
);

// ========================================
// START BOT
// ========================================

async function startBot() {

    try {

        console.log("================================");
        console.log("🗄️ CONNECTING TO POSTGRESQL");
        console.log("================================");

        await database.initDatabase();
        await database.testDatabase();

        databaseReady = true;

        console.log("✅ DATABASE READY");
        console.log("✅ Blocked words database ready.");
        console.log("✅ Authorized users database ready.");
        console.log("✅ Authorized roles database ready.");
        console.log("✅ Unauthorized users database ready.");
        console.log("✅ Unauthorized roles database ready.");

        console.log("================================");
        console.log("🤖 STARTING DISCORD BOT");
        console.log("================================");

        await client.login(
            process.env.DISCORD_TOKEN
        );

    } catch (error) {

        databaseReady = false;

        console.error("================================");
        console.error("❌ BOT STARTUP FAILED");
        console.error(error);
        console.error("================================");

        process.exit(1);
    }
}

startBot();
