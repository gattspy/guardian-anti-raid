require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ChannelType,
    Partials,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
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
    getAutoCategoryMessages,

    setBanTriggerChannel,
    removeBanTriggerChannel,
    getBanTriggerChannel

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
        ],

        partials: [
            Partials.Channel,
            Partials.Message
        ]

    });

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

            status:
                "online",

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
            "📨 Multi-line category auto-messages: ENABLED"
        );

        console.log(
            "🔨 Ban-trigger channel protection: ENABLED"
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

            // Ignore whitelisted members
            if (isWhitelisted(member)) {
                return;
            }

            const suspicious =
                isSuspiciousAccount(
                    member
                );

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
                // RAID LOG CHANNEL
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
                                    name:
                                        "Server",

                                    value:
                                        member.guild.name
                                },
                                {
                                    name:
                                        "Join Rate",

                                    value:
                                        `${recentJoins} joins / ${config.raidTimeWindow} seconds`
                                },
                                {
                                    name:
                                        "Action",

                                    value:
                                        "🔒 Server lockdown activated"
                                }
                            )

                            .setTimestamp();

                    try {

                        await logChannel.send({
                            embeds: [
                                embed
                            ]
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

    return String(
        text || ""
    )

        // Convert many stylized Unicode fonts
        // and full-width text into regular text.
        .normalize(
            "NFKC"
        )

        // Break accented letters into
        // letter + combining mark.
        .normalize(
            "NFD"
        )

        // Remove combining marks.
        .replace(
            /\p{M}/gu,
            ""
        )

        .normalize(
            "NFC"
        )

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

    return String(
        text
    ).replace(
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
         * Standalone word matching only.
         *
         * If "ass" is blocked:
         *
         * ass          -> BLOCK
         * ASS          -> BLOCK
         * an ass!      -> BLOCK
         * 𝐚𝐬𝐬          -> BLOCK
         * 𝕒𝕤𝕤          -> BLOCK
         * ａｓｓ         -> BLOCK
         *
         * class        -> ALLOW
         * grass        -> ALLOW
         * glasses      -> ALLOW
         * assassin     -> ALLOW
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

        // Ignore bots
        if (message.author.bot) {
            return;
        }

        // Ignore DMs
        if (!message.guild) {
            return;
        }

        // Database must be online
        if (!databaseReady) {
            return;
        }

        // Ignore messages with no text
        if (!message.content) {
            return;
        }

        // ====================================
        // CHECK CONTENT
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
// MODERATION CHECK
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
// TIMEOUT MEMBER
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
// BAN CHANNEL + BLOCKED WORD FILTER
// ========================================

client.on(
    "messageCreate",
    async message => {

        try {

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

            // ====================================
            // CHECK BAN-TRIGGER CHANNEL
            // ====================================

            const banChannelId =
                await getBanTriggerChannel(
                    message.guild.id
                );

            if (
                banChannelId &&
                message.channel.id ===
                    banChannelId
            ) {

                let member =
                    message.member;

                // ====================================
                // FETCH MEMBER IF NEEDED
                // ====================================

                if (!member) {

                    try {

                        member =
                            await message.guild.members.fetch(
                                message.author.id
                            );

                    } catch (error) {

                        console.error(
                            "❌ Could not fetch ban-trigger member:",
                            error.message
                        );

                        return;
                    }
                }

                // ====================================
                // PROTECT SERVER OWNER
                // ====================================

                if (
                    member.id ===
                    message.guild.ownerId
                ) {

                    console.warn(
                        `[BAN CHANNEL] Server owner ${message.author.tag} triggered the channel. Ignoring.`
                    );

                    return;
                }

                // ====================================
                // PROTECT ADMINISTRATORS
                // ====================================

                if (
                    member.permissions.has(
                        "Administrator"
                    )
                ) {

                    console.warn(
                        `[BAN CHANNEL] Administrator ${message.author.tag} triggered the channel. Ignoring.`
                    );

                    return;
                }

                // ====================================
                // CHECK IF MEMBER CAN BE BANNED
                // ====================================

                if (!member.bannable) {

                    console.warn(
                        `[BAN CHANNEL] Cannot ban ${message.author.tag}.`
                    );

                    console.warn(
                        "[BAN CHANNEL] Guardian needs Ban Members permission and its role must be above the member's highest role."
                    );

                    return;
                }

                // ====================================
                // BAN MEMBER
                // DELETE PREVIOUS 3 HOURS
                // ====================================

                try {

                    await member.ban({

                        deleteMessageSeconds:
                            3 * 60 * 60,

                        reason:
                            `Guardian Anti-Raid: sent a message in ban-trigger channel #${message.channel.name}`
                    });

                    console.log(
                        `[BAN CHANNEL] 🔨 Banned ${message.author.tag}`
                    );

                    console.log(
                        `[BAN CHANNEL] 🗑️ Requested deletion of up to the previous 3 hours of messages.`
                    );

                } catch (error) {

                    console.error(
                        `[BAN CHANNEL] ❌ Could not ban ${message.author.tag}:`,
                        error
                    );
                }

                return;
            }

            // ====================================
            // NORMAL BLOCKED-WORD FILTER
            // ====================================

            await checkBlockedWordMessage(
                message,
                "new message"
            );

        } catch (error) {

            console.error(
                "❌ MessageCreate handler error:",
                error
            );
        }
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
            // FETCH PARTIAL MESSAGE
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

            // Ignore bots
            if (
                !newMessage.author ||
                newMessage.author.bot
            ) {
                return;
            }

            // Ignore DMs
            if (!newMessage.guild) {
                return;
            }

            // Ignore edits where content did not change
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
// DISCORD INTERACTIONS
// ========================================

client.on(
    "interactionCreate",
    async interaction => {

        // ====================================
        // AUTO MESSAGE MODAL SUBMISSION
        // ====================================

        if (interaction.isModalSubmit()) {

            if (
                !interaction.customId.startsWith(
                    "automessage_modal:"
                )
            ) {
                return;
            }

            try {

                if (!interaction.guild) {

                    await interaction.reply({
                        content:
                            "❌ Guardian auto-messages can only be configured inside a server.",
                        ephemeral: true
                    });

                    return;
                }

                // ====================================
                // ACKNOWLEDGE MODAL
                // ====================================

                await interaction.deferReply({
                    ephemeral: true
                });

                if (!databaseReady) {

                    await interaction.editReply({
                        content:
                            "❌ PostgreSQL is not ready."
                    });

                    return;
                }

                const guildId =
                    interaction.guild.id;

                const admin =
                    interaction.memberPermissions?.has(
                        "Administrator"
                    ) === true;

                // ====================================
                // ACCESS CHECK
                // ====================================

                if (!admin) {

                    let member =
                        interaction.member;

                    if (!member) {

                        member =
                            await interaction.guild.members.fetch(
                                interaction.user.id
                            );
                    }

                    const allowed =
                        await canUseGuardian(
                            member
                        );

                    if (!allowed) {

                        await interaction.editReply({
                            content:
                                "❌ **Access Denied**\n\nYou are not authorized to use Guardian Anti-Raid."
                        });

                        return;
                    }
                }

                // ====================================
                // GET CATEGORY ID
                // ====================================

                const categoryId =
                    interaction.customId.substring(
                        "automessage_modal:".length
                    );

                if (!categoryId) {

                    await interaction.editReply({
                        content:
                            "❌ Category information was missing."
                    });

                    return;
                }

                // ====================================
                // GET MULTI-LINE MESSAGE
                // ====================================

                const autoMessage =
                    interaction.fields
                        .getTextInputValue(
                            "automessage_text"
                        )
                        .trim();

                if (!autoMessage) {

                    await interaction.editReply({
                        content:
                            "❌ The automatic message cannot be empty."
                    });

                    return;
                }

                if (
                    autoMessage.length >
                    2000
                ) {

                    await interaction.editReply({
                        content:
                            "❌ Automatic messages cannot be longer than 2000 characters."
                    });

                    return;
                }

                // ====================================
                // VERIFY CATEGORY
                // ====================================

                const category =
                    interaction.guild.channels.cache.get(
                        categoryId
                    );

                if (
                    !category ||
                    category.type !==
                        ChannelType.GuildCategory
                ) {

                    await interaction.editReply({
                        content:
                            "❌ That category could not be found."
                    });

                    return;
                }

                // ====================================
                // SAVE TO DATABASE
                // ====================================

                const saved =
                    await setAutoCategoryMessage(
                        guildId,
                        categoryId,
                        autoMessage
                    );

                if (!saved) {

                    await interaction.editReply({
                        content:
                            "❌ Could not save the automatic message."
                    });

                    return;
                }

                await interaction.editReply({
                    content:
                        `✅ **Automatic message saved.**

📁 Category: **${category.name}**

Your line breaks and formatting were saved. Guardian will send this message whenever a new channel is created inside this category.`
                });

                console.log(
                    `[AUTO MESSAGE] ✅ Saved multi-line message for "${category.name}"`
                );

            } catch (error) {

                console.error(
                    "❌ Auto-message modal error:",
                    error
                );

                try {

                    if (interaction.deferred) {

                        await interaction.editReply({
                            content:
                                "❌ Something went wrong while saving the automatic message."
                        });

                    } else if (
                        !interaction.replied
                    ) {

                        await interaction.reply({
                            content:
                                "❌ Something went wrong while saving the automatic message.",
                            ephemeral: true
                        });
                    }

                } catch (replyError) {

                    console.error(
                        "❌ Could not respond to modal:",
                        replyError
                    );
                }
            }

            return;
        }

        // ====================================
        // ONLY SLASH COMMANDS
        // ====================================

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

                await interaction.reply({
                    content:
                        "❌ Guardian commands can only be used inside a server.",
                    ephemeral: true
                });

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

                await interaction.reply({
                    content:
                        "❌ PostgreSQL is not ready.",
                    ephemeral: true
                });

                return;
            }

            // ====================================
            // /AUTOMESSAGE-SET
            // MUST HAPPEN BEFORE deferReply()
            // ====================================

            if (
                command ===
                "automessage-set"
            ) {

                // ====================================
                // ACCESS CHECK
                // ====================================

                if (!admin) {

                    const allowed =
                        await canUseGuardian(
                            interaction.member
                        );

                    if (!allowed) {

                        await interaction.reply({
                            content:
                                "❌ **Access Denied**\n\nYou are not authorized to use Guardian Anti-Raid.",
                            ephemeral: true
                        });

                        return;
                    }
                }

                // ====================================
                // CATEGORY
                // ====================================

                const category =
                    interaction.options.getChannel(
                        "category"
                    );

                if (
                    !category ||
                    category.type !==
                        ChannelType.GuildCategory
                ) {

                    await interaction.reply({
                        content:
                            "❌ Please select a valid Discord category.",
                        ephemeral: true
                    });

                    return;
                }

                // ====================================
                // MULTI-LINE TEXT INPUT
                // ====================================

                const messageInput =
                    new TextInputBuilder()

                        .setCustomId(
                            "automessage_text"
                        )

                        .setLabel(
                            "Automatic message"
                        )

                        .setStyle(
                            TextInputStyle.Paragraph
                        )

                        .setPlaceholder(
                            "Type your message here. Press Enter to create new lines."
                        )

                        .setMinLength(1)

                        .setMaxLength(2000)

                        .setRequired(true);

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            messageInput
                        );

                // ====================================
                // MODAL
                // ====================================

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            `automessage_modal:${category.id}`
                        )

                        .setTitle(
                            "Automatic Channel Message"
                        )

                        .addComponents(
                            row
                        );

                await interaction.showModal(
                    modal
                );

                return;
            }

            // ====================================
            // DEFER ALL OTHER COMMANDS
            // ====================================

            const deferred =
                await deferInteraction(
                    interaction
                );

            if (!deferred) {
                return;
            }

            // ====================================
            // ADMIN-ONLY COMMANDS
            // ====================================

            const adminOnlyCommands = [
                "authorize",
                "unauthorize",
                "authorize-role",
                "unauthorize-role",
                "authorized-list",
                "unauthorized-list",
                "ban-channel-set",
                "ban-channel-remove",
                "ban-channel-status"
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

                if (!allowed) {

                    await safeReply(
                        interaction,
                        "❌ **Access Denied**\n\nYou are not authorized to use Guardian Anti-Raid."
                    );

                    return;
                }
            }

// ====================================
// /BAN-CHANNEL-SET
// ====================================

if (
    command ===
    "ban-channel-set"
) {

    const channel =
        interaction.options.getChannel(
            "channel"
        );

    if (
        !channel ||
        channel.type !==
            ChannelType.GuildText
    ) {

        await safeReply(
            interaction,
            "❌ Please select a normal text channel."
        );

        return;
    }

    const saved =
        await setBanTriggerChannel(
            guildId,
            channel.id
        );

    await safeReply(
        interaction,

        saved
            ? `✅ **BAN-TRIGGER CHANNEL ENABLED**

Channel: ${channel}

Anyone who sends a message there will be banned and have up to their previous 3 hours of messages deleted.

Administrators and the server owner are protected.`
            : "❌ Could not save the ban-trigger channel."
    );

    return;
}

// ====================================
// /BAN-CHANNEL-REMOVE
// ====================================

if (
    command ===
    "ban-channel-remove"
) {

    const removed =
        await removeBanTriggerChannel(
            guildId
        );

    await safeReply(
        interaction,

        removed
            ? "✅ Ban-trigger channel disabled."
            : "⚠️ No ban-trigger channel was configured."
    );

    return;
}

// ====================================
// /BAN-CHANNEL-STATUS
// ====================================

if (
    command ===
    "ban-channel-status"
) {

    const channelId =
        await getBanTriggerChannel(
            guildId
        );

    if (!channelId) {

        await safeReply(
            interaction,
            "🟢 No ban-trigger channel is configured."
        );

        return;
    }

    await safeReply(
        interaction,
        `🚨 **Ban-trigger channel:** <#${channelId}>`
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
                        `💬 Message:\n${item.message}\n\n`;
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
                "❌ Interaction command error:",
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

            // ====================================
            // BASIC CHECKS
            // ====================================

            if (!channel.guild) {
                return;
            }

            if (!databaseReady) {

                console.warn(
                    `[AUTO MESSAGE] Database is not ready for #${channel.name}`
                );

                return;
            }

            // ====================================
            // ONLY TEXT / ANNOUNCEMENT CHANNELS
            // ====================================

            if (
                channel.type !== ChannelType.GuildText &&
                channel.type !== ChannelType.GuildAnnouncement
            ) {
                return;
            }

            if (
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

            let category =
                channel.guild.channels.cache.get(
                    categoryId
                );

            // Fetch category if not already cached
            if (!category) {

                try {

                    category =
                        await channel.guild.channels.fetch(
                            categoryId
                        );

                } catch (error) {

                    console.error(
                        `[AUTO MESSAGE] Could not fetch category for #${channel.name}:`,
                        error.message
                    );

                    return;
                }
            }

            if (
                !category ||
                category.type !==
                    ChannelType.GuildCategory
            ) {

                console.warn(
                    `[AUTO MESSAGE] Parent of #${channel.name} is not a valid category.`
                );

                return;
            }

            // ====================================
            // GET SAVED CATEGORY MESSAGE
            // ====================================

            const autoMessage =
                await getAutoCategoryMessage(
                    channel.guild.id,
                    categoryId
                );

            if (!autoMessage) {

                console.log(
                    `[AUTO MESSAGE] No automatic message configured for category "${category.name}".`
                );

                return;
            }

            // ====================================
            // GET GUARDIAN MEMBER
            // ====================================

            let me =
                channel.guild.members.me;

            if (!me) {

                try {

                    me =
                        await channel.guild.members.fetchMe();

                } catch (error) {

                    console.error(
                        `[AUTO MESSAGE] Could not fetch Guardian member in ${channel.guild.name}:`,
                        error.message
                    );

                    return;
                }
            }

            // ====================================
            // CHECK PERMISSIONS
            // ====================================

            const permissions =
                channel.permissionsFor(
                    me
                );

            if (!permissions) {

                console.warn(
                    `[AUTO MESSAGE] Could not determine permissions for #${channel.name}.`
                );

                return;
            }

            if (
                !permissions.has(
                    "ViewChannel"
                )
            ) {

                console.warn(
                    `[AUTO MESSAGE] Guardian cannot view #${channel.name}.`
                );

                return;
            }

            if (
                !permissions.has(
                    "SendMessages"
                )
            ) {

                console.warn(
                    `[AUTO MESSAGE] Guardian cannot send messages in #${channel.name}.`
                );

                return;
            }

            // ====================================
            // SEND MULTI-LINE AUTO MESSAGE
            // ====================================

            await channel.send({
                content:
                    autoMessage
            });

            console.log(
                `[AUTO MESSAGE] ✅ Sent automatic message in #${channel.name}`
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
// UNHANDLED NODE ERRORS
// ========================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled promise rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Uncaught exception:",
            error
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

        // ====================================
        // INITIALIZE DATABASE
        // ====================================

        await database.initDatabase();

        // ====================================
        // TEST DATABASE CONNECTION
        // ====================================

        await database.testDatabase();

        databaseReady =
            true;

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
            "✅ Multi-line auto-category messages ready."
        );

        console.log(
            "✅ Ban-trigger channel database ready."
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

        // ====================================
        // LOGIN TO DISCORD
        // ====================================

        await client.login(
            process.env.DISCORD_TOKEN
        );

    } catch (error) {

        databaseReady =
            false;

        console.error(
            "================================"
        );

        console.error(
            "❌ BOT STARTUP FAILED"
        );

        console.error(
            "================================"
        );

        if (
            error?.message
        ) {

            console.error(
                `❌ Error message: ${error.message}`
            );

        } else {

            console.error(
                error
            );
        }

        // ====================================
        // DATABASE HOST ERROR
        // ====================================

        if (
            error?.code ===
            "ENOTFOUND"
        ) {

            console.error(
                "❌ PostgreSQL hostname could not be found."
            );

            console.error(
                "❌ Check DATABASE_URL in Render."
            );
        }

        // ====================================
        // CONNECTION REFUSED
        // ====================================

        if (
            error?.code ===
            "ECONNREFUSED"
        ) {

            console.error(
                "❌ PostgreSQL refused the connection."
            );

            console.error(
                "❌ Check that your Render PostgreSQL database is running."
            );
        }

        // ====================================
        // LOGIN / PASSWORD ERROR
        // ====================================

        if (
            error?.code ===
            "28P01"
        ) {

            console.error(
                "❌ PostgreSQL username or password is incorrect."
            );
        }

        // ====================================
        // DATABASE DOES NOT EXIST
        // ====================================

        if (
            error?.code ===
            "3D000"
        ) {

            console.error(
                "❌ PostgreSQL database name does not exist."
            );
        }

        console.error(
            "================================"
        );

        process.exit(1);
    }
}

// ========================================
// START GUARDIAN
// ========================================

startBot();

// ========================================
// START GUARDIAN
// ========================================

startBot();
