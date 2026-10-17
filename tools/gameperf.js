// ▶ Game performance (round 52, gameperf): know why a three.js game isn't buttery, and fix it. Lazy group "gameperf"
// (loads on first use: /game-perf, Ctrl/⌘+K, the director's `three_do perf`, or GamePerf.attach from ▶ Play).
//   GamePerf.attach(win, opts)  measure a game page: the ▶ Play window (gamemode: a <webview>, an <iframe>, a Window,
//                               anything with executeJavaScript, or { exec(expr) → Promise<value> }); opts: { label,
//                               hz (the display's refresh), key: true (F toggles the chip there), chip, kind: 'lab' |
//                               'html', source: async () => the build's code (for suggested patches), dormant: true
//                               (round 57: the window kept, the probe put in only when the doctor / chip / perf asks) }
//   GamePerf.attachLab()        the same on the Lab preview (a Lab scene played where it is)
//   GamePerf.probeSource(opts)  the probe as one expression, for gamemode's preload (document start sees every shader)
//   GamePerf.chip(on?)          the stats chip in the game (F in a ▶ Play window; off by default, ~0 cost hidden)
//   GamePerf.doctor()           one click after a session: findings in plain words, sorted by impact, with fixes
//   GamePerf.fix(id) / undo()   a Lab scene's safe one-click fixes (a code change through the Lab: one undo step +
//                               the Lab's versions); an html build gets the patch as a suggestion, never applied
//   GamePerf.compact()          what a director reads (`three_do perf`), ≈ 100–250 tokens
// The probe that runs inside the game: tools/gameperf-probe.js; the rules: tools/gameperf-core.js.
const GamePerf = (() => {
  const C = () => GamePerfCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(e?.message || String(e), { type: 'error' });
  const S = { t: null, R: null, raw: null, findings: [], fid: [], scans: [], at: 0, undos: [], fixed: new Map(), card: null, busy: false, src: null };

  // ---------- targets ----------
  const probeExpr = (opts) => `(${GamePerfProbe.toString()})(${JSON.stringify(opts)})`;
  const probeSource = (opts = {}) => probeExpr({ attribute: C().attribute.toString(), ...opts });
  function adapt(win) {
    if (!win) return null;
    if (typeof win.exec === 'function') return win.exec;
    if (typeof win.executeJavaScript === 'function') return (e) => win.executeJavaScript(e);
    if (win.webContents?.executeJavaScript) return (e) => win.webContents.executeJavaScript(e);
    const w = win.contentWindow || (win.window === win ? win : null);
    if (w) return async (e) => w.eval(e);
    return null;
  }
  async function displayHz() {
    // (▶ Play passes the display's rate as opts.hz; else the hub window's own frame rate, measured: the fast end of 30 frames)
    const ts = []; await new Promise((res) => { const f = (t) => { ts.push(t); if (ts.length < 31) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const d = ts.slice(1).map((t, i) => t - ts[i]);
    return C().guessHz(d);
  }
  async function attach(win, opts = {}) {
    const exec = adapt(win);
    if (!exec) throw new Error('GamePerf.attach: nothing to measure (a webview, iframe, window or { exec }).');
    const hz = opts.hz || await displayHz();
    const t = { exec, label: opts.label || 'the game', kind: opts.kind || 'html', hz, key: opts.key !== false && opts.kind !== 'lab', source: opts.source || null, host: opts.host || null, win };
    // (round 57, framepace57) dormant: ▶ Play hands its window over without the probe in it (its per-frame timestamps,
    // render / rAF / WebGL wrappers, Long Animation Frames and mutation watches are steady per-frame work in the game
    // window); the doctor, the chip or the director's perf put it in when asked (call() / ensure()), then measure
    if (!opts.dormant) await ensure(t, opts.chip);
    S.t = t; S.R = null; S.findings = []; S.fixed.clear();
    return { label: t.label, hz, ...(opts.dormant ? { dormant: true } : {}) };
  }
  async function ensure(t, chip) {
    const opts = { hz: t.hz, key: t.key, label: t.label, attribute: C().attribute.toString(), ...(chip != null ? { chip } : {}) };
    const v = await t.exec(`(window.__gamePerf ? (window.__gamePerf.setOpts(${JSON.stringify(opts)}), 1) : ${probeExpr(opts)})`);
    if (!v) throw new Error('The measuring part could not start in the game.');
    return v;
  }
  // the Lab preview as the game (a Lab scene: Clink is one)
  async function lab() {
    if (typeof ThreeLab === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('lab');
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }
  async function attachLab(opts = {}) {
    const d = await lab();
    const exec = async (e) => { const r = await d.evalInSketch(`return (${e})`); if (!r?.ok) throw new Error(r?.error || 'The Lab preview did not answer.'); return r.value; };
    const name = (() => { try { return d.capture().sketch; } catch { return 'the Lab scene'; } })();
    return attach({ exec }, { label: name || 'the Lab scene', kind: 'lab', key: false, ...opts });
  }
  const call = async (expr) => {
    if (!S.t) throw new Error('No game to measure: start ▶ Play (or /game-perf check for the Lab scene).');
    try { return await S.t.exec(expr); } catch (e) {
      if (/__gamePerf|undefined|null/.test(e.message || '')) { await ensure(S.t); return S.t.exec(expr); } // (a new page: once more)
      throw e;
    }
  };

  // ---------- the chip ----------
  async function chip(on) {
    if (!S.t) await attachLab();
    await ensure(S.t);
    return call(`window.__gamePerf.chip(${on == null ? 'null' : Boolean(on)})`);
  }

  // ---------- the session → report → findings ----------
  async function labCode() {
    if (S.t?.kind !== 'lab') return null;
    try { const d = await lab(); const cap = d.capture(); return { sketchId: cap.sketchId, layers: cap.layers.map((L) => ({ id: L.id, name: L.name, code: L.id === cap.selId ? d.codeOf(L.id).code : L.code })) }; } catch { return null; }
  }
  async function measure({ secs = 0 } = {}) {
    if (!S.t) await attachLab();
    await ensure(S.t);
    if (secs > 0) { await call('window.__gamePerf.start()'); await sleep(secs * 1000); }
    const raw = JSON.parse(await call('JSON.stringify(window.__gamePerf.report())'));
    raw.hz = S.t.hz;
    try { const a = await call('window.__gameAudio ? window.__gameAudio.pub() : null'); raw.audio = a ? JSON.parse(a) : null; } catch { raw.audio = null; } // (round 54, gameaudio: ▶ Play's sound)
    const R = C().summarize(raw);
    // the game's own code, looked at for per-frame allocations (a Lab scene's layers, or an html build's source)
    const scans = [];
    const lc = await labCode();
    if (lc) for (const L of lc.layers) scans.push(...C().scanSource(L.code, { layer: L.name }));
    else if (S.t.source) { try { S.src = String(await S.t.source() || ''); scans.push(...C().scanSource(S.src)); } catch { S.src = null; } }
    S.raw = raw; S.R = R; S.scans = scans; S.lab = lc; S.at = Date.now();
    // (round 54, gamelook) what ▶ Play's look did in this game (gamelook-preload.js), in plain words
    try { const lk = await call('window.__gameLook ? JSON.stringify({ text: window.__gameLook.text(), r: window.__gameLook.report() }) : ""'); S.look = lk ? JSON.parse(lk) : null; } catch { S.look = null; }
    // (round 55, playbudget) Hearth's own helpers in the game window: each one's cost a frame, the ones switched off
    try { const b = await call('window.__hearthBudget ? window.__hearthBudget.pub() : ""'); S.budget = b ? JSON.parse(b) : null; } catch { S.budget = null; }
    S.input = await inputFigure(); // (round 56, playlatency)
    S.findings = C().doctor(R, scans).map((f) => ({ ...f, lab: S.t.kind === 'lab' ? labFix(f.lab, f) : null, patch: S.t.kind !== 'lab' && f.lab ? htmlPatch(f.lab) : null }));
    S.fid = C().fidelity(R).map((f) => ({ ...f, lab: S.t.kind === 'lab' ? labFix(f.lab, f) : null, patch: S.t.kind !== 'lab' && f.lab ? htmlPatch(f.lab) : null }));
    return { R, findings: S.findings, fidelity: S.fid };
  }
  // (round 56, playlatency) ▶ Play's "Input: x ms" (input → the game's next frame): the last /game latency of this
  // game, else a short one now (1 s of tiny input, playlatencymain.js); none for the Lab preview
  async function inputFigure() {
    const G = typeof GameMode !== 'undefined' ? GameMode.state?.() : null;
    if (!G?.playing || G.live || !window.hub.game?.latency) return null;
    let r = await window.hub.game.latency({ op: 'last' }).catch(() => null);
    if (!r?.line || Date.now() - (r.at || 0) > 120000) r = await window.hub.game.latency({ ms: 1000 }).catch(() => null);
    return r?.line ? { line: r.line, ok: r.ok, why: r.why || '' } : null;
  }
  // the layer a fix goes to: the main renderer's layer, else the first layer that makes a renderer
  function labLayerFor() {
    const L = S.lab?.layers || [];
    const id = S.R?.scene?.layer;
    return L.find((x) => x.id === id || x.name === id) || L.find((x) => /new\s+(?:THREE\.)?WebGLRenderer\s*\(/.test(x.code)) || null;
  }
  function labFix(fx, f) {
    if (!fx || !S.lab) return null;
    if (fx.kind === 'hoist') {
      const layers = S.lab.layers.filter((L) => (f.hits || []).some((h) => h.hoist && h.layer === L.name)).map((L) => ({ id: L.id, name: L.name, next: C().patch(L.code, 'hoist') })).filter((x) => x.next);
      return layers.length ? { ...fx, layers } : null;
    }
    const L = labLayerFor();
    const next = L && C().patch(L.code, fx.kind);
    return next ? { ...fx, layers: [{ id: L.id, name: L.name, next }] } : null;
  }
  function htmlPatch(fx) {
    if (!S.src) return null;
    const next = C().patch(S.src, fx.kind);
    return next ? C().diff(S.src, next) : null;
  }

  // ---------- fixes (a Lab scene: one click, one undo step; never by themselves) ----------
  async function fix(id) {
    const f = [...S.findings, ...S.fid].find((x) => x.id === id);
    if (!f) throw new Error(`No finding "${id}" (run the doctor first).`);
    if (S.fixed.has(id)) return S.fixed.get(id);
    if (!f.lab?.layers?.length) {
      if (f.live) return tryLive(id);
      throw new Error(f.patch ? 'This game is an html build: copy the patch or send it to a director chat (it is never applied here).' : 'No safe one-click fix for that one: ask the director.');
    }
    const d = await lab();
    const cap = d.capture();
    if (S.lab?.sketchId && cap.sketchId !== S.lab.sketchId) throw new Error('Another scene is on screen now: run the doctor again.');
    const abDone = window.LabAB?.hold?.('gameperf', { label: `▶ ${f.lab.label}` });
    const back = [];
    try {
      for (const L of f.lab.layers) {
        const before = d.codeOf(L.id).code;
        await d.updateLayer(L.id, { code: L.next }, 1.2);
        back.push({ id: L.id, before });
      }
    } finally { abDone?.(); }
    const entry = { id, label: f.lab.label, text: f.title, undo: async () => { for (const b of back.reverse()) { try { await d.updateLayer(b.id, { code: b.before }, 1); } catch { /* the layer went away */ } } } };
    S.undos.push(entry); S.fixed.set(id, entry);
    toast(`▶ ${f.lab.label}: done (Undo puts the code back)`, { timeout: 5000, action: { label: 'Undo', fn: () => undo(entry).catch(err) } });
    paint();
    return entry;
  }
  async function undo(entry = S.undos[S.undos.length - 1]) {
    if (!entry) return false;
    const i = S.undos.indexOf(entry); if (i >= 0) S.undos.splice(i, 1);
    S.fixed.delete(entry.id);
    if (entry.live) await call('window.__gamePerf.undoLive()'); else await entry.undo();
    paint();
    return true;
  }
  // a setting tried on the running game only (the owner's click): gone on reload, Undo puts it back now
  async function tryLive(id) {
    const f = S.fid.find((x) => x.id === id);
    if (!f?.live) throw new Error('Nothing to try for that one.');
    const done = await call(`JSON.stringify(window.__gamePerf.tryLive(${JSON.stringify(f.live)}))`);
    const entry = { id, label: f.title, live: true, done };
    S.undos.push(entry); S.fixed.set(id, entry);
    paint();
    return entry;
  }
  // an html build's patch or a big fix: to a director chat's box (never sent by itself), or the clipboard
  async function ask(id) {
    const f = [...S.findings, ...S.fid].find((x) => x.id === id);
    if (!f) throw new Error('That finding is gone.');
    const text = `Make ${S.t?.label || 'the game'} smoother: ${f.title}. Fix: ${f.fix || ''}${f.patch ? `\nSuggested patch:\n${f.patch}` : f.snippet ? `\n${f.snippet}` : ''}${f.hits?.length ? `\nWhere: ${f.hits.map((h) => `${h.layer ? `${h.layer} ` : ''}line ${h.line} in ${h.fn}()`).join(', ')}` : ''}`;
    const dir = H.agents?.().find((a) => a.dock === 'three') || null;
    if (dir && typeof Native !== 'undefined' && Native.setDraft) { Native.setDraft(dir.id, text); toast(`In ${dir.name}'s box, not sent: press Enter when it reads right`, { timeout: 4000 }); return text; }
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Copied: paste it in a director chat', { timeout: 3000 });
    return text;
  }

  // ---------- the card ----------
  const fmtImpact = (x) => (x >= 100 ? 'big' : x >= 15 ? 'medium' : 'small');
  function row(f) {
    const done = S.fixed.get(f.id);
    const btn = (text, title, fn) => el('button', { type: 'button', class: 'lm-btn', text, title, on: { click: (e) => { e.currentTarget.disabled = true; fn().catch((x) => { err(x); paint(); }); } } });
    return el('div', { class: `gp-row${done ? ' done' : ''}`, attrs: { 'data-id': f.id } },
      el('span', { class: `gp-imp gp-${f.impact != null ? fmtImpact(f.impact) : 'fid'}`, text: f.impact != null ? fmtImpact(f.impact) : '✦' }),
      el('div', { class: 'gp-text' }, el('b', { text: f.title }), f.fix ? el('div', { class: 'gp-fix', text: f.fix }) : null,
        f.patch ? el('pre', { class: 'gp-patch', text: f.patch }) : null),
      el('span', { class: 'gp-acts' },
        done ? el('span', { class: 'gp-ok', text: '✓' }) : null,
        done ? btn('↶', 'Undo this', () => undo(done)) : null,
        !done && f.lab?.layers?.length ? btn(f.lab.label, 'Change the scene\'s code here (one undo step, kept in the Lab\'s versions)', () => fix(f.id)) : null,
        !done && !f.lab?.layers?.length && f.live ? btn('Try it', 'On the running game only, until it reloads', () => tryLive(f.id)) : null,
        !done && f.patch ? btn('Copy', 'Copy the patch (your build is never changed from here)', async () => { await navigator.clipboard?.writeText(f.patch); toast('Patch copied', { timeout: 1500 }); paint(); }) : null,
        !done && (f.ask || f.patch || f.snippet) ? btn('✦ Ask', 'Puts a short request in the director\'s box (not sent)', () => ask(f.id)) : null));
  }
  function paint() {
    const card = S.card; if (!card?.isConnected) return;
    const R = S.R;
    const by = Object.entries(R?.stutters?.by || {}).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${v.n} × ${C().CAUSE[k] || k}`).join(' · ');
    card.querySelector('.gp-sum').textContent = R ? `${R.fps} fps on ${R.hz} Hz · ${R.onTime}% of frames on time · median ${R.dtMed} ms (budget ${R.budget})${R.stutters.n ? ` · stutters: ${by}` : ' · no stutters'}${R.audio?.latencyMs != null ? ` · sound ${Math.round(R.audio.latencyMs)} ms` : ''}${S.input?.line ? ` · ${S.input.line}${S.input.ok === false && S.input.why ? ` (${S.input.why})` : ''}` : ''}` : ''; // (round 54, gameaudio: the sound's latency, base + output) · (round 56, playlatency: input → the game's next frame)
    const body = card.querySelector('.gp-body');
    const list = [...S.findings.map(row)];
    const hb = budgetRow(); if (hb) list.unshift(hb);
    if (S.look?.text) { const sc = S.look.r?.screen; list.unshift(el('div', { class: 'gp-none', text: `${S.look.text}${sc?.hdr ? ' · HDR screen: colours shown as made' : sc?.wide ? ' · wide-colour screen: colours shown as made' : ''}` })); }
    if (!S.findings.length) list.push(el('div', { class: 'gp-none', text: 'Nothing slowing it down was found: it runs smooth.' }));
    if (S.fid.length) list.push(el('div', { class: 'gp-head2', text: 'Max fidelity (only on your click)' }), ...S.fid.map(row));
    body.replaceChildren(...list);
    const u = card.querySelector('.gp-undo'); if (u) u.hidden = !S.undos.length;
  }
  // (round 55, playbudget) one line: what each of Hearth's helpers costs the game a frame (measured in its window), the
  // plain note when one was slowing it, and "Turn them back on" (from the next ▶ Play; still watched)
  function budgetRow() {
    const b = S.budget; if (!b?.helpers) return null;
    const parts = Object.values(b.helpers).map((h) => `${h.name} ${h.on ? `${Number(h.avg ?? h.ms).toFixed(3)} ms` : 'off'}`);
    const text = `Hearth's own work in the game: ${b.line.replace(/^Hearth: /, '')} a frame (at most ${b.budgetMs} ms: 2 % of a frame at ${b.hz} Hz) · ${parts.join(' · ')}`;
    const back = b.off?.length ? el('button', { type: 'button', class: 'lm-btn', text: 'Turn them back on', title: 'From the next ▶ Play (they stay watched: one that slows the game goes again)', on: { click: async (e) => { e.currentTarget.disabled = true; const src = (S.t?.source && typeof S.t.source === 'object' ? S.t.source : null) || (typeof GameMode !== 'undefined' ? GameMode.last() : null) || undefined; await window.hub.game?.budget?.({ op: 'reset', source: src }).catch(() => null); toast('Hearth\'s helpers are back on from the next ▶ Play', { timeout: 3000 }); } } }) : null;
    return el('div', { class: 'gp-none gp-budget' }, el('div', { text }), b.note ? el('div', { class: 'gp-fix', text: b.note }) : null, back);
  }
  function close() { S.card?.remove(); S.card = null; }
  function showCard() {
    const host = S.t?.host || (S.t?.kind === 'lab' ? (ThreeLab.scenes?.previewHost?.() || ThreeLab.stageHooks?.host) : null) || document.body;
    if (!S.card?.isConnected) {
      S.card = el('div', { class: `gp-card${host === document.body ? ' gp-float' : ''}`, attrs: { role: 'dialog', 'aria-label': 'Performance doctor' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } } } },
        el('div', { class: 'lm-head' }, el('b', { text: `▶ Why isn't ${S.t?.label || 'it'} buttery?` }), el('span', { class: 'lm-src', text: 'measured here, no tokens' }),
          el('button', { type: 'button', class: 'lm-btn', text: '↻', title: 'Measure again (4 s)', on: { click: () => doctor({ secs: 4 }).catch(err) } }),
          el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (fixes stay)', on: { click: close } })),
        el('div', { class: 'gp-sum' }), el('div', { class: 'gp-body' }),
        el('div', { class: 'lm-acts' }, el('button', { type: 'button', class: 'lm-btn gp-undo', text: '↶ Undo', hidden: true, title: 'Undo the last fix', on: { click: () => undo().catch(err) } })));
      if (host !== document.body && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.append(S.card);
    }
    paint();
  }
  // one click after a play session (secs: measure that long first; a Lab scene with no session: 4 s)
  async function doctor({ secs = null, show = true } = {}) {
    if (S.busy) return state();
    S.busy = true; S.card?.classList.add('busy');
    try {
      if (!S.t) await attachLab();
      const fresh = S.t && (await call('window.__gamePerf.state().frames').catch(() => 0)) > 60;
      await measure({ secs: secs ?? (fresh ? 0 : 4) });
      if (show) showCard();
      return state();
    } finally { S.busy = false; S.card?.classList.remove('busy'); }
  }
  function state() {
    return { label: S.t?.label || null, kind: S.t?.kind || null, hz: S.t?.hz || null, at: S.at, input: S.input?.line || null, hearth: S.budget ? { line: S.budget.line, budgetMs: S.budget.budgetMs, helpers: Object.fromEntries(Object.entries(S.budget.helpers || {}).map(([k, h]) => [k, h.on ? (h.avg ?? h.ms) : 'off'])), note: S.budget.note || '' } : null, fps: S.R?.fps ?? null, stutters: S.R?.stutters || null,
      findings: S.findings.map((f) => ({ id: f.id, title: f.title, impact: f.impact, fix: Boolean(f.lab?.layers?.length), patch: Boolean(f.patch) })),
      fidelity: S.fid.map((f) => ({ id: f.id, title: f.title, fix: Boolean(f.lab?.layers?.length), live: Boolean(f.live) })), fixed: [...S.fixed.keys()], undos: S.undos.map((u) => u.label) };
  }
  const compact = () => C().compact(S.R, S.findings, { name: S.t?.label || '' }) + (S.budget?.note ? `\n${S.budget.note}` : ''); // (round 55, playbudget: one line, only when Hearth switched a helper off)

  // ---------- ways in: /game-perf, Ctrl/⌘+K, the director (three_do perf) ----------
  async function directorTool(_tool, a = {}) {
    try {
      const op = String(a.op || 'check');
      if (op === 'fix') { const e = await fix(String(a.id || '')); return { ok: true, value: `${e.label}: done (owner can Undo; three_do perf {op: "undo"} too).` }; }
      if (op === 'undo') return { ok: true, value: (await undo()) ? 'Undone.' : 'Nothing to undo.' };
      if (op === 'fidelity') { if (!S.R) await doctor({ show: false }); return { ok: true, value: S.fid.length ? S.fid.map((f) => `[${f.id}${f.lab?.layers?.length ? ', fix' : ''}] ${f.title}`).join('\n') : 'Already at max fidelity.' }; }
      const old = !S.R || Date.now() - S.at > 120000 || a.fresh;
      if (old) await doctor({ show: false, secs: a.secs ?? null });
      return { ok: true, value: compact() };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  function register() {
    if (typeof HubBridge !== 'undefined') HubBridge.register(['three_perf'], directorTool);
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      AppUI.addAction('Game: why isn\'t it smooth? (performance doctor)', () => doctor().catch(err));
      AppUI.addAction('Game: stats chip (fps, frame graph, draw calls)', () => chip().catch(err));
    }
    if (typeof Commands === 'undefined' || Commands.get?.('game-perf')) return;
    Commands.register({
      name: 'game-perf', aliases: ['gameperf', 'perf-doctor'], area: 'Three.js Lab',
      args: '[check | chip | fix <id> | try <id> | undo | status]',
      desc: 'Why a three.js game (▶ Play, or the Lab scene) isn\'t buttery: fps, frame graph, every stutter explained (GC, shader compile, texture upload, long JS, layout, GPU), then findings with fixes sorted by impact; safe one-click fixes for a Lab scene (undo), patches as suggestions for an html build; max-fidelity suggestions. No tokens.',
      keywords: 'game perf performance fps stutter jank smooth buttery draw calls instancing gc garbage shader texture gpu pixel ratio shadows fidelity antialias doctor clink',
      examples: ['/game-perf', '/game-perf chip', '/game-perf fix garbage', '/game-perf undo'],
      complete: (x) => ['check', 'chip', 'fix ', 'try ', 'undo', 'status'].filter((v) => v.startsWith(String(x || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const [w, id] = String(args || '').trim().split(/\s+/);
        const k = (w || 'check').toLowerCase();
        if (k === 'chip') return (await chip()) ? 'Stats chip on (F in ▶ Play).' : 'Stats chip off.';
        if (k === 'undo') return (await undo()) ? 'Undone.' : 'Nothing to undo.';
        if (k === 'fix') return `${(await fix(id)).label}: done.`;
        if (k === 'try') return `${(await tryLive(id)).label}: on the running game (until it reloads).`;
        if (k === 'status') return S.R ? compact() : 'Nothing measured yet: /game-perf check.';
        await doctor();
        return compact();
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();

  return { attach, attachLab, probeSource, chip, measure, doctor, fix, undo, tryLive, ask, state, compact, close, directorTool,
    get card() { return S.card; }, get report() { return S.R; }, get findings() { return S.findings; }, get fidelityList() { return S.fid; }, get raw() { return S.raw; }, get target() { return S.t; } };
})();
