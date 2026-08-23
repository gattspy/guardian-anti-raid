const {
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const config = require("./config");

const database = require("./database");

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

            authorizedUsers: new Set()
        });
    }

    return guildStates.get(guildId);
}

// ========================================
// RECORD MEMBER JOIN
// ========================================

function recordJoin(guildId, userId) {

    const state = getGuildState(guildId);
    const now = Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    state.joins = state.joins.filter(
        join =>
            now - join.timestamp <=
            config.raidTimeWindow * 1000
    );

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
        getGuildState(member.guild.id);

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

        if (!member || !member.kickable) {

            console.log(
                `[KICK FAILED] Cannot kick ${member?.user?.tag || "Unknown user"}`
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

            if (
                channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildAnnouncement
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
                channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildAnnouncement
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

    return getGuildState(guildId).lockdown;
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

    state.authorizedUsers.add(userId);

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

    return state.authorizedUsers.delete(userId);
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

    return state.authorizedUsers.has(userId);
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

function getAuthorizedUsers(guildId) {

    const state =
        getGuildState(guildId);

    return [...state.authorizedUsers];
}

// ========================================
// ADD BLOCKED WORD
// DATABASE VERSION
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        word.trim().toLowerCase();

    if (!cleanWord) {
        return false;
    }

    try {

        await db.addBlockedWord(
            guildId,
            cleanWord
        );

        console.log(
            `[WORD ADD] ${cleanWord} added to ${guildId}`
        );

        return true;

    } catch (error) {

        console.error(
            "[DATABASE] Failed to add blocked word:",
            error
        );

        return false;
    }
}

// ========================================
// REMOVE BLOCKED WORD
// DATABASE VERSION
// ========================================

async function removeBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        word.trim().toLowerCase();

    try {

        const removed =
            await db.removeBlockedWord(
                guildId,
                cleanWord
            );

        if (removed) {

            console.log(
                `[WORD REMOVE] ${cleanWord} removed from ${guildId}`
            );
        }

        return removed;

    } catch (error) {

        console.error(
            "[DATABASE] Failed to remove blocked word:",
            error
        );

        return false;
    }
}

// ========================================
// GET BLOCKED WORDS
// DATABASE VERSION
// ========================================

async function getBlockedWords(guildId) {

    if (!guildId) {
        return [];
    }

    try {

        return await db.getBlockedWords(
            guildId
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to get blocked words:",
            error
        );

        return [];
    }
}

// ========================================
// FIND BLOCKED WORD
// DATABASE VERSION
// ========================================

async function findBlockedWord(
    guildId,
    message
) {

    if (!guildId || !message) {
        return null;
    }

    try {

        const words =
            await db.getBlockedWords(
                guildId
            );

        const content =
            message.toLowerCase();

        for (const word of words) {

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

            if (regex.test(content)) {
                return word;
            }
        }

        return null;

    } catch (error) {

        console.error(
            "[DATABASE] Failed to check blocked words:",
            error
        );

        return null;
    }
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

    state.whitelistedUsers.add(userId);

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

    return state.whitelistedUsers.delete(userId);
}

// ========================================
// GET RECENT JOINS
// ========================================

function getRecentJoinCount(guildId) {

    const state =
        getGuildState(guildId);

    const now = Date.now();

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

    recordJoin,
    isSuspiciousAccount,
    isWhitelisted,
    kickMember,

    lockdown,
    unlock,
    isLockedDown,
    getRecentJoinCount,

    whitelistUser,
    removeWhitelist,

    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers,

    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord
};
