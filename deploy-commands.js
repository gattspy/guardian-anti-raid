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
        .setDescription("Remove the server lockdown."),

    new SlashCommandBuilder()
        .setName("raidstatus")
        .setDescription("Check the current anti-raid status.")

].map(command => command.toJSON());

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

(async () => {

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

        console.log(
            "Slash commands registered successfully."
        );

    } catch (error) {

        console.error(error);

    }

})();
