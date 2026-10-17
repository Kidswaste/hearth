/* Portable project formats and deterministic generators. No runtime / filesystem dependencies. */
(function(root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.WorkbenchCore = api; })(globalThis, () => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(+v) ? +v : a));
  const copy = x => JSON.parse(JSON.stringify(x));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const colors = ['#141319', '#a9a3af', '#ff547d', '#ffbe59', '#b78aff', '#f1edf4'];
  function level() {
    const cells = Array.from({ length: 16 }, (_, y) => Array.from({ length: 24 }, (_, x) => x === 0 || y === 0 || x === 23 || y === 15 ? 1 : 0));
    cells[13][2] = 2; cells[2][21] = 3; cells[8][8] = 4; cells[4][17] = 4; cells[9][16] = 5;
    return { title: 'A little detour', mode: 'explore', speed: 4, gravity: 18, jump: 8, cells, accent: '#ff547d' };
  }
  function defaults() { return { v: 1, title: 'Untitled workbench', texture: { seed: 12, scale: 5, detail: 4, contrast: 1.3, strength: 3, roughness: .6, kind: 'cloud', color: '#b78aff', size: 256 }, game: level(), drawing: { strokes: [], color: '#ff547d', width: 8, mirror: false, background: '#141319' }, storyboard: { title: 'A small world', panels: [{ title: 'An unexpected signal', notes: 'Wide shot. Let the scene breathe.', duration: 3, image: null }, { title: 'Move closer', notes: 'A detail catches the light.', duration: 2, image: null }, { title: 'The reveal', notes: 'Hold the final frame.', duration: 4, image: null }] }, synth: { wave: 'saw', attack: .02, decay: .3, sustain: .55, release: .7, detune: 7, cutoff: 4500, drive: .12, echo: .18, shimmer: .12, crush: 0, tremolo: .1, note: 60, seconds: 2 }, vst: { roots: [], favorites: [], presets: [], selected: '', patch: null }, shelf: [] }; }
  function validate(raw) {
    if (!raw || raw.v !== 1 || JSON.stringify(raw).length > 64e6) throw Error('Not a supported workbench project (v1, up to 64 MB).');
    const d = defaults(), r = copy(raw);
    if (!r.game || !Array.isArray(r.game.cells) || r.game.cells.length !== 16 || r.game.cells.some(row => !Array.isArray(row) || row.length !== 24 || row.some(n => !Number.isInteger(n) || n < 0 || n > 5))) throw Error('Invalid 24 × 16 game level.');
    if (!r.drawing || !Array.isArray(r.drawing.strokes) || r.drawing.strokes.length > 400 || r.drawing.strokes.some(s => !/^#[\da-f]{6}$/i.test(s.color) || !Number.isFinite(s.width) || s.width < 1 || s.width > 80 || !Array.isArray(s.points) || s.points.length > 2000 || s.points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(x => !Number.isFinite(x) || x < 0 || x > 512)))) throw Error('Invalid drawing.');
    if (!r.storyboard || !Array.isArray(r.storyboard.panels) || r.storyboard.panels.length < 1 || r.storyboard.panels.length > 24 || r.storyboard.panels.some(p => typeof p.title !== 'string' || typeof p.notes !== 'string' || !Number.isFinite(p.duration) || p.duration < .25 || p.duration > 30 || (p.image && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image)))) throw Error('Invalid storyboard panels.');
    if (!r.texture || !/^#[\da-f]{6}$/i.test(r.texture.color) || !['cloud', 'stone', 'wood', 'metal', 'cells'].includes(r.texture.kind)) throw Error('Invalid texture.');
    for (const key of ['seed', 'scale', 'detail', 'contrast', 'strength', 'roughness', 'size']) if (!Number.isFinite(r.texture[key])) throw Error('Invalid texture controls.');
    if (![128, 256, 512].includes(r.texture.size)) throw Error('Choose a 128, 256 or 512 texture.');
    r.texture.scale = clamp(Math.round(r.texture.scale), 1, 12); r.texture.detail = clamp(Math.round(r.texture.detail), 1, 6); r.texture.contrast = clamp(r.texture.contrast, .2, 3); r.texture.strength = clamp(r.texture.strength, 0, 10); r.texture.roughness = clamp(r.texture.roughness, 0, 1);
    r.game.speed = clamp(r.game.speed, 1, 8); r.game.gravity = clamp(r.game.gravity, 8, 30); r.game.jump = clamp(r.game.jump, 4, 12); r.game.mode = r.game.mode === 'platform' ? 'platform' : 'explore'; r.game.title = String(r.game.title).slice(0, 100); r.game.accent = /^#[\da-f]{6}$/i.test(r.game.accent) ? r.game.accent : d.game.accent;
    r.synth = { ...d.synth, ...r.synth }; if (!['sine', 'saw', 'triangle', 'square'].includes(r.synth.wave)) r.synth.wave = 'sine';
    r.vst = { ...d.vst, ...r.vst }; if (!Array.isArray(r.vst.roots) || !Array.isArray(r.vst.favorites) || !Array.isArray(r.vst.presets) || r.vst.presets.length > 12) throw Error('Invalid plugin bank.');
    if (r.vst.roots.length > 12 || r.vst.roots.some(p => typeof p !== 'string') || r.vst.favorites.some(p => typeof p !== 'string') || r.vst.presets.some(p => !p || typeof p.label !== 'string' || typeof p.path !== 'string' || typeof p.name !== 'string' || typeof p.state !== 'string' || p.state.length > 12e6) || r.vst.presets.reduce((n, p) => n + p.state.length, 0) > 9e6) throw Error('Invalid or oversized preset bank.');
    r.drawing.color = /^#[\da-f]{6}$/i.test(r.drawing.color) ? r.drawing.color : d.drawing.color; r.drawing.width = clamp(r.drawing.width, 1, 80); r.drawing.mirror = r.drawing.mirror === true;
    r.shelf = Array.isArray(r.shelf) ? r.shelf.slice(0, 24) : [];
    if (r.shelf.some(p => !p || typeof p.name !== 'string' || typeof p.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image))) throw Error('Invalid worktable asset.');
    r.title = String(r.title || d.title).slice(0, 100); return r;
  }
  // Periodic value noise: every octave wraps on an integer lattice, including derivative maps.
  function texture(o) {
    const n = o.size, scale = Math.round(clamp(o.scale, 1, 12)), detail = Math.round(clamp(o.detail, 1, 6));
    const hash = (x, y) => { let a = Math.imul(x + 374761393, 668265263) ^ Math.imul(y, 1274126177) ^ (o.seed | 0); a = Math.imul(a ^ a >>> 13, 1274126177); return ((a ^ a >>> 16) >>> 0) / 4294967295; };
    const noise = (u, v, freq) => { const x = u * freq, y = v * freq, ix = Math.floor(x), iy = Math.floor(y), sx = x - ix, sy = y - iy, a = sx * sx * (3 - 2 * sx), b = sy * sy * (3 - 2 * sy), at = (i, j) => hash((i + freq) % freq, (j + freq) % freq); return (at(ix, iy) * (1 - a) + at(ix + 1, iy) * a) * (1 - b) + (at(ix, iy + 1) * (1 - a) + at(ix + 1, iy + 1) * a) * b; };
    const h = new Float32Array(n * n), maps = Object.fromEntries(['color', 'height', 'normal', 'roughness'].map(k => [k, new Uint8ClampedArray(n * n * 4)]));
    const rgb = [1, 3, 5].map(i => parseInt(o.color.slice(i, i + 2), 16));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n; let value = 0, amp = 1, total = 0;
      for (let k = 0; k < detail; k++) { value += noise(u, v, scale * 2 ** k) * amp; total += amp; amp *= .5; } value /= total;
      if (o.kind === 'wood') value = .5 + .5 * Math.sin(2 * Math.PI * (u * scale + .6 * Math.sin(v * 2 * Math.PI) + value * .6));
      if (o.kind === 'metal') value = .65 * noise(u, v, scale * 8) + .35 * Math.sin(v * 2 * Math.PI * scale * 8);
      if (o.kind === 'stone') value = Math.abs(value * 2 - 1);
      if (o.kind === 'cells') value = 1 - Math.abs(Math.sin(u * scale * Math.PI) * Math.sin(v * scale * Math.PI));
      h[y * n + x] = clamp((value - .5) * o.contrast + .5, 0, 1);
    }
    const at = (x, y) => h[((y + n) % n) * n + (x + n) % n];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, p = i * 4, value = h[i], dx = (at(x - 1, y) - at(x + 1, y)) * o.strength * 4, dy = (at(x, y - 1) - at(x, y + 1)) * o.strength * 4, z = Math.hypot(dx, dy, 1);
      for (let c = 0; c < 3; c++) { maps.color[p + c] = rgb[c] * (.24 + value * .76); maps.height[p + c] = value * 255; maps.roughness[p + c] = clamp(o.roughness + (value - .5) * .35, 0, 1) * 255; }
      maps.normal[p] = (dx / z * .5 + .5) * 255; maps.normal[p + 1] = (dy / z * .5 + .5) * 255; maps.normal[p + 2] = (1 / z * .5 + .5) * 255;
      Object.values(maps).forEach(m => { m[p + 3] = 255; });
    }
    return maps;
  }
  function drawingSVG(d, repeat = false) {
    const paths = d.strokes.map(s => `<path d="${s.points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}${s.points.length === 1 ? 'l.1 0' : ''}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${repeat ? `<defs><pattern id="draw" width="128" height="128" patternUnits="userSpaceOnUse"><g transform="scale(.25)">${paths}</g></pattern></defs><rect width="512" height="512" fill="url(#draw)"/>` : paths}</svg>`;
  }
  function patch(metadata, incoming) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || Object.keys(incoming).length > 512) throw Error('A patch must be a parameter object (up to 512 controls).');
    const out = {};
    for (const [key, value] of Object.entries(incoming)) {
      const p = metadata.find(p => p.key === key); if (!p) throw Error(`Unknown parameter: ${key}`);
      if (typeof p.value === 'boolean') { if (typeof value !== 'boolean') throw Error(`Expected true/false: ${key}`); }
      else if (typeof p.value === 'number') { if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) throw Error(`Outside range: ${key} (${p.min}–${p.max})`); }
      else if (!p.choices.includes(value)) throw Error(`Unsupported choice: ${key}`);
      out[key] = value;
    } return out;
  }
  function synth(p, sr = 44100) {
    const seconds = clamp(p.seconds, .2, 8), attack = clamp(p.attack, .001, 3), decay = clamp(p.decay, .01, 3), release = clamp(p.release, .02, 4), sustain = clamp(p.sustain, 0, 1), frequency = 440 * 2 ** ((clamp(p.note, 24, 96) - 69) / 12);
    const out = new Float32Array(Math.ceil((seconds + release + 1) * sr)); let low = 0, phase = 0, phase2 = 0;
    const dt = frequency / sr, dt2 = dt * 2 ** (clamp(p.detune, 0, 30) / 1200), alpha = 1 - Math.exp(-2 * Math.PI * clamp(p.cutoff, 80, 16000) / sr), echo = Math.floor(.27 * sr);
    const blep = (t, step) => t < step ? (t /= step, 2 * t - t * t - 1) : t > 1 - step ? (t = (t - 1) / step, t * t + 2 * t + 1) : 0;
    const wave = (t, step) => p.wave === 'saw' ? 2 * t - 1 - blep(t, step) : p.wave === 'square' ? (t < .5 ? 1 : -1) + blep(t, step) - blep((t + .5) % 1, step) : p.wave === 'triangle' ? 1 - 4 * Math.abs(t - .5) : Math.sin(t * Math.PI * 2);
    const envAt = t => t < attack ? t / attack : t < attack + decay ? 1 - (1 - sustain) * (t - attack) / decay : sustain;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, env = t < seconds ? envAt(t) : envAt(seconds) * Math.max(0, 1 - (t - seconds) / release);
      const raw = (wave(phase, dt) + wave(phase2, dt2)) * .25 * env; phase = (phase + dt) % 1; phase2 = (phase2 + dt2) % 1;
      low += alpha * (raw - low); let sample = Math.tanh(low * (1 + clamp(p.drive, 0, 1) * 8)) * .6;
      sample *= 1 - clamp(p.tremolo, 0, 1) * (.5 + .5 * Math.sin(t * Math.PI * 10));
      sample += Math.sin(t * frequency * 4 * Math.PI) * env * clamp(p.shimmer, 0, 1) * .13;
      if (p.crush > .01) { const steps = 2 ** (16 - clamp(p.crush, 0, 1) * 12); sample = Math.round(sample * steps) / steps; }
      out[i] = clamp(sample + (i >= echo ? out[i - echo] * clamp(p.echo, 0, .7) : 0), -.98, .98);
    } return out;
  }
  function gameIssues(g) { const flat = g.cells.flat(); return [...(flat.filter(x => x === 2).length !== 1 ? ['Place exactly one player.'] : []), ...(!flat.includes(3) ? ['Place at least one exit.'] : [])]; }
  // Function is serialized with its data for a standalone, offline game.
  function gameRuntime(g) {
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d'), status = document.querySelector('#status'), keys = new Set(), tile = 32;
    let cells, x, y, vy, gems, target, last = 0, playing = false, grounded = false;
    function reset() { cells = g.cells.map(r => r.slice()); gems = 0; target = cells.flat().filter(v => v === 4).length; cells.forEach((r, j) => r.forEach((v, i) => { if (v === 2) { x = i + .15; y = j + .15; cells[j][i] = 0; } })); vy = 0; playing = true; last = 0; status.textContent = 'Find every spark, then reach the exit.'; }
    const solid = (xx, yy) => { for (const a of [xx, xx + .69]) for (const b of [yy, yy + .69]) { const i = Math.floor(a), j = Math.floor(b); if (i < 0 || j < 0 || i >= 24 || j >= 16 || cells[j][i] === 1) return true; } return false; };
    function frame(time) {
      const dt = Math.min(.035, last ? (time - last) / 1000 : 0); last = time;
      if (playing && !document.hidden) {
        const horizontal = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
        const nx = x + horizontal * g.speed * dt; if (!solid(nx, y)) x = nx;
        if (g.mode === 'platform') { if (grounded && (keys.has(' ') || keys.has('ArrowUp') || keys.has('w'))) vy = -g.jump; vy += g.gravity * dt; }
        else vy = (Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'))) * g.speed;
        const steps = Math.max(1, Math.ceil(Math.abs(vy * dt) / .2)), travel = vy * dt / steps; grounded = false;
        for (let step = 0; step < steps; step++) { const ny = y + travel; if (!solid(x, ny)) y = ny; else { grounded = vy >= 0; vy = 0; break; } }
        const i = Math.floor(x + .35), j = Math.floor(y + .35), cell = cells[j]?.[i];
        if (cell === 4) { cells[j][i] = 0; gems++; status.textContent = `${gems}/${target} sparks`; }
        if (cell === 5) { playing = false; status.textContent = 'Caught by the static. Try again.'; }
        if (cell === 3 && gems === target) { playing = false; status.textContent = 'Complete! Your little world works.'; }
      }
      ctx.fillStyle = '#131217'; ctx.fillRect(0, 0, 768, 512);
      cells?.forEach((row, j) => row.forEach((v, i) => { ctx.fillStyle = ['#19171f', '#605a6c', '#fff', '#b78aff', '#ffbe59', '#ff547d'][v]; ctx.fillRect(i * tile + 1, j * tile + 1, tile - 2, tile - 2); if (v === 3 || v === 4) { ctx.fillStyle = '#17141a'; ctx.font = '22px sans-serif'; ctx.fillText(v === 3 ? '↗' : '✦', i * tile + 6, j * tile + 24); } }));
      ctx.fillStyle = g.accent; ctx.fillRect(x * tile, y * tile, 22, 22); requestAnimationFrame(frame);
    }
    document.querySelector('#start').onclick = reset;
    addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key)) { e.preventDefault(); keys.add(e.key); } });
    addEventListener('keyup', e => keys.delete(e.key)); addEventListener('blur', () => keys.clear()); document.addEventListener('visibilitychange', () => { keys.clear(); last = 0; });
    document.querySelectorAll('[data-key]').forEach(b => { b.onpointerdown = e => { b.setPointerCapture(e.pointerId); keys.add(b.dataset.key); }; b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => keys.delete(b.dataset.key); });
    reset(); playing = false; status.textContent = 'Press Play. Arrow keys / WASD. Space to jump.'; requestAnimationFrame(frame);
  }
  function gameHTML(g) { if (gameIssues(g).length) throw Error(gameIssues(g).join(' ')); const json = JSON.stringify(g).replace(/</g, '\\u003c'); return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(g.title)}</title><style>body{background:#131217;color:#eee;font:16px system-ui;text-align:center}canvas{width:min(100%,768px);image-rendering:pixelated;border-radius:16px}button{padding:12px 24px;background:#302a39;color:#fff;border:1px solid #776786;border-radius:10px;touch-action:none}h1{font-size:20px}</style><h1>${esc(g.title)}</h1><button id="start">Play / restart</button><p id="status"></p><canvas width="768" height="512"></canvas><p><button data-key="ArrowLeft">←</button> <button data-key="ArrowUp">↑ / jump</button> <button data-key="ArrowDown">↓</button> <button data-key="ArrowRight">→</button></p><script>(${gameRuntime.toString()})(${json})</script>`; }
  return { defaults, validate, copy, esc, clamp, colors, texture, drawingSVG, patch, synth, level, gameIssues, gameHTML };
});
