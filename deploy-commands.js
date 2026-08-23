require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

// ========================================
// CHECK ENV
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing.");
    process.exit(1);
}

// ========================================
// COMMANDS
// ========================================

const commands = [

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription(
            "Immediately lock the server."
        ),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Remove the server lockdown."
        ),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription(
            "Check the current anti-raid status."
        )

].map(command => command.toJSON());

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ========================================
// LOGIN
// ========================================

client.once("ready", async () => {

    console.log(
        `✅ Logged in as ${client.user.tag}`
    );

    console.log(
        `Found ${client.guilds.cache.size} server(s).`
    );

    const rest = new REST({
        version: "10"
    }).setToken(
        process.env.DISCORD_TOKEN
    );

    // ====================================
    // REGISTER COMMANDS IN EVERY SERVER
    // ====================================

    for (
        const guild of client.guilds.cache.values()
    ) {

        try {

            console.log(
                `🔄 Registering commands in: ${guild.name}`
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
                `❌ Failed in ${guild.name}:`,
                error
            );
        }
    }

    console.log(
        "✅ Command deployment complete."
    );

    process.exit(0);
});

// ========================================
// LOGIN ERROR
// ========================================

client.on("error", error => {

    console.error(
        "❌ Discord error:",
        error
    );

});

client.login(
    process.env.DISCORD_TOKEN
);

new SlashCommandBuilder()
    .setName("authorize")
    .setDescription("Authorize a user to use Guardian.")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user to authorize.")
            .setRequired(true)
    ),

new SlashCommandBuilder()
    .setName("unauthorize")
    .setDescription("Remove a user's Guardian access.")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("The user to unauthorize.")
            .setRequired(true)
    ),

new SlashCommandBuilder()
    .setName("authorized-list")
    .setDescription("Show users authorized to use Guardian.")
