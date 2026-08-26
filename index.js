require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ChannelType
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
    findBlockedWord,

    setAutoCategoryMessage,
    removeAutoCategoryMessage,
    getAutoCategoryMessage,
    getAutoCategoryMessages

} = require("./antiRaid");

const config = require("./config");

// ========================================
// ENVIRONMENT CHECK
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN is missing from .env"
    );

    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error(
        "❌ CLIENT_ID is missing from .env"
    );

    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error(
        "❌ DATABASE_URL is missing from .env"
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

const app = express();

const PORT =
    process.env.PORT || 10000;

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

        bot:
            client.isReady()
                ? "online"
                : "starting",

        database:
            databaseReady
                ? "online"
                : "offline"

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
            !interaction ||
            !interaction.isRepliable()
        ) {
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
                `⚠️ Discord interaction unavailable (${error.code}).`
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

async function deferInteraction(
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

        if (error.code === 10062) {

            console.warn(
                "⚠️ Interaction expired before it could be acknowledged."
            );

            return false;
        }

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

        console.log(
            databaseReady
                ? "🗄️ PostgreSQL: READY"
                : "❌ PostgreSQL: NOT READY"
        );

        console.log(
            "🔐 Guardian access control: ENABLED"
        );

        console.log(
            "📨 Automatic category messages: ENABLED"
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
                    `[WORD FILTER] ⏱️ Timed out ${message.author.tag}`
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

        const deferred =
            await deferInteraction(
                interaction
            );

        if (!deferred) {
            return;
        }

        try {

            if (!interaction.guild) {

                await safeReply(
                    interaction,
                    "❌ Guardian commands can only be used inside a server."
                );

                return;
            }

            const guildId =
                interaction.guild.id;

            const admin =
                isAdministrator(
                    interaction
                );

            const command =
                interaction.commandName;

            // ====================================
            // ADMIN-ONLY MANAGEMENT COMMANDS
            // ====================================

            const adminOnlyCommands = [

                "authorize",
                "unauthorize",
                "authorize-role",
                "unauthorize-role",
                "authorized-list",
                "unauthorized-list"

            ];

            if (
                adminOnlyCommands.includes(
                    command
                ) &&
                !admin
            ) {

                await safeReply(
                    interaction,
                    "❌ **Administrator Only**\nOnly server administrators can use this command."
                );

                return;
            }

            // ====================================
            // /AUTHORIZE
            // ====================================

            if (command === "authorize") {

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
            // /UNAUTHORIZE
            // ====================================

            if (command === "unauthorize") {

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
            // /AUTHORIZE-ROLE
            // ====================================

            if (
                command ===
                "authorize-role"
            ) {

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
            // /UNAUTHORIZE-ROLE
            // ====================================

            if (
                command ===
                "unauthorize-role"
            ) {

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
            // /AUTHORIZED-LIST
            // ====================================

            if (
                command ===
                "authorized-list"
            ) {

                const users =
                    await getAuthorizedUsers(
                        guildId
                    );

                const roles =
                    await getAuthorizedRoles(
                        guildId
                    );

                let output =
                    "🛡️ **AUTHORIZED GUARDIAN ACCESS**\n\n";

                output +=
                    "**Users:**\n";

                output += users.length
                    ? users
                        .map(
                            id =>
                                `• <@${id}>`
                        )
                        .join("\n")
                    : "• None";

                output +=
                    "\n\n**Roles:**\n";

                output += roles.length
                    ? roles
                        .map(
                            id =>
                                `• <@&${id}>`
                        )
                        .join("\n")
                    : "• None";

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // /UNAUTHORIZED-LIST
            // ====================================

            if (
                command ===
                "unauthorized-list"
            ) {

                const users =
                    await getUnauthorizedUsers(
                        guildId
                    );

                const roles =
                    await getUnauthorizedRoles(
                        guildId
                    );

                let output =
                    "🚫 **UNAUTHORIZED GUARDIAN ACCESS**\n\n";

                output +=
                    "**Users:**\n";

                output += users.length
                    ? users
                        .map(
                            id =>
                                `• <@${id}>`
                        )
                        .join("\n")
                    : "• None";

                output +=
                    "\n\n**Roles:**\n";

                output += roles.length
                    ? roles
                        .map(
                            id =>
                                `• <@&${id}>`
                        )
                        .join("\n")
                    : "• None";

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // ACCESS CONTROL
            // ====================================

            if (!admin) {

                const allowed =
                    await canUseGuardian(
                        interaction.member
                    );

                if (!allowed) {

                    await safeReply(
                        interaction,
                        "❌ **Access Denied**\n\nYou are not authorized to use Guardian Anti-Raid."
                    );

                    return;
                }

            }

            // ====================================
            // /AUTOMESSAGE-SET
            // ====================================

            if (
                command ===
                "automessage-set"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready."
                    );

                    return;
                }

                const category =
                    interaction.options.getChannel(
                        "category"
                    );

                const message =
                    interaction.options.getString(
                        "message"
                    )?.trim();

                if (
                    !category ||
                    category.type !==
                        ChannelType.GuildCategory
                ) {

                    await safeReply(
                        interaction,
                        "❌ Please select a valid Discord category."
                    );

                    return;
                }

                if (!message) {

                    await safeReply(
                        interaction,
                        "❌ Please provide a message."
                    );

                    return;
                }

                if (
                    message.length >
                    2000
                ) {

                    await safeReply(
                        interaction,
                        "❌ Automatic messages cannot be longer than 2000 characters."
                    );

                    return;
                }

                const result =
                    await setAutoCategoryMessage(
                        guildId,
                        category.id,
                        message
                    );

                await safeReply(
                    interaction,

                    result
                        ? `✅ **Automatic message configured.**\n\n📁 Category: **${category.name}**\n💬 Message: ${message}\n\nGuardian will send this whenever a new text channel is created inside this category.`
                        : "❌ Could not save the automatic category message."
                );

                return;
            }

            // ====================================
            // /AUTOMESSAGE-REMOVE
            // ====================================

            if (
                command ===
                "automessage-remove"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready."
                    );

                    return;
                }

                const category =
                    interaction.options.getChannel(
                        "category"
                    );

                if (
                    !category ||
                    category.type !==
                        ChannelType.GuildCategory
                ) {

                    await safeReply(
                        interaction,
                        "❌ Please select a valid Discord category."
                    );

                    return;
                }

                const removed =
                    await removeAutoCategoryMessage(
                        guildId,
                        category.id
                    );

                await safeReply(
                    interaction,

                    removed
                        ? `✅ Automatic message removed from **${category.name}**.`
                        : `⚠️ No automatic message was configured for **${category.name}**.`
                );

                return;
            }

            // ====================================
            // /AUTOMESSAGE-LIST
            // ====================================

            if (
                command ===
                "automessage-list"
            ) {

                if (!databaseReady) {

                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready."
                    );

                    return;
                }

                const configs =
                    await getAutoCategoryMessages(
                        guildId
                    );

                if (
                    !configs ||
                    configs.length === 0
                ) {

                    await safeReply(
                        interaction,
                        "📋 No automatic category messages are configured."
                    );

                    return;
                }

                let output =
                    "📨 **AUTOMATIC CATEGORY MESSAGES**\n\n";

                for (
                    const item of configs
                ) {

                    const category =
                        interaction.guild.channels.cache.get(
                            item.category_id
                        );

                    const categoryName =
                        category
                            ? category.name
                            : `Deleted category (${item.category_id})`;

                    output +=
                        `📁 **${categoryName}**\n`;

                    output +=
                        `💬 ${item.message}\n\n`;
                }

                if (
                    output.length >
                    1900
                ) {

                    output =
                        output.substring(
                            0,
                            1900
                        ) +
                        "\n\n...more configurations exist.";
                }

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // /LOCKDOWN
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
            // /UNLOCK
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
            // /RAIDSTATUS
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
            // WORD COMMAND DATABASE CHECK
            // ====================================

            const databaseCommands = [

                "word-add",
                "word-remove",
                "word-list"

            ];

            if (
                databaseCommands.includes(
                    command
                ) &&
                !databaseReady
            ) {

                await safeReply(
                    interaction,
                    "❌ PostgreSQL is not ready. Please try again."
                );

                return;
            }

            // ====================================
            // /WORD-ADD
            // ====================================

            if (
                command ===
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
                command ===
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
                command ===
                "word-list"
            ) {

                const words =
                    await getBlockedWords(
                        guildId
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
// AUTOMATIC MESSAGE WHEN CHANNEL CREATED
// INSIDE A CONFIGURED CATEGORY
// ========================================

client.on(
    "channelCreate",
    async channel => {

        try {

            if (!channel.guild) {
                return;
            }

            if (!databaseReady) {

                console.warn(
                    `[AUTO MESSAGE] Database not ready for #${channel.name}`
                );

                return;
            }

            // ====================================
            // ONLY MESSAGE-CAPABLE CHANNELS
            // ====================================

            if (
                !channel.isTextBased() ||
                typeof channel.send !==
                    "function"
            ) {
                return;
            }

            // ====================================
            // GET PARENT CATEGORY
            // ====================================

            const categoryId =
                channel.parentId;

            if (!categoryId) {

                console.log(
                    `[AUTO MESSAGE] #${channel.name} was created outside a category.`
                );

                return;
            }

            const category =
                channel.guild.channels.cache.get(
                    categoryId
                );

            if (
                !category ||
                category.type !==
                    ChannelType.GuildCategory
            ) {

                console.warn(
                    `[AUTO MESSAGE] Parent category could not be found for #${channel.name}`
                );

                return;
            }

            // ====================================
            // GET CONFIGURED CATEGORY MESSAGE
            // ====================================

            const autoMessage =
                await getAutoCategoryMessage(
                    channel.guild.id,
                    categoryId
                );

            if (!autoMessage) {

                console.log(
                    `[AUTO MESSAGE] No message configured for category "${category.name}".`
                );

                return;
            }

            // ====================================
            // CHECK BOT MEMBER
            // ====================================

            const me =
                channel.guild.members.me;

            if (!me) {

                console.warn(
                    `[AUTO MESSAGE] Guardian member not found in ${channel.guild.name}`
                );

                return;
            }

            // ====================================
            // CHECK PERMISSIONS
            // ====================================

            const permissions =
                channel.permissionsFor(me);

            if (
                !permissions ||
                !permissions.has(
                    "ViewChannel"
                ) ||
                !permissions.has(
                    "SendMessages"
                )
            ) {

                console.warn(
                    `[AUTO MESSAGE] Guardian cannot send messages in #${channel.name}`
                );

                return;
            }

            // ====================================
            // SEND MESSAGE
            // ====================================

            await channel.send({
                content: autoMessage
            });

            console.log(
                `[AUTO MESSAGE] ✅ Sent message in #${channel.name}`
            );

            console.log(
                `[AUTO MESSAGE] 📁 Category: ${category.name}`
            );

        } catch (error) {

            console.error(
                "❌ Auto category message error:",
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
            "✅ Blocked words database ready."
        );

        console.log(
            "✅ Authorized users database ready."
        );

        console.log(
            "✅ Authorized roles database ready."
        );

        console.log(
            "✅ Unauthorized users database ready."
        );

        console.log(
            "✅ Unauthorized roles database ready."
        );

        console.log(
            "✅ Auto-category message database ready."
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

        console.error(error);

        console.error(
            "================================"
        );

        process.exit(1);
    }
}

startBot();
