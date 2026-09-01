require("dotenv").config();

const { Pool } = require("pg");

// ========================================
// DATABASE CONFIGURATION
// ========================================

if (!process.env.DATABASE_URL) {
    console.error(
        "❌ DATABASE_URL is missing."
    );

    process.exit(1);
}

const pool =
    new Pool({
        connectionString:
            process.env.DATABASE_URL,

        ssl: {
            rejectUnauthorized:
                false
        },

        max:
            10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000
    });

let databaseReady =
    false;

// ========================================
// BASIC HELPERS
// ========================================

function cleanText(
    value
) {
    return String(
        value ?? ""
    ).trim();
}

function getServerId(
    guild
) {
    if (!guild) {
        return null;
    }

    if (
        typeof guild ===
        "string"
    ) {
        return guild.trim() ||
            null;
    }

    if (
        typeof guild.id ===
        "string"
    ) {
        return guild.id.trim() ||
            null;
    }

    return null;
}

// ========================================
// WORD FILTER NORMALIZATION
// ========================================

function normalizeForWordFilter(
    text
) {
    return String(
        text ?? ""
    )
        .trim()
        .toLowerCase();
}

// ========================================
// REGEX ESCAPE
// ========================================

function escapeRegExp(
    text
) {
    return String(
        text ?? ""
    ).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ========================================
// DATABASE READY CHECK
// ========================================

function requireDatabase() {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }
}

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {
    const client =
        await pool.connect();

    try {
        databaseReady =
            false;

        console.log(
            "🔄 Creating/checking PostgreSQL tables..."
        );

        // ====================================
        // BLOCKED WORDS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS blocked_words (
                guild_id TEXT NOT NULL,
                word TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    word
                )
            );
        `);

        // ====================================
        // AUTHORIZED USERS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS authorized_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    user_id
                )
            );
        `);

        // ====================================
        // UNAUTHORIZED USERS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS unauthorized_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    user_id
                )
            );
        `);

        // ====================================
        // AUTHORIZED ROLES
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS authorized_roles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    role_id
                )
            );
        `);

        // ====================================
        // UNAUTHORIZED ROLES
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS unauthorized_roles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    role_id
                )
            );
        `);

        // ====================================
        // AUTO CATEGORY MESSAGES
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS auto_category_messages (
                guild_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    category_id
                )
            );
        `);

        // ====================================
        // BAN TRIGGER CHANNELS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS ban_trigger_channels (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        databaseReady =
            true;

        console.log(
            "✅ PostgreSQL tables are ready."
        );

        console.log(
            "✅ Blocked-word table ready."
        );

        console.log(
            "✅ Authorization tables ready."
        );

        console.log(
            "✅ Auto-category message table ready."
        );

        console.log(
            "✅ Ban-trigger channel table ready."
        );

        return true;

    } catch (error) {
        databaseReady =
            false;

        console.error(
            "❌ Failed to initialize PostgreSQL:",
            error
        );

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// TEST DATABASE
// ========================================

async function testDatabase() {
    requireDatabase();

    const result =
        await pool.query(
            "SELECT NOW() AS time;"
        );

    console.log(
        `✅ PostgreSQL connection test successful: ${result.rows[0].time}`
    );

    return true;
}

// ========================================
// DATABASE STATUS
// ========================================

function isDatabaseReady() {
    return databaseReady;
}

// ========================================
// ADD BLOCKED WORD
// ========================================

async function addBlockedWord(
    guild,
    word
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        typeof word !==
            "string"
    ) {
        return false;
    }

    const cleanWord =
        normalizeForWordFilter(
            word
        );

    if (!cleanWord) {
        return false;
    }

    if (
        cleanWord.length >
        100
    ) {
        return false;
    }

    if (
        cleanWord.includes(
            "\n"
        ) ||
        cleanWord.includes(
            "\r"
        )
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO blocked_words (
                guild_id,
                word
            )

            VALUES (
                $1,
                $2
            )

            ON CONFLICT (
                guild_id,
                word
            )

            DO NOTHING

            RETURNING word;
            `,
            [
                serverId,
                cleanWord
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// REMOVE BLOCKED WORD
// ========================================

async function removeBlockedWord(
    guild,
    word
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        typeof word !==
            "string"
    ) {
        return false;
    }

    const cleanWord =
        normalizeForWordFilter(
            word
        );

    if (!cleanWord) {
        return false;
    }

    const result =
        await pool.query(
            `
            DELETE FROM blocked_words

            WHERE guild_id = $1
            AND word = $2

            RETURNING word;
            `,
            [
                serverId,
                cleanWord
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// GET BLOCKED WORDS
// ========================================

async function getBlockedWords(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT word

            FROM blocked_words

            WHERE guild_id = $1

            ORDER BY word ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows
        .map(
            row =>
                normalizeForWordFilter(
                    row.word
                )
        )
        .filter(
            Boolean
        );
}

// ========================================
// EXACT BLOCKED-WORD MATCH
// ========================================

async function findBlockedWord(
    guild,
    content
) {
    if (!databaseReady) {
        return null;
    }

    const serverId =
        getServerId(
            guild
        );

    if (
        !serverId ||
        typeof content !==
            "string" ||
        !content
    ) {
        return null;
    }

    const words =
        await getBlockedWords(
            serverId
        );

    if (
        !Array.isArray(words) ||
        words.length === 0
    ) {
        return null;
    }

    const normalizedContent =
        normalizeForWordFilter(
            content
        );

    for (
        const blockedWord of words
    ) {
        if (!blockedWord) {
            continue;
        }

        const regex =
            new RegExp(
                `(?<![\\p{L}\\p{N}_])${escapeRegExp(
                    blockedWord
                )}(?![\\p{L}\\p{N}_])`,
                "iu"
            );

        if (
            regex.test(
                normalizedContent
            )
        ) {
            return blockedWord;
        }
    }

    return null;
}

// ========================================
// AUTHORIZE USER
// ========================================

async function authorizeUser(
    guild,
    userId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanUserId =
        cleanText(
            userId
        );

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN"
        );

        await client.query(
            `
            DELETE FROM unauthorized_users

            WHERE guild_id = $1
            AND user_id = $2;
            `,
            [
                serverId,
                cleanUserId
            ]
        );

        const result =
            await client.query(
                `
                INSERT INTO authorized_users (
                    guild_id,
                    user_id
                )

                VALUES (
                    $1,
                    $2
                )

                ON CONFLICT (
                    guild_id,
                    user_id
                )

                DO NOTHING

                RETURNING user_id;
                `,
                [
                    serverId,
                    cleanUserId
                ]
            );

        await client.query(
            "COMMIT"
        );

        return (
            result.rowCount >
            0
        );

    } catch (error) {
        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// UNAUTHORIZE USER
// ========================================

async function unauthorizeUser(
    guild,
    userId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanUserId =
        cleanText(
            userId
        );

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN"
        );

        await client.query(
            `
            DELETE FROM authorized_users

            WHERE guild_id = $1
            AND user_id = $2;
            `,
            [
                serverId,
                cleanUserId
            ]
        );

        const result =
            await client.query(
                `
                INSERT INTO unauthorized_users (
                    guild_id,
                    user_id
                )

                VALUES (
                    $1,
                    $2
                )

                ON CONFLICT (
                    guild_id,
                    user_id
                )

                DO NOTHING

                RETURNING user_id;
                `,
                [
                    serverId,
                    cleanUserId
                ]
            );

        await client.query(
            "COMMIT"
        );

        return (
            result.rowCount >
            0
        );

    } catch (error) {
        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// IS AUTHORIZED USER
// ========================================

async function isAuthorizedUser(
    guild,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(
            guild
        );

    const cleanUserId =
        cleanText(
            userId
        );

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT 1

            FROM authorized_users

            WHERE guild_id = $1
            AND user_id = $2

            LIMIT 1;
            `,
            [
                serverId,
                cleanUserId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// IS UNAUTHORIZED USER
// ========================================

async function isUnauthorizedUser(
    guild,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(
            guild
        );

    const cleanUserId =
        cleanText(
            userId
        );

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT 1

            FROM unauthorized_users

            WHERE guild_id = $1
            AND user_id = $2

            LIMIT 1;
            `,
            [
                serverId,
                cleanUserId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

async function getAuthorizedUsers(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT user_id

            FROM authorized_users

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows.map(
        row =>
            row.user_id
    );
}

// ========================================
// GET UNAUTHORIZED USERS
// ========================================

async function getUnauthorizedUsers(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT user_id

            FROM unauthorized_users

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows.map(
        row =>
            row.user_id
    );
}

// ========================================
// AUTHORIZE ROLE
// ========================================

async function authorizeRole(
    guild,
    roleId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanRoleId =
        cleanText(
            roleId
        );

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN"
        );

        await client.query(
            `
            DELETE FROM unauthorized_roles

            WHERE guild_id = $1
            AND role_id = $2;
            `,
            [
                serverId,
                cleanRoleId
            ]
        );

        const result =
            await client.query(
                `
                INSERT INTO authorized_roles (
                    guild_id,
                    role_id
                )

                VALUES (
                    $1,
                    $2
                )

                ON CONFLICT (
                    guild_id,
                    role_id
                )

                DO NOTHING

                RETURNING role_id;
                `,
                [
                    serverId,
                    cleanRoleId
                ]
            );

        await client.query(
            "COMMIT"
        );

        return (
            result.rowCount >
            0
        );

    } catch (error) {
        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// UNAUTHORIZE ROLE
// ========================================

async function unauthorizeRole(
    guild,
    roleId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanRoleId =
        cleanText(
            roleId
        );

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN"
        );

        await client.query(
            `
            DELETE FROM authorized_roles

            WHERE guild_id = $1
            AND role_id = $2;
            `,
            [
                serverId,
                cleanRoleId
            ]
        );

        const result =
            await client.query(
                `
                INSERT INTO unauthorized_roles (
                    guild_id,
                    role_id
                )

                VALUES (
                    $1,
                    $2
                )

                ON CONFLICT (
                    guild_id,
                    role_id
                )

                DO NOTHING

                RETURNING role_id;
                `,
                [
                    serverId,
                    cleanRoleId
                ]
            );

        await client.query(
            "COMMIT"
        );

        return (
            result.rowCount >
            0
        );

    } catch (error) {
        await client.query(
            "ROLLBACK"
        );

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// IS AUTHORIZED ROLE
// ========================================

async function isAuthorizedRole(
    guild,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(
            guild
        );

    const cleanRoleId =
        cleanText(
            roleId
        );

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT 1

            FROM authorized_roles

            WHERE guild_id = $1
            AND role_id = $2

            LIMIT 1;
            `,
            [
                serverId,
                cleanRoleId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// IS UNAUTHORIZED ROLE
// ========================================

async function isUnauthorizedRole(
    guild,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(
            guild
        );

    const cleanRoleId =
        cleanText(
            roleId
        );

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT 1

            FROM unauthorized_roles

            WHERE guild_id = $1
            AND role_id = $2

            LIMIT 1;
            `,
            [
                serverId,
                cleanRoleId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// GET AUTHORIZED ROLES
// ========================================

async function getAuthorizedRoles(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT role_id

            FROM authorized_roles

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows.map(
        row =>
            row.role_id
    );
}

// ========================================
// GET UNAUTHORIZED ROLES
// ========================================

async function getUnauthorizedRoles(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT role_id

            FROM unauthorized_roles

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows.map(
        row =>
            row.role_id
    );
}

// ========================================
// SET AUTO CATEGORY MESSAGE
// ========================================

async function setAutoCategoryMessage(
    guild,
    categoryId,
    message
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanCategoryId =
        cleanText(
            categoryId
        );

    const cleanMessage =
        cleanText(
            message
        );

    if (
        !serverId ||
        !cleanCategoryId ||
        !cleanMessage
    ) {
        return false;
    }

    if (
        cleanMessage.length >
        2000
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO auto_category_messages (
                guild_id,
                category_id,
                message,
                updated_at
            )

            VALUES (
                $1,
                $2,
                $3,
                NOW()
            )

            ON CONFLICT (
                guild_id,
                category_id
            )

            DO UPDATE SET
                message =
                    EXCLUDED.message,

                updated_at =
                    NOW()

            RETURNING category_id;
            `,
            [
                serverId,
                cleanCategoryId,
                cleanMessage
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// REMOVE AUTO CATEGORY MESSAGE
// ========================================

async function removeAutoCategoryMessage(
    guild,
    categoryId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanCategoryId =
        cleanText(
            categoryId
        );

    if (
        !serverId ||
        !cleanCategoryId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            DELETE FROM auto_category_messages

            WHERE guild_id = $1
            AND category_id = $2

            RETURNING category_id;
            `,
            [
                serverId,
                cleanCategoryId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// GET AUTO CATEGORY MESSAGE
// ========================================

async function getAutoCategoryMessage(
    guild,
    categoryId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanCategoryId =
        cleanText(
            categoryId
        );

    if (
        !serverId ||
        !cleanCategoryId
    ) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT message

            FROM auto_category_messages

            WHERE guild_id = $1
            AND category_id = $2

            LIMIT 1;
            `,
            [
                serverId,
                cleanCategoryId
            ]
        );

    if (
        result.rowCount ===
        0
    ) {
        return null;
    }

    return (
        result.rows[0].message ??
        null
    );
}

// ========================================
// GET ALL AUTO CATEGORY MESSAGES
// ========================================

async function getAutoCategoryMessages(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return [];
    }

    const result =
        await pool.query(
            `
            SELECT
                category_id,
                message,
                created_at,
                updated_at

            FROM auto_category_messages

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                serverId
            ]
        );

    return result.rows;
}

// ========================================
// SET BAN TRIGGER CHANNEL
// ========================================

async function setBanTriggerChannel(
    guild,
    channelId
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    const cleanChannelId =
        cleanText(
            channelId
        );

    if (
        !serverId ||
        !cleanChannelId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO ban_trigger_channels (
                guild_id,
                channel_id,
                updated_at
            )

            VALUES (
                $1,
                $2,
                NOW()
            )

            ON CONFLICT (
                guild_id
            )

            DO UPDATE SET
                channel_id =
                    EXCLUDED.channel_id,

                updated_at =
                    NOW()

            RETURNING channel_id;
            `,
            [
                serverId,
                cleanChannelId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// REMOVE BAN TRIGGER CHANNEL
// ========================================

async function removeBanTriggerChannel(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return false;
    }

    const result =
        await pool.query(
            `
            DELETE FROM ban_trigger_channels

            WHERE guild_id = $1

            RETURNING channel_id;
            `,
            [
                serverId
            ]
        );

    return (
        result.rowCount >
        0
    );
}

// ========================================
// GET BAN TRIGGER CHANNEL
// ========================================

async function getBanTriggerChannel(
    guild
) {
    requireDatabase();

    const serverId =
        getServerId(
            guild
        );

    if (!serverId) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT channel_id

            FROM ban_trigger_channels

            WHERE guild_id = $1

            LIMIT 1;
            `,
            [
                serverId
            ]
        );

    if (
        result.rowCount ===
        0
    ) {
        return null;
    }

    return (
        result.rows[0].channel_id ??
        null
    );
}

// ========================================
// DATABASE ERROR HANDLER
// ========================================

pool.on(
    "error",
    error => {
        databaseReady =
            false;

        console.error(
            "❌ Unexpected PostgreSQL pool error:",
            error
        );
    }
);

// ========================================
// EXPORTS
// ========================================

module.exports = {
    pool,

    initDatabase,
    testDatabase,
    isDatabaseReady,

    // Helpers
    getServerId,
    normalizeForWordFilter,

    // Blocked words
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    // Users
    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    isUnauthorizedUser,
    getAuthorizedUsers,
    getUnauthorizedUsers,

    // Roles
    authorizeRole,
    unauthorizeRole,
    isAuthorizedRole,
    isUnauthorizedRole,
    getAuthorizedRoles,
    getUnauthorizedRoles,

    // Auto category messages
    setAutoCategoryMessage,
    removeAutoCategoryMessage,
    getAutoCategoryMessage,
    getAutoCategoryMessages,

    // Ban trigger channel
    setBanTriggerChannel,
    removeBanTriggerChannel,
    getBanTriggerChannel
};
