const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const multer = require("multer");
const xml2js = require("xml2js");

const users = require("../data/users");
const products = require("../data/products");
const db = require("../db");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads");
const filesDir = path.join(__dirname, "..", "files");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

router.get("/search", async (req, res) => {
  const q = req.query.q || "";
  const fakeSql = `SELECT * FROM products WHERE name LIKE '%${q}%'`;
  console.log("[FAKE SQL]", fakeSql);

  const results = products.filter((p) =>
    p.name.toLowerCase().includes(String(q).toLowerCase())
  );

  db.persist("search", { query: q, fakeSql, result_count: results.length }, req);

  res.json({
    query: q,
    fakeSql,
    echo: q,
    results,
  });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const fakeSql = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
  console.log("[FAKE SQL]", fakeSql);

  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  const success = Boolean(user);

  db.persist(
    "login",
    {
      username: username || "",
      password: password || "",
      fakeSql,
      success,
      user_id: success ? user.id : null,
    },
    req
  );

  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false });
  }
});

router.post("/comments", async (req, res) => {
  const { name, comment } = req.body || {};
  const entry = {
    name: name || "",
    comment: comment || "",
    createdAt: new Date().toISOString(),
  };

  try {
    const saved = await db.insertEvent("comment", entry, req);
    res.json({
      success: true,
      comment: {
        id: saved?.id,
        ...entry,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/comments", async (req, res) => {
  try {
    const rows = await db.listByType("comment");
    const comments = rows.map((row) => ({
      id: row.id,
      name: row.payload?.name || "",
      comment: row.payload?.comment || "",
      createdAt: row.created_at || row.payload?.createdAt,
    }));
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = users.find((u) => u.id === id);

  db.persist("user_lookup", { requested_id: id, found: Boolean(user) }, req);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const record = {
    filename: req.file.originalname,
    path: `/uploads/${req.file.originalname}`,
    size: req.file.size,
    mimetype: req.file.mimetype,
  };

  db.persist("upload", record, req);

  res.json({
    success: true,
    ...record,
  });
});

router.get("/file", (req, res) => {
  const name = req.query.name || "";
  const filePath = path.join(filesDir, name);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    db.persist("file_read", { filename: name, success: true }, req);
    res.type("text/plain").send(content);
  } catch (err) {
    db.persist("file_read", { filename: name, success: false, error: err.message }, req);
    res.status(404).json({ error: err.message });
  }
});

router.get("/ping", (req, res) => {
  const host = req.query.host || "";
  const cmd = `ping -c 1 ${host}`;
  exec(cmd, (error, stdout, stderr) => {
    db.persist(
      "ping",
      {
        host,
        command: cmd,
        stdout,
        stderr,
        error: error ? error.message : null,
      },
      req
    );

    res.json({
      command: cmd,
      stdout,
      stderr,
      error: error ? error.message : null,
    });
  });
});

router.get("/products", (req, res) => {
  const id = req.query.id;
  const fakeSql = `SELECT * FROM products WHERE id = ${id}`;
  console.log("[FAKE SQL]", fakeSql);

  const product = products.find((p) => String(p.id) === String(id));

  db.persist(
    "product_lookup",
    { product_id: id, fakeSql, found: Boolean(product) },
    req
  );

  if (!product) {
    return res.status(404).json({ error: "Product not found", fakeSql, id });
  }
  res.json({ product, fakeSql, id });
});

router.post("/feedback", express.raw({ type: () => true, limit: "5mb" }), (req, res) => {
  const body = req.body ? req.body.toString() : "";
  const parser = new xml2js.Parser();
  parser.parseString(body, (err, result) => {
    if (err) {
      db.persist("feedback", { raw_xml: body, parse_error: err.message }, req);
      return res.status(400).json({ error: err.message, raw: body });
    }

    db.persist("feedback", { raw_xml: body, parsed: result }, req);
    res.json(result);
  });
});

router.get("/redirect", (req, res) => {
  const url = req.query.url || "/";
  db.persist("redirect", { url }, req);
  res.redirect(url);
});

module.exports = router;
