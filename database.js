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

const pool = new Pool({

    connectionString:
        process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    },

    max: 10,

    idleTimeoutMillis:
        30000,

    connectionTimeoutMillis:
        10000
});

let databaseReady = false;

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {

    const client =
        await pool.connect();

    try {

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
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (guild_id, word)
            );
        `);

        // ====================================
        // AUTHORIZED USERS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS authorized_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (guild_id, user_id)
            );
        `);

        // ====================================
        // UNAUTHORIZED USERS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS unauthorized_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (guild_id, user_id)
            );
        `);

        // ====================================
        // AUTHORIZED ROLES
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS authorized_roles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (guild_id, role_id)
            );
        `);

        // ====================================
        // UNAUTHORIZED ROLES
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS unauthorized_roles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (guild_id, role_id)
            );
        `);

        databaseReady = true;

        console.log(
            "✅ PostgreSQL tables are ready."
        );

    } catch (error) {

        databaseReady = false;

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

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const result =
        await pool.query(
            "SELECT NOW() AS time"
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
// BLOCKED WORDS
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        String(word)
            .trim()
            .toLowerCase();

    if (!cleanWord) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO blocked_words
                (guild_id, word)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, word)
            DO NOTHING
            RETURNING word;
            `,
            [
                guildId,
                cleanWord
            ]
        );

    return result.rowCount > 0;
}

async function removeBlockedWord(
    guildId,
    word
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        String(word)
            .trim()
            .toLowerCase();

    const result =
        await pool.query(
            `
            DELETE FROM blocked_words
            WHERE guild_id = $1
            AND word = $2
            RETURNING word;
            `,
            [
                guildId,
                cleanWord
            ]
        );

    return result.rowCount > 0;
}

async function getBlockedWords(
    guildId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId) {
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
            [guildId]
        );

    return result.rows.map(
        row => row.word
    );
}

async function findBlockedWord(
    guildId,
    message
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !message) {
        return null;
    }

    const words =
        await getBlockedWords(
            guildId
        );

    const content =
        String(message)
            .toLowerCase();

    for (const word of words) {

        const escapedWord =
            word.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

        const regex =
            new RegExp(
                `\\b${escapedWord}\\b`,
                "i"
            );

        if (regex.test(content)) {
            return word;
        }
    }

    return null;
}

// ========================================
// AUTHORIZED USERS
// ========================================

async function authorizeUser(
    guildId,
    userId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !userId) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO authorized_users
                (guild_id, user_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, user_id)
            DO NOTHING
            RETURNING user_id;
            `,
            [
                guildId,
                userId
            ]
        );

    // Remove explicit deny.
    await pool.query(
        `
        DELETE FROM unauthorized_users
        WHERE guild_id = $1
        AND user_id = $2;
        `,
        [
            guildId,
            userId
        ]
    );

    return result.rowCount > 0;
}

// ========================================
// UNAUTHORIZED USERS
// ========================================

async function unauthorizeUser(
    guildId,
    userId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !userId) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO unauthorized_users
                (guild_id, user_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, user_id)
            DO NOTHING
            RETURNING user_id;
            `,
            [
                guildId,
                userId
            ]
        );

    // Remove explicit allow.
    await pool.query(
        `
        DELETE FROM authorized_users
        WHERE guild_id = $1
        AND user_id = $2;
        `,
        [
            guildId,
            userId
        ]
    );

    return result.rowCount > 0;
}

// ========================================
// CHECK AUTHORIZED USER
// ========================================

async function isAuthorizedUser(
    guildId,
    userId
) {

    if (!databaseReady) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT user_id
            FROM authorized_users
            WHERE guild_id = $1
            AND user_id = $2
            LIMIT 1;
            `,
            [
                guildId,
                userId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// CHECK UNAUTHORIZED USER
// ========================================

async function isUnauthorizedUser(
    guildId,
    userId
) {

    if (!databaseReady) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT user_id
            FROM unauthorized_users
            WHERE guild_id = $1
            AND user_id = $2
            LIMIT 1;
            `,
            [
                guildId,
                userId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

async function getAuthorizedUsers(
    guildId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const result =
        await pool.query(
            `
            SELECT user_id
            FROM authorized_users
            WHERE guild_id = $1
            ORDER BY created_at ASC;
            `,
            [guildId]
        );

    return result.rows.map(
        row => row.user_id
    );
}

// ========================================
// GET UNAUTHORIZED USERS
// ========================================

async function getUnauthorizedUsers(
    guildId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const result =
        await pool.query(
            `
            SELECT user_id
            FROM unauthorized_users
            WHERE guild_id = $1
            ORDER BY created_at ASC;
            `,
            [guildId]
        );

    return result.rows.map(
        row => row.user_id
    );
}

// ========================================
// AUTHORIZED ROLES
// ========================================

async function authorizeRole(
    guildId,
    roleId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !roleId) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO authorized_roles
                (guild_id, role_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, role_id)
            DO NOTHING
            RETURNING role_id;
            `,
            [
                guildId,
                roleId
            ]
        );

    // Remove explicit deny.
    await pool.query(
        `
        DELETE FROM unauthorized_roles
        WHERE guild_id = $1
        AND role_id = $2;
        `,
        [
            guildId,
            roleId
        ]
    );

    return result.rowCount > 0;
}

// ========================================
// UNAUTHORIZED ROLES
// ========================================

async function unauthorizeRole(
    guildId,
    roleId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId || !roleId) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO unauthorized_roles
                (guild_id, role_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, role_id)
            DO NOTHING
            RETURNING role_id;
            `,
            [
                guildId,
                roleId
            ]
        );

    // Remove explicit allow.
    await pool.query(
        `
        DELETE FROM authorized_roles
        WHERE guild_id = $1
        AND role_id = $2;
        `,
        [
            guildId,
            roleId
        ]
    );

    return result.rowCount > 0;
}

// ========================================
// CHECK AUTHORIZED ROLE
// ========================================

async function isAuthorizedRole(
    guildId,
    roleId
) {

    if (!databaseReady) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT role_id
            FROM authorized_roles
            WHERE guild_id = $1
            AND role_id = $2
            LIMIT 1;
            `,
            [
                guildId,
                roleId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// CHECK UNAUTHORIZED ROLE
// ========================================

async function isUnauthorizedRole(
    guildId,
    roleId
) {

    if (!databaseReady) {
        return false;
    }

    const result =
        await pool.query(
            `
            SELECT role_id
            FROM unauthorized_roles
            WHERE guild_id = $1
            AND role_id = $2
            LIMIT 1;
            `,
            [
                guildId,
                roleId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// GET AUTHORIZED ROLES
// ========================================

async function getAuthorizedRoles(
    guildId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const result =
        await pool.query(
            `
            SELECT role_id
            FROM authorized_roles
            WHERE guild_id = $1
            ORDER BY created_at ASC;
            `,
            [guildId]
        );

    return result.rows.map(
        row => row.role_id
    );
}

// ========================================
// GET UNAUTHORIZED ROLES
// ========================================

async function getUnauthorizedRoles(
    guildId
) {

    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const result =
        await pool.query(
            `
            SELECT role_id
            FROM unauthorized_roles
            WHERE guild_id = $1
            ORDER BY created_at ASC;
            `,
            [guildId]
        );

    return result.rows.map(
        row => row.role_id
    );
}

// ========================================
// AUTO CHANNEL MESSAGE FUNCTIONS
// ========================================

async function setAutoChannelMessage(
    guildId,
    channelId,
    message
) {
    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    if (!guildId || !channelId || !message) {
        return false;
    }

    const result = await pool.query(
        `
        INSERT INTO auto_channel_messages
            (guild_id, channel_id, message)

        VALUES
            ($1, $2, $3)

        ON CONFLICT
            (guild_id, channel_id)

        DO UPDATE SET
            message = EXCLUDED.message

        RETURNING channel_id;
        `,
        [
            guildId,
            channelId,
            message
        ]
    );

    return result.rowCount > 0;
}

async function removeAutoChannelMessage(
    guildId,
    channelId
) {
    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        DELETE FROM auto_channel_messages

        WHERE guild_id = $1
        AND channel_id = $2

        RETURNING channel_id;
        `,
        [
            guildId,
            channelId
        ]
    );

    return result.rowCount > 0;
}

async function getAutoChannelMessage(
    guildId,
    channelId
) {
    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT message

        FROM auto_channel_messages

        WHERE guild_id = $1
        AND channel_id = $2

        LIMIT 1;
        `,
        [
            guildId,
            channelId
        ]
    );

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0].message;
}

async function getAutoChannelMessages(
    guildId
) {
    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT
            channel_id,
            message,
            created_at

        FROM auto_channel_messages

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [guildId]
    );

    return result.rows;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    pool,

    initDatabase,
    testDatabase,
    isDatabaseReady,

    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    isUnauthorizedUser,
    getAuthorizedUsers,
    getUnauthorizedUsers,

    authorizeRole,
    unauthorizeRole,
    isAuthorizedRole,
    isUnauthorizedRole,
    getAuthorizedRoles,
    getUnauthorizedRoles

    setAutoChannelMessage,
removeAutoChannelMessage,
getAutoChannelMessage,
getAutoChannelMessages,
};
