module.exports = {

    // ========================================
    // RAID PROTECTION
    // ========================================

    // Number of joins required
    // to trigger raid protection.
    raidJoinThreshold: 8,

    // Raid detection time window.
    // Value is in seconds.
    raidTimeWindow: 10,

    // ========================================
    // NEW ACCOUNT PROTECTION
    // ========================================

    // Accounts younger than 24 hours
    // are considered suspicious.
    suspiciousAccountAge:
        24 * 60 * 60 * 1000,

    // Automatically kick suspicious
    // new accounts.
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

    // Maximum length of one
    // blocked-word entry.
    blockedWordMaxLength: 100,

    // ========================================
    // STRICT WORD FILTER
    // ========================================

    /*
     * Guardian currently uses strict
     * whole-word matching.
     *
     * Example:
     *
     * Blocked:
     * ass
     *
     * BLOCK:
     * ass
     * ASS
     * "ass"
     * ass!
     *
     * ALLOW:
     * class
     * grass
     * glasses
     * assassin
     *
     * These advanced matching options
     * are disabled to prevent false
     * positives.
     */

    // Do not convert stylized Unicode
    // characters into blocked words.
    normalizeUnicodeWords: false,

    // Do not convert substitutions like:
    //
    // sh1t
    // sh!t
    // $hit
    //
    // into blocked words.
    detectLookalikeCharacters: false,

    // Do not match separated characters like:
    //
    // s h i t
    // s.h.i.t
    // s-h-i-t
    detectSeparatedWords: false,

    // Do not reduce repeated letters like:
    //
    // shiiit
    // fuuuck
    detectRepeatedLetters: false,

    // ========================================
    // FUZZY MATCHING
    // ========================================

    /*
     * Keep fuzzy matching disabled.
     *
     * Fuzzy matching can incorrectly flag
     * normal words that are only similar
     * to a blocked word.
     */
    fuzzyWordMatching: false,

    /*
     * These values are kept only in case
     * fuzzy matching is added again later.
     *
     * They currently have no effect.
     */
    fuzzyMinimumWordLength: 8,

    fuzzyShortWordDistance: 1,

    fuzzyLongWordDistance: 1,

    fuzzyRequireSameFirstCharacter: true,

    fuzzyRequireSameLastCharacter: true,

    // ========================================
    // AUTOMATIC CATEGORY MESSAGES
    // ========================================

    // Discord's normal message limit.
    autoMessageMaxLength: 2000,

    // ========================================
    // BAN-TRIGGER CHANNEL
    // ========================================

    // Delete up to the previous 3 hours
    // of messages when a member triggers
    // the ban channel.
    //
    // Discord expects seconds.
    banDeleteMessageSeconds:
        3 * 60 * 60
};
