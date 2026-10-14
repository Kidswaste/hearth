// ✨ "Make it look finished" (round 30, autopolish): one click, no tokens. A local pass over the Lab scene on screen:
//   1. it measures the picture (lookmatch's reading: levels, saturation, palette, glow, plus pure black / blown white),
//      a few frames for the motion, the detail under the 9:16 apps' buttons (publishkit's safe areas), the scene's
//      ◐ Grade / ◐ Film & lens, its sliders and what follows the music (labaudio), its frame rate (labperf)
//   2. the rules (three-autopolish-core.js) propose a short list of fixes, each made of slider / grade changes only:
//      exposure, tone mapping, blacks, whites, contrast, bloom, color harmony, the safe area, motion, music, Light mode
//   3. they land together as one step (↶ Undo puts everything back: grade, lens, sliders, music links, motions,
//      palette, Light mode); each one can be unticked on the card; the picture is measured again so the card shows
//      what really changed ("brightest parts: 18 % → 79 %", the finish score before → after), with Before / After
//   4. what sliders can't fix is left for the director: "✦ Ask the director" sends what was done + what's left, the
//      cost shown first. The ◎ mission "Polish the look" runs this pass first and only then offers the director.
// Ways in (no command needed): right-click the preview › ✨ Make it look finished; ✦ More › ✨ Look & motion; the
// ◎ mission "Polish the look"; ⌘/Ctrl+K "Lab: Make it look finished". The app's internal command: /autopolish.
//   AutoPolish.run({ quiet }) · check() · undo() · toggle(id, on) · ask(note, { confirm }) · mission(agentId, text)
//   item() · previewItem() · state() · card
const AutoPolish = (() => {
  const C = () => PolishCore;
  const G = () => GradeCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => { toast(e?.message || String(e), { type: 'error' }); };
  const S = { last: null, card: null, busy: false, queue: Promise.resolve(), asked: null, overlay: null };

  async function lab() {
    const cmd = await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return { d: ThreeLab.director, cmd };
  }
  // the board's vibe reader (lookmatch's reading uses it) and publishkit's safe areas load on first use
  async function readers() {
    if (typeof Lazy !== 'undefined') {
      if (typeof BoardVibe === 'undefined') await Lazy.load('board').catch(() => null);
      if (typeof PublishCore === 'undefined') await Lazy.load('publishkit').catch(() => null);
    }
    if (typeof BoardVibe === 'undefined') throw new Error('The picture reader (the mood board) did not load.');
    return BoardVibe;
  }

  // ---------- measuring ----------
  const isGradeLayer = (L, have) => L.id === have.grade?.id || L.id === have.lens?.id || /^◐/.test(L.name || '');
  async function sliders(d) {
    const have = await LabGrade.findLayers(d);
    const out = [];
    for (const L of d.layers().layers || []) {
      if (isGradeLayer(L, have)) continue;
      let list = [];
      try { list = d.sliders(L.id)?.sliders || []; } catch { continue; }
      const ctl = ThreeLab.stageHooks?.ctlOf?.(L.id);
      for (const s of list) out.push({ ...s, layer: L.id, layerName: L.name, motion: ctl?.motion?.(s.key) || null });
    }
    return out;
  }
  async function frames(d, n = 4, gap = 180) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const url = await d.shotSmall(160).catch(() => null);
      if (url) out.push(url);
      if (i < n - 1) await sleep(gap);
    }
    return out;
  }
  // the whole reading of the scene (M, see three-autopolish-core.js) + its first small picture
  async function measure({ n = 4 } = {}) {
    const V = await readers();
    const { d, cmd } = await lab();
    const urls = await frames(d, n);
    if (!urls.length) throw new Error('The preview did not draw a picture to read (is a sketch running?).');
    const px = [];
    for (const u of urls) {
      const img = await V.loadImage(u).catch(() => null);
      if (!img) continue;
      if (!px.length) { px.push(V.pixelsOf(img, img.naturalWidth, img.naturalHeight, 160)); continue; }
      // the next frames at exactly the first one's size (Light mode or a resize between shots changes the pixels)
      const c = document.createElement('canvas'); c.width = px[0].w; c.height = px[0].h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
      px.push({ data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height });
    }
    if (!px.length) throw new Error('The preview\'s picture could not be read.');
    const pic = C().picture(px[0].data, px[0].w, px[0].h);
    const grays = px.map((p) => C().gray(p.data, p.w, p.h));
    const st = cmd.state;
    const fr = st.frame || {};
    const ratio = fr.width && fr.height ? fr.width / fr.height : px[0].w / px[0].h;
    let under = null;
    if (ratio < 0.8 && typeof PublishCore !== 'undefined') {
      const plat = store.get('three.safePlatform', 'tiktok');
      under = C().under(grays, px[0].w, px[0].h, PublishCore.zonesFor(PublishCore.get(plat) ? plat : 'tiktok', ratio));
    }
    const gs = await LabGrade.state().catch(() => ({}));
    const perf = (() => { try { const p = cmd.perf(); return p.parked || !p.fps ? { light: p.light } : { fps: p.fps, cap: Number(p.fpsCap) || 60, light: p.light }; } catch { return null; } })();
    const M = {
      pic, motion: C().motion(grays), under, frame: { id: fr.id || 'fit', ratio: Math.round(ratio * 1000) / 1000 },
      grade: gs?.grade || null, lens: gs?.lens || null, sliders: await sliders(d), palette: (d.refs?.palette?.() || []).slice(),
      sound: st.song ? 'song' : st.live ? 'live' : null, reactPlan: (typeof ThreeMusic !== 'undefined' && ThreeMusic.reactPlan?.()) || [],
      perf, frozen: Boolean(st.frozen),
    };
    return { M, shot: urls[0] };
  }

  // ---------- the scene as it was (↶ Undo) ----------
  const codeOf = (d, id) => { try { return d.codeOf(id).code || ''; } catch { return ''; } };
  async function snapshot(d, cmd) {
    const have = await LabGrade.findLayers(d);
    const one = (L) => (L ? { id: L.id, name: L.name, code: codeOf(d, L.id) } : null);
    let light = false; try { light = Boolean(cmd.perf().light); } catch { /* no stats yet */ }
    return { grade: one(have.grade), lens: one(have.lens), palette: (d.refs?.palette?.() || []).slice(), light, sketch: ThreeLab.scenes?.currentId?.() || null };
  }
  const lutNames = async () => { try { return (await LabGrade.luts()).imported.map((x) => x.name); } catch { return []; } };
  // the grade / lens layers: the wanted values written (made when missing, the lens right under the grade: one GPU
  // pass), or back to the snapshot when no ticked fix touches them; nothing re-runs when the code is the same
  async function writeLayers(d, m, snap) {
    const luts = await lutNames();
    for (const kind of ['grade', 'lens']) {
      const have = await LabGrade.findLayers(d);
      const now = have[kind]; const was = snap[kind];
      const want = m[kind] ? G().code(kind, m[kind], { luts }) : null;
      if (want) {
        if (now) { if (codeOf(d, now.id) !== want) await d.updateLayer(now.id, { code: want }, 0.6); } else {
          const position = kind === 'lens' && have.grade ? d.layers().layers.findIndex((x) => x.id === have.grade.id) + 1 : 0;
          await d.addLayer({ name: G().NAMES[kind], code: want, ...(position > 0 ? { position } : {}) }, 0.8);
        }
      } else if (was && now) { if (codeOf(d, now.id) !== was.code) await d.updateLayer(now.id, { code: was.code }, 0.6); } else if (was) await d.addLayer({ name: was.name, code: was.code }, 0.6);
      else if (now) await d.removeLayer(now.id);
    }
  }
  // the ticked fixes (ids), all as one change from the scene as it was: what no ticked fix touches goes back
  async function applySet(on) {
    const l = S.last;
    const { d, cmd } = await lab();
    const fixes = l.fixes.filter((f) => on.has(f.id));
    const m = C().merge(fixes, l.M);
    const every = C().merge(l.fixes, l.M); // everything any fix touches, with its value from before
    await writeLayers(d, m, l.snap);
    const pick = (list, x) => list.find((y) => y.layer === x.layer && y.key === x.key);
    const byLayer = {};
    for (const s of every.sliders) { const t = pick(m.sliders, s); (byLayer[s.layer] ||= {})[s.key] = t ? t.to : s.from; }
    for (const [layer, set] of Object.entries(byLayer)) { try { d.sliders(layer, set); } catch { /* the layer went away */ } }
    const ctlOf = (id) => ThreeLab.stageHooks?.ctlOf?.(id);
    for (const b of every.bindings) { const t = pick(m.bindings, b); const v = t ? t.to : b.from; ctlOf(b.layer)?.bind(b.key, v?.band || null, v?.amount ?? 0.5, v?.c); }
    for (const mo of every.motions) { const t = pick(m.motions, mo); ctlOf(mo.layer)?.setMotion(mo.key, t ? t.to : mo.from); }
    const pal = m.palette || l.snap.palette;
    if (JSON.stringify(pal) !== JSON.stringify(d.refs?.palette?.() || [])) d.refs?.setPalette?.(pal);
    const light = m.light ? true : l.snap.light;
    try { if (Boolean(cmd.perf().light) !== light) cmd.light(light); } catch { /* no stats */ }
    LabGrade.refresh?.();
  }

  // ---------- one click: measure, propose, apply, measure again, card ----------
  async function check() {
    const { M, shot } = await measure();
    return { M, shot, ...C().propose(M) };
  }
  // what each ticked fix reads now (the measured numbers on the card)
  function afterTexts(l) {
    if (!l.after) return;
    for (const f of l.fixes) {
      const r = C().BY[f.id];
      const v = on(f.id) && !r.settle ? r.read(l.after.M) : null; // (the frame rate needs a few seconds to settle: not read again here)
      f.after = v; f.afterText = v == null ? '' : r.show(v);
    }
  }
  const on = (id) => Boolean(S.last?.on.has(id));
  async function remeasure() {
    const l = S.last;
    await sleep(700);
    const { M, shot } = await measure({ n: 3 });
    if (S.last !== l) return;
    l.after = { M, shot, score: C().score(M) };
    afterTexts(l);
  }
  // only: fix ids to keep (🩺 Fix my scene asks for the exposure ones alone) · card: false = no card (the caller shows its own)
  async function run({ quiet = false, only = null, card = true } = {}) {
    if (S.busy) throw new Error('Still polishing.');
    S.busy = true;
    const busy = quiet ? null : toast('✨ Looking at the picture…', { timeout: 0 });
    const abDone = window.LabAB?.hold?.('autopolish'); // (round 37) ◧ Before / after: the whole polish is one change
    const rc = window.LabRecipesHook?.begin?.('autopolish', {}); // (round 39, labrecipes) one recipe step (measured again where it replays)
    let polished = false;
    try {
      const { d, cmd } = await lab();
      closeCard();
      const big = await d.shotSmall(480).catch(() => null);
      const r = await check();
      if (only) { r.fixes = r.fixes.filter((f) => only.includes(f.id)); r.left = []; }
      const snap = await snapshot(d, cmd);
      S.last = { M: r.M, fixes: r.fixes, left: r.left, before: { score: r.score, shot: r.shot, big }, snap, on: new Set(r.fixes.map((f) => f.id)), after: null, at: Date.now() };
      if (r.fixes.length) {
        try { await applySet(S.last.on); } catch (e) { await applySet(new Set()).catch(() => {}); S.last = null; throw e; }
        await remeasure().catch(() => {});
      }
      busy?.remove?.();
      const l = S.last;
      if (!l.fixes.length && !l.left.length) {
        if (!quiet) toast(`✨ It already looks finished (${l.before.score} / 100): nothing to fix`, { timeout: 3500 });
      } else {
        if (card) showCard();
        if (!quiet && l.fixes.length) toast(`✨ ${l.fixes.length} fix${l.fixes.length === 1 ? '' : 'es'}${l.after ? ` · finish ${l.before.score} → ${l.after.score}` : ''}`, { timeout: 4500, action: { label: 'Undo', fn: () => undo().catch(err) } });
      }
      polished = true;
      return state();
    } finally { busy?.remove?.(); S.busy = false; abDone?.(); rc?.(polished ? {} : false); }
  }
  // tick / untick one fix: the rest stay, the picture is read again
  function toggle(id, yes) {
    const l = S.last;
    if (!l || !l.fixes.some((f) => f.id === id)) return Promise.resolve(false);
    if (yes) l.on.add(id); else l.on.delete(id);
    S.queue = S.queue.then(async () => {
      if (S.last !== l) return;
      await applySet(new Set(l.on));
      await remeasure().catch(() => {});
      paintCard();
    }).catch(err);
    return S.queue.then(() => true);
  }
  async function undo() {
    const l = S.last;
    if (!l || l.undone) { toast('Nothing to undo.', { timeout: 1500 }); return false; }
    await S.queue;
    await applySet(new Set());
    l.undone = true;
    closeCard();
    toast('↶ The scene is back as it was', { timeout: 1800 });
    return true;
  }

  // ---------- the card over the preview ----------
  function closeCard() { hideBefore(); S.card?.remove(); S.card = null; }
  function showBefore() {
    const l = S.last; const hooks = ThreeLab.stageHooks; const host = hooks?.host;
    if (!l?.before?.big || !host || S.overlay) return;
    const hr = host.getBoundingClientRect(); const fr = hooks.frameRect || hr;
    S.overlay = el('img', { class: 'ap-before', src: l.before.big, alt: 'Before' });
    Object.assign(S.overlay.style, { left: `${fr.left - hr.left}px`, top: `${fr.top - hr.top}px`, width: `${fr.width}px`, height: `${fr.height}px` });
    host.append(S.overlay);
  }
  function hideBefore() { S.overlay?.remove(); S.overlay = null; }
  const pic = (src, label) => (src ? el('figure', { class: 'ap-pic' }, el('img', { src, alt: label }), el('figcaption', { text: label })) : null);
  function paintCard() {
    const l = S.last; const card = S.card;
    if (!l || !card) return;
    const after = l.after;
    const score = el('div', { class: 'ap-score', title: 'Exposure, contrast, color harmony, the 9:16 safe area, motion, music and frame rate, each weighed (measured on the picture, before and after)' },
      el('span', { text: 'Finish' }), el('b', { text: `${l.before.score}` }), after ? el('span', { text: '→' }) : null, after ? el('b', { class: after.score > l.before.score ? 'up' : '', text: `${after.score}` }) : null, el('span', { class: 'ap-of', text: '/ 100' }));
    const pics = el('div', { class: 'ap-pics' }, pic(l.before.shot, 'Before'), pic(after?.shot, 'After'));
    const rows = l.fixes.map((f) => {
      const box = el('input', { type: 'checkbox', checked: on(f.id), title: on(f.id) ? 'Untick: this one goes back' : 'Tick: apply it', on: { change: (e) => { toggle(f.id, e.target.checked); paintBusy(); } } });
      const nums = `${f.what ? `${f.what}: ` : ''}${on(f.id) && f.afterText ? `${f.beforeText} → ${f.afterText}` : on(f.id) && f.expectText ? `${f.beforeText} → ≈${f.expectText}` : f.beforeText}`;
      return el('label', { class: `ap-fix${on(f.id) ? '' : ' off'}`, title: f.why || '' }, box, el('span', { class: 'ap-t' }, el('b', { text: f.title }), el('i', { text: f.why || '' })), el('span', { class: 'ap-n', text: nums }));
    });
    const left = l.left.length ? el('div', { class: 'ap-left' }, el('b', { text: 'Left for the director' }), el('span', { text: l.left.map((x) => x.text).join(' · ') })) : null;
    const gradeTouched = l.fixes.some((f) => on(f.id) && (f.grade || f.lens));
    card.querySelector('.ap-body').replaceChildren(score, pics, el('div', { class: 'ap-fixes' }, rows), left || '');
    const ask = card.querySelector('.ap-ask'); if (ask) ask.textContent = `✦ Ask the director${l.left.length ? ' for what\'s left' : ''}`;
    const tune = card.querySelector('.ap-tune'); if (tune) tune.hidden = !gradeTouched;
  }
  function paintBusy() { S.card?.classList.add('busy'); S.queue.finally(() => S.card?.classList.remove('busy')); }
  function showCard() {
    const host = ThreeLab.scenes?.previewHost?.() || ThreeLab.stageHooks?.host;
    if (!host || !S.last) return;
    closeCard();
    const hold = el('button', { type: 'button', class: 'lm-btn', text: 'Before', title: 'Hold to see the picture before the fixes' });
    hold.addEventListener('pointerdown', showBefore);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, hideBefore);
    S.card = el('div', { class: 'ap-card', attrs: { 'aria-label': 'Make it look finished' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCard(); } } } },
      el('div', { class: 'lm-head' }, el('b', { text: '✨ Make it look finished' }), el('span', { class: 'lm-src', text: 'measured here, no tokens' }),
        el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (the fixes stay)', on: { click: () => closeCard() } })),
      el('div', { class: 'ap-body' }),
      el('div', { class: 'lm-acts' },
        S.last.fixes.length ? el('button', { type: 'button', class: 'lm-btn', text: '↶ Undo', title: 'Everything back as it was (grade, sliders, music, palette, Light mode)', on: { click: () => undo().catch(err) } }) : null,
        S.last.fixes.length ? hold : null,
        el('button', { type: 'button', class: 'lm-btn ap-tune', text: '◐ Fine-tune', title: 'The grade it set (exposure, tone, contrast, bloom…)', on: { click: () => LabGrade.open().catch(err) } }),
        el('button', { type: 'button', class: 'lm-btn lm-ask ap-ask', text: '✦ Ask the director', title: 'It gets what was fixed (with the numbers) and what\'s left; the cost shows first', on: { click: () => ask().catch(err) } })));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
    paintCard();
  }

  // ---------- ✦ the director, for what's left (cost first) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    let dir = directorOf();
    if (dir) return dir;
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'autopolish', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    dir = directorOf();
    if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    return dir;
  }
  function briefText(note = '') {
    const l = S.last;
    if (!l) return C().brief({ note });
    return C().brief({ fixes: l.fixes.filter((f) => on(f.id) && !l.undone), left: l.left, before: l.before.score, after: l.after?.score ?? null, note });
  }
  async function ask(note = '', { confirm = true, agentId = null } = {}) {
    const dir = agentId ? (H.agent?.(agentId) || { id: agentId, name: 'The director' }) : await director();
    const text = briefText(note);
    const c = C().cost(text);
    if (confirm) {
      const did = S.last?.fixes.filter((f) => on(f.id)).length || 0;
      const yes = await Modal.confirm(S.last?.left.length ? 'Ask the director for what\'s left?' : 'Ask the director to polish it further?',
        `${did ? `The local pass fixed ${did} thing${did === 1 ? '' : 's'} for free. ` : ''}${dir.name} gets what was done (with the numbers)${S.last?.left.length ? ' and what\'s left' : ''}${note ? ' and your words' : ''}: ≈${c} tokens with this message, plus its reply and the work it does.`, { ok: `Ask (≈${c} tokens)` });
      if (!yes) return false;
    }
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    await Native.send(dir.id, text);
    S.asked = { at: Date.now(), agentId: dir.id, cost: c };
    return true;
  }
  // the ◎ mission "Polish the look": this local pass first, then (cost first) the director for what's left + your words
  async function mission(agentId, text) {
    try { await run({ quiet: true }); } catch (e) { err(e); }
    const sent = await ask(text, { agentId }).catch((e) => { err(e); return false; });
    if (!sent && text) Native.setDraft?.(agentId, text);
    return sent;
  }

  // ---------- ways in ----------
  function item() {
    const l = S.last;
    const fresh = { label: '✨ Make it look finished', hint: 'measures light, color, motion, music; fixes them (no tokens)', cmd: 'autopolish', action: () => run().catch(err) };
    if (!l || l.undone || !l.fixes.length) return fresh;
    return { label: '✨ Make it look finished', hint: `${l.before.score} → ${l.after?.score ?? '…'} / 100`, items: () => [
      { ...fresh, label: 'Look again and fix', hint: 'a new pass on the picture as it is now' },
      { label: '↶ Undo the last polish', cmd: 'autopolish', action: () => undo().catch(err) },
      { label: 'Show the card', cmd: 'autopolish', action: () => showCard() },
      { label: '✦ Ask the director for what\'s left…', hint: 'cost shown first', cmd: 'autopolish', action: () => ask().catch(err) },
    ] };
  }
  const previewItem = () => item();
  function state() {
    const l = S.last;
    if (!l) return { on: false, asked: S.asked };
    return { on: !l.undone, before: l.before.score, after: l.after?.score ?? null, fixes: l.fixes.map((f) => ({ id: f.id, title: f.title, what: f.what, on: on(f.id), before: f.before, beforeText: f.beforeText, after: f.after ?? null, afterText: f.afterText || '', why: f.why, grade: f.grade || null, lens: f.lens || null, sliders: f.sliders || null, bindings: f.bindings || null, motions: f.motions || null, light: f.light || false })), left: l.left.map((x) => ({ id: x.id, text: x.text })), asked: S.asked };
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get?.('autopolish')) return;
    Commands.register({
      name: 'autopolish', area: 'Three.js Lab',
      args: '[check | undo | ask [words] | status]',
      desc: 'Make the Lab scene look finished, locally (no tokens): measures exposure, blacks / whites, contrast, bloom, color harmony, the 9:16 safe area, motion, the music\'s pull and the frame rate, then fixes them with grade / slider changes in one undo step; check: only say what it would fix; ask: the director gets what\'s left (cost first)',
      keywords: 'polish finish finished look better fix exposure contrast bloom colors harmony clash safe area 9:16 static jittery motion music react fps auto',
      examples: ['/autopolish', '/autopolish check', '/autopolish undo', '/autopolish ask warmer highlights'],
      complete: (a) => ['check', 'undo', 'ask', 'status'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const a = String(args || '').trim(); const w = a.split(/\s+/)[0].toLowerCase();
        const line = (s) => (s.fixes.length ? `✨ Finish ${s.before}${s.after != null ? ` → ${s.after}` : ''} / 100: ${s.fixes.filter((f) => f.on).map((f) => `${f.title.toLowerCase()} (${f.what} ${f.beforeText}${f.afterText ? ` → ${f.afterText}` : ''})`).join(' · ')}` : `✨ Finish ${s.before} / 100: nothing to fix`) + (s.left.length ? `. Left for the director: ${s.left.map((x) => x.text).join('; ')}` : '');
        if (w === 'undo') return (await undo()) ? 'The scene is back as it was.' : 'Nothing to undo.';
        if (w === 'ask') { await ask(a.slice(3).trim()); return undefined; }
        if (w === 'status') { const s = state(); return s.on ? line(s) : 'No polish pass yet (or it was undone).'; }
        if (w === 'check') { const r = await check(); return r.fixes.length || r.left.length ? `Finish ${r.score} / 100. Would fix: ${r.fixes.map((f) => `${f.title.toLowerCase()} (${f.what} ${f.beforeText}: ${f.why})`).join(' · ') || 'nothing'}${r.left.length ? `. Left for the director: ${r.left.map((x) => x.text).join('; ')}` : ''}` : `Finish ${r.score} / 100: nothing to fix.`; }
        return line(await run({ quiet: true }));
      },
    });
  }
  function actions() { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Make it look finished (measures and fixes, no tokens)', () => run().catch(err)); }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { run, check, undo, toggle, ask, mission, measure, item, previewItem, state, brief: briefText, get card() { return S.card; }, get busy() { return S.busy; }, get queue() { return S.queue; } };
})();
