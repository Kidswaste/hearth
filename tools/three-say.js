// ⌁ Say it in the Lab (round 141, cmdbar141): the command bar (Ctrl/⌘+;, cmdbar.js) over the Lab reads plain words
// first, on this computer (tools/three-say-core.js: a small grammar and fuzzy names, no AI): "glow 0.8", "glow 0.8 on
// the drop", "more glow", "add bloom", "hide sparks", "solo ring", "energy up", "follow bass", "jump to drop", "render
// reel". A line under the bar says what Enter will do; Enter applies it as ONE undo step (LabTxn.reserve: the Lab's
// Ctrl/⌘+Z, the dock's ↶); ↑ / ↓ are the bar's history. Words it doesn't know: "✦ Ask the director: …", sent to the
// docked director as the owner's message only on that click. docs/upgrades/cmdbar141.md
// Built on what the Lab has: three_sliders / three_keyframes / three_update_layer / three_do blocks through
// HubBridge.call (the director's own paths, atomic), the 🎛 dials (three_sliders { dial }), ♪ BeatLink.fresh +
// the slider's link (follow the music), ThreeLab.cmd().solo, the timeline's cues and seek, LabExport.panel({ preset }).
//   LabSay.ctx() · preview(text) · run(text, api) · ask(text) · undo() · state()
const LabSay = (() => {
  const C = SayCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const clip = (t, n) => { const s = String(t || ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const S = { last: null, applied: null, bar: null, sent: [], ph: 0, timer: null, stats: { previews: 0, runs: 0, applied: 0, asks: 0, undos: 0 } };
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const onLab = () => { try { return Commands.place().id === 'three' && Boolean(hk()?.sketchId?.()); } catch { return false; } };

  // ---------- what the words can name: the scene on screen ----------
  function ctx() {
    const h = hk(); const P = h?.player;
    const layers = (ThreeLab.groupsHost?.layers?.() || []).map((L) => ({ id: L.id, name: L.name, visible: L.visible !== false, solo: Boolean(L.solo) }));
    const sliders = [];
    for (const L of layers) {
      let list = []; try { list = h.ctlOf(L.id)?.controls() || []; } catch { list = []; }
      for (const s of list) if (s.min != null && typeof s.value === 'number') sliders.push({ layer: L.id, layerName: L.name, key: s.key, label: s.label, value: s.value, min: s.min, max: s.max });
    }
    const touched = h?.lastSlider?.() || null; // (the Sliders panel's last touched one)
    const lastSlider = [touched, S.lastSlider].filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
    let dials = [];
    try { dials = typeof LabDials !== 'undefined' ? LabDials.state().dials.map((d) => ({ name: d.name, value: d.value })) : (h?.dials?.()?.list || []).map((d) => ({ name: d.name, value: d.value })); } catch { dials = []; }
    const an = P?.loaded ? P.analysis : null;
    return {
      layers, sliders, selLayer: h?.layer?.()?.id || null, lastSlider,
      cues: P?.loaded ? (P.cues || []).map((c) => ({ t: c.time, name: c.name })) : [],
      drops: an?.drops || [], sections: (an?.sections || []).map((s) => ({ start: s.start, label: s.label || s.name || '' })),
      time: P?.time || 0, duration: P?.loaded ? P.duration : 0, dials,
      blocks: typeof BlocksCore !== 'undefined' ? BlocksCore.BLOCKS.map((b) => ({ id: b.id, name: b.name })) : [],
      presets: typeof RenderPreCore !== 'undefined' ? RenderPreCore.PRESETS : C.PRESETS,
      parseBand: typeof BeatLinkCore !== 'undefined' ? (w) => BeatLinkCore.parseDriver(w) : null,
    };
  }

  // ---------- the line under the bar ----------
  const director = () => { const id = typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three')?.agentId : null; return H.agent(id) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || CmdBar.target?.() || null; };
  const askBtn = (text) => el('button', { type: 'button', class: 'ghost small say-ask', text: `✦ Ask the director: ${clip(text, 60)}`, title: 'Send these words to the docked director as your message (nothing is sent before this click)', on: { mousedown: (e) => e.preventDefault(), click: () => ask(text) } });
  function preview(text) {
    const p = C.parse(text, ctx());
    S.last = p; S.stats.previews += 1;
    const ok = p.kind !== 'none' && p.kind !== 'need';
    const node = ok
      ? el('div', { class: 'say-line ok' }, el('span', { class: 'say-icon', text: '⌁' }), el('span', { class: 'say-what', text: p.words }), el('span', { class: 'say-keys', text: C.changes(p) ? 'Enter · one undo' : 'Enter' }))
      : el('div', { class: 'say-line' }, p.kind === 'need' ? el('span', { class: 'say-need', text: p.words }) : el('span', { class: 'say-need', text: 'Not a Lab edit I know.' }), askBtn(text));
    return { ok, node, plan: p };
  }

  // ---------- Enter ----------
  async function run(text, api = {}) {
    S.bar = api; S.stats.runs += 1;
    const p = C.parse(text, ctx());
    S.last = p;
    if (p.kind === 'none' || p.kind === 'need') {
      let cmds = []; try { cmds = Commands.suggest(text, { limit: 3 }) || []; } catch { cmds = []; }
      api.show?.(`${p.kind === 'need' ? p.words : `Not sure what “${clip(text, 60)}” means here.`} \`?\` lists what the bar understands.${cmds.length ? `\nOr a command: ${cmds.map((x) => `\`${x.line.trim()}\``).join(' · ')}` : ''}`, { actions: [{ label: `✦ Ask the director: ${clip(text, 40)}`, title: 'Send it to the docked director as your message', run: () => ask(text) }] });
      return false;
    }
    try {
      await apply(p);
      api.show?.(`✓ ${p.words}${C.changes(p) ? ' · Ctrl/⌘+Z undoes it' : ''}`, { actions: C.changes(p) ? [{ label: '↶ Undo', run: () => undo().catch((err) => api.show?.(calm(err), { type: 'error' })) }] : [] });
      return true;
    } catch (err) { api.show?.(calm(err), { type: 'error' }); return false; }
  }

  async function apply(p) {
    const h = hk(); if (!h) throw new Error('Open the Lab first.');
    if (p.kind === 'stage') { window.LabHudStage?.pin(p.op === 'show'); return; } // (round 150, stage150)
    if (p.kind === 'jump') { h.player.seek(p.t); return; }
    if (p.kind === 'render') { await LabExport.panel(p.preset ? { preset: p.preset.id } : {}); return; }
    const sid = h.sketchId();
    const before = await LabTxn.snap(sid);
    const at = Date.now();
    const step = LabTxn.reserve({ who: 'You', before, label: `⌁ ${p.words}`, words: p.words });
    const ok = (r) => { if (r?.ok === false) throw new Error(`It couldn't be done: ${r.error}`); return r; };
    try {
      if (p.kind === 'set' && !p.at) ok(await HubBridge.call('three_sliders', { layer: p.layer, set: { [p.key]: p.to } }));
      else if (p.kind === 'set') {
        // a key at the cue, with the slider's keys kept; none yet: one at its value now just before, so only the cue changes
        const had = h.keysOf(p.layer, `s:${p.key}`).map((k) => ({ time: k.t, value: k.v, ease: k.ease || 'ease' })).filter((k) => Math.abs(k.time - p.at.t) > 0.04);
        if (!had.length && p.at.t > 0.3) had.push({ time: Math.round((p.at.t - 0.25) * 1000) / 1000, value: p.from, ease: 'hold' });
        ok(await HubBridge.call('three_keyframes', { layer: p.layer, property: p.key, keys: [...had, { time: p.at.t, value: p.to, ease: 'hold' }].sort((a, b) => a.time - b.time) }));
      } else if (p.kind === 'block') ok(await HubBridge.call('three_do', { cmd: 'blocks', chain: [{ block: p.block.id }] }));
      else if (p.kind === 'dial') ok(await HubBridge.call('three_sliders', { dial: p.name, value: p.to }));
      else if (p.kind === 'vis' && (p.op === 'hide' || p.op === 'show')) ok(await HubBridge.call('three_update_layer', { layer: p.layer, settings: { visible: p.op === 'show' } }));
      else if (p.kind === 'vis') {
        const c = await ThreeLab.cmd();
        const soloing = typeof LayerGroups !== 'undefined' ? LayerGroups.soloId(ThreeLab.groupsHost.layers()) : null;
        if (p.op === 'unsolo') { if (soloing) c.solo(null); } else if (soloing !== p.layer) c.solo(p.layer);
      } else if (p.kind === 'follow') {
        const ctl = h.ctlOf(p.layer); const a = ctl?.linkAdapter(p.key);
        if (!a) throw new Error(`“${p.label}” can't follow the music (only number sliders can).`);
        ctl.link(p.key, BeatLink.fresh(a, p.band, p.how));
      }
      if (p.key) S.lastSlider = { layer: p.layer, key: p.key, at: Date.now() };
      await sleep(120);
      const after = await LabTxn.snap(sid);
      if (!step.done(after)) { S.applied = null; return; } // nothing changed (already so)
      S.applied = { sid, before, after, at, words: p.words };
      S.stats.applied += 1;
    } catch (err) {
      step.cancel();
      try { const now = await LabTxn.snap(sid); if (LabTxn._test.sigOf(now) !== LabTxn._test.sigOf(before)) await LabTxn.restore(before, { keepRefs: true }); } catch { /* as it is */ }
      throw err;
    }
  }
  // the result card's ↶ Undo: the same step the Lab's Ctrl/⌘+Z takes back
  async function undo() {
    const ap = S.applied; if (!ap) return false;
    const sig = (t) => LabTxn._test.sigOf(t);
    const cur = await LabTxn.snap(ap.sid);
    const top = LabTxn.history().at(-1);
    if (top && top.at >= ap.at && sig(cur) === sig(ap.after)) await LabTxn.undoTurn({ force: true });
    else if (await Modal.confirm('Put it back?', 'The scene changed after this. Putting it back takes the later changes too.', { ok: 'Put it back' })) await LabTxn.restore(ap.before, { keepRefs: true });
    else return false;
    S.applied = null; S.stats.undos += 1;
    toast(`↶ ${ap.words}`, { timeout: 1600 });
    return true;
  }

  // ---------- words it doesn't know: to the director, only on the click ----------
  async function ask(text) {
    const a = director();
    if (!a) { toast('No director yet: /director-setup docks one beside the Lab.', { type: 'error' }); return false; }
    S.sent = [...S.sent, { agentId: a.id, text, at: Date.now() }].slice(-10); S.stats.asks += 1;
    CmdBar.close?.();
    if (Native.pendingFor?.(a.id)) { Native.setDraft?.(a.id, text); toast('The director is busy: your words are in its chat box.', { timeout: 3000 }); return true; }
    await Native.send(a.id, text);
    return true;
  }

  // ---------- the bar's Lab mode (cmdbar.js addPlain) ----------
  function helpCard(api) {
    api.show?.(`**In the Lab, say it in plain words** (on this computer, free; Enter = one undo)\n${C.HELP.map(([what, eg, note]) => `- **${what}:** ${eg}${note ? ` · ${note}` : ''}`).join('\n')}\n\nAnything else: **✦ Ask the director** sends it as your message, only when you click it. A line starting with \`/\` is a command (F1 lists them).`,
      { actions: [{ label: 'All commands (F1)', run: () => CmdBar.help() }] });
  }
  const placeholder = () => `Try “${C.EXAMPLES[S.ph % C.EXAMPLES.length]}”  ·  ↑ what you said before  ·  ? what it understands`;
  function opened(input) {
    clearInterval(S.timer);
    S.timer = setInterval(() => {
      if (!CmdBar.isOpen() || !onLab()) { clearInterval(S.timer); S.timer = null; return; }
      if (!input.value) { S.ph += 1; input.placeholder = placeholder(); }
    }, 2600);
  }
  function rect() { try { const r = hk()?.host?.getBoundingClientRect(); return r && r.width > 240 && r.height > 80 ? r : null; } catch { return null; } }
  const provider = { name: 'lab', when: onLab, preview, run, help: helpCard, placeholder, opened, rect };
  if (typeof CmdBar !== 'undefined' && CmdBar.addPlain) CmdBar.addPlain(provider);

  try { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ⌁ Say it in plain words (glow 0.8, add bloom, jump to drop…)', async () => { await ThreeLab.cmd({ show: true }); await sleep(60); CmdBar.open(); }, 'Ctrl+;'); } catch { /* optional */ }
  const state = () => ({ last: S.last, applied: Boolean(S.applied), sent: S.sent.slice(), stats: { ...S.stats } });
  return { ctx, preview, run, apply, ask, undo, state, provider };
})();
window.LabSay = LabSay;
