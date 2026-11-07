// System Map request and path guards. Kept apart from the server so they can be attacked directly
// as well as over HTTP. Every rule here fails closed: when in doubt, refuse.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Pixi 8 builds its shader sync functions with new Function, so WebGL needs 'unsafe-eval'.
// Everything else is locked: no remote origin of any kind can be loaded or contacted.
export const CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

// Runs first on every route, so a web page cannot reach the server through DNS rebinding: a
// rebound request carries the attacker's host name, and a cross-site fetch carries its origin.
export function checkRequest(req, port) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, error: 'read only' };
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return { status: 403, error: 'host refused' };
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return { status: 403, error: 'origin refused' };
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return { status: 403, error: 'cross-site refused' };
  return null;
}

// Every private route needs the token made for this run. Hashing first means two values of any
// length can be compared in constant time.
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();
export function sameSecret(given, expected) {
  if (typeof given !== 'string' || !given || !expected) return false;
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

// ---------- reading files safely ----------
// Refuses links, pipes and devices, and never reads more than cap bytes. Opening without following
// links and checking the open file itself means the path cannot be swapped between check and read.
const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
export function safeRead(file, cap, { requireSingleLink = false, fromEnd = false } = {}) {
  let fd;
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    fd = fs.openSync(file, OPEN_FLAGS);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || (requireSingleLink && st.nlink !== 1)) return null;
    const size = Math.min(st.size, cap);
    const buf = Buffer.alloc(size);
    let got = 0;
    const offset = fromEnd ? Math.max(0, st.size - cap) : 0;
    while (got < size) { const n = fs.readSync(fd, buf, got, size - got, offset + got); if (!n) break; got += n; }
    return { buf: buf.subarray(0, got), size: st.size, mtime: st.mtime, offset };
  } catch { return null; } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } } }
}

// ---------- looking for keys in text ----------
// These always apply, so a project without .claude/security/patterns.tsv is still covered.
const BUILT_IN = [
  ['-{5}BEGIN [A-Z0-9 ]*PRIVATE KEY', ''], ['PuTTY-User-Key-File-', ''], ['(AKIA|ASIA)[0-9A-Z]{16}', ''],
  ['(sk|rk)_live_[A-Za-z0-9_]{16,}', ''], ['gh[pousr]_[A-Za-z0-9]{30,}', ''], ['sk-ant-[A-Za-z0-9_-]{20,}', ''], ['xox[abprs]-[A-Za-z0-9-]{10,}', ''], ['AIza[0-9A-Za-z_-]{35}', ''],
  ['(api[_-]?key|secret|token|passw(or)?d)["\']? *[:=] *["\']?[A-Za-z0-9/+_-]{16,}', 'i'], ['bearer +[A-Za-z0-9._~+/-]{8,}', 'i'],
];
const PATTERN_FILE_CAP = 64 * 1024;
const PATTERN_ROW_CAP = 200;
export function loadPatterns(claudeDir) {
  const rows = BUILT_IN.map(([source, flags]) => ({ source, flags: flags + 'm' }));
  const file = safeRead(path.join(claudeDir, 'security', 'patterns.tsv'), PATTERN_FILE_CAP);
  if (!file) return rows;
  for (const line of file.buf.toString('utf8').split('\n').slice(0, PATTERN_ROW_CAP)) {
    const [kind, , flag, source] = line.replace(/\r$/, '').split('\t');
    if (kind !== 'SECRET' || !source) continue;
    const flags = (flag === 'i' ? 'i' : '') + 'm';
    try { new RegExp(source, flags); rows.push({ source, flags }); } catch { /* a line that cannot compile is skipped */ }
  }
  return rows;
}
// Patterns can be edited by anyone, so they run under a time limit. Out of time counts as a match.
const SCAN_SOURCE = `(function () {
  var rules = __rows.map(function (r) { return new RegExp(r.source, r.flags); }), out = [];
  for (var i = 0; i < __texts.length; i++) { for (var j = 0; j < rules.length; j++) { if (rules[j].test(__texts[i])) { out.push(i); break; } } }
  return JSON.stringify(out);
})()`;
export function scanTexts(texts, rows, timeout = 1500) {
  try {
    const hits = vm.runInNewContext(SCAN_SOURCE, { __texts: texts, __rows: rows }, { timeout });
    return new Set(JSON.parse(hits));
  } catch { const all = new Set(texts.map((_, i) => i)); all.timedOut = true; return all; }
}
export const holdsKey = (text, rows) => scanTexts([text], rows).size > 0;

// ---------- what the map may open ----------
// Only files the map placed, inside these areas. Everything else stays a name on the map.
const SERVED_AREAS = /^\.claude\/(agents|commands|skills|hooks|recipes|scripts)\//;
const SERVED_FILES = new Set(['.claude/memory.md', '.claude/knowledge-base.md', '.claude/knowledge-nominations.md', '.claude/automations.yml', 'CLAUDE.md']);
const servable = (rel) => SERVED_FILES.has(rel) || SERVED_AREAS.test(rel);
export function allowedFiles(world) {
  const out = new Set();
  for (const n of world.nodes || []) if (typeof n.file === 'string' && servable(n.file)) out.add(n.file);
  for (const s of (world.skillLibrary && world.skillLibrary.shelves) || []) for (const k of s.skills) if (k.present && servable(k.file)) out.add(k.file);
  return out;
}
export const isSettingsName = (name) => /^settings(\.local)?\.json$/.test(String(name).toLowerCase());

// ---------- which names may never be read ----------
const NAME_RULES = [
  /^\.env/, /^env$/, /credentials?([^a-z]|$)/, /secret/, /^\.?mcp\.json/, /^settings\.local\.json/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /\.kdbx$/, /\.keystore$/, /\.jks$/,
  /^id_(rsa|dsa|ecdsa|ed25519)/, /^\.ssh$/, /^\.aws$/, /^\.git$/, /^\.git-credentials$/, /^\.gnupg$/, /^\.kube$/, /^\.npmrc$/, /^\.netrc$/, /^\.pgpass$/, /^node_modules$/,
];
const DEVICE = /^(con|prn|aux|nul|com\d|lpt\d|conin\$|conout\$)(\.|$)/;

// True when this one path segment is refused. Compared lower case, so case-insensitive disks
// (macOS, Windows) cannot be used to slip past a rule with .ENV or Credentials.txt.
export function segmentRefused(segment) {
  const raw = String(segment).normalize('NFKC');
  const s = raw.toLowerCase();
  if (!s || s === '.' || s === '..') return true;
  if (/[.\s]$/.test(s) || s.includes(':') || /[<>"|?*]/.test(s)) return true; // Windows ignores trailing dots and spaces; a colon opens an alternate data stream
  if (/~\d/.test(s)) return true; // Windows 8.3 short names, such as CREDEN~1
  if (DEVICE.test(s)) return true;
  if (s.startsWith('.') && s !== '.claude') return true;
  return NAME_RULES.some((re) => re.test(s));
}

const insideOf = (parent, child) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

// Resolves a project-relative path for /file, or says why not.
export function resolveFile(root, input) {
  if (typeof input !== 'string' || !input || input.length > 1024) return { status: 400, error: 'bad path' };
  // format characters, controls and the code points HFS+ ignores can hide a name from the rules below
  if (/[\p{Cc}\p{Cf}͏ᅟᅠ឴឵ㅤﾠ]/u.test(input)) return { status: 400, error: 'bad path' };
  const norm = input.normalize('NFKC').replace(/\\/g, '/');
  if (norm.startsWith('/') || norm.startsWith('~') || /^[a-z]:/i.test(norm)) return { status: 403, error: 'only paths inside this project' };
  const segments = norm.split('/').filter((s) => s !== '');
  if (!segments.length) return { status: 400, error: 'bad path' };
  for (const s of segments) if (segmentRefused(s)) return { status: 403, error: 'refused' };
  const full = path.resolve(root, ...segments);
  if (!insideOf(root, full)) return { status: 403, error: 'only paths inside this project' };
  let real, realRoot;
  try { realRoot = fs.realpathSync.native(root); real = fs.realpathSync.native(full); } catch { return { status: 404, error: 'not found' }; }
  if (!insideOf(realRoot, real)) return { status: 403, error: 'link leaves the project' };
  // a link that stays inside the project still cannot point at a refused name
  const rel = path.relative(realRoot, real).split(path.sep);
  if (rel.some((s) => s && segmentRefused(s))) return { status: 403, error: 'refused' };
  const relPath = rel.join('/');
  if (/(^|\/)\.claude\/logs(\/|$)/i.test(relPath)) return { status: 403, error: 'logs are not shown' }; // logs can hold raw error text
  return { full: real, rel: relPath };
}

// ---------- static files, confined to public/ ----------
export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
export function resolveStatic(publicDir, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath); } catch { return null; }
  if (/[\0\\]/.test(p)) return null;
  const segments = p.split('/').filter(Boolean);
  if (!segments.length || segments.some((s) => s.startsWith('.') || /[:~]/.test(s))) return null;
  if (!MIME[path.extname(p).toLowerCase()]) return null;
  let real, realPublic;
  try { realPublic = fs.realpathSync(publicDir); real = fs.realpathSync(path.join(publicDir, ...segments)); } catch { return null; }
  if (!insideOf(realPublic, real)) return null;
  try { if (!fs.statSync(real).isFile()) return null; } catch { return null; }
  return real;
}

// settings.json can hold keys in env, in approved commands, in apiKeyHelper and in MCP entries, so
// the file itself never reaches the page. This view is built from three named fields and nothing else.
export function settingsView(text, rows) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  const out = [];
  const hooks = j && typeof j === 'object' && j.hooks && typeof j.hooks === 'object' ? j.hooks : {};
  for (const [event, list] of Object.entries(hooks)) {
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry || typeof entry !== 'object') continue;
      for (const h of Array.isArray(entry.hooks) ? entry.hooks : []) {
        if (!h || typeof h !== 'object') continue;
        const m = String(h.command || '').match(/hooks\/([A-Za-z0-9_.-]+\.sh)/);
        const matcher = String(entry.matcher || '*').slice(0, 80);
        out.push({ event: event.slice(0, 40), matcher: holdsKey(matcher, rows) ? '(hidden)' : matcher, script: m ? m[1] : '(no script)' });
      }
    }
  }
  const lines = out.map((r) => `${r.event}  ${r.matcher}  ${r.script}`);
  return ['Summary of settings.json: hook event, matcher and script.', 'Everything else in this file stays private and is not shown here.', '', ...(lines.length ? lines : ['No hooks are switched on.'])].join('\n');
}
