const {
    ChannelType
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
// STORED IN POSTGRES
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    try {

        const result =
            await database.addBlockedWord(
                guildId,
                word
            );

        console.log(
            `[DATABASE] Added blocked word "${word}" to ${guildId}`
        );

        return result;

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
// STORED IN POSTGRES
// ========================================

async function removeBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    try {

        const result =
            await database.removeBlockedWord(
                guildId,
                word
            );

        if (result) {

            console.log(
                `[DATABASE] Removed blocked word "${word}" from ${guildId}`
            );
        }

        return result;

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
// STORED IN POSTGRES
// ========================================

async function getBlockedWords(
    guildId
) {

    if (!guildId) {
        return [];
    }

    try {

        return await database.getBlockedWords(
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
// STORED IN POSTGRES
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
            await database.getBlockedWords(
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

    // PostgreSQL blocked words
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord
};
