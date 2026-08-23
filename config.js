module.exports = {

    // Number of members joining during the time window
    // required to trigger a raid.
    raidJoinThreshold: 8,

    // Time window in seconds.
    raidTimeWindow: 10,

    // Accounts younger than 24 hours are kicked.
    suspiciousAccountAge: 24 * 60 * 60 * 1000,

    // How long the server stays locked down.
    // 5 minutes.
    lockdownDuration: 5 * 60 * 1000,

    // Automatically kick accounts younger than 24 hours.
    kickNewAccounts: true

};
