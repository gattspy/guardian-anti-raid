require("dotenv").config();

const { Pool } = require("pg");

// ========================================
// DATABASE CONFIGURATION
// ========================================

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error("❌ DATABASE_URL is missing.");
    console.error("❌ Add DATABASE_URL to Render Environment Variables.");
}

const pool = new Pool({
    connectionString: databaseUrl,

    ssl: {
        rejectUnauthorized: false
    },

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

// ========================================
// DATABASE STATE
// ========================================

let databaseReady = false;

// ========================================
// DATABASE ERROR HANDLER
// ========================================

pool.on("error", error => {

    console.error(
        "❌ PostgreSQL pool error:",
        error.message
    );

});

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {

    if (!databaseUrl) {

        throw new Error(
            "DATABASE_URL environment variable is missing."
        );
    }

    console.log(
        "🔄 Connecting to PostgreSQL..."
    );

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

        databaseReady = true;

        console.log(
            "✅ PostgreSQL tables are ready."
        );

        console.log(
            "✅ Blocked words database ready."
        );

        console.log(
            "✅ Authorized users database ready."
        );

        return true;

    } catch (error) {

        databaseReady = false;

        console.error(
            "❌ PostgreSQL initialization failed:"
        );

        console.error(
            error.message
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

// ========================================
// ADD BLOCKED WORD
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

// ========================================
// REMOVE BLOCKED WORD
// ========================================

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

// ========================================
// GET BLOCKED WORDS
// ========================================

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
            [
                guildId
            ]
        );

    return result.rows.map(
        row => row.word
    );
}

// ========================================
// FIND BLOCKED WORD
// ========================================

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
        String(message).toLowerCase();

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

// ========================================
// AUTHORIZE USER
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

    return result.rowCount > 0;
}

// ========================================
// UNAUTHORIZE USER
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
            DELETE FROM authorized_users

            WHERE guild_id = $1
            AND user_id = $2

            RETURNING user_id;
            `,
            [
                guildId,
                userId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// CHECK AUTHORIZATION
// ========================================

async function isAuthorizedUser(
    guildId,
    userId
) {

    if (!databaseReady) {
        return false;
    }

    if (!guildId || !userId) {
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

    if (!guildId) {
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
                guildId
            ]
        );

    return result.rows.map(
        row => row.user_id
    );
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    pool,

    initDatabase,
    testDatabase,
    isDatabaseReady,

    // Blocked words
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    // Authorized users
    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers
};
