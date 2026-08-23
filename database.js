require("dotenv").config();

const { Pool } = require("pg");

// ========================================
// DATABASE CONNECTION
// ========================================

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    },

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {

    console.log("🔄 Initializing PostgreSQL database...");

    try {

        // ------------------------------------
        // BLOCKED WORDS
        // ------------------------------------

        await pool.query(`
            CREATE TABLE IF NOT EXISTS blocked_words (
                guild_id TEXT NOT NULL,
                word TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (guild_id, word)
            );
        `);

        console.log(
            "✅ blocked_words table is ready."
        );

        // ------------------------------------
        // AUTHORIZED USERS
        // ------------------------------------

        await pool.query(`
            CREATE TABLE IF NOT EXISTS authorized_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (guild_id, user_id)
            );
        `);

        console.log(
            "✅ authorized_users table is ready."
        );

        // ------------------------------------
        // WHITELISTED USERS
        // ------------------------------------

        await pool.query(`
            CREATE TABLE IF NOT EXISTS whitelisted_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (guild_id, user_id)
            );
        `);

        console.log(
            "✅ whitelisted_users table is ready."
        );

        console.log(
            "✅ PostgreSQL database initialization complete."
        );

        return true;

    } catch (error) {

        console.error(
            "❌ DATABASE INITIALIZATION FAILED"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// TEST DATABASE
// ========================================

async function testDatabase() {

    try {

        const result =
            await pool.query(
                "SELECT NOW() AS time"
            );

        console.log(
            `✅ Database connection successful: ${result.rows[0].time}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Database connection test failed:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// ADD BLOCKED WORD
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        word
            .trim()
            .toLowerCase();

    if (!cleanWord) {
        return false;
    }

    try {

        await pool.query(
            `
            INSERT INTO blocked_words
                (guild_id, word)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, word)
            DO NOTHING
            `,
            [
                guildId,
                cleanWord
            ]
        );

        console.log(
            `[DATABASE] Added blocked word "${cleanWord}" to guild ${guildId}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Failed to add blocked word:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// REMOVE BLOCKED WORD
// ========================================

async function removeBlockedWord(
    guildId,
    word
) {

    if (!guildId || !word) {
        return false;
    }

    const cleanWord =
        word
            .trim()
            .toLowerCase();

    try {

        const result =
            await pool.query(
                `
                DELETE FROM blocked_words
                WHERE guild_id = $1
                AND word = $2
                `,
                [
                    guildId,
                    cleanWord
                ]
            );

        return result.rowCount > 0;

    } catch (error) {

        console.error(
            "❌ Failed to remove blocked word:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// GET BLOCKED WORDS
// ========================================

async function getBlockedWords(
    guildId
) {

    if (!guildId) {
        return [];
    }

    try {

        const result =
            await pool.query(
                `
                SELECT word
                FROM blocked_words
                WHERE guild_id = $1
                ORDER BY word ASC
                `,
                [guildId]
            );

        return result.rows.map(
            row => row.word
        );

    } catch (error) {

        console.error(
            "❌ Failed to get blocked words:"
        );

        console.error(error);

        return [];
    }
}

// ========================================
// FIND BLOCKED WORD
// ========================================

async function findBlockedWord(
    guildId,
    message
) {

    if (!guildId || !message) {
        return null;
    }

    try {

        const words =
            await getBlockedWords(
                guildId
            );

        const content =
            message.toLowerCase();

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

            if (
                regex.test(content)
            ) {

                return word;
            }
        }

        return null;

    } catch (error) {

        console.error(
            "❌ Failed to check blocked words:"
        );

        console.error(error);

        return null;
    }
}

// ========================================
// AUTHORIZE USER
// ========================================

async function authorizeUser(
    guildId,
    userId
) {

    try {

        await pool.query(
            `
            INSERT INTO authorized_users
                (guild_id, user_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, user_id)
            DO NOTHING
            `,
            [
                guildId,
                userId
            ]
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Failed to authorize user:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// UNAUTHORIZE USER
// ========================================

async function unauthorizeUser(
    guildId,
    userId
) {

    try {

        const result =
            await pool.query(
                `
                DELETE FROM authorized_users
                WHERE guild_id = $1
                AND user_id = $2
                `,
                [
                    guildId,
                    userId
                ]
            );

        return result.rowCount > 0;

    } catch (error) {

        console.error(
            "❌ Failed to unauthorize user:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// CHECK AUTHORIZED USER
// ========================================

async function isAuthorizedUser(
    guildId,
    userId
) {

    try {

        const result =
            await pool.query(
                `
                SELECT 1
                FROM authorized_users
                WHERE guild_id = $1
                AND user_id = $2
                LIMIT 1
                `,
                [
                    guildId,
                    userId
                ]
            );

        return result.rowCount > 0;

    } catch (error) {

        console.error(
            "❌ Failed to check authorized user:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

async function getAuthorizedUsers(
    guildId
) {

    try {

        const result =
            await pool.query(
                `
                SELECT user_id
                FROM authorized_users
                WHERE guild_id = $1
                ORDER BY created_at ASC
                `,
                [guildId]
            );

        return result.rows.map(
            row => row.user_id
        );

    } catch (error) {

        console.error(
            "❌ Failed to get authorized users:"
        );

        console.error(error);

        return [];
    }
}

// ========================================
// WHITELIST USER
// ========================================

async function whitelistUser(
    guildId,
    userId
) {

    try {

        await pool.query(
            `
            INSERT INTO whitelisted_users
                (guild_id, user_id)
            VALUES
                ($1, $2)
            ON CONFLICT
                (guild_id, user_id)
            DO NOTHING
            `,
            [
                guildId,
                userId
            ]
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Failed to whitelist user:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// REMOVE WHITELIST
// ========================================

async function removeWhitelist(
    guildId,
    userId
) {

    try {

        const result =
            await pool.query(
                `
                DELETE FROM whitelisted_users
                WHERE guild_id = $1
                AND user_id = $2
                `,
                [
                    guildId,
                    userId
                ]
            );

        return result.rowCount > 0;

    } catch (error) {

        console.error(
            "❌ Failed to remove whitelist:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// CHECK WHITELIST
// ========================================

async function isWhitelisted(
    guildId,
    userId
) {

    try {

        const result =
            await pool.query(
                `
                SELECT 1
                FROM whitelisted_users
                WHERE guild_id = $1
                AND user_id = $2
                LIMIT 1
                `,
                [
                    guildId,
                    userId
                ]
            );

        return result.rowCount > 0;

    } catch (error) {

        console.error(
            "❌ Failed to check whitelist:"
        );

        console.error(error);

        return false;
    }
}

// ========================================
// CLOSE DATABASE
// ========================================

async function closeDatabase() {

    await pool.end();

    console.log(
        "🛑 PostgreSQL connection closed."
    );
}

// ========================================
// EXPORTS
// ========================================

module.exports = {

    pool,

    initDatabase,
    testDatabase,

    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    getAuthorizedUsers,

    whitelistUser,
    removeWhitelist,
    isWhitelisted,

    closeDatabase
};
