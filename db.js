const fs = require("fs");
const path = require("path");

const TABLE = "waf_events";

function loadInsforgeConfig() {
  const host = process.env.INSFORGE_HOST;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (host && apiKey) {
    return { host, apiKey };
  }

  try {
    const projectFile = path.join(__dirname, "..", ".insforge", "project.json");
    if (fs.existsSync(projectFile)) {
      const proj = JSON.parse(fs.readFileSync(projectFile, "utf8"));
      return {
        host: proj.oss_host || "",
        apiKey: proj.api_key || "",
      };
    }
  } catch (_) {
    // ignore
  }

  return { host: "", apiKey: "" };
}

const { host: INSFORGE_HOST, apiKey: INSFORGE_API_KEY } = loadInsforgeConfig();
const BASE_URL = INSFORGE_HOST ? `${INSFORGE_HOST}/api/database/records/${TABLE}` : "";

const headers = {
  Authorization: `Bearer ${INSFORGE_API_KEY}`,
  "Content-Type": "application/json",
};

function isConfigured() {
  return Boolean(BASE_URL && INSFORGE_API_KEY);
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

async function insertEvent(eventType, payload, req) {
  if (!isConfigured()) {
    console.warn("[db] InsForge not configured — event not persisted:", eventType);
    return null;
  }

  const meta = req ? getClientMeta(req) : { client_ip: null, user_agent: null };
  const row = {
    event_type: eventType,
    payload,
    client_ip: meta.client_ip,
    user_agent: meta.user_agent,
  };

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
    body: JSON.stringify([row]),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB insert failed (${res.status}): ${text}`);
  }

  const rows = await res.json();
  return rows[0] || null;
}

async function listByType(eventType, limit = 500) {
  if (!isConfigured()) {
    return [];
  }

  const url = `${BASE_URL}?event_type=eq.${encodeURIComponent(eventType)}&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB list failed (${res.status}): ${text}`);
  }

  return res.json();
}

function persist(eventType, payload, req) {
  insertEvent(eventType, payload, req).catch((err) => {
    console.error(`[db] Failed to persist ${eventType}:`, err.message);
  });
}

module.exports = {
  isConfigured,
  insertEvent,
  listByType,
  persist,
  getClientMeta,
};
