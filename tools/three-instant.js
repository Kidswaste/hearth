// "Describe it" (round 29, instantscene): a scene from your words with zero tokens. You write a sentence ("dreamy pink
// chrome tunnel that pulses on the kick, slow"); it is matched on this computer (tools/three-instant-core.js with the
// hand-written vocabulary in three-instant-data.js, no model call) against everything Hearth already has: the gallery's
// starting points and library, the particles / physics / type presets, the ◐ Grade looks, the palettes and labaudio's
// music reactions. Three different picks show as cards (a picture, what was matched, why); one click opens a pick as a
// new scene with its sliders set from the words (colors, speed, intensity, music) and the matched look on top. Then,
// only if you want, "✦ Ask the director to take it further", with the cost shown first.
// Loads with the gallery (lazy group "gallery"); the ways in live in tools/three-instant-hook.js (loaded with the Lab):
// the gallery's search ("Make it from my words" when it reads like a description), the empty Lab, the ◎ mission
// "Make it from my words", ✦ More › ✨ Look & motion › ✦ Describe it…, and /describe (the app's internal API).
// Pictures: each pick is drawn in the gallery's ONE shared preview page, one at a time, then the page sleeps.
const LabInstant = (() => {
  const C = InstantCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the Lab's modules (const globals, guarded: a missing one just leaves its part out)
  const M = {
    ThreeLayers: () => (typeof ThreeLayers !== 'undefined' ? ThreeLayers : null), ParticleData: () => (typeof ParticleData !== 'undefined' ? ParticleData : null),
    PhysicsData: () => (typeof PhysicsData !== 'undefined' ? PhysicsData : null), TypeData: () => (typeof TypeData !== 'undefined' ? TypeData : null),
    GradeCore: () => (typeof GradeCore !== 'undefined' ? GradeCore : null), ThreeFXData: () => (typeof ThreeFXData !== 'undefined' ? ThreeFXData : null),
    ThreeAudioMap: () => (typeof ThreeAudioMap !== 'undefined' ? ThreeAudioMap : null), ThreeAudio: () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio : null),
    LabParticles: () => (typeof LabParticles !== 'undefined' ? LabParticles : null), LabPhysics: () => (typeof LabPhysics !== 'undefined' ? LabPhysics : null),
    LabType: () => (typeof LabType !== 'undefined' ? LabType : null),
  };
  const glob = (name) => M[name]?.() || null;

  // ---------- what Hearth has (read once per window) ----------
  function sources() {
    return {
      starts: LabGalleryData.STARTS, moods: LabGalleryData.MOODS, templates: glob('ThreeLayers')?.TEMPLATES || [],
      particles: glob('ParticleData')?.PRESETS || [], physics: glob('PhysicsData')?.PRESETS || [], type: glob('TypeData')?.PRESETS || [],
      grades: glob('GradeCore')?.PRESETS || [], palettes: glob('ThreeFXData')?.PALETTES || [], reactions: glob('ThreeAudioMap')?.PRESETS || [],
    };
  }
  let SRC = null; let BASES = null;
  const src = () => { if (!SRC) { SRC = sources(); BASES = C.catalog(SRC); } return SRC; };
  const plan = (text, offset = 0) => { src(); return C.plan(text, SRC, { bases: BASES, offset }); };

  // ---------- a pick → Lab layers (bottom first) ----------
  const darkPal = (cols) => [...cols].sort((a, b) => C.lum(a) - C.lum(b)).map((c, i) => mixHex(c, '#000000', [0.82, 0.62, 0.45, 0.35][i] ?? 0.3));
  function mixHex(a, b, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const A = p(a); const B = p(b);
    return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
  }
  function backdrop(pick) {
    const cols = pick.palette?.colors?.length >= 4 ? darkPal(pick.palette.colors) : ['#05040a', '#160a2a', '#3a1450', '#0b2b45'];
    return { name: 'Backdrop', code: LabGalleryData.NEW.LIQUID({ c1: cols[0], c2: cols[1], c3: cols[2], c4: cols[3], sheen: 0, speed: 0.12, grain: 0.4, punch: 0.2 }), backdrop: true };
  }
  function baseLayers(pick) {
    const b = pick.base;
    if (b.kind === 'start') return LabGalleryData.layersOf(LabGalleryData.STARTS.find((s) => s.id === b.id));
    if (b.kind === 'lib') { const t = ThreeLayers.TEMPLATES.find((x) => x.id === b.id); return t ? [{ name: b.name, code: t.code }] : []; }
    const mod = { particles: glob('LabParticles'), physics: glob('LabPhysics'), type: glob('LabType') }[b.kind];
    const p = SRC[b.kind].find((x) => x.id === b.id);
    if (!mod?.codeFor || !p) return [];
    const opts = b.kind === 'type' ? { text: (pick.quoted || pick.name || 'HEARTH').toUpperCase().slice(0, 40) } : {};
    const own = { name: p.name, code: mod.codeFor(p, { opts }) };
    return b.kind === 'physics' ? [own] : [backdrop(pick), own];
  }
  // the words on the sliders (a filter keeps its colors; the backdrop keeps its darkened palette), the look on top
  function layersOf(pick) {
    const out = [];
    for (const L of baseLayers(pick)) {
      const t = C.tune(L.code, { palette: L.filter || L.backdrop ? null : pick.palette?.colors, speed: pick.speed, intensity: L.backdrop ? 1 : pick.intensity, features: pick.features, still: pick.still });
      out.push({ ...L, code: t.code, changed: t.changed.length });
    }
    const G = glob('GradeCore');
    if (pick.grade && G) {
      const pv = G.presetValues(pick.grade.id);
      if (pv?.lens) out.push({ name: G.NAMES.lens, code: G.code('lens', pv.lens), filter: true });
      if (pv) out.push({ name: G.NAMES.grade, code: G.code('grade', pv.grade), filter: true });
    }
    return out;
  }
  // the layer the music reaction goes on: the top layer that isn't a filter or the backdrop
  const subjectOf = (Ls) => [...Ls].reverse().find((L) => !L.filter && !L.backdrop && L.name !== 'Backdrop' && L.name !== 'Haze' && L.name !== 'Deep space') || Ls[Ls.length - 1];

  // ---------- opening a pick ----------
  const S = { last: null }; // { pick, text, scene, react, at }
  async function make(pick, text) {
    const Ls = layersOf(pick);
    if (!Ls.length) throw new Error(`"${pick.base.name}" isn't available here`);
    const item = { key: `i:${pick.base.key}`, kind: 'start', name: pick.name, layers: async () => Ls };
    const r = await LabGallery.use(item, 'scene');
    const d = ThreeLab.director;
    if (pick.palette?.colors?.length) { try { d.refs?.setPalette?.(pick.palette.colors.slice(0, 16)); } catch { /* the sketch keeps its palette */ } }
    S.last = { pick, text, scene: r.scene, id: r.id, react: null, at: Date.now() };
    if (pick.reaction) S.last.react = await react(pick, subjectOf(Ls).name).catch(() => null);
    card();
    return { ...r, layers: Ls.map((L) => L.name), react: S.last.react };
  }
  // the music reaction (labaudio's preset) on the subject's best slider, once the scene's sliders are up
  async function react(pick, name) {
    const AM = glob('ThreeAudioMap'); const A = glob('ThreeAudio');
    if (!AM || !A) return null;
    const p = AM.PRESETS.find((x) => x.id === pick.reaction.id);
    if (!p) return null;
    for (let i = 0; i < 60; i += 1) {
      const L = A.lab?.layers?.().find((x) => x.name === name) || null;
      if (L?.ctl?.controls?.().some((c) => c.min != null)) {
        const r = AM.applyPreset(L.ctl, p);
        return r.error ? null : { preset: p.name, slider: r.label, layer: name };
      }
      await sleep(150);
    }
    return null;
  }

  // ---------- after: the small card over the preview (ask the director, cost first) ----------
  let made = null;
  function card() {
    made?.remove(); made = null;
    const l = S.last;
    const host = ThreeLab.scenes?.previewHost?.();
    if (!l || !host) return;
    const b = C.brief(l.pick, l.text);
    const tokens = C.cost(b);
    made = el('div', { class: 'lab-inst-made', attrs: { role: 'status' } },
      el('div', { class: 'lab-inst-made-t' }, el('b', { text: '✦ Made from your words' }), el('span', { class: 'muted', text: ' · 0 tokens' })),
      el('div', { class: 'lab-inst-made-why', text: l.pick.why.join(' · ') + (l.react ? ` (on ${l.react.slider})` : '') }),
      el('div', { class: 'lab-inst-made-row' },
        el('button', { type: 'button', class: 'lab-inst-btn lab-inst-ask', text: `✦ Ask the director to take it further · ≈${tokens} tokens`, title: 'Your words and what was made go to the Three Director (shown first); then its reply and the work it does', on: { click: () => ask().catch((err) => toast(err.message, { type: 'error' })) } }),
        el('button', { type: 'button', class: 'lab-inst-btn', text: 'Other picks', title: 'The 3 picks again', on: { click: () => { const t = l.text; closeCard(); open({ text: t }); } } }),
        el('button', { type: 'button', class: 'lab-inst-btn lab-inst-x', text: '✕', title: 'Close', on: { click: () => closeCard() } })));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(made);
    clearTimeout(card.t); card.t = setTimeout(() => closeCard(), 60000);
  }
  function closeCard() { made?.remove(); made = null; }
  // another scene on screen: the card goes (it was about the scene made from your words)
  addEventListener('hearth:sketch', () => setTimeout(() => { if (made && ThreeLab.scenes?.currentId?.() !== S.last?.id) closeCard(); }, 200));
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function ask({ confirm = true, note = '' } = {}) {
    const l = S.last;
    if (!l) throw new Error('Make a scene from your words first (✦ Describe it).');
    const text = C.brief(l.pick, l.text) + (note ? `\n\n${note}` : '');
    const tokens = C.cost(text);
    let dir = directorOf();
    if (confirm) {
      const yes = await Modal.confirm('Ask the director to take it further?', `${dir?.name || 'The Three Director'} gets your words and what was made (≈${tokens} tokens with this message), plus its usual context, its reply and the work it does. Until now this scene cost 0 tokens.`, { ok: `Ask (≈${tokens} tokens)` });
      if (!yes) return false;
    }
    if (!dir) {
      await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'instantscene', say: () => {}, note: () => {} });
      for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
      dir = directorOf();
      if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    }
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    closeCard();
    await Native.send(dir.id, text);
    l.asked = { at: Date.now(), agentId: dir.id, tokens };
    return true;
  }

  // ---------- the window: your words, 3 picks ----------
  let dlg = null; let cur = null; let offset = 0; let onPick = null; let picked = false; let gen = 0; let thumbs = null; let drawErr = null;
  async function loadThumbs() { if (!thumbs) { try { thumbs = (await window.hub.kvGet('lab-gallery-thumbs', {})) || {}; } catch { thumbs = {}; } } return thumbs; }
  const cachedPic = (b) => { const k = Object.keys(thumbs || {}).find((x) => x.startsWith(`${b.key}|`)); return k ? thumbs[k].url : null; };
  async function open({ text = '', onPick: fn = null } = {}) {
    if (dlg) close();
    await loadThumbs();
    onPick = fn; picked = false; offset = 0;
    const input = el('input', { class: 'lab-gal-search lab-inst-input', attrs: { type: 'text', placeholder: 'Describe it: dreamy pink chrome tunnel that pulses on the kick, slow', 'aria-label': 'Describe the scene', spellcheck: 'false' } });
    input.value = text;
    const grid = el('div', { class: 'lab-inst-grid' });
    const read = el('div', { class: 'lab-inst-read muted small' });
    const more = el('button', { type: 'button', class: 'ghost small', text: '↻ 3 more', title: 'The next 3 picks for the same words', on: { click: () => { offset += 3; paint(); } } });
    dlg = el('dialog', { class: 'lab-gal-dlg lab-inst-dlg', attrs: { 'aria-label': 'Describe it' } },
      el('div', { class: 'lab-gal-head' }, el('h2', { text: '✦ Describe it' }), input, el('button', { type: 'button', class: 'ghost small lab-gal-x', title: 'Close (Esc)', text: '✕', on: { click: () => close() } })),
      read, grid,
      el('div', { class: 'lab-gal-foot' }, el('span', { class: 'muted small', text: 'Matched on this computer from the gallery, the library, looks, palettes and music reactions: 0 tokens. Click a pick: a new scene.' }), el('span', { class: 'spacer' }), more));
    const shade = el('div', { class: 'lab-gal-shade', on: { pointerdown: (e) => { e.preventDefault(); close(); } } });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target === input && cur?.picks[0]) { e.preventDefault(); choose(0); }
    });
    document.body.append(shade, dlg);
    dlg.show();
    input.focus();
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { offset = 0; paint(); }, 160); });
    paint();

    function paint() {
      const q = input.value.trim();
      gen += 1;
      const mine = gen;
      if (!q) { cur = null; read.textContent = 'A few words: what it is, its colors, how fast, what it does with the music.'; grid.replaceChildren(); more.disabled = true; return; }
      cur = plan(q, offset);
      const r = cur.read;
      read.textContent = r.matched.length ? `Understood: ${r.matched.join(' · ')}${r.unknown.length ? ` · also searched: ${r.unknown.slice(0, 5).join(', ')}` : ''}` : `Nothing in the vocabulary yet: searched ${r.unknown.slice(0, 6).join(', ') || 'your words'} (here are close starting points)`;
      more.disabled = !cur.more;
      grid.replaceChildren(...cur.picks.map((p, i) => cardEl(p, i)));
      drawPictures(mine);
    }
  }
  function cardEl(p, i) {
    const img = el('img', { class: 'lab-gal-img', attrs: { alt: '', draggable: 'false' } });
    const pic = el('div', { class: 'lab-gal-pic lab-inst-pic' }, img, el('span', { class: 'lab-gal-wait', text: '…' }));
    const cols = p.palette?.colors || [];
    if (cols.length) pic.style.background = `linear-gradient(160deg, ${cols.join(', ')})`;
    const url = cachedPic(p.base);
    if (url) { img.src = url; pic.classList.add('has', 'base'); }
    const strip = cols.length ? el('div', { class: 'lab-inst-pal', title: p.palette.name }, cols.map((c) => { const s = el('span'); s.style.background = c; return s; })) : null;
    const chips = el('div', { class: 'lab-inst-chips' }, [...p.hits.slice(0, 4), ...(p.palette && p.palette.cat !== 'yours' ? [p.palette.name] : []), ...(p.grade ? [p.grade.name] : []), ...(p.reaction ? [`♪ ${p.reaction.name}`] : [])].map((w) => el('span', { class: 'lab-inst-chip', text: w })));
    const kind = { start: 'Starting point', lib: 'Library', particles: 'Particles', physics: 'Physics', type: 'Type' }[p.base.kind];
    return el('button', { type: 'button', class: 'lab-gal-card lab-inst-card', dataset: { i: String(i) }, title: `${p.base.name}: ${p.base.desc}`, on: { click: () => choose(i) } },
      pic, strip,
      el('span', { class: 'lab-gal-name', text: p.name === p.base.name ? p.name : `${p.name}` }),
      el('span', { class: 'lab-inst-from muted small', text: `${kind} · ${p.base.name}` }),
      chips,
      el('span', { class: 'lab-inst-why', text: p.why.join(' · ') }));
  }
  // each pick drawn as it will open (its tuned layers + look), one at a time in the gallery's shared page
  async function drawPictures(mine) {
    await sleep(250);
    const todo = (cur?.picks || []).map((p, i) => [i, p, 0]);
    while (todo.length) {
      const [i, p, tries] = todo.shift();
      if (mine !== gen || !dlg) return;
      const c = dlg.querySelector(`.lab-inst-card[data-i="${i}"] .lab-inst-pic`);
      if (!c) continue;
      c.classList.add('drawing');
      try {
        const Ls = layersOf(p);
        const r = await LabGallery.show({ key: `i:${p.base.key}:${i}:${mine}`, layers: async () => Ls }, { wait: 9000 });
        if (mine !== gen || !dlg) break;
        await sleep(r.errors.length ? 100 : 800);
        const url = await LabGallery.shot?.();
        if (url && mine === gen && dlg) { c.querySelector('img').src = url; c.classList.add('has'); c.classList.remove('base'); }
        else if (!url && tries < 2) todo.push([i, p, tries + 1]); // (the page was still starting: again, after the others)
      } catch (err) { drawErr = err.message; if (tries < 2) todo.push([i, p, tries + 1]); } // (else the card keeps its palette / base picture)
      c.classList.remove('drawing');
    }
    LabGallery.parkSoon?.(30000);
  }
  async function choose(i) {
    const p = cur?.picks[i];
    if (!p) return;
    const text = dlg?.querySelector('.lab-inst-input')?.value.trim() || '';
    picked = true;
    const fn = onPick;
    close();
    try { const r = await make(p, text); fn?.(p, r); } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function close() {
    if (!dlg) return;
    const d = dlg; dlg = null; gen += 1;
    d.close(); d.remove();
    document.querySelector('.lab-gal-shade')?.remove();
    const fn = onPick; onPick = null;
    if (!picked) fn?.(null, null);
    LabGallery.parkSoon?.(picked ? 300 : 30000); // a pick opens in the Lab: the pictures' page goes to sleep at once
  }

  // ---------- the gallery's search: "Make it from my words" when it reads like a description ----------
  function galleryRow(query, closeGallery) {
    const q = String(query || '').trim();
    if (!C.looksLikeDescription(q)) return null;
    return el('button', { type: 'button', class: 'lab-inst-galrow', title: 'Three picks made from your words: matched on this computer, 0 tokens',
      on: { click: () => { closeGallery?.(); open({ text: q }); } } },
    el('b', { text: '✦ Make it from my words' }), el('span', { class: 'muted', text: ` "${q.length > 60 ? `${q.slice(0, 57)}…` : q}" · 3 picks, 0 tokens` }));
  }

  return { open, close, plan, make, layersOf, ask, card, closeCard, galleryRow, get last() { return S.last; }, get isOpen() { return Boolean(dlg); }, get picks() { return cur?.picks || []; }, get drawErr() { return drawErr; } };
})();
