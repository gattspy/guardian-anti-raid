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

    // Accounts younger than 24 hours are
    // considered suspicious.
    suspiciousAccountAge:
        24 * 60 * 60 * 1000,

    // Automatically kick accounts younger
    // than the age above.
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

    // Timeout duration after using
    // a blocked word.
    // 24 hours.
    wordTimeoutDuration:
        24 * 60 * 60 * 1000,

    // ========================================
    // SMART WORD FILTER
    // ========================================

    // Detect stylized Unicode versions:
    //
    // 𝐬𝐡𝐢𝐭
    // 𝕤𝕙𝕚𝕥
    // ｓｈｉｔ
    normalizeUnicodeWords: true,

    // Detect substitutions such as:
    //
    // sh1t
    // sh!t
    // $hit
    detectLookalikeCharacters: true,

    // Detect separated bypass attempts:
    //
    // s h i t
    // s.h.i.t
    // s-h-i-t
    detectSeparatedWords: true,

    // Detect repeated-letter bypasses:
    //
    // shiiit
    // fuuuck
    detectRepeatedLetters: true,

    // ========================================
    // FUZZY MATCHING
    // ========================================

    // Fuzzy matching is useful for catching
    // small misspellings, but can create
    // false positives if too aggressive.
    fuzzyWordMatching: true,

    // IMPORTANT:
    // Do not fuzzy-match blocked words
    // shorter than 6 characters.
    //
    // Short words have too many normal
    // words that look similar.
    fuzzyMinimumWordLength: 6,

    // Allow only ONE spelling difference
    // for shorter fuzzy-eligible words.
    fuzzyShortWordDistance: 1,

    // Allow only ONE spelling difference
    // for longer words as well.
    //
    // Previously this was 2, which could
    // catch unrelated normal words.
    fuzzyLongWordDistance: 1,

    // Require the first character of a fuzzy
    // candidate to match the blocked word.
    fuzzyRequireSameFirstCharacter: true,

    // Require the last character of a fuzzy
    // candidate to match the blocked word.
    fuzzyRequireSameLastCharacter: true,

    // ========================================
    // BLOCKED WORD LIMITS
    // ========================================

    // Maximum length allowed when adding
    // a blocked word.
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

    // Delete up to the previous 3 hours
    // of messages when someone triggers
    // the configured ban channel.
    //
    // Discord expects seconds.
    banDeleteMessageSeconds:
        3 * 60 * 60
};
