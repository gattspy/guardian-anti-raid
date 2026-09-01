module.exports = {

    // ========================================
    // RAID PROTECTION
    // ========================================

    // Number of joins required to trigger a raid
    raidJoinThreshold: 8,

    // Time window used for raid detection
    // Value is in seconds
    raidTimeWindow: 10,

    // ========================================
    // NEW ACCOUNT PROTECTION
    // ========================================

    // Accounts younger than this are considered suspicious
    // 24 hours
    suspiciousAccountAge:
        24 * 60 * 60 * 1000,

    // Automatically kick accounts younger than the age above
    kickNewAccounts: true,

    // ========================================
    // SERVER LOCKDOWN
    // ========================================

    // Automatically remove lockdown after 5 minutes
    lockdownDuration:
        5 * 60 * 1000,

    // ========================================
    // BLOCKED WORD PROTECTION
    // ========================================

    // Timeout duration after using a blocked word
    // 24 hours
    wordTimeoutDuration:
        24 * 60 * 60 * 1000,

    // ========================================
    // SMART WORD FILTER
    // ========================================

    // Detect stylized Unicode versions:
    // 𝐬𝐡𝐢𝐭
    // 𝕤𝕙𝕚𝕥
    // ｓｈｉｔ
    normalizeUnicodeWords: true,

    // Detect common substitutions:
    // sh1t
    // sh!t
    // $hit
    detectLookalikeCharacters: true,

    // Detect separated bypass attempts:
    // s h i t
    // s.h.i.t
    // s-h-i-t
    detectSeparatedWords: true,

    // Detect repeated-letter bypass attempts:
    // shiiit
    // fuuuck
    detectRepeatedLetters: true,

    // Detect small misspellings of blocked words
    fuzzyWordMatching: true,

    // Do not fuzzy-match words shorter than this.
    // This greatly reduces false positives.
    fuzzyMinimumWordLength: 4,

    // Maximum spelling difference for blocked words
    // between 4 and 6 characters long.
    fuzzyShortWordDistance: 1,

    // Maximum spelling difference for blocked words
    // 7 characters or longer.
    fuzzyLongWordDistance: 2,

    // ========================================
    // BLOCKED WORD LIMITS
    // ========================================

    // Maximum length allowed when adding a blocked word
    blockedWordMaxLength: 100,

    // ========================================
    // AUTOMATIC CATEGORY MESSAGES
    // ========================================

    // Discord normal messages can contain
    // up to 2000 characters.
    autoMessageMaxLength: 2000,

    // ========================================
    // BAN-TRIGGER CHANNEL
    // ========================================

    // Delete up to the previous 3 hours of messages
    // when someone triggers the configured ban channel.
    //
    // Discord expects this value in seconds.
    banDeleteMessageSeconds:
        3 * 60 * 60
};
