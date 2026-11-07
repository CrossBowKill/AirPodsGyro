#!/usr/bin/env node
// System Map extractor. Zero dependencies. Reads the project you run it in and writes
// .claude/system-map/data/world.json. Nothing here is a fixed list of files: buildings come from
// what is actually on disk, and .claude/UPDATE-MANIFEST.json says what shipped and what is yours.
//
// Privacy: never reads .env or credential files. From .mcp.json it keeps server names only.
// Runs offline. Makes no network calls.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatterns, safeRead, scanTexts } from './guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(HERE, 'data');
export const OUT = path.join(DATA_DIR, 'world.json');
const DAY = 86400000;
const EVENT_WINDOW_DAYS = 7;
const EVENT_CAP = 4000;
const TAIL_BYTES = 2 * 1024 * 1024;
const MEMORY_CAP = 100; // same limits the shipped completeness gate enforces
const KB_CAP = 200;
const WORK_ROOM_LIMIT = 16; // top-level folders shown as rooms; the rest share one room
const ROOM_ITEM_LIMIT = 24; // children listed per folder room
const READ_CAP = 2 * 1024 * 1024; // the most any one file is read
const WALK_CAP = 50000; // the most folder entries one walk looks at
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const HIDDEN = 'Hidden: this text looks like it holds a key.';

// Folders that are never the user's work.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage', 'venv', 'env', '__pycache__', 'tmp', 'temp', 'cache', 'bower_components']);

// ---------- where am I ----------
// The project is the folder you run this in, and only that folder. It never walks up to a parent,
// and it never settles on the home folder, a folder above it, or a folder with no Claudify in it.
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
const realOf = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const isInstall = (claude) => isFile(path.join(claude, 'UPDATE-MANIFEST.json')) || isFile(path.join(claude, 'system-map', 'server.mjs'));
export function rootRefusal(start = process.cwd()) {
  const dir = realOf(start), home = realOf(os.homedir());
  if (dir === path.parse(dir).root) return 'System Map will not run from the top of your disk. Open your project folder and run it there.';
  if (dir === home || home.startsWith(dir + path.sep)) return 'System Map will not run from your home folder, because it would read everything in it. Open your project folder and run it there.';
  if (!isInstall(path.join(dir, '.claude')) && !isInstall(path.join(home, '.claude'))) return 'This folder has no Claudify install. Open your project folder and run it there.';
  return null;
}
export function findRoot(start = process.cwd()) { return rootRefusal(start) ? null : realOf(start); }

let ROOT = findRoot();
let CLAUDE = null;
export function setRoot(dir) {
  ROOT = dir;
  if (!dir) { CLAUDE = null; return; }
  CLAUDE = isInstall(path.join(dir, '.claude')) ? path.join(dir, '.claude') : path.join(realOf(os.homedir()), '.claude');
}
setRoot(ROOT);
export const getRoot = () => ROOT;
export const getClaude = () => CLAUDE;

// ---------- small helpers ----------
const abs = (p) => (p === '.claude' || p.startsWith('.claude/') ? path.join(CLAUDE, p.slice(8)) : path.join(ROOT, p));
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const readText = (p, cap = READ_CAP) => { const r = safeRead(p, cap, { requireSingleLink: true }); return r ? r.buf.toString('utf8') : null; };
const unreadable = (p) => { if (readText(p, 1) != null) return false; try { fs.lstatSync(p); return true; } catch { return false; } };
const readJSON = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
const mtime = (p) => { try { return fs.statSync(p).mtime.toISOString(); } catch { return null; } };
const lineCount = (t) => (t ? t.split('\n').length : 0);
const daysSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity);
const validDate = (v) => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? v : null);
const isRow = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const posix = (p) => p.split(path.sep).join('/');
const relClaude = (p) => '.claude/' + posix(path.relative(CLAUDE, p));
const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
// A linked folder is not followed: a link can lead anywhere on the machine.
function listDir(p) { try { return fs.lstatSync(p).isDirectory() ? fs.readdirSync(p, { withFileTypes: true }) : []; } catch { return []; } }

// Real folders and regular files only, so links, pipes and devices are never opened. Linked items
// inside .claude are counted, so the map can say it left them off rather than go quiet about them.
let linksSkipped = 0;
const isLinkedDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const singleLink = (p) => { try { return fs.lstatSync(p).nlink === 1; } catch { return false; } };
function walk(dir, filter, acc = [], depth = 0, maxDepth = 5, budget = { left: WALK_CAP }) {
  if (depth > maxDepth) return acc;
  for (const d of listDir(dir)) {
    if (budget.left-- <= 0) return acc;
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full, filter, acc, depth + 1, maxDepth, budget);
    else if (d.isSymbolicLink()) { if (filter(full) || isLinkedDir(full)) linksSkipped++; }
    else if (d.isFile() && filter(full)) { if (singleLink(full)) acc.push(full); else linksSkipped++; }
  }
  return acc;
}

// First few KB of a file, so 1,800 skills stay cheap.
function headText(file, bytes = 4096) { return readText(file, bytes); }
function tailText(file, bytes = TAIL_BYTES) {
  const r = safeRead(file, bytes, { fromEnd: true });
  if (!r) return '';
  let t = r.buf.toString('utf8');
  if (r.offset > 0) { const nl = t.indexOf('\n'); t = nl >= 0 ? t.slice(nl + 1) : ''; }
  return t;
}

// One unreadable file must never take the map down. It costs that item, and a flag names it.
let PROBLEMS = [];
function attempt(label, fn, fallback) {
  try { return fn(); } catch { PROBLEMS.push(label); return fallback; }
}

export function parseFrontmatter(text) {
  const out = { data: Object.create(null), body: text || '' };
  if (!text || !text.startsWith('---')) return out;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return out;
  const fm = text.slice(3, end).split('\n');
  out.body = text.slice(end + 4);
  let key = null, mode = null;
  for (const raw of fm) {
    const m = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m && !raw.startsWith(' ')) {
      key = m[1]; const v = m[2].trim();
      if (/^[>|][+-]?$/.test(v)) { mode = 'block'; out.data[key] = ''; }
      else if (v === '') { mode = 'list'; out.data[key] = []; }
      else if (v.startsWith('[') && v.endsWith(']')) { mode = null; out.data[key] = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); }
      else { mode = null; out.data[key] = v.replace(/^["']|["']$/g, ''); }
      continue;
    }
    if (!key) continue;
    if (mode === 'block') out.data[key] += (out.data[key] ? ' ' : '') + raw.trim();
    else if (mode === 'list') { const li = raw.match(/^\s*-\s*(.+)$/); if (li) out.data[key].push(li[1].trim().replace(/^["']|["']$/g, '')); }
  }
  return out;
}
function firstParagraph(body) {
  const lines = (body || '').split('\n').map((l) => l.trim());
  const idx = lines.findIndex((l) => l && !l.startsWith('#') && !l.startsWith('<') && !l.startsWith('---') && !l.startsWith('```') && !l.startsWith('|') && !l.startsWith('**Spawn'));
  return idx >= 0 ? lines[idx].slice(0, 300) : '';
}
function section(body, headingRegex) {
  const lines = body.split('\n'); let start = -1;
  for (let i = 0; i < lines.length; i++) if (headingRegex.test(lines[i])) { start = i + 1; break; }
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) { if (/^## /.test(lines[i])) break; out.push(lines[i]); }
  return out.join('\n');
}
function extractPaths(text) {
  const found = new Set(); const re = /`([^`\n]+)`/g; let m;
  while ((m = re.exec(text))) {
    const p = m[1].trim().replace(/^\.\//, '').replace(/\/$/, '');
    if (!/\//.test(p) && !/\.(md|yml|yaml|json|jsonl|sh|mjs|ts|tsx|py)$/.test(p)) continue;
    if (/\s/.test(p) || p.startsWith('~') || p.startsWith('http') || path.isAbsolute(p)) continue;
    found.add(p);
  }
  return [...found];
}

// ---------- shipped or yours ----------
// UPDATE-MANIFEST.json is written into every package and lists every file we shipped.
function loadManifest() {
  const m = readJSON(abs('.claude/UPDATE-MANIFEST.json'));
  return m && m.files && typeof m.files === 'object' ? { files: m.files, version: m.version || null } : null;
}
let MANIFEST = null;
let PATTERNS = [];
// With no manifest we cannot tell, so nothing is treated as yours and no flag can blame a shipped file.
const isCustom = (rel) => !!MANIFEST && !Object.prototype.hasOwnProperty.call(MANIFEST.files, rel);
function hashNormalised(file) { const t = readText(file); return t == null ? null : crypto.createHash('sha256').update(t.replace(/\r\n?/g, '\n')).digest('hex'); }
const untouched = (rel) => { const want = MANIFEST && MANIFEST.files[rel]; return !!want && hashNormalised(abs(rel)) === want; };

// ---------- engines, detected from what the files say they do ----------
// Each engine is a vocabulary, not a file list. A name hit counts more than a description hit.
const ENGINES = [
  { id: 'seo', strong: /\bseo\b|geo engine/i, name: 'SEO Engine', colour: '#2dd4bf', blurb: 'Your organic growth loop: it senses the data, decides, ships, verifies and learns.',
    words: /\b(seo|geo|serps?|keywords?|backlinks?|search console|rank(ing|ings)?|rank-check|indexing|indexation|citations?|topical map|link[- ]build\w*|ai[- ]visibility|on-page|referring domains?|core web vitals|crawl)\b/gi },
  { id: 'content', strong: /claudify weekly|video[- ]ads?\b|newsletter/i, name: 'Content Engine', colour: '#a78bfa', blurb: 'Your content production line: briefs, drafts, audits, newsletters and video ads.',
    words: /\b(newsletters?|video[- ]ads?|ad[- ](build|auditor|producer|director|analyst)|ugc|brand[- ]voice|brand[- ]memory|captions?|repurpose|scriptwrit\w*|social posts?|threads?|content|blog|issue body|god-tier prompt|weekly issue|email client|voiceover|creatives?)\b/gi },
  { id: 'analyst', strong: /phase [123] agent|research agent outputs|analyst engine|the venture/i, name: 'Analyst Engine', colour: '#f472b6', blurb: 'Your research engine: it frames a question, gathers evidence and argues both sides.',
    words: /\b(hypothes[ie]s|evidence|dossier|conviction|research|diligence|market[- ]size|thesis|bull|bear|tradecraft|unit economics|moat|dialectic|analyst engine|claim-evidence|trend[- ]radar|phase [123] agent|venture)\b/gi },
];
const hits = (re, s) => ((s || '').match(re) || []).length;
function classify(name, text) {
  let best = null, score = 0;
  const words = name.replace(/-/g, ' ');
  for (const e of ENGINES) {
    const s = hits(e.words, words) * 3 + Math.min(4, hits(e.words, text)) + (e.strong.test(text) ? 3 : 0);
    if (s > score) { best = e.id; score = s; }
  }
  return score >= 3 ? best : null;
}

// ---------- agents, commands, skills, hooks ----------
function extractAgents() {
  const dir = abs('.claude/agents');
  const out = [];
  for (const f of walk(dir, (x) => x.endsWith('.md') && !/^readme\.md$/i.test(path.basename(x)))) {
    const rec = attempt(relClaude(f), () => {
      const text = headText(f, 16384) || '';
      const { data, body } = parseFrontmatter(text);
      const base = path.basename(f, '.md');
      const name = typeof data.name === 'string' && SAFE_NAME.test(data.name) ? data.name : base;
      const file = relClaude(f);
      const description = String(data.description || firstParagraph(body)).slice(0, 400);
      const memPath = abs('.claude/agent-memory/' + (SAFE_NAME.test(name) ? name : '_') + '/MEMORY.md');
      const tools = Array.isArray(data.tools) ? data.tools : (typeof data.tools === 'string' ? data.tools.split(',').map((t) => t.trim()) : []);
      return { id: 'agent:' + name, name, file, description, sourceText: text, tools, model: typeof data.model === 'string' ? data.model : null, skills: Array.isArray(data.skills) ? data.skills : (typeof data.skills === 'string' ? [data.skills] : []),
        reads: extractPaths(section(body, /^## .*(mandatory reads|what you read|must read|inputs you must|reads? before)/i)), memory: exists(memPath) ? { path: relClaude(memPath), mtime: mtime(memPath) } : null,
        custom: isCustom(file), hasDescription: !!data.description, mtime: mtime(f) };
    }, null);
    if (rec) out.push(rec);
  }
  return out;
}

// Names come from files anyone can add, so they are matched as plain text, never compiled.
const NAME_CHAR = /[a-z0-9-]/i;
const WORD_CHAR = /[A-Za-z0-9_]/;
function mentionsAgent(lowerBody, lowerName) {
  for (let at = lowerBody.indexOf(lowerName); at >= 0; at = lowerBody.indexOf(lowerName, at + 1)) {
    const before = lowerBody[at - 1], after = lowerBody[at + lowerName.length];
    if ((before === undefined || !NAME_CHAR.test(before)) && (after === undefined || !NAME_CHAR.test(after))) return true;
  }
  return false;
}
function mentionsCommand(body, name) {
  const needle = '/' + name;
  for (let at = body.indexOf(needle); at >= 0; at = body.indexOf(needle, at + 1)) {
    const after = body[at + needle.length];
    if (after === undefined || !WORD_CHAR.test(after)) return true;
  }
  return false;
}

function extractCommands(agentNames) {
  const dir = abs('.claude/commands');
  const files = walk(dir, (f) => f.endsWith('.md') && !/^readme\.md$/i.test(path.basename(f)), [], 0, 3);
  const names = files.map((f) => posix(path.relative(dir, f)).replace(/\.md$/, '').replace(/\//g, ':'));
  const lowerAgents = agentNames.filter((a) => a.length > 3).map((a) => [a, a.toLowerCase()]);
  const out = [];
  files.forEach((f, i) => {
    const rec = attempt(relClaude(f), () => {
      const n = names[i];
      const text = readText(f, 256 * 1024) || '';
      const { data, body } = parseFrontmatter(text);
      const lower = body.toLowerCase();
      const file = relClaude(f);
      const description = String(data.description || firstParagraph(body)).slice(0, 400);
      return { id: 'command:' + n, name: n, file, description, sourceText: text.slice(0, 16384), hasDescription: !!description, custom: n !== 'system-map' && isCustom(file), mtime: mtime(f),
        mentionsAgents: lowerAgents.filter(([, low]) => mentionsAgent(lower, low)).map(([a]) => a),
        mentionsCommands: names.filter((c) => c !== n && mentionsCommand(body, c)) };
    }, null);
    if (rec) out.push(rec);
  });
  return out;
}

function extractSkills() {
  const dir = abs('.claude/skills');
  const labels = new Map();
  const indexText = readText(path.join(dir, 'INDEX.md')) || '';
  for (const m of indexText.matchAll(/^\|\s*\[([^\]]+)\]\(\.\/([a-z0-9-]+)\/?\)/gmi)) labels.set(m[2], m[1]);
  const shelves = new Map();
  const shelf = (key, label) => { if (!shelves.has(key)) shelves.set(key, { id: 'shelf:' + key, name: label || labels.get(key) || titleCase(key), key, count: 0, custom: 0, file: '.claude/skills/' + key, skills: [], mtime: null }); return shelves.get(key); };
  const yours = [];
  const add = (f, s, key) => {
    const text = headText(f, 2048); const { data, body } = parseFrontmatter(text || '');
    const file = relClaude(f); const custom = isCustom(file);
    const rec = { name: s, file, custom, description: String(data.description || firstParagraph(body)).slice(0, 200), sourceText: text, present: text != null };
    const sh = shelf(key); sh.count++; if (custom) sh.custom++; sh.skills.push(rec);
    const m = mtime(f); if (m && (!sh.mtime || m > sh.mtime)) sh.mtime = m;
    return rec;
  };
  for (const d of listDir(dir)) {
    if (d.isSymbolicLink() && !d.name.startsWith('.')) linksSkipped++;
    if (d.name.startsWith('.') || !d.isDirectory()) continue;
    const top = path.join(dir, d.name);
    const topSkill = path.join(top, 'SKILL.md');
    if (exists(topSkill) && !singleLink(topSkill)) { linksSkipped++; continue; }
    const isRouter = (f) => (headText(f, 512) || '').includes('claudify-category-router');
    if (exists(topSkill) && !isRouter(topSkill)) { // a skill sitting directly under skills/
      const rec = add(topSkill, d.name, 'general');
      if (rec.custom) yours.push(rec);
      continue;
    }
    // Skills can sit a level deeper inside a pack, so look for every SKILL.md under the category.
    // A category's own router is an entry point, not a skill on the shelf.
    const found = walk(top, (f) => path.basename(f) === 'SKILL.md' && f !== topSkill, [], 0, 4);
    for (const f of found) add(f, path.basename(path.dirname(f)), d.name);
    const any = found.length > 0;
    if (!any && !exists(topSkill) && isCustom('.claude/skills/' + d.name + '/x')) yours.push({ name: d.name, file: '.claude/skills/' + d.name + '/SKILL.md', custom: true, description: '', present: false });
  }
  if (shelves.has('general')) shelves.get('general').name = 'General';
  const list = [...shelves.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  for (const s of list) s.skills.sort((a, b) => Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name));
  return { total: list.reduce((n, s) => n + s.count, 0), shelves: list, yours };
}

// The script a hook runs, only when the command says so plainly: a script path as the first word, or
// straight after an interpreter with no options. Anything less clear has no file to check, because
// a false "file is missing" on a working hook is worse than one this map cannot see.
const INTERPRETER = /^(ba|z|da)?sh$|^python[0-9.]*$|^node$|^deno$|^bun$|^tsx$|^ruby$|^perl$/;
const SCRIPT_FILE = /\.(sh|bash|zsh|py|mjs|cjs|js|ts|rb|pl)$/;
function firstWords(text) {
  const words = []; let cur = null, q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur = cur || ''; continue; }
    if (c === '\\') { i++; cur = (cur || '') + (text[i] || ''); continue; }
    if (c === ' ' || c === '\t' || c === '\n') { if (cur !== null) { words.push(cur); cur = null; } continue; }
    if (';|&<>()'.includes(c)) break;
    cur = (cur || '') + c;
  }
  if (q) return [];
  if (cur !== null) words.push(cur);
  return words;
}
function hookTarget(command) {
  if (/\\(?! )|%|`|\$\(/.test(command)) return null; // Windows paths and anything the shell has to work out
  const words = firstWords(command);
  let i = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] || '')) i++;
  let raw = words[i];
  if (!raw) return null;
  if (INTERPRETER.test(path.posix.basename(raw))) {
    const sh = /sh$/.test(path.posix.basename(raw));
    raw = words[i + 1];
    if (!raw || raw.startsWith('-') || !SCRIPT_FILE.test(raw)) return null;
    if (sh && !raw.includes('/')) return null; // a shell also looks on your PATH for a bare name
  } else if (!raw.includes('/') || !(SCRIPT_FILE.test(raw) || /(^|\/)hooks\//.test(raw))) return null;
  if (raw.startsWith('#') || /[*?[{]/.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // a comment, a pattern or a web address
  const p = raw.replace(/^\$\{?CLAUDE_PROJECT_DIR\}?(?=\/|$)/, ROOT).replace(/^\$\{?HOME\}?(?=\/)|^~(?=\/)/, os.homedir());
  if (p.includes('$')) return null;
  const files = path.isAbsolute(p) ? [p] : [path.resolve(ROOT, p)];
  if (raw.includes('.claude/')) files.push(abs(raw.slice(raw.indexOf('.claude/')))); // a global install keeps these in your home folder
  const inside = path.relative(abs('.claude/hooks'), files[files.length - 1]);
  return { files, name: inside && !inside.startsWith('..') && !path.isAbsolute(inside) ? posix(inside) : path.basename(files[0]) };
}

function extractHooks() {
  const settingsText = readText(abs('.claude/settings.json'));
  let settings = null, settingsBroken = false, settingsUnread = false;
  if (settingsText != null) { try { settings = JSON.parse(settingsText); } catch { /* flagged next */ } if (!isRow(settings)) { settings = null; settingsBroken = true; } }
  else { try { fs.lstatSync(abs('.claude/settings.json')); settingsUnread = true; } catch { /* no settings file yet */ } }
  const scriptsDir = abs('.claude/hooks'); const scripts = {};
  for (const d of listDir(scriptsDir)) {
    if (!d.isFile() || !d.name.endsWith('.sh')) continue;
    const t = headText(path.join(scriptsDir, d.name), 1024) || '';
    const header = t.split('\n').slice(1, 8).filter((l) => l.startsWith('#')).map((l) => l.replace(/^#\s?/, '')).join(' ').trim();
    scripts[d.name] = { header: header.slice(0, 240), sourceText: t, mtime: mtime(path.join(scriptsDir, d.name)) };
  }
  const wired = []; const seen = new Set();
  let hooksUnchecked = settings && settings.hooks !== undefined && !isRow(settings.hooks) ? 1 : 0;
  if (settings && isRow(settings.hooks)) {
    const matchers = [...new Set(Object.values(settings.hooks).flatMap((arr) => (Array.isArray(arr) ? arr : [])).filter(isRow).map((e) => (typeof e.matcher === 'string' ? e.matcher.slice(0, 80) : '')).filter(Boolean))];
    const flagged = scanTexts(matchers, PATTERNS);
    const unsafeMatchers = new Set(matchers.filter((_, i) => flagged.has(i)));
    for (const [event, arr] of Object.entries(settings.hooks)) {
      if (!Array.isArray(arr)) { hooksUnchecked++; continue; }
      for (const entry of arr) {
        if (!isRow(entry) || !Array.isArray(entry.hooks)) { hooksUnchecked++; continue; }
        const matcher = typeof entry.matcher === 'string' ? entry.matcher.slice(0, 80) : '';
        const safeMatcher = unsafeMatchers.has(matcher) ? '(hidden)' : matcher;
        for (const h of entry.hooks) {
          if (!isRow(h)) { hooksUnchecked++; continue; }
          const kind = String(h.type || 'command').slice(0, 20);
          const target = kind === 'command' ? hookTarget(String(h.command || '')) : null;
          const script = target ? target.name : null;
          if (script) seen.add(script);
          for (const name of Object.keys(scripts)) if (String(h.command || '').includes(name)) seen.add(name); // reached some other way, still switched on
          wired.push({ id: 'hook:' + (script || kind) + '@' + event + (safeMatcher ? ':' + safeMatcher : ''), event, matcher: safeMatcher || '*', kind, script,
            name: script ? script.replace(/\.sh$/, '') : (kind + ' hook'), header: script && scripts[script] ? scripts[script].header : (kind === 'prompt' ? 'Prompt-based quality check' : ''),
            sourceText: script && scripts[script] ? scripts[script].sourceText : '', scriptExists: script ? target.files.some(exists) : null, mtime: script && scripts[script] ? scripts[script].mtime : null });
        }
      }
    }
  }
  return { wired, unwired: Object.keys(scripts).filter((s) => !seen.has(s)), scriptCount: Object.keys(scripts).length, settingsBroken, settingsUnread, hooksUnchecked, settingsPresent: settingsText != null };
}

// Names only. The rest of .mcp.json is parsed and dropped here, so it can never reach the page.
function extractMcp() {
  const cfg = readJSON(path.join(ROOT, '.mcp.json'));
  const servers = cfg && cfg.mcpServers && typeof cfg.mcpServers === 'object' ? Object.keys(cfg.mcpServers) : [];
  return servers.map((name) => ({ id: 'mcp:' + name, name }));
}

function pendingNominations(text) {
  if (!text) return 0;
  return section(text, /^## Pending Nominations/i).split('\n').filter((l) => /^[-*] /.test(l) || /^### /.test(l)).length;
}
function isStarterMemory(text) {
  if (text == null) return true;
  const fillers = (text.match(/\(none( yet)?\)/gi) || []).length;
  return fillers >= 3 || /Starting new project with Claudify/i.test(text);
}
function extractMemory() {
  const mem = readText(abs('.claude/memory.md'));
  const kb = readText(abs('.claude/knowledge-base.md'));
  const nom = readText(abs('.claude/knowledge-nominations.md'));
  const notes = listDir(path.join(ROOT, 'Daily Notes')).filter((d) => d.isFile() && /^\d{6}\.md$/.test(d.name)).map((d) => d.name).sort((a, b) => (a.slice(4, 6) + a.slice(0, 4)).localeCompare(b.slice(4, 6) + b.slice(0, 4)));
  const latest = notes[notes.length - 1] || null;
  const agentDirs = listDir(abs('.claude/agent-memory')).filter((d) => d.isDirectory());
  const count = (p) => listDir(path.join(ROOT, p)).filter((d) => !d.name.startsWith('.') && !d.name.startsWith('_')).length;
  const layers = [
    { id: 'mem:memory', name: 'Working memory', file: '.claude/memory.md', lines: lineCount(mem), cap: MEMORY_CAP, unread: unreadable(abs('.claude/memory.md')), starter: isStarterMemory(mem), mtime: mtime(abs('.claude/memory.md')), description: 'What Claude reads at the start of every session.' },
    { id: 'mem:knowledge-base', name: 'Knowledge base', file: '.claude/knowledge-base.md', lines: lineCount(kb), cap: KB_CAP, unread: unreadable(abs('.claude/knowledge-base.md')), mtime: mtime(abs('.claude/knowledge-base.md')), description: 'Rules confirmed by the auditor. Agents treat them as constraints.' },
    { id: 'mem:nominations', name: 'Nominations', file: '.claude/knowledge-nominations.md', pending: pendingNominations(nom), mtime: mtime(abs('.claude/knowledge-nominations.md')), description: 'Candidate learnings waiting for the auditor.' },
    { id: 'mem:archive', name: 'Memory archive', file: '.claude/memory-archive', count: listDir(abs('.claude/memory-archive')).filter((d) => d.isFile() && !d.name.startsWith('.')).length, mtime: mtime(abs('.claude/memory-archive')), description: 'Older memory, kept for reference.' },
    { id: 'mem:agent-memory', name: 'Agent memory', file: '.claude/agent-memory', count: agentDirs.length, mtime: mtime(abs('.claude/agent-memory')), description: 'What each agent has learned on the job.' },
  ];
  if (exists(path.join(ROOT, 'CLAUDE.md'))) layers.push({ id: 'mem:claude-md', name: 'CLAUDE.md', file: 'CLAUDE.md', lines: lineCount(readText(path.join(ROOT, 'CLAUDE.md'))), mtime: mtime(path.join(ROOT, 'CLAUDE.md')), description: 'The project orientation Claude loads every session.' });
  if (isDir(path.join(ROOT, 'Daily Notes'))) layers.push({ id: 'mem:daily', name: 'Daily notes', file: latest ? 'Daily Notes/' + latest : 'Daily Notes', latest, count: notes.length, mtime: latest ? mtime(path.join(ROOT, 'Daily Notes', latest)) : null, description: 'One note per working day, created by /start.' });
  if (isDir(path.join(ROOT, 'memory'))) layers.push({ id: 'mem:domain', name: 'Long-term memory', file: 'memory', count: count('memory'), mtime: mtime(path.join(ROOT, 'memory')), description: 'Episodes and domain memory that survive between projects.' });
  if (isDir(path.join(ROOT, 'playbooks'))) layers.push({ id: 'mem:playbooks', name: 'Playbooks', file: 'playbooks', count: count('playbooks'), mtime: mtime(path.join(ROOT, 'playbooks')), description: 'Reusable methods saved by /capture.' });
  return { layers, starter: isStarterMemory(mem), noteCount: notes.length };
}

// ---------- automations (what you listed, and what /pulse last saw) ----------
function parseAutomations(text) {
  const out = []; let inList = false, cur = null;
  for (const raw of (text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^automations:\s*(\[\s*\])?\s*$/.test(raw)) { inList = true; continue; }
    if (inList && /^[A-Za-z]/.test(raw)) inList = false;
    if (!inList || /^\s*#/.test(raw)) continue;
    const item = raw.match(/^\s*-(?:\s+([a-z_]+):\s*(.*))?\s*$/); // an entry can open with any field, as /pulse reads it
    if (item) { cur = {}; out.push(cur); if (item[1]) cur[item[1]] = item[2].trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, ''); continue; }
    const kv = cur && raw.match(/^\s+([a-z_]+):\s*(.+)$/);
    if (kv) cur[kv[1]] = kv[2].trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
  return out.filter((a, i) => a.name && out.findIndex((b) => b.name === a.name) === i);
}
function extractAutomation() {
  const listed = parseAutomations(readText(abs('.claude/automations.yml')));
  const unread = unreadable(abs('.claude/automations.yml'));
  const snapshotFile = '.claude/logs/pulse/latest.json';
  const snap = readJSON(abs(snapshotFile));
  const rows = snap && (Array.isArray(snap.automations) ? snap.automations : Array.isArray(snap.results) ? snap.results : Array.isArray(snap.entries) ? snap.entries : null);
  // Two rows can share a name, so the worst result is the one that counts.
  const RANK = { FAILING: 3, SILENT: 2, STALE: 1 };
  const byName = new Map();
  for (const r of (rows || []).filter(isRow)) { const had = byName.get(r.name); if (!had || (RANK[r.verdict] || 0) > (RANK[had.verdict] || 0)) byName.set(r.name, r); }
  const names = new Set(listed.map((a) => a.name));
  // A job /pulse found in trouble still counts when this map could not match it to a listed entry.
  const unlisted = [...byName.values()].filter((r) => !names.has(r.name) && ['FAILING', 'SILENT'].includes(r.verdict)).map((r) => ({ label: String(r.name || 'A job with no name').slice(0, 80), verdict: r.verdict, critical: r.critical === true }));
  const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
  const entries = listed.map((a) => {
    const r = byName.get(a.name) || {};
    return { id: 'auto:' + a.name, name: a.name, kind: a.kind || null, check: a.check || null, critical: /^(true|yes)$/i.test(String(a.critical)) || r.critical === true, seen: byName.has(a.name), verdict: text(r.verdict, 20), change: text(r.change, 60) || text(r.marker, 60), reason: String(text(r.reason, 400) || '').replace(/(key|token|secret|password)[=:]\S+/gi, '$1=[hidden]').replace(/\bbearer\s+\S+/gi, 'Bearer [hidden]').slice(0, 200) };
  });
  return { file: '.claude/automations.yml', configured: listed.length, unread, unlisted, snapshotUnread: !rows && (exists(abs(snapshotFile)) || unreadable(abs(snapshotFile))), snapshotFile: snap ? snapshotFile : null, snapshotAt: rows ? (validDate(snap.generated_at) || mtime(abs(snapshotFile))) : null, entries };
}

// ---------- the workspace (your folders) ----------
function shippedFolder(name) { if (!MANIFEST) return false; const pre = name + '/'; for (const k of Object.keys(MANIFEST.files)) if (k.startsWith(pre)) return true; return false; }
function extractWorkspace() {
  const managed = new Set(['Daily Notes', 'memory', 'playbooks', 'clients']);
  const folders = [];
  for (const d of listDir(ROOT)) {
    if (d.name.startsWith('.') || !d.isDirectory() || SKIP_DIRS.has(d.name.toLowerCase()) || managed.has(d.name)) continue;
    folders.push({ name: d.name, file: d.name, mtime: mtime(path.join(ROOT, d.name)), shipped: shippedFolder(d.name) });
  }
  const files = listDir(ROOT).filter((d) => d.isFile() && !d.name.startsWith('.') && /\.(md|txt)$/i.test(d.name)).map((d) => ({ name: d.name, file: d.name, mtime: mtime(path.join(ROOT, d.name)) }));
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return { folders, files };
}
function folderChildren(rel, limit = ROOM_ITEM_LIMIT) {
  const kids = listDir(path.join(ROOT, rel)).filter((d) => !d.name.startsWith('.') && !SKIP_DIRS.has(d.name.toLowerCase()) && !/\.(env|pem|key)$/i.test(d.name) && !/credentials|secret/i.test(d.name));
  const items = kids.map((d) => ({ name: d.name, file: rel + '/' + d.name, kind: d.isDirectory() ? 'folder' : 'doc', mtime: mtime(path.join(ROOT, rel, d.name)) }));
  items.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return { items: items.slice(0, limit), total: items.length };
}
function extractClients() {
  const dir = path.join(ROOT, 'clients');
  if (!isDir(dir)) return null;
  const list = listDir(dir).filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_')).map((d) => ({ id: 'client:' + d.name, slug: d.name, name: titleCase(d.name), file: 'clients/' + d.name, mtime: mtime(path.join(dir, d.name)) }));
  return { list, hasTemplate: isDir(path.join(dir, '_TEMPLATE')) };
}

// ---------- activity (the last 7 days, from the logs the hooks write) ----------
const parseLocal = (s) => { const d = new Date(String(s).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? null : d; };
const safeLogPath = (p) => !!p && !path.isAbsolute(p) && !/^[a-z]:[\\/]/i.test(p) && !p.startsWith('~') && !p.includes('..');
function parseAudit(since) {
  const out = [];
  for (const line of tailText(abs('.claude/logs/audit-trail.md')).split('\n')) {
    const m = line.match(/^- `(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)` \| (\w+) \| `?([^`]+?)`?\s*$/);
    if (!m) continue;
    const d = parseLocal(m[1]); if (!d || d.getTime() < since) continue;
    let p = m[3].trim();
    if (p.startsWith(ROOT + path.sep)) p = posix(path.relative(ROOT, p));
    if (safeLogPath(p)) out.push({ t: d.toISOString(), kind: 'write', op: m[2].toLowerCase(), path: posix(p) });
  }
  return out;
}
// Only the date, severity and category are read. Error text can hold secrets, so it stays in the log.
function parseIncidents(since) {
  const out = [];
  for (const line of tailText(abs('.claude/logs/incident-log.md')).split('\n')) {
    const m = line.match(/^- `(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)` \| ([A-Z_ ]+?) \| ([A-Z]+)/);
    if (!m) continue;
    const d = parseLocal(m[1]); if (!d || d.getTime() < since) continue;
    out.push({ t: d.toISOString(), kind: 'incident', op: m[2].trim().toLowerCase(), level: m[3].toLowerCase(), path: '.claude/logs/incident-log.md' });
  }
  return out;
}
function parseVerdicts(since) {
  const out = [];
  for (const line of tailText(abs('.claude/logs/verdicts.jsonl'), 1024 * 1024).split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (!isRow(j)) continue;
    const d = parseLocal(j.timestamp || j.ts); if (!d || d.getTime() < since) continue;
    out.push({ t: d.toISOString(), kind: 'verdict', op: String(j.decision || 'unknown').slice(0, 20), path: '.claude/logs/verdicts.jsonl' });
  }
  return out;
}
function parseEpisodes(since) {
  const out = [];
  for (const d of listDir(path.join(ROOT, 'memory/episodes'))) {
    if (!d.isFile() || !/^\d{4}-\d\d\.jsonl$/.test(d.name)) continue;
    const m = mtime(path.join(ROOT, 'memory/episodes', d.name));
    if (!m || new Date(m).getTime() < since) continue;
    for (const line of tailText(path.join(ROOT, 'memory/episodes', d.name), 512 * 1024).split('\n')) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (!isRow(j)) continue;
      const t = parseLocal(j.ts || j.timestamp); if (!t || t.getTime() < since) continue;
      out.push({ t: t.toISOString(), kind: 'session', op: 'session ' + String(j.outcome || 'logged').slice(0, 12), path: 'memory/episodes/' + d.name });
    }
  }
  return out;
}
function noteEvents(since) {
  const out = [];
  for (const d of listDir(path.join(ROOT, 'Daily Notes'))) {
    if (!/^\d{6}\.md$/.test(d.name)) continue;
    const m = mtime(path.join(ROOT, 'Daily Notes', d.name));
    if (m && new Date(m).getTime() >= since) out.push({ t: m, kind: 'note', op: 'daily note', path: 'Daily Notes/' + d.name });
  }
  return out;
}
export function ownerOf(index, p) {
  if (!p) return null;
  const q = String(p).replace(/^\.\//, '').replace(/\\/g, '/').toLowerCase();
  for (const e of index) if (q === e.lower || q.startsWith(e.lower + '/')) return e.id;
  return null;
}

// ---------- flags and next steps ----------
// A flag is something that went wrong after install, with one plain action. Anything we shipped
// and a brand new install can never trigger one: every rule below needs either your own file, or
// state that only exists once the system has been used.
function computeFlags(w) {
  const flags = [];
  const add = (severity, kind, target, message, action) => flags.push({ severity, kind, target, message, action });
  const has = (c) => w.commands.some((x) => x.name === c);
  const run = (c, why) => (has(c) ? `Run /${c} ${why}` : why.replace(/^to /, 'Then ').replace(/^\w/, (x) => x.toUpperCase()));
  if (w.hooks.settingsUnread) add('medium', 'settings-unread', 'c:core/hooks', 'The map could not read .claude/settings.json, so your hooks were not checked', 'Check it is a normal file you can open, not a link.');
  for (const l of w.memory.layers) if (l.unread) add('medium', 'memory-unread', l.id, `The map could not read ${l.file}, so its size was not checked`, 'Check it is a normal file you can open, not a link.');
  if (w.hooks.hooksUnchecked) add('medium', 'hooks-unchecked', 'c:core/hooks', `${w.hooks.hooksUnchecked} hook entr${w.hooks.hooksUnchecked === 1 ? 'y' : 'ies'} in settings.json could not be checked`, 'Open the hooks section of .claude/settings.json and check each entry has a matcher and a list of hooks.');
  if (w.automation.unread) add('medium', 'automations-unread', 'c:core/automation', 'The map could not read .claude/automations.yml, so your automations were not checked', 'Check it is a normal file you can open, not a link.');
  if (w.automation.snapshotUnread) add('medium', 'pulse-unread', 'c:core/automation', 'The map could not read your last /pulse result', run('pulse', 'for a fresh reading.'));
  for (const r of w.automation.unlisted) add(r.critical ? 'high' : 'medium', 'automation-unlisted', 'c:core/automation', `${r.label} was ${r.verdict === 'FAILING' ? 'failing' : 'silent'} at your last /pulse`, 'Open the job and look at its last run.');
  if (w.linksSkipped) add('low', 'links-skipped', 'c:base/agents', `${w.linksSkipped} linked item${w.linksSkipped === 1 ? ' was' : 's were'} left off this map`, 'The map only reads real files inside this project. Nothing needs fixing unless you want them shown.');
  if (w.hooks.settingsBroken) add('high', 'settings-broken', 'c:core/hooks', '.claude/settings.json cannot be read, so your hooks are switched off', 'Open .claude/settings.json and fix the JSON. Claude can do it if you paste the error.');
  for (const h of w.hooks.wired) if (h.script && h.scriptExists === false) add('high', 'hook-script-missing', h.id, `${h.script} is switched on in settings.json but the file is missing`, 'Restore the script in .claude/hooks, or remove its entry from settings.json.');
  const mem = Object.fromEntries(w.memory.layers.map((l) => [l.id, l]));
  if (mem['mem:memory'] && mem['mem:memory'].lines > MEMORY_CAP) add('high', 'memory-over-cap', 'mem:memory', `Working memory is ${mem['mem:memory'].lines} lines, over the ${MEMORY_CAP} line limit`, run('memory-consolidate', 'to trim it back down.'));
  // The knowledge base ships with learnings in it, so its size only counts once you have changed it.
  const kb = mem['mem:knowledge-base'];
  if (kb && !untouched(kb.file)) {
    if (kb.lines > KB_CAP) add('medium', 'kb-over-cap', kb.id, `Knowledge base is ${kb.lines} lines, past the ${KB_CAP} line target`, 'Remove entries that are stale or superseded, so Claude reads less each session.');
    else if (kb.lines > KB_CAP * 0.9) add('low', 'kb-near-cap', kb.id, `Knowledge base is ${kb.lines} of ${KB_CAP} lines`, 'Consolidate entries before the next round of learnings arrives.');
  }
  if (mem['mem:nominations'] && mem['mem:nominations'].pending > 5) add('medium', 'nominations-backlog', 'mem:nominations', `${mem['mem:nominations'].pending} learnings are waiting for review`, run('audit', 'to review them.'));
  if (mem['mem:memory'] && !mem['mem:memory'].starter && daysSince(mem['mem:memory'].mtime) > 14) add('low', 'memory-stale', 'mem:memory', `Working memory has not changed in ${Math.round(daysSince(mem['mem:memory'].mtime))} days`, run('sync', 'to bring it up to date.'));
  const KNOWN_VERDICTS = new Set(['OK', 'STALE', 'FAILING', 'SILENT', 'INACTIVE', 'UNCHECKED']);
  if (w.automation.configured && !w.automation.snapshotAt) add('low', 'pulse-never', 'c:core/automation', `${w.automation.configured} automation${w.automation.configured === 1 ? ' is' : 's are'} listed, and /pulse has not checked them yet`, run('pulse', 'for your first reading.'));
  for (const a of w.automation.entries) {
    if (w.automation.snapshotAt && !a.seen) add('low', 'automation-unseen', a.id, `${a.name} is listed, but your last /pulse did not check it`, run('pulse', 'to include it.'));
    else if (a.seen && !KNOWN_VERDICTS.has(a.verdict)) add('medium', 'automation-unknown', a.id, `${a.name} has a result this map does not recognise from your last /pulse`, run('pulse', 'to get a fresh reading.'));
    if (a.verdict === 'UNCHECKED') add('low', 'automation-unchecked', a.id, `/pulse could not check ${a.name} by itself`, 'Check this one by hand, or run /pulse in a session that can reach it.');
    if (a.verdict === 'FAILING') add(a.critical ? 'high' : 'medium', 'automation-failing', a.id, `${a.name} was failing at your last /pulse`, a.critical ? 'Fix it first, and run /red-team on the fix.' : 'Open the job and look at its last run.');
    else if (a.verdict === 'SILENT') add(a.critical ? 'high' : 'medium', 'automation-silent', a.id, `${a.name} had not run at your last /pulse`, 'Check its trigger and its last run.');
    else if (a.verdict === 'STALE') add('low', 'automation-stale', a.id, `${a.name} was overdue at your last /pulse`, 'Check it ran as scheduled, or raise expected_interval_hours in automations.yml.');
  }
  if (w.automation.snapshotAt && daysSince(w.automation.snapshotAt) < -1) add('medium', 'pulse-future', 'c:core/automation', 'Your last /pulse is dated in the future, so its age cannot be trusted', 'Run /pulse so this view reflects today.');
  if (w.automation.snapshotAt && daysSince(w.automation.snapshotAt) > 7) add('medium', 'pulse-stale', 'c:core/automation', `Your last /pulse was ${Math.round(daysSince(w.automation.snapshotAt))} days ago`, 'Run /pulse so this view reflects today.');
  for (const label of w.problems) add('medium', 'could-not-read', 'c:core/memory', `Could not read ${label}, so that part of the map is missing`, 'Open the file and check it is complete. Claude can help if you paste what is in it.');
  // Yours only, from here down.
  for (const a of w.agents) if (a.custom && !a.hasDescription) add('low', 'no-description', a.id, `Your agent ${a.name} has no description`, 'Add a description line to its frontmatter, so Claude knows when to use it.');
  for (const c of w.commands) if (c.custom && !c.hasDescription) add('low', 'no-description', c.id, `Your command /${c.name} has no description`, 'Add a description line, so it reads well in the command menu.');
  for (const s of w.skillLibrary.yours) if (!s.present) add('low', 'skill-missing-file', 'skill:' + s.name, `Your skill ${s.name} has no SKILL.md`, 'Add a SKILL.md to the folder, or remove the folder.');
  for (const s of w.hooks.unwired) if (isCustom('.claude/hooks/' + s)) add('low', 'hook-unwired', 'c:core/hooks', `Your script ${s} is not switched on`, 'Add it to the hooks section of settings.json, or leave it if you run it by hand.');
  const order = { high: 0, medium: 1, low: 2 };
  flags.sort((x, y) => order[x.severity] - order[y.severity]);
  return flags;
}

function computeNextSteps(w, buildingIds) {
  const steps = [];
  const has = (c) => w.commands.some((x) => x.name === c);
  const add = (id, text, target, command = null) => steps.push({ id, text, target, command });
  if (w.memory.starter && has('start')) add('start', 'Run /start to set up your memory', 'mem:memory', 'start');
  else if (!w.memory.noteCount && has('start')) add('start-note', 'Run /start to open your first daily note', 'mem:daily', 'start');
  if (w.memory.starter && w.workspace.folders.some((f) => !f.shipped) && has('onboard')) add('onboard', 'Run /onboard so Claude learns this codebase', 'b:work', 'onboard');
  if (!w.automation.configured && has('pulse')) add('automations', 'List your scheduled jobs in automations.yml, then run /pulse', 'c:core/automation', 'pulse');
  else if (w.automation.configured && !w.automation.snapshotAt && has('pulse')) add('pulse', 'Run /pulse for your first automation reading', 'c:core/automation', 'pulse');
  if (buildingIds.has('b:seo') && !exists(path.join(ROOT, 'seo-engine/STRATEGY.md')) && isDir(path.join(ROOT, 'seo-engine'))) add('seo', 'Fill in seo-engine/CONFIG.md, then run /seo-engine', 'b:seo', 'seo-engine');
  if (buildingIds.has('b:content') && has('brand-memory') && !walk(abs('.claude/agent-memory'), (f) => /brand/.test(f), [], 0, 3).filter((f) => isCustom(relClaude(f))).length) add('brand', 'Run /brand-memory create <your brand> to start producing', 'b:content', 'brand-memory');
  if (buildingIds.has('b:analyst') && has('research')) { const runs = listDir(abs('.claude/analyst/runs')).filter((d) => !/^(example|README)/i.test(d.name) && !d.name.startsWith('.')); if (!runs.length) add('research', 'Run /research "<your question>" for your first dossier', 'b:analyst', 'research'); }
  if (w.clients && !w.clients.list.length && w.clients.hasTemplate) add('client', 'Copy clients/_TEMPLATE to add your first client', 'b:clients');
  return steps;
}

// ---------- the map ----------
function buildPlaces(w) {
  const buildings = [], chambers = [], assign = {};
  const nodes = [];
  const B = (id, name, style, colour, blurb, root) => { const b = { id, name, style, colour, blurb, root }; buildings.push(b); return b; };
  const C = (id, building, name, theme, blurb) => { const c = { id, building, name, theme, blurb }; chambers.push(c); return c; };
  const put = (n, chamber, reason) => { nodes.push({ id: n.id, type: n.type, name: n.name, file: n.file || null, mtime: n.mtime || null, chamber: chamber.id, building: chamber.building, count: n.count }); assign[n.id] = { chamber: chamber.id, building: chamber.building, reason }; };

  // Who belongs to which engine. An engine only gets a building once it has real weight.
  const scored = new Map();
  for (const a of w.agents) if (!a.custom) scored.set(a.id, classify(a.name, a.description));
  for (const c of w.commands) if (!c.custom) scored.set(c.id, classify(c.name, c.description));
  const members = {}; for (const e of ENGINES) members[e.id] = 0;
  for (const v of scored.values()) if (v) members[v]++;
  const liveEngines = ENGINES.filter((e) => members[e.id] >= 4);
  const live = new Set(liveEngines.map((e) => e.id));
  // Commands that only ever talk to one engine's agents follow them, whatever their name says.
  for (const c of w.commands) {
    if (c.custom || scored.get(c.id)) continue;
    const owners = c.mentionsAgents.map((n) => scored.get('agent:' + n));
    if (owners.length >= 2 && owners[0] && owners.every((o) => o === owners[0])) scored.set(c.id, owners[0]);
  }
  const engineOf = (id) => { const v = scored.get(id); return v && live.has(v) ? v : null; };

  // Core
  B('b:core', 'Core', 'core', '#18b4cc', 'The operating system itself: memory, hooks, settings, tool connections and automations.', '.claude');
  const vault = C('c:core/memory', 'b:core', 'Memory Vault', 'vault', 'Everything your system remembers.');
  const gate = C('c:core/hooks', 'b:core', 'Hook Gateway', 'gateway', 'Hooks are the checks that run on every step, whatever the model decides. Wired in .claude/settings.json.');
  const dock = C('c:core/mcp', 'b:core', 'MCP Dock', 'dock', 'Tool connections listed in .mcp.json. Names only: this map never shows the values, and it does not test whether a server connects.');
  const bay = C('c:core/automation', 'b:core', 'Automation Bay', 'bay', 'The jobs you listed in .claude/automations.yml, with what /pulse last saw. It only knows what /pulse last wrote.');
  for (const l of w.memory.layers) put({ ...l, type: 'memory' }, vault, 'memory layer');
  for (const h of w.hooks.wired) put({ ...h, type: 'hook', file: h.script ? '.claude/hooks/' + h.script : '.claude/settings.json' }, gate, 'wired in .claude/settings.json');
  if (exists(abs('.claude/settings.json'))) put({ id: 'doc:settings', type: 'doc', name: 'settings.json', file: '.claude/settings.json', mtime: mtime(abs('.claude/settings.json')) }, gate, 'your Claude Code settings');
  for (const m of w.mcp) put({ ...m, type: 'mcp' }, dock, 'server named in .mcp.json');
  for (const a of w.automation.entries) put({ ...a, type: 'workflow', file: w.automation.file }, bay, 'listed in .claude/automations.yml');
  if (exists(abs(w.automation.file))) put({ id: 'doc:automations', type: 'doc', name: 'automations.yml', file: w.automation.file, mtime: mtime(abs(w.automation.file)) }, bay, 'your list of automations');

  // Claudify base
  B('b:claudify', 'Claudify', 'claudify', '#5070f7', 'The commands, agents and working methods every project gets.', '.claude');
  const deck = C('c:base/commands', 'b:claudify', 'Command Deck', 'deck', 'Your slash commands. Each terminal is one command.');
  const quarters = C('c:base/agents', 'b:claudify', 'Agent Quarters', 'quarters', 'Specialists Claude hands work to.');
  const recipes = C('c:base/methods', 'b:claudify', 'Methods Room', 'workshop', 'Recipes, scripts and reference files.');

  // Engines
  const engineRooms = {};
  for (const e of liveEngines) {
    const id = 'b:' + e.id;
    B(id, e.name, e.id, e.colour, e.blurb, '.claude');
    if (e.id === 'seo') engineRooms.seo = { agents: C('c:seo/ops', id, 'Operations Room', 'seo', 'The agents that run the SEO loop.'), commands: C('c:seo/commands', id, 'Control Desk', 'deck', 'SEO commands.'), files: C('c:seo/files', id, 'Strategy Files', 'files', 'Your engine configuration and strategy.') };
    if (e.id === 'content') engineRooms.content = { agents: C('c:content/studio', id, 'Content Studio', 'studio', 'Agents that plan, write and check your content.'), newsletter: C('c:content/newsletter', id, 'Newsletter Room', 'post', 'The newsletter pipeline.'), ads: C('c:content/ads', id, 'Video Ads', 'ads', 'The video ad pipeline.'), commands: C('c:content/commands', id, 'Production Desk', 'deck', 'Content commands.'), files: C('c:content/files', id, 'Foundations', 'files', 'Starter packs and foundation files.') };
    if (e.id === 'analyst') engineRooms.analyst = { agents: C('c:analyst/lab', id, 'Research Lab', 'lab', 'Agents that gather evidence and argue both sides.'), commands: C('c:analyst/commands', id, 'Briefing Desk', 'deck', 'Research commands.'), files: C('c:analyst/files', id, 'Evidence Room', 'files', 'The engine, its schemas and your runs.') };
  }

  // Skills Library
  if (w.skillLibrary.total) {
    B('b:skills', 'Skills Library', 'library', '#7dd3fc', 'Every skill, shelved by category. Click a shelf to open it.', '.claude/skills');
    const hall = C('c:skills/hall', 'b:skills', 'Main Hall', 'hall', 'One shelf per category, with its count.');
    for (const s of w.skillLibrary.shelves) put({ id: s.id, type: 'shelf', name: s.name, file: s.file, mtime: s.mtime, count: s.count }, hall, 'skills in .claude/skills/' + s.key);
  }

  // Your Work: top-level folders, plus anything you added yourself
  B('b:work', 'Your Work', 'work', '#fbbf24', 'Your own folders and anything you have added to the system.', '.');
  const desk = C('c:work/desk', 'b:work', 'Front Desk', 'desk', 'The notes at the top of your project.');
  for (const f of w.workspace.files) put({ id: 'doc:' + f.file, type: 'doc', name: f.name, file: f.file, mtime: f.mtime }, desk, 'file at the project root');
  const yourRoom = () => chambers.find((c) => c.id === 'c:work/yours') || C('c:work/yours', 'b:work', 'Your Additions', 'crew', 'Agents, commands and skills you added. They are yours, and updates leave them alone.');

  // Place agents and commands
  const contentRoomFor = (n) => { const r = engineRooms.content; const t = n.name + ' ' + n.description; if (/^ad-|video[- ]ad/i.test(t)) return r.ads; if (/newsletter|issue|stylist|drafter|prompt-architect/i.test(t)) return r.newsletter; return null; };
  for (const a of w.agents) {
    const n = { ...a, type: 'agent' }; const e = engineOf(a.id);
    if (a.custom) put(n, yourRoom(), 'not in the shipped manifest, so it is yours');
    else if (e) put(n, (e === 'content' && contentRoomFor(a)) || engineRooms[e].agents, 'what it does matches the ' + ENGINES.find((x) => x.id === e).name);
    else put(n, quarters, 'part of the Claudify base');
  }
  for (const c of w.commands) {
    const n = { ...c, type: 'command' }; const e = engineOf(c.id);
    if (c.custom) put(n, yourRoom(), 'not in the shipped manifest, so it is yours');
    else if (e) put(n, engineRooms[e].commands, 'what it does matches the ' + ENGINES.find((x) => x.id === e).name);
    else put(n, deck, 'part of the Claudify base');
  }
  for (const s of w.skillLibrary.yours) if (!s.present || s.file.split('/').length === 4) put({ id: 'skill:' + s.name, type: 'skill', name: s.name, file: s.file, mtime: mtime(abs(s.file)) }, yourRoom(), 'a skill you added');
  for (const f of ['recipes', 'scripts']) for (const d of listDir(abs('.claude/' + f))) if (d.isFile() && !d.name.startsWith('.')) { const file = '.claude/' + f + '/' + d.name; const custom = isCustom(file); put({ id: 'doc:' + file, type: f === 'scripts' ? 'script' : 'doc', name: d.name.replace(/\.md$/, ''), file, mtime: mtime(abs(file)) }, custom ? yourRoom() : recipes, custom ? 'a file you added' : 'shipped method'); }
  if (isDir(abs('.claude/analyst')) && engineRooms.analyst) for (const d of listDir(abs('.claude/analyst'))) { if (d.name.startsWith('.')) continue; const file = '.claude/analyst/' + d.name; put({ id: 'doc:' + file, type: d.isDirectory() ? 'folder' : 'doc', name: d.name, file, mtime: mtime(abs(file)) }, engineRooms.analyst.files, 'part of the Analyst Engine'); }

  // Top-level folders: shipped ones go to their engine, the rest are your work.
  const yoursFolders = [];
  for (const f of w.workspace.folders) {
    const eng = f.shipped ? classify(f.name, '') : null;
    if (eng && engineRooms[eng]) {
      const kids = folderChildren(f.name, 12); const room = (eng === 'content' && (/ad/.test(f.name) ? engineRooms.content.ads : /newsletter/.test(f.name) ? engineRooms.content.newsletter : engineRooms.content.files)) || engineRooms[eng].files;
      for (const k of kids.items) put({ id: 'doc:' + k.file, type: k.kind, name: k.name, file: k.file, mtime: k.mtime }, room, 'part of ' + f.name + '/');
    } else if (f.shipped) put({ id: 'doc:' + f.file, type: 'folder', name: f.name, file: f.file, mtime: f.mtime }, recipes, 'shipped starter folder');
    else yoursFolders.push(f);
  }
  const shown = yoursFolders.slice(0, WORK_ROOM_LIMIT);
  for (const f of shown) {
    const room = C('c:work/f:' + f.name, 'b:work', f.name, 'work', 'Your folder ' + f.name + '/. Folder contents are listed here and never changed by this map.');
    const kids = folderChildren(f.name);
    if (!kids.items.length) put({ id: 'doc:' + f.file, type: 'folder', name: f.name, file: f.file, mtime: f.mtime }, room, 'top-level folder');
    for (const k of kids.items) put({ id: 'doc:' + k.file, type: k.kind, name: k.name, file: k.file, mtime: k.mtime }, room, 'in ' + f.name + '/');
    if (kids.total > kids.items.length) room.blurb += ` Showing the ${kids.items.length} most recently changed of ${kids.total}.`;
  }
  if (yoursFolders.length > shown.length) {
    const room = C('c:work/more', 'b:work', 'More Folders', 'work', 'The rest of your top-level folders.');
    for (const f of yoursFolders.slice(shown.length)) put({ id: 'doc:' + f.file, type: 'folder', name: f.name, file: f.file, mtime: f.mtime }, room, 'top-level folder');
  }

  // Clients, when the project has a clients folder
  if (w.clients) {
    B('b:clients', 'Clients', 'clients', '#60a5fa', 'One office per client folder in clients/.', 'clients');
    const lobby = C('c:clients/lobby', 'b:clients', 'Reception', 'reception', 'How client spaces work.');
    if (exists(path.join(ROOT, 'clients/README.md'))) put({ id: 'doc:clients/README.md', type: 'doc', name: 'README', file: 'clients/README.md', mtime: mtime(path.join(ROOT, 'clients/README.md')) }, lobby, 'client spaces guide');
    if (w.clients.hasTemplate) put({ id: 'doc:clients/_TEMPLATE', type: 'folder', name: 'New client template', file: 'clients/_TEMPLATE', mtime: mtime(path.join(ROOT, 'clients/_TEMPLATE')) }, lobby, 'copy this to add a client');
    for (const c of w.clients.list) { const room = C('c:clients/' + c.slug, 'b:clients', c.name, 'office', 'The ' + c.name + ' client space.'); put({ ...c, type: 'client' }, room, 'folder in clients/'); for (const k of folderChildren(c.file, 10).items) put({ id: 'doc:' + k.file, type: k.kind, name: k.name, file: k.file, mtime: k.mtime }, room, 'in the client space'); }
  }

  // Empty rooms disappear, so nothing on the map is a placeholder.
  const used = new Set(nodes.map((n) => n.chamber));
  const keep = chambers.filter((c) => used.has(c.id) || c.id === 'c:core/automation' || c.id === 'c:core/mcp');
  const keepBuildings = buildings.filter((b) => keep.some((c) => c.building === b.id));
  return { buildings: keepBuildings, chambers: keep, nodes, assign };
}

function buildEdges(w) {
  const edges = [];
  const skillShelf = new Map();
  for (const s of w.skillLibrary.shelves) for (const k of s.skills) skillShelf.set(k.name, s.id);
  for (const a of w.agents) {
    for (const r of a.reads) edges.push({ from: a.id, to: 'file:' + r, type: 'reads' });
    for (const s of a.skills) if (skillShelf.has(s)) edges.push({ from: skillShelf.get(s), to: a.id, type: 'loads' });
    if (a.memory) edges.push({ from: a.id, to: 'file:' + a.memory.path, type: 'memory' });
  }
  for (const c of w.commands) {
    for (const an of c.mentionsAgents) edges.push({ from: c.id, to: 'agent:' + an, type: 'spawns' });
    for (const cn of c.mentionsCommands) edges.push({ from: c.id, to: 'command:' + cn, type: 'chains' });
  }
  return edges;
}

export function extract() {
  PROBLEMS = []; linksSkipped = 0;
  for (const area of ['agents', 'commands', 'skills']) { try { if (fs.lstatSync(abs('.claude/' + area)).isSymbolicLink()) linksSkipped++; } catch { /* not installed */ } }
  if (!ROOT) throw new Error(rootRefusal() || 'No project folder.');
  PATTERNS = loadPatterns(CLAUDE);
  MANIFEST = attempt('.claude/UPDATE-MANIFEST.json', loadManifest, null);
  const emptySkills = { total: 0, shelves: [], yours: [] };
  const agents = attempt('.claude/agents', extractAgents, []);
  const skillLibrary = attempt('.claude/skills', extractSkills, emptySkills);
  const hooks = attempt('.claude/settings.json', extractHooks, { wired: [], unwired: [], scriptCount: 0, settingsBroken: false, settingsPresent: false });
  const commands = attempt('.claude/commands', () => extractCommands(agents.map((a) => a.name)), []);
  const memory = attempt('.claude/memory.md', extractMemory, { layers: [], starter: true, noteCount: 0 });
  const mcp = attempt('.mcp.json', extractMcp, []);
  const automation = attempt('.claude/automations.yml', extractAutomation, { file: '.claude/automations.yml', configured: 0, snapshotFile: null, snapshotAt: null, entries: [] });
  const workspace = attempt('your top-level folders', extractWorkspace, { folders: [], files: [] });
  const clients = attempt('clients/', extractClients, null);
  const now = Date.now(), since = now - EVENT_WINDOW_DAYS * DAY;
  const rawEvents = [].concat(attempt('.claude/logs/audit-trail.md', () => parseAudit(since), []), attempt('.claude/logs/incident-log.md', () => parseIncidents(since), []), attempt('.claude/logs/verdicts.jsonl', () => parseVerdicts(since), []), attempt('memory/episodes', () => parseEpisodes(since), []), attempt('Daily Notes', () => noteEvents(since), []));
  const w = { version: 3, generatedAt: new Date().toISOString(), project: path.basename(ROOT), shippedVersion: MANIFEST ? MANIFEST.version : null, agents, commands, hooks, skillLibrary, mcp, memory, automation, workspace, clients, problems: PROBLEMS, linksSkipped };
  w.edges = buildEdges(w);
  w.flags = computeFlags(w);
  const { buildings, chambers, nodes, assign } = buildPlaces(w);
  w.nextSteps = computeNextSteps(w, new Set(buildings.map((b) => b.id)));
  const assignments = assign;
  // Flags on rooms or buildings roll up to where they point.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const f of w.flags) { const n = nodeById.get(f.target); f.chamber = n ? n.chamber : chambers.some((c) => c.id === f.target) ? f.target : null; f.building = n ? n.building : (chambers.find((c) => c.id === f.target) || {}).building || null; }

  // Path to owner, longest prefix first, so any changed file lands somewhere sensible.
  const owner = [];
  for (const n of nodes) if (n.file) owner.push({ prefix: String(n.file).replace(/\/$/, ''), id: n.id });
  for (const a of agents) if (a.memory) owner.push({ prefix: a.memory.path, id: a.id });
  for (const [prefix, id] of [['.claude/hooks', 'c:core/hooks'], ['.claude/agent-memory', 'mem:agent-memory'], ['.claude/logs/pulse', 'c:core/automation'], ['.claude/logs', 'c:core/hooks'], ['.claude/commands', 'c:base/commands'], ['.claude/agents', 'c:base/agents'], ['.claude/skills', 'c:skills/hall'], ['.claude', 'c:core/memory'], ['Daily Notes', 'mem:daily'], ['memory', 'mem:domain'], ['playbooks', 'mem:playbooks']]) owner.push({ prefix, id });
  for (const c of chambers) if (c.id.startsWith('c:work/f:')) owner.push({ prefix: c.id.slice(9), id: c.id });
  const ownerIndex = owner.map((e) => ({ ...e, lower: e.prefix.toLowerCase() })).sort((a, b) => b.prefix.length - a.prefix.length);

  // Activity
  const events = rawEvents.sort((a, b) => a.t.localeCompare(b.t)).slice(-EVENT_CAP);
  const chamberOf = new Map(chambers.map((c) => [c.id, c.building]));
  for (const e of events) { const o = ownerOf(ownerIndex, e.path); e.node = o; const n = nodeById.get(o); e.chamber = n ? n.chamber : chamberOf.has(o) ? o : null; e.building = e.chamber ? chamberOf.get(e.chamber) || null : null; }

  // Rollups
  const roll = () => ({ nodes: 0, agents: 0, commands: 0, high: 0, medium: 0, low: 0, level: null, recent24h: 0, recent7d: 0 });
  const chamberRoll = Object.fromEntries(chambers.map((c) => [c.id, roll()]));
  const buildingRoll = Object.fromEntries(buildings.map((b) => [b.id, roll()]));
  for (const n of nodes) for (const r of [chamberRoll[n.chamber], buildingRoll[n.building]]) { if (!r) continue; r.nodes++; if (n.type === 'agent') r.agents++; if (n.type === 'command') r.commands++; }
  for (const f of w.flags) { if (f.chamber && chamberRoll[f.chamber]) chamberRoll[f.chamber][f.severity]++; if (f.building && buildingRoll[f.building]) buildingRoll[f.building][f.severity]++; }
  for (const e of events) { const recent = now - new Date(e.t).getTime() < DAY; for (const r of [chamberRoll[e.chamber], buildingRoll[e.building]]) { if (!r) continue; r.recent7d++; if (recent) r.recent24h++; } }
  const level = (r) => (r.high ? 'high' : r.medium ? 'medium' : r.low ? 'low' : null);
  for (const r of [...Object.values(chamberRoll), ...Object.values(buildingRoll)]) r.level = level(r);

  // Building-to-building links, for the drones.
  const flowMap = new Map();
  const bOf = (id) => { if (assignments[id]) return assignments[id].building; if (id.startsWith('file:')) { const o = ownerOf(ownerIndex, id.slice(5)); return o ? (assignments[o] ? assignments[o].building : chamberOf.get(o) || null) : null; } return null; };
  for (const e of w.edges) { const a = bOf(e.from), b = bOf(e.to); if (!a || !b || a === b) continue; const key = a < b ? a + '|' + b : b + '|' + a; const f = flowMap.get(key) || { a: a < b ? a : b, b: a < b ? b : a, count: 0 }; f.count++; flowMap.set(key, f); }

  const high = w.flags.filter((f) => f.severity === 'high').length, medium = w.flags.filter((f) => f.severity === 'medium').length, low = w.flags.filter((f) => f.severity === 'low').length;
  w.health = { level: high ? 'high' : medium ? 'medium' : 'clear', high, medium, low, checkedAt: w.generatedAt, automationsAsOf: w.automation.snapshotAt };
  w.counts = { agents: agents.length, commands: commands.length, skills: skillLibrary.total, shelves: skillLibrary.shelves.length, hooks: hooks.wired.length, mcp: w.mcp.length, automations: w.automation.configured, folders: w.workspace.folders.filter((f) => !f.shipped).length, clients: w.clients ? w.clients.list.length : 0, flags: w.flags.length };
  for (const a of w.agents) { delete a.reads; delete a.hasDescription; }
  for (const c of w.commands) { delete c.hasDescription; delete c.mentionsAgents; delete c.mentionsCommands; }
  w.places = { buildings: buildings.map((b) => ({ ...b, rollup: buildingRoll[b.id], chambers: chambers.filter((c) => c.building === b.id).map((c) => c.id) })), chambers: chambers.map((c) => ({ ...c, rollup: chamberRoll[c.id] })) };
  w.nodes = nodes; w.assignments = assignments; w.flows = [...flowMap.values()].sort((x, y) => y.count - x.count); w.ownerIndex = ownerIndex.map(({ prefix, id }) => ({ prefix, id }));
  w.events = { windowDays: EVENT_WINDOW_DAYS, since: new Date(since).toISOString(), until: new Date(now).toISOString(), count: events.length, events };
  delete w.workspace; delete w.clients; delete w.problems; delete w.linksSkipped;
  scrubWorld(w);
  w.edges = w.edges.filter((e) => e.to !== HIDDEN);
  return w;
}

// Free text read from your files can hold a key, so it is checked before it reaches the page. A
// description is judged on the file it came from: one line of a key looks like nothing on its own.
const FREE_TEXT = new Set(['description', 'header', 'reason', 'change', 'check', 'tools', 'skills', 'reads', 'to', 'message', 'action', 'model', 'kind', 'event', 'label', 'verdict', 'decision']);
function scrubWorld(world) {
  const slots = [];
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.sourceText === 'string') {
      if (node.sourceText) slots.push({ node, k: 'header' in node ? 'header' : 'description', text: node.sourceText });
      delete node.sourceText;
    }
    for (const [k, v] of Object.entries(node)) {
      if (FREE_TEXT.has(k)) {
        if (typeof v === 'string' && v) slots.push({ node, k, text: v });
        else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'string' && x) slots.push({ node: v, k: i, text: x }); });
      }
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(world);
  const hits = scanTexts(slots.map((x) => x.text), PATTERNS, 5000);
  for (const i of hits) slots[i].node[slots[i].k] = HIDDEN;
  if (hits.timedOut) { // everything stays hidden, and the page says why
    world.flags.unshift({ severity: 'high', kind: 'scan-timeout', target: 'c:core/memory', message: 'The key check ran out of time, so text on this map is hidden', action: 'Run /system-map again. If this stays, one of your files is very large.', chamber: null, building: null });
    world.health.level = 'high'; world.health.high += 1;
  }
}

// data/ is private to you. If it is a link, or anything in it is, the map stops rather than write through it.
export function prepareDataDir() {
  let st = null;
  try { st = fs.lstatSync(DATA_DIR); } catch { /* first run */ }
  if (!st) { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); return; }
  if (!st.isDirectory()) throw new Error('.claude/system-map/data is not a real folder. Delete it and run this again.');
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) throw new Error('.claude/system-map/data belongs to another user. Delete it and run this again.');
  fs.chmodSync(DATA_DIR, 0o700);
  for (const d of fs.readdirSync(DATA_DIR, { withFileTypes: true })) if (!d.isFile()) throw new Error(`.claude/system-map/data/${d.name} is not a plain file. Delete it and run this again.`);
}
// A fresh random name that must not already exist, then a rename, so nothing planted is followed.
export function writePrivate(file, text) {
  const tmp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, text, { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(tmp, file); } catch (err) { try { fs.unlinkSync(tmp); } catch { /* already gone */ } throw err; }
}
export function writeWorld(world = extract()) {
  prepareDataDir();
  writePrivate(OUT, JSON.stringify(world));
  return world;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!getRoot()) { console.log(rootRefusal()); process.exit(1); }
  const t0 = Date.now();
  const w = writeWorld();
  console.log(`Read ${getRoot()} in ${Date.now() - t0} ms`);
  console.log(JSON.stringify({ counts: w.counts, health: w.health, buildings: w.places.buildings.map((b) => `${b.name} (${b.rollup.nodes})`), steps: w.nextSteps.map((s) => s.text), flags: w.flags.map((f) => `${f.severity} ${f.kind} ${f.target}`) }, null, 1));
}
