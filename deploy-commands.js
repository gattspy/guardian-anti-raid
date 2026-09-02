require("dotenv").config();

const {
    Client,
    Events,
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
    // RAID AND SECURITY
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
        .addUserOption(
            option =>
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
        .addUserOption(
            option =>
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
        .addRoleOption(
            option =>
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
        .addRoleOption(
            option =>
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
        .addStringOption(
            option =>
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
        .addStringOption(
            option =>
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
        .addChannelOption(
            option =>
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
        .addChannelOption(
            option =>
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
        .addChannelOption(
            option =>
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

].map(
    command =>
        command.toJSON()
);

// ========================================
// CHECK FOR DUPLICATE COMMAND NAMES
// ========================================

function checkForDuplicateNames() {
    const commandNames =
        commands.map(
            command =>
                command.name
        );

    const duplicateNames =
        commandNames.filter(
            (name, index) =>
                commandNames.indexOf(name) !==
                index
        );

    if (duplicateNames.length > 0) {
        const uniqueDuplicates =
            [
                ...new Set(
                    duplicateNames
                )
            ];

        throw new Error(
            `Duplicate command names found: ${
                uniqueDuplicates.join(", ")
            }`
        );
    }
}

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
// TEMPORARY DISCORD CLIENT
// ========================================

// This client is only used by the deployer
// to find servers containing old guild commands.
const deployClient =
    new Client({
        intents: [
            GatewayIntentBits.Guilds
        ]
    });

// ========================================
// WAIT FOR CLIENT READY
// ========================================

function waitForReady(client) {
    if (client.isReady()) {
        return Promise.resolve();
    }

    return new Promise(
        (resolve, reject) => {
            const timeout =
                setTimeout(
                    () => {
                        reject(
                            new Error(
                                "Discord client did not become ready in time."
                            )
                        );
                    },
                    30000
                );

            client.once(
                Events.ClientReady,
                () => {
                    clearTimeout(
                        timeout
                    );

                    resolve();
                }
            );
        }
    );
}

// ========================================
// REMOVE OLD SERVER COMMANDS
// ========================================

async function removeOldGuildCommands() {
    console.log(
        "🔍 Checking for old server-specific commands..."
    );

    const guilds =
        await deployClient
            .guilds
            .fetch();

    if (guilds.size === 0) {
        console.log(
            "✅ No servers found with old guild commands."
        );

        return 0;
    }

    let clearedGuilds = 0;

    for (
        const [
            guildId,
            guild
        ] of guilds
    ) {
        try {
            const oldCommands =
                await rest.get(
                    Routes.applicationGuildCommands(
                        process.env.CLIENT_ID,
                        guildId
                    )
                );

            if (
                !Array.isArray(oldCommands) ||
                oldCommands.length === 0
            ) {
                console.log(
                    `✅ No old server commands in ${
                        guild.name ??
                        guildId
                    }`
                );

                continue;
            }

            await rest.put(
                Routes.applicationGuildCommands(
                    process.env.CLIENT_ID,
                    guildId
                ),
                {
                    body: []
                }
            );

            clearedGuilds++;

            console.log(
                `🧹 Removed ${
                    oldCommands.length
                } old server command(s) from ${
                    guild.name ??
                    guildId
                }`
            );

        } catch (error) {
            console.error(
                `❌ Could not clear old commands from ${
                    guild.name ??
                    guildId
                }:`,
                error?.rawError ??
                error
            );
        }
    }

    return clearedGuilds;
}

// ========================================
// REGISTER GLOBAL COMMANDS
// ========================================

async function registerGlobalCommands() {
    console.log(
        `📋 Registering ${commands.length} global command(s)...`
    );

    // PUT replaces the complete global command list.
    // It does not add another copy to the existing list.
    const deployed =
        await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

    return Array.isArray(deployed)
        ? deployed
        : [];
}

// ========================================
// DEPLOY COMMANDS
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

        checkForDuplicateNames();

        console.log(
            `📋 ${commands.length} unique command(s) prepared`
        );

        console.log(
            "🌍 Final registration type: GLOBAL"
        );

        const readyPromise =
            waitForReady(
                deployClient
            );

        await deployClient.login(
            process.env.DISCORD_TOKEN
        );

        await readyPromise;

        console.log(
            `🤖 Connected as ${deployClient.user.tag}`
        );

        const clearedGuilds =
            await removeOldGuildCommands();

        const deployed =
            await registerGlobalCommands();

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
            `📋 ${deployed.length} global command(s) deployed`
        );

        console.log(
            `🧹 ${clearedGuilds} server(s) had old commands removed`
        );

        console.log(
            `🤖 Application ID: ${process.env.CLIENT_ID}`
        );

        console.log(
            "🌍 No fixed GUILD_ID was used"
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

        console.error(
            error?.rawError ??
            error
        );

        if (
            error?.status === 401 ||
            error?.code === 0
        ) {
            console.error(
                "❌ Check your DISCORD_TOKEN."
            );
        }

        if (error?.status === 404) {
            console.error(
                "❌ Check your CLIENT_ID."
            );
        }

        process.exitCode = 1;

    } finally {
        if (
            deployClient &&
            !deployClient.destroyed
        ) {
            deployClient.destroy();
        }
    }
}

// ========================================
// PROCESS ERROR HANDLERS
// ========================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled promise rejection:",
            error
        );

        process.exitCode = 1;
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught exception:",
            error
        );

        process.exitCode = 1;
    }
);

// ========================================
// RUN DEPLOYMENT
// ========================================

deployCommands();
