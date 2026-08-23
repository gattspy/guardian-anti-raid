async function getStatus() {

    try {

        const response = await fetch("/api/status");

        const data = await response.json();

        document.getElementById("status").textContent =
            data.bot ? "Online" : "Offline";

        document.getElementById("botStatus").textContent =
            data.bot ? "● Online" : "● Offline";

        document.getElementById("protectionStatus").textContent =
            data.protection ? "Enabled" : "Disabled";

        document.getElementById("lockdownStatus").textContent =
            data.lockdown ? "Locked" : "Unlocked";

        document.getElementById("suspiciousAccounts").textContent =
            data.suspiciousAccounts || 0;

        document.getElementById("protectionToggle").checked =
            data.protection;

    } catch (error) {

        console.error(error);

        document.getElementById("status").textContent =
            "Offline";

        document.getElementById("botStatus").textContent =
            "● Offline";
    }
}


function showPage(page) {

    document.querySelectorAll(".page").forEach(element => {
        element.classList.remove("active-page");
    });

    document.querySelectorAll(".nav").forEach(element => {
        element.classList.remove("active");
    });

    document.getElementById(page).classList.add("active-page");

    event.target.classList.add("active");
}


async function toggleProtection() {

    const enabled =
        document.getElementById("protectionToggle").checked;

    await fetch("/api/protection", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            enabled
        })

    });

    getStatus();
}


async function lockServer() {

    await fetch("/api/lockdown", {
        method: "POST"
    });

    getStatus();
}


async function unlockServer() {

    await fetch("/api/unlock", {
        method: "POST"
    });

    getStatus();
}


async function addWhitelist() {

    const userId =
        document.getElementById("whitelistUser").value;

    if (!userId) {
        alert("Enter a Discord User ID.");
        return;
    }

    await fetch("/api/whitelist", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            userId
        })

    });

    document.getElementById("whitelistUser").value = "";

    loadWhitelist();
}


async function loadWhitelist() {

    try {

        const response = await fetch("/api/whitelist");

        const users = await response.json();

        const list =
            document.getElementById("whitelistList");

        if (!users.length) {
            list.textContent = "No whitelisted users.";
            return;
        }

        list.innerHTML = users
            .map(user => `<p>${user}</p>`)
            .join("");

    } catch (error) {

        console.error(error);

    }
}


async function saveSettings() {

    const threshold =
        document.getElementById("raidThreshold").value;

    await fetch("/api/settings", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            threshold: Number(threshold)
        })

    });

    alert("Settings saved.");

}


getStatus();
loadWhitelist();

setInterval(getStatus, 10000);
