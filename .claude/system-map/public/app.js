/* System Map renderer. The overview is campus.js. Inside, one PixiJS scene holds every building as
   a cluster of room modules joined by corridors; a building and a room are camera framings of the
   same map. Agents live in it with homes and errands, and the files drive them: every change the
   server pushes over /events becomes a purposeful trip. Art comes from public/art through art.js.
   Names, counts and flags all come from data/world.json, built by extract.mjs from your files. */
(async function () {
  'use strict';
  const PIXI = window.PIXI, L = window.WorldLayout, A = window.WorldArt;
  const $ = (id) => document.getElementById(id);
  // The link carries a private token after the #, which browsers never send anywhere. It moves into
  // memory here, and the history entry is replaced so the address bar stops showing it.
  const linked = location.hash.match(/^#t=([0-9a-f]{64})(?:&(.*))?$/);
  const TOKEN = linked ? linked[1] : '';
  const LINK_TARGET = linked ? linked[2] || '' : location.hash.slice(1);
  if (linked) history.replaceState(null, '', location.pathname + location.search + (linked[2] ? '#' + linked[2] : ''));
  const NEEDS_LINK = 'This page needs its private link. Run /system-map and open the link it gives you.';
  const api = (url) => fetch(url, { cache: 'no-store', headers: { 'X-Map-Token': TOKEN } });
  function linkLost() {
    $('live').textContent = 'Link expired'; $('live').className = 'live off'; $('tickerlist').textContent = NEEDS_LINK;
    $('hud').innerHTML = `<div class="state high"><i></i>Private link needed</div><div class="asof">${esc(NEEDS_LINK)} It changes each time the map starts, and refreshing this page clears it.</div>`;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DAY = 86400000, HOUR = 3600000;
  const ZMIN = 0.05, ZMAX = 5, ZSTEP = 1.25;
  const T = L.T;
  const COL = { bg: 0x0a0a12, panel: 0x101018, accent: 0x18b4cc, blue: 0x5070f7, cyan: 0x18b4cc, amber: 0xFFB020, red: 0xFF4D4D, text: 0xe0e0e8, muted: 0x8888a0, line: 0x1e1e30 };
  const hex = (s) => parseInt(String(s).replace('#', ''), 16);
  const FONT = 'Geist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const daysAgo = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : 9999);
  const fmtAge = (iso) => { if (!iso) return 'unknown'; const d = daysAgo(iso); return d < 1 ? Math.round(d * 24) + 'h ago' : Math.round(d) + 'd ago'; };
  const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);
  const fmtTs = (ms) => { const d = new Date(ms); return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' }) + ' ' + hhmm(d); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  // Interior colour temperature and silhouette per building: the eye separates projects by light.
  const BSTYLE = {
    core: { floor: 'floor-rivet', tint: 0x6E93A6, pool: 0x7FE4F5 },
    claudify: { floor: 'floor-panel', tint: 0x5F6E9E, pool: 0x7FA0FF },
    seo: { floor: 'floor-plate', tint: 0x5E8E88, pool: 0x7FE8D8 },
    content: { floor: 'floor-panel2', tint: 0x7A6A9E, pool: 0xC4B5FD },
    analyst: { floor: 'floor-grate', tint: 0x8E6E8A, pool: 0xF9A8D4 },
    library: { floor: 'floor', tint: 0x6E8A9A, pool: 0xBAE6FD },
    work: { floor: 'floor-strip', tint: 0x9A8468, pool: 0xFFD08A },
    clients: { floor: 'floor', tint: 0x6E7E9A, pool: 0x9FD8FF },
  };
  // How each fixture kind is composed from sheet cells: [alias, cell, dx (tiles), dy (tiles), width (tiles)].
  const ART = {
    desk2: [['desks', 2, 0, 0, 2]], editdesk: [['studio', 7, 0, 0, 2]], console2: [['deck', 1, 0, 0, 2]], bench: [['desks', 7, 0, 0, 2]], meeting: [['clients', 1, 0, 0, 2]], lab: [['deck', 4, 0, 0, 1], ['desks', 4, 1, 0, 1]],
    archive: [['skills', 4, 0, 0, 1], ['skills', 8, 1, 0, 1]], terminal: [['deck', 7, 0, 0, 1]], conveyor: [['bay', 0, 0, 0, 2]], pad: [['mcp', 1, 0, 0, 1]], 'pad-dark': [['mcp', 0, 0, 0, 1]], arch: [['hooks', 2, 0, 0, 1]], 'arch-alt': [['hooks', 6, 0, 0, 1]],
    office: [['clients', 8, 0, 0, 2], ['clients', 4, 0.1, -0.55, 0.7]],
    shelf: [['skills', 1, 0, 0, 1]], bookcase: [['skills', 0, 0, 0, 1.5], ['skills', 1, 1.5, 0, 1.5]], docshelf: [['skills', 2, 0, 0, 1]], cabinet: [['skills', 4, 0, 0, 1]], drawers: [['skills', 5, 0, 0, 1]], vaultdoor: [['checkout', 3, 0, 0, 1]],
    counter: [['checkout', 0, 0, 0, 2]], rope: [['checkout', 10, 0, 0, 1]], kiosk: [['checkout', 11, 0, 0, 1]], safe: [['checkout', 12, 0, 0, 1]], scanner: [['checkout', 15, 0, 0, 1]],
    camera: [['studio', 0, 0, 0, 1]], softbox: [['studio', 2, 0, 0, 1]], ringlight: [['studio', 3, 0, 0, 1]], videowall: [['studio', 9, 0, 0, 2]], rack: [['memory', 0, 0, 0, 1]], greenscreen: [['studio', 5, 0, 0, 1]], lightwall: [['studio', 13, 0, 0, 1]],
    press: [['post', 8, 0, 0, 2]], postdesk: [['post', 0, 0, 0, 2]], pigeonholes: [['post', 3, 0, 0, 1]], mailbox: [['post', 9, 0, 0, 1]],
    maptable: [['deck', 4, 0, 0, 1], ['deck', 12, 1, 0, 1]], radar: [['deck', 12, 0, 0, 1]], holoboard: [['deck', 11, 0, 0, 1]], wallmap: [['deck', 3, 0, 0, 1]], panel: [['hooks', 1, 0, 0, 1]], gears: [['bay', 11, 0, 0, 1]], pipes: [['bay', 9, 0, 0, 1]],
    stage: [['studio', 11, 0, 0, 2]], seats: [['desks', 10, 0, 0, 1], ['desks', 10, 1, 0, 1]], countdown: [['deck', 8, 0, 0, 1]],
    crawler: [['bay', 0, 0, 0, 2], ['bay', 5, 0.5, -0.5, 1]], easel3: [['clients', 13, 0, 0, 1], ['clients', 13, 1, 0, 1]], booth: [['hooks', 3, 0, 0, 1]], lectern: [['skills', 7, 0, 0, 1]],
    sofa: [['clients', 9, 0, 0, 2]], roundtable: [['clients', 3, 0, 0, 2]], robotarm: [['bay', 6, 0, 0, 1]], spool: [['mcp', 8, 0, 0, 1]], crates: [['bay', 13, 0, 0, 1]], hopper: [['bay', 12, 0, 0, 1]], datacore: [['memory', 11, 0, 0, 1]], fountain: [['props', 15, 0, 0, 1]], vending: [['props', 10, 0, 0, 1]],
    coffee: [['props', 11, 0, 0, 1]], plant: [['props', 0, 0, 0, 1]], bigplant: [['props', 2, 0, 0, 1]], clock: [['props', 12, 0, 0, 1]], extinguisher: [['props', 9, 0, 0, 1]], frame: [['props', 6, 0, 0, 1]], whiteboard: [['clients', 13, 0, 0, 1]], cooler: [['clients', 12, 0, 0, 1]], coatstand: [['clients', 15, 0, 0, 1]], trophies: [['clients', 14, 0, 0, 1]], dish: [['studio', 4, 0, 0, 1]], lamp: [['props', 5, 0, 0, 1]],
  };
  const PLANTS = [['props', 0], ['props', 1], ['props', 2], ['props', 5], ['props', 14]];
  const TYPE_ICON = { agent: 'icon-agent', skill: 'icon-skill', command: 'icon-command', hook: 'icon-hook', mcp: 'icon-mcp', memory: 'icon-memory', workflow: 'icon-workflow', client: 'icon-client', shelf: 'icon-skill', doc: 'icon-envelope', script: 'icon-gear', folder: 'icon-lock' };

  // ---------- state ----------
  const S = {
    world: null, atlas: null, st: null, byId: new Map(), edgeIndex: new Map(), flagsByTarget: new Map(), ownerIndex: [],
    mode: 'campus', view: { level: 'campus', building: null, room: null },
    cam: { x: 0, y: 0, z: 1 }, target: null, onTargetDone: null,
    actors: new Map(), fixtures: new Map(), rooms: new Map(), buildings: new Map(), packets: [], particles: [], bubbles: [],
    hover: null, selected: null, drag: null, dragging: false, dirty: true, lod: -1,
    timeline: { live: true, playing: false, cursor: Date.now(), lastDispatched: Date.now(), speed: HOUR },
    live: false, ticker: [], w: 0, h: 0, now: 0, tintMinute: -1, frame: 0,
  };

  // ---------- pixi boot ----------
  const stageEl = $('stage');
  const app = new PIXI.Application();
  await app.init({ background: COL.bg, resizeTo: stageEl, antialias: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, roundPixels: true, preference: 'webgl' });
  app.canvas.id = 'world'; stageEl.insertBefore(app.canvas, stageEl.firstChild);
  app.stage.eventMode = 'none';
  PIXI.Assets.setPreferences({ preferWorkers: false });
  const worldC = new PIXI.Container(); worldC.visible = false;
  const spaceLayer = new PIXI.Container(), corridorLayer = new PIXI.Container(), roomLayer = new PIXI.Container(), buildingLayer = new PIXI.Container(), actorLayer = new PIXI.Container(), fxLayer = new PIXI.Container(), tintLayer = new PIXI.Container();
  worldC.addChild(spaceLayer, corridorLayer, roomLayer, buildingLayer, actorLayer, fxLayer, tintLayer);
  app.stage.addChild(worldC);

  // ---------- data indexes ----------
  function indexWorld(w) {
    S.world = w; S.byId = new Map();
    for (const n of w.nodes) S.byId.set(n.id, { ...n, assignment: w.assignments[n.id] });
    const merge = (id, extra) => { const d = S.byId.get(id); if (d) Object.assign(d, extra, { type: d.type, file: d.file || extra.file }); };
    for (const a of w.agents) merge(a.id, a);
    for (const c of w.commands) merge(c.id, c);
    for (const h of w.hooks.wired) merge(h.id, h);
    for (const l of w.memory.layers) merge(l.id, l);
    for (const f of w.automation.entries) merge(f.id, f);
    for (const sh of w.skillLibrary.shelves) merge(sh.id, { shelf: sh, description: `${sh.count} skill${sh.count === 1 ? '' : 's'} in this category.` });
    S.ownerIndex = (w.ownerIndex || []).map((e) => ({ ...e, lower: e.prefix.toLowerCase() }));
    S.edgeIndex = new Map();
    const push = (k, e) => (S.edgeIndex.get(k) || S.edgeIndex.set(k, []).get(k)).push(e);
    for (const e of w.edges) {
      let to = e.to;
      if (to.startsWith('file:')) to = ownerOf(to.slice(5));
            if (!to || to === e.from) continue;
      const r = { from: e.from, to, type: e.type };
      push(e.from, r); push(to, r);
    }
    S.flagsByTarget = new Map();
    for (const f of w.flags) (S.flagsByTarget.get(f.target) || S.flagsByTarget.set(f.target, []).get(f.target)).push(f);
    S.chamberById = Object.fromEntries(w.places.chambers.map((c) => [c.id, c]));
    S.buildingById = Object.fromEntries(w.places.buildings.map((b) => [b.id, b]));
  }
  function ownerOf(p) {
    if (!p) return null;
    const q = String(p).replace(/^\.\//, '').toLowerCase();
    for (const e of S.ownerIndex) if (q === e.lower || q.startsWith(e.lower + '/')) return e.id;
    return null;
  }
  const nameOf = (id) => { const d = S.byId.get(id); if (d) return d.name; const c = S.chamberById && S.chamberById[id]; if (c) return c.name; const b = S.buildingById && S.buildingById[id]; return b ? b.name : id; };
  const buildingOfId = (id) => { const d = S.byId.get(id); if (d && d.building) return d.building; const c = S.chamberById && S.chamberById[id]; if (c) return c.building; return S.buildingById && S.buildingById[id] ? id : null; };

  // ---------- sprite helpers ----------
  function fitSprite(sp, w, h) { const t = sp.texture; const k = Math.min(w / t.width, h / t.height); sp.scale.set(k, k); return sp; }
  function label(text, size, colour, bold) { const t = new PIXI.Text({ text, style: { fontFamily: FONT, fontSize: size, fill: colour, fontWeight: bold ? '600' : '400' } }); t.resolution = 2; return t; }
  const cellTex = (alias, i) => S.atlas.cell(alias, i) || S.atlas.named('furniture', 'desk');
  // Compose a fixture from its pieces. Each piece is fitted to width tiles and bottom-aligned to the fixture footprint.
  function composeFixture(kind, f, variantSeed) {
    const c = new PIXI.Container();
    let pieces = ART[kind] || ART.shelf;
    if (kind === 'plant') pieces = [[...PLANTS[variantSeed % PLANTS.length], 0, 0, 1]];
    if (kind === 'arch' && variantSeed % 2) pieces = ART['arch-alt'];
    for (const [alias, cell, dx, dy, wt] of pieces) {
      const tex = S.atlas.cell(alias, cell); if (!tex) continue;
      const sp = new PIXI.Sprite(tex); sp.anchor.set(0.5, 1);
      const w = (wt || f.w) * T; const k = w / tex.width; sp.scale.set(k);
      // tall pieces are allowed to rise above the footprint; wide pieces cap at the footprint width
      sp.position.set((dx + (wt || f.w) / 2) * T, (dy + f.h) * T - 2);
      c.addChild(sp);
    }
    return c;
  }
  function shadowSprite(w, h, alpha) { const s = new PIXI.Sprite(S.atlas.named('fx', 'shadow-ellipse')); s.anchor.set(0.5); s.width = w; s.height = h; s.alpha = alpha == null ? 0.55 : alpha; s.tint = 0x000000; return s; }
  function plate(text, size, colour) {
    const t = label(text, size, colour, true);
    const w = Math.ceil(t.width) + 18, h = Math.ceil(t.height) + 10;
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().roundRect(0, 0, w, h, 5).fill({ color: COL.panel, alpha: 0.94 }).stroke({ width: 1, color: COL.line }));
    c.plateW = w; c.plateH = h;
    t.position.set(9, 5); c.addChild(t);
    return c;
  }
  function anim(key, name, speed) { const sp = new PIXI.AnimatedSprite(S.atlas.anim(key, name)); sp.animationSpeed = REDUCED ? 0 : (speed || 0.1); sp.play(); return sp; }

  // ---------- build the station ----------
  function buildStation() {
    for (const lyr of [spaceLayer, corridorLayer, roomLayer, buildingLayer, actorLayer, fxLayer, tintLayer]) lyr.removeChildren().forEach((c) => c.destroy({ children: true }));
    S.actors = new Map(); S.fixtures = new Map(); S.rooms = new Map(); S.buildings = new Map(); S.packets = []; S.particles = []; S.bubbles = [];
    const st = L.station(S.world); S.st = st;
    const atlas = S.atlas;
    // space: a faint star field and a hex ground pad under every building box
    const stars = new PIXI.TilingSprite({ texture: atlas.named('fx', 'stars'), width: st.bounds.w + 2000, height: st.bounds.h + 2000 }); stars.position.set(-1000, -1000); stars.tileScale.set(4); stars.alpha = 0.12; spaceLayer.addChild(stars); S.stars = stars;
    for (const b of st.buildings) {
      const pad = new PIXI.TilingSprite({ texture: atlas.named('tiles', 'ground-cobble'), width: b.w + T * 2, height: b.h + T * 2 }); pad.position.set(b.x - T, b.y - T); pad.tileScale.set(0.5); pad.alpha = 0.5; pad.tint = 0x4a4e6a; spaceLayer.addChild(pad);
    }
    // corridors: glass tubes along the grid, heat glow where data flows
    for (const c of st.corridors) {
      const horizontal = c.tw >= c.th;
      const tex = atlas.named('tiles', horizontal ? 'corr-h' : 'corr-v');
      const sp = new PIXI.TilingSprite({ texture: tex, width: c.tw * T, height: c.th * T }); sp.position.set(c.tx * T, c.ty * T); sp.tileScale.set(T / tex.width, T / tex.height); sp.alpha = 0.95;
      sp.tint = 0xB8C4E8;
      const sh = shadowSprite(c.tw * T + 10, c.th * T + 10, 0.35); sh.position.set(c.tx * T + c.tw * T / 2 + 4, c.ty * T + c.th * T / 2 + 6);
      const edge = new PIXI.Graphics(); edge.roundRect(c.tx * T + 1, c.ty * T + 1, c.tw * T - 2, c.th * T - 2, 3).stroke({ width: 6, color: COL.accent, alpha: 0.10 }); edge.roundRect(c.tx * T + 1, c.ty * T + 1, c.tw * T - 2, c.th * T - 2, 3).stroke({ width: 1.5, color: COL.accent, alpha: 0.55 });
      corridorLayer.addChild(sh, sp, edge);
    }
    const heat = new PIXI.Graphics(); const mx = Math.max(1, ...st.heat); let drawn = 0;
    for (let i = 0; i < st.heat.length; i++) if (st.heat[i] > 0) { const v = st.heat[i] / mx; heat.rect((i % st.cols) * T + 10, Math.floor(i / st.cols) * T + 10, T - 20, T - 20).fill({ color: COL.accent, alpha: 0.08 + 0.5 * Math.sqrt(v) }); drawn++; }
    corridorLayer.addChild(heat); S.heatG = heat;
    // junction and entrance door tiles
    for (const b of st.buildings) { const d = new PIXI.Sprite(atlas.named('tiles', 'corr-door')); fitSprite(d, T, T * 1.4); d.anchor.set(0.5, 1); d.position.set((b.entrance.tx + 0.5) * T, (b.entrance.ty + 1) * T); corridorLayer.addChild(d); }
    // rooms
    for (const r of st.rooms) buildRoom(r);
    // buildings: landmark facade, plate, roof lamp
    for (const b of st.buildings) buildLandmark(b);
    // agents
    for (const n of st.nodes) if (n.type === 'agent') buildActor(n);
    buildHero();
    S.dots = new PIXI.Graphics(); fxLayer.addChild(S.dots);
    S.dirty = true; S.lod = -1;
  }

  function buildRoom(r) {
    const atlas = S.atlas; const style = BSTYLE[S.buildingById[r.building].style] || BSTYLE.core; const bcol = hex(S.buildingById[r.building].colour);
    const c = new PIXI.Container(); c.position.set(r.x, r.y); roomLayer.addChild(c);
    const inner = new PIXI.Container(), fixt = new PIXI.Container(), over = new PIXI.Container(), labels = new PIXI.Container();
    // drop shadow of the module in space
    const sh = new PIXI.Graphics().roundRect(10, 14, r.w, r.h, 6).fill({ color: 0x000000, alpha: 0.6 }); c.addChild(sh);
    // floor tiles, tinted to the building temperature
    const ftex = atlas.named('tiles', style.floor);
    const floor = new PIXI.TilingSprite({ texture: ftex, width: r.iw * T, height: r.ih * T }); floor.position.set(T, T); floor.tileScale.set(T / ftex.width); floor.tint = style.tint; floor.alpha = 0.95; inner.addChild(floor);
    if (r.kind === 'reception') { const rug = new PIXI.Sprite(atlas.cell('props', 7) || PIXI.Texture.WHITE); rug.anchor.set(0.5); fitSprite(rug, T * 3, T * 2); rug.alpha = 0.6; rug.position.set(T + r.iw * T / 2, T + r.ih * T * 0.6); inner.addChild(rug); }
    // faint grid over the floor so the tiles read from far out
    const grid = new PIXI.Graphics(); for (let x = 0; x <= r.iw; x++) grid.moveTo(T + x * T, T).lineTo(T + x * T, T + r.ih * T); for (let y = 0; y <= r.ih; y++) grid.moveTo(T, T + y * T).lineTo(T + r.iw * T, T + y * T); grid.stroke({ width: 1, color: bcol, alpha: 0.10 }); inner.addChild(grid);
    // wall shadow band along the top and left (light comes from the lamps, walls throw soft shade)
    const wsh = new PIXI.Graphics(); wsh.rect(T, T, r.iw * T, 10).fill({ color: 0x000000, alpha: 0.35 }); wsh.rect(T, T, 8, r.ih * T).fill({ color: 0x000000, alpha: 0.22 }); inner.addChild(wsh);
    // light pools under the ceiling lamps
    for (const l of r.lamps) { const p = new PIXI.Sprite(atlas.named('fx', 'pool-0')); p.anchor.set(0.5); fitSprite(p, T * 4.5, T * 4.5); p.alpha = 0.2; p.tint = style.pool; p.position.set((l.tx - r.tx + 0.5) * T, (l.ty - r.ty + 0.5) * T); inner.addChild(p); }
    // wall ring: the module outline, thick and glowing in the building colour
    const wall = new PIXI.Graphics();
    const dx = (r.door.tx - r.tx) * T; // door gap in the bottom wall
    wall.rect(0, 0, r.w, T).fill(0x15181C); wall.rect(0, r.h - T, dx - 4, T).fill(0x15181C); wall.rect(dx + T + 4, r.h - T, r.w - dx - T - 4, T).fill(0x15181C); wall.rect(0, 0, T, r.h).fill(0x15181C); wall.rect(r.w - T, 0, T, r.h).fill(0x15181C);
    const wtex = atlas.named('tiles', 'wall');
    const topWall = new PIXI.TilingSprite({ texture: wtex, width: r.w, height: T }); topWall.tileScale.set(T / wtex.width); topWall.alpha = 0.9;
    // the module outline: a bright neon stroke with two soft glow bands outside it
    const ring = new PIXI.Graphics();
    ring.roundRect(-4, -4, r.w + 8, r.h + 8, 10).stroke({ width: 14, color: bcol, alpha: 0.07 });
    ring.roundRect(-1, -1, r.w + 2, r.h + 2, 8).stroke({ width: 6, color: bcol, alpha: 0.18 });
    ring.roundRect(1, 1, r.w - 2, r.h - 2, 7).stroke({ width: 2, color: bcol, alpha: 1 });
    ring.rect(dx - 6, r.h - T - 1, 4, T + 2).fill({ color: bcol, alpha: 0.9 }); ring.rect(dx + T + 2, r.h - T - 1, 4, T + 2).fill({ color: bcol, alpha: 0.9 }); // lit door frame
    ring.rect(dx - 2, r.h - 2, T + 4, 4).fill({ color: COL.bg, alpha: 1 }); // the gap itself
    c.doorRing = ring;
    const levelCol = r.level === 'high' ? COL.red : r.level === 'medium' ? COL.amber : null;
    if (levelCol) wall.roundRect(0, 0, r.w, r.h, 5).stroke({ width: 1.5, color: levelCol, alpha: 0.9 });
    // door in the bottom wall
    const door = new PIXI.Sprite(atlas.named('tiles', 'door-lit')); door.anchor.set(0.5, 1); fitSprite(door, T, T); door.position.set((r.door.tx - r.tx + 0.5) * T, r.h); door.tint = 0xDDDDDD; door.alpha = 0.9;
    c.addChild(inner, topWall, wall, c.doorRing, door, fixt, over, labels);
    // fixtures, sorted by y so lower pieces draw over upper ones
    const fx = r.fixtures.map((f, i) => ({ f, i })).sort((a, b) => (a.f.ty + a.f.h) - (b.f.ty + b.f.h) || a.f.tx - b.f.tx);
    for (const { f, i } of fx) {
      const data = f.node ? (S.byId.get(f.node) || {}) : null;
      const kind = f.kind;
      const g = composeFixture(kind, f, hash(f.name + i));
      g.position.set((f.tx - r.tx) * T, (f.ty - r.ty) * T);
      // floor shadow under every piece
      const s = shadowSprite(f.w * T * 0.95, 9, f.wall ? 0.35 : 0.55); s.position.set(f.w * T / 2, f.h * T - 1); g.addChildAt(s, 0);
      g.tint = 0xFFFFFF; applyFixtureState(g, f, data);
      fixt.addChild(g);
      if (f.files) {
        const lb = label(`${f.files.length} files`, 9, COL.muted); lb.anchor.set(0.5, 0); lb.position.set(g.x + f.w * T / 2, g.y + f.h * T + 1); labels.addChild(lb);
        const badge = plate(String(f.files.length), 9, COL.accent); badge.scale.set(0.6); badge.position.set(g.x + f.w * T - badge.plateW * 0.6 + 4, g.y - 14); over.addChild(badge);
        const rec = { lay: f, room: r, g, label: lb, dot: null, pulseAt: 0, baseTint: 0xFFFFFF, kind: 'archive', files: f.files };
        for (const id of f.files) S.fixtures.set(id, rec);
        S.fixtures.set('archive:' + r.id + ':' + i, rec);
        continue;
      }
      if (f.node) {
        const shelfText = f.type === 'shelf' ? `${f.name.length > 21 ? f.name.slice(0, 19) + '..' : f.name}\n${data.count === 1 ? '1 skill' : (data.count || 0) + ' skills'}` : null;
        const lb = label(shelfText || (f.name.length > 20 ? f.name.slice(0, 19) + '..' : f.name), shelfText ? 11 : 8, shelfText ? COL.text : COL.muted, !!shelfText); if (shelfText) lb.style.align = 'center'; lb.anchor.set(0.5, 0); lb.position.set(g.x + f.w * T / 2, g.y + f.h * T + 1); lb.wallLabel = f.wall; lb.doorstep = !!shelfText; labels.addChild(lb);
        const dot = statusDot(f, data); if (dot) { dot.position.set(g.x + f.w * T - 3, g.y - 2); over.addChild(dot); }
        S.fixtures.set(f.node, { lay: f, room: r, g, label: lb, dot, pulseAt: 0, baseTint: 0xFFFFFF, kind });
        // failing workflow: red lamp and smoke over the machine, dark tint
        if (f.type === 'workflow' && data && data.verdict === 'FAILING') { const lamp = anim('fx', 'red-lamp', 0.08); lamp.anchor.set(0.5, 1); fitSprite(lamp, 10, 14); lamp.position.set(g.x + f.w * T - 6, g.y + 4); over.addChild(lamp); const smoke = anim('fx', 'smoke', 0.05); smoke.anchor.set(0.5, 1); fitSprite(smoke, 22, 22); smoke.alpha = 0.7; smoke.position.set(g.x + f.w * T / 2, g.y - 2); over.addChild(smoke); }
        if (f.type === 'workflow' && data && data.verdict === 'OK' && !REDUCED) { const crate = new PIXI.Sprite(atlas.cell('bay', 13) || PIXI.Texture.WHITE); crate.anchor.set(0.5, 1); fitSprite(crate, 10, 10); crate.position.set(g.x + 6, g.y + f.h * T - 6); over.addChild(crate); S.fixtures.get(f.node).crate = { sp: crate, x0: g.x + 6, x1: g.x + f.w * T - 6, y: g.y + f.h * T - 6, t: Math.random() }; }
      }
    }
    // title plate on the top wall and the room lamp with its health colour
    const title = plate(r.name, 12, COL.text, true); title.position.set(6, -title.plateH / 2 + 4); title.scale.set(0.8); labels.addChild(title);
    const sub = label(`${r.items.length} item${r.items.length === 1 ? '' : 's'}`, 8, COL.muted); sub.position.set(10, r.h - T + 10); labels.addChild(sub);
    const lamp = new PIXI.Sprite(atlas.named('fx', 'lamp-dot')); lamp.anchor.set(0.5); fitSprite(lamp, 9, 9); lamp.baseScale = lamp.scale.x; lamp.tint = L.lampColour(r.level); lamp.position.set(r.w - 14, 14); over.addChild(lamp);
    const lampGlow = new PIXI.Sprite(atlas.named('fx', 'glow')); lampGlow.anchor.set(0.5); fitSprite(lampGlow, 26, 26); lampGlow.tint = L.lampColour(r.level); lampGlow.alpha = 0.5; lampGlow.position.set(r.w - 14, 14); over.addChildAt(lampGlow, 0);
    // high flag rooms: failing lights at the corners and a cracked panel on the wall
    if (r.level === 'high') { for (const x of [T + 6, r.w - T - 6]) { const rl = anim('fx', 'red-lamp', 0.07); rl.anchor.set(0.5, 1); fitSprite(rl, 12, 16); rl.position.set(x, T + 14); over.addChild(rl); } const crack = new PIXI.Sprite(atlas.named('fx', 'crack-panel')); crack.anchor.set(0.5); fitSprite(crack, 22, 22); crack.position.set(r.w / 2, T / 2 + 2); crack.alpha = 0.8; over.addChild(crack); }
    const sel = new PIXI.Graphics().roundRect(-5, -5, r.w + 10, r.h + 10, 6).stroke({ width: 3, color: COL.blue }); sel.visible = false; over.addChild(sel);
    const hov = new PIXI.Graphics().roundRect(-3, -3, r.w + 6, r.h + 6, 5).stroke({ width: 2, color: 0xFFFFFF, alpha: 0.5 }); hov.visible = false; over.addChild(hov);
    S.rooms.set(r.id, { lay: r, c, labels, fixt, over, lamp, lampGlow, sel, hov, title, pulseAt: 0, bounds: { x: r.x - 20, y: r.y - 30, w: r.w + 40, h: r.h + 50 } });
  }
  function applyFixtureState(g, f, d) {
    if (!d) return;
    if (f.type === 'workflow') g.tint = !d.verdict || d.verdict === 'OK' ? 0xFFFFFF : d.verdict === 'FAILING' ? 0x8A5A5A : d.verdict === 'INACTIVE' ? 0x666666 : 0xD8C09A;
    else if (f.type === 'memory' && d.cap) g.tint = d.lines > d.cap ? 0xFF9A9A : d.lines > d.cap * 0.9 ? 0xFFD79A : 0xFFFFFF;
  }
  function statusDot(f, d) {
    let col = null; if (!d) return null;
    if (f.type === 'workflow' && d.verdict === 'FAILING') col = COL.red;
    if (f.type === 'hook' && d.scriptExists === false) col = COL.red;
    if (!col) return null;
    const s = new PIXI.Sprite(S.atlas.named('fx', 'lamp-dot')); fitSprite(s, 5, 5); s.tint = col; return s;
  }
  function buildLandmark(b) {
    const atlas = S.atlas; const c = new PIXI.Container(); buildingLayer.addChild(c);
    const lm = b.landmark; const cx = (lm.tx + lm.tw / 2) * T, by = (lm.ty + lm.th) * T;
    const sh = shadowSprite(lm.tw * T * 0.95, 26, 0.6); sh.position.set(cx + 10, by - 4); c.addChild(sh);
    const facade = new PIXI.Sprite(atlas.named('buildings', b.style)); facade.anchor.set(0.5, 1); fitSprite(facade, lm.tw * T, lm.th * T); facade.position.set(cx, by); c.addChild(facade);
    // entrance light cone spilling onto the ground and a lit name plate
    const cone = new PIXI.Sprite(atlas.named('fx', 'pool-1')); cone.anchor.set(0.5); fitSprite(cone, T * 4, T * 3); cone.alpha = 0.35; cone.tint = hex(b.colour); cone.position.set((b.entrance.tx + 0.5) * T, (b.entrance.ty + 1.5) * T); c.addChild(cone);
    const pl = plate(b.name, 13, COL.text); pl.position.set(Math.round(cx - pl.plateW / 2), by + 8); c.addChild(pl);
    const sub = label(`${b.nodes} item${b.nodes === 1 ? '' : 's'}`, 9, COL.muted); sub.position.set(Math.round(cx - sub.width / 2), pl.y + pl.plateH + 2); c.addChild(sub);
    const lampGlow = new PIXI.Sprite(atlas.named('fx', 'glow')); lampGlow.anchor.set(0.5); fitSprite(lampGlow, 40, 40); lampGlow.tint = L.lampColour(b.level); lampGlow.alpha = 0.7; lampGlow.position.set(cx, by - facade.height + 6); c.addChild(lampGlow);
    const lamp = new PIXI.Sprite(atlas.named('fx', 'lamp-dot')); lamp.anchor.set(0.5); fitSprite(lamp, 10, 10); lamp.tint = L.lampColour(b.level); lamp.position.copyFrom(lampGlow.position); c.addChild(lamp);
    // cluster outline, visible from far out so the building reads as one object
    const outline = new PIXI.Graphics().roundRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16, 10).stroke({ width: 2, color: hex(b.colour), alpha: 0.18 }); buildingLayer.addChildAt(outline, 0);
    const sel = new PIXI.Graphics().roundRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20, 10).stroke({ width: 3, color: hex(b.colour), alpha: 0.9 }); sel.visible = false; c.addChild(sel);
    S.buildings.set(b.id, { lay: b, c, lamp, lampGlow, sel, plate: pl, sub, outline, pulseAt: 0, baseScale: lampGlow.scale.x });
  }

  // ---------- actors ----------
  function sheetFor(agentId, building) {
    const m = S.atlas.manifest; return (m.heroes || {})[agentId] || m.workers[S.buildingById[building].style] || 'worker-grey';
  }
  const tileC = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 1) * T - 3 });
  function buildActor(n) {
    const lay = S.st.agents[n.id];
    const key = sheetFor(n.id, n.building);
    const sp = new PIXI.AnimatedSprite(S.atlas.anim(key, 'work')); sp.anchor.set(0.5, 1); fitSprite(sp, 40, 52); sp.baseScale = sp.scale.x;
    const p = tileC(lay.seat.tx, lay.seat.ty); sp.position.set(p.x, p.y);
    const shadow = shadowSprite(22, 8, 0.5); shadow.position.set(p.x, p.y);
    const halo = new PIXI.Sprite(S.atlas.named('fx', 'glow')); halo.anchor.set(0.5); fitSprite(halo, 52, 52); halo.tint = hex(S.buildingById[n.building].colour); halo.alpha = 0.22; halo.position.set(p.x, p.y - 20);
    const tag = plate(n.name, 8, COL.text, true); tag.scale.set(0.6); tag.visible = false; tag.position.set(p.x - tag.plateW * 0.3, p.y - 46);
    const glow = new PIXI.Sprite(S.atlas.named('fx', 'glow')); glow.anchor.set(0.5); fitSprite(glow, 46, 46); glow.tint = COL.accent; glow.visible = false; glow.position.set(p.x, p.y - 16);
    const carry = new PIXI.Sprite(S.atlas.named('ui', 'icon-envelope')); carry.anchor.set(0.5, 1); fitSprite(carry, 8, 8); carry.visible = false;
    fxLayer.addChild(glow); actorLayer.addChild(halo, shadow, sp, carry, tag);
    const actor = { id: n.id, key, sp, shadow, halo, tag, glow, carry, home: { ...lay.seat }, tile: { ...lay.seat }, pos: { x: p.x, y: p.y }, room: lay.room, building: n.building, state: 'work', dim: false, path: null, pathI: 0, speed: rnd(55, 95), until: 0, nextPlan: performance.now() + rnd(1000, 12000), anim: null, facing: 'down', carrying: false, plan: null, eventWork: false, lastDir: null, active: true };
    S.actors.set(n.id, actor);
    setActorAnim(actor, 'work');
  }
  // A named Claudify presence: the memory cube wanders Claudify HQ as a mascot.
  function buildHero() {
    const key = 'hero-cube';
    const b = S.st.buildings.find((x) => x.id === 'b:claudify'); if (!b || !b.rooms.length) return;
    const r = b.rooms[0]; const spot = r.fixtures.flatMap((f) => f.spots)[0]; if (!spot) return;
    const sp = new PIXI.AnimatedSprite(S.atlas.anim(key, 'hop')); sp.anchor.set(0.5, 1); fitSprite(sp, 30, 34); sp.baseScale = sp.scale.x; sp.animationSpeed = REDUCED ? 0 : 0.06; sp.play();
    const p = tileC(spot.tx, spot.ty); sp.position.set(p.x, p.y);
    const shadow = shadowSprite(20, 7, 0.5); shadow.position.set(p.x, p.y);
    const tag = plate('claudify', 8, 0x9FB4FF, true); tag.scale.set(0.6); tag.visible = false;
    const glow = new PIXI.Sprite(S.atlas.named('fx', 'glow')); glow.anchor.set(0.5); fitSprite(glow, 40, 40); glow.tint = COL.cyan; glow.alpha = 0.35; glow.position.set(p.x, p.y - 14);
    fxLayer.addChild(glow); actorLayer.addChild(shadow, sp, tag);
    const actor = { id: 'claudify', hero: true, key, sp, shadow, tag, glow, carry: null, home: { ...spot }, tile: { ...spot }, pos: { x: p.x, y: p.y }, room: r.id, building: b.id, state: 'idle', dim: false, path: null, pathI: 0, speed: 60, until: 0, nextPlan: performance.now() + 3000, facing: 'down', active: true };
    S.actors.set('claudify', actor);
  }
  function setActorAnim(a, name, speed) {
    if (a.anim === name) return; a.anim = name;
    const key = a.key; const has = S.atlas.hasAnim(key, name) ? name : 'idle';
    a.sp.textures = S.atlas.anim(key, has);
    a.sp.scale.x = a.sp.baseScale * (S.atlas.mirrored(key, has) ? -1 : 1);
    a.sp.animationSpeed = REDUCED ? 0 : (speed != null ? speed : name.startsWith('walk') ? 0.14 : name === 'work' ? 0.09 : 0.05);
    if (name === 'idle' || name === 'idle-side') a.sp.gotoAndStop(0); else a.sp.play();
  }
  const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  function placeActor(a) { a.sp.position.set(a.pos.x, a.pos.y); a.shadow.position.set(a.pos.x, a.pos.y); if (a.halo) a.halo.position.set(a.pos.x, a.pos.y - 20); if (a.carry) a.carry.position.set(a.pos.x + 9, a.pos.y - 16); a.tag.position.set(a.pos.x - a.tag.plateW * 0.3, a.pos.y - 48); if (a.glow) a.glow.position.set(a.pos.x, a.pos.y - 16); }

  // Pathfind an actor to a tile and run `then` on arrival. Reduced motion teleports.
  function walkTo(a, tile, then) {
    const st = S.st; let goal = tile;
    if (!st.walk[goal.ty * st.cols + goal.tx]) goal = L.nearestWalkable(st.walk, st.cols, st.rows, goal.tx, goal.ty) || goal;
    if (REDUCED) { a.tile = { ...goal }; a.pos = tileC(goal.tx, goal.ty); placeActor(a); if (then) then(); return true; }
    const path = L.bfs(st.walk, st.cols, st.rows, a.tile, goal);
    if (!path) { if (then) then(); return false; }
    a.path = path; a.pathI = 1; a.then = then; a.state = 'walk';
    if (path.length === 1) { a.path = null; a.state = 'idle'; if (then) then(); }
    return true;
  }
  function startWork(a, ms, glow) { a.state = 'work'; a.until = S.now + ms; a.eventWork = !!glow; setActorAnim(a, 'work'); if (a.glow) a.glow.visible = !!glow; }
  function settle(a) { // back at home: work quietly until the next plan
    a.state = 'work'; a.eventWork = false; if (a.glow) a.glow.visible = false;
    setActorAnim(a, 'work'); if (a.carrying) dropCarry(a);
    a.nextPlan = S.now + rnd(2500, 9000);
  }
  function dropCarry(a) { a.carrying = false; if (a.carry) a.carry.visible = false; }
  function goHome(a) { walkTo(a, a.home, () => settle(a)); }
  // Errands: wander the room, read a shelf, coffee, visit another room, or another building.
  function planErrand(a) {
    const st = S.st; const room = st.roomById[a.room]; if (!room) return;
    const roll = Math.random();
    const spotsOf = (r, filter) => r.fixtures.filter((f) => (!filter || filter(f)) && f.spots.length).flatMap((f) => f.spots.map((s) => ({ s, f })));
    let target = null, kind = 'wander';
    if (roll < 0.42) { const sp = spotsOf(room, (f) => !f.agents || !f.agents.length); if (sp.length) target = pick(sp); }
    else if (roll < 0.62) { const sp = spotsOf(room, (f) => f.wall && f.node); if (sp.length) { target = pick(sp); kind = 'read'; } }
    else if (roll < 0.74) { const b = st.buildings.find((x) => x.id === a.building); const social = b.rooms.flatMap((r) => spotsOf(r, (f) => L.FIXTURES[f.kind] && L.FIXTURES[f.kind].social)); if (social.length) { target = pick(social); kind = 'coffee'; } }
    else if (roll < 0.9) { const b = st.buildings.find((x) => x.id === a.building); const other = b.rooms.filter((r) => r.id !== a.room); if (other.length) { const sp = spotsOf(pick(other)); if (sp.length) target = pick(sp); kind = 'visit'; } }
    else { const b = pick(st.buildings.filter((x) => x.id !== a.building)); const sp = spotsOf(pick(b.rooms)); if (sp.length) target = pick(sp); kind = 'travel'; }
    if (!target) { a.nextPlan = S.now + 5000; return; }
    a.plan = kind;
    walkTo(a, target.s, () => {
      if (kind === 'read') { startWork(a, rnd(1500, 2600), false); a.after = () => { pickUp(a); goHome(a); }; }
      else { a.state = 'idle'; setActorAnim(a, Math.random() < 0.5 ? 'idle' : 'idle-side'); a.until = S.now + (kind === 'coffee' ? rnd(5000, 9000) : rnd(2500, 6000)); a.after = () => goHome(a); tryChat(a); }
    });
  }
  function pickUp(a) { a.carrying = true; if (a.carry) { a.carry.visible = true; } }
  // Two inhabitants meeting stop and face each other for a moment.
  function tryChat(a) {
    for (const o of S.actors.values()) {
      if (o === a || o.hero || o.state !== 'idle' && o.state !== 'work') continue;
      if (Math.abs(o.pos.x - a.pos.x) < 40 && Math.abs(o.pos.y - a.pos.y) < 30 && Math.random() < 0.7) {
        const left = o.pos.x < a.pos.x;
        setActorAnim(a, 'idle-side'); a.sp.scale.x = a.sp.baseScale * (left ? 1 : -1) * (S.atlas.mirrored(a.key, 'idle-side') ? -1 : 1);
        if (o.state === 'idle') { setActorAnim(o, 'idle-side'); o.sp.scale.x = o.sp.baseScale * (left ? -1 : 1) * (S.atlas.mirrored(o.key, 'idle-side') ? -1 : 1); o.until = Math.max(o.until, S.now + 2500); }
        a.until = S.now + rnd(2500, 4000); a.state = 'chat'; bubble(a); if (o.state === 'idle') bubble(o);
        return;
      }
    }
  }
  function bubble(a) { if (REDUCED) return; const g = new PIXI.Graphics(); g.rect(0, 0, 2, 2).fill(COL.text); g.rect(4, 0, 2, 2).fill(COL.text); g.rect(8, 0, 2, 2).fill(COL.text); g.position.set(a.pos.x - 5, a.pos.y - 44); fxLayer.addChild(g); S.bubbles.push({ g, until: S.now + 1800, a }); }

  function updateActors(dt) {
    const st = S.st; const z = S.cam.z; const vw = S.w / z, vh = S.h / z; const vx = S.cam.x - vw / 2 - 300, vy = S.cam.y - vh / 2 - 300, vww = vw + 600, vhh = vh + 600;
    const tagsOn = z >= 1.3;
    for (const a of S.actors.values()) {
      const onScreen = a.pos.x > vx && a.pos.x < vx + vww && a.pos.y > vy && a.pos.y < vy + vhh;
      a.active = onScreen;
      a.sp.visible = onScreen; a.shadow.visible = onScreen; if (a.halo) a.halo.visible = onScreen; if (a.glow) a.glow.visible = onScreen && a.eventWork; a.tag.visible = onScreen && (tagsOn || (S.hover && S.hover.id === a.id));
      if (a.carry) a.carry.visible = onScreen && a.carrying;
      if (a.state === 'walk' && a.path) {
        const t = a.path[a.pathI]; const tp = tileC(t.tx, t.ty); const dx = tp.x - a.pos.x, dy = tp.y - a.pos.y; const dist = Math.hypot(dx, dy); const step = a.speed * dt * (a.carrying ? 0.85 : 1);
        const dir = dirOf(dx, dy); if (dir !== a.lastDir) { a.lastDir = dir; setActorAnim(a, 'walk-' + dir); }
        if (dist <= step) { a.pos = tp; a.tile = { tx: t.tx, ty: t.ty }; a.pathI++; if (a.pathI >= a.path.length) { a.path = null; a.lastDir = null; a.state = 'idle'; setActorAnim(a, a.hero ? 'hop' : 'idle'); const f = a.then; a.then = null; if (f) f(); } }
        else { a.pos.x += dx / dist * step; a.pos.y += dy / dist * step; }
        if (onScreen || a.hero) placeActor(a); else placeActor(a);
        continue;
      }
      if (a.state === 'work') {
        if (a.eventWork && onScreen && !REDUCED && S.frame % 6 === 0) spawnTyping(a);
        if (a.until && S.now > a.until) { a.until = 0; if (a.glow) a.glow.visible = false; a.eventWork = false; const f = a.after; a.after = null; if (f) f(); else settle(a); }
        else if (!a.until && !REDUCED && S.now > a.nextPlan && !a.hero) planErrand(a);
        continue;
      }
      if (a.state === 'idle' || a.state === 'chat') {
        if (a.until && S.now > a.until) { a.until = 0; const f = a.after; a.after = null; if (f) f(); else if (!a.hero) goHome(a); }
        else if (a.hero && !a.until && !REDUCED && S.now > a.nextPlan) heroPlan(a);
      }
    }
  }
  function heroPlan(a) {
    const b = S.st.buildings.find((x) => x.id === a.building); const r = pick(b.rooms); const spots = r.fixtures.flatMap((f) => f.spots); if (!spots.length) { a.nextPlan = S.now + 4000; return; }
    walkTo(a, pick(spots), () => { a.room = r.id; a.until = S.now + rnd(3000, 8000); a.after = () => { a.until = 0; a.nextPlan = S.now + rnd(1000, 5000); }; });
  }
  function spawnTyping(a) {
    if (S.particles.length > 240) return;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) { const g = new PIXI.Graphics().rect(0, 0, 2, 2).fill(COL.accent); g.position.set(a.pos.x + rnd(-6, 10), a.pos.y - 22 + rnd(-3, 3)); fxLayer.addChild(g); S.particles.push({ g, vy: -rnd(14, 26), born: S.now, life: rnd(500, 800) }); }
  }
  function updateParticles(dt) {
    if (S.particles.length) { const keep = []; for (const p of S.particles) { const t = (S.now - p.born) / p.life; if (t >= 1) { p.g.destroy(); continue; } p.g.y += p.vy * dt; p.g.alpha = 1 - t; keep.push(p); } S.particles = keep; }
    if (S.bubbles.length) { const keep = []; for (const b of S.bubbles) { if (S.now > b.until) { b.g.destroy(); continue; } b.g.position.set(b.a.pos.x - 5, b.a.pos.y - 44 - Math.sin(S.now / 200) * 1.5); keep.push(b); } S.bubbles = keep; }
  }

  // ---------- acting out events (live and replay) ----------
  function actOut(ev, opts = {}) {
    const nodeId = ev.node || ownerOf(ev.path);
    tick({ t: hhmm(new Date(ev.t || Date.now())), p: ev.path, k: ev.op || ev.kind || '' });
    if (!nodeId) return;
    const bId = buildingOfId(nodeId); const data = S.byId.get(nodeId);
    if (S.mode === 'campus') { if (bId) S.campus.pulse(bId); return; }
    const bv = bId && S.buildings.get(bId); if (bv) bv.pulseAt = S.now;
    const chId = (data && data.chamber) || (S.chamberById[nodeId] ? nodeId : null); const rv = chId && S.rooms.get(chId); if (rv) rv.pulseAt = S.now;
    const f = S.fixtures.get(nodeId); if (f) { f.pulseAt = S.now; ringAt(f.g.x + f.room.x + f.lay.w * T / 2, f.g.y + f.room.y + f.lay.h * T / 2); }
    const actor = S.actors.get(nodeId);
    if (actor && !actor.hero) { actor.dim = false; actor.sp.alpha = 1; if (actor.state === 'walk') { actor.then = () => { startWork(actor, 5000 + Math.random() * 2000, true); actor.after = () => goHome(actor); }; } else if (actor.tile.tx === actor.home.tx && actor.tile.ty === actor.home.ty) { startWork(actor, 5000 + Math.random() * 2000, true); actor.after = null; } else { walkTo(actor, actor.home, () => { startWork(actor, 5000, true); actor.after = () => settle(actor); }); } }
    // Readers travel to the shelf, read, and carry the file back.
    if (f) {
      const readers = (S.edgeIndex.get(nodeId) || []).filter((e) => e.to === nodeId || e.type === 'reads' || e.type === 'loads').map((e) => (e.from === nodeId ? e.to : e.from));
      let sent = 0; const spot = f.lay.spots[0] || { tx: f.lay.tx, ty: f.lay.ty + f.lay.h };
      for (const r of new Set(readers)) { const a = S.actors.get(r); if (a && sent < 3 && a.state !== 'walk' && !a.eventWork && !a.dim) { a.plan = 'event'; walkTo(a, spot, () => { startWork(a, 2500 + Math.random() * 2000, true); a.after = () => { pickUp(a); goHome(a); }; }); sent++; } }
      if (!sent && !actor && opts.nudge !== false) { let best = null, bd = Infinity; for (const a of S.actors.values()) if (a.room === f.room.id && a.state === 'work' && !a.eventWork && !a.hero) { const d = Math.abs(a.home.tx - f.lay.tx) + Math.abs(a.home.ty - f.lay.ty); if (d < bd) { bd = d; best = a; } } if (best) walkTo(best, spot, () => { startWork(best, 2500, true); best.after = () => { pickUp(best); goHome(best); }; }); }
    }
    // Packet drones along the corridors to buildings that read this node.
    const partners = (S.edgeIndex.get(nodeId) || []).map((e) => (e.from === nodeId ? e.to : e.from)).map(buildingOfId).filter((b) => b && b !== bId);
    for (const pb of new Set(partners)) launchPacket(bId, pb);
  }
  function ringAt(x, y) { if (REDUCED) return; const r = anim('fx', 'ring', 0.18); r.loop = false; r.anchor.set(0.5); fitSprite(r, 36, 36); r.position.set(x, y); r.onComplete = () => r.destroy(); fxLayer.addChild(r); }
  function launchPacket(fromB, toB) {
    if (!S.st || REDUCED || S.packets.length > 60) return;
    const flow = S.st.flows.find((r) => (r.a === fromB && r.b === toB) || (r.a === toB && r.b === fromB)); if (!flow) return;
    const pts = flow.a === fromB ? flow.path : flow.path.slice().reverse();
    const sp = new PIXI.Sprite(S.atlas.named('fx', 'packet')); sp.anchor.set(0.5); fitSprite(sp, 14, 14); sp.tint = COL.accent;
    const sh = shadowSprite(10, 4, 0.5);
    const p0 = tileC(pts[0].tx, pts[0].ty); sp.position.set(p0.x, p0.y - 14); sh.position.set(p0.x, p0.y);
    fxLayer.addChild(sh, sp); S.packets.push({ sp, sh, pts, i: 1, speed: 300, to: toB });
  }
  function updatePackets(dt) {
    const keep = [];
    for (const p of S.packets) {
      const t = tileC(p.pts[p.i].tx, p.pts[p.i].ty); const dx = t.x - p.sh.x, dy = t.y - p.sh.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      if (d <= step) { p.sh.position.set(t.x, t.y); p.i++; if (p.i >= p.pts.length) { p.sp.destroy(); p.sh.destroy(); const bv = S.buildings.get(p.to); if (bv) bv.pulseAt = S.now; continue; } }
      else p.sh.position.set(p.sh.x + dx / d * step, p.sh.y + dy / d * step);
      p.sp.position.set(p.sh.x, p.sh.y - 14 + Math.sin(S.now / 120) * 2);
      keep.push(p);
    }
    S.packets = keep;
  }
  function updatePulses() {
    for (const f of S.fixtures.values()) {
      if (f.pulseAt && S.now - f.pulseAt < 1200) { f.g.alpha = 0.75 + 0.25 * Math.abs(Math.sin(S.now / 80)); f.flashing = true; } else if (f.flashing) { f.g.alpha = 1; f.flashing = false; }
      if (f.crate && !REDUCED && f.g.visible) { f.crate.t = (f.crate.t + 0.004) % 1; f.crate.sp.x = f.crate.x0 + (f.crate.x1 - f.crate.x0) * f.crate.t; }
    }
    for (const r of S.rooms.values()) { const p = r.pulseAt && S.now - r.pulseAt < 1400 ? 1 - (S.now - r.pulseAt) / 1400 : 0; r.lamp.scale.set(r.lamp.baseScale * (1 + p * 1.2)); r.lampGlow.alpha = 0.35 + 0.15 * Math.sin(S.now / 700 + r.lay.tx) + p * 0.5; }
    for (const b of S.buildings.values()) { const p = b.pulseAt && S.now - b.pulseAt < 1400 ? 1 - (S.now - b.pulseAt) / 1400 : 0; b.lampGlow.alpha = 0.55 + 0.25 * Math.sin(S.now / 600) + p * 0.6; b.lampGlow.scale.set(b.baseScale * (1 + p * 1.1)); }
  }
  // ---------- camera, views, level of detail ----------
  function applyCamera() {
    const z = S.cam.z; S.w = app.screen.width; S.h = app.screen.height;
    worldC.scale.set(z); worldC.position.set(Math.round(S.w / 2 - S.cam.x * z), Math.round(S.h / 2 - S.cam.y * z));
  }
  function tweenCamera(dt) {
    if (!S.target) return;
    const k = REDUCED ? 1 : 1 - Math.pow(0.002, dt); const tz = S.target.z || S.cam.z;
    S.cam.x += (S.target.x - S.cam.x) * k; S.cam.y += (S.target.y - S.cam.y) * k;
    S.cam.z = Math.exp(Math.log(S.cam.z) + (Math.log(tz) - Math.log(S.cam.z)) * k);
    if (Math.abs(S.target.x - S.cam.x) < 0.3 && Math.abs(S.target.y - S.cam.y) < 0.3 && Math.abs(tz - S.cam.z) < 0.002) {
      S.cam.x = S.target.x; S.cam.y = S.target.y; S.cam.z = tz; S.target = null;
      const f = S.onTargetDone; S.onTargetDone = null; if (f) f();
    }
    S.dirty = true;
  }
  // The open side panel covers part of the stage, so frames fit into what is left.
  const panelW = () => (document.body.classList.contains('panel') && S.w >= 760 ? 380 : 0);
  const panelH = () => (document.body.classList.contains('panel') && S.w < 760 ? S.h * 0.62 : 0);
  function fitRect(x, y, w, h, margin, instant) {
    const pw = panelW(), ph = panelH();
    const z = clamp(Math.min((S.w - pw) / (w + margin * 2), (S.h - ph) / (h + margin * 2)), ZMIN, ZMAX);
    S.target = { x: x + w / 2 + pw / 2 / z, y: y + h / 2 + ph / 2 / z, z };
    if (REDUCED || instant) { S.cam.x = S.target.x; S.cam.y = S.target.y; S.cam.z = z; S.target = null; const f = S.onTargetDone; S.onTargetDone = null; if (f) f(); }
  }
  function fitCurrent(instant) {
    if (S.view.level === 'room' && S.rooms.get(S.view.room)) { const r = S.rooms.get(S.view.room).lay; fitRect(r.x, r.y, r.w, r.h, 68, instant); }
    else if (S.view.level === 'building' && S.buildings.get(S.view.building)) { const b = S.buildings.get(S.view.building).lay; fitRect(b.x, b.y, b.w, b.h, 60, instant); }
  }
  function setMode(mode) {
    S.mode = mode; const inside = mode === 'inside'; S.w = app.screen.width; S.h = app.screen.height;
    worldC.visible = inside; S.campus.C.visible = !inside;
    document.body.classList.toggle('inside', inside); document.body.classList.toggle('campus', !inside);
    if (!inside) S.campus.reset();
    S.dirty = true;
  }
  function enterBuilding(bId, instant) {
    const bv = S.buildings.get(bId); if (!bv) return;
    if (S.mode !== 'inside') setMode('inside');
    if (bv.lay.rooms.length === 1) { S.view = { level: 'room', building: bId, room: bv.lay.rooms[0].id }; select({ kind: 'chamber', id: S.view.room }); renderCrumb(); fitCurrent(instant || S.justEntered); return; }
    S.view = { level: 'building', building: bId, room: null }; select({ kind: 'building', id: bId });
    if (app.screen.width < 760) document.body.classList.remove('panel'); // a phone needs the screen for the rooms; tapping one opens its details
    renderCrumb(); fitCurrent(instant || S.justEntered);
  }
  function focusRoom(rId) {
    const rv = S.rooms.get(rId); if (!rv) return;
    if (S.mode !== 'inside') setMode('inside');
    S.view = { level: 'room', building: rv.lay.building, room: rId }; select({ kind: 'chamber', id: rId }); renderCrumb(); fitCurrent();
  }
  function showCampus() { select(null); S.view = { level: 'campus', building: null, room: null }; setMode('campus'); renderCrumb(); }
  function goUp() {
    if (S.view.level === 'room' && S.buildings.get(S.view.building).lay.rooms.length > 1) { enterBuilding(S.view.building); return; }
    if (S.view.level !== 'campus') { showCampus(); return; }
    select(null);
  }
  function renderCrumb() {
    const parts = S.view.building ? ['<a data-level="campus">Overview</a>'] : [];
    if (S.view.building) parts.push(`<a data-level="building">${esc(S.buildingById[S.view.building].name)}</a>`);
    if (S.view.room) parts.push(`<a data-level="chamber">${esc(S.chamberById[S.view.room].name)}</a>`);
    $('crumb').innerHTML = parts.join('<span class="sep">/</span>');
    $('crumb').querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { const lv = a.dataset.level; if (lv === 'campus') showCampus(); else if (lv === 'building') enterBuilding(S.view.building); else fitCurrent(); }));
    for (const r of S.rooms.values()) r.sel.visible = r.lay.id === S.view.room;
    for (const b of S.buildings.values()) b.sel.visible = b.lay.id === S.view.building && S.view.level === 'building';
  }

  // Cull rooms by the viewport and switch detail with zoom: far out the modules read as glowing
  // outlines with plates and lamps, closer the stations and titles appear, closest the labels.
  function cull() {
    const z = S.cam.z; const vx = S.cam.x - S.w / 2 / z, vy = S.cam.y - S.h / 2 / z, vw = S.w / z, vh = S.h / z;
    const view = { x: vx - 80, y: vy - 80, w: vw + 160, h: vh + 160 };
    const lod = z < 0.16 ? 0 : z < 0.45 ? 1 : z < 1.3 ? 2 : z < 2.6 ? 3 : 4;
    const zChanged = z !== S.lastZ; S.lastZ = z;
    const doorstep = clamp(1 / z, 0.8, 5); // names keep one on-screen size at every zoom
    for (const r of S.rooms.values()) {
      const v = L.overlaps(view, r.bounds); r.c.visible = v; if (!v) continue;
      r.labels.visible = lod >= 1; r.title.visible = lod >= 1;
      if (zChanged) {
        for (const ch of r.labels.children) if (ch !== r.title) { ch.visible = ch.doorstep ? z >= 0.78 : ch.wallLabel ? lod >= 4 : lod >= 3; if (ch.doorstep) ch.scale.set(doorstep); }
        r.title.scale.set(doorstep);
      }
    }
    for (const b of S.buildings.values()) { const v = L.overlaps(view, { x: b.lay.x - 40, y: b.lay.y - 40, w: b.lay.w + 80, h: b.lay.h + 120 }); b.c.visible = v; if (zChanged) { b.plate.scale.set(doorstep); b.plate.x = Math.round((b.lay.landmark.tx + b.lay.landmark.tw / 2) * T - b.plate.plateW * doorstep / 2); b.sub.visible = lod >= 3; } }
    actorLayer.visible = lod >= 1; S.heatG.visible = true; if (S.dots) S.dots.visible = lod === 0;
  }

  // ---------- frame ----------
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; S.now = now; S.frame++;
    if (!S.st) return;
    try {
    if (S.mode === 'campus') { S.campus.update(dt); if (S.timeline.playing) stepTimeline(dt); return; }
    tweenCamera(dt); applyCamera();
    updateActors(dt); updatePackets(dt); updateParticles(dt); updatePulses();
    if (S.lod === 0 && S.dots) { const g = S.dots.clear(); const r = 1.6 / Math.max(0.08, S.cam.z); for (const a of S.actors.values()) { const col = a.eventWork ? COL.accent : a.state === 'walk' ? 0xFFFFFF : hex(S.buildingById[a.building].colour); g.circle(a.pos.x, a.pos.y - 8, r).fill({ color: col, alpha: 0.95 }); } }
    if (S.timeline.playing) stepTimeline(dt);
    if (S.dirty) { cull(); S.dirty = false; }
    if (S.ring && !S.ring.destroyed && S.ring.position) { S.ring.visible = !!S.hover && (S.hover.kind === 'node' || S.hover.kind === 'archive'); if (S.ring.visible) { const p = hoverPoint(S.hover); S.ring.position.set(p.x, p.y); } }
    } catch (err) { // one bad frame must never freeze input; log once per distinct message and carry on
      if (!S.loggedErrors) S.loggedErrors = new Set();
      if (!S.loggedErrors.has(err.message)) { S.loggedErrors.add(err.message); console.error('frame error (recovered):', err); }
    }
  });
  function hoverPoint(h) { const a = S.actors.get(h.id) || null; if (a) return { x: a.pos.x, y: a.pos.y - 2 }; const f = S.fixtures.get(h.id); if (f) return { x: f.room.x + f.g.x + f.lay.w * T / 2, y: f.room.y + f.g.y + f.lay.h * T - 2 }; return { x: 0, y: 0 }; }

  // ---------- interaction ----------
  const canvas = app.canvas;
  function toWorld(cx, cy) { const z = S.cam.z; return { x: (cx - S.w / 2) / z + S.cam.x, y: (cy - S.h / 2) / z + S.cam.y }; }
  function hit(wx, wy) {
    const z = S.cam.z;
    if (z >= 0.5) {
      for (const a of S.actors.values()) if (!a.hero && a.sp.visible && wx >= a.pos.x - 12 && wx <= a.pos.x + 12 && wy >= a.pos.y - 38 && wy <= a.pos.y + 4) return { kind: 'node', id: a.id };
      for (const [id, f] of S.fixtures) { if (!f.room || !S.rooms.get(f.room.id).c.visible) continue; if (f.files && !id.startsWith('archive:')) continue; const x = f.room.x + f.g.x, y = f.room.y + f.g.y; if (wx >= x - 2 && wx <= x + f.lay.w * T + 2 && wy >= y - 14 && wy <= y + f.lay.h * T + 4) return f.files ? { kind: 'archive', id, files: f.files, room: f.room.id } : { kind: 'node', id: f.lay.node }; }
    }
    for (const r of S.st.rooms) if (wx >= r.x && wx <= r.x + r.w && wy >= r.y - 10 && wy <= r.y + r.h) return { kind: 'chamber', id: r.id, building: r.building };
    for (const b of S.st.buildings) if (wx >= b.x - 8 && wx <= b.x + b.w + 8 && wy >= b.y - 8 && wy <= b.y + b.h + 40) return { kind: 'building', id: b.id };
    return null;
  }
  const pointers = new Map(); let pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); S.drag = null; return; }
    S.dragging = false; S.drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y }; canvas.classList.add('dragging');
  });
  function tipAt(e, r, text) {
    const tip = $('tooltip');
    if (!text) { tip.style.display = 'none'; return; }
    tip.textContent = text; tip.style.display = 'block'; tip.style.transform = `translate(${Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8)}px, ${e.clientY - r.top + 14}px)`;
  }
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2 && S.mode === 'inside') { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch = d; return; }
    if (S.mode === 'campus') {
      const id = S.campus.hit(e.clientX - r.left, e.clientY - r.top); S.campus.hover(id); canvas.classList.toggle('pointer', !!id); canvas.classList.remove('dragging');
      tipAt(e, r, id ? S.buildingById[id].blurb : '');
      return;
    }
    if (S.drag) { const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) S.dragging = true; if (S.dragging) { S.target = null; S.cam.x = S.drag.cx - dx / S.cam.z; S.cam.y = S.drag.cy - dy / S.cam.z; S.dirty = true; } return; }
    const w = toWorld(e.clientX - r.left, e.clientY - r.top); const h = hit(w.x, w.y);
    if ((S.hover && S.hover.id) !== (h && h.id)) { for (const rv of S.rooms.values()) rv.hov.visible = !!h && h.kind === 'chamber' && h.id === rv.lay.id; }
    S.hover = h;
    canvas.classList.toggle('pointer', !!h);
    let text = '';
    if (h) {
      if (h.kind === 'building') { const b = S.buildingById[h.id]; text = `${b.name}, ${b.rollup.nodes} item${b.rollup.nodes === 1 ? '' : 's'}`; }
      else if (h.kind === 'chamber') { const c = S.chamberById[h.id]; text = `${c.name}, ${c.rollup.nodes} item${c.rollup.nodes === 1 ? '' : 's'}`; }
      else if (h.kind === 'archive') { const names = h.files.slice(0, 5).map((id) => nameOf(id)); text = `${h.files.length} files: ${names.join(', ')}${h.files.length > 5 ? ' and more' : ''}`; }
      else { const d = S.byId.get(h.id); text = d ? `${d.name}, ${d.type === 'shelf' ? count(d.count, 'skill') : d.type}` : ''; }
    }
    tipAt(e, r, text);
  });
  window.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; });
  window.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    canvas.classList.remove('dragging');
    if (S.drag && !S.dragging && e.target === canvas) {
      const r = canvas.getBoundingClientRect();
      if (S.mode === 'campus') { const id = S.campus.hit(e.clientX - r.left, e.clientY - r.top); if (id) S.campus.enter(id); else select(null); S.drag = null; return; }
      const w = toWorld(e.clientX - r.left, e.clientY - r.top); const h = hit(w.x, w.y);
      if (!h) select(null);
      else if (h.kind === 'building') enterBuilding(h.id);
      else if (h.kind === 'chamber') focusRoom(h.id);
      else select(h);
    }
    S.drag = null; S.dragging = false;
  });
  function zoomAt(factor, cx, cy) { const before = toWorld(cx, cy); S.cam.z = clamp(S.cam.z * factor, ZMIN, ZMAX); const after = toWorld(cx, cy); S.cam.x += before.x - after.x; S.cam.y += before.y - after.y; S.target = null; S.dirty = true; }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); if (S.mode === 'campus') return; const r = canvas.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy); // trackpad pinch arrives as a ctrlKey wheel
    else { const k = e.deltaMode === 1 ? 16 : 1; S.target = null; S.cam.x += e.deltaX * k / S.cam.z; S.cam.y += e.deltaY * k / S.cam.z; S.dirty = true; }
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.target === $('search') && e.key !== 'Escape') return;
    if (e.key === 'Escape') { goUp(); $('search').blur(); }
    else if ((e.key === '+' || e.key === '=') && S.mode === 'inside') zoomAt(ZSTEP, S.w / 2, S.h / 2);
    else if ((e.key === '-' || e.key === '_') && S.mode === 'inside') zoomAt(1 / ZSTEP, S.w / 2, S.h / 2);
    else if (e.key === ' ' && !S.timeline.live) { e.preventDefault(); togglePlay(); }
  });
  $('fit').addEventListener('click', () => fitCurrent());
  $('up').addEventListener('click', () => goUp());
  $('close').addEventListener('click', () => { select(null); if (S.mode === 'inside') fitCurrent(); });
  let resizeTimer = null;
  const onResize = () => { app.resize(); S.dirty = true; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!S.campus || (S.w === app.screen.width && S.h === app.screen.height)) return; S.w = app.screen.width; S.h = app.screen.height; if (S.mode === 'campus') S.campus.build(); else fitCurrent(true); drawTimelineHisto(); }, 160); };
  window.addEventListener('resize', onResize);
  new ResizeObserver(onResize).observe(stageEl); // the timeline can appear after the first change

  // Search: Enter flies to the best match. Skills live on shelves, so a skill opens its shelf.
  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase(); if (!q) return;
    const nodes = [...S.byId.values()].filter((n) => n.name);
    const best = nodes.find((n) => n.name.toLowerCase() === q) || nodes.find((n) => n.name.toLowerCase().startsWith(q)) || nodes.find((n) => n.name.toLowerCase().includes(q));
    if (best) { flyToNode(best.id); return; }
    for (const sh of S.world.skillLibrary.shelves) if (sh.skills.some((k) => k.name.toLowerCase().includes(q))) { flyToNode(sh.id); showShelf(sh.id, q); return; }
    const ch = S.world.places.chambers.find((c) => c.name.toLowerCase().includes(q)); if (ch) { focusRoom(ch.id); return; }
    const b = S.world.places.buildings.find((x) => x.name.toLowerCase().includes(q)); if (b) enterBuilding(b.id);
  });
  function flyToNode(id) {
    const d = S.byId.get(id); if (!d) { if (S.chamberById[id]) focusRoom(id); else if (S.buildingById[id]) enterBuilding(id); return; }
    const f = S.fixtures.get(id) || S.actors.get(id); if (!f) return;
    if (S.mode !== 'inside') setMode('inside');
    const p = f.lay ? { x: f.room.x + f.g.x + f.lay.w * T / 2, y: f.room.y + f.g.y + f.lay.h * T / 2 } : { x: f.pos.x, y: f.pos.y };
    S.view = { level: 'room', building: d.building, room: d.chamber }; renderCrumb(); select({ kind: 'node', id });
    const z = Math.max(S.cam.z, 1.6);
    S.target = { x: p.x + panelW() / 2 / z, y: p.y + panelH() / 2 / z, z };
  }

  // ---------- side panel ----------
  const ICONS = ['icon-agent', 'icon-skill', 'icon-command', 'icon-hook', 'icon-mcp', 'icon-memory', 'icon-workflow', 'icon-client', 'icon-research', 'icon-flag', 'icon-warning', 'icon-check', 'icon-gear', 'icon-search', 'icon-lock', 'icon-envelope'];
  function iconHtml(type) { const i = ICONS.indexOf(TYPE_ICON[type]); return i < 0 ? '' : `<i class="ico" data-icon="${i}"></i>`; }
  function select(sel) {
    S.selected = sel;
    document.body.classList.toggle('panel', !!sel);
    if (!sel) return;
    if (sel.kind === 'building') showBuilding(sel.id); else if (sel.kind === 'chamber') showChamber(sel.id); else if (sel.kind === 'archive') showArchive(sel); else showNode(sel.id);
    setTab('detail');
  }
  const codeify = (t) => esc(t).replace(/(^|\s)(\/[a-z][a-z-]*)/g, '$1<code>$2</code>');
  const flagHtml = (flags) => flags.map((f) => `<div class="flag ${f.severity}" data-target="${esc(f.target)}"><div class="m">${esc(f.message)}</div><div class="a">${codeify(f.action)}</div></div>`).join('') || '<div class="empty">Nothing flagged here.</div>';
  const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
  const linkList = (items) => (items.length ? `<ul class="links">${items.map((i) => `<li><a data-id="${esc(i.id)}">${i.type ? iconHtml(i.type) : ''}${esc(i.label)}</a><small>${esc(i.note || '')}</small></li>`).join('')}</ul>` : '<div class="empty">None yet.</div>');
  function wire(el) {
    el.querySelectorAll('a[data-id]').forEach((a) => a.addEventListener('click', () => flyToNode(a.dataset.id)));
    el.querySelectorAll('.flag[data-target], .steps li[data-target]').forEach((d) => d.addEventListener('click', () => flyToNode(d.dataset.target)));
    const src = S.atlas.cell('icons', 0).source; const K = 0.5;
    el.querySelectorAll('.ico[data-icon]').forEach((i) => { const m = S.atlas.cellMeta('icons', Number(i.dataset.icon)); if (!m) return; i.style.width = m.w * K + 'px'; i.style.height = m.h * K + 'px'; i.style.backgroundSize = `${src.width * K}px ${src.height * K}px`; i.style.backgroundPosition = `-${m.x * K}px -${m.y * K}px`; });
  }
  function rollupPills(r) { return `<span class="pill">${count(r.nodes, 'item')}</span>${r.agents ? `<span class="pill">${count(r.agents, 'agent')}</span>` : ''}${r.commands ? `<span class="pill">${count(r.commands, 'command')}</span>` : ''}${r.high ? `<span class="pill bad">${r.high} high</span>` : ''}${r.medium ? `<span class="pill warn">${r.medium} medium</span>` : ''}${r.low ? `<span class="pill">${r.low} low</span>` : ''}${r.recent24h ? `<span class="pill ok">${r.recent24h} change${r.recent24h === 1 ? '' : 's'} in 24h</span>` : ''}`; }
  function showBuilding(id) {
    const b = S.buildingById[id]; const chambers = S.world.places.chambers.filter((c) => c.building === id);
    const flags = S.world.flags.filter((f) => f.building === id);
    $('tab-detail').innerHTML = `<div class="kicker">Building</div><h2>${esc(b.name)}</h2><div>${rollupPills(b.rollup)}</div><div class="desc">${esc(b.blurb)}</div>
      <h3>Rooms (${chambers.length})</h3>${linkList(chambers.map((c) => ({ id: c.id, label: c.name, note: count(c.rollup.nodes, 'item') })))}
      ${flags.length ? `<h3>Flags (${flags.length})</h3>${flagHtml(flags)}` : ''}`;
    wire($('tab-detail'));
  }
  function showArchive(sel) {
    const c = S.chamberById[sel.room]; const items = sel.files.map((id) => S.byId.get(id)).filter(Boolean);
    $('tab-detail').innerHTML = `<div class="kicker">Files in ${esc(c.name)}</div><h2>${count(items.length, 'file')}</h2>
      ${linkList(items.map((n) => ({ id: n.id, label: n.name, note: n.type, type: n.type })))}`;
    wire($('tab-detail'));
  }
  function showChamber(id) {
    const c = S.chamberById[id]; const items = S.world.nodes.filter((n) => n.chamber === id);
    const flags = S.world.flags.filter((f) => f.chamber === id);
    const recent = S.world.events.events.filter((e) => e.chamber === id).slice(-12).reverse();
    $('tab-detail').innerHTML = `<div class="kicker">Room in ${esc(S.buildingById[c.building].name)}</div><h2>${esc(c.name)}</h2><div>${rollupPills(c.rollup)}</div><div class="desc">${esc(c.blurb)}</div>
      <h3>Inside (${items.length})</h3>${linkList(items.map((n) => ({ id: n.id, label: n.name, note: n.count != null ? (n.count === 1 ? '1 skill' : n.count + ' skills') : n.type, type: n.type })))}
      ${recent.length ? `<h3>Recent changes (${recent.length})</h3><ul class="links">${recent.map((e) => `<li><a data-id="${esc(e.node || '')}">${esc(e.path)}</a><small>${esc(fmtTs(new Date(e.t).getTime()))}</small></li>`).join('')}</ul>` : ''}
      ${flags.length ? `<h3>Flags (${flags.length})</h3>${flagHtml(flags)}` : ''}`;
    wire($('tab-detail'));
  }
  function showShelf(id, filter) {
    const d = S.byId.get(id); if (!d || !d.shelf) return; const sh = d.shelf;
    $('tab-detail').innerHTML = `<div class="kicker">${iconHtml('shelf')}Shelf in the Skills Library</div><h2>${esc(sh.name)}</h2><div><span class="pill">${count(sh.count, 'skill')} skills</span>${sh.custom ? `<span class="pill ok">${sh.custom} yours</span>` : ''}</div>
      <input id="shelf-filter" type="search" placeholder="Filter this shelf" aria-label="Filter this shelf" autocomplete="off" spellcheck="false"><div id="shelf-list"></div><h3>File</h3><div id="filebox" class="empty">Click a skill to read it here.</div>`;
    wire($('tab-detail'));
    const draw = (q) => {
      const hits = sh.skills.filter((k) => !q || k.name.toLowerCase().includes(q) || (k.description || '').toLowerCase().includes(q));
      $('shelf-list').innerHTML = hits.slice(0, 150).map((k) => `<div class="skill"><a data-file="${esc(k.file)}"><b>${esc(k.name)}</b></a>${k.custom ? '<em>yours</em>' : ''}<div>${esc(k.description || '')}</div></div>`).join('') + (hits.length > 150 ? `<div class="empty">Showing 150 of ${hits.length}. Filter to narrow it down.</div>` : '') + (hits.length ? '' : '<div class="empty">No skill matches that.</div>');
      $('shelf-list').querySelectorAll('a[data-file]').forEach((a) => a.addEventListener('click', () => loadFile(a.dataset.file)));
    };
    $('shelf-filter').value = filter || ''; draw(filter || '');
    $('shelf-filter').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
    setTab('detail');
  }
  function showNode(id) {
    const d = S.byId.get(id); if (!d) return;
    if (d.type === 'shelf') { showShelf(id); return; }
    const edges = S.edgeIndex.get(id) || [];
    const typeOf = (x) => { const o = S.byId.get(x); return o ? o.type : null; };
    const outs = edges.filter((e) => e.from === id).map((e) => ({ id: e.to, label: nameOf(e.to), note: e.type, type: typeOf(e.to) }));
    const ins = edges.filter((e) => e.to === id).map((e) => ({ id: e.from, label: nameOf(e.from), note: e.type, type: typeOf(e.from) }));
    const flags = S.flagsByTarget.get(id) || [];
    const pills = [];
    if (d.custom) pills.push('<span class="pill ok">yours</span>');
    if (d.type === 'agent' && d.model) pills.push(`<span class="pill">${esc(d.model)}</span>`);
    if (d.type === 'mcp') pills.push('<span class="pill">name only, connection not checked</span>');
    if (d.type === 'workflow') pills.push(d.verdict ? `<span class="pill ${d.verdict === 'OK' ? 'ok' : d.verdict === 'FAILING' ? 'bad' : 'warn'}">${esc(d.verdict)} at last /pulse</span>` : '<span class="pill">not checked yet, run /pulse</span>');
    if (d.type === 'hook') pills.push(`<span class="pill">${esc(d.event)}</span>`);
    if (d.type === 'memory') { if (d.cap) pills.push(`<span class="pill ${d.lines > d.cap ? 'bad' : ''}">${d.lines} of ${d.cap} lines</span>`); if (d.pending != null) pills.push(`<span class="pill">${d.pending} waiting</span>`); }
    const meta = [];
    if (d.assignment && S.chamberById[d.chamber]) meta.push(['Found in', `${S.chamberById[d.chamber].name}, ${S.buildingById[d.building].name}`], ['Why here', d.assignment.reason]);
    if (d.tools && d.tools.length) meta.push(['Tools', d.tools.slice(0, 8).join(', ') + (d.tools.length > 8 ? ' +' + (d.tools.length - 8) : '')]);
    if (d.skills && d.skills.length) meta.push(['Skills', d.skills.join(', ')]);
    if (d.reason && d.type === 'workflow') meta.push(['Last /pulse', d.reason]);
    if (d.header) meta.push(['What it does', d.header]);
    const recent = S.world.events.events.filter((e) => e.node === id).slice(-8).reverse();
    $('tab-detail').innerHTML = `<div class="kicker">${iconHtml(d.type)}${esc(d.type)}</div><h2>${esc(d.name)}</h2><div>${pills.join('')}</div>
      <div class="desc">${esc(d.description || '')}</div>
      ${d.type === 'memory' ? '<div class="desc">Known key shapes are hidden. A password written in plain words can still show here.</div>' : ''}
      ${meta.length ? `<h3>Details</h3><div class="meta">${meta.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}
      ${outs.length ? `<h3>Uses (${outs.length})</h3>${linkList(outs)}` : ''}
      ${ins.length ? `<h3>Used by (${ins.length})</h3>${linkList(ins)}` : ''}
      ${recent.length ? `<h3>Recent changes (${recent.length})</h3><ul class="links">${recent.map((e) => `<li><a data-id="${esc(id)}">${esc(e.path)}</a><small>${esc(fmtTs(new Date(e.t).getTime()))}</small></li>`).join('')}</ul>` : ''}
      ${flags.length ? `<h3>Flags (${flags.length})</h3>${flagHtml(flags)}` : ''}
      ${d.file ? `<h3>File</h3><div id="filebox" class="empty">Loading...</div>` : ''}`;
    wire($('tab-detail'));
    if (d.file) loadFile(d.file);
  }
  async function loadFile(p) {
    const box = $('filebox'); if (!box) return;
    try {
      const r = await api('/file?path=' + encodeURIComponent(p)); const j = await r.json();
      if (!document.getElementById('filebox')) return;
      box.className = '';
      if (r.status === 401) { box.className = 'empty'; box.textContent = NEEDS_LINK; return; }
      if (j.error) { box.className = 'empty'; box.textContent = j.error === 'not found' ? 'This file is not inside this project folder.' : j.error === 'names only' ? 'This map shows this one by name only. Open it in your editor to read it.' : j.error === 'may hold a key' ? 'This file stays private, because it looks like it holds a key.' : 'This file stays private.'; return; }
      box.innerHTML = `<div class="path">${esc(j.path)}</div><pre class="file">${esc(j.text)}${j.truncated ? '\n\n[Showing the first 512 KB]' : ''}</pre>`;
    } catch { box.className = 'empty'; box.textContent = 'Could not reach the map. Run /system-map to start it again.'; }
  }
  const CHECK_LINE = 'Checked: hook scripts settings.json runs directly, memory size, your last /pulse. Not checked: security, connections, whether hooks work.';
  function renderFlags() {
    const el = $('tab-flags'); const fl = S.world.flags;
    el.innerHTML = fl.length ? `<div class="kicker">${fl.length} to look at, most important first</div>` + flagHtml(fl) : `<div class="empty">Nothing flagged. ${CHECK_LINE}</div>`;
    wire(el);
    $('flagcount').textContent = fl.length || '';
  }
  function renderSteps() {
    const el = $('tab-steps'); const st = S.world.nextSteps;
    el.innerHTML = st.length ? `<ul class="steps">${st.map((x) => `<li data-target="${esc(x.target)}">${codeify(x.text)}</li>`).join('')}</ul>` : '<div class="empty">No next steps right now.</div>';
    wire(el);
    $('stepcount').textContent = st.length || '';
  }
  function renderHud() {
    const w = S.world, h = w.health, c = w.counts; const n = w.flags.length;
    const asOf = hhmm(new Date(h.checkedAt));
    const pulse = h.automationsAsOf ? ` Automations as of your last /pulse, ${esc(fmtTs(new Date(h.automationsAsOf).getTime()))}.` : '';
    const steps = w.nextSteps.slice(0, 4);
    $('hud').innerHTML = `<div class="state ${esc(h.level)}"><i></i>${n ? `${n} thing${n === 1 ? '' : 's'} to look at` : 'Nothing flagged'}</div>
      <div class="asof">From your files at ${esc(asOf)}.${pulse}</div>
      <div class="asof">${CHECK_LINE}</div>
      <div class="tally"><div><b>${c.agents}</b><span>agents</span></div><div><b>${c.commands}</b><span>commands</span></div><div><b>${c.skills.toLocaleString()}</b><span>skills</span></div><div><b>${c.hooks}</b><span>hooks</span></div></div>
      ${steps.length ? `<h2>Next steps</h2><ul class="steps">${steps.map((x) => `<li data-target="${esc(x.target)}">${codeify(x.text)}</li>`).join('')}</ul>` : ''}
      ${w.flags.length ? `<button id="seeflags" class="btn flagsum">See ${w.flags.length} flag${w.flags.length === 1 ? '' : 's'}</button>` : ''}`;
    wire($('hud'));
    const see = $('seeflags'); if (see) see.addEventListener('click', () => { document.body.classList.add('panel'); setTab('flags'); });
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(t) { document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + t)); }

  // ---------- ticker ----------
  function tick(line) { S.ticker.unshift(line); S.ticker = S.ticker.slice(0, 40); $('tickerlist').innerHTML = S.ticker.map((l) => `<span><b>${esc(l.t)}</b> ${esc(l.p)} ${esc(l.k || '')}</span>`).join(''); }

  // ---------- timeline ----------
  const TL = S.timeline;
  function timelineBounds() { const ev = S.world.events; return { min: new Date(ev.since).getTime(), max: Date.now() }; }
  function setCursor(ms, dispatch) {
    const b = timelineBounds(); ms = clamp(ms, b.min, b.max);
    const prev = TL.cursor; TL.cursor = ms; TL.lastDispatched = Math.max(TL.lastDispatched, ms);
    $('scrub').value = String(Math.round((ms - b.min) / (b.max - b.min) * 1000));
    $('timelabel').textContent = TL.live ? 'now ' + hhmm() : fmtTs(ms);
    if (dispatch && ms > prev) { const evs = L.eventsBetween(S.world.events.events, prev, ms); for (const e of evs.slice(0, 40)) actOut(e, { nudge: false }); }
  }
  function stepTimeline(dt) { const b = timelineBounds(); const next = TL.cursor + dt * TL.speed; if (next >= b.max) { goLive(); return; } setCursor(next, true); }
  function togglePlay() { TL.playing = !TL.playing; $('play').textContent = TL.playing ? 'Pause' : 'Play'; if (TL.playing) { TL.live = false; $('livebtn').classList.remove('on'); } }
  function goLive() { TL.live = true; TL.playing = false; $('play').textContent = 'Play'; $('livebtn').classList.add('on'); setCursor(Date.now(), false); }
  $('scrub').addEventListener('input', (e) => { const b = timelineBounds(); TL.live = false; $('livebtn').classList.remove('on'); setCursor(b.min + Number(e.target.value) / 1000 * (b.max - b.min), false); });
  $('scrub').addEventListener('change', () => { for (const e of L.eventsBetween(S.world.events.events, TL.cursor - HOUR, TL.cursor).slice(-30)) actOut(e, { nudge: false }); });
  $('play').addEventListener('click', togglePlay);
  $('livebtn').addEventListener('click', goLive);
  function drawTimelineHisto() {
    document.body.classList.toggle('has-events', S.world.events.count > 0);
    const c = $('histo'); const ctx = c.getContext('2d'); const b = timelineBounds(); const W = c.width = c.clientWidth * 2, H = c.height = 24;
    ctx.clearRect(0, 0, W, H); const bins = new Array(7 * 24).fill(0);
    for (const e of S.world.events.events) { const i = Math.floor((new Date(e.t).getTime() - b.min) / HOUR); if (i >= 0 && i < bins.length) bins[i]++; }
    const mx = Math.max(1, ...bins); const bw = W / bins.length;
    bins.forEach((v, i) => { const h = Math.max(v ? 2 : 0, Math.round(Math.log1p(v) / Math.log1p(mx) * H)); ctx.fillStyle = '#2c3d91'; ctx.fillRect(i * bw, H - h, Math.max(1, bw - 1), h); });
    ctx.fillStyle = '#1e1e30'; for (let d = 0; d <= 7; d++) { const x = Math.round((new Date(b.min + d * DAY).setHours(0, 0, 0, 0) - b.min) / (b.max - b.min) * W); ctx.fillRect(x, 0, 1, H); }
  }

  // ---------- live link ----------
  function onChanged(changed) {
    const now = new Date().toISOString();
    for (const ch of changed) {
      const node = ownerOf(ch.path);
      if (TL.live) actOut({ t: now, path: ch.path, op: ch.exists === false ? 'deleted' : 'changed', node }, {});
      else tick({ t: hhmm(), p: ch.path, k: ch.exists === false ? '(deleted)' : 'changed' });
    }
  }
  const signature = (w) => JSON.stringify([w.places.buildings.map((b) => b.id), w.places.chambers.map((c) => c.id), w.nodes.map((n) => n.id)]);
  function refreshPanels() { renderHud(); renderFlags(); renderSteps(); drawTimelineHisto(); }
  function rebuild(w) {
    const view = { ...S.view }, sel = S.selected;
    indexWorld(w); S.sig = signature(w); buildStation(); hoverRing();
    if (S.mode === 'inside' && !(view.building && S.buildingById[view.building])) showCampus();
    else { S.view = view; if (sel && (sel.kind !== 'node' || S.byId.get(sel.id))) select(sel); else select(null); renderCrumb(); }
    renderHud();
    if (S.mode === 'campus') S.campus.build();
    S.dirty = true; S.lastZ = 0;
  }
  async function onWorld(m) {
    let w; try { const r = await api('/data/world.json'); if (r.status === 401) { linkLost(); return; } if (!r.ok) return; w = await r.json(); } catch { return; }
    S.stale = false; showLive();
    if (signature(w) === S.sig) { indexWorld(w); S.campus.refreshSigns(); } else rebuild(w);
    refreshPanels(); onChanged(m.changed || []);
  }
  function showLive() {
    if (S.stale) { $('live').textContent = 'Map out of date, last refresh failed'; $('live').className = 'live off'; return; }
    $('live').textContent = S.live ? 'Watching files' : 'Paused'; $('live').className = S.live ? 'live on' : 'live off';
  }
  // A stream address works once, so every connection asks for a fresh ticket. Trying again here
  // also means a dropped stream comes back by itself, which EventSource alone would not do.
  async function connectLive(delay = 2000) {
    let ticket;
    try {
      const r = await api('/stream-ticket');
      if (r.status === 401) { S.live = false; linkLost(); return; }
      ticket = (await r.json()).ticket;
    } catch { S.live = false; showLive(); setTimeout(() => connectLive(Math.min(delay * 2, 30000)), delay); return; }
    const es = new EventSource('/events?ticket=' + encodeURIComponent(ticket));
    es.addEventListener('hello', () => { delay = 2000; S.live = true; showLive(); });
    es.addEventListener('world', (e) => onWorld(JSON.parse(e.data)));
    es.addEventListener('extract-error', () => { S.stale = true; showLive(); });
    es.onerror = () => { es.close(); S.live = false; showLive(); setTimeout(() => connectLive(Math.min(delay * 2, 30000)), delay); };
  }
  function hoverRing() { S.ring = anim('ui', 'select-ring', 0.12); S.ring.anchor.set(0.5, 0.6); fitSprite(S.ring, 34, 34); S.ring.visible = false; fxLayer.addChild(S.ring); }
  function startMascot() {
    const a = S.atlas.cellMeta('hero-cube', 14), b = S.atlas.cellMeta('hero-cube', 15), src = S.atlas.cell('hero-cube', 14).source; const el = $('mascot'); if (!a) return;
    const k = 30 / Math.max(a.h, b ? b.h : a.h); el.style.backgroundSize = `${src.width * k}px ${src.height * k}px`;
    const show = (m) => { el.style.backgroundPosition = `-${m.x * k}px -${m.y * k}px`; }; show(a);
    if (!REDUCED && b) { let on = false; setInterval(() => { on = !on; show(on ? b : a); }, 460); }
  }

  // ---------- boot ----------
  async function boot() {
    if (!TOKEN) { linkLost(); return; }
    let w;
    try {
      for (;;) { // a big project takes a moment to read the first time
        const r = await api('/data/world.json');
        if (r.status === 401) { linkLost(); return; }
        if (r.ok) { w = await r.json(); break; }
        $('tickerlist').textContent = 'Reading your project...';
        await new Promise((res) => { setTimeout(res, 500); });
      }
    } catch { $('tickerlist').textContent = 'Could not reach the map. Run /system-map to start it again.'; return; }
    try { await document.fonts.load('600 14px Geist'); } catch { /* the system font is fine */ }
    S.atlas = await A.load(PIXI, 'art-manifest.json');
    indexWorld(w); S.sig = signature(w);
    document.body.classList.toggle('has-events', w.events.count > 0); app.resize();
    S.w = app.screen.width; S.h = app.screen.height;
    S.campus = window.SystemCampus(PIXI, app, S, { hex, fitSprite, shadowSprite, REDUCED, onEnter: (id) => { $('signs').classList.remove('leaving'); S.campus.C.alpha = 1; S.justEntered = true; enterBuilding(id, true); S.justEntered = false; } });
    app.stage.addChild(S.campus.C);
    buildStation(); hoverRing();
    renderHud(); renderFlags(); renderSteps(); renderCrumb();
    S.campus.build(); goLive(); drawTimelineHisto();
    startMascot();
    for (const e of w.events.events.slice(-8)) tick({ t: hhmm(new Date(e.t)), p: e.path, k: e.op || e.kind });
    tick({ t: hhmm(), p: 'Watching this project. File changes show up here as they happen.', k: '' });
    connectLive();
    // #b:core or #c:core/memory frames that building or room on load
    const h = decodeURIComponent(LINK_TARGET);
    if (S.buildings.get(h)) enterBuilding(h, true);
    else if (S.rooms.get(h)) { setMode('inside'); S.view = { level: 'room', building: S.rooms.get(h).lay.building, room: h }; select({ kind: 'chamber', id: h }); renderCrumb(); fitCurrent(true); }
    window.__world = S;
  }
  boot();
})();
