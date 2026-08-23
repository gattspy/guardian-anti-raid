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

const app = express();

const PORT = process.env.PORT || 10000;

/*
    Render health check.
*/
app.get("/", (req, res) => {
    res.send("Guardian Anti-Raid is online.");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server running on port ${PORT}`);
});

/*
    Discord client.
*/
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/*
    Bot ready.
*/
client.once("ready", () => {
    console.log(
        `Guardian Anti-Raid logged in as ${client.user.tag}`
    );

    console.log(
        `Monitoring ${client.guilds.cache.size} server(s)`
    );
});

/*
    MEMBER JOIN
*/
client.on("guildMemberAdd", async member => {
    try {
        console.log(
            `[JOIN] ${member.user.tag} joined ${member.guild.name}`
        );

        /*
            Ignore bots.
        */
        if (member.user.bot) {
            return;
        }

        /*
            Whitelisted users are never treated
            as raid suspects.
        */
        if (isWhitelisted(member)) {
            return;
        }

        /*
            Record the join.
        */
        const recentJoins = recordJoin(
            member.guild.id,
            member.id
        );

        console.log(
            `[JOIN RATE] ${recentJoins} joins in the current window`
        );

        /*
            Check whether the join rate indicates
            a possible raid.
        */
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

            /*
                Alert server logs.
            */
            const logChannel =
                member.guild.channels.cache.find(
                    channel =>
                        channel.name === "raid-logs"
                );

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("🚨 RAID DETECTED")
                    .setDescription(
                        `Guardian Anti-Raid detected suspicious activity.`
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
                                `🔒 Server lockdown activated`
                        }
                    )
                    .setTimestamp();

                await logChannel.send({
                    embeds: [embed]
                });
            }
        }

        /*
            If the server is currently locked down,
            treat new members more aggressively.
        */
        if (isLockedDown(member.guild.id)) {

            /*
                Extremely new accounts.
            */
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

                /*
                    Otherwise quarantine them.
                */
                if (config.quarantineSuspiciousAccounts) {
                    await quarantineMember(member);

                    console.log(
                        `[RAID] Quarantined ${member.user.tag}`
                    );
                }

                return;
            }

            /*
                Accounts under the suspicious age threshold.
            */
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

/*
    Discord errors.
*/
client.on("error", error => {
    console.error("Discord client error:", error);
});

/*
    Login.
*/
client.login(process.env.DISCORD_TOKEN);
