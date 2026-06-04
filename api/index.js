// redirect-proxy/api/index.js
// Vercel serverless function — all routes handled here
// No external database required. Codes are base64url-encoded target URLs.
// Only env var needed: ADMIN_KEY (set in Vercel dashboard)

const crypto = require("crypto");

// ─── Encoding helpers ────────────────────────────────────────────
// The "code" IS the target URL encoded as base64url. No storage needed.

function encodeTarget(url) {
  return Buffer.from(url, "utf8").toString("base64url");
}

function decodeTarget(code) {
  try {
    const decoded = Buffer.from(code, "base64url").toString("utf8");
    // Must be a valid http/https URL
    if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) return null;
    new URL(decoded); // throws if malformed
    return decoded;
  } catch {
    return null;
  }
}

// ─── Admin UI HTML ───────────────────────────────────────────────
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proxy Admin — DEATH X PAYBACK</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #eee; font-family: 'Courier New', monospace; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; }
  .wrap { width: 100%; max-width: 660px; }
  h1 { font-size: 1.6rem; color: #ef4444; margin-bottom: 4px; letter-spacing: 3px; text-transform: uppercase; }
  .sub { font-size: 0.72rem; color: #555; margin-bottom: 32px; letter-spacing: 1px; text-transform: uppercase; }
  label { display: block; font-size: 0.7rem; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  input { width: 100%; background: #111; border: 1px solid #333; color: #eee; padding: 10px 14px; border-radius: 6px; font-family: inherit; font-size: 0.9rem; margin-bottom: 16px; outline: none; transition: border-color .15s; }
  input:focus { border-color: #ef4444; }
  button.primary { background: #ef4444; color: #fff; border: none; padding: 12px 28px; border-radius: 6px; font-family: inherit; font-weight: bold; letter-spacing: 1px; cursor: pointer; font-size: 0.85rem; width: 100%; transition: background .15s; }
  button.primary:hover { background: #dc2626; }
  button.primary:disabled { background: #7f1d1d; cursor: not-allowed; opacity: .6; }
  .result { margin-top: 24px; background: #0d1f16; border: 1px solid #14532d; padding: 18px; border-radius: 8px; display: none; }
  .result.show { display: block; }
  .result p { font-size: 0.78rem; color: #6b7280; margin-bottom: 8px; }
  .url { font-size: 0.88rem; color: #34d399; word-break: break-all; cursor: pointer; padding: 10px 12px; background: #0a1a12; border-radius: 4px; border: 1px solid #14532d; transition: background .15s; }
  .url:hover { background: #0d2218; }
  .copy-hint { font-size: 0.68rem; color: #4b5563; margin-top: 6px; }
  .log { margin-top: 36px; }
  .log h2 { font-size: 0.75rem; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-bottom: 1px solid #1a1a1a; padding-bottom: 8px; }
  .log-item { background: #0f0f0f; border: 1px solid #1a1a1a; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .log-target { color: #6b7280; font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .log-link { color: #3b82f6; font-size: 0.75rem; text-decoration: none; white-space: nowrap; flex-shrink: 0; }
  .log-link:hover { color: #60a5fa; }
  .del-btn { background: none; border: 1px solid #3f3f3f; color: #6b7280; border-radius: 4px; cursor: pointer; font-size: 0.7rem; padding: 2px 7px; flex-shrink: 0; transition: all .15s; }
  .del-btn:hover { border-color: #ef4444; color: #ef4444; }
  .err { color: #f87171; margin-top: 10px; font-size: 0.8rem; min-height: 1.2em; }
  .notice { font-size: 0.7rem; color: #374151; margin-top: 8px; line-height: 1.5; }
  .notice strong { color: #4b5563; }
  .empty { color: #374151; font-size: 0.78rem; padding: 12px 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Proxy Admin</h1>
  <p class="sub">// death x payback — redirect manager</p>

  <div>
    <label>Admin Key</label>
    <input id="key" type="password" placeholder="Your ADMIN_KEY from Vercel env vars" autocomplete="current-password">
  </div>
  <div>
    <label>Target URL (PayBack trap link)</label>
    <input id="target" type="url" placeholder="https://your-payback-app.replit.app/trap/uuid…">
  </div>
  <button class="primary" id="btn" onclick="create()">Generate Redirect Link</button>
  <div id="err" class="err"></div>
  <p class="notice">
    <strong>Links are permanent.</strong> No database required — the destination is encoded directly in the URL.
    Your redirect list is saved in this browser only (localStorage).
  </p>

  <div class="result" id="result">
    <p>// Share this URL with the target. Your real trap link stays hidden:</p>
    <div class="url" id="url" onclick="copy()"></div>
    <div class="copy-hint" id="copy-hint">Click URL to copy to clipboard</div>
  </div>

  <div class="log">
    <h2>// Active Redirects (this browser)</h2>
    <div id="log-items"><div class="empty">Enter your admin key above and create a redirect to get started.</div></div>
  </div>
</div>

<script>
  const HOST = window.location.origin;
  const LS_KEY = 'px_redirects_v2';

  // ── LocalStorage helpers ──────────────────────────────────────
  function loadLinks() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveLink(code, target, url) {
    const list = loadLinks();
    list.unshift({ code, target, url, ts: Date.now() });
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 100)));
  }

  function deleteLink(code) {
    const list = loadLinks().filter(r => r.code !== code);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    renderList();
  }

  function renderList() {
    const list = loadLinks();
    const el = document.getElementById('log-items');
    if (!list.length) {
      el.innerHTML = '<div class="empty">No redirects yet.</div>';
      return;
    }
    el.innerHTML = list.map(r => {
      const shortCode = r.code.length > 16 ? r.code.slice(0, 16) + '…' : r.code;
      const safeTarget = r.target.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeUrl = r.url.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeCode = r.code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<div class="log-item">' +
        '<span class="log-target" title="' + safeTarget + '">' + safeTarget + '</span>' +
        '<a class="log-link" href="' + safeUrl + '" target="_blank" rel="noopener">Open ↗</a>' +
        '<button class="del-btn" onclick="deleteLink(\\'' + safeCode + '\\')">✕</button>' +
        '</div>';
    }).join('');
  }

  // ── Create redirect ───────────────────────────────────────────
  async function create() {
    const key    = document.getElementById('key').value.trim();
    const target = document.getElementById('target').value.trim();
    const errEl  = document.getElementById('err');
    const btn    = document.getElementById('btn');

    errEl.textContent = '';
    if (!key)    { errEl.textContent = 'Admin key is required.'; return; }
    if (!target) { errEl.textContent = 'Target URL is required.'; return; }
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      errEl.textContent = 'Target must be a full URL starting with https://';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Generating…';

    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: key, target }),
      });
      const json = await res.json();

      if (!res.ok) {
        errEl.textContent = json.error || 'Server error (' + res.status + '). Check your admin key.';
        return;
      }

      const urlEl = document.getElementById('url');
      urlEl.textContent = json.url;
      document.getElementById('result').classList.add('show');
      document.getElementById('copy-hint').textContent = 'Click URL to copy to clipboard';

      saveLink(json.code, target, json.url);
      renderList();

    } catch (e) {
      errEl.textContent = 'Network error: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Redirect Link';
    }
  }

  // ── Copy to clipboard ─────────────────────────────────────────
  function copy() {
    const url = document.getElementById('url').textContent;
    navigator.clipboard.writeText(url).then(() => {
      document.getElementById('copy-hint').textContent = 'Copied!';
      setTimeout(() => {
        document.getElementById('copy-hint').textContent = 'Click URL to copy to clipboard';
      }, 2000);
    }).catch(() => {
      window.getSelection().selectAllChildren(document.getElementById('url'));
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  renderList();

  document.getElementById('key').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('target').focus();
  });
  document.getElementById('target').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') create();
  });
</script>
</body>
</html>`;

// ─── Iframe proxy page ───────────────────────────────────────────
function proxyHtml(target) {
  const safeTarget = target
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verifying…</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #fff; }
  iframe { position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; display: block; }
  .loader { position: fixed; inset: 0; background: #fff; display: flex; align-items: center; justify-content: center; z-index: 9; transition: opacity .3s; }
  .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #4b5563; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="loader" id="loader"><div class="spinner"></div></div>
<iframe
  id="frame"
  src="${safeTarget}"
  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-top-navigation-by-user-activation allow-downloads allow-pointer-lock"
  allow="camera; microphone; geolocation; notifications; clipboard-read; clipboard-write; accelerometer; gyroscope"
  loading="eager"
></iframe>
<script>
  document.getElementById('frame').addEventListener('load', function() {
    const l = document.getElementById('loader');
    if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 350); }
  });
  // Fallback: hide loader after 4s even if load event doesn't fire
  setTimeout(function() {
    const l = document.getElementById('loader');
    if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 350); }
  }, 4000);
</script>
</body>
</html>`;
}

// ─── Read request body ───────────────────────────────────────────
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// ─── Main handler ────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS headers for API routes
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");

  let pathname;
  try {
    const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    pathname = u.pathname;
  } catch {
    return res.status(400).send("Bad request");
  }

  // ── OPTIONS preflight ──────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // ── POST /api/create ──────────────────────────────────────────
  if (req.method === "POST" && pathname === "/api/create") {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const { adminKey, target } = body;

    // Validate admin key (if ADMIN_KEY env var is set)
    const expectedKey = process.env.ADMIN_KEY;
    if (expectedKey && adminKey !== expectedKey) {
      return res.status(401).json({ error: "Invalid admin key" });
    }
    if (!expectedKey) {
      // No ADMIN_KEY set — warn but allow (so first deploy still works)
      console.warn("ADMIN_KEY environment variable is not set — endpoint is unprotected");
    }

    if (!target || typeof target !== "string") {
      return res.status(400).json({ error: "target is required" });
    }
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      return res.status(400).json({ error: "target must start with http:// or https://" });
    }

    // Validate it's a parseable URL
    try { new URL(target); } catch {
      return res.status(400).json({ error: "target is not a valid URL" });
    }

    // Encode target as base64url — this IS the code (no database needed)
    const code = encodeTarget(target);
    const redirectUrl = `https://${req.headers.host}/${code}`;

    return res.status(200).json({ code, url: redirectUrl });
  }

  // ── GET / — Admin panel ───────────────────────────────────────
  if (req.method === "GET" && (pathname === "/" || pathname === "")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(ADMIN_HTML);
  }

  // ── GET /health — health check ────────────────────────────────
  if (req.method === "GET" && pathname === "/health") {
    return res.status(200).json({ ok: true });
  }

  // ── GET /favicon.ico ─────────────────────────────────────────
  if (pathname === "/favicon.ico") {
    return res.status(204).end();
  }

  // ── GET /:code — resolve redirect ─────────────────────────────
  if (req.method === "GET") {
    const code = pathname.replace(/^\//, "").split("/")[0];

    if (!code) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(ADMIN_HTML);
    }

    const target = decodeTarget(code);

    if (!target) {
      return res.status(404).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Not Found</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
.box{text-align:center;padding:40px}.h{font-size:4rem;font-weight:bold;color:#d1d5db}.t{color:#9ca3af;margin-top:8px}</style>
</head><body><div class="box"><div class="h">404</div><div class="t">Link not found or has expired.</div></div></body></html>`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.status(200).send(proxyHtml(target));
  }

  return res.status(405).json({ error: "Method not allowed" });
};
