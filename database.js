require("dotenv").config();

const { Pool } = require("pg");

// ========================================
// DATABASE CONFIGURATION
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

let databaseReady = false;

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {

    const client = await pool.connect();

    try {

        console.log("🔄 Creating/checking PostgreSQL tables...");

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

        console.log("✅ PostgreSQL tables are ready.");

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
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
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

async function addBlockedWord(guildId, word) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    if (!guildId || !word) {
        return false;
    }

    const cleanWord = word.trim().toLowerCase();

    if (!cleanWord) {
        return false;
    }

    const result = await pool.query(
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
        [guildId, cleanWord]
    );

    return result.rowCount > 0;
}

async function removeBlockedWord(guildId, word) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    if (!guildId || !word) {
        return false;
    }

    const cleanWord = word.trim().toLowerCase();

    const result = await pool.query(
        `
        DELETE FROM blocked_words

        WHERE guild_id = $1
        AND word = $2

        RETURNING word;
        `,
        [guildId, cleanWord]
    );

    return result.rowCount > 0;
}

async function getBlockedWords(guildId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    if (!guildId) {
        return [];
    }

    const result = await pool.query(
        `
        SELECT word

        FROM blocked_words

        WHERE guild_id = $1

        ORDER BY word ASC;
        `,
        [guildId]
    );

    return result.rows.map(row => row.word);
}

async function findBlockedWord(guildId, message) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    if (!guildId || !message) {
        return null;
    }

    const words = await getBlockedWords(guildId);

    const content = String(message).toLowerCase();

    for (const word of words) {

        const escapedWord = word.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(
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

async function authorizeUser(guildId, userId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
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
        [guildId, userId]
    );

    // Remove them from unauthorized list.
    await pool.query(
        `
        DELETE FROM unauthorized_users

        WHERE guild_id = $1
        AND user_id = $2;
        `,
        [guildId, userId]
    );

    return result.rowCount > 0;
}

async function unauthorizeUser(guildId, userId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
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
        [guildId, userId]
    );

    // Remove from authorized list.
    await pool.query(
        `
        DELETE FROM authorized_users

        WHERE guild_id = $1
        AND user_id = $2;
        `,
        [guildId, userId]
    );

    return result.rowCount > 0;
}

async function isAuthorizedUser(guildId, userId) {

    if (!databaseReady) {
        return false;
    }

    const result = await pool.query(
        `
        SELECT user_id

        FROM authorized_users

        WHERE guild_id = $1
        AND user_id = $2

        LIMIT 1;
        `,
        [guildId, userId]
    );

    return result.rowCount > 0;
}

async function isUnauthorizedUser(guildId, userId) {

    if (!databaseReady) {
        return false;
    }

    const result = await pool.query(
        `
        SELECT user_id

        FROM unauthorized_users

        WHERE guild_id = $1
        AND user_id = $2

        LIMIT 1;
        `,
        [guildId, userId]
    );

    return result.rowCount > 0;
}

async function getAuthorizedUsers(guildId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT user_id

        FROM authorized_users

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [guildId]
    );

    return result.rows.map(row => row.user_id);
}

async function getUnauthorizedUsers(guildId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT user_id

        FROM unauthorized_users

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [guildId]
    );

    return result.rows.map(row => row.user_id);
}

// ========================================
// AUTHORIZED ROLES
// ========================================

async function authorizeRole(guildId, roleId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
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
        [guildId, roleId]
    );

    // Remove from unauthorized roles.
    await pool.query(
        `
        DELETE FROM unauthorized_roles

        WHERE guild_id = $1
        AND role_id = $2;
        `,
        [guildId, roleId]
    );

    return result.rowCount > 0;
}

async function unauthorizeRole(guildId, roleId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
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
        [guildId, roleId]
    );

    // Remove from authorized roles.
    await pool.query(
        `
        DELETE FROM authorized_roles

        WHERE guild_id = $1
        AND role_id = $2;
        `,
        [guildId, roleId]
    );

    return result.rowCount > 0;
}

async function isAuthorizedRole(guildId, roleId) {

    if (!databaseReady) {
        return false;
    }

    const result = await pool.query(
        `
        SELECT role_id

        FROM authorized_roles

        WHERE guild_id = $1
        AND role_id = $2

        LIMIT 1;
        `,
        [guildId, roleId]
    );

    return result.rowCount > 0;
}

async function isUnauthorizedRole(guildId, roleId) {

    if (!databaseReady) {
        return false;
    }

    const result = await pool.query(
        `
        SELECT role_id

        FROM unauthorized_roles

        WHERE guild_id = $1
        AND role_id = $2

        LIMIT 1;
        `,
        [guildId, roleId]
    );

    return result.rowCount > 0;
}

async function getAuthorizedRoles(guildId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT role_id

        FROM authorized_roles

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [guildId]
    );

    return result.rows.map(row => row.role_id);
}

async function getUnauthorizedRoles(guildId) {

    if (!databaseReady) {
        throw new Error("Database is not ready.");
    }

    const result = await pool.query(
        `
        SELECT role_id

        FROM unauthorized_roles

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [guildId]
    );

    return result.rows.map(row => row.role_id);
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
    getUnauthorizedRoles
};
