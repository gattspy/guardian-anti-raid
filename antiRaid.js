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

            whitelistedUsers: new Set()

        });
    }

    return guildStates.get(guildId);
}

// ========================================
// RECORD MEMBER JOIN
// ========================================

function recordJoin(
    guildId,
    userId
) {

    const state =
        getGuildState(guildId);

    const now =
        Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    state.joins =
        state.joins.filter(
            join =>
                now - join.timestamp <=
                config.raidTimeWindow * 1000
        );

    return state.joins.length;
}

// ========================================
// CHECK ACCOUNT AGE
// ========================================

function isSuspiciousAccount(
    member
) {

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

function isWhitelisted(
    member
) {

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
// REMOVE WHITELIST
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

async function unlock(
    guild
) {

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
// CHECK LOCKDOWN
// ========================================

function isLockedDown(
    guildId
) {

    return getGuildState(
        guildId
    ).lockdown;
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
// ================================
// DATABASE AUTHORIZATION
// ================================
// ========================================

// ========================================
// AUTHORIZE USER
// ========================================

async function authorizeUser(
    guildId,
    userId
) {

    try {

        return await database.authorizeUser(
            guildId,
            userId
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to authorize user:",
            error
        );

        return false;
    }
}

// ========================================
// UNAUTHORIZE USER
// ========================================

async function unauthorizeUser(
    guildId,
    userId
) {

    try {

        return await database.unauthorizeUser(
            guildId,
            userId
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to unauthorize user:",
            error
        );

        return false;
    }
}

// ========================================
// CHECK AUTHORIZATION
// ========================================

async function isAuthorizedUser(
    guildId,
    userId
) {

    try {

        return await database.isAuthorizedUser(
            guildId,
            userId
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to check authorization:",
            error
        );

        return false;
    }
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

async function getAuthorizedUsers(
    guildId
) {

    try {

        return await database.getAuthorizedUsers(
            guildId
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to get authorized users:",
            error
        );

        return [];
    }
}

// ========================================
// ================================
// DATABASE BLOCKED WORDS
// ================================
// ========================================

// ========================================
// ADD BLOCKED WORD
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    try {

        return await database.addBlockedWord(
            guildId,
            word
        );

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
// ========================================

async function removeBlockedWord(
    guildId,
    word
) {

    try {

        return await database.removeBlockedWord(
            guildId,
            word
        );

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
// ========================================

async function getBlockedWords(
    guildId
) {

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
// ========================================

async function findBlockedWord(
    guildId,
    message
) {

    try {

        return await database.findBlockedWord(
            guildId,
            message
        );

    } catch (error) {

        console.error(
            "[DATABASE] Failed to find blocked word:",
            error
        );

        return null;
    }
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
