require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType
} = require("discord.js");

// ========================================
// ENVIRONMENT CHECK
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN is missing from .env"
    );

    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error(
        "❌ CLIENT_ID is missing from .env"
    );

    process.exit(1);
}

// ========================================
// SLASH COMMANDS
// ========================================

const commands = [

    // ====================================
    // RAID / SECURITY
    // ====================================

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription(
            "Lock the server during a raid."
        ),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Remove the server lockdown."
        ),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription(
            "Check the current raid status."
        ),

    // ====================================
    // USER AUTHORIZATION
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize")
        .setDescription(
            "Allow a specific user to use Guardian."
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription(
                    "User to authorize."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unauthorize")
        .setDescription(
            "Deny a specific user from using Guardian."
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription(
                    "User to deny."
                )
                .setRequired(true)
        ),

    // ====================================
    // ROLE AUTHORIZATION
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize-role")
        .setDescription(
            "Allow everyone with a role to use Guardian."
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription(
                    "Role to authorize."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unauthorize-role")
        .setDescription(
            "Deny everyone with a role from using Guardian."
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription(
                    "Role to deny."
                )
                .setRequired(true)
        ),

    // ====================================
    // AUTHORIZATION LISTS
    // ====================================

    new SlashCommandBuilder()
        .setName("authorized-list")
        .setDescription(
            "Show all users and roles authorized to use Guardian."
        ),

    new SlashCommandBuilder()
        .setName("unauthorized-list")
        .setDescription(
            "Show all users and roles denied from using Guardian."
        ),

    // ====================================
    // BLOCKED WORDS
    // ====================================

    new SlashCommandBuilder()
        .setName("word-add")
        .setDescription(
            "Add a word to the permanent blocked-word list."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Word to block."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("word-remove")
        .setDescription(
            "Remove a word from the blocked-word list."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Word to remove."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("word-list")
        .setDescription(
            "Show the permanent blocked-word list."
        ),

    // ====================================
    // AUTOMATIC CATEGORY MESSAGES
    // ====================================

    new SlashCommandBuilder()
        .setName("automessage-set")
        .setDescription(
            "Set a multi-line message for new channels in a category."
        )
        .addChannelOption(option =>
            option
                .setName("category")
                .setDescription(
                    "Category to monitor."
                )
                .addChannelTypes(
                    ChannelType.GuildCategory
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("automessage-remove")
        .setDescription(
            "Remove the automatic message from a category."
        )
        .addChannelOption(option =>
            option
                .setName("category")
                .setDescription(
                    "Category to stop monitoring."
                )
                .addChannelTypes(
                    ChannelType.GuildCategory
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("automessage-list")
        .setDescription(
            "Show all configured automatic category messages."
        ),

    // ====================================
    // BAN-TRIGGER CHANNEL
    // ====================================

    new SlashCommandBuilder()
        .setName("ban-channel-set")
        .setDescription(
            "Set a channel where sending a message automatically bans the member."
        )
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription(
                    "Channel that will trigger the automatic ban."
                )
                .addChannelTypes(
                    ChannelType.GuildText
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ban-channel-remove")
        .setDescription(
            "Disable the automatic ban-trigger channel."
        ),

    new SlashCommandBuilder()
        .setName("ban-channel-status")
        .setDescription(
            "Show the current automatic ban-trigger channel."
        )

].map(
    command => command.toJSON()
);

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
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
            "================================"
        );

        console.log(
            "🛡️ GUARDIAN COMMAND DEPLOYER"
        );

        console.log(
            "================================"
        );

        console.log(
            `✅ Logged in as ${client.user.tag}`
        );

        console.log(
            `📡 Found ${client.guilds.cache.size} server(s)`
        );

        console.log(
            `📋 Preparing ${commands.length} command(s)`
        );

        const rest =
            new REST({
                version: "10"
            }).setToken(
                process.env.DISCORD_TOKEN
            );

        // ====================================
        // REGISTER COMMANDS
        // ====================================

        for (
            const guild of
            client.guilds.cache.values()
        ) {

            try {

                console.log(
                    `🔄 Registering ${commands.length} commands in: ${guild.name}`
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
                    `✅ Commands registered in: ${guild.name}`
                );

            } catch (error) {

                console.error(
                    `❌ Failed to register commands in ${guild.name}:`
                );

                console.error(
                    error
                );
            }
        }

        console.log(
            "================================"
        );

        console.log(
            "✅ COMMAND DEPLOYMENT COMPLETE"
        );

        console.log(
            `📋 ${commands.length} commands deployed`
        );

        console.log(
            "================================"
        );

        client.destroy();

        process.exit(0);
    }
);

// ========================================
// ERROR
// ========================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord client error:",
            error
        );
    }
);

// ========================================
// LOGIN
// ========================================

client.login(
    process.env.DISCORD_TOKEN
).catch(error => {

    console.error(
        "❌ Failed to login to Discord:"
    );

    console.error(
        error
    );

    process.exit(1);
});
