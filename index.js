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
    ActionRowBuilder,
    MessageFlags
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

const config =
    require("./config");

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

let databaseReady =
    false;

// ========================================
// EXPRESS / RENDER
// ========================================

const app =
    express();

const PORT =
    process.env.PORT ||
    10000;

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
        res
            .status(200)
            .send(
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
        res
            .status(200)
            .json({
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

        if (
            interaction.replied
        ) {
            await interaction.followUp({
                content,
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        if (
            interaction.deferred
        ) {
            await interaction.editReply({
                content
            });

            return;
        }

        await interaction.reply({
            content,
            flags:
                MessageFlags.Ephemeral
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
            flags:
                MessageFlags.Ephemeral
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
        interaction
            .memberPermissions
            ?.has(
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
            "🚫 Exact blocked-word filter: ENABLED"
        );

        console.log(
            "✏️ Edited-message filter: ENABLED"
        );

        console.log(
            "🔤 Unicode normalization: ENABLED"
        );

        console.log(
            "🧠 Fuzzy matching: DISABLED"
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

            if (
                member.user.bot
            ) {
                return;
            }

            if (
                isWhitelisted(
                    member
                )
            ) {
                return;
            }

            const suspicious =
                isSuspiciousAccount(
                    member
                );

            // ====================================
            // KICK NEW ACCOUNTS
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

                if (
                    kicked
                ) {
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

                const logChannel =
                    member.guild
                        .channels
                        .cache
                        .find(
                            channel =>
                                channel.name ===
                                "raid-logs"
                        );

                if (
                    logChannel &&
                    typeof logChannel.send ===
                        "function"
                ) {
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
// WORD FILTER NORMALIZATION
// ========================================

function normalizeForWordFilter(
    text
) {
    return String(
        text || ""
    )
        .trim()
        .toLowerCase();
}

// ========================================
// REGEX ESCAPE
// ========================================

function escapeRegExp(
    text
) {
    return String(
        text || ""
    ).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ========================================
// WHOLE-WORD REGEX
// ========================================

function createWholeWordRegex(
    word
) {
    const escaped =
        escapeRegExp(
            word
        );

    return new RegExp(
        `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
        "iu"
    );
}

// ========================================
// FIND CONFIRMED BLOCKED WORD
// ========================================

async function findStandaloneBlockedWord(
    guild,
    content
) {
    try {
        if (
            !guild ||
            !content ||
            !databaseReady
        ) {
            return null;
        }

        const words =
            await getBlockedWords(
                guild
            );

        if (
            !Array.isArray(words) ||
            words.length === 0
        ) {
            return null;
        }

        const normalizedContent =
            normalizeForWordFilter(
                content
            );

        for (
            const storedWord of words
        ) {
            const blockedWord =
                typeof storedWord ===
                    "string"
                    ? storedWord
                    : storedWord?.word;

            if (!blockedWord) {
                continue;
            }

            const cleanWord =
                normalizeForWordFilter(
                    blockedWord
                );

            if (!cleanWord) {
                continue;
            }

            const regex =
                createWholeWordRegex(
                    cleanWord
                );

            if (
                regex.test(
                    normalizedContent
                )
            ) {
                return cleanWord;
            }
        }

        return null;

    } catch (error) {
        console.error(
            "❌ Could not check blocked words:",
            error
        );

        return null;
    }
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
            !message.author ||
            message.author.bot ||
            !message.guild ||
            !databaseReady ||
            !message.content
        ) {
            return false;
        }

        // ====================================
        // CONFIRM BLOCKED WORD
        // ====================================

        const blockedWord =
            await findStandaloneBlockedWord(
                message.guild.id,
                message.content
            );

        /*
         * CRITICAL SAFETY CHECK:
         *
         * No blocked word returned =
         * absolutely no timeout.
         */
        if (
            !blockedWord
        ) {
            return false;
        }

        console.log(
            `[WORD FILTER] ${message.author.tag} triggered blocked word "${blockedWord}" (${source})`
        );

        console.log(
            `[WORD FILTER] Message: "${message.content}"`
        );

        // ====================================
        // DELETE MESSAGE
        // ====================================

        try {
            if (
                message.deletable
            ) {
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
        // FETCH MEMBER
        // ====================================

        let member =
            message.member;

        if (
            !member
        ) {
            try {
                member =
                    await message.guild
                        .members
                        .fetch(
                            message.author.id
                        );

            } catch (error) {
                console.error(
                    "❌ Could not fetch member:",
                    error.message
                );

                return false;
            }
        }

        // ====================================
        // OWNER PROTECTION
        // ====================================

        if (
            member.id ===
            message.guild.ownerId
        ) {
            console.warn(
                "[WORD FILTER] Server owner cannot be timed out."
            );

            return false;
        }

        // ====================================
        // MODERATABLE CHECK
        // ====================================

        if (
            !member.moderatable
        ) {
            console.warn(
                `[WORD FILTER] Cannot timeout ${message.author.tag}.`
            );

            console.warn(
                "[WORD FILTER] Guardian needs Moderate Members and its role must be above the user's highest role."
            );

            return false;
        }

        // ====================================
        // TIMEOUT DURATION
        // ====================================

        const timeoutDuration =
            config.wordTimeoutDuration ??
            24 * 60 * 60 * 1000;

        // ====================================
        // FINAL SAFETY CHECK
        // ====================================

        if (
            typeof blockedWord !==
                "string" ||
            !blockedWord.trim()
        ) {
            console.error(
                "[WORD FILTER] Timeout cancelled because no valid blocked word was confirmed."
            );

            return false;
        }

        // ====================================
        // TIMEOUT MEMBER
        // ====================================

        try {
            await member.timeout(
                timeoutDuration,
                `Guardian Anti-Raid: triggered blocked word "${blockedWord}" (${source})`
            );

            console.log(
                `[WORD FILTER] ⏱️ Timed out ${message.author.tag} for ${Math.round(
                    timeoutDuration /
                    3600000
                )} hour(s).`
            );

            return true;

        } catch (error) {
            console.error(
                "❌ Could not timeout member:",
                error.message
            );

            return false;
        }

    } catch (error) {
        console.error(
            "❌ Blocked-word moderation error:",
            error
        );

        return false;
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
                !message.author ||
                message.author.bot ||
                !message.guild ||
                !databaseReady
            ) {
                return;
            }

            // ====================================
            // BAN TRIGGER CHANNEL
            // ====================================

            const banChannelId =
                await getBanTriggerChannel(
                    message.guild.id
                );

            if (
                banChannelId &&
                message.channel.id === banChannelId
            ) {
                let member =
                    message.member;

                if (!member) {
                    try {
                        member =
                            await message.guild
                                .members
                                .fetch(
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
                // PROTECT OWNER
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
                // CHECK BANNABLE
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
                // ====================================

                try {
                    await member.ban({
                        deleteMessageSeconds:
                            config.banDeleteMessageSeconds ??
                            3 * 60 * 60,

                        reason:
                            `Guardian Anti-Raid: sent a message in ban-trigger channel #${message.channel.name}`
                    });

                    console.log(
                        `[BAN CHANNEL] 🔨 Banned ${message.author.tag}`
                    );

                } catch (error) {
                    console.error(
                        `[BAN CHANNEL] ❌ Could not ban ${message.author.tag}:`,
                        error.message
                    );
                }

                return;
            }

            // ====================================
            // BLOCKED WORD FILTER
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
            if (!newMessage) {
                return;
            }

            // ====================================
            // FETCH PARTIAL
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

            if (
                !newMessage.author ||
                newMessage.author.bot ||
                !newMessage.guild ||
                !databaseReady ||
                !newMessage.content
            ) {
                return;
            }

            // ====================================
            // IGNORE UNCHANGED CONTENT
            // ====================================

            if (
                oldMessage?.content ===
                newMessage.content
            ) {
                return;
            }

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
        try {
            // ====================================
            // AUTOMESSAGE MODAL SUBMIT
            // ====================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    "automessage-set:"
                )
            ) {
                if (!interaction.guild) {
                    await safeReply(
                        interaction,
                        "❌ This can only be used inside a server."
                    );

                    return;
                }

                if (!databaseReady) {
                    await safeReply(
                        interaction,
                        "❌ PostgreSQL is not ready."
                    );

                    return;
                }

                const categoryId =
                    interaction.customId
                        .split(":")[1];

                const messageText =
                    interaction.fields
                        .getTextInputValue(
                            "message"
                        )
                        .trim();

                if (!messageText) {
                    await safeReply(
                        interaction,
                        "❌ Automatic message cannot be empty."
                    );

                    return;
                }

                const maxLength =
                    config.autoMessageMaxLength ??
                    2000;

                if (
                    messageText.length >
                    maxLength
                ) {
                    await safeReply(
                        interaction,
                        `❌ Automatic message cannot be longer than ${maxLength} characters.`
                    );

                    return;
                }

                const saved =
                    await setAutoCategoryMessage(
                        interaction.guild.id,
                        categoryId,
                        messageText
                    );

                await safeReply(
                    interaction,
                    saved
                        ? "✅ Automatic category message saved."
                        : "❌ Could not save the automatic category message."
                );

                return;
            }

            // ====================================
            // ONLY SLASH COMMANDS AFTER THIS
            // ====================================

            if (
                !interaction.isChatInputCommand()
            ) {
                return;
            }

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

            const command =
                interaction.commandName;

            const admin =
                isAdministrator(
                    interaction
                );

            // ====================================
            // /AUTOMESSAGE-SET
            // MUST HAPPEN BEFORE DEFER
            // ====================================

            if (
                command ===
                "automessage-set"
            ) {
                if (!admin) {
                    let member =
                        interaction.member;

                    if (
                        !member ||
                        typeof member.roles?.cache ===
                            "undefined"
                    ) {
                        try {
                            member =
                                await interaction.guild
                                    .members
                                    .fetch(
                                        interaction.user.id
                                    );

                        } catch (error) {
                            console.error(
                                "❌ Could not fetch Guardian command member:",
                                error.message
                            );

                            await safeReply(
                                interaction,
                                "❌ Could not verify your Guardian permissions."
                            );

                            return;
                        }
                    }

                    const allowed =
                        await canUseGuardian(
                            member
                        );

                    if (!allowed) {
                        await safeReply(
                            interaction,
                            "❌ **Access Denied**\n\nYou are not authorized to use Guardian Anti-Raid."
                        );

                        return;
                    }
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

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `automessage-set:${category.id}`
                        )
                        .setTitle(
                            "Set Automatic Message"
                        );

                const messageInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "message"
                        )
                        .setLabel(
                            "Message to send in new channels"
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(
                            true
                        )
                        .setMaxLength(
                            config.autoMessageMaxLength ??
                            2000
                        )
                        .setPlaceholder(
                            "Enter the automatic message..."
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            messageInput
                        );

                modal.addComponents(
                    row
                );

                await interaction.showModal(
                    modal
                );

                return;
            }

            // ====================================
            // DEFER EVERYTHING ELSE
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

                if (user.bot) {
                    await safeReply(
                        interaction,
                        "❌ You cannot authorize a bot account."
                    );

                    return;
                }

                const result =
                    await authorizeUser(
                        interaction.guild.id,
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

                if (user.bot) {
                    await safeReply(
                        interaction,
                        "❌ You cannot modify Guardian authorization for a bot account."
                    );

                    return;
                }

                const result =
                    await unauthorizeUser(
                        interaction.guild.id,
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

                if (
                    role.id ===
                    interaction.guild.id
                ) {
                    await safeReply(
                        interaction,
                        "❌ You cannot authorize the @everyone role."
                    );

                    return;
                }

                const result =
                    await authorizeRole(
                        interaction.guild.id,
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

                if (
                    role.id ===
                    interaction.guild.id
                ) {
                    await safeReply(
                        interaction,
                        "❌ You cannot modify Guardian authorization for the @everyone role."
                    );

                    return;
                }

                const result =
                    await unauthorizeRole(
                        interaction.guild.id,
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
                        interaction.guild.id
                    );

                const roles =
                    await getAuthorizedRoles(
                        interaction.guild.id
                    );

                let output =
                    "🛡️ **AUTHORIZED GUARDIAN ACCESS**\n\n";

                output +=
                    "**Users:**\n";

                output +=
                    Array.isArray(users) &&
                    users.length
                        ? users
                            .map(
                                id =>
                                    `• <@${id}>`
                            )
                            .join("\n")
                        : "• None";

                output +=
                    "\n\n**Roles:**\n";

                output +=
                    Array.isArray(roles) &&
                    roles.length
                        ? roles
                            .map(
                                id =>
                                    `• <@&${id}>`
                            )
                            .join("\n")
                        : "• None";

                if (
                    output.length >
                    1900
                ) {
                    output =
                        output.slice(
                            0,
                            1850
                        ) +
                        "\n\n...list truncated.";
                }

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
                        interaction.guild.id
                    );

                const roles =
                    await getUnauthorizedRoles(
                        interaction.guild.id
                    );

                let output =
                    "🚫 **UNAUTHORIZED GUARDIAN ACCESS**\n\n";

                output +=
                    "**Users:**\n";

                output +=
                    Array.isArray(users) &&
                    users.length
                        ? users
                            .map(
                                id =>
                                    `• <@${id}>`
                            )
                            .join("\n")
                        : "• None";

                output +=
                    "\n\n**Roles:**\n";

                output +=
                    Array.isArray(roles) &&
                    roles.length
                        ? roles
                            .map(
                                id =>
                                    `• <@&${id}>`
                            )
                            .join("\n")
                        : "• None";

                if (
                    output.length >
                    1900
                ) {
                    output =
                        output.slice(
                            0,
                            1850
                        ) +
                        "\n\n...list truncated.";
                }

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
                let member =
                    interaction.member;

                if (
                    !member ||
                    typeof member.roles?.cache ===
                        "undefined"
                ) {
                    try {
                        member =
                            await interaction.guild
                                .members
                                .fetch(
                                    interaction.user.id
                                );

                    } catch (error) {
                        console.error(
                            "❌ Could not fetch Guardian command member:",
                            error.message
                        );

                        await safeReply(
                            interaction,
                            "❌ Could not verify your Guardian permissions."
                        );

                        return;
                    }
                }

                const allowed =
                    await canUseGuardian(
                        member
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
                        : "⚠️ Server lockdown is not currently active."
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
                        interaction.guild.id
                    );

                await safeReply(
                    interaction,
                    locked
                        ? "🔴 **RAID STATUS: LOCKDOWN ACTIVE**"
                        : "🟢 **RAID STATUS: NORMAL**"
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
                    interaction.options.getString(
                        "word"
                    );

                if (
                    !word ||
                    !word.trim()
                ) {
                    await safeReply(
                        interaction,
                        "❌ Please enter a word to block."
                    );

                    return;
                }

                const cleanWord =
                    word
                        .trim()
                        .toLowerCase();

                const maxLength =
                    config.blockedWordMaxLength ??
                    100;

                if (
                    cleanWord.length >
                    maxLength
                ) {
                    await safeReply(
                        interaction,
                        `❌ The blocked word cannot be longer than ${maxLength} characters.`
                    );

                    return;
                }

                const added =
                    await addBlockedWord(
                        interaction.guild.id,
                        cleanWord
                    );

                await safeReply(
                    interaction,
                    added
                        ? `🚫 Added **${cleanWord}** to the blocked-word list.`
                        : `⚠️ **${cleanWord}** is already blocked.`
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
                    interaction.options.getString(
                        "word"
                    );

                if (
                    !word ||
                    !word.trim()
                ) {
                    await safeReply(
                        interaction,
                        "❌ Please enter a blocked word to remove."
                    );

                    return;
                }

                const cleanWord =
                    word
                        .trim()
                        .toLowerCase();

                const removed =
                    await removeBlockedWord(
                        interaction.guild.id,
                        cleanWord
                    );

                await safeReply(
                    interaction,
                    removed
                        ? `✅ Removed **${cleanWord}** from the blocked-word list.`
                        : `⚠️ **${cleanWord}** was not in the blocked-word list.`
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
                        interaction.guild.id
                    );

                if (
                    !Array.isArray(words) ||
                    words.length === 0
                ) {
                    await safeReply(
                        interaction,
                        "🟢 No blocked words are configured."
                    );

                    return;
                }

                let output =
                    "🚫 **GUARDIAN BLOCKED WORDS**\n\n";

                for (
                    const storedWord of words
                ) {
                    const word =
                        typeof storedWord ===
                            "string"
                            ? storedWord
                            : storedWord?.word;

                    if (!word) {
                        continue;
                    }

                    const line =
                        `• ${word}\n`;

                    if (
                        output.length +
                            line.length >
                        1850
                    ) {
                        output +=
                            "\n...more blocked words exist.";

                        break;
                    }

                    output +=
                        line;
                }

                await safeReply(
                    interaction,
                    output
                );

                return;
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
                        interaction.guild.id,
                        channel.id
                    );

                await safeReply(
                    interaction,
                    saved
                        ? `✅ **BAN-TRIGGER CHANNEL ENABLED**

Channel: ${channel}

🔨 Anyone who sends a message there will be banned.
🗑️ Up to the previous 3 hours of their messages will be requested for deletion.
👑 Server owner: Protected
🛡️ Administrators: Protected`
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
                        interaction.guild.id
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
                        interaction.guild.id
                    );

                if (!channelId) {
                    await safeReply(
                        interaction,
                        "🟢 No ban-trigger channel is configured."
                    );

                    return;
                }

                let channel =
                    interaction.guild
                        .channels
                        .cache
                        .get(
                            channelId
                        );

                if (!channel) {
                    try {
                        channel =
                            await interaction.guild
                                .channels
                                .fetch(
                                    channelId
                                );

                    } catch {
                        channel =
                            null;
                    }
                }

                if (!channel) {
                    await safeReply(
                        interaction,
                        `⚠️ A ban-trigger channel is saved, but it could not be found.

Stored channel:
\`${channelId}\`

Use \`/ban-channel-remove\` to clear it.`
                    );

                    return;
                }

                await safeReply(
                    interaction,
                    `🚨 **BAN-TRIGGER CHANNEL ACTIVE**

Channel: ${channel}

🔨 Action: Ban member
🗑️ Deletes up to the previous 3 hours of messages
👑 Server owner: Protected
🛡️ Administrators: Protected`
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
                        interaction.guild.id,
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
                        interaction.guild.id
                    );

                if (
                    !Array.isArray(configs) ||
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
                        interaction.guild
                            .channels
                            .cache
                            .get(
                                item.category_id
                            );

                    const categoryName =
                        category
                            ? category.name
                            : `Deleted category (${item.category_id})`;

                    const messageText =
                        item.message ??
                        item.message_text ??
                        "";

                    const section =
                        `📁 **${categoryName}**\n` +
                        `💬 Message:\n${messageText}\n\n`;

                    if (
                        output.length +
                            section.length >
                        1850
                    ) {
                        output +=
                            "\n...more configurations exist.";

                        break;
                    }

                    output +=
                        section;
                }

                await safeReply(
                    interaction,
                    output
                );

                return;
            }

            // ====================================
            // UNKNOWN COMMAND FALLBACK
            // ====================================

            await safeReply(
                interaction,
                `❌ Guardian does not have a handler for \`/${command}\`.`
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

    if (user.bot) {
        await safeReply(
            interaction,
            "❌ You cannot authorize a bot account."
        );

        return;
    }

    const result =
        await authorizeUser(
            interaction.guild.id,
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

    if (user.bot) {
        await safeReply(
            interaction,
            "❌ You cannot modify Guardian authorization for a bot account."
        );

        return;
    }

    const result =
        await unauthorizeUser(
            interaction.guild.id,
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

    if (
        role.id ===
        interaction.guild.id
    ) {
        await safeReply(
            interaction,
            "❌ You cannot authorize the @everyone role."
        );

        return;
    }

    const result =
        await authorizeRole(
            interaction.guild.id,
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

    if (
        role.id ===
        interaction.guild.id
    ) {
        await safeReply(
            interaction,
            "❌ You cannot modify Guardian authorization for the @everyone role."
        );

        return;
    }

    const result =
        await unauthorizeRole(
            interaction.guild.id,
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
            interaction.guild.id
        );

    const roles =
        await getAuthorizedRoles(
            interaction.guild.id
        );

    let output =
        "🛡️ **AUTHORIZED GUARDIAN ACCESS**\n\n";

    output +=
        "**Users:**\n";

    output +=
        Array.isArray(users) &&
        users.length
            ? users
                .map(
                    id =>
                        `• <@${id}>`
                )
                .join("\n")
            : "• None";

    output +=
        "\n\n**Roles:**\n";

    output +=
        Array.isArray(roles) &&
        roles.length
            ? roles
                .map(
                    id =>
                        `• <@&${id}>`
                )
                .join("\n")
            : "• None";

    await safeReply(
        interaction,
        output.slice(
            0,
            1900
        )
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
            interaction.guild.id
        );

    const roles =
        await getUnauthorizedRoles(
            interaction.guild.id
        );

    let output =
        "🚫 **UNAUTHORIZED GUARDIAN ACCESS**\n\n";

    output +=
        "**Users:**\n";

    output +=
        Array.isArray(users) &&
        users.length
            ? users
                .map(
                    id =>
                        `• <@${id}>`
                )
                .join("\n")
            : "• None";

    output +=
        "\n\n**Roles:**\n";

    output +=
        Array.isArray(roles) &&
        roles.length
            ? roles
                .map(
                    id =>
                        `• <@&${id}>`
                )
                .join("\n")
            : "• None";

    await safeReply(
        interaction,
        output.slice(
            0,
            1900
        )
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
    command ===
    "word-add"
) {
    const input =
        interaction.options.getString(
            "word"
        );

    if (
        typeof input !==
            "string" ||
        !input.trim()
    ) {
        await safeReply(
            interaction,
            "❌ You must provide a word."
        );

        return;
    }

    const word =
        input
            .trim()
            .toLowerCase();

    const maxLength =
        config.blockedWordMaxLength ??
        100;

    if (
        word.length >
        maxLength
    ) {
        await safeReply(
            interaction,
            `❌ Blocked words cannot be longer than ${maxLength} characters.`
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
            ? `✅ **${word}** was added to the blocked-word database.`
            : `⚠️ **${word}** is already blocked or could not be added.`
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
    const input =
        interaction.options.getString(
            "word"
        );

    if (
        typeof input !==
            "string" ||
        !input.trim()
    ) {
        await safeReply(
            interaction,
            "❌ You must provide a word."
        );

        return;
    }

    const word =
        input
            .trim()
            .toLowerCase();

    const removed =
        await removeBlockedWord(
            interaction.guild.id,
            word
        );

    await safeReply(
        interaction,
        removed
            ? `✅ **${word}** was removed from the blocked-word database.`
            : `⚠️ **${word}** was not found in the blocked-word database.`
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
            interaction.guild.id
        );

    if (
        !Array.isArray(words) ||
        words.length === 0
    ) {
        await safeReply(
            interaction,
            "📋 No blocked words are configured."
        );

        return;
    }

    let output =
        "🚫 **BLOCKED WORDS**\n\n";

    for (
        const storedWord of words
    ) {
        const word =
            typeof storedWord ===
                "string"
                ? storedWord
                : storedWord?.word;

        if (!word) {
            continue;
        }

        const line =
            `• ${word}\n`;

        if (
            output.length +
                line.length >
            1850
        ) {
            output +=
                "\n...more blocked words exist.";

            break;
        }

        output +=
            line;
    }

    await safeReply(
        interaction,
        output
    );

    return;
}

// ====================================
// UNKNOWN COMMAND
// KEEP THIS LAST
// ====================================

await safeReply(
    interaction,
    `❌ Guardian does not have a handler for \`/${command}\`.`
);

// ====================================
// ACCESS CONTROL
// ====================================

if (!admin) {
    let member =
        interaction.member;

    // Fetch the complete GuildMember if Discord
    // supplied only partial/raw member information.
    if (
        !member ||
        typeof member.roles?.cache ===
            "undefined"
    ) {
        try {
            member =
                await interaction.guild
                    .members
                    .fetch(
                        interaction.user.id
                    );

        } catch (error) {
            console.error(
                "❌ Could not fetch Guardian command member:",
                error.message
            );

            await safeReply(
                interaction,
                "❌ Could not verify your Guardian permissions."
            );

            return;
        }
    }

    const allowed =
        await canUseGuardian(
            member
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
            interaction.guild,
            channel.id
        );

    if (!saved) {
        await safeReply(
            interaction,
            "❌ Could not save the ban-trigger channel."
        );

        return;
    }

    await safeReply(
        interaction,
        `✅ **BAN-TRIGGER CHANNEL ENABLED**

Channel: ${channel}

🔨 Anyone who sends a message in this channel will be banned.
🗑️ Up to the previous 3 hours of their messages will be requested for deletion.
👑 Server owner: Protected
🛡️ Administrators: Protected`
    );

    console.log(
        `[BAN CHANNEL] ✅ #${channel.name} configured in ${interaction.guild.name}`
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
            interaction.guild
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
            interaction.guild
        );

    if (!channelId) {
        await safeReply(
            interaction,
            "🟢 No ban-trigger channel is configured."
        );

        return;
    }

    let channel =
        interaction.guild
            .channels
            .cache
            .get(
                channelId
            );

    if (!channel) {
        try {
            channel =
                await interaction.guild
                    .channels
                    .fetch(
                        channelId
                    );

        } catch (error) {
            console.warn(
                `[BAN CHANNEL] Could not fetch saved channel ${channelId}:`,
                error.message
            );

            channel =
                null;
        }
    }

    if (!channel) {
        await safeReply(
            interaction,
            `⚠️ A ban-trigger channel is saved, but that Discord channel could not be found.

Stored channel ID:
\`${channelId}\`

Use \`/ban-channel-remove\` to clear it.`
        );

        return;
    }

    await safeReply(
        interaction,
        `🚨 **BAN-TRIGGER CHANNEL ACTIVE**

Channel: ${channel}

🔨 Action: Ban member
🗑️ Deletes up to the previous 3 hours of messages
👑 Server owner: Protected
🛡️ Administrators: Protected`
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
            interaction.guild,
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
            interaction.guild
        );

    if (
        !Array.isArray(configs) ||
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
        const categoryId =
            item.category_id ??
            item.categoryId;

        if (!categoryId) {
            continue;
        }

        let category =
            interaction.guild
                .channels
                .cache
                .get(
                    categoryId
                );

        if (!category) {
            try {
                category =
                    await interaction.guild
                        .channels
                        .fetch(
                            categoryId
                        );

            } catch {
                category =
                    null;
            }
        }

        const categoryName =
            category
                ? category.name
                : `Deleted category (${categoryId})`;

        const messageText =
            item.message ??
            item.message_text ??
            "";

        const section =
            `📁 **${categoryName}**\n` +
            `💬 Message:\n${messageText || "(empty message)"}\n\n`;

        if (
            output.length +
                section.length >
            1850
        ) {
            output +=
                "\n...more configurations exist.";

            break;
        }

        output +=
            section;
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
    command ===
    "word-add"
) {
    const input =
        interaction.options.getString(
            "word"
        );

    if (
        typeof input !==
            "string" ||
        !input.trim()
    ) {
        await safeReply(
            interaction,
            "❌ You must provide a word."
        );

        return;
    }

    const word =
        input
            .trim()
            .toLowerCase();

    const maxLength =
        config.blockedWordMaxLength ??
        100;

    if (
        word.length >
        maxLength
    ) {
        await safeReply(
            interaction,
            `❌ Blocked words cannot be longer than ${maxLength} characters.`
        );

        return;
    }

    const added =
        await addBlockedWord(
            interaction.guild,
            word
        );

    await safeReply(
        interaction,
        added
            ? `✅ **${word}** was added to the blocked-word database.`
            : `⚠️ **${word}** is already blocked or could not be added.`
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
    const input =
        interaction.options.getString(
            "word"
        );

    if (
        typeof input !==
            "string" ||
        !input.trim()
    ) {
        await safeReply(
            interaction,
            "❌ You must provide a word."
        );

        return;
    }

    const word =
        input
            .trim()
            .toLowerCase();

    const removed =
        await removeBlockedWord(
            interaction.guild,
            word
        );

    await safeReply(
        interaction,
        removed
            ? `✅ **${word}** was removed from the blocked-word database.`
            : `⚠️ **${word}** was not found in the blocked-word database.`
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
            interaction.guild
        );

    if (
        !Array.isArray(words) ||
        words.length === 0
    ) {
        await safeReply(
            interaction,
            "📋 No blocked words are configured."
        );

        return;
    }

    let output =
        "🚫 **BLOCKED WORDS**\n\n";

    for (
        const storedWord of words
    ) {
        const word =
            typeof storedWord ===
                "string"
                ? storedWord
                : storedWord?.word;

        if (!word) {
            continue;
        }

        const line =
            `• ${word}\n`;

        if (
            output.length +
                line.length >
            1850
        ) {
            output +=
                "\n...more blocked words exist.";

            break;
        }

        output +=
            line;
    }

    await safeReply(
        interaction,
        output
    );

    return;
}

// ====================================
// UNKNOWN COMMAND
// THIS MUST BE LAST
// ====================================

await safeReply(
    interaction,
    `❌ Guardian does not have a handler for \`/${command}\`.`
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

            if (
                !channel ||
                !channel.guild
            ) {
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
                channel.type !==
                    ChannelType.GuildText &&
                channel.type !==
                    ChannelType.GuildAnnouncement
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
            // PARENT CATEGORY
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
                channel.guild
                    .channels
                    .cache
                    .get(
                        categoryId
                    );

            if (!category) {
                try {
                    category =
                        await channel.guild
                            .channels
                            .fetch(
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
            // GET SAVED AUTO MESSAGE
            // ====================================

            const autoMessage =
                await getAutoCategoryMessage(
                    channel.guild,
                    categoryId
                );

            if (
                typeof autoMessage !==
                    "string" ||
                !autoMessage.trim()
            ) {
                console.log(
                    `[AUTO MESSAGE] No automatic message configured for category "${category.name}".`
                );

                return;
            }

            // ====================================
            // FETCH GUARDIAN MEMBER
            // ====================================

            let me =
                channel.guild.members.me;

            if (!me) {
                try {
                    me =
                        await channel.guild
                            .members
                            .fetchMe();

                } catch (error) {
                    console.error(
                        `[AUTO MESSAGE] Could not fetch Guardian member in ${channel.guild.name}:`,
                        error.message
                    );

                    return;
                }
            }

            // ====================================
            // PERMISSION CHECK
            // ====================================

            const permissions =
                channel.permissionsFor(
                    me
                );

            if (!permissions) {
                console.warn(
                    `[AUTO MESSAGE] Could not determine Guardian permissions for #${channel.name}.`
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
            // SEND AUTO MESSAGE
            // ====================================

            try {
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
                    `[AUTO MESSAGE] ❌ Could not send automatic message in #${channel.name}:`,
                    error.message
                );
            }

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
        // VERIFY DATABASE
        // ====================================

        if (
            typeof database.isDatabaseReady ===
                "function" &&
            !database.isDatabaseReady()
        ) {
            throw new Error(
                "PostgreSQL initialization completed, but the database did not report ready."
            );
        }

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
            "✅ Unauthorized users database ready."
        );

        console.log(
            "✅ Authorized roles database ready."
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
        // LOGIN
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

        console.error(
            error?.message
                ? `❌ Error message: ${error.message}`
                : error
        );

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

            console.error(
                "❌ Check DATABASE_URL in Render."
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

            console.error(
                "❌ Check the database name inside DATABASE_URL."
            );
        }

        // ====================================
        // SSL ERROR
        // ====================================

        if (
            error?.code ===
            "SELF_SIGNED_CERT_IN_CHAIN"
        ) {
            console.error(
                "❌ PostgreSQL SSL connection failed."
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
