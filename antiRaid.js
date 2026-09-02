const {
    createHash
} = require("node:crypto");

const {
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const config = require("./config");
const database = require("./database");

// ========================================
// TEMPORARY SERVER STATE
// ========================================

const guildStates = new Map();

// ========================================
// SERVER ID HELPER
// ========================================

// This is not a fixed GUILD_ID environment variable.
// It retrieves the ID of whichever server is using the bot.
function getServerId(guild) {
    if (!guild) {
        return null;
    }

    if (typeof guild === "string") {
        return guild.trim() || null;
    }

    if (typeof guild.id === "string") {
        return guild.id.trim() || null;
    }

    return null;
}

// ========================================
// GET SERVER STATE
// ========================================

function getGuildState(guild) {
    const serverId = getServerId(guild);

    if (!serverId) {
        return null;
    }

    if (!guildStates.has(serverId)) {
        guildStates.set(serverId, {
            joins: [],
            lockdown: false,
            lockdownTimer: null,
            whitelistedUsers: new Set(),
            imageSpam: new Map()
        });
    }

    return guildStates.get(serverId);
}

// ========================================
// JOIN TRACKING
// ========================================

function getRaidWindowMilliseconds() {
    return (
        config.raidTimeWindow ??
        10
    ) * 1000;
}

function removeOldJoins(state) {
    const cutoff =
        Date.now() -
        getRaidWindowMilliseconds();

    state.joins =
        state.joins.filter(
            join =>
                join.timestamp >= cutoff
        );
}

function recordJoin(guild, userId) {
    const state =
        getGuildState(guild);

    if (!state || !userId) {
        return 0;
    }

    state.joins.push({
        userId: String(userId),
        timestamp: Date.now()
    });

    removeOldJoins(state);

    return state.joins.length;
}

function getRecentJoinCount(guild) {
    const state =
        getGuildState(guild);

    if (!state) {
        return 0;
    }

    removeOldJoins(state);

    return state.joins.length;
}

// ========================================
// SUSPICIOUS ACCOUNT AGE
// ========================================

function isSuspiciousAccount(member) {
    if (
        !member?.user ||
        typeof member.user.createdTimestamp !==
            "number"
    ) {
        return false;
    }

    const accountAge =
        Date.now() -
        member.user.createdTimestamp;

    const suspiciousAge =
        config.suspiciousAccountAge ??
        24 * 60 * 60 * 1000;

    return accountAge < suspiciousAge;
}

// ========================================
// WHITELIST
// ========================================

function isWhitelisted(member) {
    if (
        !member?.guild ||
        !member?.id
    ) {
        return false;
    }

    const state =
        getGuildState(member.guild);

    if (!state) {
        return false;
    }

    return state
        .whitelistedUsers
        .has(member.id);
}

function whitelistUser(guild, userId) {
    const state =
        getGuildState(guild);

    if (!state || !userId) {
        return false;
    }

    state.whitelistedUsers.add(
        String(userId)
    );

    return true;
}

function removeWhitelist(guild, userId) {
    const state =
        getGuildState(guild);

    if (!state || !userId) {
        return false;
    }

    return state
        .whitelistedUsers
        .delete(String(userId));
}

// ========================================
// KICK MEMBER
// ========================================

async function kickMember(
    member,
    reason = "Guardian Anti-Raid protection"
) {
    try {
        if (!member?.kickable) {
            console.warn(
                `[KICK FAILED] Cannot kick ${
                    member?.user?.tag ??
                    member?.id ??
                    "Unknown user"
                }`
            );

            return false;
        }

        await member.kick(reason);

        console.log(
            `[KICKED] ${
                member.user?.tag ??
                member.id
            }`
        );

        return true;

    } catch (error) {
        console.error(
            `[KICK ERROR] ${
                member?.user?.tag ??
                member?.id ??
                "Unknown user"
            }:`,
            error
        );

        return false;
    }
}

// ========================================
// LOCKABLE CHANNEL CHECK
// ========================================

function isLockableChannel(channel) {
    return (
        channel?.type ===
            ChannelType.GuildText ||
        channel?.type ===
            ChannelType.GuildAnnouncement
    );
}

// ========================================
// LOCKDOWN
// ========================================

async function lockdown(
    guild,
    reason = "Raid detected"
) {
    if (
        !guild?.channels?.cache ||
        !guild?.roles?.everyone
    ) {
        return false;
    }

    const state =
        getGuildState(guild);

    if (
        !state ||
        state.lockdown
    ) {
        return false;
    }

    state.lockdown = true;

    let changedChannels = 0;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        if (
            !isLockableChannel(channel) ||
            !channel.permissionOverwrites?.edit
        ) {
            continue;
        }

        try {
            await channel
                .permissionOverwrites
                .edit(
                    guild.roles.everyone,
                    {
                        SendMessages: false
                    },
                    {
                        reason:
                            `Guardian Anti-Raid: ${reason}`
                    }
                );

            changedChannels++;

        } catch (error) {
            console.error(
                `[LOCKDOWN ERROR] ${
                    channel.name ??
                    channel.id
                }:`,
                error
            );
        }
    }

    console.log(
        `[LOCKDOWN] ${guild.name}: ` +
        `${changedChannels} channel(s) updated. ` +
        `Reason: ${reason}`
    );

    if (state.lockdownTimer) {
        clearTimeout(
            state.lockdownTimer
        );
    }

    const duration =
        config.lockdownDuration ??
        5 * 60 * 1000;

    state.lockdownTimer =
        setTimeout(
            () => {
                unlock(guild)
                    .catch(
                        error => {
                            console.error(
                                "Automatic unlock error:",
                                error
                            );
                        }
                    );
            },
            duration
        );

    return true;
}

// ========================================
// UNLOCK
// ========================================

async function unlock(guild) {
    if (
        !guild?.channels?.cache ||
        !guild?.roles?.everyone
    ) {
        return false;
    }

    const state =
        getGuildState(guild);

    if (
        !state ||
        !state.lockdown
    ) {
        return false;
    }

    if (state.lockdownTimer) {
        clearTimeout(
            state.lockdownTimer
        );

        state.lockdownTimer = null;
    }

    let changedChannels = 0;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        if (
            !isLockableChannel(channel) ||
            !channel.permissionOverwrites?.edit
        ) {
            continue;
        }

        try {
            await channel
                .permissionOverwrites
                .edit(
                    guild.roles.everyone,
                    {
                        SendMessages: null
                    },
                    {
                        reason:
                            "Guardian Anti-Raid lockdown ended"
                    }
                );

            changedChannels++;

        } catch (error) {
            console.error(
                `[UNLOCK ERROR] ${
                    channel.name ??
                    channel.id
                }:`,
                error
            );
        }
    }

    state.lockdown = false;

    console.log(
        `[UNLOCK] ${guild.name}: ` +
        `${changedChannels} channel(s) updated.`
    );

    return true;
}

// ========================================
// LOCKDOWN STATUS
// ========================================

function isLockedDown(guild) {
    return (
        getGuildState(guild)
            ?.lockdown === true
    );
}

// ========================================
// BLOCKED WORD CLEANER
// ========================================

function cleanBlockedWord(word) {
    if (typeof word !== "string") {
        return "";
    }

    return word
        .trim()
        .toLowerCase();
}

// ========================================
// BLOCKED WORDS
// ========================================

async function addBlockedWord(
    guild,
    word
) {
    const serverId =
        getServerId(guild);

    const cleanWord =
        cleanBlockedWord(word);

    const maxLength =
        config.blockedWordMaxLength ??
        100;

    if (
        !serverId ||
        !cleanWord ||
        cleanWord.length > maxLength ||
        /[\r\n]/.test(cleanWord)
    ) {
        return false;
    }

    return database.addBlockedWord(
        serverId,
        cleanWord
    );
}

async function removeBlockedWord(
    guild,
    word
) {
    const serverId =
        getServerId(guild);

    const cleanWord =
        cleanBlockedWord(word);

    if (
        !serverId ||
        !cleanWord
    ) {
        return false;
    }

    return database.removeBlockedWord(
        serverId,
        cleanWord
    );
}

async function getBlockedWords(guild) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    const words =
        await database
            .getBlockedWords(serverId);

    if (!Array.isArray(words)) {
        return [];
    }

    return words
        .map(
            word => {
                if (
                    typeof word ===
                        "string"
                ) {
                    return cleanBlockedWord(
                        word
                    );
                }

                return cleanBlockedWord(
                    word?.word
                );
            }
        )
        .filter(Boolean);
}

async function findBlockedWord(
    guild,
    content
) {
    const serverId =
        getServerId(guild);

    if (
        !serverId ||
        typeof content !== "string" ||
        !content
    ) {
        return null;
    }

    return database.findBlockedWord(
        serverId,
        content
    );
}

// ========================================
// USER AUTHORIZATION
// ========================================

async function authorizeUser(
    guild,
    userId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !userId) {
        return false;
    }

    return database.authorizeUser(
        serverId,
        String(userId)
    );
}

async function unauthorizeUser(
    guild,
    userId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !userId) {
        return false;
    }

    return database.unauthorizeUser(
        serverId,
        String(userId)
    );
}

async function isAuthorizedUser(
    guild,
    userId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !userId) {
        return false;
    }

    return database.isAuthorizedUser(
        serverId,
        String(userId)
    );
}

async function isUnauthorizedUser(
    guild,
    userId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !userId) {
        return false;
    }

    return database.isUnauthorizedUser(
        serverId,
        String(userId)
    );
}

async function getAuthorizedUsers(guild) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    return database.getAuthorizedUsers(
        serverId
    );
}

async function getUnauthorizedUsers(guild) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    return database.getUnauthorizedUsers(
        serverId
    );
}

// ========================================
// ROLE AUTHORIZATION
// ========================================

async function authorizeRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !roleId) {
        return false;
    }

    return database.authorizeRole(
        serverId,
        String(roleId)
    );
}

async function unauthorizeRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !roleId) {
        return false;
    }

    return database.unauthorizeRole(
        serverId,
        String(roleId)
    );
}

async function isAuthorizedRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !roleId) {
        return false;
    }

    return database.isAuthorizedRole(
        serverId,
        String(roleId)
    );
}

async function isUnauthorizedRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !roleId) {
        return false;
    }

    return database.isUnauthorizedRole(
        serverId,
        String(roleId)
    );
}

async function getAuthorizedRoles(guild) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    return database.getAuthorizedRoles(
        serverId
    );
}

async function getUnauthorizedRoles(guild) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    return database.getUnauthorizedRoles(
        serverId
    );
}

// ========================================
// GUARDIAN ACCESS CONTROL
// ========================================

async function canUseGuardian(member) {
    if (
        !member?.guild ||
        !member?.id
    ) {
        return false;
    }

    const guild =
        member.guild;

    const serverId =
        getServerId(guild);

    if (!serverId) {
        return false;
    }

    // Server administrators are always allowed.
    if (
        member.permissions?.has(
            PermissionFlagsBits.Administrator
        )
    ) {
        return true;
    }

    // Explicit user denial takes priority.
    if (
        await isUnauthorizedUser(
            guild,
            member.id
        )
    ) {
        return false;
    }

    const roles =
        member.roles?.cache?.values
            ? [
                ...member.roles
                    .cache
                    .values()
            ]
            : [];

    // Explicit role denial takes priority.
    for (const role of roles) {
        // The @everyone role ID equals
        // the current server ID.
        if (role.id === serverId) {
            continue;
        }

        if (
            await isUnauthorizedRole(
                guild,
                role.id
            )
        ) {
            return false;
        }
    }

    // Explicit user authorization.
    if (
        await isAuthorizedUser(
            guild,
            member.id
        )
    ) {
        return true;
    }

    // Authorized role.
    for (const role of roles) {
        if (role.id === serverId) {
            continue;
        }

        if (
            await isAuthorizedRole(
                guild,
                role.id
            )
        ) {
            return true;
        }
    }

    return false;
}

// ========================================
// AUTO CATEGORY MESSAGES
// ========================================

async function setAutoCategoryMessage(
    guild,
    categoryId,
    message
) {
    const serverId =
        getServerId(guild);

    const cleanMessage =
        typeof message === "string"
            ? message.trim()
            : "";

    const maxLength =
        config.autoMessageMaxLength ??
        2000;

    if (
        !serverId ||
        !categoryId ||
        !cleanMessage ||
        cleanMessage.length > maxLength
    ) {
        return false;
    }

    return database
        .setAutoCategoryMessage(
            serverId,
            String(categoryId),
            cleanMessage
        );
}

async function removeAutoCategoryMessage(
    guild,
    categoryId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !categoryId) {
        return false;
    }

    return database
        .removeAutoCategoryMessage(
            serverId,
            String(categoryId)
        );
}

async function getAutoCategoryMessage(
    guild,
    categoryId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !categoryId) {
        return null;
    }

    return database
        .getAutoCategoryMessage(
            serverId,
            String(categoryId)
        );
}

async function getAutoCategoryMessages(
    guild
) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return [];
    }

    const result =
        await database
            .getAutoCategoryMessages(
                serverId
            );

    return Array.isArray(result)
        ? result
        : [];
}

// ========================================
// BAN TRIGGER CHANNEL
// ========================================

async function setBanTriggerChannel(
    guild,
    channelId
) {
    const serverId =
        getServerId(guild);

    if (!serverId || !channelId) {
        return false;
    }

    return database
        .setBanTriggerChannel(
            serverId,
            String(channelId)
        );
}

async function removeBanTriggerChannel(
    guild
) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return false;
    }

    return database
        .removeBanTriggerChannel(
            serverId
        );
}

async function getBanTriggerChannel(
    guild
) {
    const serverId =
        getServerId(guild);

    if (!serverId) {
        return null;
    }

    return database
        .getBanTriggerChannel(
            serverId
        );
}

// ========================================
// IMAGE ATTACHMENT CHECK
// ========================================

function isImageAttachment(
    attachment
) {
    if (!attachment) {
        return false;
    }

    if (
        typeof attachment.contentType ===
            "string" &&
        attachment.contentType
            .toLowerCase()
            .startsWith("image/")
    ) {
        return true;
    }

    const fileName =
        String(
            attachment.name ??
            ""
        ).toLowerCase();

    return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i
        .test(fileName);
}

// ========================================
// CREATE IMAGE HASH
// ========================================

async function createImageHash(
    attachment
) {
    if (
        !attachment?.url ||
        !isImageAttachment(attachment)
    ) {
        return null;
    }

    const maximumSize =
        config.imageSpamMaxFileSize ??
        10 * 1024 * 1024;

    if (
        typeof attachment.size ===
            "number" &&
        attachment.size > maximumSize
    ) {
        return null;
    }

    try {
        const response =
            await fetch(
                attachment.url
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const arrayBuffer =
            await response.arrayBuffer();

        if (
            arrayBuffer.byteLength >
            maximumSize
        ) {
            return null;
        }

        return createHash("sha256")
            .update(
                Buffer.from(
                    arrayBuffer
                )
            )
            .digest("hex");

    } catch (error) {
        console.error(
            `[IMAGE HASH ERROR] ${
                attachment.name ??
                attachment.id ??
                "Unknown attachment"
            }:`,
            error
        );

        return null;
    }
}

// ========================================
// DELETE IMAGE-SPAM MESSAGES
// ========================================

async function deleteSpamMessages(
    messages
) {
    const deletionTasks =
        [
            ...messages.values()
        ].map(
            async message => {
                try {
                    if (message?.deletable) {
                        await message.delete();
                    }

                } catch (error) {
                    console.error(
                        `[IMAGE DELETE ERROR] ${
                            message?.id ??
                            "Unknown message"
                        }:`,
                        error
                    );
                }
            }
        );

    await Promise.allSettled(
        deletionTasks
    );
}

// ========================================
// CLEAN IMAGE-SPAM HISTORY
// ========================================

function cleanImageSpamHistory(
    state,
    cutoff
) {
    for (
        const [
            key,
            record
        ] of state.imageSpam
    ) {
        if (
            record.timestamp <
            cutoff
        ) {
            state.imageSpam.delete(
                key
            );
        }
    }
}

// ========================================
// CHECK IMAGE SPAM
// ========================================

async function checkImageSpam(message) {
    if (
        !message?.guild ||
        !message?.member ||
        !message?.author ||
        message.author.bot ||
        message.webhookId ||
        !message.attachments?.size
    ) {
        return false;
    }

    const state =
        getGuildState(
            message.guild
        );

    if (!state) {
        return false;
    }

    const timeWindow =
        config.imageSpamTimeWindow ??
        10 * 1000;

    const now =
        Date.now();

    cleanImageSpamHistory(
        state,
        now - timeWindow
    );

    for (
        const attachment of
        message.attachments.values()
    ) {
        const imageHash =
            await createImageHash(
                attachment
            );

        if (!imageHash) {
            continue;
        }

        const trackingKey =
            `${message.author.id}:${imageHash}`;

        const previous =
            state.imageSpam.get(
                trackingKey
            );

        if (
            previous &&
            now - previous.timestamp <=
                timeWindow &&
            previous.channelId !==
                message.channelId
        ) {
            const spamMessages =
                new Map(
                    previous.messages
                );

            spamMessages.set(
                message.id,
                message
            );

            state.imageSpam.delete(
                trackingKey
            );

            await deleteSpamMessages(
                spamMessages
            );

            await kickMember(
                message.member,
                "Posted the same image in different channels within 10 seconds"
            );

            console.log(
                `[IMAGE SPAM] ${
                    message.author.tag
                } detected in ${
                    message.guild.name
                }.`
            );

            return true;
        }

        if (previous) {
            previous.timestamp =
                now;

            previous.channelId =
                message.channelId;

            previous.messages.set(
                message.id,
                message
            );

        } else {
            state.imageSpam.set(
                trackingKey,
                {
                    timestamp:
                        now,

                    channelId:
                        message.channelId,

                    messages:
                        new Map([
                            [
                                message.id,
                                message
                            ]
                        ])
                }
            );
        }
    }

    return false;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    // SERVER HELPERS
    getServerId,

    // RAID AND JOIN PROTECTION
    recordJoin,
    getRecentJoinCount,
    isSuspiciousAccount,

    // WHITELIST
    isWhitelisted,
    whitelistUser,
    removeWhitelist,

    // MODERATION
    kickMember,

    // LOCKDOWN
    lockdown,
    unlock,
    isLockedDown,

    // BLOCKED WORDS
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    // USER AUTHORIZATION
    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    isUnauthorizedUser,
    getAuthorizedUsers,
    getUnauthorizedUsers,

    // ROLE AUTHORIZATION
    authorizeRole,
    unauthorizeRole,
    isAuthorizedRole,
    isUnauthorizedRole,
    getAuthorizedRoles,
    getUnauthorizedRoles,

    // GUARDIAN ACCESS
    canUseGuardian,

    // AUTO CATEGORY MESSAGES
    setAutoCategoryMessage,
    removeAutoCategoryMessage,
    getAutoCategoryMessage,
    getAutoCategoryMessages,

    // BAN TRIGGER CHANNEL
    setBanTriggerChannel,
    removeBanTriggerChannel,
    getBanTriggerChannel,

    // IMAGE-SPAM PROTECTION
    checkImageSpam
};
