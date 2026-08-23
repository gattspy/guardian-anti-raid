module.exports = {

    // Number of joins required to trigger a raid
    raidJoinThreshold: 8,

    // Time window for raid detection
    raidTimeWindow: 10,

    // Accounts younger than 24 hours are suspicious
    suspiciousAccountAge: 86400000,

    // Lockdown duration
    // 5 minutes
    lockdownDuration: 300000,

    // Quarantine suspicious accounts
    quarantineSuspiciousAccounts: true,

    // Kick extremely suspicious accounts
    kickSuspiciousAccounts: false,

    // Accounts younger than 1 hour are extremely suspicious
    extremeAccountAge: 3600000

};
