/*
 * ============================================================================
 * WARNING — AUTHORIZED INTERNAL WAF TESTING ONLY
 * ============================================================================
 * This application (waf-test-range) is an INTENTIONALLY INSECURE security
 * testing target used to validate Radware WAF/CSMS detection and tune CWAF
 * policies. It contains NO security controls: no input validation, no auth
 * middleware, no rate limiting, and no output encoding.
 *
 * NEVER deploy this application without a WAF in front of it.
 * NEVER expose it to the public internet outside a network-restricted lab.
 * ============================================================================
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

const apiRoutes = require("./routes/api");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", apiRoutes);

app.listen(PORT, () => {
  console.log(`waf-test-range listening on port ${PORT}`);
  console.log(`Database: ${db.isConfigured() ? "InsForge connected" : "NOT configured — set INSFORGE_HOST + INSFORGE_API_KEY"}`);
  console.log("WARNING: Intentionally insecure — WAF required in front of this app.");
});
