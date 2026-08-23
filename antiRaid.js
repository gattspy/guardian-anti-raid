const {
    ChannelType
} = require("discord.js");

const config = require("./config");

// Store each server's anti-raid state
const guildStates = new Map();

// ==============================
// GET SERVER STATE
// ==============================

function getGuildState(guildId) {

    if (!guildStates.has(guildId)) {
        guildStates.set(guildId, {
            joins: [],
            lockdown: false,
            lockdownTimer: null,
            quarantineRoleId: null,
            whitelistedUsers: new Set()
        });
    }

    return guildStates.get(guildId);
}

// ==============================
// RECORD MEMBER JOIN
// ==============================

function recordJoin(guildId, userId) {

    const state = getGuildState(guildId);
    const now = Date.now();

    state.joins.push({
        userId: userId,
        timestamp: now
    });

    // Remove old joins
    state.joins = state.joins.filter(join => {
        return (
            now - join.timestamp <=
            config.raidTimeWindow * 1000
        );
    });

    return state.joins.length;
}

// ==============================
// SUSPICIOUS ACCOUNT
// ==============================

function isSuspiciousAccount(member) {

    const accountAge =
        Date.now() - member.user.createdTimestamp;

    return accountAge < config.suspiciousAccountAge;
}

// ==============================
// EXTREMELY SUSPICIOUS ACCOUNT
// ==============================

function isExtremelySuspicious(member) {

    const accountAge =
        Date.now() - member.user.createdTimestamp;

    return accountAge < config.extremeAccountAge;
}

// ==============================
// WHITELIST
// ==============================

function isWhitelisted(member) {

    const state =
        getGuildState(member.guild.id);

    return state.whitelistedUsers.has(member.id);
}

// ==============================
// QUARANTINE ROLE
// ==============================

async function getQuarantineRole(guild) {

    const state =
        getGuildState(guild.id);

    // Check existing saved role
    if (state.quarantineRoleId) {

        const existingRole =
            guild.roles.cache.get(
                state.quarantineRoleId
            );

        if (existingRole) {
            return existingRole;
        }
    }

    // Look for existing role
    let role =
        guild.roles.cache.find(
            role => role.name === "Raid Quarantine"
        );

    // Create role if necessary
    if (!role) {

        role = await guild.roles.create({
            name: "Raid Quarantine",
            reason:
                "Guardian Anti-Raid quarantine role"
        });
    }

    state.quarantineRoleId = role.id;

    return role;
}

// ==============================
// QUARANTINE MEMBER
// ==============================

async function quarantineMember(member) {

    try {

        if (!member.manageable) {
            console.log(
                `Cannot quarantine ${member.user.tag}`
            );

            return false;
        }

        const role =
            await getQuarantineRole(
                member.guild
            );

        await member.roles.add(
            role,
            "Guardian Anti-Raid: suspicious account"
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

// ==============================
// KICK MEMBER
// ==============================

async function kickMember(member, reason) {

    try {

        if (!member.kickable) {
            console.log(
                `Cannot kick ${member.user.tag}`
            );

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

// ==============================
// LOCKDOWN
// ==============================

async function lockdown(
    guild,
    reason = "Raid detected"
) {

    const state =
        getGuildState(guild.id);

    // Already locked
    if (state.lockdown) {
        return false;
    }

    state.lockdown = true;

    console.log(
        `[RAID] Lockdown started in ${guild.name}`
    );

    console.log(
        `[RAID] Reason: ${reason}`
    );

    const everyoneRole =
        guild.roles.everyone;

    // Lock text channels
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
                `Could not lock ${channel.name}:`,
                error.message
            );
        }
    }

    // Automatically unlock
    state.lockdownTimer =
        setTimeout(() => {

            unlock(guild);

        }, config.lockdownDuration);

    return true;
}

// ==============================
// UNLOCK
// ==============================

async function unlock(guild) {

    const state =
        getGuildState(guild.id);

    // Not locked
    if (!state.lockdown) {
        return false;
    }

    state.lockdown = false;

    // Stop timer
    if (state.lockdownTimer) {

        clearTimeout(
            state.lockdownTimer
        );

        state.lockdownTimer = null;
    }

    const everyoneRole =
        guild.roles.everyone;

    // Unlock text channels
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

// ==============================
// CHECK LOCKDOWN
// ==============================

function isLockedDown(guildId) {

    return getGuildState(
        guildId
    ).lockdown;
}

// ==============================
// WHITELIST USER
// ==============================

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

// ==============================
// REMOVE WHITELIST
// ==============================

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

// ==============================
// RECENT JOIN COUNT
// ==============================

function getRecentJoinCount(
    guildId
) {

    const state =
        getGuildState(guildId);

    const now = Date.now();

    state.joins =
        state.joins.filter(join => {

            return (
                now - join.timestamp <=
                config.raidTimeWindow * 1000
            );

        });

    return state.joins.length;
}

// ==============================
// EXPORTS
// ==============================

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
