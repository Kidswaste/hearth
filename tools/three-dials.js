// 🎛 Mood dials (round 135, mooddial135): a few scene-wide knobs, each moving many sliders at once.
// docs/upgrades/mooddial135.md. A small card (300 px, nothing always on screen): the Sliders panel's ⋯ › 🎛 Dials…,
// the Lab toolbar's ⋯ › 🎛 Dials, Ctrl/⌘+K "Lab: 🎛 Mood dials". Built on what the Lab has:
//   · the sliders: each layer's tweak() controller (stageHooks.ctlOf(id).controls() / setMany), like 🎲 Variations and
//     the ◆ project look; turning a dial moves them live (no undo step per move); a release is ONE step of the Lab's
//     Ctrl/⌘+Z (LabDirect.push), the dial's own value with it
//   · the maps live with the scene (stageHooks.dials / setDials → sketch.dials: DialsCore.norm)
//   · Learn: the sliders at one end, then at the other (DialsCore.learn); Suggest (free): from the names
//     (DialsCore.suggestLocal); ✦ Suggest dials: ONE lean helper pass (hub.askOnce on the cheapest model, like
//     ✦ Explain this layer), cost first, nothing sent before the click, Keep or ✕ per dial
//   · ◆ keys: the dial's lane in the card; its keys are baked onto the mapped sliders' own keys (tagged dial: id), so
//     the preview, renders, the Lab sequence and backstage scenes play it with nothing new
//   · 〰 Follow the music: 🎚 Follow the music's card (audiomap134) on the dial itself; the link it makes is spread as a
//     ♪ beat link on each mapped number slider (its range = the dial's from → to), so renders match the preview
//   · ◉ Perform: ↑ / ↓ turn the selected dial, [ / ] pick another (live only, put back when Perform ends)
//   · the AI: three_sliders { dial, value } (three_do sliders): op() below, via tools/three-director.js
//   LabDials.open({ anchor }) · close() · turn(id, value, { release }) · state() · op(args, d, ctx) · perform(dir)
const LabDials = (() => {
  const C = () => DialsCore;
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const sceneNow = () => hk()?.sketchId?.() || null;
  const HEX = /^#[0-9a-f]{6}$/i;
  const calm = (e) => (window.calmError ? calmError(e) : String(e?.message || e));
  const r2 = (x) => Math.round(x * 100) / 100;
  const S = { pop: null, anchor: null, sid: null, drag: null, learn: null, props: [], ai: { phase: 'idle', line: '', error: '', sent: [] }, timer: 0, perf: null, raf: 0 };
  const stats = { turns: 0, releases: 0, learned: 0, kept: 0, suggested: 0, baked: 0, aiRuns: 0 };

  // ---------- the scene: its dials and its sliders ----------
  const dataNow = () => C().norm(hk()?.dials?.() || null);
  const saveData = (d) => hk()?.setDials?.(C().norm(d));
  function controls() {
    const h = hk(); if (!h) return [];
    return (h.layers?.() || []).flatMap((L) => {
      let list = []; try { list = h.ctlOf(L.id)?.controls() || []; } catch { list = []; }
      return list.filter((x) => !x.options && ((typeof x.value === 'number' && Number.isFinite(x.min)) || (typeof x.value === 'string' && HEX.test(x.value))))
        .map((x) => ({ layer: L.id, layerName: L.name, key: x.key, label: x.label || x.key, kind: typeof x.value === 'number' ? 'number' : 'color', value: typeof x.value === 'string' ? x.value.toLowerCase() : x.value, min: x.min, max: x.max, int: x.step === 1, live: x.live }));
    });
  }
  function valsNow() {
    const out = {};
    for (const c of controls()) (out[c.layer] ||= {})[c.key] = c.value;
    return out;
  }
  const subset = (vals, maps) => { const o = {}; for (const m of maps) { const v = vals[m.layer]?.[m.key]; if (v !== undefined) (o[m.layer] ||= {})[m.key] = v; } return o; };
  function put(byLayer) {
    const h = hk(); let n = 0;
    for (const [id, set] of Object.entries(byLayer || {})) { const c = h?.ctlOf(id); if (c && Object.keys(set).length) n += (c.setMany(set, { remember: false }) || []).length; }
    return n;
  }
  const posOf = (dial, vals = valsNow()) => (dial.keys.length ? C().dialAt(dial.keys, hk()?.player?.time ?? 0, dial.value) : C().estimate(dial, (l, k) => vals[l]?.[k]));

  // ---------- keys: the dial's lane → the sliders' keys ----------
  const propsOf = (dial) => [...new Set([...dial.maps.map((m) => `${m.layer}|${m.key}`), ...(dial.baked || [])])];
  function keysNow(props) {
    const h = hk(); const o = {};
    for (const p of props) { const [l, k] = p.split('|'); o[p] = h?.keysOf?.(l, `s:${k}`) || []; }
    return o;
  }
  function setKeysAll(byProp) { const h = hk(); for (const [p, ks] of Object.entries(byProp)) { const [l, k] = p.split('|'); h?.setKeys?.(l, `s:${k}`, ks); } }
  // bake one dial (its keys onto its sliders; maps it dropped lose the keys it put there) → skipped maps
  function bake(dial) {
    const props = propsOf(dial); const have = keysNow(props);
    const { set, skipped } = C().bake(dial, have);
    const gone = C().unbake(dial.id, have, dial.maps);
    const out = {};
    for (const src of [gone, set]) for (const [l, ps] of Object.entries(src)) for (const [p, ks] of Object.entries(ps)) out[`${l}|${p.slice(2)}`] = ks;
    for (const [p, ks] of Object.entries(out)) if (JSON.stringify(ks) === JSON.stringify(have[p] || [])) delete out[p];
    setKeysAll(out);
    dial.baked = dial.keys.length ? dial.maps.filter((m) => !skipped.includes(m)).map((m) => `${m.layer}|${m.key}`) : [];
    stats.baked += 1;
    return skipped;
  }

  // ---------- one undo step (the Lab's Ctrl/⌘+Z, the timeline's when a song is loaded) ----------
  function step(label, { data, vals, keys }) {
    const sid = sceneNow();
    window.LabDirect?.push?.(null, label, () => {
      if (sceneNow() !== sid) return false;
      if (keys) setKeysAll(keys);
      if (vals) put(vals);
      if (data) saveData(data);
      paint(true);
      return true;
    });
  }

  // ---------- turning a dial ----------
  // live: the sliders move, nothing remembered; release: ONE undo step (sliders, keys and the dial's value back)
  function turn(id, value, { release = false, ai = false, quiet = false } = {}) {
    const data = dataNow(); const dial = data.list.find((x) => x.id === id);
    if (!dial) return null;
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    if (!S.drag || S.drag.id !== id || S.drag.sid !== sceneNow()) {
      const props = propsOf(dial);
      S.drag = { id, sid: sceneNow(), data: C().clone(dataNow()), vals: subset(valsNow(), dial.maps), keys: dial.keys.length ? keysNow(props) : null };
    }
    stats.turns += 1;
    let moved = 0;
    if (dial.keys.length) { // a dial with keys: the move is a key at the playhead (like an animated slider)
      dial.keys = C().upsert(dial.keys, hk()?.player?.time ?? 0, v);
      dial.value = v;
      if (release) bake(dial); else { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(() => bake(dial)); }
      moved = dial.maps.length;
    } else { dial.value = v; moved = put(C().setOf(dial, v)); }
    if (release) {
      const d0 = S.drag; S.drag = null;
      saveData(data); stats.releases += 1;
      const same = !d0.keys && JSON.stringify(subset(valsNow(), dial.maps)) === JSON.stringify(d0.vals);
      if (!ai && !same) step(`🎛 ${dial.name} ${Math.round(v * 100)}%`, { data: d0.data, vals: d0.vals, keys: d0.keys });
      if (!quiet) paint();
    }
    return { dial: dial.name, value: r2(v), moved };
  }

  // ---------- the card ----------
  function close() { clearInterval(S.timer); S.timer = 0; S.pop?.remove(); S.pop = null; S.learn = null; removeEventListener('keydown', esc, true); }
  const esc = (e) => { if (e.key === 'Escape' && S.pop && !document.querySelector('.mb-menu') && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) { e.stopPropagation(); close(); } };
  async function lab() {
    if (typeof ThreeLab === 'undefined' && window.Lazy) await Lazy.load('lab');
    if (!hk()?.ctlOf) await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !hk()?.ctlOf; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!hk()?.ctlOf) throw new Error('The Lab is not ready yet.');
  }
  async function open({ anchor = null } = {}) {
    await lab();
    if (!sceneNow()) throw new Error('Open a scene in the Lab first.');
    S.anchor = anchor || null;
    if (!S.pop) {
      S.pop = el('div', { class: 'md-pop lab-pop', role: 'dialog', attrs: { 'aria-label': 'Mood dials' } });
      document.body.append(S.pop);
      addEventListener('keydown', esc, true);
      S.timer = setInterval(tick, 300);
    }
    S.sid = sceneNow();
    paint(true); place();
    return state();
  }
  function place() {
    if (!S.pop) return;
    const a = S.anchor?.isConnected ? S.anchor : document.querySelector('.three-preview') || document.body;
    const r = a.getBoundingClientRect(); const w = 300;
    const left = Math.max(8, Math.min(innerWidth - w - 8, S.anchor?.isConnected ? r.right - w : r.left + 8));
    let top = S.anchor?.isConnected ? r.bottom + 6 : r.top + 8;
    const hgt = S.pop.offsetHeight || 260;
    if (top + hgt > innerHeight - 8) top = Math.max(8, innerHeight - hgt - 8);
    Object.assign(S.pop.style, { left: `${left}px`, top: `${top}px`, width: `${w}px` });
  }
  function tick() {
    if (!S.pop?.isConnected) return close();
    if (sceneNow() !== S.sid) { S.sid = sceneNow(); S.learn = null; S.props = []; paint(true); return; }
    if (S.drag) return;
    const lanes = hk()?.player?.loaded && hk().player.duration > 0 ? dataNow().list.filter((x) => x.keys.length).length : 0;
    if (lanes !== S.pop.querySelectorAll('.md-lane').length) { paint(true); return; } // (the song came in, or went: the keys' lanes follow)
    const vals = valsNow();
    for (const row of S.pop.querySelectorAll('.md-row')) {
      const dial = dataNow().list.find((x) => x.id === row.dataset.id); if (!dial) continue;
      const v = posOf(dial, vals);
      const inp = row.querySelector('.md-knob'); if (inp && document.activeElement !== inp) inp.value = v;
      const pct = row.querySelector('.md-pct'); if (pct) pct.textContent = `${Math.round(v * 100)}%`;
      const ph = row.querySelector('.md-ph'); const dur = hk()?.player?.duration || 0;
      if (ph && dur) ph.style.left = `${Math.min(100, ((hk().player.time || 0) / dur) * 100)}%`;
    }
  }
  const menu = (anchor, items) => { const r = anchor.getBoundingClientRect(); ThreeTweaks.menu(r.left, r.bottom + 4, items); };

  function paint(full = false) {
    if (!S.pop) return;
    if (!full && S.drag) return;
    const data = dataNow(); const vals = valsNow();
    const rows = data.list.map((dial) => rowOf(dial, data, vals));
    const learnBar = S.learn ? learnRow(data) : null;
    const sug = S.props.length ? el('div', { class: 'md-sugs' }, el('div', { class: 'md-k', text: S.props.ai ? '✦ Suggested' : 'Suggested from the names' }), ...S.props.map((p, i) => el('div', { class: 'md-sug', title: p.maps.map((m) => `${m.layerName || ''} · ${m.label} ${C().dirWord(m)}`).join('\n') },
      el('b', { text: p.name }), el('span', { class: 'md-sub', text: `${C().describe(p)}${p.why ? ` · ${p.why}` : ''}` }),
      el('button', { type: 'button', class: 'small primary md-keep', text: 'Keep', title: 'Add this dial to the scene (one undo step)', on: { click: () => keep(i) } }),
      el('button', { type: 'button', class: 'ghost small md-drop', text: '✕', title: 'Not this one', on: { click: () => { S.props.splice(i, 1); paint(true); } } })))) : null;
    const ai = S.ai.phase === 'cost' || S.ai.phase === 'busy' || S.ai.error ? el('div', { class: 'md-ai' },
      el('div', { class: 'md-cost', text: S.ai.error || S.ai.line }),
      S.ai.phase === 'cost' ? el('div', { class: 'md-foot' }, el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: () => { S.ai.phase = 'idle'; paint(true); } } }), el('button', { type: 'button', class: 'small primary md-send', text: '✦ Suggest', title: 'Send it (one small helper run)', on: { click: () => runAi() } })) : null,
      S.ai.phase === 'busy' ? el('div', { class: 'md-sub', text: 'Reading your sliders…' }) : null) : null;
    const empty = !data.list.length ? el('div', { class: 'md-sub md-empty', text: 'A dial moves many sliders at once (Energy, Darkness…). Start from a suggestion, or make one and Learn it.' }) : null;
    S.pop.replaceChildren(
      el('div', { class: 'md-head' }, el('b', { text: '🎛 Dials' }), el('span', { class: 'md-sub', text: data.list.length ? `${data.list.length} of ${C().MAX}` : '' }),
        el('button', { type: 'button', class: 'ghost small md-x', text: '✕', title: 'Close (Esc)', on: { click: () => close() } })),
      empty, ...rows, learnBar, sug, ai,
      el('div', { class: 'md-foot' },
        el('button', { type: 'button', class: 'ghost small md-local', text: 'Suggest (free)', title: 'Dials guessed from your slider names, on this computer, no AI', on: { click: () => suggestHere() } }),
        el('button', { type: 'button', class: 'ghost small md-aibtn', text: '✦ Suggest dials', title: 'One small AI pass reads your sliders and proposes 3–4 dials · the cost shows first', on: { click: () => costFirst() } }),
        data.list.length < C().MAX ? el('button', { type: 'button', class: 'ghost small md-new', text: '＋', title: 'A new empty dial, then Learn it', on: { click: () => newDial() } }) : null));
    place();
  }
  function rowOf(dial, data, vals) {
    const v = posOf(dial, vals);
    const knob = el('input', { type: 'range', class: 'md-knob', min: 0, max: 1, step: 0.005, title: `${dial.name}: ${C().describe(dial)}${dial.keys.length ? ' · keyed: a move sets a key at the playhead' : ''}` });
    knob.value = v;
    knob.addEventListener('input', () => { select(dial.id, false); turn(dial.id, Number(knob.value)); knob.parentElement.querySelector('.md-pct').textContent = `${Math.round(Number(knob.value) * 100)}%`; });
    knob.addEventListener('change', () => turn(dial.id, Number(knob.value), { release: true }));
    const dur = hk()?.player?.loaded ? hk().player.duration || 0 : 0;
    const lane = dial.keys.length && dur ? el('div', { class: 'md-lane', title: 'This dial\'s keys over the song · click a key to go there · right-click: remove it' },
      ...dial.keys.map((k, i) => el('i', { class: 'md-key', style: { left: `${Math.min(100, (k.t / dur) * 100)}%` }, title: `${k.t.toFixed(2)} s · ${Math.round(k.v * 100)}%`,
        on: { click: () => hk()?.player?.seek?.(k.t), contextmenu: (e) => { e.preventDefault(); editKeys(dial.id, (ks) => ks.filter((_, j) => j !== i), 'key removed'); } } })),
      el('i', { class: 'md-ph' })) : null;
    const sel = data.sel === dial.id;
    return el('div', { class: `md-row${sel ? ' sel' : ''}${S.learn?.id === dial.id ? ' learning' : ''}`, dataset: { id: dial.id } },
      el('div', { class: 'md-line' },
        el('button', { type: 'button', class: 'md-name', text: dial.name, title: `${C().describe(dial)} · click: select (◉ Perform's ↑ / ↓) · double-click: rename`, on: { click: () => select(dial.id), dblclick: () => rename(dial.id) } }),
        knob, el('span', { class: 'md-pct', text: `${Math.round(v * 100)}%` }),
        el('button', { type: 'button', class: `ghost small md-kf${dial.keys.length ? ' on' : ''}`, text: '◆', title: dial.keys.length ? `${dial.keys.length} keys · ◆ adds one at the playhead` : 'Key it at the playhead: the dial becomes animated on the timeline (renders follow)', on: { click: () => keyHere(dial.id) } }),
        el('button', { type: 'button', class: 'ghost small md-more', text: '⋯', title: 'Learn, follow the music, its sliders, rename, remove', on: { click: (e) => dialMenu(e.currentTarget, dial.id) } })),
      lane);
  }
  function learnRow() {
    const L = S.learn; const dial = dataNow().list.find((x) => x.id === L.id);
    if (!dial) { S.learn = null; return null; }
    const txt = L.first ? `Now turn ${dial.name} to the other end and set the sliders there.` : `Turn ${dial.name} to one end (0 or 100%), then set the sliders the way you want them there.`;
    return el('div', { class: 'md-learn' }, el('span', { text: `● Learn · ${txt}` }),
      el('div', { class: 'md-foot' }, el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: () => { S.learn = null; paint(true); } } }),
        el('button', { type: 'button', class: 'small primary md-thisend', text: L.first ? '✓ This end · done' : '✓ This end', on: { click: () => learnEnd() } })));
  }

  // ---------- the dials' own edits (one undo step each) ----------
  function edit(label, fn) {
    const data = dataNow(); const before = C().clone(data);
    if (fn(data) === false) return false;
    saveData(data);
    step(label, { data: before });
    paint(true);
    return true;
  }
  function select(id, repaint = true) { const d = dataNow(); if (d.sel === id) return; d.sel = id; saveData(d); if (repaint) paint(true); }
  async function rename(id) {
    const dial = dataNow().list.find((x) => x.id === id); if (!dial) return;
    const v = await Modal.prompt('Dial name', { value: dial.name });
    if (v?.trim()) edit('🎛 Dial renamed', (d) => { d.list.find((x) => x.id === id).name = v.trim().slice(0, 24); });
  }
  function newDial(name = '') {
    let id = null;
    const ok = edit('🎛 New dial', (d) => { if (d.list.length >= C().MAX) return false; id = C().newId(d); d.list.push({ id, name: name || ['Energy', 'Darkness', 'Chaos', 'Warmth'].find((n) => !d.list.some((x) => x.name === n)) || `Dial ${d.list.length + 1}`, value: 0.5, maps: [], keys: [] }); d.sel = id; });
    if (ok) startLearn(id);
    return ok ? id : null;
  }
  function remove(id) {
    const dial = dataNow().list.find((x) => x.id === id); if (!dial) return false;
    const props = propsOf(dial); const keys = dial.keys.length || dial.baked?.length ? keysNow(props) : null;
    const data = dataNow(); const before = C().clone(data);
    if (keys) { dial.keys = []; dial.maps = []; bake(dial); }
    if (dial.follow) spread(dial, null);
    data.list = data.list.filter((x) => x.id !== id); if (data.sel === id) data.sel = data.list[0]?.id || null;
    saveData(data);
    step(`🎛 ${dial.name} removed`, { data: before, keys });
    paint(true);
    return true;
  }
  function editKeys(id, fn, words = 'keys') {
    const data = dataNow(); const dial = data.list.find((x) => x.id === id); if (!dial) return false;
    const before = C().clone(data); const keys = keysNow(propsOf(dial));
    dial.keys = C().norm({ list: [{ ...dial, keys: fn(dial.keys) }] }).list[0].keys;
    const skipped = bake(dial);
    saveData(data);
    step(`🎛 ${dial.name}: ${words}`, { data: before, keys });
    if (skipped.length) toast(`${skipped.length} slider${skipped.length === 1 ? ' has' : 's have'} keys of its own, so this dial leaves ${skipped.length === 1 ? 'it' : 'them'} alone there: ${skipped.map((m) => m.label).join(', ')}`, { timeout: 4000 });
    paint(true);
    return true;
  }
  function keyHere(id) {
    const p = hk()?.player; const dial = dataNow().list.find((x) => x.id === id);
    if (!dial) return false;
    if (!p?.loaded) { toast('Load a song (or make the scene\'s timeline) first: keys sit on the timeline', { type: 'error' }); return false; }
    if (!dial.maps.length) { toast(`${dial.name} moves no sliders yet: Learn it first`, { timeout: 2500 }); return false; }
    return editKeys(id, (ks) => C().upsert(ks, p.time || 0, posOf(dial)), 'key at the playhead');
  }
  function setMap(id, i, patch) {
    return edit('🎛 Dial slider changed', (d) => { const m = d.list.find((x) => x.id === id)?.maps[i]; if (!m) return false; Object.assign(m, patch); if (patch.del) d.list.find((x) => x.id === id).maps.splice(i, 1); });
  }
  function dialMenu(anchor, id) {
    const dial = dataNow().list.find((x) => x.id === id); if (!dial) return;
    const curveRow = (m, i) => [`${m.layerName ? `${m.layerName} · ` : ''}${m.label} ${C().dirWord(m)}`, `${fmtV(m, m.a)} → ${fmtV(m, m.b)} · ${m.curve}`, [
      ...C().CURVES.map((c) => [`Curve: ${c}`, c === 'in' ? 'slow, then fast' : c === 'out' ? 'fast, then slow' : c === 'ease' ? 'soft at both ends' : 'even', () => setMap(id, i, { curve: c }), m.curve === c]),
      ['From (at 0)…', String(fmtV(m, m.a)), async () => { const v = await Modal.prompt(`${m.label} at 0`, { value: String(m.a) }); if (v != null) setMap(id, i, { a: m.kind === 'color' ? v : Number(v), m: undefined }); }],
      ['To (at 100%)…', String(fmtV(m, m.b)), async () => { const v = await Modal.prompt(`${m.label} at 100%`, { value: String(m.b) }); if (v != null) setMap(id, i, { b: m.kind === 'color' ? v : Number(v), m: undefined }); }],
      ['⇅ Swap the ends', '', () => setMap(id, i, { a: m.b, b: m.a })],
      ['✕ Not this slider', '', () => setMap(id, i, { del: true })]]];
    menu(anchor, [dial.name,
      ['● Learn…', 'Turn it to one end and set the sliders, then the other end', () => startLearn(id)],
      ['〰 Follow the music…', dial.follow ? 'now following' : 'the bass, the kick… moves the dial (renders match)', () => follow(id), Boolean(dial.follow)],
      dial.maps.length ? [`Its sliders (${dial.maps.length})`, 'Range and curve of each', dial.maps.map(curveRow)] : null,
      dial.keys.length ? ['Remove its keys', `${dial.keys.length} keys`, () => editKeys(id, () => [], 'keys removed')] : null,
      ['Rename…', '', () => rename(id)],
      ['Remove the dial', 'The sliders stay where they are', () => remove(id)]]);
  }
  const fmtV = (m, v) => (m.kind === 'color' ? v : r2(Number(v)));

  // ---------- Learn ----------
  function startLearn(id) { S.learn = { id, first: null }; select(id, false); paint(true); }
  function learnEnd() {
    const L = S.learn; if (!L) return false;
    const dial = dataNow().list.find((x) => x.id === L.id); if (!dial) { S.learn = null; return false; }
    const end = posOf(dial) >= 0.5 ? 1 : 0;
    const snap = valsNow();
    if (!L.first) { L.first = { end, snap }; toast(`Recorded the ${end ? '100%' : '0'} end. Now turn ${dial.name} to the other end and set the sliders there.`, { timeout: 3000 }); paint(true); return 'first'; }
    if (L.first.end === end) { toast(`Turn ${dial.name} to the other end first (${end ? '0' : '100%'})`, { type: 'error', timeout: 2500 }); return false; }
    const [lo, hi] = end ? [L.first.snap, snap] : [snap, L.first.snap];
    const maps = C().learn(lo, hi, controls(), dial.maps);
    S.learn = null;
    stats.learned += 1;
    edit(`🎛 ${dial.name} learned`, (d) => { const x = d.list.find((y) => y.id === dial.id); x.maps = maps.slice(0, 40); x.value = end; });
    toast(`🎛 ${dial.name} moves ${C().describe({ maps })} now`, { timeout: 2500 });
    return maps.length;
  }

  // ---------- suggestions ----------
  function suggestHere() {
    const have = dataNow().list.map((d) => d.name);
    S.props = C().suggestLocal(controls(), { have }); S.props.ai = false;
    stats.suggested += 1;
    if (!S.props.length) toast('No slider names here say speed, glow, contrast, noise or warmth: make a dial and Learn it (＋)', { timeout: 3500 });
    paint(true);
    return S.props.length;
  }
  function keep(i) {
    const p = S.props[i]; if (!p) return false;
    let added = false;
    edit(`🎛 ${p.name} added`, (d) => {
      if (d.list.length >= C().MAX) { toast(`${C().MAX} dials at most: remove one first`, { type: 'error' }); return false; }
      const id = C().newId(d); let name = p.name; while (d.list.some((x) => x.name === name)) name += ' 2';
      d.list.push({ id, name, value: 0.5, maps: p.maps, keys: [] }); d.sel = id; added = true;
    });
    if (added) { S.props.splice(i, 1); stats.kept += 1; paint(true); }
    return added;
  }
  // ✦ the AI's pass: the cost first, nothing sent before the click
  const dock = () => (typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three') : null);
  const agentOf = () => H.agent(dock()?.agentId) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || H.claudeAgent?.() || null;
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const who = (a) => ((chatOf(a)?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  const cheap = (a) => window.Autocompact?.CHEAP?.[a?.engine] || null;
  function costFirst() {
    const a = agentOf();
    if (!a) { S.ai = { ...S.ai, phase: 'idle', error: 'No AI to ask: set up Claude or Astra first.' }; paint(true); return null; }
    const prompt = C().suggestPrompt(controls(), { have: dataNow().list.map((d) => d.name) });
    S.ai = { ...S.ai, phase: 'cost', error: '', prompt, line: C().costLine(C().estimateCost(prompt), who(a), cheap(a)?.model || '') };
    paint(true);
    return S.ai.line;
  }
  async function runAi() {
    const a = agentOf(); if (!a || !S.ai.prompt) return false;
    S.ai.phase = 'busy'; paint(true);
    try {
      if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
      const ch = cheap(a);
      const q = { agentId: a.id, text: S.ai.prompt, images: [], options: { lean: true, helper: true, persona: C().PERSONA, ...(ch ? { model: ch.model, effort: ch.effort } : { effort: 'low' }), ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } };
      S.ai.sent = [...S.ai.sent, { agentId: a.id, text: q.text, options: { ...q.options }, at: Date.now() }].slice(-5);
      stats.aiRuns += 1;
      const r = await window.hub.askOnce(q).catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'mood dials' } }));
      if (!r?.ok) throw new Error(r?.error || 'The AI didn\'t answer.');
      const got = C().parseSuggest(r.text, controls());
      S.props = got.dials; S.props.ai = true; S.ai = { ...S.ai, phase: 'idle', error: got.dials.length ? '' : 'No dial came back that fits these sliders.', dropped: got.dropped };
    } catch (err) { S.ai = { ...S.ai, phase: 'idle', error: calm(err) }; }
    paint(true);
    return S.props.length;
  }

  // ---------- 〰 the dial follows the music (🎚 Follow the music's card, audiomap134) ----------
  // the link is on the dial's 0..1 scale; each mapped number slider gets the same link on its own range
  function spread(dial, link) {
    const h = hk(); let n = 0;
    for (const m of dial.maps) {
      if (m.kind !== 'number') continue;
      const c = h?.ctlOf(m.layer); if (!c) continue;
      let l = null;
      if (link) { const lo = C().valueOf(m, link.lo); const hi = C().valueOf(m, link.hi); l = { ...link, lo, hi, amount: Number(((hi - lo) / ((m.max - m.min) || 1)).toPrecision(5)) }; }
      if (c.link(m.key, l, { undo: false })) n += 1;
    }
    return n;
  }
  async function follow(id) {
    if (typeof FollowMusic === 'undefined' && window.Lazy) await Lazy.load('audiomap');
    if (typeof FollowMusic === 'undefined') throw new Error('🎚 Follow the music did not load');
    const row = S.pop?.querySelector(`.md-row[data-id="${id}"]`);
    const one = () => dataNow().list.find((x) => x.id === id);
    const d0 = one(); if (!d0) return null;
    if (!d0.maps.some((m) => m.kind === 'number')) { toast(`${d0.name} moves no number sliders yet: Learn it first`, { timeout: 2500 }); return null; }
    const a = {
      key: d0.name, label: `🎛 ${d0.name}`, mid: `dial:${id}`, min: 0, max: 1, step: 0.01, int: false, live: true,
      get anchor() { return row?.isConnected ? row : S.pop; }, value: () => posOf(one() || d0), get: () => C().clone(one()?.follow || null),
      set: (link, o = {}) => {
        const data = dataNow(); const dial = data.list.find((x) => x.id === id); if (!dial) return;
        const before = o.undo === false ? null : C().clone(data);
        if (before && o.from !== undefined) before.list.find((x) => x.id === id).follow = o.from || null;
        dial.follow = link ? C().clone(link) : null;
        spread(dial, link);
        saveData(data);
        if (before) {
          const sid = sceneNow(); const was = o.from ?? null;
          window.LabDirect?.push?.(null, `🎛 ${dial.name} follows the music`, () => { if (sceneNow() !== sid) return false; const dd = dataNow(); const x = dd.list.find((y) => y.id === id); if (!x) return false; x.follow = was; spread(x, was); saveData(dd); paint(true); return true; });
        }
        paint(true);
      },
    };
    return FollowMusic.open(a);
  }

  // ---------- ◉ Perform: ↑ / ↓ the selected dial, [ / ] another (live only, put back when it ends) ----------
  function perform(dir) {
    const data = dataNow(); const dial = data.list.find((x) => x.id === data.sel) || data.list[0];
    if (!dial) return null;
    if (dial.keys.length) { toast(`${dial.name} follows its keys`, { timeout: 900 }); return null; }
    if (!S.perf || S.perf.sid !== sceneNow()) S.perf = { sid: sceneNow(), vals: subset(valsNow(), data.list.flatMap((x) => x.maps)), at: {} };
    const cur = S.perf.at[dial.id] ?? posOf(dial);
    const v = Math.max(0, Math.min(1, Math.round((cur + 0.1 * dir) * 100) / 100));
    S.perf.at[dial.id] = v;
    put(C().setOf(dial, v));
    toast(`🎛 ${dial.name} ${Math.round(v * 100)}%`, { timeout: 700 });
    return v;
  }
  function performPick(dir) {
    const data = dataNow(); if (!data.list.length) return null;
    const i = Math.max(0, data.list.findIndex((x) => x.id === data.sel));
    const next = data.list[(i + dir + data.list.length) % data.list.length];
    data.sel = next.id; saveData(data);
    toast(`🎛 ${next.name} (↑ / ↓)`, { timeout: 900 });
    return next.name;
  }
  function performEnd() { const p = S.perf; S.perf = null; if (p && p.sid === sceneNow()) put(p.vals); return Boolean(p); }

  // ---------- the AI: three_sliders { dial, value } ----------
  async function op(args = {}, d = null, ctx = {}) {
    const linked = ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(ctx.chatId) : null;
    const sid = linked || sceneNow();
    const here = Boolean(sid && sid === sceneNow() && hk()?.ctlOf);
    const data = here ? dataNow() : C().norm(ThreeLab.scenes?.get?.(sid)?.dials || null);
    const list = () => data.list.map((x) => `${x.name} (${C().describe(x)})`).join(', ');
    if (!data.list.length) return { ok: false, error: 'This scene has no 🎛 mood dials yet. The owner makes them in the Lab (Sliders ⋯ › 🎛 Dials); move sliders with three_sliders set instead.' };
    if (args.value == null || !Number.isFinite(Number(args.value))) return { ok: true, value: { dials: data.list.map((x) => ({ name: x.name, value: here ? r2(posOf(x)) : r2(x.value), moves: x.maps.map((m) => m.label).join(', ') })) } };
    const dial = C().find(data, args.dial);
    if (!dial) return { ok: false, error: `No dial "${args.dial}". Dials: ${list()}.` };
    const v = Math.max(0, Math.min(1, Number(args.value) > 1 ? Number(args.value) / 100 : Number(args.value)));
    if (here) { const r = turn(dial.id, v, { release: true, ai: true }); return { ok: true, value: { ...r, note: dial.keys.length ? 'keyed: set as a key at the playhead' : undefined } }; }
    if (!d?.sliders) return { ok: false, error: 'Open the scene in the Lab to turn its dial.' };
    let n = 0;
    for (const [layer, set] of Object.entries(C().setOf(dial, v))) { try { d.sliders(layer, set); n += Object.keys(set).length; } catch { /* a layer gone */ } }
    return { ok: true, value: { dial: dial.name, value: r2(v), moved: n } };
  }

  function state() {
    const data = dataNow();
    return { open: Boolean(S.pop), sid: sceneNow(), sel: data.sel, learning: S.learn ? { id: S.learn.id, first: Boolean(S.learn.first) } : null, proposals: S.props.map((p) => ({ name: p.name, maps: p.maps.map((m) => ({ layer: m.layer, key: m.key, a: m.a, b: m.b, m: m.m })) })), ai: { phase: S.ai.phase, line: S.ai.line, error: S.ai.error, sent: S.ai.sent.length, dropped: S.ai.dropped },
      dials: data.list.map((x) => ({ id: x.id, name: x.name, value: r2(posOf(x)), maps: x.maps, keys: x.keys, baked: x.baked || [], follow: x.follow })), stats: { ...stats } };
  }
  const sent = () => S.ai.sent.slice();

  try { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: 🎛 Mood dials (a few knobs that move many sliders)', () => open().catch((e) => toast(calm(e), { type: 'error' }))); } catch { /* optional */ }
  return { open, close, turn, state, op, perform, performPick, performEnd, suggestHere, keep, costFirst, runAi, startLearn, learnEnd, newDial, remove, keyHere, editKeys, follow, select, sent, stats };
})();
window.LabDials = LabDials;
