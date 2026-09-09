"use strict";
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const qrcode = require("qrcode");
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3001;
const SECRET = process.env.WHATSAPP_GATEWAY_SECRET || "";
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8001").replace(/\/$/, "");
const SESSIONS_DIR = path.join(__dirname, "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { if (req.path === "/health") return next(); if (SECRET && req.headers["x-gateway-secret"] !== SECRET) return res.status(401).json({ error: "unauthorized" }); next(); });

const sessions = new Map();
const sessionDir = (rid) => path.join(SESSIONS_DIR, rid.replace(/[^a-zA-Z0-9_-]/g, "_"));
const phoneFromJid = (jid) => (jid || "").split("@")[0].split(":")[0];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveMessageJid(sock, message) {
  const primary = message.key.remoteJid || "";
  if (!primary.endsWith("@lid")) return primary;
  if (message.key.remoteJidAlt) return message.key.remoteJidAlt;
  try {
    const mapped = await sock.signalRepository?.lidMapping?.getPNForLID(primary);
    if (mapped) return mapped;
  } catch (error) {
    logger.warn(`[lid] mapping failed for ${primary}: ${error.message}`);
  }
  return primary;
}

async function forwardIncoming(rid, msg) {
  try { await axios.post(`${BACKEND_URL}/api/webhooks/whatsapp/baileys/${rid}`, msg, { headers: { "x-gateway-secret": SECRET }, timeout: 15000 }); }
  catch (error) { logger.error(`forward failed for ${msg.phone}: ${error.message}`); }
}

async function startSession(rid) {
  let session = sessions.get(rid);
  if (session && (session.status === "connected" || session.starting)) return session;
  session = session || {};
  session.starting = true; session.status = session.status || "connecting"; sessions.set(rid, session);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(rid));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false, browser: Browsers.ubuntu("Chrome"), markOnlineOnConnect: false, syncFullHistory: false });
  session.sock = sock;
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) { session.qr = await qrcode.toDataURL(qr); session.status = "connecting"; }
    if (connection === "open") { session.status = "connected"; session.qr = null; session.number = phoneFromJid(sock.user && sock.user.id); session.starting = false; logger.info(`[${rid}] connected as ${session.number}`); }
    if (connection === "close") { session.starting = false; const code = lastDisconnect?.error?.output?.statusCode; if (code === DisconnectReason.loggedOut) { session.status = "disconnected"; session.qr = null; session.number = null; try { fs.rmSync(sessionDir(rid), { recursive: true, force: true }); } catch (_) {} } else { session.status = "connecting"; setTimeout(() => startSession(rid).catch(() => {}), 2500); } }
  });
  sock.ev.on("messages.upsert", async (event) => {
    if (event.type !== "notify") return;
    for (const message of event.messages) {
      if (!message.message || message.key.fromMe) continue;
      // Newer multi-device accounts may expose a non-routable @lid JID. The
      // alternate JID carries the actual phone number and must be used for replies.
      const primaryJid = message.key.remoteJid || "";
      const jid = await resolveMessageJid(sock, message);
      if (jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text = message.message.conversation || message.message.extendedTextMessage?.text || message.message.imageMessage?.caption || message.message.buttonsResponseMessage?.selectedDisplayText || "";
      if (!text.trim()) continue;
      const phone = phoneFromJid(jid);
      logger.info(`[${rid}] inbound ${primaryJid} -> ${phone}`);
      await forwardIncoming(rid, { phone, text: text.trim(), messageId: message.key.id, pushName: message.pushName || null, timestamp: new Date().toISOString() });
    }
  });
  return session;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "baileys-gateway" }));
app.post("/instance/:rid/connect", async (req, res) => { try { const session = await startSession(req.params.rid); for (let i = 0; i < 20 && !session.qr && session.status !== "connected"; i++) await wait(400); res.json({ status: session.status, qr: session.qr || null, number: session.number || null }); } catch (error) { res.status(500).json({ status: "error", detail: error.message }); } });
app.get("/instance/:rid/status", (req, res) => { const session = sessions.get(req.params.rid); if (!session) return res.json({ status: "disconnected", qr: null, number: null }); res.json({ status: session.status, qr: session.qr || null, number: session.number || null }); });
app.post("/instance/:rid/send", async (req, res) => { const session = sessions.get(req.params.rid); if (!session?.sock || session.status !== "connected") return res.status(409).json({ error: "not_connected" }); try { const to = String(req.body.to || "").replace(/^\+/, ""); const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`; logger.info(`[${req.params.rid}] outbound -> ${jid}`); await session.sock.sendMessage(jid, { text: String(req.body.text || "") }); res.json({ ok: true }); } catch (error) { logger.error(`[${req.params.rid}] outbound failed: ${error.message}`); res.status(500).json({ error: error.message }); } });
app.post("/instance/:rid/logout", async (req, res) => { const session = sessions.get(req.params.rid); try { if (session?.sock) { try { await session.sock.logout(); } catch (_) {} } } finally { try { fs.rmSync(sessionDir(req.params.rid), { recursive: true, force: true }); } catch (_) {} sessions.delete(req.params.rid); } res.json({ status: "disconnected" }); });

function resumeSaved() { let dirs = []; try { dirs = fs.readdirSync(SESSIONS_DIR); } catch (_) {} for (const dir of dirs) if (fs.existsSync(path.join(SESSIONS_DIR, dir, "creds.json"))) startSession(dir).catch((error) => logger.error(`resume failed for ${dir}: ${error.message}`)); }
app.listen(PORT, () => { console.log(`WhatsApp (Baileys) gateway listening on ${PORT}`); resumeSaved(); });