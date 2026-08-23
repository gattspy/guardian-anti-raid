const express = require("express");
const { REST, Routes } = require("discord.js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Guardian Anti-Raid Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #111827;
            color: white;
            margin: 0;
            padding: 40px;
        }

        .container {
            max-width: 800px;
            margin: auto;
        }

        .card {
            background: #1f2937;
            padding: 25px;
            border-radius: 12px;
            margin-bottom: 20px;
        }

        button {
            background: #5865F2;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
        }

        button:hover {
            background: #4752C4;
        }

        h1 {
            margin-bottom: 5px;
        }

        .status {
            color: #4ade80;
        }
    </style>
</head>

<body>
<div class="container">

    <h1>🛡️ Guardian Anti-Raid</h1>
    <p>Discord Bot Management Dashboard</p>

    <div class="card">
        <h2>Bot Status</h2>
        <p class="status">● Dashboard Online</p>
    </div>

    <div class="card">
        <h2>Slash Commands</h2>
        <p>Manually register your Discord slash commands.</p>

        <form action="/deploy" method="POST">
            <button type="submit">
                🔄 Deploy Commands
            </button>
        </form>
    </div>

    <div class="card">
        <h2>Command Management</h2>

        <form action="/clear" method="POST">
            <button type="submit">
                🧹 Clear Commands
            </button>
        </form>
    </div>

</div>
</body>
</html>
  `);
});

app.post("/deploy", async (req, res) => {
  try {
    const commands = require("./commands");

    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    res.send(`
      <h1>✅ Commands Deployed</h1>
      <p>Your Discord commands have been registered.</p>
      <a href="/">Back to Dashboard</a>
    `);

  } catch (error) {
    console.error(error);

    res.status(500).send(`
      <h1>❌ Deployment Failed</h1>
      <pre>${error.message}</pre>
      <a href="/">Back to Dashboard</a>
    `);
  }
});

app.post("/clear", async (req, res) => {
  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [] }
    );

    res.send(`
      <h1>🧹 Commands Cleared</h1>
      <p>All global slash commands were removed.</p>
      <a href="/">Back to Dashboard</a>
    `);

  } catch (error) {
    console.error(error);

    res.status(500).send(`
      <h1>❌ Failed</h1>
      <pre>${error.message}</pre>
      <a href="/">Back to Dashboard</a>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
