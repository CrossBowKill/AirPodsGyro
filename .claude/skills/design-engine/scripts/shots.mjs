#!/usr/bin/env node
// design-engine / shots: take the screenshots the audit gate and the juror need.
//
//   node shots.mjs <http://localhost:3000 | path/to/index.html> --out <folder> [--widths 375,768,1440]
//
// Writes, for each width: w<width>-first.png (the first screen) and w<width>-full.png (the whole page,
// after one scroll through it, so scroll reveals have fired). Then the same two files with -reduced,
// taken with prefers-reduced-motion on. Add --dark for a dark-mode pass.
//
// Uses Playwright if the project has it, otherwise an installed Chrome, Edge or Chromium on Node 22+.
// Opens no window and installs nothing. Local pages only: localhost addresses and files on this machine.
//
// Exit code 0 = screenshots written. 2 = bad input. 3 = no browser route here; the message says what
// to do instead.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); if (i === -1) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const has = (name) => { const i = args.indexOf('--' + name); if (i === -1) return false; args.splice(i, 1); return true; };

const out = opt('out', 'design-runs/shots');
const widths = opt('widths', '375,768,1440').split(',').map(Number).filter(Boolean);
const dark = has('dark');
const target = args[0];

if (!target || target.startsWith('-')) {
  console.error('usage: node shots.mjs <http://localhost:PORT | path/to/index.html> --out <folder> [--widths 375,768,1440] [--dark]');
  process.exit(2);
}

function localUrl(t) {
  if (/^file:/i.test(t)) return t;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    const file = resolve(t);
    if (!existsSync(file)) { console.error('No such file: ' + file); process.exit(2); }
    return pathToFileURL(file).href;
  }
  let host = '';
  try { host = new URL(t).hostname; } catch { /* refused below */ }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  if (!/^https?:/i.test(t) || !local) {
    console.error(`shots.mjs opens local pages only (localhost or a file on this machine), got: ${t}`);
    process.exit(2);
  }
  return t;
}

const url = localUrl(target);
const outDir = resolve(out);
mkdirSync(outDir, { recursive: true });

const heightFor = (w) => (w < 600 ? 812 : w < 1000 ? 1024 : 900);
const SCROLL = `(async () => {
  const step = Math.max(200, innerHeight * 0.7);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 220)); }
  scrollTo({ top: 0, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 900));
})()`;

const passes = [{ reduced: false }, { reduced: true }];
const label = (w, kind, p) => `w${w}-${kind}${p.reduced ? '-reduced' : ''}${dark ? '-dark' : ''}.png`;

async function withPlaywright() {
  const require = createRequire(join(process.cwd(), 'package.json'));
  let pw = null;
  for (const name of ['playwright', 'playwright-core']) {
    try { pw = require(name); break; } catch { /* try the next one */ }
  }
  if (!pw) return false;
  let browser = null;
  for (const launch of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { browser = await pw.chromium.launch(launch); break; } catch { /* try the next one */ }
  }
  if (!browser) return false;
  for (const p of passes) {
    for (const w of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: heightFor(w) },
        reducedMotion: p.reduced ? 'reduce' : 'no-preference',
        colorScheme: dark ? 'dark' : 'light',
      });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(outDir, label(w, 'first', p)) });
      await page.evaluate(SCROLL);
      await page.screenshot({ path: join(outDir, label(w, 'full', p)), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
  return true;
}

async function withInstalledBrowser() {
  if (typeof WebSocket === 'undefined') return false;
  const { Browser, sleep } = await import(pathToFileURL(join(HERE, '..', 'library', 'design-taste-frontend', 'scripts', 'lib', 'cdp.mjs')).href);
  let browser;
  try { browser = await Browser.launch({}); } catch { return false; }
  for (const p of passes) {
    for (const w of widths) {
      const page = await browser.newPage({ width: w, height: heightFor(w), mobile: w < 600, reducedMotion: p.reduced });
      if (dark) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, ...(p.reduced ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])] });
      await page.goto(url, { settleMs: 800 });
      await page.screenshot({ path: join(outDir, label(w, 'first', p)), format: 'png' });
      await page.eval(SCROLL);
      await sleep(200);
      await page.screenshot({ path: join(outDir, label(w, 'full', p)), format: 'png', fullPage: true });
      await page.close();
    }
  }
  await browser.close();
  return true;
}

let done = false;
let route = '';
try { done = await withPlaywright(); if (done) route = 'Playwright'; } catch (e) { console.error('Playwright did not finish: ' + e.message); }
if (!done) {
  try { done = await withInstalledBrowser(); if (done) route = 'installed browser'; } catch (e) { console.error('The installed browser did not finish: ' + e.message); }
}

if (!done) {
  console.error('I cannot take screenshots on this machine: there is no Playwright in this project, and no Chrome, Edge or Chromium that this Node version can drive (it needs Node 22 or newer).');
  console.error(`Next step: use any browser tool this session has, or ask the user to open ${url} at phone width and desktop width and share the screenshots.`);
  process.exit(3);
}

writeFileSync(join(outDir, 'SHOTS.txt'), `page: ${url}\nroute: ${route}\nwidths: ${widths.join(', ')}\nreduced motion: yes\ndark: ${dark ? 'yes' : 'no'}\n`);
console.log(`Screenshots written to ${outDir} using ${route}.`);
