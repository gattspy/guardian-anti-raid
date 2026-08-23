const express = require("express");

const router = express.Router();

function dashboardAuth(req, res, next) {
    const password = process.env.DASHBOARD_PASSWORD;

    if (!password) {
        return res.status(500).send("Dashboard password is not configured.");
    }

    const providedPassword =
        req.headers["x-dashboard-password"] ||
        req.query.password;

    if (providedPassword !== password) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Guardian Anti-Raid</title>
                <style>
                    body {
                        font-family: Arial;
                        background: #111827;
                        color: white;
                        text-align: center;
                        padding: 80px;
                    }

                    input {
                        padding: 12px;
                        border-radius: 8px;
                        border: none;
                        margin: 10px;
                    }

                    button {
                        padding: 12px 20px;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    }
                </style>
            </head>

            <body>
                <h1>🛡️ Guardian Anti-Raid</h1>

                <p>Dashboard password required.</p>

                <form method="GET">
                    <input
                        type="password"
                        name="password"
                        placeholder="Dashboard password"
                    />

                    <button type="submit">
                        Login
                    </button>
                </form>
            </body>
            </html>
        `);
    }

    next();
}

router.use(dashboardAuth);

router.get("/", (req, res) => {

    const bot = req.app.locals.bot;

    if (!bot) {
        return res.status(500).send("Bot is not ready.");
    }

    const guild = bot.guilds.cache.get(
        process.env.GUILD_ID
    );

    if (!guild) {
        return res.status(404).send(
            "Discord server not found."
        );
    }

    const state =
        req.app.locals.getRaidState(
            guild.id
        );

    const config =
        req.app.locals.config;

    res.send(`
<!DOCTYPE html>

<html>

<head>

<title>Guardian Anti-Raid</title>

<meta name="viewport"
content="width=device-width, initial-scale=1">

<style>

body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #0f172a;
    color: white;
}

.header {
    background: #111827;
    padding: 25px;
    border-bottom: 1px solid #334155;
}

.container {
    max-width: 1100px;
    margin: auto;
    padding: 25px;
}

.grid {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(280px, 1fr));

    gap: 20px;
}

.card {
    background: #1e293b;
    padding: 25px;
    border-radius: 14px;
}

.status {
    font-size: 22px;
    font-weight: bold;
}

.online {
    color: #22c55e;
}

.locked {
    color: #ef4444;
}

button {
    border: none;
    border-radius: 8px;
    padding: 12px 18px;
    margin: 5px;
    cursor: pointer;
    font-weight: bold;
}

.lock {
    background: #dc2626;
    color: white;
}

.unlock {
    background: #16a34a;
    color: white;
}

.save {
    background: #2563eb;
    color: white;
}

input {
    width: 90%;
    padding: 11px;
    margin-top: 5px;
    margin-bottom: 15px;
    border-radius: 7px;
    border: none;
}

.label {
    display: block;
    margin-top: 10px;
}

</style>

</head>

<body>

<div class="header">

<h1>🛡️ Guardian Anti-Raid</h1>

<p>${guild.name}</p>

</div>

<div class="container">

<div class="grid">

<div class="card">

<h2>Bot Status</h2>

<div class="status online">
🟢 ONLINE
</div>

<p>
Connected as:
<br>
${bot.user.tag}
</p>

</div>

<div class="card">

<h2>Server Protection</h2>

<div class="status ${state.lockdown ? "locked" : "online"}">

${state.lockdown
    ? "🔴 LOCKDOWN ACTIVE"
    : "🟢 PROTECTED"}

</div>

<form action="/lock" method="POST">

<input
type="hidden"
name="password"
value="${req.query.password || ""}"
>

<button class="lock">
🔒 LOCK SERVER
</button>

</form>

<form action="/unlock" method="POST">

<input
type="hidden"
name="password"
value="${req.query.password || ""}"
>

<button class="unlock">
🔓 UNLOCK SERVER
</button>

</form>

</div>

<div class="card">

<h2>Raid Settings</h2>

<form action="/settings" method="POST">

<input
type="hidden"
name="password"
value="${req.query.password || ""}"
>

<label class="label">
Joins required for raid
</label>

<input
type="number"
name="threshold"
value="${config.raidJoinThreshold}"
min="2"
max="100"
>

<label class="label">
Time window (seconds)
</label>

<input
type="number"
name="window"
value="${config.raidTimeWindow}"
min="1"
max="300"
>

<label class="label">
Suspicious account age (hours)
</label>

<input
type="number"
name="accountAge"
value="${config.suspiciousAccountAge / 3600000}"
min="0"
max="8760"
>

<label class="label">
Lockdown duration (minutes)
</label>

<input
type="number"
name="lockdown"
value="${config.lockdownDuration / 60000}"
min="1"
max="1440"
>

<br>

<button class="save">
💾 SAVE SETTINGS
</button>

</form>

</div>

<div class="card">

<h2>Quick Protection</h2>

<p>
Raid Detection:
<strong>
${config.raidJoinThreshold}
joins /
${config.raidTimeWindow}
seconds
</strong>
</p>

<p>
Suspicious accounts:
<strong>
${config.suspiciousAccountAge / 3600000}
hours
</strong>
</p>

<p>
Automatic quarantine:
<strong>
${config.quarantineSuspiciousAccounts
    ? "ON"
    : "OFF"}
</strong>
</p>

<p>
Automatic kicking:
<strong>
${config.kickSuspiciousAccounts
    ? "ON"
    : "OFF"}
</strong>
</p>

</div>

</div>

</div>

</body>

</html>
    `);
});

router.post("/lock", express.urlencoded({ extended: true }), async (req, res) => {

    const bot = req.app.locals.bot;

    const guild = bot.guilds.cache.get(
        process.env.GUILD_ID
    );

    if (!guild) {
        return res.status(404).send(
            "Discord server not found."
        );
    }

    await req.app.locals.lockdown(
        guild,
        "Manual dashboard lockdown"
    );

    res.redirect(
        `/?password=${encodeURIComponent(
            req.body.password || ""
        )}`
    );
});

router.post("/unlock", express.urlencoded({ extended: true }), async (req, res) => {

    const bot = req.app.locals.bot;

    const guild = bot.guilds.cache.get(
        process.env.GUILD_ID
    );

    if (!guild) {
        return res.status(404).send(
            "Discord server not found."
        );
    }

    await req.app.locals.unlock(guild);

    res.redirect(
        `/?password=${encodeURIComponent(
            req.body.password || ""
        )}`
    );
});

router.post("/settings", express.urlencoded({ extended: true }), (req, res) => {

    const config = req.app.locals.config;

    const threshold =
        Number(req.body.threshold);

    const window =
        Number(req.body.window);

    const accountAge =
        Number(req.body.accountAge);

    const lockdown =
        Number(req.body.lockdown);

    if (
        !Number.isFinite(threshold) ||
        threshold < 2 ||
        threshold > 100
    ) {
        return res.status(400).send(
            "Invalid raid threshold."
        );
    }

    if (
        !Number.isFinite(window) ||
        window < 1 ||
        window > 300
    ) {
        return res.status(400).send(
            "Invalid time window."
        );
    }

    config.raidJoinThreshold =
        threshold;

    config.raidTimeWindow =
        window;

    config.suspiciousAccountAge =
        accountAge * 3600000;

    config.lockdownDuration =
        lockdown * 60000;

    res.redirect(
        `/?password=${encodeURIComponent(
            req.body.password || ""
        )}`
    );
});

module.exports = router;
