module.exports = {

    // ========================================
    // RAID PROTECTION
    // ========================================

    // Number of joins required to trigger a raid.
    raidJoinThreshold: 8,

    // Time window used for raid detection.
    // Value is in seconds.
    raidTimeWindow: 10,

    // ========================================
    // NEW ACCOUNT PROTECTION
    // ========================================

    // Accounts younger than 24 hours
    // are considered suspicious.
    suspiciousAccountAge:
        24 * 60 * 60 * 1000,

    // Automatically kick accounts
    // younger than 24 hours.
    kickNewAccounts: true,

    // ========================================
    // SERVER LOCKDOWN
    // ========================================

    // Automatically remove lockdown
    // after 5 minutes.
    lockdownDuration:
        5 * 60 * 1000,

    // ========================================
    // BLOCKED WORD PROTECTION
    // ========================================

    // Timeout duration after a confirmed
    // blocked-word match.
    //
    // 24 hours.
    wordTimeoutDuration:
        24 * 60 * 60 * 1000,

    // ========================================
    // SAFE WORD FILTER
    // ========================================

    /*
     * Keep Unicode normalization enabled.
     *
     * Example:
     *
     * blocked:
     * shit
     *
     * catches:
     * shit
     * SHIT
     * 𝐬𝐡𝐢𝐭
     * ｓｈｉｔ
     *
     * This should not cause normal
     * substring matches by itself.
     */
    normalizeUnicodeWords: true,

    // ========================================
    // LOOKALIKE CHARACTERS
    // ========================================

    /*
     * Detect common deliberate substitutions:
     *
     * sh1t
     * sh!t
     * $hit
     *
     * Keep this enabled.
     */
    detectLookalikeCharacters: true,

    // ========================================
    // SEPARATED WORDS
    // ========================================

    /*
     * Detect obvious separated bypasses:
     *
     * s h i t
     * s.h.i.t
     * s-h-i-t
     *
     * Keep this enabled.
     *
     * Your index.js matcher should require
     * at least one separator between letters.
     */
    detectSeparatedWords: true,

    // ========================================
    // REPEATED LETTERS
    // ========================================

    /*
     * Detect deliberate repeated-letter bypasses:
     *
     * shiiit
     * fuuuck
     *
     * Keep this enabled.
     */
    detectRepeatedLetters: true,

    // ========================================
    // FUZZY MATCHING
    // ========================================

    /*
     * IMPORTANT:
     *
     * DISABLED.
     *
     * This is the safest choice if Guardian
     * should ONLY moderate confirmed banned
     * words and obvious disguises.
     *
     * Fuzzy matching can mistake a normal
     * word for something similar to a
     * blocked word.
     */
    fuzzyWordMatching: false,

    /*
     * These remain here in case fuzzy
     * matching is enabled later.
     *
     * They have no effect while
     * fuzzyWordMatching is false.
     */
    fuzzyMinimumWordLength: 8,

    fuzzyShortWordDistance: 1,

    fuzzyLongWordDistance: 1,

    fuzzyRequireSameFirstCharacter: true,

    fuzzyRequireSameLastCharacter: true,

    // ========================================
    // BLOCKED WORD LIMITS
    // ========================================

    // Maximum length of one blocked-word entry.
    blockedWordMaxLength: 100,

    // ========================================
    // AUTOMATIC CATEGORY MESSAGES
    // ========================================

    // Discord normal message limit.
    autoMessageMaxLength: 2000,

    // ========================================
    // BAN-TRIGGER CHANNEL
    // ========================================

    // Delete up to the previous 3 hours
    // of messages after a ban-channel trigger.
    //
    // Discord expects seconds.
    banDeleteMessageSeconds:
        3 * 60 * 60
};
