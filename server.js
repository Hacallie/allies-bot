require('dotenv').config();
const express = require('express');
const { default: makeWASocket, DisconnectReason, useSingleFileAuthState, makeInMemoryStore, delay } = require('@adiwajshing/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// -------------------
// RENDER PORT
// -------------------
const PORT = process.env.PORT || 5000;

// -------------------
// HACKER MODE MENUS
// -------------------
function getMainMenu() {
    return `
⚡ *ALLIE'S HACKER MODE ACTIVATED* ⚡

Here is your control panel:

1️⃣ My Projects  
2️⃣ My Tools  
3️⃣ My Contacts  
4️⃣ My Socials  
5️⃣ About Me  
0️⃣ Exit

Reply with a number to continue.
`;
}

function getProjectsMenu() {
    return `
📁 *MY PROJECTS*

1) Old Facebook UID Cloner  
2) TikTok Account Creator  
3) Instagram UID Extractor  
4) WhatsApp Offline Messenger  
5) Hacker Keyboard (Keylogger)

0) Back to Main Menu
`;
}

function getToolsMenu() {
    return `
🛠 *MY TOOLS*

1) Port Scanner  
2) Wi-Fi Info Grabber  
3) Termux Hacker Mode  
4) Fake FBI Prank Website  
5) Meme Coin Pump Bot

0) Back to Main Menu
`;
}

function getSocialsMenu() {
    return `
🌐 *MY SOCIALS*

YouTube: Allies Tech  
TikTok: @Hacallie  
Telegram: 7873350472

0) Back to Main Menu
`;
}

function getContactMenu() {
    return `
📞 *MY CONTACTS*

Email: abdullahillison@gmail.com  
WhatsApp: +2348030476809  
Telegram Bot: Coming Soon

0) Back to Main Menu
`;
}

function getAboutMe() {
    return `
👨‍💻 *ABOUT MY TECH LIFE (10 LINES)*

1. I started my tech journey very young with curiosity.
2. I love hacking tools, automation and building crazy apps.
3. I built my first program inside Termux.
4. I enjoy creating bots that actually work in real life.
5. I’ve built cloners, account creators and hacking terminals.
6. My goal is to master coding and ethical hacking.
7. I work with Python, Java, Node.js and Android Studio.
8. I create offline apps like Bluetooth messaging systems.
9. I also build AI systems and automation scripts.
10. My dream is to become a top tech creator in Nigeria.

0) Back to Main Menu
`;
}

// -------------------
// BAILEYS AUTH STATE
// -------------------
const { state, saveState } = useSingleFileAuthState(path.join(__dirname, 'baileys_auth.json'));

// Create in-memory store to track chats
const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });

// -------------------
// INIT WHATSAPP
// -------------------
async function startSock() {
    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false, // we use /qr
        auth: state
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR display
        if (qr) {
            fs.writeFileSync(path.join(__dirname, 'last_qr.txt'), qr);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('Connection closed:', reason);
            if (reason !== DisconnectReason.loggedOut) {
                startSock();
            }
        }

        if (connection === 'open') {
            console.log('WhatsApp Connected ✅');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || '';

        // Auto read
        await sock.readMessages([msg.key]);

        // Only respond after "Hacker Mode"
        if (!msg.message.conversation.toLowerCase().includes('hacker mode')) {
            return;
        }

        let replyText = getMainMenu();

        // Respond to menu numbers
        switch (text.trim()) {
            case '1': replyText = getProjectsMenu(); break;
            case '2': replyText = getToolsMenu(); break;
            case '3': replyText = getContactMenu(); break;
            case '4': replyText = getSocialsMenu(); break;
            case '5': replyText = getAboutMe(); break;
            case '0': replyText = 'Exited Hacker Mode.'; break;
        }

        // Typing effect simulation
        await sock.sendPresenceUpdate('composing', sender);
        await delay(1000);

        await sock.sendMessage(sender, { text: replyText });
        await sock.sendPresenceUpdate('available', sender);
    });

    sock.ev.on('creds.update', saveState);
    return sock;
}

startSock();

// -------------------
// EXPRESS ROUTES
// -------------------
app.get("/", (req, res) => {
    res.send("🔥 Allies Bot Server is Running...");
});

// Web QR Page
app.get("/qr", (req, res) => {
    const qrData = fs.readFileSync(path.join(__dirname, 'last_qr.txt'), 'utf-8');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;
    res.send(`
        <h1>Allies WhatsApp Bot QR</h1>
        <img src="${qrUrl}" />
        <p>Scan this QR code with your WhatsApp mobile app.</p>
    `);
});

// -------------------
app.listen(PORT, () => {
    console.log(`🔥 Allies Bot server running on port ${PORT}`);
});
