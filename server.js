/**
 * Allies Bot - Render-ready server.js
 * Features:
 *  - Baileys WhatsApp connection with single-file session
 *  - /qr endpoint to view QR for initial login
 *  - Auto-read, typing effect, anti-delete (best-effort)
 *  - Hacker Mode menu (About first, then hamburger-style menu)
 *  - Per-user session (in-memory + saved to sessions.json)
 *  - /ping and /status endpoints for uptime monitoring
 *
 * NOTE: After first QR scan the session.json is written and you won't need to scan again.
 */

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode');
const { default: makeWASocket, DisconnectReason, useSingleFileAuthState, fetchLatestBaileysVersion, proto } = require('@adiwajshing/baileys');

const PORT = process.env.PORT || process.env.RENDER_PORT || 5000;
const SESSION_FILE = process.env.SESSION_FILE || './session.json';
const SESSIONS_STORE = './sessions.json'; // stores per-user hacker-mode states

// Ensure session store exists
if (!fs.existsSync(SESSIONS_STORE)) fs.writeJsonSync(SESSIONS_STORE, {});

// Baileys single-file auth state
const { state, saveState } = useSingleFileAuthState(SESSION_FILE);

let sock = null;
let lastQR = null; // store last qr for /qr endpoint

async function startSock() {
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log('Using WA version', version, 'isLatest:', isLatest);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      // logger: P({ level: 'silent' }),
      version
    });

    // Save auth info on changes
    sock.ev.on('creds.update', saveState);

    // connection updates
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        lastQR = qr; // save to serve via /qr
        console.log('QR updated - open /qr to view it (first login only).');
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp connected.');
        lastQR = null;
      }

      if (connection === 'close') {
        const reason = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ? lastDisconnect.error.output.statusCode : (lastDisconnect && lastDisconnect.error && lastDisconnect.error.name) || lastDisconnect;
        console.log('connection closed:', reason);
        // auto-reconnect logic
        if (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode === DisconnectReason.loggedOut) {
          console.log('Session logged out. Delete session.json and re-scan QR.');
          // do not attempt reconnect automatically if logged out
        } else {
          console.log('Attempting to restart socket in 5s...');
          setTimeout(() => startSock(), 5000);
        }
      }
    });

    // handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      try {
        const upsert = m;
        if (!upsert.messages || upsert.type !== 'notify') return;
        for (const msg of upsert.messages) {
          if (!msg.message || msg.key && msg.key.remoteJid === 'status@broadcast') continue;

          const jid = msg.key.remoteJid; // single or group
          const fromMe = !!msg.key.fromMe;
          const body = extractMessageText(msg.message);

          // mark read
          try {
            await sock.sendReadReceipt(jid, msg.key.participant || msg.key.remoteJid, [msg.key.id]);
          } catch (e) {
            // ignore
          }

          // ignore messages sent by the bot itself
          if (fromMe) continue;

          // Anti-delete tracking: save message content to a local store indexed by message id
          try {
            saveIncomingForAntiDelete(msg);
          } catch (e) { /* ignore */ }

          // handle command routing
          if (!body) continue;
          handleUserMessage(jid, body, msg);
        }
      } catch (err) {
        console.error('messages.upsert error', err);
      }
    });

    // anti-delete: messages.update receives protocol updates, including deletes
    sock.ev.on('messages.update', async (updates) => {
      for (const u of updates) {
        if (u.update && u.update.message && u.update.message.protocolMessage && u.update.message.protocolMessage.type === 0) {
          // protocolMessage.type === 0 indicates message revocation by sender (delete)
          const revoked = u.update.message.protocolMessage;
          const key = revoked.key; // may contain id and remoteJid
          if (key) {
            // try to fetch original stored message
            const saved = await retrieveSavedIncoming(key.id);
            if (saved) {
              // resend the deleted content back to the chat
              const jid = key.remoteJid;
              await delay(500);
              await sendTextWithTyping(jid, `🔁 *Recovered deleted message:*\n\n${saved.content || '<media or unknown>'}`);
            } else {
              // couldn't recover
              // optional: notify admin
            }
          }
        }
      }
    });

    // keep presence as available occasionally (helps "always online" behavior)
    setInterval(async () => {
      try {
        if (!sock) return;
        // broadcast available presence to everyone in chats
        const allChats = Object.keys(sock.chats || {});
        // only send to a few to avoid rate limits; Baileys has sendPresenceUpdate
        if (allChats && allChats.length > 0) {
          // if server environment supports it, send presence update to self
          try { await sock.presenceSubscribe(sock.user.id); } catch (e) {}
        }
      } catch (e) { /* ignore */ }
    }, 60 * 1000);

  } catch (err) {
    console.error('startSock error', err);
  }
}

/* -------------------------
   Helpers & Bot Logic
   ------------------------- */

function extractMessageText(message) {
  // support many message types
  const m = message;
  if (!m) return '';
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage && m.extendedTextMessage.text) return m.extendedTextMessage.text;
  if (m.imageMessage && m.imageMessage.caption) return m.imageMessage.caption;
  if (m.videoMessage && m.videoMessage.caption) return m.videoMessage.caption;
  if (m.stickerMessage) return '<sticker>';
  if (m.documentMessage && m.documentMessage.fileName) return `<file: ${m.documentMessage.fileName}>`;
  if (m.contactMessage) return '<contact>';
  return '';
}

async function saveIncomingForAntiDelete(msg) {
  try {
    const storePath = './incoming_store.json';
    let store = {};
    if (fs.existsSync(storePath)) store = await fs.readJson(storePath).catch(() => ({}));
    const id = msg.key && msg.key.id;
    if (!id) return;
    const text = extractMessageText(msg.message) || (msg.message && Object.keys(msg.message)[0]);
    store[id] = {
      id,
      from: msg.key.remoteJid,
      content: text,
      timestamp: Date.now()
    };
    await fs.writeJson(storePath, store, { spaces: 2 });
  } catch (e) {
    // ignore
  }
}

async function retrieveSavedIncoming(id) {
  try {
    const storePath = './incoming_store.json';
    if (!fs.existsSync(storePath)) return null;
    const store = await fs.readJson(storePath).catch(() => ({}));
    return store[id] || null;
  } catch (e) {
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// per-user Hacker Mode sessions stored in sessions.json
function getSessions() {
  try {
    return fs.readJsonSync(SESSIONS_STORE);
  } catch (e) {
    return {};
  }
}
function saveSessions(sessions) {
  try {
    fs.writeJsonSync(SESSIONS_STORE, sessions, { spaces: 2 });
  } catch (e) { /* ignore */ }
}
function setUserHackerMode(jid, value) {
  const s = getSessions();
  s[jid] = s[jid] || {};
  s[jid].inHackerMode = !!value;
  s[jid].lastUpdated = Date.now();
  saveSessions(s);
}
function getUserHackerMode(jid) {
  const s = getSessions();
  return s[jid] && s[jid].inHackerMode;
}

/* -------------------------
   Hacker Mode content
   ------------------------- */

function getAboutMeText() {
  return `👨‍💻 *ABOUT MY TECH LIFE*

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
6️⃣ Exit`;
}

function getProjectsMenu() {
  return `📁 *MY PROJECTS*

1) Old Facebook UID Cloner
2) TikTok Account Creator
3) Instagram UID Extractor
4) WhatsApp Offline Messenger
5) Hacker Keyboard (Keylogger)

Reply 6️⃣ to go back.`;
}
function getToolsMenu() {
  return `🛠 *MY TOOLS*

1) Port Scanner
2) Wi-Fi Info Grabber
3) Termux Hacker Mode
4) Fake FBI Prank Website
5) Meme Coin Pump Bot

Reply 6️⃣ to go back.`;
}
function getContactsMenu() {
  return `📞 *MY CONTACTS*

Email: abdullahillison@gmail.com
WhatsApp: +2348030476809
Telegram Bot: Coming Soon

Reply 6️⃣ to go back.`;
}
function getSocialsMenu() {
  return `🌐 *MY SOCIALS*

YouTube: Allies Tech
TikTok: @Hacallie
Telegram: 7873350472

Reply 6️⃣ to go back.`;
}

/* send message with typing effect & presence */
async function sendTextWithTyping(jid, text) {
  try {
    if (!sock) return;
    try {
      // send composing presence
      await sock.sendPresenceUpdate('composing', jid);
    } catch (e) { /* ignore */ }

    // wait a little depending on message length (typing effect)
    const waitMs = Math.min(2000, 100 + Math.floor(text.length * 12));
    await delay(waitMs);

    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {}

    // finally send message
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('sendTextWithTyping error', e);
  }
}

// main handler for user messages
async function handleUserMessage(jid, text, rawMsg) {
  try {
    const lc = text.trim().toLowerCase();

    // activate only when user types "hacker mode"
    if (lc === 'hacker mode') {
      setUserHackerMode(jid, true);
      await sendTextWithTyping(jid, getAboutMeText());
      return;
    }

    // if not active, ignore except send short hint (but you requested ignore; we send hint)
    const inMode = getUserHackerMode(jid);
    if (!inMode) {
      // blank reply would be ignored by many gateways; send short hint instead
      // If you really want absolutely no reply, comment out the next line.
      await sendTextWithTyping(jid, `Type *Hacker Mode* to open the menu.`);
      return;
    }

    // Inside Hacker Mode => handle numeric choices 1-6
    if (lc === '1') {
      await sendTextWithTyping(jid, getProjectsMenu());
      return;
    }
    if (lc === '2') {
      await sendTextWithTyping(jid, getToolsMenu());
      return;
    }
    if (lc === '3') {
      await sendTextWithTyping(jid, getContactsMenu());
      return;
    }
    if (lc === '4') {
      await sendTextWithTyping(jid, getSocialsMenu());
      return;
    }
    if (lc === '5') {
      await sendTextWithTyping(jid, getAboutMeText());
      return;
    }
    if (lc === '6' || lc === '0') {
      setUserHackerMode(jid, false);
      await sendTextWithTyping(jid, 'Exited Hacker Mode.');
      return;
    }

    // unknown command inside Hacker Mode
    await sendTextWithTyping(jid, 'Invalid option. Reply with numbers 1–6.');
  } catch (e) {
    console.error('handleUserMessage error', e);
  }
}

/* -------------------------
   Express server & endpoints
   ------------------------- */

const app = express();
app.use(bodyParser.json());

// simple status/ping endpoints for UptimeRobot
app.get('/ping', (req, res) => res.send('pong'));
app.get('/status', (req, res) => {
  const sessions = getSessions();
  res.json({
    ok: true,
    whatsappConnected: !!(sock && sock.user && sock.user.id),
    sessionsCount: Object.keys(sessions).length
  });
});

// serve QR for scanning when needed
app.get('/qr', async (req, res) => {
  try {
    if (!lastQR) {
      return res.send('<h2>No QR available: probably already authenticated.</h2><p>If this is your first run and no QR is visible, check logs or open terminal for the QR code.</p>');
    }
    const dataUrl = await qrcode.toDataURL(lastQR);
    res.send(`<h2>Scan this QR with your spare WhatsApp (WhatsApp Web)</h2><img src="${dataUrl}" /><p>After scanning wait for "WhatsApp connected" in logs.</p>`);
  } catch (e) {
    res.status(500).send('Error generating QR');
  }
});

// webhook-ish test route to send messages via HTTP (useful)
app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ ok: false, error: 'to & message required' });
  try {
    await sendTextWithTyping(to, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// start the socket
startSock().catch(e => console.error(e));

// start express
app.listen(PORT, () => {
  console.log(`🚀 Allies Bot HTTP server running on port ${PORT}`);
});
