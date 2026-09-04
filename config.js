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
    // NEW-MEMBER WELCOME DM
    // ========================================

    // Wait one minute after a member joins
    // before sending the saved welcome DM.
    //
    // This value is in milliseconds.
    welcomeDmDelay:
        60 * 1000,

    // Maximum length of the welcome message.
    welcomeDmMaxLength: 2000,

    // Maximum length of the optional image URL.
    welcomeDmImageUrlMaxLength: 2048,

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

    // Maximum image size Guardian downloads
    // while comparing images.
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
     * The matcher should require at least
     * one separator between letters.
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
     */
    detectRepeatedLetters: true,

    // ========================================
    // FUZZY MATCHING
    // ========================================

    /*
     * Keep fuzzy matching disabled.
     *
     * Fuzzy matching can mistake an ordinary
     * word for a similar blocked word.
     */
    fuzzyWordMatching: false,

    /*
     * These settings have no effect while
     * fuzzyWordMatching is false.
     */
    fuzzyMinimumWordLength: 8,

    fuzzyShortWordDistance: 1,

    fuzzyLongWordDistance: 1,

    fuzzyRequireSameFirstCharacter: true,

    fuzzyRequireSameLastCharacter: true,

    // ========================================
    // BLOCKED-WORD LIMITS
    // ========================================

    // Maximum length of one blocked-word entry.
    blockedWordMaxLength: 100,

    // ========================================
    // AUTOMATIC CATEGORY MESSAGES
    // ========================================

    // Discord's normal message limit.
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
