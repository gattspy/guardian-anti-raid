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
    findBlockedWord,

    setAutoChannelMessage,
    removeAutoChannelMessage,
    getAutoChannelMessages,
    getAutoChannelMessage

} = require("./antiRaid");

const config =
    require("./config");

// ========================================
// ENVIRONMENT
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
// EXPRESS
// ========================================

const app =
    express();

const PORT =
    process.env.PORT || 10000;

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
// WEB SERVER
// ========================================

app.get(
    "/",
    (req, res) => {

        res.status(200).send(
            "🛡️ Guardian Anti-Raid is online."
        );
    }
);

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
// SAFE INTERACTION ACKNOWLEDGEMENT
// ========================================

async function acknowledgeInteraction(
    interaction
) {

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

        if (
            error.code === 10062 ||
            error.code === 40060
        ) {
            console.warn(
                `⚠️ Interaction acknowledgement failed: ${error.code}`
            );

            return false;
        }

        console.error(
            "❌ Interaction acknowledgement error:",
            error
        );

        return false;
    }
}

// ========================================
// SAFE RESPONSE
// ========================================

async function safeReply(
    interaction,
    content
) {

    try {

        if (
            !interaction ||
            !interaction.isRepliable()
        ) {
            return false;
        }

        if (interaction.deferred) {

            await interaction.editReply({
                content
            });

            return true;
        }

        if (interaction.replied) {

            await interaction.followUp({
                content,
                ephemeral: true
            });

            return true;
        }

        await interaction.reply({
            content,
            ephemeral: true
        });

        return true;

    } catch (error) {

        if (
            error.code === 10062 ||
            error.code === 40060 ||
            error.code === 10015
        ) {

            console.warn(
                `⚠️ Interaction response unavailable: ${error.code}`
            );

            return false;
        }

        console.error(
            "❌ Interaction response error:",
            error
        );

        return false;
    }
}

// ========================================
// ADMIN CHECK
// ========================================

function isAdministrator(
    interaction
) {

    return (
        interaction.memberPermissions?.has(
            "Administrator"
        ) === true
    );
}

// ========================================
// READY
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
            databaseReady
                ? "🗄️ PostgreSQL: READY"
                : "❌ PostgreSQL: NOT READY"
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

                await kickMember(
                    member,
                    "Guardian Anti-Raid: account is less than 24 hours old."
                );

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
                    }).catch(
                        error =>
                            console.error(
                                "❌ Could not send raid log:",
                                error.message
                            )
                    );
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

                await message.delete()
                    .catch(
                        error =>
                            console.error(
                                "❌ Could not delete blocked message:",
                                error.message
                            )
                    );
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
                return;
            }

            await member.timeout(
                timeoutDuration,
                `Guardian Anti-Raid: blocked word "${blockedWord}"`
            ).catch(
                error =>
                    console.error(
                        "❌ Could not timeout member:",
                        error.message
                    )
            );

        } catch (error) {

            console.error(
                "❌ Blocked-word filter error:",
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

        // ====================================
        // ACKNOWLEDGE IMMEDIATELY
        // ====================================

        const acknowledged =
            await acknowledgeInteraction(
                interaction
            );

        if (!acknowledged) {
            return;
        }

        try {

            // ====================================
            // SERVER ONLY
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
                isAdministrator(
                    interaction
                );

            const command =
                interaction.commandName;

            // ====================================
            // ADMIN AUTHORIZATION COMMANDS
            // ====================================

            if (
                command ===
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

            // ====================================
            // UNAUTHORIZE USER
            // ====================================

            if (
                command ===
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

                const result =
                    await unauthorizeUser(
                        guildId,
                        user.id
                    );

                await safeReply(
                    interaction,
                    result
                        ? `🚫 ${user} is now unauthorized.`
                        : `⚠️ ${user} was already unauthorized.`
                );

                return;
            }

            // ====================================
            // AUTHORIZE ROLE
            // ====================================

            if (
                command ===
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
                    interaction.options.getRole(
                        "role"
                    );

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

            // ====================================
            // UNAUTHORIZE ROLE
            // ====================================

            if (
                command ===
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
                    interaction.options.getRole(
                        "role"
                    );

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
                        ? `🚫 ${role} is now unauthorized.`
                        : `⚠️ ${role} was already unauthorized.`
                );

                return;
            }

            // ====================================
            // AUTHORIZED LIST
            // ====================================

            if (
                command ===
                "authorized-list"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only administrators can view authorization lists."
                    );

                    return;
                }

                const users =
                    await getAuthorizedUsers(
                        guildId
                    );

                const roles =
                    await getAuthorizedRoles(
                        guildId
                    );

                const output =
                    [
                        "🛡️ **AUTHORIZED GUARDIAN ACCESS**",
                        "",
                        "**Users:**",
                        users.length
                            ? users.map(
                                id =>
                                    `• <@${id}>`
                            ).join("\n")
                            : "• None",
                        "",
                        "**Roles:**",
                        roles.length
                            ? roles.map(
                                id =>
                                    `• <@&${id}>`
                            ).join("\n")
                            : "• None"
                    ].join("\n");

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // UNAUTHORIZED LIST
            // ====================================

            if (
                command ===
                "unauthorized-list"
            ) {

                if (!admin) {

                    await safeReply(
                        interaction,
                        "❌ Only administrators can view authorization lists."
                    );

                    return;
                }

                const users =
                    await getUnauthorizedUsers(
                        guildId
                    );

                const roles =
                    await getUnauthorizedRoles(
                        guildId
                    );

                const output =
                    [
                        "🚫 **UNAUTHORIZED GUARDIAN ACCESS**",
                        "",
                        "**Users:**",
                        users.length
                            ? users.map(
                                id =>
                                    `• <@${id}>`
                            ).join("\n")
                            : "• None",
                        "",
                        "**Roles:**",
                        roles.length
                            ? roles.map(
                                id =>
                                    `• <@&${id}>`
                            ).join("\n")
                            : "• None"
                    ].join("\n");

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // GUARDIAN ACCESS CHECK
            // ====================================
            //
            // Admins may manage Guardian.
            //
            // Everybody else MUST be explicitly
            // authorized by user or role.
            // ====================================

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
            // AUTO MESSAGE SET
            // ====================================

            if (
                command ===
                "auto-message-set"
            ) {

                const channelName =
                    interaction.options
                        .getString(
                            "channel"
                        )
                        ?.trim();

                const message =
                    interaction.options
                        .getString(
                            "message"
                        )
                        ?.trim();

                if (
                    !channelName ||
                    !message
                ) {

                    await safeReply(
                        interaction,
                        "❌ You must provide both a channel name and message."
                    );

                    return;
                }

                if (
                    message.length >
                    2000
                ) {

                    await safeReply(
                        interaction,
                        "❌ Discord messages cannot exceed 2000 characters."
                    );

                    return;
                }

                const result =
                    await setAutoChannelMessage(
                        guildId,
                        channelName,
                        message
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ Auto-message configured for **#${channelName.toLowerCase()}**.\n\nWhenever a channel with that name is created, Guardian will automatically send:\n\n${message}`
                        : "❌ Could not save the auto-message."
                );

                return;
            }

            // ====================================
            // AUTO MESSAGE REMOVE
            // ====================================

            if (
                command ===
                "auto-message-remove"
            ) {

                const channelName =
                    interaction.options
                        .getString(
                            "channel"
                        )
                        ?.trim();

                if (!channelName) {

                    await safeReply(
                        interaction,
                        "❌ Please provide a channel name."
                    );

                    return;
                }

                const result =
                    await removeAutoChannelMessage(
                        guildId,
                        channelName
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ Auto-message removed from **#${channelName.toLowerCase()}**.`
                        : `⚠️ No auto-message was configured for **#${channelName.toLowerCase()}**.`
                );

                return;
            }

            // ====================================
            // AUTO MESSAGE LIST
            // ====================================

            if (
                command ===
                "auto-message-list"
            ) {

                const entries =
                    await getAutoChannelMessages(
                        guildId
                    );

                if (!entries.length) {

                    await safeReply(
                        interaction,
                        "📋 No automatic channel messages are configured."
                    );

                    return;
                }

                const output =
                    entries.map(
                        entry =>
                            `• **#${entry.channel_name}** → ${entry.message}`
                    ).join("\n");

                await safeReply(
                    interaction,
                    `📋 **AUTO CHANNEL MESSAGES**\n\n${output}`
                );

                return;
            }

            // ====================================
            // LOCKDOWN
            // ====================================

            if (
                command ===
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
            // UNLOCK
            // ====================================

            if (
                command ===
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
            // RAID STATUS
            // ====================================

            if (
                command ===
                "raidstatus"
            ) {

                const locked =
                    isLockedDown(
                        guildId
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
            // WORD COMMANDS
            // ====================================

            if (
                command === "word-add" ||
                command === "word-remove" ||
                command === "word-list"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready."
                    );

                    return;
                }
            }

            // ====================================
            // WORD ADD
            // ====================================

            if (
                command ===
                "word-add"
            ) {

                const word =
                    interaction.options
                        .getString(
                            "word"
                        )
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await safeReply(
                        interaction,
                        "❌ Please provide a word."
                    );

                    return;
                }

                const result =
                    await addBlockedWord(
                        guildId,
                        word
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ **${word}** was added to the blocked-word list.`
                        : `⚠️ **${word}** is already blocked.`
                );

                return;
            }

            // ====================================
            // WORD REMOVE
            // ====================================

            if (
                command ===
                "word-remove"
            ) {

                const word =
                    interaction.options
                        .getString(
                            "word"
                        )
                        ?.trim()
                        .toLowerCase();

                if (!word) {

                    await safeReply(
                        interaction,
                        "❌ Please provide a word."
                    );

                    return;
                }

                const result =
                    await removeBlockedWord(
                        guildId,
                        word
                    );

                await safeReply(
                    interaction,
                    result
                        ? `✅ **${word}** was removed.`
                        : `⚠️ **${word}** was not found.`
                );

                return;
            }

            // ====================================
            // WORD LIST
            // ====================================

            if (
                command ===
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

                await safeReply(
                    interaction,
                    `🚫 **BLOCKED WORDS**\n\n${words.map(
                        word =>
                            `• ${word}`
                    ).join("\n")}`
                );

                return;
            }

            // ====================================
            // UNKNOWN
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
// CHANNEL CREATED
// ========================================
//
// Looks up the CHANNEL NAME.
// This is important because the channel ID
// does not exist until Discord creates the channel.
// ========================================

client.on(
    "channelCreate",
    async channel => {

        try {

            if (!channel.guild) {
                return;
            }

            if (!databaseReady) {
                return;
            }

            if (
                !channel.isTextBased() ||
                typeof channel.send !== "function"
            ) {
                return;
            }

            const guildId =
                channel.guild.id;

            const channelName =
                channel.name
                    .toLowerCase();

            const autoMessage =
                await getAutoChannelMessage(
                    guildId,
                    channelName
                );

            if (!autoMessage) {
                return;
            }

            const me =
                channel.guild.members.me;

            if (!me) {
                return;
            }

            const permissions =
                channel.permissionsFor(me);

            if (
                !permissions ||
                !permissions.has(
                    "SendMessages"
                )
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
            "✅ Authorization system ready."
        );

        console.log(
            "✅ Role authorization system ready."
        );

        console.log(
            "✅ Blocked-word system ready."
        );

        console.log(
            "✅ Auto-channel-message system ready."
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
