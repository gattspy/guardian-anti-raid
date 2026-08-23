module.exports = {

    // Number of joins required to trigger a raid
    raidJoinThreshold: 8,

    // Time window for detecting a raid
    // 10 seconds
    raidTimeWindow: 10,

    // Accounts younger than this are suspicious
    // 24 hours
    suspiciousAccountAge: 86400000,

    // How long the server stays in lockdown
    // 5 minutes
    lockdownDuration: 300000,

    // Quarantine suspicious accounts during lockdown
    quarantineSuspiciousAccounts: true,

    // Kick extremely suspicious accounts
    kickSuspiciousAccounts: false,

    // Accounts younger than this are extremely suspicious
    // 1 hour
    extremeAccountAge: 3600000

};
