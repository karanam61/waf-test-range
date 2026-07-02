const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "waf.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS waf_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    client_ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_waf_events_type_created
    ON waf_events (event_type, created_at DESC);
`);

const insertStmt = db.prepare(`
  INSERT INTO waf_events (event_type, payload, client_ip, user_agent, created_at)
  VALUES (@event_type, @payload, @client_ip, @user_agent, @created_at)
`);

const listStmt = db.prepare(`
  SELECT id, event_type, payload, client_ip, user_agent, created_at
  FROM waf_events
  WHERE event_type = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

function isConfigured() {
  return true;
}

function getClientMeta(req) {
  return {
    client_ip:
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null,
    user_agent: req.headers["user-agent"] || null,
  };
}

function rowToRecord(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = JSON.parse(row.payload);
  } catch (_) {
    payload = { raw: row.payload };
  }
  return {
    id: row.id,
    event_type: row.event_type,
    payload,
    client_ip: row.client_ip,
    user_agent: row.user_agent,
    created_at: row.created_at,
  };
}

function insertEvent(eventType, payload, req) {
  const meta = req ? getClientMeta(req) : { client_ip: null, user_agent: null };
  const createdAt = new Date().toISOString();

  const result = insertStmt.run({
    event_type: eventType,
    payload: JSON.stringify(payload ?? {}),
    client_ip: meta.client_ip,
    user_agent: meta.user_agent,
    created_at: createdAt,
  });

  return rowToRecord({
    id: result.lastInsertRowid,
    event_type: eventType,
    payload: JSON.stringify(payload ?? {}),
    client_ip: meta.client_ip,
    user_agent: meta.user_agent,
    created_at: createdAt,
  });
}

function listByType(eventType, limit = 500) {
  return listStmt.all(eventType, limit).map(rowToRecord);
}

function persist(eventType, payload, req) {
  try {
    insertEvent(eventType, payload, req);
  } catch (err) {
    console.error(`[db] Failed to persist ${eventType}:`, err.message);
  }
}

module.exports = {
  isConfigured,
  insertEvent,
  listByType,
  persist,
  getClientMeta,
  DB_PATH,
};
