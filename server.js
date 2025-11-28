const express = require("express");
const axios = require("axios");
const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");
const path = require("path");

const app = express();
app.use(express.json());

// AUTH SYSTEM FOR BAILEYS V6
const authFolder = path.join(__dirname, "auth_info");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        printQRInTerminal: true,   // QR prints during Render build logs only ONCE
        auth: state
    });

    // Save credentials when they update
    sock.ev.on("creds.update", saveCreds);

    // When connected:
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log("BOT IS CONNECTED ✔");
        } else if (connection === "close") {
            console.log("Connection closed. Reconnecting...");
            startBot();
        }
    });

    // Simple listener
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];

        if (!msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text === "hi") {
            await sock.sendMessage(msg.key.remoteJid, { text: "Hello! Bot is online." });
        }
    });
}

startBot();

// Render server
app.get("/", (req, res) => {
    res.send("WhatsApp bot is running!");
});

app.listen(10000, () => console.log("Server running on port 10000"));
