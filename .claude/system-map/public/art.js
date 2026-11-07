/* System Map art loader. Every sprite is a packed 1:1 pixel sheet (<name>.png plus <name>.json) in
   public/art, declared in art-manifest.json. Sampled nearest-neighbour, never mipmapped. */
(function (root) {
  'use strict';
  async function loadSheet(PIXI, alias, base) {
    const meta = await (await fetch(base + '.json')).json();
    const t = await PIXI.Assets.load({ src: base + '.png', data: { scaleMode: 'nearest' } });
    t.source.scaleMode = 'nearest'; t.source.autoGenerateMipmaps = false;
    const cells = {};
    for (const [name, f] of Object.entries(meta.frames)) cells[Number(name.split(':')[1])] = { texture: new PIXI.Texture({ source: t.source, frame: new PIXI.Rectangle(f.x, f.y, f.w, f.h) }), meta: f };
    return [alias, cells];
  }
  async function load(PIXI, manifestUrl) {
    PIXI.Assets.setPreferences({ preferWorkers: false }); // the worker uses a blob URL, which the page's policy refuses
    const manifest = await (await fetch(manifestUrl)).json();
    const sheets = Object.fromEntries(await Promise.all(Object.entries(manifest.sheets).map(([alias, base]) => loadSheet(PIXI, alias, base))));
    const singles = {};
    for (const [name, src] of Object.entries(manifest.singles)) { const t = await PIXI.Assets.load({ src, data: { scaleMode: 'nearest' } }); t.source.scaleMode = 'nearest'; singles[name] = t; }
    // Soft light is drawn here: smooth gradients are the one thing a pixel sheet cannot hold.
    const soft = (draw, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return PIXI.Texture.from(c); };
    const radial = (stops) => (ctx, w, h) => { const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); stops.forEach(([p, a]) => g.addColorStop(p, `rgba(255,255,255,${a})`)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
    singles['glow'] = soft(radial([[0, 0.9], [0.35, 0.45], [1, 0]]), 128, 128);
    singles['pool-0'] = soft(radial([[0, 0.8], [0.55, 0.3], [1, 0]]), 256, 256);
    singles['pool-1'] = singles['pool-0'];
    singles['shadow-ellipse'] = soft(radial([[0, 1], [0.6, 0.7], [1, 0]]), 128, 128);
    const ref = (r) => { const [a, i] = r.split(':'); const c = sheets[a] && sheets[a][Number(i)]; return c ? c.texture : PIXI.Texture.WHITE; };
    return {
      manifest,
      named(group, name) { if (singles[name]) return singles[name]; const r = manifest.names[group] && manifest.names[group][name]; return r ? ref(r) : PIXI.Texture.WHITE; },
      cell(alias, i) { const c = sheets[alias] && sheets[alias][i]; return c ? c.texture : null; },
      cellMeta(alias, i) { const c = sheets[alias] && sheets[alias][i]; return c ? c.meta : null; },
      anim(key, name) {
        const group = manifest.anims[key]; if (group && group[name]) return group[name].map(ref);
        const n = manifest.mirror[name] || name; const list = manifest.frames[n] || manifest.frames.idle;
        return list.map((i) => this.cell(key, i) || PIXI.Texture.WHITE);
      },
      hasAnim(key, name) { const group = manifest.anims[key]; return group ? !!group[name] : !!(manifest.frames[manifest.mirror[name] || name]); },
      mirrored(key, name) { return !manifest.anims[key] && !!manifest.mirror[name]; },
    };
  }
  root.WorldArt = { load };
})(globalThis);
