#!/usr/bin/env node
// grounding-check.mjs: proves that every number a synthesis quotes next to a card id
// actually appears in that card or in its raw source.
//
// A synthesis line like "C014 grew to $12k/month in 4 months" is grounded only if "12k"
// and "4" both occur in card C014 (or its raw post). Numbers that appear on a line with
// no card id are skipped: they are the writer's own arithmetic and are checked by a reader.
//
// Zero dependencies. Read-only. Exit 0 when every number is found, 1 when any is missing,
// 2 on a usage error.
//
// Usage:
//   node grounding-check.mjs <synthesis.md> [--cards library/cards.json] [--raw raw/posts.json]
//                            [--id-pattern 'C\d{3}'] [--json]
//   node grounding-check.mjs --self-test
//
// cards.json: an array of card objects, each with an `id`. raw.json: either an array of
// raw posts with `id`, or an object with a `posts` array. Both optional; at least one is
// needed for a meaningful check.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const norm = (s) => String(s).toLowerCase().replace(/[,\s]/g, '');
const NUMBER_RE = /[$£€]?\d(?:[\d,.]*\d)?(?:(?:%|k|m|x|bn)(?![a-z]))?/gi;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function indexById(list) {
  const out = {};
  for (const item of list) if (item && item.id != null) out[item.id] = norm(JSON.stringify(item));
  return out;
}

export function checkText(text, cards, raw, idPattern) {
  const idRe = new RegExp(idPattern, 'g');
  const stripRe = new RegExp(idPattern, 'g');
  const result = { lines: 0, checked: 0, missing: [] };
  for (const line of text.split('\n')) {
    const ids = [...new Set(line.match(idRe) || [])];
    if (!ids.length) continue;
    const body = line.replace(stripRe, '');
    const nums = (body.match(NUMBER_RE) || []).map((n) => n.trim().replace(/[.,]$/, ''));
    if (!nums.length) continue;
    result.lines++;
    const hay = ids.map((i) => (cards[i] || '') + ' ' + (raw[i] || '')).join(' ');
    for (const n of nums) {
      result.checked++;
      const core = norm(n).replace(/[$£€]/g, '');
      if (!hay.includes(core)) result.missing.push({ ids, number: n, line: line.trim().slice(0, 110) });
    }
  }
  return result;
}

function selfTest() {
  const cards = indexById([
    { id: 'C001', title: 'Agency case', numbers: [{ metric: 'MRR', value: '$12k', context: 'own, month 4' }], tactics: [] },
    { id: 'C002', title: 'Course case', numbers: [{ metric: 'students', value: '350', context: 'cohort 2' }] },
  ]);
  const raw = indexById([{ id: 'C002', content: 'we sold 350 seats at 49 dollars each' }]);
  const text = [
    '- C001 reached $12k MRR by month 4.',          // grounded (card)
    '- C002 enrolled 350 students at $49 each.',   // grounded (card + raw)
    '- C001 claims a 70% margin.',                 // 70% not in card -> missing
    '- Across the set, 3 cases mention retainers.', // no id -> skipped
  ].join('\n');
  const r = checkText(text, cards, raw, 'C\\d{3}');
  const fails = [];
  if (r.lines !== 3) fails.push(`expected 3 id-bearing lines, got ${r.lines}`);
  if (r.checked !== 5) fails.push(`expected 5 numbers checked, got ${r.checked}`);
  if (r.missing.length !== 1 || r.missing[0].number !== '70%') fails.push(`expected exactly one missing number (70%), got ${JSON.stringify(r.missing)}`);
  // file round trip through the CLI path
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-'));
  fs.writeFileSync(path.join(dir, 'cards.json'), JSON.stringify([{ id: 'X-7', value: '1,200 units' }]));
  fs.writeFileSync(path.join(dir, 'synth.md'), 'X-7 shipped 1200 units and 5 returns\n');
  const r2 = checkText(fs.readFileSync(path.join(dir, 'synth.md'), 'utf8'), indexById(loadJson(path.join(dir, 'cards.json'))), {}, 'X-\\d+');
  if (r2.checked !== 2 || r2.missing.length !== 1 || r2.missing[0].number !== '5') fails.push(`custom id pattern round trip failed: ${JSON.stringify(r2)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  if (fails.length) {
    for (const f of fails) console.error('SELF-TEST FAIL: ' + f);
    process.exit(1);
  }
  console.log('grounding-check self-test: PASS (grounded, missing, skipped, custom id pattern)');
  process.exit(0);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const opt = { cards: null, raw: null, idPattern: 'C\\d{3}', json: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--cards') opt.cards = args[++i];
    else if (a === '--raw') opt.raw = args[++i];
    else if (a === '--id-pattern') opt.idPattern = args[++i];
    else if (a === '--json') opt.json = true;
    else positional.push(a);
  }
  const file = positional[0];
  if (!file || (!opt.cards && !opt.raw)) {
    console.error('usage: grounding-check.mjs <synthesis.md> --cards cards.json [--raw raw.json] [--id-pattern REGEX] [--json]');
    process.exit(2);
  }
  let cards = {}, raw = {};
  try {
    if (opt.cards) cards = indexById(loadJson(opt.cards));
    if (opt.raw) { const r = loadJson(opt.raw); raw = indexById(Array.isArray(r) ? r : (r.posts || [])); }
  } catch (e) {
    console.error('could not load inputs: ' + e.message);
    process.exit(2);
  }
  const text = fs.readFileSync(file, 'utf8');
  const r = checkText(text, cards, raw, opt.idPattern);
  if (opt.json) {
    console.log(JSON.stringify({ file, ...r, status: r.missing.length ? 'UNGROUNDED' : 'GROUNDED' }, null, 2));
  } else {
    console.log(`${file}: ${r.lines} lines with card ids, ${r.checked} numbers checked, ${r.missing.length} not found`);
    for (const m of r.missing) console.log(`  ${m.ids.join(',')} | ${m.number} | ${m.line}`);
  }
  process.exit(r.missing.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
