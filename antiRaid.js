const {
    PermissionsBitField,
    ChannelType
} = require("discord.js");

const config = require("./config");

const guildStates = new Map();

/*
    Stores the recent joins for each server.
*/
function getGuildState(guildId) {
    if (!guildStates.has(guildId)) {
        guildStates.set(guildId, {
            joins: [],
            lockdown: false,
            lockdownTimer: null,
            quarantineRoleId: null,
            logChannelId: null,
            whitelistedUsers: new Set()
        });
    }

    return guildStates.get(guildId);
}

/*
    Record a member joining.
*/
function recordJoin(guildId, userId) {
    const state = getGuildState(guildId);

    const now = Date.now();

    state.joins.push({
        userId,
        timestamp: now
    });

    // Remove joins outside our time window.
    state.joins = state.joins.filter(
        join => now - join.timestamp <= config.raidTimeWindow * 1000
    );

    return state.joins.length;
}

/*
    Determine whether the account is suspicious.
*/
function isSuspiciousAccount(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;

    return accountAge < config.suspiciousAccountAge;
}

/*
    Determine whether the account is extremely suspicious.
*/
function isExtremelySuspicious(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;

    return accountAge < config.extremeAccountAge;
}

/*
    Check whether the member is whitelisted.
*/
function isWhitelisted(member) {
    const state = getGuildState(member.guild.id);

    return state.whitelistedUsers.has(member.id);
}

/*
    Find or create the quarantine role.
*/
async function getQuarantineRole(guild) {
    const state = getGuildState(guild.id);

    if (state.quarantineRoleId) {
        const existingRole = guild.roles.cache.get(
            state.quarantineRoleId
        );

        if (existingRole) {
            return existingRole;
        }
    }

    let role = guild.roles.cache.find(
        r => r.name === "Raid Quarantine"
    );

    if (!role) {
        role = await guild.roles.create({
            name: "Raid Quarantine",
            color: 0x555555,
            reason: "Guardian Anti-Raid quarantine role"
        });
    }

    state.quarantineRoleId = role.id;

    return role;
}

/*
    Put a member into quarantine.
*/
async function quarantineMember(member) {
    try {
        if (!member.manageable) {
            return false;
        }

        const role = await getQuarantineRole(member.guild);

        await member.roles.add(
            role,
            "Guardian Anti-Raid: suspicious account during raid"
        );

        return true;
    } catch (error) {
        console.error(
            `Failed to quarantine ${member.user.tag}:`,
            error
        );

        return false;
    }
}

/*
    Kick a suspicious member.
*/
async function kickMember(member, reason) {
    try {
        if (!member.kickable) {
            return false;
        }

        await member.kick(reason);

        return true;
    } catch (error) {
        console.error(
            `Failed to kick ${member.user.tag}:`,
            error
        );

        return false;
    }
}

/*
    Create a lockdown.
*/
async function lockdown(guild, reason = "Raid detected") {
    const state = getGuildState(guild.id);

    if (state.lockdown) {
        return false;
    }

    state.lockdown = true;

    console.log(
        `[RAID] Lockdown started in ${guild.name}: ${reason}`
    );

    /*
        We don't overwrite channel permissions permanently.
        Instead, we deny SendMessages to @everyone.
    */

    const everyoneRole = guild.roles.everyone;

    for (const channel of guild.channels.cache.values()) {
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
                        reason: `Guardian Anti-Raid lockdown: ${reason}`
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

    /*
        Automatically unlock after the configured period.
    */
    state.lockdownTimer = setTimeout(
        () => unlock(guild),
        config.lockdownDuration
    );

    return true;
}

/*
    Remove lockdown.
*/
async function unlock(guild) {
    const state = getGuildState(guild.id);

    if (!state.lockdown) {
        return false;
    }

    state.lockdown = false;

    if (state.lockdownTimer) {
        clearTimeout(state.lockdownTimer);
        state.lockdownTimer = null;
    }

    const everyoneRole = guild.roles.everyone;

    for (const channel of guild.channels.cache.values()) {
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
                        reason: "Guardian Anti-Raid lockdown ended"
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

    console.log(
        `[RAID] Lockdown ended in ${guild.name}`
    );

    return true;
}

/*
    Check current lockdown status.
*/
function isLockedDown(guildId) {
    return getGuildState(guildId).lockdown;
}

/*
    Add a user to whitelist.
*/
function whitelistUser(guildId, userId) {
    const state = getGuildState(guildId);

    state.whitelistedUsers.add(userId);
}

/*
    Remove a user from whitelist.
*/
function removeWhitelist(guildId, userId) {
    const state = getGuildState(guildId);

    state.whitelistedUsers.delete(userId);
}

/*
    Check recent join count.
*/
function getRecentJoinCount(guildId) {
    const state = getGuildState(guildId);

    const now = Date.now();

    state.joins = state.joins.filter(
        join => now - join.timestamp <= config.raidTimeWindow * 1000
    );

    return state.joins.length;
}

module.exports = {
    recordJoin,
    isSuspiciousAccount,
    isExtremelySuspicious,
    isWhitelisted,
    quarantineMember,
    kickMember,
    lockdown,
    unlock,
    isLockedDown,
    whitelistUser,
    removeWhitelist,
    getRecentJoinCount
};
