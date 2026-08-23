module.exports = {
    // How many members need to join...
    raidJoinThreshold: 8,

    // ...within this many seconds
    raidTimeWindow: 10,

    // Accounts younger than this are considered suspicious.
    // 86400000 = 24 hours
    suspiciousAccountAge: 86400000,

    // How long lockdown lasts automatically.
    // 300000 = 5 minutes
    lockdownDuration: 300000,

    // During a raid, quarantine suspicious accounts.
    quarantineSuspiciousAccounts: true,

    // Automatically kick extremely suspicious accounts.
    kickSuspiciousAccounts: false,

    // Account age at which an account becomes extremely suspicious.
    // 1 hour
    extremeAccountAge: 3600000
};
