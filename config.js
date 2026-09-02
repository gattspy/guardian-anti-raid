module.exports = {

    // ========================================
    // RAID PROTECTION
    // ========================================

    // Number of joins required to trigger
    // automatic raid protection.
    raidJoinThreshold: 8,

    // Raid detection window in seconds.
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
    // IMAGE-SPAM PROTECTION
    // ========================================

    // Detect the same image posted by the
    // same account in different channels
    // within 10 seconds.
    //
    // This value is in milliseconds.
    imageSpamTimeWindow:
        10 * 1000,

    // Maximum image size that Guardian
    // downloads when checking for duplicates.
    //
    // This is 10 megabytes.
    imageSpamMaxFileSize:
        10 * 1024 * 1024,

    // ========================================
    // BLOCKED-WORD PROTECTION
    // ========================================

    // Timeout duration after a confirmed
    // blocked-word match.
    //
    // This is 24 hours.
    wordTimeoutDuration:
        24 * 60 * 60 * 1000,

    // Maximum length of one blocked-word
    // database entry.
    blockedWordMaxLength: 100,

    // ========================================
    // STRICT WORD FILTER
    // ========================================

    /*
     * Guardian uses strict whole-word
     * matching.
     *
     * Example blocked word:
     *
     * ass
     *
     * BLOCK:
     *
     * ass
     * ASS
     * "ass"
     * ass!
     *
     * ALLOW:
     *
     * class
     * grass
     * glasses
     * assassin
     *
     * Advanced matching remains disabled
     * to reduce false positives.
     */

    // Do not convert stylized Unicode
    // characters into blocked words.
    normalizeUnicodeWords: false,

    // Do not convert substitutions such as:
    //
    // sh1t
    // sh!t
    // $hit
    //
    // into blocked words.
    detectLookalikeCharacters: false,

    // Do not match separated characters:
    //
    // s h i t
    // s.h.i.t
    // s-h-i-t
    detectSeparatedWords: false,

    // Do not reduce repeated letters:
    //
    // shiiit
    // fuuuck
    detectRepeatedLetters: false,

    // ========================================
    // FUZZY MATCHING
    // ========================================

    /*
     * Fuzzy matching stays disabled.
     *
     * Fuzzy matching can incorrectly flag
     * ordinary words that only resemble
     * a blocked word.
     */
    fuzzyWordMatching: false,

    /*
     * These values are retained in case
     * fuzzy matching is added later.
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
    // AUTOMATIC CATEGORY MESSAGES
    // ========================================

    // Discord's standard message limit.
    autoMessageMaxLength: 2000,

    // ========================================
    // BAN-TRIGGER CHANNEL
    // ========================================

    // Delete up to the previous 3 hours
    // of messages when a member triggers
    // the ban channel.
    //
    // Discord expects this value in seconds.
    banDeleteMessageSeconds:
        3 * 60 * 60
};
