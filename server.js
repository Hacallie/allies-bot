require("dotenv").config();
const express = require("express");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    delay
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// -------------------
const PORT = process.env.PORT || 5000;
// -------------------

// SIMPLE MENUS
function getMainMenu() {
    return `
⚡ *ALLIE'S HACKER MODE ACTIVATED* ⚡

1️⃣ My Projects  
2️⃣ My Tools  
3️⃣ My Contacts  
4️⃣ My Socials  
5️⃣ About Me  
0️⃣ Exit
`;
}

function getProjectsMenu() {
    return `
📁 *MY PROJECTS*

1) Old Facebook UID Cloner  
2) TikTok Account Creator  
3) Instagram UID Extractor  
4) WhatsApp Offline Messenger  
5) Hacker Keyboard

0) Back
`;
}

function getToolsMenu() {
    return `
🛠 *MY TOOLS*

1) Port Scanner  
2) Wi-Fi Info Grabber  
3) Termux Hacker Mode  
4) Fake FBI Prank  
5) Meme Coin Pump Bot

0) Back
`;
}

function getSocialsMenu() {
    return `
🌐 *MY SOCIALS*

YouTube: Allies Tech  
TikTok: @Hacallie  
Telegram: 7873350472

0) Back
`;
}

function getContactMenu() {
    return `
📞 *MY CONTACTS*

Email: abdullahillison@gmail.com  
WhatsApp: +2348030476809  

0) Back
`;
}

function getAboutMe() {
    return `
👨‍💻 *ABOUT ME — 10 LINES*

1. I started tech very young  
2. I love hacking tools  
3. My first project was in Termux  
4. I build real bots  
5. I make cloners & creators  
6. I study ethical hacking  
7. I code Python & Node  
8. I build offline apps  
9. I create AI systems  
10. I want to be a top tech creator

0) Back
`;
}

// -------------------
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const store = makeInMemoryStore({
        logger: P({ level: "silent" })
    });

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: "silent" })
    });

    store.bind(sock.ev);

    // QR → save to file
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            fs.writeFileSync("last_qr.txt", qr);
        }

        if (connection === "close") {
            const reason =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;

            if (reason) startSock();
        }

        if (connection === "open") {
            console.log("WhatsApp Connected!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        await sock.readMessages([msg.key]);

        if (text.toLowerCase().includes("hacker mode")) {
            await sock.sendMessage(sender, { text: getMainMenu() });
            return;
        }

        let replyText = null;

        switch (text.trim()) {
            case "1":
                replyText = getProjectsMenu();
                break;
            case "2":
                replyText = getToolsMenu();
                break;
            case "3":
                replyText = getContactMenu();
                break;
            case "4":
                replyText = getSocialsMenu();
                break;
            case "5":
                replyText = getAboutMe();
                break;
            case "0":
                replyText = "Exited Hacker Mode.";
                break;
        }

        if (replyText) {
            await sock.sendPresenceUpdate("composing", sender);
            await delay(900);
            await sock.sendMessage(sender, { text: replyText });
            await sock.sendPresenceUpdate("available", sender);
        }
    });
}

startSock();

// -------------------
// EXPRESS ENDPOINTS
// -------------------
app.get("/", (req, res) => {
    res.send("🔥 Allies Bot Server is Running...");
});

app.get("/qr", (req, res) => {
    if (!fs.existsSync("last_qr.txt"))
        return res.send("QR not generated yet...");

    const qrData = fs.readFileSync("last_qr.txt", "utf8");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        qrData
    )}`;

    res.send(`<h1>Scan WhatsApp QR</h1><img src="${qrUrl}" />`);
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
