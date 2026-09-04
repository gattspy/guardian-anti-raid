require("dotenv").config();

const {
    Pool
} = require("pg");

// ========================================
// ENVIRONMENT VALIDATION
// ========================================

if (!process.env.DATABASE_URL) {
    console.error(
        "❌ DATABASE_URL is missing."
    );

    process.exit(1);
}

// ========================================
// DATABASE CONNECTION
// ========================================

const pool =
    new Pool({
        connectionString:
            process.env.DATABASE_URL,

        ssl:
            process.env.NODE_ENV ===
            "production"
                ? {
                    rejectUnauthorized:
                        false
                }
                : process.env.DATABASE_SSL ===
                    "false"
                    ? false
                    : {
                        rejectUnauthorized:
                            false
                    },

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000
    });

let databaseReady = false;

// ========================================
// BASIC HELPERS
// ========================================

function cleanText(value) {
    return String(
        value ?? ""
    ).trim();
}

function getServerId(guild) {
    if (!guild) {
        return null;
    }

    if (typeof guild === "string") {
        return guild.trim() || null;
    }

    if (typeof guild.id === "string") {
        return guild.id.trim() || null;
    }

    return null;
}

function normalizeForWordFilter(text) {
    return String(
        text ?? ""
    )
        .trim()
        .toLowerCase();
}

function escapeRegExp(text) {
    return String(
        text ?? ""
    ).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

function requireDatabase() {
    if (!databaseReady) {
        throw new Error(
            "Database is not ready. Call initDatabase() before using it."
        );
    }
}

// ========================================
// IMAGE URL VALIDATION
// ========================================

function cleanImageUrl(value) {
    const imageUrl =
        cleanText(value);

    if (!imageUrl) {
        return null;
    }

    if (imageUrl.length > 2048) {
        return null;
    }

    try {
        const parsedUrl =
            new URL(imageUrl);

        if (
            parsedUrl.protocol !== "https:" &&
            parsedUrl.protocol !== "http:"
        ) {
            return null;
        }

        return parsedUrl.toString();

    } catch {
        return null;
    }
}

// ========================================
// DATABASE TRANSACTION HELPER
// ========================================

async function runTransaction(callback) {
    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN"
        );

        const result =
            await callback(client);

        await client.query(
            "COMMIT"
        );

        return result;

    } catch (error) {
        try {
            await client.query(
                "ROLLBACK"
            );

        } catch (rollbackError) {
            console.error(
                "❌ Database rollback failed:",
                rollbackError
            );
        }

        throw error;

    } finally {
        client.release();
    }
}

// ========================================
// INITIALIZE DATABASE
// ========================================

async function initDatabase() {
    databaseReady = false;

    const client =
        await pool.connect();

    try {
        console.log(
            "🔄 Creating/checking PostgreSQL tables..."
        );

        // Existing records are preserved because
        // every statement uses IF NOT EXISTS.

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

        await client.query(`
            CREATE TABLE IF NOT EXISTS ban_trigger_channels (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // ====================================
        // WELCOME DM SETTINGS
        // ====================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS welcome_dm_settings (
                guild_id TEXT PRIMARY KEY,
                message TEXT NOT NULL,
                image_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        databaseReady = true;

        console.log(
            "✅ PostgreSQL tables are ready."
        );

        console.log(
            "✅ Existing auto-category messages were preserved."
        );

        console.log(
            "✅ Welcome-DM settings table is ready."
        );

        return true;

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
    requireDatabase();

    const result =
        await pool.query(
            "SELECT NOW() AS time;"
        );

    console.log(
        `✅ PostgreSQL connection test successful: ${
            result.rows[0].time
        }`
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
        getServerId(guild);

    const cleanWord =
        normalizeForWordFilter(
            word
        );

    if (
        !serverId ||
        !cleanWord ||
        cleanWord.length > 100 ||
        /[\r\n]/.test(cleanWord)
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

    return result.rowCount > 0;
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
        getServerId(guild);

    const cleanWord =
        normalizeForWordFilter(
            word
        );

    if (
        !serverId ||
        !cleanWord
    ) {
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

    return result.rowCount > 0;
}

// ========================================
// GET BLOCKED WORDS
// ========================================

async function getBlockedWords(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
        .filter(Boolean);
}

// ========================================
// FIND BLOCKED WORD
// ========================================

async function findBlockedWord(
    guild,
    content
) {
    if (!databaseReady) {
        return null;
    }

    const serverId =
        getServerId(guild);

    if (
        !serverId ||
        typeof content !== "string" ||
        !content.trim()
    ) {
        return null;
    }

    const words =
        await getBlockedWords(
            serverId
        );

    if (!words.length) {
        return null;
    }

    const normalizedContent =
        normalizeForWordFilter(
            content
        );

    for (const blockedWord of words) {
        if (!blockedWord) {
            continue;
        }

        const escapedWord =
            escapeRegExp(
                blockedWord
            );

        const expression =
            new RegExp(
                `(?<![\\p{L}\\p{N}_])${escapedWord}(?![\\p{L}\\p{N}_])`,
                "iu"
            );

        if (
            expression.test(
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
        getServerId(guild);

    const cleanUserId =
        cleanText(userId);

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    return runTransaction(
        async client => {
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

                    DO UPDATE SET
                        user_id =
                            EXCLUDED.user_id

                    RETURNING user_id;
                    `,
                    [
                        serverId,
                        cleanUserId
                    ]
                );

            return result.rowCount > 0;
        }
    );
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
        getServerId(guild);

    const cleanUserId =
        cleanText(userId);

    if (
        !serverId ||
        !cleanUserId
    ) {
        return false;
    }

    return runTransaction(
        async client => {
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

                    DO UPDATE SET
                        user_id =
                            EXCLUDED.user_id

                    RETURNING user_id;
                    `,
                    [
                        serverId,
                        cleanUserId
                    ]
                );

            return result.rowCount > 0;
        }
    );
}

// ========================================
// CHECK AUTHORIZED USER
// ========================================

async function isAuthorizedUser(
    guild,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(guild);

    const cleanUserId =
        cleanText(userId);

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

    return result.rowCount > 0;
}

// ========================================
// CHECK UNAUTHORIZED USER
// ========================================

async function isUnauthorizedUser(
    guild,
    userId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(guild);

    const cleanUserId =
        cleanText(userId);

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

    return result.rowCount > 0;
}

// ========================================
// GET AUTHORIZED USERS
// ========================================

async function getAuthorizedUsers(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
        row => row.user_id
    );
}

// ========================================
// GET UNAUTHORIZED USERS
// ========================================

async function getUnauthorizedUsers(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
        row => row.user_id
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
        getServerId(guild);

    const cleanRoleId =
        cleanText(roleId);

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    return runTransaction(
        async client => {
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

                    DO UPDATE SET
                        role_id =
                            EXCLUDED.role_id

                    RETURNING role_id;
                    `,
                    [
                        serverId,
                        cleanRoleId
                    ]
                );

            return result.rowCount > 0;
        }
    );
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
        getServerId(guild);

    const cleanRoleId =
        cleanText(roleId);

    if (
        !serverId ||
        !cleanRoleId
    ) {
        return false;
    }

    return runTransaction(
        async client => {
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

                    DO UPDATE SET
                        role_id =
                            EXCLUDED.role_id

                    RETURNING role_id;
                    `,
                    [
                        serverId,
                        cleanRoleId
                    ]
                );

            return result.rowCount > 0;
        }
    );
}

// ========================================
// CHECK AUTHORIZED ROLE
// ========================================

async function isAuthorizedRole(
    guild,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(guild);

    const cleanRoleId =
        cleanText(roleId);

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

    return result.rowCount > 0;
}

// ========================================
// CHECK UNAUTHORIZED ROLE
// ========================================

async function isUnauthorizedRole(
    guild,
    roleId
) {
    if (!databaseReady) {
        return false;
    }

    const serverId =
        getServerId(guild);

    const cleanRoleId =
        cleanText(roleId);

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

    return result.rowCount > 0;
}

// ========================================
// GET AUTHORIZED ROLES
// ========================================

async function getAuthorizedRoles(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
        row => row.role_id
    );
}

// ========================================
// GET UNAUTHORIZED ROLES
// ========================================

async function getUnauthorizedRoles(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
        row => row.role_id
    );
}

// ========================================
// SET AUTO-CATEGORY MESSAGE
// ========================================

async function setAutoCategoryMessage(
    guild,
    categoryId,
    message
) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    const cleanCategoryId =
        cleanText(categoryId);

    const cleanMessage =
        cleanText(message);

    if (
        !serverId ||
        !cleanCategoryId ||
        !cleanMessage ||
        cleanMessage.length > 2000
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

    return result.rowCount > 0;
}

// ========================================
// REMOVE AUTO-CATEGORY MESSAGE
// ========================================

async function removeAutoCategoryMessage(
    guild,
    categoryId
) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    const cleanCategoryId =
        cleanText(categoryId);

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

    return result.rowCount > 0;
}

// ========================================
// GET AUTO-CATEGORY MESSAGE
// ========================================

async function getAutoCategoryMessage(
    guild,
    categoryId
) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    const cleanCategoryId =
        cleanText(categoryId);

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

    return (
        result.rows[0]?.message ??
        null
    );
}

// ========================================
// GET ALL AUTO-CATEGORY MESSAGES
// ========================================

async function getAutoCategoryMessages(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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
// SET BAN-TRIGGER CHANNEL
// ========================================

async function setBanTriggerChannel(
    guild,
    channelId
) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    const cleanChannelId =
        cleanText(channelId);

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

    return result.rowCount > 0;
}

// ========================================
// REMOVE BAN-TRIGGER CHANNEL
// ========================================

async function removeBanTriggerChannel(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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

    return result.rowCount > 0;
}

// ========================================
// GET BAN-TRIGGER CHANNEL
// ========================================

async function getBanTriggerChannel(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

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

    return (
        result.rows[0]?.channel_id ??
        null
    );
}

// ========================================
// SET WELCOME DM
// ========================================

async function setWelcomeDm(
    guild,
    message,
    imageUrl = null
) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    const cleanMessage =
        cleanText(message);

    const providedImageUrl =
        cleanText(imageUrl);

    const cleanUrl =
        providedImageUrl
            ? cleanImageUrl(
                providedImageUrl
            )
            : null;

    if (
        !serverId ||
        !cleanMessage ||
        cleanMessage.length > 2000
    ) {
        return false;
    }

    // An image URL was supplied but was invalid.
    if (
        providedImageUrl &&
        !cleanUrl
    ) {
        return false;
    }

    const result =
        await pool.query(
            `
            INSERT INTO welcome_dm_settings (
                guild_id,
                message,
                image_url,
                updated_at
            )

            VALUES (
                $1,
                $2,
                $3,
                NOW()
            )

            ON CONFLICT (
                guild_id
            )

            DO UPDATE SET
                message =
                    EXCLUDED.message,

                image_url =
                    EXCLUDED.image_url,

                updated_at =
                    NOW()

            RETURNING guild_id;
            `,
            [
                serverId,
                cleanMessage,
                cleanUrl
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// REMOVE WELCOME DM
// ========================================

async function removeWelcomeDm(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    if (!serverId) {
        return false;
    }

    const result =
        await pool.query(
            `
            DELETE FROM welcome_dm_settings

            WHERE guild_id = $1

            RETURNING guild_id;
            `,
            [
                serverId
            ]
        );

    return result.rowCount > 0;
}

// ========================================
// GET WELCOME DM
// ========================================

async function getWelcomeDm(guild) {
    requireDatabase();

    const serverId =
        getServerId(guild);

    if (!serverId) {
        return null;
    }

    const result =
        await pool.query(
            `
            SELECT
                message,
                image_url,
                created_at,
                updated_at

            FROM welcome_dm_settings

            WHERE guild_id = $1

            LIMIT 1;
            `,
            [
                serverId
            ]
        );

    if (result.rowCount === 0) {
        return null;
    }

    return {
        message:
            result.rows[0].message,

        imageUrl:
            result.rows[0].image_url ??
            null,

        createdAt:
            result.rows[0].created_at,

        updatedAt:
            result.rows[0].updated_at
    };
}

// ========================================
// DATABASE ERROR HANDLER
// ========================================

pool.on(
    "error",
    error => {
        console.error(
            "❌ Unexpected PostgreSQL pool error:",
            error
        );
    }
);

// ========================================
// CLEAN DATABASE SHUTDOWN
// ========================================

async function closeDatabase() {
    databaseReady = false;

    try {
        await pool.end();

        console.log(
            "✅ PostgreSQL connection pool closed."
        );

        return true;

    } catch (error) {
        console.error(
            "❌ Failed to close PostgreSQL pool:",
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

    // Database startup and status
    initDatabase,
    testDatabase,
    isDatabaseReady,
    closeDatabase,

    // Helpers
    getServerId,
    normalizeForWordFilter,
    cleanImageUrl,

    // Blocked words
    addBlockedWord,
    removeBlockedWord,
    getBlockedWords,
    findBlockedWord,

    // Authorized users
    authorizeUser,
    unauthorizeUser,
    isAuthorizedUser,
    isUnauthorizedUser,
    getAuthorizedUsers,
    getUnauthorizedUsers,

    // Authorized roles
    authorizeRole,
    unauthorizeRole,
    isAuthorizedRole,
    isUnauthorizedRole,
    getAuthorizedRoles,
    getUnauthorizedRoles,

    // Auto-category messages
    setAutoCategoryMessage,
    removeAutoCategoryMessage,
    getAutoCategoryMessage,
    getAutoCategoryMessages,

    // Ban-trigger channel
    setBanTriggerChannel,
    removeBanTriggerChannel,
    getBanTriggerChannel,

    // Welcome DM
    setWelcomeDm,
    removeWelcomeDm,
    getWelcomeDm
};
