#!/usr/bin/env node
// System Map server. Node 18 or later, no packages to install.
//   node .claude/system-map/server.mjs start     starts in the background and opens the map
//   node .claude/system-map/server.mjs stop      stops it
//   node .claude/system-map/server.mjs status    says whether it is running
// Listens on 127.0.0.1 only and never makes a network call of its own. Each run makes its own
// private link, and without that link the server hands out nothing from your project.

import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { getClaude, getRoot, prepareDataDir, rootRefusal, writePrivate, DATA_DIR, OUT } from './extract.mjs';
import { SECURITY_HEADERS, MIME, checkRequest, holdsKey, isSettingsName, loadPatterns, resolveFile, resolveStatic, safeRead, sameSecret, settingsView } from './guard.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const PUBLIC = path.join(HERE, 'public');
const STATE = path.join(DATA_DIR, 'server.json');
const LOCK = path.join(DATA_DIR, 'server.lock');
const LAST_ERROR = path.join(DATA_DIR, 'last-error.txt');
const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.SYSTEM_MAP_PORT || 7878);
const PORT_TRIES = 11;
const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5000; // a file that never stops changing still gets the map rebuilt
const POLL_MS = 4000;
const POLL_FILE_CAP = 40000;
const RECHECK_MS = Number(process.env.SYSTEM_MAP_RECHECK_MS || 5 * 60 * 1000); // health depends on the clock too, so it is rebuilt while someone is watching
const IDLE_MS = Number(process.env.SYSTEM_MAP_IDLE_MS || 30 * 60 * 1000);
const BUILD_LIMIT_MS = Number(process.env.SYSTEM_MAP_BUILD_LIMIT_MS || 60000);
const MAX_STREAMS = 16;
const MAX_TICKETS = 8;
const TICKET_MS = 30000;
const FILE_CAP = 512 * 1024;
const TEXT_EXT = new Set(['.md', '.txt', '.yml', '.yaml', '.json', '.jsonl', '.sh', '.mjs', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.py', '.csv', '.toml']);
const ROOT = getRoot();

const JSON_TYPE = 'application/json; charset=utf-8';
function send(res, status, body, type = 'text/plain; charset=utf-8', head = false) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(head ? undefined : body);
}
const refuse = (res, status, error) => send(res, status, JSON.stringify({ error }), JSON_TYPE);

// ---------- the private link ----------
// The page holds the token in memory and sends it as a header. An EventSource cannot send a header,
// so the page swaps the token for a ticket that works once, for 30 seconds, and puts that in the
// stream's address. The token itself never travels in a URL and there is no cookie.
let token = '';
let lastUse = Date.now();
const tickets = new Map();
const hasToken = (req) => sameSecret(req.headers['x-map-token'], token);
function issueTicket() {
  const now = Date.now();
  for (const [k, until] of tickets) if (until <= now) tickets.delete(k);
  while (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value);
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, now + TICKET_MS);
  return ticket;
}
function useTicket(given) {
  if (typeof given !== 'string') return false;
  const until = tickets.get(given);
  tickets.delete(given);
  return !!until && until > Date.now();
}

// ---------- routes ----------
let allowed = new Set();
let patterns = [];
function serveFile(req, res, url) {
  const head = req.method === 'HEAD';
  const r = resolveFile(ROOT, url.searchParams.get('path'));
  if (r.error) return refuse(res, r.status, r.error);
  const isSettings = isSettingsName(path.basename(r.full));
  if (isSettings && r.rel.toLowerCase() !== '.claude/settings.json') return refuse(res, 403, 'refused');
  if (!isSettings && !allowed.has(r.rel)) return refuse(res, 403, 'names only');
  if (!TEXT_EXT.has(path.extname(r.full).toLowerCase())) return refuse(res, 415, 'not a text file');
  // One link only: a hard link can be a second name for a file that lives anywhere.
  const file = safeRead(r.full, FILE_CAP, { requireSingleLink: true });
  if (!file) return refuse(res, 403, 'refused');
  if (file.buf.includes(0)) return refuse(res, 415, 'not a text file');
  let text = file.buf.toString('utf8');
  if (isSettings) { text = settingsView(text, patterns); if (text == null) return refuse(res, 403, 'settings.json could not be read safely'); }
  else if (holdsKey(text, patterns)) return refuse(res, 403, 'may hold a key');
  send(res, 200, JSON.stringify({ path: r.rel, size: isSettings ? text.length : file.size, truncated: !isSettings && file.size > FILE_CAP, derived: isSettings, mtime: file.mtime.toISOString(), text }), JSON_TYPE, head);
}
function serveStatic(req, res, url) {
  const full = resolveStatic(PUBLIC, url.pathname);
  if (!full) return send(res, 404, 'not found');
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, MIME[path.extname(full).toLowerCase()], req.method === 'HEAD');
  });
}

// ---------- world ----------
// The world is built in a worker, so the server keeps answering however slow a read is.
let worldJSON = null, version = 0, buildError = null;
function buildWorld() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./world-worker.mjs', import.meta.url));
    let done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(limit); worker.terminate(); if (err) reject(err); else resolve(); };
    const limit = setTimeout(() => finish(new Error('Reading this project took too long.')), BUILD_LIMIT_MS);
    worker.once('message', (m) => {
      if (m.error) return finish(new Error(m.error));
      worldJSON = m.json; allowed = new Set(m.files); patterns = loadPatterns(getClaude()); version++;
      finish();
    });
    worker.once('error', (err) => finish(err));
    worker.once('exit', () => finish(new Error('The map stopped while reading this project.')));
  });
}

// ---------- live link ----------
const streams = new Set();
function serveEvents(req, res) {
  if (req.method === 'HEAD') return send(res, 200, '', 'text/event-stream', true);
  // EventSource never retries a refusal, so the oldest stream gives way. Its page reconnects by itself.
  if (streams.size >= MAX_STREAMS) { const oldest = streams.values().next().value; streams.delete(oldest); oldest.end(); }
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ version, polling: pollingOn, ready: worldJSON != null })}\n\n`);
  streams.add(res);
  req.on('close', () => { streams.delete(res); lastUse = Date.now(); });
}
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of streams) { try { c.write(msg); } catch { streams.delete(c); } }
}
setInterval(() => broadcast('ping', { t: Date.now() }), 25000).unref();

// ---------- watching files ----------
const IGNORE = /(^|\/)(\.git|node_modules|\.DS_Store|__pycache__)(\/|$)|^\.claude\/(system-map|backups|temp|locks)(\/|$)|^\.claude\/logs\/\.|(~|\.swp|\.tmp)$/;
let pending = new Map(), timer = null, firstPending = 0, lastBuild = 0, pollingOn = false, building = false, buildAgain = false;
function note(rel, kind) {
  const p = rel.split(path.sep).join('/');
  if (IGNORE.test(p)) return;
  if (!pending.size) firstPending = Date.now();
  pending.set(p, kind);
  clearTimeout(timer);
  const wait = Math.max(DEBOUNCE_MS, 1500 - (Date.now() - lastBuild));
  timer = setTimeout(flush, Math.min(wait, Math.max(0, MAX_WAIT_MS - (Date.now() - firstPending))));
}
async function flush() {
  timer = null;
  if (building) { buildAgain = true; return; }
  const changed = [...pending.entries()].map(([p, kind]) => ({ path: p, kind, exists: fs.existsSync(path.join(ROOT, p)) }));
  pending = new Map();
  building = true;
  try { await buildWorld(); lastBuild = Date.now(); buildError = null; broadcast('world', { changed, version }); }
  catch (err) { buildError = err.message; broadcast('extract-error', {}); }
  building = false;
  if (buildAgain) { buildAgain = false; flush(); }
}
const watched = new Map();
function watchDir(dir) {
  if (watched.has(dir)) return;
  const w = fs.watch(path.join(ROOT, dir), { recursive: true }, (kind, name) => { if (name) note(path.join(dir, name.toString()), kind); });
  w.on('error', startPolling);
  watched.set(dir, w);
}
function watchable(name) {
  if (name === 'node_modules' || (name.startsWith('.') && name !== '.claude')) return false;
  try { return fs.lstatSync(path.join(ROOT, name)).isDirectory(); } catch { return false; }
}
// Polling keeps the map live where recursive watching is missing, such as Linux on older Node.
function startPolling() {
  if (pollingOn) return;
  pollingOn = true;
  let known = null;
  const scan = () => {
    const seen = new Map();
    const visit = (dir, depth) => {
      if (depth > 7 || seen.size > POLL_FILE_CAP) return;
      let items; try { items = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return; }
      for (const it of items) {
        const rel = dir ? dir + '/' + it.name : it.name;
        if (IGNORE.test(rel) || (it.name.startsWith('.') && rel !== '.claude')) continue;
        if (it.isDirectory()) visit(rel, depth + 1);
        else if (it.isFile()) { try { const s = fs.lstatSync(path.join(ROOT, rel)); seen.set(rel, s.mtimeMs + ':' + s.size); } catch { /* it went away */ } }
      }
    };
    visit('', 0);
    if (known) {
      for (const [k, v] of seen) if (known.get(k) !== v) note(k, 'change');
      for (const k of known.keys()) if (!seen.has(k)) note(k, 'rename');
    }
    known = seen;
  };
  scan();
  setInterval(scan, POLL_MS).unref();
}
function startWatching() {
  if (process.env.SYSTEM_MAP_POLL === '1') return startPolling();
  try {
    // The top watcher also picks up folders created after the map started.
    const top = fs.watch(ROOT, (kind, name) => {
      if (!name) return;
      const entry = name.toString();
      note(entry, kind);
      if (watched.has(entry) && !fs.existsSync(path.join(ROOT, entry))) { watched.get(entry).close(); watched.delete(entry); }
      if (!pollingOn && watchable(entry)) { try { watchDir(entry); } catch { startPolling(); } }
    });
    top.on('error', startPolling);
    for (const d of fs.readdirSync(ROOT)) if (watchable(d)) watchDir(d);
  } catch { startPolling(); }
}

// ---------- one server per project ----------
const isPid = (v) => Number.isInteger(v) && v > 1;
const isPort = (v) => Number.isInteger(v) && v >= 1024 && v <= 65535;
function alive(pid) { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } }
function readLock(file = LOCK) {
  const r = safeRead(file, 256);
  if (!r) return null;
  const pid = Number(r.buf.toString('utf8').trim());
  const bootedAt = Date.now() - os.uptime() * 1000;
  try { if (fs.lstatSync(file).mtimeMs < bootedAt) return null; } catch { return null; } // left over from before a restart
  return isPid(pid) && alive(pid) ? pid : null;
}
function holdLock() {
  const take = () => { const fd = fs.openSync(LOCK, 'wx', 0o600); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); };
  try { take(); return true; } catch (err) { if (err.code !== 'EEXIST') throw err; }
  if (readLock()) return false;
  // A stale lock is moved aside, not removed: one rename wins, and a start that moved a fresh lock puts it back.
  const aside = LOCK + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  try { fs.renameSync(LOCK, aside); } catch { return false; }
  const fresh = !!readLock(aside);
  try { if (fresh) fs.linkSync(aside, LOCK); } catch { /* a newer start holds it */ }
  try { fs.unlinkSync(aside); } catch { /* already gone */ }
  if (fresh) return false;
  try { take(); return true; } catch { return false; }
}
const ownsLock = () => { const r = safeRead(LOCK, 256); return !!r && r.buf.toString('utf8').trim() === String(process.pid); };

// ---------- the running server ----------
function listen(server, port, tries) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('error', onError);
      if (err.code === 'EADDRINUSE' && tries > 1) resolve(listen(server, port + 1, tries - 1));
      else reject(err.code === 'EADDRINUSE' ? new Error(`Close whatever is using ports ${BASE_PORT} to ${BASE_PORT + PORT_TRIES - 1}, then run it again.`) : err);
    };
    server.once('error', onError);
    server.listen(port, HOST, () => { server.removeListener('error', onError); resolve(port); });
  });
}
function fail(err) {
  try { writePrivate(LAST_ERROR, String((err && err.message) || err)); } catch { /* the starter reports a plain failure */ }
  releaseState();
  process.exit(1);
}
let instance = '';
function releaseState() {
  try { const st = readState(); if (st && st.instance === instance) fs.unlinkSync(STATE); } catch { /* already gone */ }
  try { if (ownsLock()) { fs.unlinkSync(LOCK); fs.unlinkSync(OUT); } } catch { /* already gone */ }
}
async function serve() {
  prepareDataDir();
  if (!holdLock()) return;
  await new Promise((r) => { setTimeout(r, 40); });
  if (!ownsLock()) return; // another start took the same stale lock; that one carries on
  instance = crypto.randomBytes(12).toString('hex');
  token = crypto.randomBytes(32).toString('hex');
  let port = 0;
  const server = http.createServer((req, res) => {
    const bad = checkRequest(req, port);
    if (bad) return refuse(res, bad.status, bad.error);
    let url;
    try { url = new URL(req.url, `http://${HOST}:${port}`); } catch { return refuse(res, 400, 'bad request'); }
    const authed = hasToken(req);
    if (url.pathname === '/health') return send(res, 200, JSON.stringify(authed ? { app: 'system-map', instance, pid: process.pid, ready: worldJSON != null, error: buildError } : { app: 'system-map' }), JSON_TYPE);
    if (url.pathname === '/events') {
      if (!authed && !useTicket(url.searchParams.get('ticket'))) return refuse(res, 401, 'private link needed');
      lastUse = Date.now();
      return serveEvents(req, res);
    }
    if (url.pathname === '/file' || url.pathname === '/data/world.json' || url.pathname === '/stream-ticket') {
      if (!authed) return refuse(res, 401, 'private link needed');
      lastUse = Date.now();
      if (url.pathname === '/stream-ticket') return send(res, 200, JSON.stringify({ ticket: issueTicket() }), JSON_TYPE);
      if (url.pathname === '/file') return serveFile(req, res, url);
      if (worldJSON == null) return refuse(res, 503, 'still reading this project');
      return send(res, 200, worldJSON, JSON_TYPE, req.method === 'HEAD');
    }
    return serveStatic(req, res, url);
  });
  const quit = () => { releaseState(); process.exit(0); };
  process.on('SIGTERM', quit); process.on('SIGINT', quit);
  port = await listen(server, BASE_PORT, PORT_TRIES);
  writePrivate(STATE, JSON.stringify({ port, pid: process.pid, instance, token, root: ROOT, startedAt: new Date().toISOString() }));
  building = true;
  // A slow disk can stall one read, so the first build gets a second try before the map gives up.
  try { await buildWorld(); } catch { await buildWorld(); }
  building = false; lastBuild = Date.now();
  startWatching();
  broadcast('world', { changed: [], version });
  setInterval(() => { if (streams.size && !building && !pending.size) flush(); }, RECHECK_MS).unref();
  setInterval(() => { if (!streams.size && Date.now() - lastUse >= IDLE_MS) quit(); }, Math.min(60000, Math.max(250, IDLE_MS / 4))).unref();
}

// ---------- start, stop, status ----------
function readState() {
  const r = safeRead(STATE, 4096);
  if (!r) return null;
  try { const st = JSON.parse(r.buf.toString('utf8')); return st && isPort(st.port) && isPid(st.pid) ? st : null; } catch { return null; }
}
function ping(st) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: st.port, path: '/health', timeout: 2000, headers: { 'X-Map-Token': String(st.token) } }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (d) => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
const answers = (h, st) => !!h && h.app === 'system-map' && h.instance === st.instance && h.pid === st.pid;
async function running() {
  const st = readState(); if (!st) return null;
  return answers(await ping(st), st) ? st : null;
}
// Before forcing anything, make sure that process number is still this map.
// True or false when the command line settles it, null when this computer cannot say.
function isOurs(pid) {
  if (process.platform === 'win32') return null;
  const r = spawnSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim().endsWith(` ${SELF} serve`);
}
// Other users on a Linux machine can read a program's arguments, so the private link is printed there, never passed on.
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : null;
  if (!cmd) return false;
  try { const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true }); p.on('error', () => {}); p.unref(); return true; } catch { return false; }
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function waitGone(pid, ms) {
  for (let t = 0; t < ms && alive(pid); t += 50) await sleep(50); // eslint-disable-line no-await-in-loop
  return !alive(pid);
}
function clearFiles() {
  for (const f of [STATE, LOCK, OUT]) { try { fs.unlinkSync(f); } catch { /* nothing to clear */ } }
}
function unconfirmed(pid) {
  console.log(`Could not confirm process ${pid} is System Map, so it was left alone. If no map is open, delete .claude/system-map/data and run this again.`);
  process.exitCode = 1;
}
async function stop(quiet) {
  const say = (t) => { if (!quiet) console.log(t); };
  const st = readState();
  const pid = st ? st.pid : readLock();
  if (!pid || !alive(pid)) { clearFiles(); say('System Map is not running.'); return true; }
  if (!(st && answers(await ping(st), st))) {
    const ours = isOurs(pid);
    if (ours === false) { clearFiles(); say('System Map is not running.'); return true; }
    if (ours === null) { unconfirmed(pid); return false; }
  }
  try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ }
  if (!await waitGone(pid, 2000) && isOurs(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* already stopped */ } await waitGone(pid, 2000); }
  if (alive(pid)) { console.log(`System Map did not stop. Close process ${pid} by hand, then run this again.`); process.exitCode = 1; return false; }
  clearFiles();
  say('System Map stopped.');
  return true;
}
const lastError = () => { const r = safeRead(LAST_ERROR, 1024); return r ? r.buf.toString('utf8').trim() : ''; };
async function start(noOpen) {
  try { prepareDataDir(); } catch (err) { console.log('System Map could not start. ' + err.message); process.exitCode = 1; return; }
  let st = await running();
  if (st && st.root !== ROOT) { if (!await stop(true)) return; st = null; } // one shared install, moved to another project
  if (!st) {
    const old = readState();
    if (old && alive(old.pid) && !await stop(true)) return; // alive but not answering, so clear it first
    const held = old ? null : readLock();
    if (held) { // a lock with no state file: left behind on something else, or a map that lost its state
      const ours = isOurs(held);
      if (ours === null) { unconfirmed(held); return; }
      if (ours === false) clearFiles();
      else if (!await stop(true)) return;
    }
    try { fs.unlinkSync(LAST_ERROR); } catch { /* no old error */ }
    const child = spawn(process.execPath, [SELF, 'serve'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
    child.unref();
    for (let i = 0; i < 150 && !st && !lastError(); i++) { await sleep(100); st = await running(); } // eslint-disable-line no-await-in-loop
  }
  let reason = lastError();
  let misses = 0;
  for (let i = 0; st && !reason && i < 50; i++) { // a first read that fails stops the server, so it is worth a moment
    const h = await ping(st); // eslint-disable-line no-await-in-loop
    if (h && h.ready) break;
    misses = h ? 0 : misses + 1;
    if (misses >= 5) st = null; // one missed answer on a busy computer is not a stopped server
    await sleep(100); // eslint-disable-line no-await-in-loop
    reason = lastError();
  }
  if (reason || !st) { console.log('System Map could not start. ' + (reason || 'Run it again in a moment.')); process.exitCode = 1; return; }
  const url = `http://${HOST}:${st.port}/#t=${st.token}`;
  console.log('System Map is running at ' + url);
  if (noOpen) return;
  if (!openBrowser(url)) console.log('Open that address in your browser.');
}
async function status() {
  const st = readState();
  if (st && await running()) console.log(`System Map is running at http://${HOST}:${st.port}. Run /system-map for your private link.`);
  else if (st && alive(st.pid) && isOurs(st.pid)) console.log('System Map is running but not answering. Run /system-map stop, then start it again.');
  else if (st && alive(st.pid) && isOurs(st.pid) === null) console.log('System Map may be running but is not answering. Run /system-map stop for what to do next.');
  else if (!st && readLock() && isOurs(readLock())) console.log('System Map is running but not answering. Run /system-map stop, then start it again.');
  else console.log('System Map is not running.');
}

const cmd = process.argv[2] || 'start';
const noOpen = process.argv.includes('--no-open');
const refusal = rootRefusal();
if (refusal && ['start', 'serve'].includes(cmd)) {
  console.log(refusal);
  process.exitCode = 1;
} else if (cmd === 'serve') {
  serve().catch(fail);
} else if (cmd === 'start') {
  await start(noOpen);
} else if (cmd === 'stop') {
  await stop(false);
} else if (cmd === 'status') {
  await status();
} else {
  console.log('Use: start, stop or status.');
}
