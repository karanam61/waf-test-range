/**
 * Issue Let's Encrypt cert for waf1-test.my1earningtools.org via HTTP-01.
 * Requires: domain CNAME → Render, ACME route deployed, RENDER_API_KEY in env.
 *
 * Usage: node scripts/issue-letsencrypt.js
 * Output: certs/private.key, certs/certificate.pem, certs/fullchain.pem
 */

const fs = require("fs");
const path = require("path");
const acme = require("acme-client");

const DOMAIN = "waf1-test.my1earningtools.org";
const EMAIL = "Karanam.anish@gmail.com";
const SERVICE_ID = "srv-d8tekournols73aei59g";
const CERT_DIR = path.join(__dirname, "..", "certs");
const RENDER_TOKEN =
  process.env.RENDER_API_KEY ||
  (() => {
    try {
      const yaml = fs.readFileSync(
        path.join(process.env.USERPROFILE || process.env.HOME, ".render", "cli.yaml"),
        "utf8"
      );
      const m = yaml.match(/key:\s*(rnd_\S+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  })();

if (!RENDER_TOKEN) {
  console.error("Set RENDER_API_KEY or run render login first.");
  process.exit(1);
}

async function renderFetch(method, urlPath, body) {
  const res = await fetch(`https://api.render.com/v1${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${RENDER_TOKEN}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function setAcmeEnv(token, key) {
  for (const [k, v] of [
    ["ACME_TOKEN", token],
    ["ACME_KEY", key],
  ]) {
    await renderFetch("PUT", `/services/${SERVICE_ID}/env-vars/${k}`, { value: v });
  }
  console.log("Set ACME env vars on Render (deploy triggered)…");
}

async function clearAcmeEnv() {
  for (const k of ["ACME_TOKEN", "ACME_KEY"]) {
    try {
      await renderFetch("DELETE", `/services/${SERVICE_ID}/env-vars/${k}`);
    } catch {
      /* already removed */
    }
  }
  console.log("Cleared ACME env vars on Render.");
}

async function waitForDeploy() {
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const list = await renderFetch("GET", `/services/${SERVICE_ID}/deploys?limit=1`);
    const deploy = list?.[0]?.deploy;
    if (deploy?.status === "live") {
      console.log("Render deploy live.");
      return;
    }
    console.log(`Deploy status: ${deploy?.status || "unknown"}…`);
  }
  throw new Error("Timed out waiting for Render deploy");
}

async function waitForChallenge(token, keyAuthorization) {
  const url = `http://${DOMAIN}/.well-known/acme-challenge/${token}`;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (res.ok && text.trim() === keyAuthorization) {
        console.log("ACME challenge reachable:", url);
        return;
      }
      console.log(`Challenge check ${res.status}: ${text.slice(0, 40)}…`);
    } catch (e) {
      console.log("Challenge fetch failed:", e.message);
    }
  }
  throw new Error("ACME challenge URL not reachable");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(CERT_DIR, { recursive: true });

  const accountKeyPath = path.join(CERT_DIR, "acme-account.key");
  let accountKey;
  if (fs.existsSync(accountKeyPath)) {
    accountKey = fs.readFileSync(accountKeyPath);
  } else {
    accountKey = await acme.crypto.createPrivateKey();
    fs.writeFileSync(accountKeyPath, accountKey);
  }

  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  const [privateKey, csr] = await acme.crypto.createCsr({ commonName: DOMAIN });

  console.log(`Requesting certificate for ${DOMAIN}…`);

  const cert = await client.auto({
    csr,
    email: EMAIL,
    termsOfServiceAgreed: true,
    challengePriority: ["http-01"],
    challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
      if (challenge.type !== "http-01") throw new Error(`Unexpected challenge: ${challenge.type}`);
      await setAcmeEnv(challenge.token, keyAuthorization);
      await waitForDeploy();
      await waitForChallenge(challenge.token, keyAuthorization);
    },
    challengeRemoveFn: async () => {
      await clearAcmeEnv();
    },
  });

  fs.writeFileSync(path.join(CERT_DIR, "private.key"), privateKey);
  fs.writeFileSync(path.join(CERT_DIR, "certificate.pem"), cert);
  fs.writeFileSync(path.join(CERT_DIR, "fullchain.pem"), cert);

  console.log("\nDone. Upload to Radware → Settings → Certificates:");
  console.log(`  Private key: ${path.join(CERT_DIR, "private.key")}`);
  console.log(`  Certificate: ${path.join(CERT_DIR, "fullchain.pem")}`);
  console.log(`  Domain:      ${DOMAIN}`);
  console.log("  Expires in ~90 days — re-run this script to renew.");
}

main().catch((err) => {
  console.error(err);
  clearAcmeEnv().catch(() => {});
  process.exit(1);
});
