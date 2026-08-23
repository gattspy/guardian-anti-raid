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
        .setDescription("Lock the server during a raid."),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Remove the server lockdown."),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription("Check the current anti-raid status.")

].map(command => command.toJSON());

// ==============================
// CHECK ENVIRONMENT VARIABLES
// ==============================

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error("❌ CLIENT_ID is missing.");
    process.exit(1);
}

if (!process.env.GUILD_ID) {
    console.error("❌ GUILD_ID is missing.");
    process.exit(1);
}

// ==============================
// DISCORD API
// ==============================

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

// ==============================
// REGISTER COMMANDS
// ==============================

async function deployCommands() {

    try {

        console.log("Registering slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("✅ Slash commands registered successfully.");

    } catch (error) {

        console.error("❌ Failed to register commands:");
        console.error(error);

        process.exit(1);
    }
}

deployCommands();
