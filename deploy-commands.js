require("dotenv").config();

const {
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
            "Check the current Guardian raid status."
        ),

    // ====================================
    // USER AUTHORIZATION
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize")
        .setDescription(
            "Authorize a user to use Guardian."
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
            "Remove Guardian authorization from a user."
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
    // ROLE AUTHORIZATION
    // ====================================

    new SlashCommandBuilder()
        .setName("authorize-role")
        .setDescription(
            "Authorize a role to use Guardian."
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
            "Remove Guardian authorization from a role."
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription(
                    "Role to unauthorize."
                )
                .setRequired(true)
        ),

    // ====================================
    // AUTHORIZATION LISTS
    // ====================================

    new SlashCommandBuilder()
        .setName("authorized-list")
        .setDescription(
            "Show users and roles authorized to use Guardian."
        ),

    new SlashCommandBuilder()
        .setName("unauthorized-list")
        .setDescription(
            "Show users and roles explicitly denied Guardian access."
        ),

    // ====================================
    // BLOCKED WORDS
    // ====================================

    new SlashCommandBuilder()
        .setName("word-add")
        .setDescription(
            "Add an exact word to Guardian's blocked-word list."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Exact word to block."
                )
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("word-remove")
        .setDescription(
            "Remove a word from Guardian's blocked-word list."
        )
        .addStringOption(option =>
            option
                .setName("word")
                .setDescription(
                    "Blocked word to remove."
                )
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("word-list")
        .setDescription(
            "Show Guardian's blocked-word list."
        ),

    // ====================================
    // AUTOMATIC CATEGORY MESSAGES
    // ====================================

    new SlashCommandBuilder()
        .setName("automessage-set")
        .setDescription(
            "Set a message for newly created channels in a category."
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
            "Set a channel that bans non-admin users who send messages in it."
        )
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription(
                    "Text channel to use as the ban-trigger channel."
                )
                .addChannelTypes(
                    ChannelType.GuildText
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ban-channel-remove")
        .setDescription(
            "Disable the current ban-trigger channel."
        ),

    new SlashCommandBuilder()
        .setName("ban-channel-status")
        .setDescription(
            "Show the current ban-trigger channel."
        )

].map(command =>
    command.toJSON()
);

// ========================================
// REST CLIENT
// ========================================

const rest =
    new REST({
        version: "10"
    }).setToken(
        process.env.DISCORD_TOKEN
    );

// ========================================
// DEPLOY GLOBAL COMMANDS
// ========================================

async function deployCommands() {
    try {
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
            `📋 Preparing ${commands.length} command(s)`
        );

        console.log(
            "🌍 Registration type: GLOBAL"
        );

        console.log(
            "🔄 Registering slash commands..."
        );

        const deployed =
            await rest.put(
                Routes.applicationCommands(
                    process.env.CLIENT_ID
                ),
                {
                    body:
                        commands
                }
            );

        console.log(
            "================================"
        );

        console.log(
            "✅ GLOBAL COMMANDS REGISTERED"
        );

        console.log(
            "================================"
        );

        console.log(
            `📋 ${Array.isArray(deployed)
                ? deployed.length
                : commands.length} command(s) deployed`
        );

        console.log(
            `🤖 Application ID: ${process.env.CLIENT_ID}`
        );

        console.log(
            "🌍 Registration: GLOBAL"
        );

        console.log(
            "================================"
        );

        console.log(
            "✅ COMMAND DEPLOYMENT COMPLETE"
        );

        console.log(
            "================================"
        );

    } catch (error) {
        console.error(
            "================================"
        );

        console.error(
            "❌ COMMAND DEPLOYMENT FAILED"
        );

        console.error(
            "================================"
        );

        if (
            error?.rawError
        ) {
            console.error(
                error.rawError
            );
        } else {
            console.error(
                error
            );
        }

        if (
            error?.status === 401 ||
            error?.code === 0
        ) {
            console.error(
                "❌ Check your DISCORD_TOKEN."
            );
        }

        if (
            error?.status === 404
        ) {
            console.error(
                "❌ Check your CLIENT_ID."
            );
        }

        process.exitCode =
            1;
    }
}

// ========================================
// UNHANDLED PROMISE REJECTIONS
// ========================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled promise rejection:",
            error
        );
    }
);

// ========================================
// UNCAUGHT EXCEPTIONS
// ========================================

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught exception:",
            error
        );

        process.exitCode =
            1;
    }
);

// ========================================
// RUN DEPLOYMENT
// ========================================

deployCommands();
