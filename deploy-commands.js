require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}

if (!process.env.CLIENT_ID) {

    console.error(
        "❌ CLIENT_ID is missing."
    );

    process.exit(1);
}

// ========================================
// COMMANDS
// ========================================

const commands = [

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription(
            "Lock the server."
        ),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Unlock the server."
        ),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription(
            "Check raid status."
        ),

    // ====================================
    // AUTHORIZE
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize")
        .setDescription(
            "Allow a user to use Guardian."
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription(
                    "User to authorize."
                )
                .setRequired(true)
        ),

    // ====================================
    // UNAUTHORIZE
    // ====================================

    new SlashCommandBuilder()
        .setName("unauthorize")
        .setDescription(
            "Remove a user's Guardian access."
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription(
                    "User to unauthorize."
                )
                .setRequired(true)
        ),

    // ====================================
    // AUTHORIZED LIST
    // ====================================

    new SlashCommandBuilder()
        .setName("authorized-list")
        .setDescription(
            "Show users authorized to use Guardian."
        ),

    // ====================================
    // WORD ADD
    // ====================================

    new SlashCommandBuilder()
        .setName("word-add")
        .setDescription(
            "Add a blocked word."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Word to block."
                )
                .setRequired(true)
        ),

    // ====================================
    // WORD REMOVE
    // ====================================

    new SlashCommandBuilder()
        .setName("word-remove")
        .setDescription(
            "Remove a blocked word."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Word to remove."
                )
                .setRequired(true)
        ),

    // ====================================
    // WORD LIST
    // ====================================

    new SlashCommandBuilder()
        .setName("word-list")
        .setDescription(
            "Show blocked words."
        )

].map(
    command => command.toJSON()
);

// ========================================
// DISCORD CLIENT
// ========================================

const client =
    new Client({

        intents: [
            GatewayIntentBits.Guilds
        ]

    });

// ========================================
// READY
// ========================================

client.once(
    "ready",
    async () => {

        console.log(
            `✅ Logged in as ${client.user.tag}`
        );

        console.log(
            `Found ${client.guilds.cache.size} server(s).`
        );

        const rest =
            new REST({
                version: "10"
            }).setToken(
                process.env.DISCORD_TOKEN
            );

        for (
            const guild of
            client.guilds.cache.values()
        ) {

            try {

                console.log(
                    `🔄 Registering commands in ${guild.name}`
                );

                await rest.put(

                    Routes.applicationGuildCommands(
                        process.env.CLIENT_ID,
                        guild.id
                    ),

                    {
                        body: commands
                    }

                );

                console.log(
                    `✅ Commands registered in ${guild.name}`
                );

            } catch (error) {

                console.error(
                    `❌ Could not register commands in ${guild.name}:`,
                    error
                );

            }
        }

        console.log(
            "✅ Command deployment complete."
        );

        process.exit(0);
    }
);

client.login(
    process.env.DISCORD_TOKEN
);
