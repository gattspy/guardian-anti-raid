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

// ===============================
// EXPRESS / RENDER SERVER
// ===============================

const app = express();
const PORT = process.env.PORT || 10000;

// Dashboard
try {
    const dashboard = require("./dashboard");
    app.use("/dashboard", dashboard);

    console.log("Dashboard loaded.");
} catch (error) {
    console.error("Failed to load dashboard:", error);
}

// Health check
app.get("/", (req, res) => {
    res.status(200).send("Guardian Anti-Raid is online.");
});

// Render health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        bot: client?.isReady() ? "online" : "starting"
    });
});

// ===============================
// DISCORD CLIENT
// ===============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ===============================
// MAKE BOT AVAILABLE TO DASHBOARD
// ===============================

app.locals.bot = client;
app.locals.config = config;
app.locals.lockdown = lockdown;
app.locals.unlock = unlock;

app.locals.getRaidState = function (guildId) {
    return {
        lockdown: isLockedDown(guildId)
    };
};

// ===============================
// START WEB SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});

// ===============================
// BOT READY
// ===============================

client.once("ready", () => {
    console.log(
        `Guardian Anti-Raid logged in as ${client.user.tag}`
    );

    console.log(
        `Monitoring ${client.guilds.cache.size} server(s)`
    );
});

// ===============================
// MEMBER JOIN
// ===============================

client.on("guildMemberAdd", async member => {
    try {
        console.log(
            `[JOIN] ${member.user.tag} joined ${member.guild.name}`
        );

        // Ignore bots
        if (member.user.bot) {
            return;
        }

        // Ignore whitelisted users
        if (isWhitelisted(member)) {
            return;
        }

        // Record join
        const recentJoins = recordJoin(
            member.guild.id,
            member.id
        );

        console.log(
            `[JOIN RATE] ${recentJoins} joins in the current window`
        );

        // ===============================
        // RAID DETECTION
        // ===============================

        if (
            recentJoins >= config.raidJoinThreshold &&
            !isLockedDown(member.guild.id)
        ) {
            console.log(
                `[RAID] RAID DETECTED in ${member.guild.name}`
            );

            await lockdown(
                member.guild,
                `${recentJoins} members joined within ${config.raidTimeWindow} seconds`
            );

            // Find raid logs channel
            const logChannel =
                member.guild.channels.cache.find(
                    channel =>
                        channel.name === "raid-logs"
                );

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("🚨 RAID DETECTED")
                    .setDescription(
                        "Guardian Anti-Raid detected suspicious activity."
                    )
                    .addFields(
                        {
                            name: "Server",
                            value: member.guild.name
                        },
                        {
                            name: "Join Rate",
                            value:
                                `${recentJoins} joins / ${config.raidTimeWindow} seconds`
                        },
                        {
                            name: "Action",
                            value:
                                "🔒 Server lockdown activated"
                        }
                    )
                    .setTimestamp();

                await logChannel.send({
                    embeds: [embed]
                });
            }
        }

        // ===============================
        // LOCKDOWN MEMBER PROTECTION
        // ===============================

        if (isLockedDown(member.guild.id)) {

            // Extremely suspicious account
            if (isExtremelySuspicious(member)) {

                if (config.kickSuspiciousAccounts) {

                    const kicked = await kickMember(
                        member,
                        "Guardian Anti-Raid: extremely suspicious account during raid"
                    );

                    if (kicked) {
                        console.log(
                            `[RAID] Kicked ${member.user.tag}`
                        );
                    }

                    return;
                }

                // Quarantine instead of kick
                if (config.quarantineSuspiciousAccounts) {

                    await quarantineMember(member);

                    console.log(
                        `[RAID] Quarantined ${member.user.tag}`
                    );
                }

                return;
            }

            // Suspicious account age
            if (isSuspiciousAccount(member)) {

                if (config.quarantineSuspiciousAccounts) {

                    await quarantineMember(member);

                    console.log(
                        `[RAID] Quarantined suspicious account ${member.user.tag}`
                    );
                }
            }
        }

    } catch (error) {

        console.error(
            "Anti-raid join handler error:",
            error
        );
    }
});

// ===============================
// SLASH COMMANDS
// ===============================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    try {

        // Administrator check
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

        // ===============================
        // LOCKDOWN
        // ===============================

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

        // ===============================
        // UNLOCK
        // ===============================

        if (interaction.commandName === "unlock") {

            await unlock(interaction.guild);

            await interaction.reply(
                "🔓 **SERVER LOCKDOWN REMOVED**"
            );

            return;
        }

        // ===============================
        // RAID STATUS
        // ===============================

        if (interaction.commandName === "raidstatus") {

            const status = isLockedDown(
                interaction.guild.id
            );

            await interaction.reply(
                status
                    ? "🚨 **RAID LOCKDOWN ACTIVE**"
                    : "🟢 **No lockdown is currently active.**"
            );

            return;
        }

    } catch (error) {

        console.error(
            "Interaction error:",
            error
        );

        if (interaction.replied || interaction.deferred) {

            await interaction.followUp({
                content: "❌ Something went wrong while running that command.",
                ephemeral: true
            });

        } else {

            await interaction.reply({
                content: "❌ Something went wrong while running that command.",
                ephemeral: true
            });
        }
    }
});

// ===============================
// DISCORD ERRORS
// ===============================

client.on("error", error => {
    console.error(
        "Discord client error:",
        error
    );
});

client.on("warn", warning => {
    console.warn(
        "Discord warning:",
        warning
    );
});

// ===============================
// LOGIN
// ===============================

if (!process.env.DISCORD_TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing from environment variables."
    );

    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
