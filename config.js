module.exports = {
    raidJoinThreshold: 8,
    raidTimeWindow: 10,

    // Accounts younger than 24 hours are kicked
    suspiciousAccountAge: 24 * 60 * 60 * 1000,
    kickNewAccounts: true,

    // Lockdown duration: 5 minutes
    lockdownDuration: 5 * 60 * 1000,

    // Word filter timeout: 24 hours
    wordTimeoutDuration: 24 * 60 * 60 * 1000
};
