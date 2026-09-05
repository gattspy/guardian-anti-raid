require("dotenv").config();

const express = require("express");

const {
    ActionRowBuilder,
    ChannelType,
    Client,
    EmbedBuilder,
    GatewayIntentBits,
    MessageFlags,
    ModalBuilder,
    Partials,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const database = require("./database");
const config = require("./config");

const {
    addBlockedWord,
    authorizeRole,
    authorizeUser,
    canUseGuardian,
    checkImageSpam,
    getAuthorizedRoles,
    getAuthorizedUsers,
    getAutoCategoryMessage,
    getAutoCategoryMessages,
    getBanTriggerChannel,
    getBlockedWords,
    getUnauthorizedRoles,
    getUnauthorizedUsers,
    getWelcomeDm,
    isLockedDown,
    isSuspiciousAccount,
    isWhitelisted,
    kickMember,
    lockdown,
    recordJoin,
    removeAutoCategoryMessage,
    removeBanTriggerChannel,
    removeBlockedWord,
    removeWelcomeDm,
    setAutoCategoryMessage,
    setBanTriggerChannel,
    setWelcomeDm,
    unauthorizeRole,
    unauthorizeUser,
    unlock
} = require("./antiRaid");

// ========================================
// ENVIRONMENT VALIDATION
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN is missing from .env"
    );

    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error(
        "❌ DATABASE_URL is missing from .env"
    );

    process.exit(1);
}

let databaseReady = false;
let shuttingDown = false;

const welcomeDmTimers =
    new Map();

// ========================================
// EXPRESS SERVER
// ========================================

const app = express();

const PORT =
    Number(process.env.PORT) ||
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
// WEBSITE ROUTES
// ========================================

app.get(
    "/",
    (request, response) => {
        response
            .status(200)
            .send(
                "🛡️ Guardian Anti-Raid is online."
            );
    }
);

app.get(
    "/health",
    (request, response) => {
        const online =
            databaseReady &&
            client.isReady();

        response
            .status(
                online
                    ? 200
                    : 503
            )
            .json({
                status:
                    online
                        ? "online"
                        : "starting",

                bot:
                    client.isReady()
                        ? "online"
                        : "offline",

                database:
                    databaseReady
                        ? "online"
                        : "offline",

                servers:
                    client.guilds.cache.size
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
// BASIC HELPERS
// ========================================

function wait(milliseconds) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );
}

function truncate(
    text,
    maximum = 1900
) {
    if (
        text.length <= maximum
    ) {
        return text;
    }

    return (
        text.slice(
            0,
            maximum - 25
        ) +
        "\n\n...list truncated."
    );
}

// ========================================
// INTERACTION HELPERS
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

        const message =
            String(
                content ?? ""
            );

        if (interaction.deferred) {
            await interaction.editReply({
                content:
                    message
            });

        } else if (
            interaction.replied
        ) {
            await interaction.followUp({
                content:
                    message,

                flags:
                    MessageFlags.Ephemeral
            });

        } else {
            await interaction.reply({
                content:
                    message,

                flags:
                    MessageFlags.Ephemeral
            });
        }

        return true;

    } catch (error) {
        if (
            error?.code !== 10062 &&
            error?.code !== 40060
        ) {
            console.error(
                "❌ Interaction response error:",
                error
            );
        }

        return false;
    }
}

async function deferInteraction(
    interaction
) {
    try {
        if (
            !interaction.deferred &&
            !interaction.replied
        ) {
            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral
            });
        }

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
// PERMISSION HELPERS
// ========================================

function isAdministrator(
    interaction
) {
    return (
        interaction
            .memberPermissions
            ?.has(
                PermissionFlagsBits.Administrator
            ) === true
    );
}

async function getInteractionMember(
    interaction
) {
    if (
        interaction.member
            ?.roles
            ?.cache
    ) {
        return interaction.member;
    }

    return interaction.guild
        .members
        .fetch(
            interaction.user.id
        );
}

async function guardianAccessAllowed(
    interaction
) {
    if (
        isAdministrator(
            interaction
        )
    ) {
        return true;
    }

    try {
        const member =
            await getInteractionMember(
                interaction
            );

        return await canUseGuardian(
            member
        );

    } catch (error) {
        console.error(
            "❌ Could not verify Guardian permissions:",
            error
        );

        return false;
    }
}

// ========================================
// BOT READY
// ========================================

client.once(
    "ready",
    readyClient => {
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
            `🤖 Logged in as ${readyClient.user.tag}`
        );

        console.log(
            `🌐 Monitoring ${readyClient.guilds.cache.size} server(s)`
        );

        console.log(
            databaseReady
                ? "🗄️ PostgreSQL: READY"
                : "❌ PostgreSQL: NOT READY"
        );

        console.log(
            config.kickNewAccounts
                ? "🛡️ New-account protection: ENABLED"
                : "⚠️ New-account protection: DISABLED"
        );

        console.log(
            "🖼️ Cross-channel image-spam protection: ENABLED"
        );

        console.log(
            "🚫 Blocked-word filter: ENABLED"
        );

        console.log(
            "📨 Category auto-messages: ENABLED"
        );

        console.log(
            "💌 One-minute welcome DMs: ENABLED"
        );

        console.log(
            "🔨 Ban-trigger channel protection: ENABLED"
        );

        console.log(
            "================================"
        );
    }
);

// ========================================
// WELCOME DM TIMER HELPERS
// ========================================

function getWelcomeTimerKey(
    guildId,
    userId
) {
    return `${guildId}:${userId}`;
}

async function scheduleWelcomeDm(
    member
) {
    if (
        !member?.guild?.id ||
        !member?.id ||
        member.user?.bot
    ) {
        return false;
    }

    // Check whether this server has a saved
    // welcome message before creating a timer.
    try {
        const initialSetting =
            await getWelcomeDm(
                member.guild
            );

        if (
            !initialSetting ||
            !initialSetting.message
        ) {
            console.log(
                `[WELCOME DM] No welcome DM configured for ${member.guild.name}.`
            );

            return false;
        }

    } catch (error) {
        console.error(
            `[WELCOME DM] Could not check settings for ${member.guild.name}:`,
            error
        );

        return false;
    }

    const guildId =
        member.guild.id;

    const userId =
        member.id;

    const timerKey =
        getWelcomeTimerKey(
            guildId,
            userId
        );

    const previousTimer =
        welcomeDmTimers.get(
            timerKey
        );

    if (previousTimer) {
        clearTimeout(
            previousTimer
        );
    }

    const delay =
        config.welcomeDmDelay ??
        60 * 1000;

    const timer =
        setTimeout(
            async () => {
                welcomeDmTimers.delete(
                    timerKey
                );

                try {
                    if (
                        !databaseReady ||
                        !client.isReady()
                    ) {
                        return;
                    }

                    const guild =
                        client.guilds
                            .cache
                            .get(
                                guildId
                            );

                    if (!guild) {
                        return;
                    }

                    // Force-fetch the member to verify
                    // they are still in the server.
                    const currentMember =
                        await guild.members
                            .fetch({
                                user:
                                    userId,

                                force:
                                    true
                            })
                            .catch(
                                () => null
                            );

                    if (!currentMember) {
                        console.log(
                            `[WELCOME DM] Member ${userId} left ${guild.name} before delivery.`
                        );

                        return;
                    }

                    // Read the newest saved message.
                    const setting =
                        await getWelcomeDm(
                            guild
                        );

                    if (
                        !setting ||
                        !setting.message
                    ) {
                        console.log(
                            `[WELCOME DM] Setting was removed before delivery in ${guild.name}.`
                        );

                        return;
                    }

                    const directMessage = {
                        content:
                            setting.message,

                        allowedMentions: {
                            parse: []
                        }
                    };

                    if (setting.imageUrl) {
                        directMessage.embeds = [
                            new EmbedBuilder()
                                .setColor(
                                    0x5865F2
                                )
                                .setImage(
                                    setting.imageUrl
                                )
                        ];
                    }

                    await currentMember.send(
                        directMessage
                    );

                    console.log(
                        `[WELCOME DM] ✅ Sent to ${currentMember.user.tag} from ${guild.name}.`
                    );

                } catch (error) {
                    console.warn(
                        `[WELCOME DM] Could not DM ${userId} in ${guildId}:`,
                        error?.message ??
                        error
                    );

                    console.warn(
                        "The member may have server direct messages disabled."
                    );
                }
            },
            delay
        );

    welcomeDmTimers.set(
        timerKey,
        timer
    );

    console.log(
        `[WELCOME DM] Scheduled for ${member.user.tag} in ${Math.round(
            delay / 1000
        )} seconds.`
    );

    return true;
}

// ========================================
// MEMBER JOIN PROTECTION
// ========================================

client.on(
    "guildMemberAdd",
    async member => {
        try {
            if (
                !member?.guild ||
                !member?.user ||
                member.user.bot
            ) {
                return;
            }

            console.log(
                `[JOIN] ${member.user.tag} joined ${member.guild.name}`
            );

            // Whitelisted users bypass account
            // protection but still receive the DM.
            if (
                isWhitelisted(
                    member
                )
            ) {
                console.log(
                    `[WHITELIST] ${member.user.tag} bypassed new-account protection.`
                );

                await scheduleWelcomeDm(
                    member
                );

                return;
            }

            // Accounts under 24 hours old are kicked,
            // so they do not receive a welcome DM.
            if (
                config.kickNewAccounts &&
                isSuspiciousAccount(
                    member
                )
            ) {
                await kickMember(
                    member,
                    "Guardian Anti-Raid: account is less than 24 hours old."
                );

                return;
            }

            await scheduleWelcomeDm(
                member
            );

            const recentJoins =
                recordJoin(
                    member.guild,
                    member.id
                );

            const raidWindow =
                config.raidTimeWindow ??
                10;

            const raidThreshold =
                config.raidJoinThreshold ??
                8;

            console.log(
                `[JOIN RATE] ${recentJoins} join(s) / ${raidWindow} seconds`
            );

            if (
                recentJoins <
                    raidThreshold ||
                isLockedDown(
                    member.guild
                )
            ) {
                return;
            }

            const reason =
                `${recentJoins} members joined within ${raidWindow} seconds`;

            const activated =
                await lockdown(
                    member.guild,
                    reason
                );

            if (!activated) {
                return;
            }

            const logChannel =
                member.guild
                    .channels
                    .cache
                    .find(
                        channel =>
                            channel.name ===
                                "raid-logs" &&
                            (
                                channel.type ===
                                    ChannelType.GuildText ||
                                channel.type ===
                                    ChannelType.GuildAnnouncement
                            )
                    );

            if (
                !logChannel ||
                typeof logChannel.send !==
                    "function"
            ) {
                return;
            }

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🚨 RAID DETECTED"
                    )
                    .setDescription(
                        "Guardian detected a rapid increase in member joins."
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
                                `${recentJoins} joins / ${raidWindow} seconds`
                        },
                        {
                            name:
                                "Action",

                            value:
                                "🔒 Server lockdown activated"
                        }
                    )
                    .setTimestamp();

            await logChannel.send({
                embeds: [
                    embed
                ]
            });

        } catch (error) {
            console.error(
                "❌ Member join handler error:",
                error
            );
        }
    }
);

// ========================================
// MEMBER LEAVE TIMER CLEANUP
// ========================================

client.on(
    "guildMemberRemove",
    member => {
        const timerKey =
            getWelcomeTimerKey(
                member.guild.id,
                member.id
            );

        const timer =
            welcomeDmTimers.get(
                timerKey
            );

        if (timer) {
            clearTimeout(
                timer
            );
        }

        welcomeDmTimers.delete(
            timerKey
        );
    }
);

// ========================================
// AUTOMATIC CATEGORY MESSAGES
// ========================================

client.on(
    "channelCreate",
    async createdChannel => {
        try {
            if (
                !databaseReady ||
                !createdChannel?.guild ||
                !createdChannel.id
            ) {
                return;
            }

            // Wait for Discord to finish creating
            // the channel and applying permissions.
            await wait(
                1000
            );

            const channel =
                await createdChannel.guild
                    .channels
                    .fetch(
                        createdChannel.id
                    )
                    .catch(
                        () => null
                    );

            if (
                !channel ||
                !channel.parentId ||
                !channel.isTextBased?.() ||
                typeof channel.send !==
                    "function"
            ) {
                return;
            }

            const savedMessage =
                await getAutoCategoryMessage(
                    channel.guild,
                    channel.parentId
                );

            if (!savedMessage) {
                console.log(
                    `[AUTO MESSAGE] No message configured for category ${channel.parentId} in ${channel.guild.name}.`
                );

                return;
            }

            await channel.send({
                content:
                    savedMessage,

                allowedMentions: {
                    parse: []
                }
            });

            console.log(
                `[AUTO MESSAGE] ✅ Sent in #${channel.name} (${channel.guild.name})`
            );

        } catch (error) {
            console.error(
                "❌ Automatic category message error:",
                error
            );

            console.error(
                "Guardian needs View Channel and Send Messages permissions in the new channel."
            );
        }
    }
);

// ========================================
// BLOCKED-WORD MODERATION
// ========================================

async function checkBlockedWordMessage(
    message,
    source = "new message"
) {
    try {
        if (
            !databaseReady ||
            !message?.guild ||
            !message?.author ||
            message.author.bot ||
            !message.content
        ) {
            return false;
        }

        const blockedWord =
            await database.findBlockedWord(
                message.guild,
                message.content
            );

        if (!blockedWord) {
            return false;
        }

        if (message.deletable) {
            await message
                .delete()
                .catch(
                    error => {
                        console.error(
                            "❌ Could not delete blocked-word message:",
                            error
                        );
                    }
                );
        }

        const member =
            message.member ??
            await message.guild
                .members
                .fetch(
                    message.author.id
                );

        if (
            member.id ===
                message.guild.ownerId ||
            !member.moderatable
        ) {
            return false;
        }

        const duration =
            config.wordTimeoutDuration ??
            24 * 60 * 60 * 1000;

        await member.timeout(
            duration,
            `Guardian: triggered blocked word "${blockedWord}" (${source})`
        );

        console.log(
            `[WORD FILTER] Timed out ${message.author.tag}; matched "${blockedWord}".`
        );

        return true;

    } catch (error) {
        console.error(
            "❌ Blocked-word moderation error:",
            error
        );

        return false;
    }
}

// ========================================
// NEW MESSAGE HANDLER
// ========================================

client.on(
    "messageCreate",
    async message => {
        try {
            if (
                !databaseReady ||
                !message?.guild ||
                !message?.author ||
                message.author.bot ||
                message.webhookId
            ) {
                return;
            }

            // ====================================
            // BAN-TRIGGER CHANNEL
            // ====================================

            const banChannelId =
                await getBanTriggerChannel(
                    message.guild
                );

            if (
                banChannelId &&
                message.channelId ===
                    banChannelId
            ) {
                const member =
                    message.member ??
                    await message.guild
                        .members
                        .fetch(
                            message.author.id
                        );

                if (
                    member.id ===
                        message.guild.ownerId ||
                    member.permissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return;
                }

                if (!member.bannable) {
                    console.warn(
                        `[BAN CHANNEL] Cannot ban ${message.author.tag}. Check role order and Ban Members permission.`
                    );

                    return;
                }

                await member.ban({
                    deleteMessageSeconds:
                        config.banDeleteMessageSeconds ??
                        3 * 60 * 60,

                    reason:
                        `Guardian: sent a message in ban-trigger channel #${message.channel.name}`
                });

                console.log(
                    `[BAN CHANNEL] Banned ${message.author.tag}`
                );

                return;
            }

            // ====================================
            // IMAGE-SPAM PROTECTION
            // ====================================

            const imageSpamDetected =
                await checkImageSpam(
                    message
                );

            if (imageSpamDetected) {
                return;
            }

            // ====================================
            // BLOCKED-WORD FILTER
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
// EDITED MESSAGE FILTER
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

            if (newMessage.partial) {
                newMessage =
                    await newMessage.fetch();
            }

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
// MODAL SUBMISSION HANDLER
// ========================================

async function handleModal(
    interaction
) {
    // ====================================
    // WELCOME DM MODAL
    // ====================================

    if (
        interaction.customId ===
        "welcome-dm-set"
    ) {
        if (
            !interaction.guild ||
            !databaseReady
        ) {
            await safeReply(
                interaction,
                "❌ Guardian or PostgreSQL is not ready."
            );

            return true;
        }

        if (
            !isAdministrator(
                interaction
            )
        ) {
            await safeReply(
                interaction,
                "❌ Only server administrators can configure the welcome DM."
            );

            return true;
        }

        const message =
            interaction.fields
                .getTextInputValue(
                    "welcome-message"
                )
                .trim();

        const imageUrl =
            interaction.fields
                .getTextInputValue(
                    "welcome-image-url"
                )
                .trim();

        const maximumMessageLength =
            config.welcomeDmMaxLength ??
            2000;

        const maximumUrlLength =
            config.welcomeDmImageUrlMaxLength ??
            2048;

        if (
            !message ||
            message.length >
                maximumMessageLength ||
            imageUrl.length >
                maximumUrlLength
        ) {
            await safeReply(
                interaction,
                "❌ The welcome message or image URL is invalid."
            );

            return true;
        }

        if (imageUrl) {
            try {
                const parsedUrl =
                    new URL(
                        imageUrl
                    );

                if (
                    parsedUrl.protocol !==
                        "https:" &&
                    parsedUrl.protocol !==
                        "http:"
                ) {
                    throw new Error(
                        "Invalid URL protocol"
                    );
                }

            } catch {
                await safeReply(
                    interaction,
                    "❌ The image must use a valid http:// or https:// URL."
                );

                return true;
            }
        }

        const saved =
            await setWelcomeDm(
                interaction.guild,
                message,
                imageUrl || null
            );

        await safeReply(
            interaction,
            saved
                ? "✅ The one-minute welcome DM was saved."
                : "❌ Could not save the welcome DM."
        );

        return true;
    }

    // ====================================
    // CATEGORY AUTOMESSAGE MODAL
    // ====================================

    if (
        !interaction.customId
            .startsWith(
                "automessage-set:"
            )
    ) {
        return false;
    }

    if (
        !interaction.guild ||
        !databaseReady
    ) {
        await safeReply(
            interaction,
            "❌ Guardian or PostgreSQL is not ready."
        );

        return true;
    }

    if (
        !await guardianAccessAllowed(
            interaction
        )
    ) {
        await safeReply(
            interaction,
            "❌ You are not authorized to use Guardian Anti-Raid."
        );

        return true;
    }

    const categoryId =
        interaction.customId.slice(
            "automessage-set:".length
        );

    const category =
        interaction.guild
            .channels
            .cache
            .get(
                categoryId
            );

    if (
        !category ||
        category.type !==
            ChannelType.GuildCategory
    ) {
        await safeReply(
            interaction,
            "❌ That category no longer exists."
        );

        return true;
    }

    const message =
        interaction.fields
            .getTextInputValue(
                "message"
            )
            .trim();

    const maximum =
        config.autoMessageMaxLength ??
        2000;

    if (
        !message ||
        message.length > maximum
    ) {
        await safeReply(
            interaction,
            `❌ Message must contain 1-${maximum} characters.`
        );

        return true;
    }

    const saved =
        await setAutoCategoryMessage(
            interaction.guild,
            categoryId,
            message
        );

    await safeReply(
        interaction,
        saved
            ? `✅ Automatic message saved for **${category.name}**.`
            : "❌ Could not save the automatic category message."
    );

    return true;
}

// ========================================
// ADMINISTRATOR COMMANDS
// ========================================

async function handleAdminCommand(
    interaction,
    command
) {
    if (
        command ===
        "welcome-dm-remove"
    ) {
        const removed =
            await removeWelcomeDm(
                interaction.guild
            );

        await safeReply(
            interaction,
            removed
                ? "✅ The new-member welcome DM was disabled."
                : "⚠️ No welcome DM was configured."
        );

        return true;
    }

    if (
        command ===
        "welcome-dm-status"
    ) {
        const setting =
            await getWelcomeDm(
                interaction.guild
            );

        if (!setting) {
            await safeReply(
                interaction,
                "📭 No new-member welcome DM is configured."
            );

            return true;
        }

        const delaySeconds =
            Math.round(
                (
                    config.welcomeDmDelay ??
                    60000
                ) / 1000
            );

        const output =
            "💌 **WELCOME DM ACTIVE**\n\n" +
            `**Delay:** ${delaySeconds} seconds\n` +
            `**Message:**\n${setting.message}\n\n` +
            `**Image:** ${
                setting.imageUrl ??
                "None"
            }`;

        await safeReply(
            interaction,
            truncate(output)
        );

        return true;
    }

    if (
        command === "authorize" ||
        command === "unauthorize"
    ) {
        const user =
            interaction.options
                .getUser(
                    "user"
                );

        if (
            !user ||
            user.bot
        ) {
            await safeReply(
                interaction,
                "❌ Please select a non-bot user."
            );

            return true;
        }

        const success =
            command === "authorize"
                ? await authorizeUser(
                    interaction.guild,
                    user.id
                )
                : await unauthorizeUser(
                    interaction.guild,
                    user.id
                );

        await safeReply(
            interaction,
            success
                ? command === "authorize"
                    ? `✅ ${user} is now authorized to use Guardian.`
                    : `🚫 ${user} is now explicitly unauthorized.`
                : "❌ The authorization setting could not be changed."
        );

        return true;
    }

    if (
        command === "authorize-role" ||
        command === "unauthorize-role"
    ) {
        const role =
            interaction.options
                .getRole(
                    "role"
                );

        if (
            !role ||
            role.id ===
                interaction.guild.id
        ) {
            await safeReply(
                interaction,
                "❌ Select a role other than @everyone."
            );

            return true;
        }

        const success =
            command === "authorize-role"
                ? await authorizeRole(
                    interaction.guild,
                    role.id
                )
                : await unauthorizeRole(
                    interaction.guild,
                    role.id
                );

        await safeReply(
            interaction,
            success
                ? command === "authorize-role"
                    ? `✅ ${role} is now authorized to use Guardian.`
                    : `🚫 ${role} is now explicitly unauthorized.`
                : "❌ The role authorization setting could not be changed."
        );

        return true;
    }

    if (
        command === "authorized-list" ||
        command === "unauthorized-list"
    ) {
        const denied =
            command ===
            "unauthorized-list";

        const users =
            denied
                ? await getUnauthorizedUsers(
                    interaction.guild
                )
                : await getAuthorizedUsers(
                    interaction.guild
                );

        const roles =
            denied
                ? await getUnauthorizedRoles(
                    interaction.guild
                )
                : await getAuthorizedRoles(
                    interaction.guild
                );

        const heading =
            denied
                ? "🚫 **UNAUTHORIZED GUARDIAN ACCESS**"
                : "🛡️ **AUTHORIZED GUARDIAN ACCESS**";

        const output =
            `${heading}\n\n` +
            `**Users:**\n${
                users.length
                    ? users
                        .map(
                            id =>
                                `• <@${id}>`
                        )
                        .join("\n")
                    : "• None"
            }\n\n` +
            `**Roles:**\n${
                roles.length
                    ? roles
                        .map(
                            id =>
                                `• <@&${id}>`
                        )
                        .join("\n")
                    : "• None"
            }`;

        await safeReply(
            interaction,
            truncate(output)
        );

        return true;
    }

    if (
        command ===
        "ban-channel-set"
    ) {
        const channel =
            interaction.options
                .getChannel(
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

            return true;
        }

        const saved =
            await setBanTriggerChannel(
                interaction.guild,
                channel.id
            );

        await safeReply(
            interaction,
            saved
                ? `✅ Ban-trigger channel set to ${channel}. Non-admin users who post there will be banned.`
                : "❌ Could not save the ban-trigger channel."
        );

        return true;
    }

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

        return true;
    }

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

            return true;
        }

        const channel =
            interaction.guild
                .channels
                .cache
                .get(
                    channelId
                ) ??
            await interaction.guild
                .channels
                .fetch(
                    channelId
                )
                .catch(
                    () => null
                );

        await safeReply(
            interaction,
            channel
                ? `🚨 Ban-trigger channel: ${channel}`
                : `⚠️ The saved channel no longer exists (ID: ${channelId}). Use /ban-channel-remove.`
        );

        return true;
    }

    return false;
}

// ========================================
// AUTHORIZED GUARDIAN COMMANDS
// ========================================

async function handleGuardianCommand(
    interaction,
    command
) {
    if (
        command ===
        "lockdown"
    ) {
        const changed =
            await lockdown(
                interaction.guild,
                `Manual lockdown by ${interaction.user.tag}`
            );

        await safeReply(
            interaction,
            changed
                ? "🔒 **SERVER LOCKDOWN ACTIVATED**"
                : "⚠️ Server lockdown is already active."
        );

        return true;
    }

    if (
        command ===
        "unlock"
    ) {
        const changed =
            await unlock(
                interaction.guild
            );

        await safeReply(
            interaction,
            changed
                ? "🔓 **SERVER LOCKDOWN REMOVED**"
                : "🟢 Server was not locked down."
        );

        return true;
    }

    if (
        command ===
        "raidstatus"
    ) {
        await safeReply(
            interaction,
            isLockedDown(
                interaction.guild
            )
                ? "🚨 **RAID LOCKDOWN ACTIVE**"
                : "🟢 **NO RAID LOCKDOWN ACTIVE**"
        );

        return true;
    }

    if (
        command === "word-add" ||
        command === "word-remove"
    ) {
        const word =
            interaction.options
                .getString(
                    "word"
                )
                ?.trim()
                .toLowerCase();

        if (
            !word ||
            word.length >
                (
                    config.blockedWordMaxLength ??
                    100
                ) ||
            /[\r\n]/.test(word)
        ) {
            await safeReply(
                interaction,
                "❌ Enter a valid blocked word."
            );

            return true;
        }

        const changed =
            command === "word-add"
                ? await addBlockedWord(
                    interaction.guild,
                    word
                )
                : await removeBlockedWord(
                    interaction.guild,
                    word
                );

        await safeReply(
            interaction,
            changed
                ? command === "word-add"
                    ? `✅ **${word}** was added to the blocked-word database.`
                    : `✅ **${word}** was removed from the blocked-word database.`
                : command === "word-add"
                    ? `⚠️ **${word}** is already blocked or could not be added.`
                    : `⚠️ **${word}** was not found.`
        );

        return true;
    }

    if (
        command ===
        "word-list"
    ) {
        const words =
            await getBlockedWords(
                interaction.guild
            );

        const output =
            words.length
                ? `🚫 **BLOCKED WORDS**\n\n${
                    words
                        .map(
                            word =>
                                `• ${word}`
                        )
                        .join("\n")
                }`
                : "📋 No blocked words are configured.";

        await safeReply(
            interaction,
            truncate(output)
        );

        return true;
    }

    if (
        command ===
        "automessage-remove"
    ) {
        const category =
            interaction.options
                .getChannel(
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

            return true;
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

        return true;
    }

    if (
        command ===
        "automessage-list"
    ) {
        const items =
            await getAutoCategoryMessages(
                interaction.guild
            );

        if (!items.length) {
            await safeReply(
                interaction,
                "📋 No automatic category messages are configured."
            );

            return true;
        }

        let output =
            "📨 **AUTOMATIC CATEGORY MESSAGES**\n\n";

        for (const item of items) {
            const categoryId =
                item.category_id ??
                item.categoryId;

            const category =
                interaction.guild
                    .channels
                    .cache
                    .get(
                        categoryId
                    );

            const categoryName =
                category?.name ??
                `Deleted category (${categoryId})`;

            const message =
                item.message ??
                "(empty message)";

            const section =
                `📁 **${categoryName}**\n` +
                `💬 ${message}\n\n`;

            if (
                output.length +
                    section.length >
                1850
            ) {
                output +=
                    "...more configurations exist.";

                break;
            }

            output += section;
        }

        await safeReply(
            interaction,
            output
        );

        return true;
    }

    return false;
}

// ========================================
// INTERACTION HANDLER
// ========================================

client.on(
    "interactionCreate",
    async interaction => {
        try {
            if (
                interaction.isModalSubmit()
            ) {
                await handleModal(
                    interaction
                );

                return;
            }

            if (
                !interaction.isChatInputCommand()
            ) {
                return;
            }

            if (!interaction.guild) {
                await safeReply(
                    interaction,
                    "❌ Guardian commands can only be used inside a server."
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

            const command =
                interaction.commandName;

            // ====================================
            // CATEGORY AUTOMESSAGE MODAL
            // ====================================

            if (
                command ===
                "automessage-set"
            ) {
                if (
                    !await guardianAccessAllowed(
                        interaction
                    )
                ) {
                    await safeReply(
                        interaction,
                        "❌ You are not authorized to use Guardian Anti-Raid."
                    );

                    return;
                }

                const category =
                    interaction.options
                        .getChannel(
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
                        .setRequired(true)
                        .setMaxLength(
                            config.autoMessageMaxLength ??
                            2000
                        )
                        .setPlaceholder(
                            "Enter the automatic message..."
                        );

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `automessage-set:${category.id}`
                        )
                        .setTitle(
                            "Set Automatic Message"
                        )
                        .addComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    messageInput
                                )
                        );

                await interaction.showModal(
                    modal
                );

                return;
            }

            // ====================================
            // WELCOME DM MODAL
            // ====================================

            if (
                command ===
                "welcome-dm-set"
            ) {
                if (
                    !isAdministrator(
                        interaction
                    )
                ) {
                    await safeReply(
                        interaction,
                        "❌ Only server administrators can configure the welcome DM."
                    );

                    return;
                }

                const messageInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "welcome-message"
                        )
                        .setLabel(
                            "Welcome message"
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(
                            config.welcomeDmMaxLength ??
                            2000
                        )
                        .setPlaceholder(
                            "Welcome! Please read our rules..."
                        );

                const imageInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "welcome-image-url"
                        )
                        .setLabel(
                            "Image URL (optional)"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(false)
                        .setMaxLength(
                            config.welcomeDmImageUrlMaxLength ??
                            2048
                        )
                        .setPlaceholder(
                            "https://example.com/welcome.png"
                        );

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            "welcome-dm-set"
                        )
                        .setTitle(
                            "Set New-Member Welcome DM"
                        )
                        .addComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    messageInput
                                ),

                            new ActionRowBuilder()
                                .addComponents(
                                    imageInput
                                )
                        );

                await interaction.showModal(
                    modal
                );

                return;
            }

            if (
                !await deferInteraction(
                    interaction
                )
            ) {
                return;
            }

            // ====================================
            // ADMIN-ONLY COMMANDS
            // ====================================

            const adminOnlyCommands =
                new Set([
                    "authorize",
                    "unauthorize",
                    "authorize-role",
                    "unauthorize-role",
                    "authorized-list",
                    "unauthorized-list",
                    "ban-channel-set",
                    "ban-channel-remove",
                    "ban-channel-status",
                    "welcome-dm-remove",
                    "welcome-dm-status"
                ]);

            if (
                adminOnlyCommands.has(
                    command
                )
            ) {
                if (
                    !isAdministrator(
                        interaction
                    )
                ) {
                    await safeReply(
                        interaction,
                        "❌ Administrator Only: only server administrators can use this command."
                    );

                    return;
                }

                const handled =
                    await handleAdminCommand(
                        interaction,
                        command
                    );

                if (handled) {
                    return;
                }

            } else {
                const allowed =
                    await guardianAccessAllowed(
                        interaction
                    );

                if (!allowed) {
                    await safeReply(
                        interaction,
                        "❌ You are not authorized to use Guardian Anti-Raid."
                    );

                    return;
                }

                const handled =
                    await handleGuardianCommand(
                        interaction,
                        command
                    );

                if (handled) {
                    return;
                }
            }

            await safeReply(
                interaction,
                `❌ Guardian does not have a handler for /${command}.`
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
// ERROR HANDLERS
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

process.on(
    "unhandledRejection",
    reason => {
        console.error(
            "❌ Unhandled promise rejection:",
            reason
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

        shutdown(
            "uncaughtException",
            1
        );
    }
);

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

async function shutdown(
    signal,
    exitCode = 0
) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `⚠️ Received ${signal}. Shutting down Guardian...`
    );

    try {
        for (
            const timer of
            welcomeDmTimers.values()
        ) {
            clearTimeout(
                timer
            );
        }

        welcomeDmTimers.clear();

        client.destroy();

        if (
            typeof database.closeDatabase ===
                "function"
        ) {
            await database.closeDatabase();
        }

    } catch (error) {
        console.error(
            "❌ Shutdown error:",
            error
        );

        exitCode = 1;
    }

    process.exit(
        exitCode
    );
}

process.once(
    "SIGINT",
    () => {
        shutdown(
            "SIGINT"
        );
    }
);

process.once(
    "SIGTERM",
    () => {
        shutdown(
            "SIGTERM"
        );
    }
);

// ========================================
// START BOT
// ========================================

async function startBot() {
    try {
        console.log(
            "🗄️ Connecting to PostgreSQL..."
        );

        await database.initDatabase();
        await database.testDatabase();

        databaseReady =
            database.isDatabaseReady();

        if (!databaseReady) {
            throw new Error(
                "PostgreSQL did not report ready."
            );
        }

        console.log(
            "✅ Database ready. Starting Discord bot..."
        );

        await client.login(
            process.env.DISCORD_TOKEN
        );

    } catch (error) {
        databaseReady = false;

        console.error(
            "❌ BOT STARTUP FAILED:",
            error
        );

        process.exit(1);
    }
}

// ========================================
// START GUARDIAN
// ========================================

startBot();
