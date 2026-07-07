/*
 * ============================================================================
 * SSRF / REDIRECT-VALIDATION WAF TEST ENDPOINT — INTENTIONALLY UNPROTECTED
 * ============================================================================
 * GET /redirect?url=<target>
 *
 * Emulates a common real-world pattern: server-side "link preview" / URL
 * fetchers (Slack unfurl, webhook reachability checks, import-from-URL, etc.)
 * where the app performs an outbound HTTP GET on behalf of the user.
 *
 * NO SSRF protection at the app layer — no allowlists, no private-IP blocking,
 * no scheme filtering. Radware CWAF SSRF / redirect-validation rules are
 * expected to block malicious targets BEFORE this handler runs.
 *
 * Do NOT deploy to a production domain without WAF rules enabled in front.
 * Authorized internal WAF lab use only (waf-test-range).
 * ============================================================================
 */

const express = require("express");
const db = require("../db");

const router = express.Router();
const FETCH_TIMEOUT_MS = 3000;
const BODY_SNIPPET_LEN = 200;

router.get("/", async (req, res) => {
  const requestedUrl = req.query.url;

  if (!requestedUrl || String(requestedUrl).trim() === "") {
    console.log("[redirect-lab] missing url parameter");
    return res.status(400).json({
      error: "Missing required query parameter: url",
      example: "/redirect?url=https://example.com",
    });
  }

  const url = String(requestedUrl).trim();
  const logBase = {
    requestedUrl: url,
    clientIp:
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress,
  };

  let outcome = {
    requestedUrl: url,
    status: "error",
    bodySnippet: "",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "waf-test-range-link-preview/1.0",
        Accept: "text/html,application/json,*/*",
      },
    });

    const body = await response.text();
    outcome = {
      requestedUrl: url,
      status: response.status,
      bodySnippet: body.slice(0, BODY_SNIPPET_LEN),
    };

    console.log("[redirect-lab] fetch ok", {
      ...logBase,
      status: response.status,
      bodyLength: body.length,
    });

    db.persist(
      "redirect_fetch",
      {
        ...outcome,
        success: true,
        bodyLength: body.length,
      },
      req
    );
  } catch (err) {
    const message =
      err.name === "AbortError"
        ? `Request timed out after ${FETCH_TIMEOUT_MS}ms`
        : err.message;

    outcome = {
      requestedUrl: url,
      status: "error",
      bodySnippet: message,
    };

    console.log("[redirect-lab] fetch failed", {
      ...logBase,
      error: message,
    });

    db.persist(
      "redirect_fetch",
      {
        ...outcome,
        success: false,
      },
      req
    );
  } finally {
    clearTimeout(timer);
  }

  res.json(outcome);
});

module.exports = router;
