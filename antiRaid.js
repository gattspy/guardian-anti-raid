const {
    ChannelType
} = require("discord.js");

const config = require("./config");
const database = require("./database");

// ========================================
// SERVER STATE
// ========================================

const guildStates =
    new Map();

function getGuildState(
    guildId
) {
    if (
        !guildId
    ) {
        return null;
    }

    if (
        !guildStates.has(
            guildId
        )
    ) {
        guildStates.set(
            guildId,
            {
                joins: [],
                lockdown: false,
                lockdownTimer: null,
                whitelistedUsers:
                    new Set()
            }
        );
    }

    return guildStates.get(
        guildId
    );
}

// ========================================
// JOIN TRACKING
// ========================================

function recordJoin(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return 0;
    }

    const state =
        getGuildState(
            guildId
        );

    if (!state) {
        return 0;
    }

    const now =
        Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    state.joins =
        state.joins.filter(
            join =>
                now -
                    join.timestamp <=
                config.raidTimeWindow *
                    1000
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
        !member.user.createdTimestamp
    ) {
        return false;
    }

    const accountAge =
        Date.now() -
        member.user.createdTimestamp;

    return (
        accountAge <
        config.suspiciousAccountAge
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
        !member.guild
    ) {
        return false;
    }

    const state =
        getGuildState(
            member.guild.id
        );

    if (!state) {
        return false;
    }

    return state.whitelistedUsers.has(
        member.id
    );
}

function whitelistUser(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    const state =
        getGuildState(
            guildId
        );

    if (!state) {
        return false;
    }

    state.whitelistedUsers.add(
        userId
    );

    return true;
}

function removeWhitelist(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    const state =
        getGuildState(
            guildId
        );

    if (!state) {
        return false;
    }

    return state.whitelistedUsers.delete(
        userId
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
        if (
            !member ||
            !member.kickable
        ) {
            console.warn(
                `[KICK FAILED] Cannot kick ${
                    member?.user?.tag ||
                    "Unknown user"
                }`
            );

            return false;
        }

        await member.kick(
            reason
        );

        console.log(
            `[KICKED] ${member.user.tag}`
        );

        return true;

    } catch (error) {
        console.error(
            `[KICK ERROR] ${
                member?.user?.tag ||
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
    if (!guild) {
        return false;
    }

    const state =
        getGuildState(
            guild.id
        );

    if (!state) {
        return false;
    }

    if (
        state.lockdown
    ) {
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

    const everyoneRole =
        guild.roles.everyone;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        try {
            if (
                channel.type ===
                    ChannelType.GuildText ||
                channel.type ===
                    ChannelType.GuildAnnouncement
            ) {
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
            }

        } catch (error) {
            console.error(
                `[LOCKDOWN ERROR] ${channel.name}:`,
                error.message
            );
        }
    }

    if (
        state.lockdownTimer
    ) {
        clearTimeout(
            state.lockdownTimer
        );
    }

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
            config.lockdownDuration
        );

    return true;
}

// ========================================
// UNLOCK
// ========================================

async function unlock(
    guild
) {
    if (!guild) {
        return false;
    }

    const state =
        getGuildState(
            guild.id
        );

    if (!state) {
        return false;
    }

    if (
        !state.lockdown
    ) {
        return false;
    }

    state.lockdown =
        false;

    if (
        state.lockdownTimer
    ) {
        clearTimeout(
            state.lockdownTimer
        );

        state.lockdownTimer =
            null;
    }

    console.log(
        `[UNLOCK] ${guild.name}`
    );

    const everyoneRole =
        guild.roles.everyone;

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        try {
            if (
                channel.type ===
                    ChannelType.GuildText ||
                channel.type ===
                    ChannelType.GuildAnnouncement
            ) {
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
            }

        } catch (error) {
            console.error(
                `[UNLOCK ERROR] ${channel.name}:`,
                error.message
            );
        }
    }

    return true;
}

// ========================================
// LOCKDOWN STATUS
// ========================================

function isLockedDown(
    guildId
) {
    if (!guildId) {
        return false;
    }

    const state =
        getGuildState(
            guildId
        );

    return (
        state?.lockdown ===
        true
    );
}

// ========================================
// RECENT JOIN COUNT
// ========================================

function getRecentJoinCount(
    guildId
) {
    if (!guildId) {
        return 0;
    }

    const state =
        getGuildState(
            guildId
        );

    if (!state) {
        return 0;
    }

    const now =
        Date.now();

    state.joins =
        state.joins.filter(
            join =>
                now -
                    join.timestamp <=
                config.raidTimeWindow *
                    1000
        );

    return state.joins.length;
}

// ========================================
// BLOCKED WORD HELPERS
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
        .normalize("NFKC")
        .trim()
        .toLowerCase();
}

// ========================================
// BLOCKED WORDS
// ========================================

async function addBlockedWord(
    guildId,
    word
) {
    if (!guildId) {
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

    return database.addBlockedWord(
        guildId,
        cleanWord
    );
}

async function removeBlockedWord(
    guildId,
    word
) {
    if (!guildId) {
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
        guildId,
        cleanWord
    );
}

async function getBlockedWords(
    guildId
) {
    if (!guildId) {
        return [];
    }

    const words =
        await database.getBlockedWords(
            guildId
        );

    if (
        !Array.isArray(
            words
        )
    ) {
        return [];
    }

    return words
        .map(
            word =>
                cleanBlockedWord(
                    word
                )
        )
        .filter(
            Boolean
        );
}

// ========================================
// USER AUTHORIZATION
// ========================================

async function authorizeUser(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    return database.authorizeUser(
        guildId,
        userId
    );
}

async function unauthorizeUser(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    return database.unauthorizeUser(
        guildId,
        userId
    );
}

async function isAuthorizedUser(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    return database.isAuthorizedUser(
        guildId,
        userId
    );
}

async function isUnauthorizedUser(
    guildId,
    userId
) {
    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

    return database.isUnauthorizedUser(
        guildId,
        userId
    );
}

async function getAuthorizedUsers(
    guildId
) {
    if (!guildId) {
        return [];
    }

    return database.getAuthorizedUsers(
        guildId
    );
}

async function getUnauthorizedUsers(
    guildId
) {
    if (!guildId) {
        return [];
    }

    return database.getUnauthorizedUsers(
        guildId
    );
}

// ========================================
// ROLE AUTHORIZATION
// ========================================

async function authorizeRole(
    guildId,
    roleId
) {
    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

    return database.authorizeRole(
        guildId,
        roleId
    );
}

async function unauthorizeRole(
    guildId,
    roleId
) {
    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

    return database.unauthorizeRole(
        guildId,
        roleId
    );
}

async function isAuthorizedRole(
    guildId,
    roleId
) {
    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

    return database.isAuthorizedRole(
        guildId,
        roleId
    );
}

async function isUnauthorizedRole(
    guildId,
    roleId
) {
    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

    return database.isUnauthorizedRole(
        guildId,
        roleId
    );
}

async function getAuthorizedRoles(
    guildId
) {
    if (!guildId) {
        return [];
    }

    return database.getAuthorizedRoles(
        guildId
    );
}

async function getUnauthorizedRoles(
    guildId
) {
    if (!guildId) {
        return [];
    }

    return database.getUnauthorizedRoles(
        guildId
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
        !member.guild
    ) {
        return false;
    }

    const guildId =
        member.guild.id;

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
            guildId,
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
            if (
                role.id ===
                guildId
            ) {
                continue;
            }

            if (
                await isUnauthorizedRole(
                    guildId,
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
            guildId,
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
                guildId
            ) {
                continue;
            }

            if (
                await isAuthorizedRole(
                    guildId,
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
    guildId,
    categoryId,
    message
) {
    if (
        !guildId ||
        !categoryId ||
        !message
    ) {
        return false;
    }

    return database
        .setAutoCategoryMessage(
            guildId,
            categoryId,
            message
        );
}

async function removeAutoCategoryMessage(
    guildId,
    categoryId
) {
    if (
        !guildId ||
        !categoryId
    ) {
        return false;
    }

    return database
        .removeAutoCategoryMessage(
            guildId,
            categoryId
        );
}

async function getAutoCategoryMessage(
    guildId,
    categoryId
) {
    if (
        !guildId ||
        !categoryId
    ) {
        return null;
    }

    return database
        .getAutoCategoryMessage(
            guildId,
            categoryId
        );
}

async function getAutoCategoryMessages(
    guildId
) {
    if (!guildId) {
        return [];
    }

    return database
        .getAutoCategoryMessages(
            guildId
        );
}

// ========================================
// BAN TRIGGER CHANNEL
// ========================================

async function setBanTriggerChannel(
    guildId,
    channelId
) {
    if (
        !guildId ||
        !channelId
    ) {
        return false;
    }

    return database
        .setBanTriggerChannel(
            guildId,
            channelId
        );
}

async function removeBanTriggerChannel(
    guildId
) {
    if (!guildId) {
        return false;
    }

    return database
        .removeBanTriggerChannel(
            guildId
        );
}

async function getBanTriggerChannel(
    guildId
) {
    if (!guildId) {
        return null;
    }

    return database
        .getBanTriggerChannel(
            guildId
        );
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    // RAID / JOIN PROTECTION
    recordJoin,
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
    getRecentJoinCount,

    // BLOCKED WORDS
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,

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

    // AUTO CATEGORY MESSAGES
    setAutoCategoryMessage,
    removeAutoCategoryMessage,
    getAutoCategoryMessage,
    getAutoCategoryMessages,

    // BAN TRIGGER CHANNEL
    setBanTriggerChannel,
    removeBanTriggerChannel,
    getBanTriggerChannel,

    // GUARDIAN ACCESS
    canUseGuardian
};
