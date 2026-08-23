const {
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const config = require("./config");

// ========================================
// SERVER STATE
// ========================================

const guildStates = new Map();

function getGuildState(guildId) {

    if (!guildStates.has(guildId)) {

        guildStates.set(guildId, {
            joins: [],
            lockdown: false,
            lockdownTimer: null,

            whitelistedUsers: new Set(),

            authorizedUsers: new Set(),

            blockedWords: new Set()
        });
    }

    return guildStates.get(guildId);
}

// ========================================
// RECORD MEMBER JOIN
// ========================================

function recordJoin(guildId, userId) {

    const state =
        getGuildState(guildId);

    const now = Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    state.joins =
        state.joins.filter(join => {

            return (
                now - join.timestamp <=
                config.raidTimeWindow * 1000
            );
        });

    return state.joins.length;
}

// ========================================
// CHECK ACCOUNT AGE
// ========================================

function isSuspiciousAccount(member) {

    if (!member || !member.user) {
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

function isWhitelisted(member) {

    if (!member || !member.guild) {
        return false;
    }

    const state =
        getGuildState(
            member.guild.id
        );

    return state.whitelistedUsers.has(
        member.id
    );
}

// ========================================
// KICK MEMBER
// ========================================

async function kickMember(
    member,
    reason = "Guardian Anti-Raid protection"
) {

    try {

        if (!member) {
            return false;
        }

        if (!member.kickable) {

            console.log(
                `[KICK FAILED] Cannot kick ${member.user.tag}`
            );

            return false;
        }

        await member.kick(reason);

        console.log(
            `[KICKED] ${member.user.tag}`
        );

        return true;

    } catch (error) {

        console.error(
            `[KICK ERROR] ${member?.user?.tag || "Unknown user"}:`,
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
    reason = "Raid detected"
) {

    if (!guild) {
        return false;
    }

    const state =
        getGuildState(guild.id);

    // Already locked
    if (state.lockdown) {
        return false;
    }

    state.lockdown = true;

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

            // Only lock text-based channels
            if (
                channel.type ===
                    ChannelType.GuildText ||

                channel.type ===
                    ChannelType.GuildAnnouncement
            ) {

                await channel.permissionOverwrites.edit(
                    everyoneRole,
                    {
                        SendMessages: false
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

    // ====================================
    // AUTOMATIC UNLOCK
    // ====================================

    state.lockdownTimer =
        setTimeout(
            async () => {

                try {

                    await unlock(guild);

                } catch (error) {

                    console.error(
                        "Automatic unlock error:",
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

async function unlock(guild) {

    if (!guild) {
        return false;
    }

    const state =
        getGuildState(guild.id);

    if (!state.lockdown) {
        return false;
    }

    state.lockdown = false;

    // Stop automatic timer
    if (state.lockdownTimer) {

        clearTimeout(
            state.lockdownTimer
        );

        state.lockdownTimer = null;
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

                await channel.permissionOverwrites.edit(
                    everyoneRole,
                    {
                        SendMessages: null
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
// CHECK LOCKDOWN STATUS
// ========================================

function isLockedDown(guildId) {

    const state =
        getGuildState(guildId);

    return state.lockdown;
}

// ========================================
// AUTHORIZE USER
// ========================================

function authorizeUser(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    state.authorizedUsers.add(
        userId
    );

    return true;
}

// ========================================
// UNAUTHORIZE USER
// ========================================

function unauthorizeUser(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    return state.authorizedUsers.delete(
        userId
    );
}

// ========================================
// CHECK AUTHORIZATION
// ========================================

function isAuthorizedUser(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    return state.authorizedUsers.has(
        userId
    );
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

function getAuthorizedUsers(
    guildId
) {

    const state =
        getGuildState(guildId);

    return [
        ...state.authorizedUsers
    ];
}

// ========================================
// ADD BLOCKED WORD
// ========================================

function addBlockedWord(
    guildId,
    word
) {

    if (
        !guildId ||
        !word
    ) {
        return false;
    }

    const state =
        getGuildState(guildId);

    const cleanWord =
        word
            .trim()
            .toLowerCase();

    if (!cleanWord) {
        return false;
    }

    state.blockedWords.add(
        cleanWord
    );

    return true;
}

// ========================================
// REMOVE BLOCKED WORD
// ========================================

function removeBlockedWord(
    guildId,
    word
) {

    if (
        !guildId ||
        !word
    ) {
        return false;
    }

    const state =
        getGuildState(guildId);

    return state.blockedWords.delete(
        word
            .trim()
            .toLowerCase()
    );
}

// ========================================
// GET BLOCKED WORDS
// ========================================

function getBlockedWords(
    guildId
) {

    const state =
        getGuildState(guildId);

    return [
        ...state.blockedWords
    ];
}

// ========================================
// FIND BLOCKED WORD
// ========================================

function findBlockedWord(
    guildId,
    message
) {

    if (
        !guildId ||
        !message
    ) {
        return null;
    }

    const state =
        getGuildState(guildId);

    const content =
        message.toLowerCase();

    for (
        const word of
        state.blockedWords
    ) {

        const escapedWord =
            word.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

        const regex =
            new RegExp(
                `\\b${escapedWord}\\b`,
                "i"
            );

        if (
            regex.test(content)
        ) {

            return word;
        }
    }

    return null;
}

// ========================================
// WHITELIST USER
// ========================================

function whitelistUser(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    state.whitelistedUsers.add(
        userId
    );

    return true;
}

// ========================================
// REMOVE FROM WHITELIST
// ========================================

function removeWhitelist(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    return state.whitelistedUsers.delete(
        userId
    );
}

// ========================================
// GET RECENT JOINS
// ========================================

function getRecentJoinCount(
    guildId
) {

    const state =
        getGuildState(guildId);

    const now =
        Date.now();

    state.joins =
        state.joins.filter(
            join =>
                now - join.timestamp <=
                config.raidTimeWindow * 1000
        );

    return state.joins.length;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    // Raid protection
    recordJoin,
    isSuspiciousAccount,
    isWhitelisted,
    kickMember,
    lockdown,
    unlock,
    isLockedDown,
    getRecentJoinCount,

    // Whitelist
    whitelistUser,
    removeWhitelist,

    // Authorization
    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers,

    // Blocked words
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord
};
