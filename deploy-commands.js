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
// CHECK ENVIRONMENT
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

        console.log("================================");
        console.log(" Guardian Anti-Raid");
        console.log(" Global Command Deployment");
        console.log("================================");

        console.log("");
        console.log("🔄 Registering global commands...");

        const result = await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log("");
        console.log("✅ Global commands registered!");
        console.log("");

        for (const command of result) {
            console.log(`/${command.name}`);
        }

        console.log("");
        console.log(
            "Commands are registered globally."
        );

    } catch (error) {

        console.error("");
        console.error("❌ Command deployment failed.");
        console.error(error);

        process.exit(1);
    }
}

deployCommands();
