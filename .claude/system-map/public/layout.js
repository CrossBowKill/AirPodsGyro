/* System Map layout: the inside of your system as one continuous station. Pure functions, no DOM,
   no PixiJS, so the smoke test can run them in Node and the page can run them in the browser.
   Every room is a module on a tile grid with a door in its bottom wall. Rooms of one building
   share a corridor, buildings join the streets, and agents walk on the grid this produces.
   station(world) is deterministic for a given world.json. */
(function (root) {
  'use strict';

  const T = 32; // world px per tile
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- fixtures ----------
  // Footprints in tiles. spots are tiles next to the footprint where a person stands or sits
  // (relative to the fixture origin), in priority order. wall fixtures line the room walls.
  const FIXTURES = {
    // work stations (agents sit here, 2 seats each)
    'desk2': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'editdesk': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'console2': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'bench': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'meeting': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'lab': { w: 2, h: 1, spots: [[0, 1], [1, 1]], seats: 2 },
    'archive': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'bookcase': { w: 3, h: 1, spots: [[0, 1], [2, 1]] },
    // node fixtures (one node each, one work spot)
    'terminal': { w: 1, h: 1, spots: [[0, 1]] },
    'conveyor': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'pad': { w: 1, h: 1, spots: [[0, 1]] },
    'arch': { w: 1, h: 1, spots: [[0, 1], [0, -1]] },
    'office': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'easel': { w: 1, h: 1, spots: [[0, 1]] },
    // wall fixtures (files live here)
    'shelf': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'docshelf': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'cabinet': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'drawers': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'vaultdoor': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    // decoration (no node), floor
    'counter': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'rope': { w: 1, h: 1, spots: [[0, 1]] },
    'kiosk': { w: 1, h: 1, spots: [[0, 1]] },
    'camera': { w: 1, h: 1, spots: [[0, 1]] },
    'softbox': { w: 1, h: 1, spots: [[0, 1]] },
    'ringlight': { w: 1, h: 1, spots: [[0, 1]] },
    'videowall': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'rack': { w: 1, h: 1, spots: [[0, 1]] },
    'press': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'postdesk': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'maptable': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'radar': { w: 1, h: 1, spots: [[0, 1]] },
    'holoboard': { w: 1, h: 1, spots: [[0, 1]] },
    'stage': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'seats': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'countdown': { w: 1, h: 1, spots: [[0, 1]] },
    'crawler': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'easel3': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'booth': { w: 1, h: 1, spots: [[0, 1]] },
    'lectern': { w: 1, h: 1, spots: [[0, 1]] },
    'sofa': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'roundtable': { w: 2, h: 1, spots: [[0, 1], [1, 1]] },
    'robotarm': { w: 1, h: 1, spots: [[0, 1]] },
    'spool': { w: 1, h: 1, spots: [[0, 1]] },
    'crates': { w: 1, h: 1, spots: [[0, 1]] },
    'hopper': { w: 1, h: 1, spots: [[0, 1]] },
    'datacore': { w: 1, h: 1, spots: [[0, 1]] },
    'fountain': { w: 1, h: 1, spots: [[0, 1]] },
    'vending': { w: 1, h: 1, spots: [[0, 1]] },
    // decoration, wall
    'coffee': { w: 1, h: 1, spots: [[0, 1]], wall: true, social: true },
    'plant': { w: 1, h: 1, spots: [], wall: true },
    'bigplant': { w: 1, h: 1, spots: [], wall: true },
    'clock': { w: 1, h: 1, spots: [], wall: true },
    'extinguisher': { w: 1, h: 1, spots: [], wall: true },
    'frame': { w: 1, h: 1, spots: [], wall: true },
    'greenscreen': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'lightwall': { w: 1, h: 1, spots: [], wall: true },
    'whiteboard': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'wallmap': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'pigeonholes': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'gears': { w: 1, h: 1, spots: [], wall: true },
    'pipes': { w: 1, h: 1, spots: [], wall: true },
    'panel': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'cooler': { w: 1, h: 1, spots: [[0, 1]], wall: true, social: true },
    'coatstand': { w: 1, h: 1, spots: [], wall: true },
    'trophies': { w: 1, h: 1, spots: [], wall: true },
    'safe': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'scanner': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'mailbox': { w: 1, h: 1, spots: [[0, 1]], wall: true },
    'dish': { w: 1, h: 1, spots: [], wall: true },
    'lamp': { w: 1, h: 1, spots: [], wall: true },
  };

  // Node type to fixture. Agents are seated at station pods chosen by the room theme.
  const NODE_FIXTURE = { command: 'terminal', workflow: 'conveyor', mcp: 'pad', hook: 'arch', client: 'office', memory: 'vaultdoor', skill: 'shelf', shelf: 'bookcase', doc: 'docshelf', script: 'cabinet', folder: 'drawers' };

  // Room themes: what makes a room recognisable before its label is read. floor fixtures take
  // pod slots, wall fixtures line the walls, pod is the station type agents sit at.
  const THEMES = {
    vault: { pod: 'console2', floor: ['datacore', 'rack', 'rack'], wall: ['panel'] },
    gateway: { pod: 'console2', floor: ['rope'], wall: ['scanner', 'panel'] },
    dock: { pod: 'console2', floor: ['spool', 'crates'], wall: ['panel', 'pipes'] },
    bay: { pod: 'bench', floor: ['robotarm', 'hopper', 'crates'], wall: ['gears', 'pipes'] },
    deck: { pod: 'console2', floor: ['holoboard', 'radar'], wall: ['wallmap', 'panel'] },
    quarters: { pod: 'desk2', floor: ['sofa'], wall: ['coffee', 'cooler', 'clock'] },
    workshop: { pod: 'bench', floor: ['crates'], wall: ['gears', 'whiteboard'] },
    hall: { pod: 'desk2', floor: ['lectern'], wall: ['frame', 'clock'] },
    seo: { pod: 'console2', floor: ['maptable', 'radar'], wall: ['wallmap', 'holoboard'] },
    studio: { pod: 'editdesk', floor: ['camera', 'softbox', 'ringlight'], wall: ['greenscreen', 'lightwall'] },
    post: { pod: 'desk2', floor: ['postdesk', 'press'], wall: ['pigeonholes', 'mailbox'] },
    ads: { pod: 'editdesk', floor: ['videowall', 'rack'], wall: ['lightwall', 'panel'] },
    lab: { pod: 'lab', floor: ['holoboard', 'radar'], wall: ['wallmap', 'whiteboard'] },
    files: { pod: 'desk2', floor: ['maptable'], wall: ['frame'] },
    work: { pod: 'desk2', floor: [], wall: ['whiteboard'] },
    desk: { pod: 'desk2', floor: ['kiosk'], wall: ['cooler', 'whiteboard'] },
    crew: { pod: 'desk2', floor: ['sofa'], wall: ['coffee', 'trophies'] },
    office: { pod: 'desk2', floor: ['roundtable'], wall: ['frame'] },
    reception: { pod: 'desk2', floor: ['sofa', 'vending', 'fountain'], wall: ['coffee', 'clock'] },
  };
  function themeFor(chamber) { return THEMES[chamber.theme] || THEMES.work; }

  // Deterministic order inside a room: people first, then the things they use.
  const TYPE_ORDER = ['agent', 'client', 'workflow', 'mcp', 'command', 'shelf', 'hook', 'memory', 'skill', 'script', 'doc', 'folder'];

  // ---------- room ----------
  // Lays out one chamber as a room: interior iw x ih tiles, walls one tile thick around it, door
  // in the bottom wall. Returns the room with fixtures in room-local tile coordinates (0,0 is the
  // top-left interior tile).
  const ARCHIVE_AT = 8; // more file nodes than this collapse into one archive cabinet cluster
  const FILL_PROPS = ['plant', 'crates', 'vending', 'bigplant', 'fountain'];
  function room(chamber, items) {
    const theme = themeFor(chamber);
    const agents = items.filter((n) => n.type === 'agent');
    const isWallNode = (n) => FIXTURES[NODE_FIXTURE[n.type]] && FIXTURES[NODE_FIXTURE[n.type]].wall;
    const fileNodes = items.filter((n) => isWallNode(n) && n.type !== 'memory');
    const memoryNodes = items.filter((n) => n.type === 'memory');
    const floorNodes = items.filter((n) => n.type !== 'agent' && !isWallNode(n));
    const archive = fileNodes.length > ARCHIVE_AT ? fileNodes : null;
    // pods: theme decor first so the signature piece sits at the front, then stations, node fixtures, the archive
    const pods = [];
    for (const k of theme.floor) pods.push({ kind: k, node: null });
    for (let i = 0; i < agents.length; i += FIXTURES[theme.pod].seats) pods.push({ kind: theme.pod, node: null, agents: agents.slice(i, i + FIXTURES[theme.pod].seats) });
    for (const n of floorNodes) pods.push({ kind: NODE_FIXTURE[n.type], node: n });
    if (archive) pods.push({ kind: 'archive', node: null, files: archive });
    const walls = [];
    for (const n of memoryNodes) walls.push({ kind: 'vaultdoor', node: n });
    if (!archive) for (const n of fileNodes) walls.push({ kind: NODE_FIXTURE[n.type], node: n });
    const decorWalls = theme.wall.map((k) => ({ kind: k, node: null }));
    const pw = Math.max(1, ...pods.map((p) => FIXTURES[p.kind].w)), ph = Math.max(1, ...pods.map((p) => FIXTURES[p.kind].h));
    const pitchX = pw + 1, pitchY = ph + 2; // fixture, seat row, walkway
    // size the room to its content: cols of pods with one tile walkways, shelves on the top wall,
    // aisles of racks only when the shelves do not fit; pick the column count nearest a 1.4 aspect
    let best = null;
    for (let cols = 1; cols <= Math.max(1, pods.length); cols++) for (let extra = 0; extra <= 4; extra++) {
      const rows = Math.ceil(pods.length / cols);
      const iw = Math.max(4, cols * pitchX + 1 + extra);
      let ih = 2 + rows * pitchY, aisles = 0;
      while ((iw - 2) * (1 + aisles) < walls.length && aisles < 8) { aisles++; ih += 2; }
      const score = Math.abs(Math.log((iw / ih) / 1.4)) * 1.2 + (iw * ih) / 300 + extra * 0.08;
      if (!best || score < best.score) best = { iw, ih, cols, rows, aisles, score };
    }
    const { iw, ih, cols, rows: podRows, aisles } = best;
    const fixtures = [];
    const wallSlots = [];
    for (let x = 1; x < iw - 1; x++) wallSlots.push({ tx: x, ty: 0, spot: [x, 1], side: 'top' });
    for (let k = 0; k < aisles; k++) { const y = 2 + podRows * pitchY + k * 2 - 1; for (let x = 1; x < iw - 1; x++) wallSlots.push({ tx: x, ty: y, spot: [x, y + 1], side: 'aisle' }); }
    const placeWall = (w, sidx) => { const sl = wallSlots[sidx]; if (!sl) return false; fixtures.push({ kind: w.kind, node: w.node ? w.node.id : null, type: w.node ? w.node.type : 'decor', name: w.node ? w.node.name : w.kind, tx: sl.tx, ty: sl.ty, w: 1, h: 1, wall: true, side: sl.side, spots: [{ tx: sl.spot[0], ty: sl.spot[1] }] }); return true; };
    walls.forEach((w, i) => placeWall(w, i));
    // decor fills the slots the files left over, from the right end inward
    let di = wallSlots.length - 1; for (const w of decorWalls) { while (di >= walls.length && fixtures.some((f) => f.tx === wallSlots[di].tx && f.ty === wallSlots[di].ty)) di--; if (di < walls.length) break; placeWall(w, di); di--; }
    // corner props
    fixtures.push({ kind: 'plant', node: null, type: 'decor', name: 'plant', tx: 0, ty: 0, w: 1, h: 1, wall: true, side: 'top', spots: [] });
    fixtures.push({ kind: chamber.theme === 'reception' ? 'clock' : 'lamp', node: null, type: 'decor', name: 'corner', tx: iw - 1, ty: 0, w: 1, h: 1, wall: true, side: 'top', spots: [] });
    // pods on a grid from (1,2); the bottom interior row stays clear as the door walkway
    const seats = [];
    const slots = cols * podRows;
    const fill = []; for (let i = pods.length; i < slots; i++) fill.push({ kind: FILL_PROPS[(i + chamber.id.length) % FILL_PROPS.length], node: null });
    pods.concat(fill).forEach((p, i) => {
      const f = FIXTURES[p.kind]; const col = i % cols, row = Math.floor(i / cols);
      const tx = 1 + col * pitchX + Math.floor((pw - f.w) / 2), ty = 2 + row * pitchY;
      const spots = f.spots.map(([dx, dy]) => ({ tx: tx + dx, ty: ty + dy })).filter((s) => s.tx >= 0 && s.tx < iw && s.ty >= 1 && s.ty < ih);
      const fx = { kind: p.kind, node: p.node ? p.node.id : null, type: p.node ? p.node.type : (p.agents ? 'station' : p.files ? 'archive' : 'decor'), name: p.node ? p.node.name : p.files ? `archive, ${p.files.length} files` : p.kind, tx, ty, w: f.w, h: f.h, wall: false, spots, agents: p.agents ? p.agents.map((a) => a.id) : [], files: p.files ? p.files.map((n) => n.id) : null };
      fixtures.push(fx);
      if (p.agents) p.agents.forEach((a, k) => seats.push({ agent: a.id, fixture: fixtures.length - 1, tx: spots[k] ? spots[k].tx : tx, ty: spots[k] ? spots[k].ty : ty + 1 }));
    });
    // ceiling lamps every few tiles
    const lamps = [];
    const nx = Math.max(1, Math.round(iw / 4)), ny = Math.max(1, Math.round((ih - 1) / 4));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) lamps.push({ tx: Math.round((i + 0.5) * iw / nx - 0.5), ty: 1 + Math.round((j + 0.5) * (ih - 1) / ny - 0.5) });
    return { id: chamber.id, building: chamber.building, name: chamber.name, kind: chamber.theme, blurb: chamber.blurb, level: chamber.rollup ? chamber.rollup.level : null, recent24h: chamber.rollup ? chamber.rollup.recent24h : 0, recent7d: chamber.rollup ? chamber.rollup.recent7d : 0,
      iw, ih, tw: iw + 2, th: ih + 2, fixtures, seats, lamps, items, theme: theme.pod, archived: archive ? archive.length : 0, tx: 0, ty: 0 };
  }

  // ---------- building cluster ----------
  const LANDMARK_W = 10, LANDMARK_H = 10; // tiles reserved left of the spine for the facade and plate
  function cluster(building, rooms) {
    // shelf pack rooms (tallest first) into rows with a target width near a 16:10 cluster
    const sorted = rooms.slice().sort((a, b) => b.th - a.th || a.id.localeCompare(b.id));
    const area = sorted.reduce((s, r) => s + r.tw * r.th, 0);
    const targetW = Math.max(Math.max(...sorted.map((r) => r.tw)), Math.round(Math.sqrt(area * 1.5)));
    const GAPX = 2, rowsOut = [];
    let x = 0, row = { rooms: [], h: 0 };
    for (const r of sorted) {
      if (row.rooms.length && x + r.tw > targetW) { rowsOut.push(row); row = { rooms: [], h: 0 }; x = 0; }
      r.tx = x; row.rooms.push(r); x += r.tw + GAPX; row.h = Math.max(row.h, r.th);
    }
    if (row.rooms.length) rowsOut.push(row);
    // stack rows: rooms sit on a corridor (1 tile), then a 1 tile gap before the next row
    const SPINE_X = LANDMARK_W + 1; // spine column inside the cluster box, rooms start right of it
    const ROOM_X0 = SPINE_X + 2;
    let y = 1; const corridors = [];
    for (const rw of rowsOut) {
      for (const r of rw.rooms) { r.ty = y + (rw.h - r.th); r.tx += ROOM_X0; }
      const cy = y + rw.h; // corridor row under the rooms
      const lastRoom = rw.rooms[rw.rooms.length - 1];
      corridors.push({ kind: 'row', tx: SPINE_X, ty: cy, tw: lastRoom.tx + lastRoom.tw - SPINE_X, th: 1 });
      y = cy + 2;
    }
    const bottom = y; // first free row under the last corridor gap
    corridors.push({ kind: 'spine', tx: SPINE_X, ty: 1, tw: 1, th: bottom - 1 });
    const tw = Math.max(...rooms.map((r) => r.tx + r.tw)) + 1;
    const th = Math.max(bottom, LANDMARK_H + 2);
    const entrance = { tx: SPINE_X, ty: th - 1 };
    corridors[corridors.length - 1].th = th - 1; // spine runs to the entrance tile
    for (const r of rooms) r.door = { tx: r.tx + Math.floor(r.tw / 2), ty: r.ty + r.th - 1 }; // door tile in the bottom wall
    const landmark = { tx: 0, ty: th - LANDMARK_H - 1, tw: LANDMARK_W, th: LANDMARK_H };
    return { id: building.id, name: building.name, colour: building.colour, style: building.style, blurb: building.blurb, level: building.rollup ? building.rollup.level : null, recent24h: building.rollup ? building.rollup.recent24h : 0, recent7d: building.rollup ? building.rollup.recent7d : 0, nodes: building.rollup ? building.rollup.nodes : 0,
      tw, th, rooms, corridors, entrance, landmark, tx: 0, ty: 0 };
  }

  // ---------- station (the whole world) ----------
  const GAP = 7; // tiles between building boxes
  const EDGE = 4; // tiles of space around the whole station

  function station(world) {
    const nodesByChamber = {};
    for (const n of world.nodes) (nodesByChamber[n.chamber] = nodesByChamber[n.chamber] || []).push(n);
    const buildings = world.places.buildings.map((b) => {
      const rooms = world.places.chambers.filter((c) => c.building === b.id && (!c.fallback || (nodesByChamber[c.id] || []).length)).map((c) => {
        const items = (nodesByChamber[c.id] || []).slice().sort((a, x) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(x.type)) || a.name.localeCompare(x.name));
        return room(c, items);
      });
      return cluster(b, rooms);
    });
    // buildings sit on a grid sized to how many there are
    const gridCols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(buildings.length))));
    const gridRows = Math.ceil(buildings.length / gridCols);
    buildings.forEach((b, i) => { b.gx = i % gridCols; b.gy = Math.floor(i / gridCols); });
    const colIdx = [...Array(gridCols).keys()], rowIdx = [...Array(gridRows).keys()];
    const colW = colIdx.map((c) => Math.max(12, ...buildings.filter((b) => b.gx === c).map((b) => b.tw)));
    const rowH = rowIdx.map((r) => Math.max(12, ...buildings.filter((b) => b.gy === r).map((b) => b.th)));
    const colX = [], rowY = [];
    colIdx.reduce((x, c) => { colX[c] = x; return x + colW[c] + GAP; }, EDGE);
    rowIdx.reduce((y, r) => { rowY[r] = y; return y + rowH[r] + GAP; }, EDGE);
    const lastC = gridCols - 1, lastR = gridRows - 1;
    const cols = colX[lastC] + colW[lastC] + EDGE, rows = rowY[lastR] + rowH[lastR] + EDGE + 3;
    const walk = new Uint8Array(cols * rows); // 0 space, 1 corridor, 2 room floor, 3 door
    const corridors = [];
    const mark = (tx, ty, tw, th, v) => { for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) walk[y * cols + x] = v; };
    // streets under each row and avenues through each column (campus corridors)
    const streets = rowIdx.map((r) => ({ kind: 'street', tx: colX[0] - 2, ty: rowY[r] + rowH[r] + 2, tw: colX[lastC] + colW[lastC] - colX[0] + 4, th: 1 }));
    const avenues = colIdx.map((c) => ({ kind: 'avenue', tx: colX[c] + Math.floor(colW[c] / 2), ty: streets[0].ty, tw: 1, th: streets[lastR].ty - streets[0].ty + 1 }));
    for (const s of streets.concat(avenues)) { corridors.push(s); mark(s.tx, s.ty, s.tw, s.th, 1); }
    const rooms = [];
    for (const b of buildings) {
      b.tx = colX[b.gx] + Math.floor((colW[b.gx] - b.tw) / 2); b.ty = rowY[b.gy] + rowH[b.gy] - b.th; // bottoms align on the row baseline
      b.entrance = { tx: b.tx + b.entrance.tx, ty: b.ty + b.entrance.ty };
      b.landmark = { tx: b.tx + b.landmark.tx, ty: b.ty + b.landmark.ty, tw: b.landmark.tw, th: b.landmark.th };
      for (const c of b.corridors) { c.tx += b.tx; c.ty += b.ty; corridors.push(c); mark(c.tx, c.ty, c.tw, c.th, 1); }
      // stub from the entrance down to the street
      const st = streets[b.gy]; const stub = { kind: 'stub', tx: b.entrance.tx, ty: b.entrance.ty, tw: 1, th: st.ty - b.entrance.ty + 1 }; corridors.push(stub); mark(stub.tx, stub.ty, stub.tw, stub.th, 1);
      for (const r of b.rooms) {
        r.tx += b.tx; r.ty += b.ty; r.door = { tx: r.tx + Math.floor(r.tw / 2), ty: r.ty + r.th - 1 };
        r.ix = r.tx + 1; r.iy = r.ty + 1;
        mark(r.ix, r.iy, r.iw, r.ih, 2);
        for (const f of r.fixtures) { f.tx += r.ix; f.ty += r.iy; for (const s of f.spots) { s.tx += r.ix; s.ty += r.iy; } mark(f.tx, f.ty, f.w, f.h, 0); }
        for (const s of r.seats) { s.tx += r.ix; s.ty += r.iy; }
        for (const l of r.lamps) { l.tx += r.ix; l.ty += r.iy; }
        mark(r.door.tx, r.door.ty, 1, 1, 3);
        // a door stub: the tile under the door down to the row corridor (rooms of a shorter height in a row hang above it)
        const corr = b.corridors.find((c) => c.kind === 'row' && c.ty >= r.ty + r.th);
        if (corr) mark(r.door.tx, r.door.ty + 1, 1, corr.ty - r.door.ty - 1, 1);
        r.x = r.tx * T; r.y = r.ty * T; r.w = r.tw * T; r.h = r.th * T;
        rooms.push(r);
      }
      b.x = b.tx * T; b.y = b.ty * T; b.w = b.tw * T; b.h = b.th * T;
      b.door = { x: (b.entrance.tx + 0.5) * T, y: (b.entrance.ty + 1) * T };
    }
    // nodes: fixture, spot and pixel positions
    const nodes = []; const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
    for (const r of rooms) r.fixtures.forEach((f, i) => { if (f.files) { const spot = f.spots[0]; const meta = Object.fromEntries(r.items.map((n) => [n.id, n])); for (const id of f.files) { const n = meta[id]; nodes.push({ id, type: n.type, name: n.name, room: r.id, building: r.building, fixture: i, kind: 'archive', archived: true, tx: f.tx, ty: f.ty, tw: f.w, th: f.h, x: f.tx * T, y: f.ty * T, w: f.w * T, h: f.h * T, spot }); } } else if (f.node) { const spot = f.spots[0] || { tx: f.tx, ty: f.ty + f.h }; nodes.push({ id: f.node, type: f.type, name: f.name, room: r.id, building: r.building, fixture: i, kind: f.kind, tx: f.tx, ty: f.ty, tw: f.w, th: f.h, x: f.tx * T, y: f.ty * T, w: f.w * T, h: f.h * T, spot }); } });
    const agents = {};
    for (const r of rooms) for (const s of r.seats) { const f = r.fixtures[s.fixture]; agents[s.agent] = { room: r.id, building: r.building, seat: { tx: s.tx, ty: s.ty }, fixture: s.fixture, kind: f.kind }; nodes.push({ id: s.agent, type: 'agent', name: s.agent.slice(6), room: r.id, building: r.building, fixture: s.fixture, kind: f.kind, tx: s.tx, ty: s.ty, tw: 1, th: 1, x: s.tx * T, y: s.ty * T, w: T, h: T, spot: { tx: s.tx, ty: s.ty } }); }
    // data flows become corridor paths with a heat value per tile
    const heat = new Float32Array(cols * rows);
    const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
    const flows = [];
    for (const f of world.flows || []) {
      const a = byId[f.a], b = byId[f.b]; if (!a || !b) continue;
      const path = bfs(walk, cols, rows, a.entrance, b.entrance, (v) => v === 1);
      if (!path) continue;
      for (const p of path) heat[p.ty * cols + p.tx] += f.count;
      flows.push({ a: f.a, b: f.b, count: f.count, types: f.types, path });
    }
    return { T, cols, rows, walk, buildings, rooms, roomById, nodes, agents, corridors, streets, avenues, flows, heat, bounds: { w: cols * T, h: rows * T } };
  }

  // ---------- pathfinding ----------
  // Breadth first search on the walkability grid; pass(v) says which tile values are walkable.
  // Returns the tile path from a to b inclusive, or null. Uniform cost, 4-neighbour.
  function bfs(walk, cols, rows, a, b, pass) {
    pass = pass || ((v) => v > 0);
    const start = a.ty * cols + a.tx, goal = b.ty * cols + b.tx;
    if (start === goal) return [{ tx: a.tx, ty: a.ty }];
    const prev = new Int32Array(cols * rows).fill(-1); prev[start] = start;
    const q = new Int32Array(cols * rows); let qh = 0, qt = 0; q[qt++] = start;
    let cur = start;
    const step = (j) => { if (prev[j] === -1 && (pass(walk[j]) || j === goal)) { prev[j] = cur; q[qt++] = j; } };
    while (qh < qt) {
      cur = q[qh++]; if (cur === goal) break;
      const x = cur % cols, y = (cur / cols) | 0;
      if (x > 0) step(cur - 1); if (x < cols - 1) step(cur + 1); if (y > 0) step(cur - cols); if (y < rows - 1) step(cur + cols);
    }
    if (prev[goal] === -1) return null;
    const out = []; let i = goal; while (i !== start) { out.push({ tx: i % cols, ty: (i / cols) | 0 }); i = prev[i]; } out.push({ tx: a.tx, ty: a.ty });
    return out.reverse();
  }
  // Nearest walkable tile to (tx, ty), searching outward; used to drop an agent next to a fixture.
  function nearestWalkable(walk, cols, rows, tx, ty) {
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < cols && y < rows && walk[y * cols + x] > 0) return { tx: x, ty: y }; }
    return null;
  }

  // Events with t in (t0, t1], both ISO strings or epoch ms. Events are sorted by t already.
  function eventsBetween(events, t0, t1) {
    const a = typeof t0 === 'number' ? t0 : new Date(t0).getTime();
    const b = typeof t1 === 'number' ? t1 : new Date(t1).getTime();
    const out = [];
    for (const e of events) { const t = new Date(e.t).getTime(); if (t > a && t <= b) out.push(e); else if (t > b) break; }
    return out;
  }

  // Axis-aligned overlap test used by the smoke test and by the culler (works on tile or px rects).
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function overlapsT(a, b) { return a.tx < b.tx + b.tw && a.tx + a.tw > b.tx && a.ty < b.ty + b.th && a.ty + a.th > b.ty; }

  // Lamp colour for a rollup level.
  function lampColour(level) { return level === 'high' ? 0xFF4D4D : level === 'medium' ? 0xFFB020 : 0x34d399; }

  const api = { station, room, cluster, bfs, nearestWalkable, eventsBetween, overlaps, overlapsT, lampColour, themeFor, FIXTURES, NODE_FIXTURE, THEMES, T, ARCHIVE_AT };
  root.WorldLayout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
