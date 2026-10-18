// ▶ Play's hitch map (round 63, hitchmap63), the hub side (lazy group "gamemode", after playnotes.js). The owner wants
// Clink buttery at 240 Hz; this answers WHERE it stutters. Off by default. Turned on (/playtest hitchmap on, ▶ Play's
// right-click "Record the hitch map", Ctrl/⌘+K), the next ▶ Play (or the one playing now) records, per frame, only the
// frame's time and where the player / camera were (tools/hitchmap-page.js: a typed ring, no allocation, its cost a helper
// of ▶ Play's budget, shown on the F chip as "● Hitch map 2:31"), plus a picture of the moment when a big spike happens
// (at most 4, through playnotes62's capture path). After the session (leaving, Ctrl/⌘+P back to editing, or turning it
// off) the map is built main-side (hitchmapmain.js + hitchmap-core.js) and saved per game next to its playtest notes:
//   ▦ the map     a top-down heatmap of frame time over the play area, the timeline under it, the worst spots listed
//                 (ranked by time lost there) with their pictures; each → "Jump there" (the Lab's scene back at that
//                 moment through the layers' restoreState(), or its camera put back) and "Fix this" (the numbers drafted
//                 for the Three Director with the picture, never sent).
// Chat: /playtest hitchmap [on | off | show [game] | jump <n> | fix <n> | clear [game]]. 0 tokens until you send a draft.
const HitchMap = (() => {
  const C = HitchMapCore;
  const KEY = 'hitchmap.on';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const GM = () => GameMode;
  const Notes = () => (typeof PlayNotes !== 'undefined' ? PlayNotes : null);
  const fail = (err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error', raw: err });
  const X = (req) => window.hub.game.hitch(req);
  const S = { view: null, last: null, stats: { built: 0, jumps: 0, drafts: 0 }, lastDraft: null };

  // ---------- on / off (one setting; the window reads it when a game starts, or now while one plays) ----------
  const isOn = () => store.get(KEY, false) === true;
  const prefs = () => ({ on: isOn() });
  async function set(on) {
    store.set(KEY, Boolean(on));
    const st = GM().state();
    if (!st.playing || st.live) return on ? 'Hitch map: recording from the next ▶ Play (the F chip shows "● Hitch map" while it records). /playtest hitchmap off stops it.' : 'Hitch map: off (nothing of it in the game window).';
    const r = await X({ op: on ? 'on' : 'off' }).catch((err) => ({ ok: false, why: err.message }));
    if (r?.ok === false) return `Couldn't ${on ? 'start' : 'stop'} it: ${r.why || 'unknown'}`;
    return on ? `Hitch map: recording ${st.source?.title || 'the game'} now (F in the game: "● Hitch map").` : 'Hitch map: stopped; the map of this session is being built.';
  }

  // ---------- after the session ----------
  window.hub.game?.onHitch?.((d = {}) => {
    if (d.type !== 'built') return;
    S.stats.built += 1; S.last = d;
    if (S.view && GameCore.sameSource(S.view.source, d.source)) { S.view.reload(d.id).catch(() => {}); return; }
    const t = d.source?.title || 'the game';
    toast(d.hitches ? `▦ Hitch map of ${t}: ${d.hitches} hitch${d.hitches === 1 ? '' : 'es'}${d.top ? ` · worst spot ${d.top.split(' · ')[0]}` : ''}` : `▦ Hitch map of ${t}: smooth, no hitches`, { timeout: 9000, action: { label: 'Open the map', fn: () => open({ source: d.source, id: d.id }).catch(fail) } });
  });
  // (round 64, clickfirst64) the F chip's "● Record / ■ Stop hitch map", clicked in the game window
  window.hub.game?.onChip?.((d = {}) => { if (d.what === 'hitch') set(!isOn()).catch(fail); });
  // Ctrl/⌘+P back to editing ends this part of the session: the map so far (the ring keeps going if you go back)
  window.hub.game?.onLoop?.((d = {}) => { if (d.type === 'rested' && isOn()) X({ op: 'collect', why: 'rested' }).catch(() => {}); });

  // ---------- jump there / fix this ----------
  async function mapOf(source, id) { const r = await X({ op: 'get', source, id }); if (!r?.ok) throw new Error(r?.why || 'No hitch map yet.'); return r.map; }
  async function jump(source, m, i) {
    const j = C.jumpOf(m, i);
    if (!j) return { ok: false, why: 'no such spot' };
    if (!Notes()?.restore) return { ok: false, why: 'the playtest notes part isn\'t loaded' };
    S.stats.jumps += 1;
    const r = await Notes().restore(source, j);
    return { ...r, from: j.from };
  }
  async function fix(source, m, i) {
    const s = m.spots[i - 1]; if (!s) return { drafted: false, text: '' };
    const text = C.draft(m, i, { title: source.title });
    if (source.kind === 'lab') await jump(source, m, i).catch(() => null); // (the director's preview shows that place)
    const sh = s.shot ? m.shots.find((x) => x.id === s.shot) : null;
    const pic = sh?.file ? await X({ op: 'shot', source, file: sh.file, path: true }).catch(() => null) : null;
    S.stats.drafts += 1; S.lastDraft = text;
    return Notes()?.toDirector ? Notes().toDirector(source, text, pic?.ok ? pic.path : null) : { drafted: false, text };
  }

  // ---------- the map ----------
  const ramp = [[1, [47, 158, 110]], [1.5, [230, 184, 74]], [2.5, [229, 72, 77]]];
  function heat(ratio) {
    if (!(ratio > 0)) return null;
    if (ratio <= ramp[0][0]) return `rgb(${ramp[0][1]})`;
    for (let k = 1; k < ramp.length; k += 1) {
      if (ratio <= ramp[k][0]) { const [a, ca] = ramp[k - 1]; const [b, cb] = ramp[k]; const f = (ratio - a) / (b - a); return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * f))})`; }
    }
    return `rgb(${ramp[ramp.length - 1][1]})`;
  }
  function canvas(w, h) { const c = el('canvas', { class: 'hm-canvas' }); const d = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = `${w}px`; c.style.height = `${h}px`; const x = c.getContext('2d'); x.scale(d, d); return { c, x }; }
  function drawMap(m, sel) {
    const g = m.grid; const W = 520; const cell = Math.max(4, Math.floor(Math.min(W / g.w, 340 / g.h)));
    const w = cell * g.w; const h = cell * g.h;
    const { c, x } = canvas(w, h);
    x.fillStyle = '#0d0f14'; x.fillRect(0, 0, w, h);
    const base = Math.max(m.typical || 0, m.refresh || 0) || 1;
    for (let j = 0; j < g.h; j += 1) {
      for (let i = 0; i < g.w; i += 1) {
        const k = j * g.w + i; if (!g.n[k]) continue;
        x.fillStyle = heat(g.mean[k] / base); x.globalAlpha = Math.min(1, 0.45 + g.n[k] / 40); x.fillRect(i * cell, j * cell, cell - 1, cell - 1);
        if (g.hitches[k]) { x.globalAlpha = 1; x.strokeStyle = '#ff5a5f'; x.lineWidth = 1; x.strokeRect(i * cell + 0.5, j * cell + 0.5, cell - 2, cell - 2); }
      }
    }
    x.globalAlpha = 1;
    const B = g.bounds; const px = (u) => ((u - B.a0) / (B.a1 - B.a0)) * w; const py = (v) => ((v - B.b0) / (B.b1 - B.b0)) * h;
    for (const s of m.spots) {
      const cx = px(s.u); const cy = py(s.v); const r = s.i === sel ? 11 : 9;
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = s.i === sel ? '#ff8a3d' : '#16181dee'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#ff8a3d'; x.stroke();
      x.fillStyle = s.i === sel ? '#1a1206' : '#eef0f4'; x.font = '600 11px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(s.i), cx, cy + 0.5);
    }
    x.fillStyle = '#a7adb8'; x.font = '11px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'bottom';
    x.fillText(`${g.axes[0]} →  ·  ${g.axes[1]} ↓`, 6, h - 4);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `Frame time over the play area (${g.axes.join(' / ')}): ${m.spots.length} worst spots marked`);
    c.dataset.spots = JSON.stringify(m.spots.map((s) => [s.i, Math.round(px(s.u)), Math.round(py(s.v))]));
    return c;
  }
  function drawTimeline(m) {
    const t = m.timeline; const W = 520; const H = 64;
    const { c, x } = canvas(W, H);
    x.fillStyle = '#0d0f14'; x.fillRect(0, 0, W, H);
    let top = m.hitch * 1.6; for (let k = 0; k < t.k; k += 1) if (t.max[k] > top) top = t.max[k];
    top = Math.min(top, Math.max(m.hitch * 6, m.p95 * 2));
    const y = (v) => H - 4 - (Math.min(v, top) / top) * (H - 10);
    const bw = W / t.k;
    for (let k = 0; k < t.k; k += 1) { if (!t.max[k]) continue; x.fillStyle = t.max[k] >= m.hitch ? '#e5484d' : '#3a7f63'; x.fillRect(k * bw, y(t.max[k]), Math.max(1, bw - 0.5), H - 4 - y(t.max[k])); }
    x.strokeStyle = '#eef0f4aa'; x.lineWidth = 1; x.beginPath(); for (let k = 0; k < t.k; k += 1) { const yy = y(t.mean[k] || 0); if (k) x.lineTo(k * bw + bw / 2, yy); else x.moveTo(bw / 2, yy); } x.stroke();
    x.setLineDash([3, 3]); x.strokeStyle = '#8fb3ff'; x.beginPath(); x.moveTo(0, y(m.refresh)); x.lineTo(W, y(m.refresh)); x.stroke(); x.setLineDash([]);
    for (const s of m.spots) { const xx = Math.min(W - 6, (s.t * 1000 / Math.max(1, t.ms)) * W); x.fillStyle = '#ff8a3d'; x.font = '600 10px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText(String(s.i), xx, 10); }
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Frame time across the session (${C.clock(m.secs)}): bars are the worst frame, the line the usual one, dashes the screen's refresh`);
    return c;
  }

  // (round 64, clickfirst64) the scene open in the Lab, as a ▶ Play source (null when the Lab isn't up)
  const labScene = () => { try { const id = typeof ThreeLab === 'undefined' ? null : ThreeLab.scenes?.currentId?.(); return id ? GameCore.source({ kind: 'lab', id, title: ThreeLab.scenes.get?.(id)?.name || 'this scene' }) : null; } catch { return null; } };
  async function gameFor(arg) {
    const a = String(arg || '').trim();
    if (a) return GM().resolve(a);
    const st = GM().state();
    return (st.playing && !st.live && st.source) || S.last?.source || GM().last() || labScene(); // (round 64, clickfirst64) no game yet: the Lab scene open now (its empty view says what to do)
  }
  async function open({ source = null, id = null, map = null } = {}) {
    const s = source || (await gameFor(''));
    if (!s) { toast('No game yet: turn the hitch map on (▶ Play\'s right-click) and play one'); return null; }
    S.view?.close();
    let m = map; let maps = map ? [{ id: map.id, session: map.session, secs: map.secs }] : []; // (a map in hand: shown as it is)
    if (!m) { try { const r = await X({ op: 'get', source: s, id }); if (r?.ok) { m = r.map; maps = r.maps || []; } } catch { m = null; } }
    const dialog = el('dialog', { class: 'ui-modal hm-map', attrs: { 'aria-label': 'Hitch map' } });
    const body = el('div', { class: 'hm-body' });
    const close = () => { try { dialog.close(); } catch { /* gone */ } };
    let sel = 1;
    const thumbs = new Map();
    const pick = el('select', { class: 'hm-pick', attrs: { 'aria-label': 'Which session' }, on: { change: () => reload(pick.value).catch(fail) } });
    function paint() {
      pick.replaceChildren(...maps.map((x) => el('option', { value: x.id, text: `${new Date(x.session || x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${C.clock(x.secs)}`, selected: m && x.id === m.id })));
      pick.hidden = maps.length < 2; clear.hidden = !m;
      if (!m) { body.replaceChildren(el('div', { class: 'hm-empty', text: isOn() ? `Recording is on: ▶ Play ${s.title || 'the game'} and the map shows here after the session.` : `No hitch map of ${s.title || 'this game'} yet. Turn the recording on (▶ Play's right-click, or /playtest hitchmap on), play, and come back.` })); return; }
      const sub = el('div', { class: 'hm-sub', text: `${C.brief(m)}${m.cost?.perFrame != null ? ` · recording cost ${m.cost.perFrame < 0.001 ? '< 0.001' : m.cost.perFrame.toFixed(3)} ms a frame` : ''}${m.stopped ? ` · stopped at ${C.clock(m.stopped.at)} by ▶ Play's budget` : ''}${m.moved ? '' : ' · the camera / player barely moved: the timeline says more'}` });
      const mapC = drawMap(m, sel);
      mapC.addEventListener('click', (e) => {
        const r = mapC.getBoundingClientRect(); const pts = JSON.parse(mapC.dataset.spots || '[]');
        const hit = pts.find(([, a, b]) => Math.hypot(a - (e.clientX - r.left), b - (e.clientY - r.top)) < 14);
        if (hit) { sel = hit[0]; paint(); body.querySelector(`.hm-row[data-i="${sel}"]`)?.focus(); }
      });
      const legend = el('div', { class: 'hm-legend' }, el('span', { class: 'hm-sw ok' }), el('span', { text: 'usual' }), el('span', { class: 'hm-sw mid' }), el('span', { text: '1.5×' }), el('span', { class: 'hm-sw bad' }), el('span', { text: '2.5× the usual frame' }), el('span', { class: 'hm-sw hit' }), el('span', { text: 'hitches there' }));
      const rows = m.spots.length ? m.spots.map(row) : [el('div', { class: 'hm-empty', text: `No hitches: every frame within ${Math.round(m.hitch)} ms. Smooth.` })];
      body.replaceChildren(sub, el('div', { class: 'hm-figs' }, mapC, legend, drawTimeline(m)), el('div', { class: 'hm-list', attrs: { role: 'list' } }, ...rows));
    }
    function row(sp) {
      const img = el('img', { class: 'hm-shot', alt: '', attrs: { loading: 'lazy' } });
      const sh = sp.shot ? m.shots.find((x) => x.id === sp.shot) : null;
      if (sh?.file) { const t = thumbs.get(sh.file); if (t) img.src = t; else X({ op: 'shot', source: s, file: sh.file, width: 240 }).then((x) => { if (x?.ok) { const u = `data:${x.mime};base64,${x.data}`; thumbs.set(sh.file, u); img.src = u; } }).catch(() => {}); } else img.classList.add('none');
      const act = (text, title, fn) => el('button', { type: 'button', class: 'ghost small', text, title, on: { click: (e) => { e.stopPropagation(); fn(); } } });
      const node = el('div', { class: `hm-row${sp.i === sel ? ' on' : ''}`, tabIndex: 0, attrs: { role: 'listitem', 'data-i': String(sp.i) },
        on: { click: () => { sel = sp.i; paint(); }, keydown: (e) => { if (e.key === 'Enter' && e.target === node) go(sp.i); } } },
      el('span', { class: 'hm-i', text: String(sp.i) }), img,
      el('div', { class: 'hm-text' }, el('div', { class: 'hm-line', text: C.line(sp, m) }), el('div', { class: 'hm-meta', text: `worst at ${C.clock(sp.t)} · camera ${sp.cam.map((v) => Math.round(v * 10) / 10).join(', ')}${sh ? ' · picture' : ''}` })),
      el('div', { class: 'hm-acts' },
        act('Jump there', sh?.state != null ? 'Put the game back at that moment (what it saved then, its camera)' : 'Put the camera back where it was', () => go(sp.i)),
        act('Fix this', 'Hand it to the Three Director with the numbers (drafted, not sent)', () => { close(); fix(s, m, sp.i).catch(fail); })));
      return node;
    }
    async function go(i) {
      close();
      const x = await jump(s, m, i).catch((err) => ({ ok: false, why: err.message }));
      toast(x.ok ? `↺ ${s.title || 'The game'} at hitch spot ${i}${x.where === 'lab' ? ' in the Lab' : ''} (${x.from === 'picture' ? `what it saved then${x.cameras ? ', its camera' : ''}` : 'the camera put back'})` : `Couldn't jump there: ${x.why || 'nothing to restore'}`, { timeout: 4000 });
    }
    async function reload(want) {
      const r = await X({ op: 'get', source: s, id: want || null });
      if (r?.ok) { m = r.map; maps = r.maps || maps; sel = 1; paint(); }
    }
    const clear = el('button', { type: 'button', class: 'ghost small danger', text: 'Clear…', title: 'Move every hitch map of this game to the Trash',
      on: { click: async () => { if (!(await Modal.confirm('Clear the hitch maps?', `Every hitch map of ${s.title || 'this game'} and its pictures go to the Trash.`, { ok: 'Move to Trash', danger: true }))) return; await X({ op: 'clear', source: s }); m = null; maps = []; paint(); } } });
    const rec = el('button', { type: 'button', class: 'ghost small', text: isOn() ? '● Recording: on' : 'Record next time', title: 'Record the hitch map in ▶ Play (off by default)',
      on: { click: async () => { const t = await set(!isOn()); rec.textContent = isOn() ? '● Recording: on' : 'Record next time'; toast(t, { timeout: 3500 }); } } });
    dialog.append(el('form', { method: 'dialog' },
      el('div', { class: 'hm-head' }, el('h2', { text: `Hitch map · ${s.title || m?.game?.title || 'game'}` }), pick),
      body,
      el('div', { class: 'dialog-actions' }, clear, rec, el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    dialog.addEventListener('close', () => { if (S.view?.dialog === dialog) S.view = null; setTimeout(() => dialog.remove(), 0); });
    document.body.append(dialog);
    paint();
    dialog.showModal();
    S.view = { dialog, source: s, close, reload, get map() { return m; } };
    return S.view;
  }

  // ---------- chat: /playtest hitchmap … ----------
  async function command(a) {
    const m = String(a || '').trim().match(/^hitch(?:-?map)?s?\b\s*(on|off|show|open|jump|fix|clear|status)?\b\s*(.*)$/i);
    if (!m) return null;
    const verb = (m[1] || '').toLowerCase(); const rest = m[2].trim();
    if (verb === 'on' || verb === 'off') return set(verb === 'on');
    const num = /^\d+$/.test(rest) ? Number(rest) : null;
    const s = await gameFor(num == null ? rest : '');
    if (verb === 'status' || (!verb && !s)) {
      const st = await X({ op: 'state' }).catch(() => null);
      const p = st?.page;
      return [`Hitch map: ${isOn() ? 'recording on' : 'off'} (/playtest hitchmap ${isOn() ? 'off' : 'on'}).`, p ? `Now: ${C.clock(p.secs)} recorded · ${p.frames} frames · ${p.spikes} spikes · ${p.shots} pictures · its cost ${p.avgMs != null ? `${p.avgMs.toFixed(4)} ms` : '–'} a frame${p.off ? ` · stopped (${p.off})` : ''}` : ''].filter(Boolean).join('\n');
    }
    if (!s) return 'No game yet: ▶ Play one with the hitch map on.';
    if (verb === 'clear') { const r = await X({ op: 'clear', source: s }); if (S.view && GameCore.sameSource(S.view.source, s)) S.view.close(); return r?.n ? `Moved ${r.n} hitch map${r.n === 1 ? '' : 's'} of ${s.title} to the Trash.` : `${s.title} has no hitch maps.`; }
    let map = null; try { map = await mapOf(s, null); } catch { map = null; }
    if (!map) return `${s.title} has no hitch map yet${isOn() ? ': it records while ▶ Play runs and shows after the session.' : ': /playtest hitchmap on, then ▶ Play it.'}`;
    if (verb === 'jump' || verb === 'fix') {
      const i = num || 1;
      if (!map.spots[i - 1]) return `${s.title}'s last hitch map has ${map.spots.length} spot${map.spots.length === 1 ? '' : 's'}.`;
      if (verb === 'fix') { const x = await fix(s, map, i); return x.drafted ? `Spot ${i} is in the director's box with the numbers${map.spots[i - 1].shot ? ' and its picture' : ''}, not sent.` : 'Copied the spot for the director (its chat isn\'t open).'; }
      const x = await jump(s, map, i).catch((err) => ({ ok: false, why: err.message }));
      return x.ok ? `↺ ${s.title} at hitch spot ${i} (${x.from === 'picture' ? 'what it saved then' : 'the camera put back'}).` : `Couldn't jump to spot ${i}: ${x.why || 'nothing to restore'}`;
    }
    open({ source: s, id: map.id }).catch(() => {});
    return [`${s.title} — hitch map: ${C.brief(map)}`, ...map.spots.slice(0, 6).map((sp) => `${sp.i}. ${C.line(sp, map)}`),
      map.spots.length ? '/playtest hitchmap jump <n> goes there · /playtest hitchmap fix <n> drafts it for the director' : 'No hitches: smooth.'].join('\n');
  }

  // ---------- menus, palette ----------
  function menuItems() {
    const s = GM().state().source || S.last?.source || GM().last() || labScene(); // (round 64, clickfirst64) the Lab scene when no game yet
    return [
      { label: 'Record the hitch map', checked: isOn(), hint: 'where it stutters: frame time over the play area', action: () => set(!isOn()).then((t) => toast(t, { timeout: 3500 })).catch(fail) },
      ...(s ? [{ label: '▦ Hitch map', hint: 'the last recording of this game', action: () => open({ source: s }).catch(fail) }] : []),
    ];
  }
  try {
    AppUI.addAction?.('▦ Hitch map', () => open().catch(fail));
    AppUI.addAction?.('Hitch map: record on / off', () => set(!isOn()).then((t) => toast(t, { timeout: 3500 })).catch(fail));
  } catch { /* no palette */ }

  return { prefs, set, isOn, open, jump, fix, command, menuItems, state: () => ({ on: isOn(), last: S.last, view: Boolean(S.view), stats: { ...S.stats }, lastDraft: S.lastDraft }) };
})();
