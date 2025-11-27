require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
//  ABOUT ME (ALWAYS FIRST DISPLAY)
// ---------------------------------------------
function getAboutMe() {
    return `
👨‍💻 *ABOUT MY TECH LIFE*

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

☰ *MENU OPTIONS*
1️⃣ My Projects  
2️⃣ My Tools  
3️⃣ My Contacts  
4️⃣ My Socials  
5️⃣ About Me  
6️⃣ Exit
`;
}

// ---------------------------------------------
//  SUB MENUS
// ---------------------------------------------
function getProjectsMenu() {
    return `
📁 *MY PROJECTS*

1) Old Facebook UID Cloner  
2) TikTok Account Creator  
3) Instagram UID Extractor  
4) WhatsApp Offline Messenger  
5) Hacker Keyboard (Keylogger)

Reply 6️⃣ to go back.
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

Reply 6️⃣ to go back.
`;
}

function getContactMenu() {
    return `
📞 *MY CONTACTS*

Email: abdullahillison@gmail.com  
WhatsApp: +2348030476809  
Telegram Bot: Coming Soon  

Reply 6️⃣ to go back.
`;
}

function getSocialsMenu() {
    return `
🌐 *MY SOCIALS*

YouTube: Allies Tech  
TikTok: @Hacallie  
Telegram: 7873350472  

Reply 6️⃣ to go back.
`;
}

// ---------------------------------------------
//  STATE STORAGE (SIMPLE SESSION)
// ---------------------------------------------
let userInHackerMode = false;

// ---------------------------------------------
//  MAIN BOT HANDLER
// ---------------------------------------------
app.post("/api/hackermode", (req, res) => {
    const { command } = req.body;
    const msg = (command || "").toLowerCase();

    // ACTIVATE HACKER MODE
    if (msg === "hacker mode") {
        userInHackerMode = true;
        return res.json({ reply: getAboutMe() });
    }

    // If not in hacker mode, ignore messages
    if (!userInHackerMode) {
        return res.json({ reply: "Type *Hacker Mode* to activate the system." });
    }

    // MENU HANDLING
    switch (msg) {
        case "1":
            return res.json({ reply: getProjectsMenu() });

        case "2":
            return res.json({ reply: getToolsMenu() });

        case "3":
            return res.json({ reply: getContactMenu() });

        case "4":
            return res.json({ reply: getSocialsMenu() });

        case "5":
            return res.json({ reply: getAboutMe() });

        case "6":
            userInHackerMode = false;
            return res.json({ reply: "Exited Hacker Mode." });

        default:
            return res.json({ reply: "Invalid option. Choose 1–6 only." });
    }
});

// ---------------------------------------------
//  PORT LISTENER
// ---------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("🔥 Allies Bot server running on port " + PORT);
});

// ---------------------------------------------
//  TEST PAGE (BROWSER ONLY)
// ---------------------------------------------
app.get("/test", (req, res) => {
    res.send(`
        <h1>Allies Hacker Mode Tester</h1>
        <p>Type a command and see the bot's reply instantly.</p>
        <input id="cmd" placeholder="Type command..." style="width:300px;height:30px;font-size:16px;">
        <button onclick="sendCmd()" style="height:35px;">Send</button>
        <pre id="output" style="margin-top:20px;font-size:18px;background:#111;color:#0f0;padding:20px;"></pre>

        <script>
            function sendCmd() {
                const command = document.getElementById('cmd').value;

                fetch('/api/hackermode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command })
                })
                .then(res => res.json())
                .then(data => {
                    document.getElementById('output').innerText = data.reply;
                });
            }
        </script>
    `);
});
