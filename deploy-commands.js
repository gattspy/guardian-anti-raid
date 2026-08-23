require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

// ==============================
// COMMANDS
// ==============================

const commands = [

    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription("Immediately lock the server during a raid."),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Remove the current server lockdown."),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription("Check the current anti-raid status.")

].map(command => command.toJSON());

// ==============================
// ENVIRONMENT
// ==============================

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing.");
    process.exit(1);
}

// ==============================
// DISCORD API
// ==============================

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

// ==============================
// DEPLOY GLOBAL COMMANDS
// ==============================

async function deployCommands() {

    try {

        console.log("🔄 Registering global slash commands...");

        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log("================================");
        console.log("✅ GLOBAL COMMANDS REGISTERED");
        console.log("================================");

        console.log("");
        console.log("Available commands:");

        console.log("/lockdown");
        console.log("/unlock");
        console.log("/raidstatus");

        console.log("");
        console.log("Commands are now registered globally.");

    } catch (error) {

        console.error("❌ Failed to register commands:");
        console.error(error);

        process.exit(1);
    }
}

deployCommands();
