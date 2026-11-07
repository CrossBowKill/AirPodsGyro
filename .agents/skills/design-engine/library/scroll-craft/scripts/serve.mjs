#!/usr/bin/env node
/**
 * scrollcraft static server.
 *
 * A scrollcraft page cannot be verified from file://. The engine fetches each
 * clip as a Blob, and file:// fetches are blocked by CORS in every browser, so
 * the page silently falls back to posters and looks fine while proving nothing.
 * Serve it.
 *
 *   node serve.mjs --root builds/perkform --port 4500
 *
 * Local change: binds to 127.0.0.1 only (the LAN mode is removed). It answers only
 * requests whose Host is 127.0.0.1:<port> or localhost:<port>, which blocks
 * DNS rebinding, and returns 403 for any path segment starting with ".", so
 * dotfiles and dot-folders (.env, .git, .mcp.json) are never served.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };

const ROOT = path.resolve(arg("--root", "."));
const PORT = parseInt(arg("--port", "4500"), 10);
const HOST = "127.0.0.1";
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
// With the separator, a root of builds/acme can't also serve builds/acme-v2.
const BASE = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

http.createServer((req, res) => {
  // Only this machine, on this port, may ask. Anything else is a rebinding attempt.
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) { res.writeHead(403).end("forbidden"); return; }
  // A malformed escape (e.g. /%E0%A4%A) makes decodeURIComponent throw, which
  // would otherwise take the whole server down.
  let url;
  try { url = decodeURIComponent(req.url.split("?")[0]); }
  catch { res.writeHead(400).end("bad request"); return; }
  // Never serve a dotfile or anything inside a dot-folder (.env, .git, .mcp.json).
  if (url.split(/[\\/]/).some((seg) => seg.startsWith("."))) { res.writeHead(403).end("forbidden"); return; }
  let file = path.join(ROOT, url === "/" ? "/index.html" : url);

  // Refuse to serve outside the root even if the path walks up.
  if (file !== ROOT && !file.startsWith(BASE)) { res.writeHead(403).end("forbidden"); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }

  const ext = path.extname(file).toLowerCase();
  // Local change: serve only known web asset types; anything else (csv, env, db, logs, data dumps) is refused.
  if (!TYPES[ext]) { res.writeHead(403).end("forbidden"); return; }
  const stat = fs.statSync(file);
  res.writeHead(200, {
    "Content-Type": TYPES[ext],
    "Content-Length": stat.size,
    // No caching: verification loops re-shoot the same URLs after edits, and a
    // cached clip or stylesheet makes you screenshot the previous build.
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`scrollcraft: ${ROOT}\n  http://localhost:${PORT}`);
});
