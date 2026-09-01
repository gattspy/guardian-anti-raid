const {
    ChannelType
} = require("discord.js");

const config =
    require("./config");

const database =
    require("./database");

// ========================================
// SERVER STATE
// ========================================

const guildStates =
    new Map();

// ========================================
// SERVER ID HELPER
// ========================================

function getServerId(
    guild
) {
    if (!guild) {
        return null;
    }

    if (
        typeof guild ===
        "string"
    ) {
        return guild.trim() ||
            null;
    }

    if (
        typeof guild.id ===
        "string"
    ) {
        return guild.id.trim() ||
            null;
    }

    return null;
}

// ========================================
// GET SERVER STATE
// ========================================

function getGuildState(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return null;
    }

    if (
        !guildStates.has(
            serverId
        )
    ) {
        guildStates.set(
            serverId,
            {
                joins:
                    [],

                lockdown:
                    false,

                lockdownTimer:
                    null,

                whitelistedUsers:
                    new Set()
            }
        );
    }

    return guildStates.get(
        serverId
    );
}

// ========================================
// JOIN TRACKING
// ========================================

function recordJoin(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return 0;
    }

    const state =
        getGuildState(
            serverId
        );

    if (!state) {
        return 0;
    }

    const now =
        Date.now();

    state.joins.push({
        userId:
            String(userId),

        timestamp:
            now
    });

    const windowMilliseconds =
        (
            config.raidTimeWindow ??
            10
        ) * 1000;

    state.joins =
        state.joins.filter(
            join =>
                now -
                    join.timestamp <=
                windowMilliseconds
        );

    return state.joins.length;
}

// ========================================
// RECENT JOIN COUNT
// ========================================

function getRecentJoinCount(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return 0;
    }

    const state =
        getGuildState(
            serverId
        );

    if (!state) {
        return 0;
    }

    const now =
        Date.now();

    const windowMilliseconds =
        (
            config.raidTimeWindow ??
            10
        ) * 1000;

    state.joins =
        state.joins.filter(
            join =>
                now -
                    join.timestamp <=
                windowMilliseconds
        );

    return state.joins.length;
}

// ========================================
// ACCOUNT AGE
// ========================================

function isSuspiciousAccount(
    member
) {
    if (
        !member ||
        !member.user ||
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

    return (
        accountAge <
        suspiciousAge
    );
}

// ========================================
// WHITELIST
// ========================================

function isWhitelisted(
    member
) {
    if (
        !member ||
        !member.guild ||
        !member.id
    ) {
        return false;
    }

    const state =
        getGuildState(
            member.guild
        );

    if (!state) {
        return false;
    }

    return state
        .whitelistedUsers
        .has(
            member.id
        );
}

function whitelistUser(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    const state =
        getGuildState(
            serverId
        );

    if (!state) {
        return false;
    }

    state.whitelistedUsers.add(
        String(userId)
    );

    return true;
}

function removeWhitelist(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    const state =
        getGuildState(
            serverId
        );

    if (!state) {
        return false;
    }

    return state
        .whitelistedUsers
        .delete(
            String(userId)
        );
}

// ========================================
// KICK MEMBER
// ========================================

async function kickMember(
    member,
    reason =
        "Guardian Anti-Raid protection"
) {
    try {
        if (!member) {
            return false;
        }

        if (!member.kickable) {
            console.warn(
                `[KICK FAILED] Cannot kick ${
                    member.user?.tag ??
                    member.id ??
                    "Unknown user"
                }`
            );

            return false;
        }

        await member.kick(
            reason
        );

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
            error.message
        );

        return false;
    }
}

// ========================================
// LOCKDOWN
// ========================================

async function lockdown(
    guild,
    reason =
        "Raid detected"
) {
    if (
        !guild ||
        !guild.id ||
        !guild.channels ||
        !guild.roles
    ) {
        return false;
    }

    const state =
        getGuildState(
            guild
        );

    if (!state) {
        return false;
    }

    if (
        state.lockdown
    ) {
        return false;
    }

    const everyoneRole =
        guild.roles.everyone;

    if (!everyoneRole) {
        console.error(
            `[LOCKDOWN ERROR] Could not find @everyone role in ${guild.name}`
        );

        return false;
    }

    state.lockdown =
        true;

    console.log(
        `[LOCKDOWN] ${guild.name}`
    );

    console.log(
        `[REASON] ${reason}`
    );

    let changedChannels =
        0;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        try {
            if (
                channel.type !==
                    ChannelType.GuildText &&
                channel.type !==
                    ChannelType.GuildAnnouncement
            ) {
                continue;
            }

            if (
                !channel.permissionOverwrites ||
                typeof channel
                    .permissionOverwrites
                    .edit !==
                    "function"
            ) {
                continue;
            }

            await channel
                .permissionOverwrites
                .edit(
                    everyoneRole,
                    {
                        SendMessages:
                            false
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
                error.message
            );
        }
    }

    console.log(
        `[LOCKDOWN] ${changedChannels} channel(s) updated.`
    );

    if (
        state.lockdownTimer
    ) {
        clearTimeout(
            state.lockdownTimer
        );
    }

    const duration =
        config.lockdownDuration ??
        5 * 60 * 1000;

    state.lockdownTimer =
        setTimeout(
            async () => {
                try {
                    await unlock(
                        guild
                    );

                } catch (error) {
                    console.error(
                        "❌ Automatic unlock error:",
                        error
                    );
                }
            },
            duration
        );

    return true;
}

// ========================================
// UNLOCK
// ========================================

async function unlock(
    guild
) {
    if (
        !guild ||
        !guild.id ||
        !guild.channels ||
        !guild.roles
    ) {
        return false;
    }

    const state =
        getGuildState(
            guild
        );

    if (!state) {
        return false;
    }

    if (
        !state.lockdown
    ) {
        return false;
    }

    const everyoneRole =
        guild.roles.everyone;

    if (!everyoneRole) {
        console.error(
            `[UNLOCK ERROR] Could not find @everyone role in ${guild.name}`
        );

        return false;
    }

    if (
        state.lockdownTimer
    ) {
        clearTimeout(
            state.lockdownTimer
        );

        state.lockdownTimer =
            null;
    }

    let changedChannels =
        0;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        try {
            if (
                channel.type !==
                    ChannelType.GuildText &&
                channel.type !==
                    ChannelType.GuildAnnouncement
            ) {
                continue;
            }

            if (
                !channel.permissionOverwrites ||
                typeof channel
                    .permissionOverwrites
                    .edit !==
                    "function"
            ) {
                continue;
            }

            await channel
                .permissionOverwrites
                .edit(
                    everyoneRole,
                    {
                        SendMessages:
                            null
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
                error.message
            );
        }
    }

    state.lockdown =
        false;

    console.log(
        `[UNLOCK] ${guild.name}`
    );

    console.log(
        `[UNLOCK] ${changedChannels} channel(s) updated.`
    );

    return true;
}

// ========================================
// LOCKDOWN STATUS
// ========================================

function isLockedDown(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return false;
    }

    const state =
        getGuildState(
            serverId
        );

    return (
        state?.lockdown ===
        true
    );
}

// ========================================
// BLOCKED WORD CLEANER
// ========================================

function cleanBlockedWord(
    word
) {
    if (
        typeof word !==
        "string"
    ) {
        return "";
    }

    return word
        .trim()
        .toLowerCase();
}

// ========================================
// ADD BLOCKED WORD
// ========================================

async function addBlockedWord(
    guild,
    word
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return false;
    }

    const cleanWord =
        cleanBlockedWord(
            word
        );

    if (!cleanWord) {
        return false;
    }

    const maxLength =
        config.blockedWordMaxLength ??
        100;

    if (
        cleanWord.length >
        maxLength
    ) {
        return false;
    }

    if (
        cleanWord.includes(
            "\n"
        ) ||
        cleanWord.includes(
            "\r"
        )
    ) {
        return false;
    }

    return database.addBlockedWord(
        serverId,
        cleanWord
    );
}

// ========================================
// REMOVE BLOCKED WORD
// ========================================

async function removeBlockedWord(
    guild,
    word
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return false;
    }

    const cleanWord =
        cleanBlockedWord(
            word
        );

    if (!cleanWord) {
        return false;
    }

    return database.removeBlockedWord(
        serverId,
        cleanWord
    );
}

// ========================================
// GET BLOCKED WORDS
// ========================================

async function getBlockedWords(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const words =
        await database.getBlockedWords(
            serverId
        );

    if (
        !Array.isArray(words)
    ) {
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
        .filter(
            Boolean
        );
}

// ========================================
// FIND BLOCKED WORD
// ========================================

async function findBlockedWord(
    guild,
    content
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        typeof content !==
            "string" ||
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
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    return database.authorizeUser(
        serverId,
        userId
    );
}

async function unauthorizeUser(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    return database.unauthorizeUser(
        serverId,
        userId
    );
}

async function isAuthorizedUser(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    return database.isAuthorizedUser(
        serverId,
        userId
    );
}

async function isUnauthorizedUser(
    guild,
    userId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !userId
    ) {
        return false;
    }

    return database.isUnauthorizedUser(
        serverId,
        userId
    );
}

async function getAuthorizedUsers(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    return database.getAuthorizedUsers(
        serverId
    );
}

async function getUnauthorizedUsers(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

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
        getServerId(
            guild
        );

    if (
        !serverId ||
        !roleId
    ) {
        return false;
    }

    return database.authorizeRole(
        serverId,
        roleId
    );
}

async function unauthorizeRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !roleId
    ) {
        return false;
    }

    return database.unauthorizeRole(
        serverId,
        roleId
    );
}

async function isAuthorizedRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !roleId
    ) {
        return false;
    }

    return database.isAuthorizedRole(
        serverId,
        roleId
    );
}

async function isUnauthorizedRole(
    guild,
    roleId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !roleId
    ) {
        return false;
    }

    return database.isUnauthorizedRole(
        serverId,
        roleId
    );
}

async function getAuthorizedRoles(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    return database.getAuthorizedRoles(
        serverId
    );
}

async function getUnauthorizedRoles(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

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

async function canUseGuardian(
    member
) {
    if (
        !member ||
        !member.guild ||
        !member.id
    ) {
        return false;
    }

    const guild =
        member.guild;

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return false;
    }

    const userId =
        member.id;

    // ====================================
    // ADMINISTRATORS ALWAYS ALLOWED
    // ====================================

    if (
        member.permissions?.has(
            "Administrator"
        )
    ) {
        return true;
    }

    // ====================================
    // EXPLICIT USER DENY
    // ====================================

    if (
        await isUnauthorizedUser(
            guild,
            userId
        )
    ) {
        return false;
    }

    const memberRoles =
        member.roles?.cache;

    // ====================================
    // EXPLICIT ROLE DENY
    // ====================================

    if (memberRoles) {
        for (
            const role of
            memberRoles.values()
        ) {
            // @everyone role ID equals
            // the server ID.
            if (
                role.id ===
                serverId
            ) {
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
    }

    // ====================================
    // EXPLICIT USER ALLOW
    // ====================================

    if (
        await isAuthorizedUser(
            guild,
            userId
        )
    ) {
        return true;
    }

    // ====================================
    // AUTHORIZED ROLE ALLOW
    // ====================================

    if (memberRoles) {
        for (
            const role of
            memberRoles.values()
        ) {
            if (
                role.id ===
                serverId
            ) {
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
    }

    // ====================================
    // DEFAULT DENY
    // ====================================

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
        getServerId(
            guild
        );

    if (
        !serverId ||
        !categoryId ||
        typeof message !==
            "string" ||
        !message.trim()
    ) {
        return false;
    }

    const maxLength =
        config.autoMessageMaxLength ??
        2000;

    if (
        message.trim().length >
        maxLength
    ) {
        return false;
    }

    return database
        .setAutoCategoryMessage(
            serverId,
            categoryId,
            message.trim()
        );
}

async function removeAutoCategoryMessage(
    guild,
    categoryId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !categoryId
    ) {
        return false;
    }

    return database
        .removeAutoCategoryMessage(
            serverId,
            categoryId
        );
}

async function getAutoCategoryMessage(
    guild,
    categoryId
) {
    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        !categoryId
    ) {
        return null;
    }

    return database
        .getAutoCategoryMessage(
            serverId,
            categoryId
        );
}

async function getAutoCategoryMessages(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

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
        getServerId(
            guild
        );

    if (
        !serverId ||
        !channelId
    ) {
        return false;
    }

    return database
        .setBanTriggerChannel(
            serverId,
            channelId
        );
}

async function removeBanTriggerChannel(
    guild
) {
    const serverId =
        getServerId(
            guild
        );

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
        getServerId(
            guild
        );

    if (!serverId) {
        return null;
    }

    return database
        .getBanTriggerChannel(
            serverId
        );
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    // SERVER HELPERS
    getServerId,

    // RAID / JOIN PROTECTION
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
    getBanTriggerChannel
};
