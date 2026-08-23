const {
    ChannelType
} = require("discord.js");

const config = require("./config");

const guildStates = new Map();

// ========================================
// GET SERVER STATE
// ========================================

function getGuildState(guildId) {

    if (!guildStates.has(guildId)) {

        guildStates.set(guildId, {

            joins: [],

            lockdown: false,

            lockdownTimer: null,

            whitelistedUsers: new Set(),

            blockedWords: new Set(),

            authorizedUsers: new Set()

        });

    }

    return guildStates.get(guildId);
}

// ========================================
// RECORD JOIN
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
// ACCOUNT AGE
// ========================================

function isSuspiciousAccount(member) {

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
    reason
) {

    try {

        if (!member.kickable) {

            console.log(
                `[KICK FAILED] ${member.user.tag}`
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
            "Kick error:",
            error
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

    const state =
        getGuildState(guild.id);

    if (state.lockdown) {
        return false;
    }

    state.lockdown = true;

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
                `Could not lock ${channel.name}:`,
                error.message
            );

        }
    }

    state.lockdownTimer =
        setTimeout(
            () => unlock(guild),
            config.lockdownDuration
        );

    return true;
}

// ========================================
// UNLOCK
// ========================================

async function unlock(guild) {

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
                `Could not unlock ${channel.name}:`,
                error.message
            );

        }
    }

    return true;
}

// ========================================
// LOCKDOWN STATUS
// ========================================

function isLockedDown(guildId) {

    return getGuildState(
        guildId
    ).lockdown;
}

// ========================================
// AUTHORIZED USERS
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
// BLOCKED WORDS
// ========================================

function addBlockedWord(
    guildId,
    word
) {

    const state =
        getGuildState(guildId);

    state.blockedWords.add(
        word.toLowerCase()
    );

    return true;
}

function removeBlockedWord(
    guildId,
    word
) {

    const state =
        getGuildState(guildId);

    return state.blockedWords.delete(
        word.toLowerCase()
    );
}

function getBlockedWords(
    guildId
) {

    const state =
        getGuildState(guildId);

    return [
        ...state.blockedWords
    ];
}

function findBlockedWord(
    guildId,
    message
) {

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

        if (regex.test(content)) {
            return word;
        }
    }

    return null;
}

// ========================================
// EXPORT EVERYTHING
// ========================================

module.exports = {

    recordJoin,

    isSuspiciousAccount,

    isWhitelisted,

    kickMember,

    lockdown,

    unlock,

    isLockedDown,

    authorizeUser,

    unauthorizeUser,

    isAuthorizedUser,

    getAuthorizedUsers,

    addBlockedWord,

    removeBlockedWord,

    getBlockedWords,

    findBlockedWord

};
