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
// HELPERS
// ========================================

function cleanText(
    value
) {
    return String(
        value || ""
    ).trim();
}

function cleanLower(
    value
) {
    return cleanText(
        value
    ).toLowerCase();
}

// ========================================
// WORD FILTER NORMALIZATION
// ========================================

function normalizeForWordFilter(
    text
) {
    return String(
        text || ""
    )

        // Convert stylized Unicode fonts
        // and full-width characters.
        .normalize("NFKC")

        // Separate accented characters.
        .normalize("NFD")

        // Remove accent / combining marks.
        .replace(
            /\p{M}/gu,
            ""
        )

        .normalize("NFC")

        // Remove invisible characters.
        .replace(
            /[\u200B-\u200D\u2060\uFEFF]/g,
            ""
        )

        .toLowerCase()

        .trim();
}

// ========================================
// ESCAPE REGEX
// ========================================

function escapeRegExp(
    text
) {
    return String(
        text || ""
    ).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

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
                created_at TIMESTAMPTZ DEFAULT NOW(),

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
                created_at TIMESTAMPTZ DEFAULT NOW(),

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
                created_at TIMESTAMPTZ DEFAULT NOW(),

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
                created_at TIMESTAMPTZ DEFAULT NOW(),

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
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    category_id
                )
            );
        `);

        // ====================================
        // BAN TRIGGER CHANNEL
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS ban_trigger_channels (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
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

    if (
        !guildId ||
        typeof word !== "string"
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

    // Prevent very large entries.
    if (
        cleanWord.length > 100
    ) {
        return false;
    }

    /*
     * Prevent accidental multi-line
     * blocked-word entries.
     */
    if (
        cleanWord.includes("\n") ||
        cleanWord.includes("\r")
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO blocked_words
                (
                    guild_id,
                    word
                )

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

    return (
        result.rowCount > 0
    );
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

    if (
        !guildId ||
        typeof word !== "string"
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
                guildId,
                cleanWord
            ]
        );

    return (
        result.rowCount > 0
    );
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

    return result.rows
        .map(
            row =>
                normalizeForWordFilter(
                    row.word
                )
        )
        .filter(
            word =>
                Boolean(word)
        );
}

// ========================================
// SAFE EXACT BLOCKED-WORD MATCH
// ========================================

async function findBlockedWord(
    guildId,
    content
) {
    if (!databaseReady) {
        return null;
    }

    if (
        !guildId ||
        !content
    ) {
        return null;
    }

    const words =
        await getBlockedWords(
            guildId
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
        const blockedWord of
        words
    ) {
        if (!blockedWord) {
            continue;
        }

        /*
         * Whole-word matching only.
         *
         * If "ass" is blocked:
         *
         * ass       -> BLOCK
         * ASS       -> BLOCK
         * an ass!   -> BLOCK
         *
         * class     -> ALLOW
         * grass     -> ALLOW
         * glasses   -> ALLOW
         * assassin  -> ALLOW
         */
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
    guildId,
    userId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

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

    const result =
        await pool.query(
            `
            INSERT INTO authorized_users
                (
                    guild_id,
                    user_id
                )

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

    return (
        result.rowCount > 0
    );
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

    if (
        !guildId ||
        !userId
    ) {
        return false;
    }

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

    const result =
        await pool.query(
            `
            INSERT INTO unauthorized_users
                (
                    guild_id,
                    user_id
                )

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

    return (
        result.rowCount > 0
    );
}

// ========================================
// IS AUTHORIZED USER
// ========================================

async function isAuthorizedUser(
    guildId,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    if (
        !guildId ||
        !userId
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
                guildId,
                userId
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// IS UNAUTHORIZED USER
// ========================================

async function isUnauthorizedUser(
    guildId,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    if (
        !guildId ||
        !userId
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
                guildId,
                userId
            ]
        );

    return (
        result.rowCount > 0
    );
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
        row =>
            row.user_id
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

    if (!guildId) {
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
                guildId
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
    guildId,
    roleId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

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

    const result =
        await pool.query(
            `
            INSERT INTO authorized_roles
                (
                    guild_id,
                    role_id
                )

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

    return (
        result.rowCount > 0
    );
}

// ========================================
// UNAUTHORIZE ROLE
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

    if (
        !guildId ||
        !roleId
    ) {
        return false;
    }

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

    const result =
        await pool.query(
            `
            INSERT INTO unauthorized_roles
                (
                    guild_id,
                    role_id
                )

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

    return (
        result.rowCount > 0
    );
}

// ========================================
// IS AUTHORIZED ROLE
// ========================================

async function isAuthorizedRole(
    guildId,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    if (
        !guildId ||
        !roleId
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
                guildId,
                roleId
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// IS UNAUTHORIZED ROLE
// ========================================

async function isUnauthorizedRole(
    guildId,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    if (
        !guildId ||
        !roleId
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
                guildId,
                roleId
            ]
        );

    return (
        result.rowCount > 0
    );
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

    if (!guildId) {
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
                guildId
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
            SELECT role_id

            FROM unauthorized_roles

            WHERE guild_id = $1

            ORDER BY created_at ASC;
            `,
            [
                guildId
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
    guildId,
    categoryId,
    message
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    const cleanMessage =
        cleanText(
            message
        );

    if (
        !guildId ||
        !categoryId ||
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
            INSERT INTO auto_category_messages
                (
                    guild_id,
                    category_id,
                    message,
                    updated_at
                )

            VALUES
                ($1, $2, $3, NOW())

            ON CONFLICT
                (guild_id, category_id)

            DO UPDATE SET
                message =
                    EXCLUDED.message,
                updated_at =
                    NOW()

            RETURNING category_id;
            `,
            [
                guildId,
                categoryId,
                cleanMessage
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// REMOVE AUTO CATEGORY MESSAGE
// ========================================

async function removeAutoCategoryMessage(
    guildId,
    categoryId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (
        !guildId ||
        !categoryId
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
                guildId,
                categoryId
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// GET AUTO CATEGORY MESSAGE
// ========================================

async function getAutoCategoryMessage(
    guildId,
    categoryId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (
        !guildId ||
        !categoryId
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
                guildId,
                categoryId
            ]
        );

    if (
        result.rowCount === 0
    ) {
        return null;
    }

    return (
        result.rows[0].message
    );
}

// ========================================
// GET ALL AUTO CATEGORY MESSAGES
// ========================================

async function getAutoCategoryMessages(
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
                guildId
            ]
        );

    return result.rows;
}

// ========================================
// SET BAN TRIGGER CHANNEL
// ========================================

async function setBanTriggerChannel(
    guildId,
    channelId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (
        !guildId ||
        !channelId
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO ban_trigger_channels
                (
                    guild_id,
                    channel_id,
                    updated_at
                )

            VALUES
                ($1, $2, NOW())

            ON CONFLICT
                (guild_id)

            DO UPDATE SET
                channel_id =
                    EXCLUDED.channel_id,
                updated_at =
                    NOW()

            RETURNING channel_id;
            `,
            [
                guildId,
                channelId
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// REMOVE BAN TRIGGER CHANNEL
// ========================================

async function removeBanTriggerChannel(
    guildId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId) {
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
                guildId
            ]
        );

    return (
        result.rowCount > 0
    );
}

// ========================================
// GET BAN TRIGGER CHANNEL
// ========================================

async function getBanTriggerChannel(
    guildId
) {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready."
        );
    }

    if (!guildId) {
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
                guildId
            ]
        );

    if (
        result.rowCount === 0
    ) {
        return null;
    }

    return (
        result.rows[0].channel_id
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
