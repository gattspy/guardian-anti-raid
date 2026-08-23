require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const {
    recordJoin,
    isSuspiciousAccount,
    isExtremelySuspicious,
    isWhitelisted,
    quarantineMember,
    kickMember,
    lockdown,
    unlock,
    isLockedDown
} = require("./antiRaid");

const config = require("./config");

// ==============================
// WEB SERVER
// ==============================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
    res.send("Guardian Anti-Raid is online.");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});

// ==============================
// DISCORD BOT
// ==============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ==============================
// BOT READY
// ==============================

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Monitoring ${client.guilds.cache.size} server(s)`);
});

// ==============================
// MEMBER JOIN
// ==============================

client.on("guildMemberAdd", async member => {
    try {
        console.log(
            `${member.user.tag} joined ${member.guild.name}`
        );

        // Ignore bots
        if (member.user.bot) {
            return;
        }

        // Ignore whitelisted users
        if (isWhitelisted(member)) {
            return;
        }

        // Record the join
        const recentJoins = recordJoin(
            member.guild.id,
            member.id
        );

        console.log(
            `Join count: ${recentJoins}`
        );

        // ==============================
        // RAID DETECTION
        // ==============================

        if (
            recentJoins >= config.raidJoinThreshold &&
            !isLockedDown(member.guild.id)
        ) {
            console.log(
                `🚨 RAID DETECTED in ${member.guild.name}`
            );

            await lockdown(
                member.guild,
                `${recentJoins} members joined within ${config.raidTimeWindow} seconds`
            );

            // Find raid log channel
            const logChannel =
                member.guild.channels.cache.find(
                    channel => channel.name === "raid-logs"
                );

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("🚨 RAID DETECTED")
                    .setDescription(
                        "Guardian Anti-Raid detected suspicious activity."
                    )
                    .addFields(
                        {
                            name: "Join Rate",
                            value:
                                `${recentJoins} joins in ${config.raidTimeWindow} seconds`
                        },
                        {
                            name: "Action",
                            value: "🔒 Server lockdown activated"
                        }
                    )
                    .setTimestamp();

                await logChannel.send({
                    embeds: [embed]
                });
            }
        }

        // ==============================
        // PROTECTION DURING LOCKDOWN
        // ==============================

        if (!isLockedDown(member.guild.id)) {
            return;
        }

        // Extremely suspicious account
        if (isExtremelySuspicious(member)) {

            if (config.kickSuspiciousAccounts) {

                const kicked = await kickMember(
                    member,
                    "Guardian Anti-Raid: suspicious account during raid"
                );

                if (kicked) {
                    console.log(
                        `Kicked ${member.user.tag}`
                    );
                }

                return;
            }

            if (config.quarantineSuspiciousAccounts) {
                await quarantineMember(member);

                console.log(
                    `Quarantined ${member.user.tag}`
                );
            }

            return;
        }

        // Suspicious account
        if (isSuspiciousAccount(member)) {

            if (config.quarantineSuspiciousAccounts) {
                await quarantineMember(member);

                console.log(
                    `Quarantined ${member.user.tag}`
                );
            }
        }

    } catch (error) {
        console.error(
            "Member join error:",
            error
        );
    }
});

// ==============================
// SLASH COMMANDS
// ==============================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    try {

        // Administrator only
        if (
            !interaction.memberPermissions ||
            !interaction.memberPermissions.has("Administrator")
        ) {
            await interaction.reply({
                content:
                    "❌ You need Administrator permission to use this command.",
                ephemeral: true
            });

            return;
        }

        // ==============================
        // /lockdown
        // ==============================

        if (interaction.commandName === "lockdown") {

            await lockdown(
                interaction.guild,
                `Manual lockdown by ${interaction.user.tag}`
            );

            await interaction.reply(
                "🔒 **SERVER LOCKDOWN ACTIVATED**"
            );

            return;
        }

        // ==============================
        // /unlock
        // ==============================

        if (interaction.commandName === "unlock") {

            await unlock(interaction.guild);

            await interaction.reply(
                "🔓 **SERVER LOCKDOWN REMOVED**"
            );

            return;
        }

        // ==============================
        // /raidstatus
        // ==============================

        if (interaction.commandName === "raidstatus") {

            const locked = isLockedDown(
                interaction.guild.id
            );

            await interaction.reply(
                locked
                    ? "🚨 **RAID LOCKDOWN ACTIVE**"
                    : "🟢 **NO RAID LOCKDOWN ACTIVE**"
            );

            return;
        }

    } catch (error) {

        console.error(
            "Command error:",
            error
        );

        if (interaction.replied) {
            await interaction.followUp({
                content: "❌ An error occurred.",
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: "❌ An error occurred.",
                ephemeral: true
            });
        }
    }
});

// ==============================
// DISCORD ERRORS
// ==============================

client.on("error", error => {
    console.error(
        "Discord error:",
        error
    );
});

// ==============================
// LOGIN
// ==============================

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
