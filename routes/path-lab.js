/*
 * Intentionally insecure path / directory lab for Radware Path Access Protection
 * and nested URL testing. Authorized WAF lab only.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const publicRoot = path.join(__dirname, "..", "public");

const LAB_DIRS = [
  {
    path: "/OTP/Gentax/Resource/",
    purpose: "Path Access Protection — versioned CSS/JS under nested folders",
  },
  {
    path: "/assets/vendor/lib/",
    purpose: "Generic nested static assets",
  },
  {
    path: "/static/vendor/widgets/",
    purpose: "Second nesting style for wildcard path rules",
  },
  {
    path: "/node/v2/email/claim-failure/",
    purpose: "Customer-like page path for JSON SQLi refinements",
  },
  {
    path: "/node/v2/email/claim-doc-submission/",
    purpose: "Customer-like email submission path",
  },
  {
    path: "/node/v2/email/uw-doc-submission/",
    purpose: "Customer-like underwriting doc path",
  },
];

const FIXTURES = [
  [
    "OTP/Gentax/Resource/Controls.External.DefaultExternal.min.css.v.697701574",
    "/* path-lab css fixture */\nbody{margin:0}\n",
  ],
  [
    "OTP/Gentax/Resource/WDC.min.js.v.382993438",
    "/* path-lab js fixture */\nwindow.__PATH_LAB__=true;\n",
  ],
  [
    "OTP/Gentax/Resource/WDC.External.DefaultExternal.min.css.v.255634733",
    "/* path-lab css fixture 2 */\n.html{padding:0}\n",
  ],
  ["OTP/Gentax/Resource/readme.txt", "Gentax Resource path-lab directory\n"],
  ["assets/vendor/lib/widget.min.js", "console.log('assets vendor lib');\n"],
  ["assets/vendor/lib/theme.css", ".vendor-theme{}\n"],
  ["static/vendor/widgets/chart.js", "console.log('static widget');\n"],
  ["static/vendor/widgets/chart.css", ".chart{}\n"],
  [
    "node/v2/email/claim-failure/index.html",
    "<!doctype html><title>claim-failure</title><p>path-lab claim-failure</p>\n",
  ],
  [
    "node/v2/email/claim-doc-submission/index.html",
    "<!doctype html><title>claim-doc-submission</title><p>path-lab claim-doc-submission</p>\n",
  ],
  [
    "node/v2/email/uw-doc-submission/index.html",
    "<!doctype html><title>uw-doc-submission</title><p>path-lab uw-doc-submission</p>\n",
  ],
];

function ensureTree() {
  for (const [rel, body] of FIXTURES) {
    const full = path.join(publicRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, body, "utf8");
    }
  }
}

function persistSafe(eventType, payload, req) {
  try {
    const db = require("../db");
    db.persist(eventType, payload, req);
  } catch {
    // DB optional for path-lab POSTs (container/native rebuild issues)
  }
}

function echoJson(routeName) {
  return (req, res) => {
    const body = req.body || {};
    persistSafe("path_lab_post", { route: routeName, body }, req);
    res.json({
      ok: true,
      route: routeName,
      received: body,
      note: "Intentionally insecure — use for WAF path + JSON-parameter lab only",
    });
  };
}

ensureTree();

router.get("/path-lab/catalog", (_req, res) => {
  res.json({
    purpose: "Directory / Path Access Protection test catalog",
    directories: LAB_DIRS,
    sampleUrls: [
      "/OTP/Gentax/Resource/WDC.min.js.v.382993438",
      "/OTP/Gentax/Resource/Controls.External.DefaultExternal.min.css.v.697701574",
      "/OTP/Gentax/Resource/WDC.External.DefaultExternal.min.css.v.255634733",
      "/assets/vendor/lib/widget.min.js",
      "/static/vendor/widgets/chart.js",
      "/node/v2/email/claim-failure/",
      "/node/v2/email/claim-doc-submission/",
      "/node/v2/email/uw-doc-submission/",
    ],
    regexHints: {
      pathAccess:
        "Prefer ^/OTP/Gentax/Resource/.* over /OTP/Gentax/Resource/*.* unless UI documents glob syntax",
      parameterJson:
        "For SQL Injection refinements try json\\.details\\.(location|streettype)",
    },
  });
});

router.post("/node/v2/email/claim-failure", echoJson("/node/v2/email/claim-failure"));
router.post(
  "/node/v2/email/claim-doc-submission",
  echoJson("/node/v2/email/claim-doc-submission")
);
router.post(
  "/node/v2/email/uw-doc-submission",
  echoJson("/node/v2/email/uw-doc-submission")
);
router.post("/api/mwSubmitNote", echoJson("/api/mwSubmitNote"));
router.post("/api/submitClaim", echoJson("/api/submitClaim"));

module.exports = { router, LAB_DIRS, ensureTree };
