/* System Map overview: the first screen. One screen-sized campus, drawn to the viewport, with a
   facade per building, named signs in live text, streets, people walking between doors and the
   memory cube at the crossroads. Clicking a building zooms in and hands over to the interior. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FACADE_W = 246, FACADE_H = 256;

  root.SystemCampus = function (PIXI, app, S, h) {
    const signsEl = document.getElementById('signs');
    const hudEl = document.getElementById('hud');
    const C = new PIXI.Container();
    let P = null, walkers = [], packets = [], cube = null, zoom = null, hoverId = null;
    const REDUCED = h.REDUCED;

    function subtitle(b) {
      const c = S.world.counts, r = b.rollup;
      const n = (v, one, many) => `${v} ${v === 1 ? one : many || one + 's'}`;
      if (b.id === 'b:skills') return `${c.skills.toLocaleString()} skills on ${n(c.shelves, 'shelf', 'shelves')}`;
      if (b.id === 'b:core') return `${n(c.hooks, 'hook')}, ${n(c.mcp, 'tool connection')}`;
      if (b.id === 'b:work') return c.folders ? `${n(c.folders, 'folder')} of yours` : 'Your notes and additions';
      if (b.id === 'b:clients') return c.clients ? n(c.clients, 'client') : 'Ready for your first client';
      return [r.agents ? n(r.agents, 'agent') : '', r.commands ? n(r.commands, 'command') : ''].filter(Boolean).join(', ');
    }

    // Where everything goes, for this screen size and this many buildings.
    function plan(world, W, H) {
      const narrow = W < 760;
      const hudBox = hudEl.getBoundingClientRect();
      const x0 = narrow ? 8 : hudBox.width + 44, x1 = W - (narrow ? 8 : 24), y0 = narrow ? Math.round(hudBox.height) + 18 : 12, y1 = H - 10;
      const list = world.places.buildings; const n = list.length;
      const cols = narrow ? 2 : n <= 4 ? 2 : Math.ceil(n / 2); const rows = Math.ceil(n / cols);
      const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
      const signH = narrow ? 50 : 58, streetH = narrow ? 16 : 24, under = streetH + (narrow ? 12 : 18);
      const raw = Math.min(cw * 0.86 / FACADE_W, (ch - signH - under) / FACADE_H);
      const k = clamp(Math.floor(raw * 8) / 8, 0.3, 2);
      const sites = list.map((b, i) => {
        const r = Math.floor(i / cols); const inRow = r === rows - 1 && n % cols ? n % cols : cols; const c = i - r * cols;
        const zig = !narrow && rows > 1 && c % 2 ? -Math.min(16, ch * 0.04) : 0;
        const baseY = Math.round(y0 + ch * (r + 1) - under + zig);
        return { b, r, c, x: Math.round(x0 + cw * (c + 0.5) + (cols - inRow) * cw / 2), baseY, streetY: Math.round(y0 + ch * (r + 1) - streetH / 2 - 3) };
      });
      const streets = [...Array(rows).keys()].map((r) => ({ y: Math.round(y0 + ch * (r + 1) - streetH / 2 - 3) }));
      const avX = Math.round(x0 + cw * Math.floor(cols / 2) + (cols % 2 ? cw / 2 + cw * 0.5 : 0));
      return { W, H, narrow, x0, x1, cols, rows, k, sites, streets, streetH, avX, signH };
    }

    function route(a, b) {
      const pts = [{ x: a.x, y: a.baseY }, { x: a.x, y: a.streetY }];
      if (a.r !== b.r) pts.push({ x: P.avX, y: a.streetY }, { x: P.avX, y: b.streetY });
      pts.push({ x: b.x, y: b.streetY }, { x: b.x, y: b.baseY });
      return pts;
    }
    function fromHub(b) { const y = P.streets[0].y; const pts = [{ x: P.avX, y }]; if (b.r) pts.push({ x: P.avX, y: b.streetY }); pts.push({ x: b.x, y: b.streetY }, { x: b.x, y: b.baseY }); return pts; }

    function setAnim(w, name) {
      if (w.anim === name) return; w.anim = name;
      w.sp.textures = S.atlas.anim(w.key, name);
      w.sp.scale.x = Math.abs(w.sp.scale.x) * (S.atlas.mirrored(w.key, name) ? -1 : 1);
      w.sp.animationSpeed = REDUCED ? 0 : 0.14; if (!REDUCED) w.sp.play();
    }
    function makeWalker(site, temp) {
      const key = S.atlas.manifest.workers[site.b.style] || 'worker-grey';
      const sp = new PIXI.AnimatedSprite(S.atlas.anim(key, 'walk-down')); sp.anchor.set(0.5, 1);
      const size = clamp(P.k * 46, 24, 56); sp.scale.set(size / sp.texture.height);
      const shadow = h.shadowSprite(size * 0.5, size * 0.16, 0.5);
      const w = { key, sp, shadow, site, pts: null, i: 1, x: site.x, y: site.baseY, speed: rnd(38, 64) * (P.narrow ? 0.75 : 1), state: 'walk', until: 0, temp: !!temp, anim: null };
      if (temp) { const glow = new PIXI.Sprite(S.atlas.named('fx', 'glow')); glow.anchor.set(0.5); h.fitSprite(glow, size * 1.3, size * 1.3); glow.tint = h.hex(site.b.colour); glow.alpha = 0.6; w.glow = glow; layers.walkers.addChild(glow); }
      layers.walkers.addChild(shadow, sp);
      return w;
    }
    function sendWalker(w, from) {
      const others = P.sites.filter((s) => s !== from); const to = others[Math.floor(Math.random() * others.length)] || from;
      w.pts = route(from, to); w.i = 1; w.x = from.x; w.y = from.baseY; w.site = to; w.state = 'walk'; w.sp.alpha = 1; w.shadow.alpha = 0.5;
    }
    function dirName(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'walk-right' : 'walk-left') : (dy > 0 ? 'walk-down' : 'walk-up'); }

    let layers = null;
    function build() {
      if (!S.world || !S.atlas) return;
      C.removeChildren().forEach((c) => c.destroy({ children: true }));
      signsEl.textContent = ''; walkers = []; packets = []; zoom = null; C.scale.set(1); C.pivot.set(0, 0); C.position.set(0, 0); C.alpha = 1;
      const W = app.screen.width, H = app.screen.height;
      P = plan(S.world, W, H);
      layers = { ground: new PIXI.Container(), streets: new PIXI.Container(), sites: new PIXI.Container(), walkers: new PIXI.Container(), fx: new PIXI.Container() };
      C.addChild(layers.ground, layers.streets, layers.sites, layers.walkers, layers.fx);
      const atlas = S.atlas;

      // ground: dark paving with a faint star field through it
      const gt = atlas.named('tiles', 'ground-cobble');
      const ground = new PIXI.TilingSprite({ texture: gt, width: W, height: H }); ground.tileScale.set(1.5); ground.tint = 0x3a3f5c; ground.alpha = 0.3; layers.ground.addChild(ground);
      const st = atlas.named('fx', 'stars');
      const stars = new PIXI.TilingSprite({ texture: st, width: W, height: H }); stars.tileScale.set(2); stars.alpha = 0.12; layers.ground.addChild(stars);

      // streets, then the avenue that joins them
      const hLine = (y, x0, x1) => {
        const t = atlas.named('tiles', 'corr-h'); const k = P.streetH / t.height;
        const s = new PIXI.TilingSprite({ texture: t, width: x1 - x0, height: P.streetH }); s.tileScale.set(k); s.position.set(x0, y - P.streetH / 2); s.tint = 0xa8b4e0; s.alpha = 0.85; layers.streets.addChild(s);
        const e = new PIXI.Graphics(); e.rect(x0, y - P.streetH / 2, x1 - x0, 1).fill({ color: 0x5070f7, alpha: 0.6 }); e.rect(x0, y + P.streetH / 2 - 1, x1 - x0, 1).fill({ color: 0x5070f7, alpha: 0.6 }); layers.streets.addChild(e);
      };
      for (const s of P.streets) hLine(s.y, Math.max(0, P.x0 - 12), W);
      if (P.rows > 1) {
        const t = atlas.named('tiles', 'corr-v'); const k = P.streetH / t.width; const top = P.streets[0].y, bot = P.streets[P.streets.length - 1].y;
        const s = new PIXI.TilingSprite({ texture: t, width: P.streetH, height: bot - top }); s.tileScale.set(k); s.position.set(P.avX - P.streetH / 2, top); s.tint = 0xa8b4e0; s.alpha = 0.85; layers.streets.addChild(s);
      }

      // buildings: a pool of building colour on the ground, a stub to the street, the facade, the sign
      for (const site of P.sites) {
        const b = site.b; const col = h.hex(b.colour);
        const pool = new PIXI.Sprite(atlas.named('fx', 'pool-0')); pool.anchor.set(0.5); pool.width = FACADE_W * P.k * 1.7; pool.height = FACADE_H * P.k * 1.1; pool.tint = col; pool.alpha = 0.3; pool.position.set(site.x, site.baseY - FACADE_H * P.k * 0.32); layers.sites.addChild(pool);
        const stub = new PIXI.Graphics(); const sw = Math.max(6, P.streetH * 0.5); stub.rect(site.x - sw / 2, site.baseY - 4, sw, site.streetY - site.baseY + 2).fill({ color: col, alpha: 0.3 }); layers.sites.addChild(stub);
        const sh = h.shadowSprite(FACADE_W * P.k * 0.85, 14 * P.k + 6, 0.6); sh.position.set(site.x + 4, site.baseY - 2); layers.sites.addChild(sh);
        const f = new PIXI.Sprite(atlas.named('buildings', b.style)); f.anchor.set(0.5, 1); f.scale.set(P.k); f.position.set(site.x, site.baseY); layers.sites.addChild(f);
        site.facade = f; site.pool = pool; site.pulseAt = 0; site.poolAlpha = 0.3; site.top = site.baseY - f.height;
        const el = document.createElement('button'); el.className = 'sign'; el.type = 'button'; el.dataset.id = b.id;
        const name = document.createElement('b'); const dot = document.createElement('i'); if (b.rollup.level) dot.className = b.rollup.level; name.append(dot, document.createTextNode(b.name));
        const sub = document.createElement('small'); sub.textContent = subtitle(b); el.append(name, sub);
        el.addEventListener('click', () => enter(b.id)); signsEl.appendChild(el);
        const sw2 = el.offsetWidth, sh2 = el.offsetHeight;
        const minTop = site.r === 0 ? (P.narrow ? hudEl.offsetTop + hudEl.offsetHeight + 4 : 6) : 4;
        const topY = Math.max(minTop, Math.round(site.top - sh2 - 2));
        el.style.transform = `translate(${clamp(Math.round(site.x - sw2 / 2), 4, W - sw2 - 4)}px, ${topY}px)`;
        site.sign = el;
      }

      // people
      const nWalk = clamp(6 + P.sites.length + Math.floor(S.world.counts.agents / 12), 10, 14);
      for (let i = 0; i < nWalk; i++) {
        const site = P.sites[i % P.sites.length]; const w = makeWalker(site); sendWalker(w, site);
        // start them mid-journey, so the street is busy from the first frame
        const seg = 1 + Math.floor(Math.random() * (w.pts.length - 1)); const a = w.pts[seg - 1], b = w.pts[seg]; const t = Math.random();
        w.i = seg; w.x = a.x + (b.x - a.x) * t; w.y = a.y + (b.y - a.y) * t;
        walkers.push(w);
      }

      // the memory cube at the crossroads
      const size = P.narrow ? 44 : 64;
      const sp = new PIXI.AnimatedSprite(S.atlas.anim('hero-cube', 'hop')); sp.anchor.set(0.5, 1); sp.scale.set(size / sp.texture.height); sp.animationSpeed = REDUCED ? 0 : 0.05; if (!REDUCED) sp.play();
      const glow = new PIXI.Sprite(atlas.named('fx', 'glow')); glow.anchor.set(0.5); h.fitSprite(glow, size * 1.9, size * 1.9); glow.tint = 0x18b4cc; glow.alpha = 0.4;
      const shadow = h.shadowSprite(size * 0.7, size * 0.18, 0.6);
      const y = P.streets[0].y + Math.round(P.streetH * 0.35); // on the crossroads, where the couriers set out from
      cube = { sp, glow, shadow, x: P.avX, y }; layers.walkers.addChild(glow, shadow, sp);
      sp.position.set(cube.x, cube.y); shadow.position.set(cube.x, cube.y); glow.position.set(cube.x, cube.y - size / 2);
    }

    function update(dt) {
      if (!P) return;
      const now = S.now;
      if (zoom) {
        zoom.t = Math.min(1, zoom.t + dt / 0.42); const e = zoom.t * zoom.t * (3 - 2 * zoom.t);
        C.pivot.set(zoom.site.x, zoom.site.baseY - FACADE_H * P.k * 0.5); C.position.set(zoom.site.x + (P.W / 2 - zoom.site.x) * e, zoom.site.baseY - FACADE_H * P.k * 0.5 + (P.H / 2 - (zoom.site.baseY - FACADE_H * P.k * 0.5)) * e);
        C.scale.set(1 + e * 2.4); C.alpha = zoom.t > 0.7 ? 1 - (zoom.t - 0.7) / 0.3 : 1;
        if (zoom.t >= 1) { const id = zoom.site.b.id; zoom = null; h.onEnter(id); }
        return;
      }
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i];
        if (w.state === 'inside') { if (now > w.until) sendWalker(w, w.site); continue; }
        const t = w.pts[w.i]; const dx = t.x - w.x, dy = t.y - w.y; const d = Math.hypot(dx, dy); const step = w.speed * dt * (w.temp ? 2.2 : 1);
        setAnim(w, dirName(dx, dy));
        if (d <= step) {
          w.x = t.x; w.y = t.y; w.i++;
          if (w.i >= w.pts.length) {
            if (w.temp) { w.sp.destroy(); w.shadow.destroy(); if (w.glow) w.glow.destroy(); walkers.splice(i, 1); pulseSite(w.site); continue; }
            w.state = 'inside'; w.until = now + rnd(700, 3200); w.sp.alpha = 0; w.shadow.alpha = 0; continue;
          }
        } else { w.x += dx / d * step; w.y += dy / d * step; }
        const near = w.pts[w.pts.length - 1]; const fade = w.i === w.pts.length - 1 ? clamp(Math.hypot(near.x - w.x, near.y - w.y) / 12, 0, 1) : 1;
        w.sp.alpha = fade; w.shadow.alpha = fade * 0.5;
        w.sp.position.set(Math.round(w.x), Math.round(w.y)); w.shadow.position.set(Math.round(w.x), Math.round(w.y));
        if (w.glow) w.glow.position.set(w.x, w.y - 16);
      }
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i]; const t = p.pts[p.i]; const dx = t.x - p.x, dy = t.y - p.y; const d = Math.hypot(dx, dy); const step = 300 * dt;
        if (d <= step) { p.x = t.x; p.y = t.y; p.i++; if (p.i >= p.pts.length) { p.sp.destroy(); packets.splice(i, 1); continue; } } else { p.x += dx / d * step; p.y += dy / d * step; }
        p.sp.position.set(p.x, p.y - 8);
      }
      for (const s of P.sites) {
        const p = s.pulseAt && now - s.pulseAt < 1600 ? 1 - (now - s.pulseAt) / 1600 : 0;
        const breath = REDUCED ? 0 : 0.04 * Math.sin(now / 900 + s.x);
        s.pool.alpha = s.poolAlpha + breath + p * 0.5 + (hoverId === s.b.id ? 0.16 : 0);
      }
      if (cube && !REDUCED) { const b = Math.abs(Math.sin(now / 340)) * 7; cube.sp.y = cube.y - b; cube.shadow.scale.x = cube.shadow.scale.y = 1; cube.glow.alpha = 0.34 + 0.1 * Math.sin(now / 700); }
    }

    function pulseSite(site) { site.pulseAt = S.now; site.sign.classList.add('flash'); setTimeout(() => site.sign.classList.remove('flash'), 900); }
    // A file changed: a courier leaves the crossroads for that building, and a packet races ahead.
    function pulse(bId) {
      if (!P || REDUCED) { const s0 = P && P.sites.find((s) => s.b.id === bId); if (s0) pulseSite(s0); return; }
      const site = P.sites.find((s) => s.b.id === bId); if (!site) return;
      pulseSite(site);
      if (packets.length < 16) { const pts = fromHub(site); const sp = new PIXI.Sprite(S.atlas.named('fx', 'packet')); sp.anchor.set(0.5); h.fitSprite(sp, 14, 14); sp.tint = h.hex(site.b.colour); sp.position.set(pts[0].x, pts[0].y); layers.fx.addChild(sp); packets.push({ sp, pts, i: 1, x: pts[0].x, y: pts[0].y }); }
      if (walkers.filter((w) => w.temp).length < 6) { const w = makeWalker(site, true); w.pts = fromHub(site); w.i = 1; w.x = w.pts[0].x; w.y = w.pts[0].y; walkers.push(w); }
    }
    function hit(x, y) {
      if (!P) return null;
      for (const s of P.sites) { const w = s.facade.width / 2; if (x >= s.x - w && x <= s.x + w && y >= s.top && y <= s.baseY + 6) return s.b.id; }
      return null;
    }
    function enter(id) {
      const site = P && P.sites.find((s) => s.b.id === id); if (!site || zoom) return;
      if (REDUCED) { h.onEnter(id); return; }
      signsEl.classList.add('leaving'); zoom = { site, t: 0 };
    }
    function hover(id) { hoverId = id; }
    function reset() { signsEl.classList.remove('leaving'); build(); }
    function refreshSigns() { if (!P) return; for (const s of P.sites) { const b = S.buildingById[s.b.id]; if (!b) continue; s.b = b; const dot = s.sign.querySelector('i'); dot.className = b.rollup.level || ''; s.sign.querySelector('small').textContent = subtitle(b); } }
    return { C, build, update, pulse, hit, enter, hover, reset, refreshSigns };
  };
})(globalThis);
