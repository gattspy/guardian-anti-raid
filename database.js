require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {

    try {

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

    } catch (error) {

        console.error(
            "❌ Failed to initialize database:",
            error
        );

        throw error;
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
            `✅ Database test successful: ${result.rows[0].time}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Database test failed:",
            error
        );

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
        word.trim().toLowerCase();

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
            `[DATABASE] Added blocked word "${cleanWord}" to ${guildId}`
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Failed to add blocked word:",
            error
        );

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
        word.trim().toLowerCase();

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
            "❌ Failed to remove blocked word:",
            error
        );

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
            "❌ Failed to get blocked words:",
            error
        );

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

            if (regex.test(content)) {
                return word;
            }
        }

        return null;

    } catch (error) {

        console.error(
            "❌ Failed to find blocked word:",
            error
        );

        return null;
    }
}

// ========================================
// CLOSE DATABASE
// ========================================

async function closeDatabase() {

    await pool.end();

    console.log(
        "🛑 Database connection closed."
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

    closeDatabase
};
