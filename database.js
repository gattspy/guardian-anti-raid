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
                id SERIAL PRIMARY KEY,
                guild_id TEXT NOT NULL,
                word TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, word)
            );
        `);

        console.log("✅ Database initialized.");

    } catch (error) {

        console.error(
            "❌ Database initialization failed:",
            error
        );

        throw error;
    }
}

// ========================================
// ADD BLOCKED WORD
// ========================================

async function addBlockedWord(
    guildId,
    word
) {

    const cleanWord =
        word
            .trim()
            .toLowerCase();

    if (!guildId || !cleanWord) {
        return false;
    }

    try {

        await pool.query(
            `
            INSERT INTO blocked_words
                (guild_id, word)
            VALUES
                ($1, $2)
            ON CONFLICT (guild_id, word)
            DO NOTHING
            `,
            [
                guildId,
                cleanWord
            ]
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

    const cleanWord =
        word
            .trim()
            .toLowerCase();

    if (!guildId || !cleanWord) {
        return false;
    }

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
                [
                    guildId
                ]
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

    if (
        !guildId ||
        !message
    ) {
        return null;
    }

    const words =
        await getBlockedWords(guildId);

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
}

// ========================================
// DATABASE TEST
// ========================================

async function testDatabase() {

    try {

        await pool.query(
            "SELECT NOW()"
        );

        console.log(
            "✅ PostgreSQL connection successful."
        );

        return true;

    } catch (error) {

        console.error(
            "❌ PostgreSQL connection failed:",
            error
        );

        return false;
    }
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

    findBlockedWord
};
