require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

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

console.log("");
console.log("================================");
console.log(" GUARDIAN COMMAND DEPLOYER");
console.log("================================");
console.log("");

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
console.log("");

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
    try {

        console.log("🔄 Registering commands...");
        console.log("");

        const result = await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("================================");
        console.log("✅ COMMANDS REGISTERED");
        console.log("================================");
        console.log("");

        console.log(`Registered ${result.length} commands:`);
        console.log("");

        for (const command of result) {
            console.log(`✅ /${command.name}`);
        }

        console.log("");
        console.log("Server ID:");
        console.log(process.env.GUILD_ID);
        console.log("");

    } catch (error) {

        console.error("");
        console.error("================================");
        console.error("❌ COMMAND REGISTRATION FAILED");
        console.error("================================");
        console.error("");

        console.error(error);

        process.exit(1);
    }
}

deployCommands();
