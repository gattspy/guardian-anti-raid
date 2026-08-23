const {
    ChannelType
} = require("discord.js");

const config = require("./config");

const guildStates = new Map();

// ========================================
// SERVER STATE
// ========================================

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
// RECORD JOIN
// ========================================

function recordJoin(guildId, userId) {

    const state = getGuildState(guildId);

    const now = Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    state.joins = state.joins.filter(join => {
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

    return accountAge <
        config.suspiciousAccountAge;
}

// ========================================
// WHITELIST
// ========================================

function isWhitelisted(member) {

    const state =
        getGuildState(member.guild.id);

    return state.whitelistedUsers.has(
        member.id
    );
}

// ========================================
// KICK MEMBER
// ========================================

async function kickMember(member, reason) {

    try {

        if (!member.kickable) {

            console.log(
                `[KICK FAILED] ${member.user.tag} is not kickable.`
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
            `[KICK ERROR] ${member.user.tag}:`,
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

    console.log(
        `[RAID] Lockdown started in ${guild.name}`
    );

    const everyoneRole =
        guild.roles.everyone;

    for (
        const channel of guild.channels.cache.values()
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
                `[LOCK ERROR] ${channel.name}:`,
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
        const channel of guild.channels.cache.values()
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

    console.log(
        `[RAID] Lockdown ended in ${guild.name}`
    );

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

    state.whitelistedUsers.delete(
        userId
    );
}

// ========================================
// RECENT JOINS
// ========================================

function getRecentJoinCount(guildId) {

    const state =
        getGuildState(guildId);

    const now = Date.now();

    state.joins = state.joins.filter(
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

    whitelistUser,

    removeWhitelist,

    getRecentJoinCount

};
