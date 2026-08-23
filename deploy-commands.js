require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

// ========================================
// GUARDIAN ANTI-RAID COMMANDS
// ========================================

const commands = [

    // /lockdown
    new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription("Immediately lock the server during a raid."),

    // /unlock
    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Remove the current server lockdown."),

    // /raidstatus
    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription("Check the current anti-raid status.")

].map(command => command.toJSON());

// ========================================
// CHECK ENVIRONMENT VARIABLES
// ========================================

console.log("========================================");
console.log(" Guardian Anti-Raid Command Deployment");
console.log("========================================");

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

console.log("✅ DISCORD_TOKEN found");
console.log(`✅ CLIENT_ID: ${process.env.CLIENT_ID}`);
console.log(`✅ GUILD_ID: ${process.env.GUILD_ID}`);
console.log(`✅ Commands: ${commands.length}`);

// ========================================
// DISCORD REST API
// ========================================

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

// ========================================
// DEPLOY COMMANDS
// ========================================

async function deployCommands() {

    try {

        console.log("");
        console.log("🔄 Registering slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("");
        console.log("========================================");
        console.log(" ✅ COMMANDS REGISTERED SUCCESSFULLY");
        console.log("========================================");
        console.log("");
        console.log("Available commands:");

        for (const command of commands) {
            console.log(`  /${command.name}`);
        }

        console.log("");

    } catch (error) {

        console.error("");
        console.error("========================================");
        console.error(" ❌ COMMAND DEPLOYMENT FAILED");
        console.error("========================================");

        console.error(error);

        if (error.code === 401) {
            console.error("");
            console.error("Your DISCORD_TOKEN is invalid.");
        }

        if (error.code === 403) {
            console.error("");
            console.error(
                "The bot does not have permission to register commands."
            );
        }

        if (error.code === 404) {
            console.error("");
            console.error(
                "Check your CLIENT_ID and GUILD_ID."
            );
        }

        process.exit(1);
    }
}

// ========================================
// START
// ========================================

deployCommands();
