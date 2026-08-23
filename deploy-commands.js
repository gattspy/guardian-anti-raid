require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

// ========================================
// ENVIRONMENT CHECK
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from .env");
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing from .env");
    process.exit(1);
}

// ========================================
// SLASH COMMANDS
// ========================================

const commands = [

    // ====================================
    // LOCKDOWN
    // ====================================

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription("Lock the server during a raid."),

    // ====================================
    // UNLOCK
    // ====================================

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Remove the server lockdown."),

    // ====================================
    // RAID STATUS
    // ====================================

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription("Check the current raid status."),

    // ====================================
    // AUTHORIZE
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize")
        .setDescription("Allow a user to use Guardian.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("User to authorize.")
                .setRequired(true)
        ),

    // ====================================
    // UNAUTHORIZE
    // ====================================

    new SlashCommandBuilder()
        .setName("unauthorize")
        .setDescription("Remove a user's Guardian access.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("User to unauthorize.")
                .setRequired(true)
        ),

    // ====================================
    // AUTHORIZED LIST
    // ====================================

    new SlashCommandBuilder()
        .setName("authorized-list")
        .setDescription("Show users authorized to use Guardian."),

    // ====================================
    // WORD ADD
    // ====================================

    new SlashCommandBuilder()
        .setName("word-add")
        .setDescription("Add a word to the blocked-word list.")
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription("Word to block.")
                .setRequired(true)
        ),

    // ====================================
    // WORD REMOVE
    // ====================================

    new SlashCommandBuilder()
        .setName("word-remove")
        .setDescription("Remove a word from the blocked-word list.")
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription("Word to remove.")
                .setRequired(true)
        ),

    // ====================================
    // WORD LIST
    // ====================================

    new SlashCommandBuilder()
        .setName("word-list")
        .setDescription("Show the blocked-word list.")

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
// BOT READY
// ========================================

client.once("ready", async () => {

    console.log("================================");
    console.log("🛡️ GUARDIAN COMMAND DEPLOYER");
    console.log("================================");

    console.log(
        `✅ Logged in as ${client.user.tag}`
    );

    console.log(
        `📡 Found ${client.guilds.cache.size} server(s)`
    );

    const rest = new REST({
        version: "10"
    }).setToken(
        process.env.DISCORD_TOKEN
    );

    // ====================================
    // REGISTER COMMANDS
    // ====================================

    for (const guild of client.guilds.cache.values()) {

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
                `✅ Commands registered in: ${guild.name}`
            );

        } catch (error) {

            console.error(
                `❌ Failed to register commands in ${guild.name}:`,
                error.message
            );

        }
    }

    console.log("================================");
    console.log("✅ COMMAND DEPLOYMENT COMPLETE");
    console.log("================================");

    client.destroy();
    process.exit(0);
});

// ========================================
// LOGIN
// ========================================

client.login(
    process.env.DISCORD_TOKEN
);
