require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ChannelType,
    Partials
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
    getAuthorizedUsers,
    getUnauthorizedUsers,

    authorizeRole,
    unauthorizeRole,
    getAuthorizedRoles,
    getUnauthorizedRoles,

    canUseGuardian,

    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,

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
// DISCORD CLIENT
// ========================================

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],

    partials: [
        Partials.Channel,
        Partials.Message
    ]

});

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

        if (
            error.code === 10062 ||
            error.code === 40060
        ) {

            console.warn(
                `⚠️ Interaction expired or was already acknowledged (${error.code}).`
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

        console.log(
            databaseReady
                ? "🗄️ PostgreSQL: READY"
                : "❌ PostgreSQL: NOT READY"
        );

        console.log(
            "🔐 Guardian access control: ENABLED"
        );

        console.log(
            "🚫 Whole-word blocked-word filter: ENABLED"
        );

        console.log(
            "✏️ Edited-message filter: ENABLED"
        );

        console.log(
            "🔤 Unicode font normalization: ENABLED"
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

            // ====================================
            // KICK ACCOUNTS UNDER 24 HOURS
            // ====================================

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
            // JOIN RATE
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
// BLOCKED WORD NORMALIZATION
// ========================================

function normalizeForWordFilter(
    text
) {

    return String(text || "")

        // Convert many decorative Unicode fonts
        // and full-width characters to normal text.
        .normalize("NFKC")

        // Remove combining marks after normalization.
        .normalize("NFD")
        .replace(
            /\p{M}/gu,
            ""
        )
        .normalize("NFC")

        // Remove zero-width/invisible characters.
        .replace(
            /[\u200B-\u200D\u2060\uFEFF]/g,
            ""
        )

        .toLowerCase();
}

// ========================================
// ESCAPE REGEX
// ========================================

function escapeRegExp(
    text
) {

    return String(text).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ========================================
// FIND STANDALONE BLOCKED WORD
// ========================================

async function findStandaloneBlockedWord(
    guildId,
    content
) {

    if (
        !guildId ||
        !content ||
        !databaseReady
    ) {
        return null;
    }

    const words =
        await getBlockedWords(
            guildId
        );

    const normalizedContent =
        normalizeForWordFilter(
            content
        );

    for (
        const storedWord of words
    ) {

        const cleanWord =
            normalizeForWordFilter(
                storedWord
            ).trim();

        if (!cleanWord) {
            continue;
        }

        const escapedWord =
            escapeRegExp(
                cleanWord
            );

        /*
         * ONLY standalone matching.
         *
         * If "ass" is blocked:
         *
         * ass             BLOCK
         * ASS             BLOCK
         * "an ass!"       BLOCK
         * 𝐚𝐬𝐬             BLOCK
         * 𝕒𝕤𝕤             BLOCK
         * ａｓｓ            BLOCK
         *
         * class           ALLOW
         * grass           ALLOW
         * glasses         ALLOW
         * assassin        ALLOW
         */

        const regex =
            new RegExp(
                `(?<![\\p{L}\\p{N}_])${escapedWord}(?![\\p{L}\\p{N}_])`,
                "iu"
            );

        if (
            regex.test(
                normalizedContent
            )
        ) {

            return storedWord;
        }
    }

    return null;
}

// ========================================
// BLOCKED WORD MODERATION
// ========================================

async function checkBlockedWordMessage(
    message,
    source = "new message"
) {

    try {

        // ====================================
        // BASIC CHECKS
        // ====================================

        if (
            !message ||
            !message.author
        ) {
            return;
        }

        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            return;
        }

        if (!databaseReady) {
            return;
        }

        if (!message.content) {
            return;
        }

        // ====================================
        // FIND STANDALONE BLOCKED WORD
        // ====================================

        const blockedWord =
            await findStandaloneBlockedWord(
                message.guild.id,
                message.content
            );

        if (!blockedWord) {
            return;
        }

        console.log(
            `[WORD FILTER] ${message.author.tag} used standalone blocked word "${blockedWord}" (${source})`
        );

        // ====================================
        // DELETE MESSAGE
        // ====================================

        try {

            if (message.deletable) {

                await message.delete();

                console.log(
                    `[WORD FILTER] 🗑️ Deleted ${source} from ${message.author.tag}`
                );

            } else {

                console.warn(
                    `[WORD FILTER] Cannot delete ${source} from ${message.author.tag}`
                );
            }

        } catch (error) {

            console.error(
                "❌ Could not delete blocked-word message:",
                error.message
            );
        }

        // ====================================
        // GET MEMBER
        // ====================================

        let member =
            message.member;

        if (!member) {

            try {

                member =
                    await message.guild.members.fetch(
                        message.author.id
                    );

            } catch (error) {

                console.error(
                    "❌ Could not fetch member:",
                    error.message
                );

                return;
            }
        }

        // ====================================
        // TIMEOUT LENGTH
        // ====================================

        const timeoutDuration =
            config.wordTimeoutDuration ||
            24 * 60 * 60 * 1000;

        // ====================================
        // MODERATION PERMISSION CHECK
        // ====================================

        if (!member.moderatable) {

            console.warn(
                `[WORD FILTER] Cannot timeout ${message.author.tag}.`
            );

            console.warn(
                "[WORD FILTER] Guardian needs Moderate Members and its role must be above the user's highest role."
            );

            return;
        }

        // ====================================
        // TIMEOUT
        // ====================================

        try {

            await member.timeout(
                timeoutDuration,
                `Guardian Anti-Raid: used standalone blocked word "${blockedWord}" (${source})`
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
            "❌ Blocked-word moderation error:",
            error
        );

    }
}

// ========================================
// NEW MESSAGES
// ========================================

client.on(
    "messageCreate",
    async message => {

        await checkBlockedWordMessage(
            message,
            "new message"
        );

    }
);

// ========================================
// EDITED MESSAGES
// ========================================

client.on(
    "messageUpdate",
    async (
        oldMessage,
        newMessage
    ) => {

        try {

            // ====================================
            // FETCH PARTIAL NEW MESSAGE
            // ====================================

            if (newMessage.partial) {

                try {

                    newMessage =
                        await newMessage.fetch();

                } catch (error) {

                    console.error(
                        "❌ Could not fetch edited message:",
                        error.message
                    );

                    return;
                }
            }

            // ====================================
            // IGNORE BOT EDITS
            // ====================================

            if (
                !newMessage.author ||
                newMessage.author.bot
            ) {
                return;
            }

            // ====================================
            // IGNORE DMS
            // ====================================

            if (!newMessage.guild) {
                return;
            }

            // ====================================
            // IGNORE IF CONTENT DID NOT CHANGE
            // ====================================

            if (
                oldMessage?.content ===
                newMessage.content
            ) {
                return;
            }

            console.log(
                `[WORD FILTER] Checking edited message from ${newMessage.author.tag}`
            );

            await checkBlockedWordMessage(
                newMessage,
                "edited message"
            );

        } catch (error) {

            console.error(
                "❌ Edited-message filter error:",
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

            const admin =
                isAdministrator(
                    interaction
                );

            const command =
                interaction.commandName;

            // ====================================
            // DATABASE CHECK
            // ====================================

            if (!databaseReady) {

                await safeReply(
                    interaction,
                    "❌ PostgreSQL is not ready."
                );

                return;
            }

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

            if (
                command ===
                "authorize"
            ) {

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

            if (
                command ===
                "unauthorize"
            ) {

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
                        ? `✅ **Automatic message configured.**\n\n📁 Category: **${category.name}**\n💬 ${message}`
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
// AUTOMATIC CATEGORY MESSAGE
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
            // GET CATEGORY
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

                return;
            }

            // ====================================
            // GET CONFIGURED MESSAGE
            // ====================================

            const autoMessage =
                await getAutoCategoryMessage(
                    channel.guild.id,
                    categoryId
                );

            if (!autoMessage) {
                return;
            }

            // ====================================
            // PERMISSION CHECK
            // ====================================

            const me =
                channel.guild.members.me;

            if (!me) {
                return;
            }

            const permissions =
                channel.permissionsFor(
                    me
                );

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
            // SEND AUTO MESSAGE
            // ====================================

            await channel.send({
                content:
                    autoMessage
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
