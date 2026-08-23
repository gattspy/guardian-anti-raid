module.exports = {
    // ========================================
    // RAID PROTECTION
    // ========================================

    // Number of joins required to trigger a raid
    raidJoinThreshold: 8,

    // Time window for detecting the raid
    // 10 seconds
    raidTimeWindow: 10,

    // ========================================
    // NEW ACCOUNT PROTECTION
    // ========================================

    // Accounts younger than 24 hours are kicked
    suspiciousAccountAge:
        24 * 60 * 60 * 1000,

    // Automatically kick accounts younger than 24 hours
    kickNewAccounts: true,

    // ========================================
    // SERVER LOCKDOWN
    // ========================================

    // Lockdown automatically ends after 5 minutes
    lockdownDuration:
        5 * 60 * 1000,

    // ========================================
    // BLOCKED WORD PROTECTION
    // ========================================

    // Users who use a blocked word are timed out
    // for 24 hours
    wordTimeoutDuration:
        24 * 60 * 60 * 1000
};
