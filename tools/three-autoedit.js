// Auto-edit (round 27, autoedit): "drop a song, get a whole music video". The plan (tools/three-autoedit-core.js)
// shows as one strip at the bottom of the Lab, a block per section of the song (intro / build / drop / break / outro):
// its scene, its length in bars, the transition into it, its intensity, its look, lyrics there or not. Click a block
// (or right-click it) to change any of that; nothing is made until "Make it":
//   · sections that want a scene that doesn't exist yet ask the director's crew for it (tools/three-crew.js: the cost
//     shows first and waits for your Start; each helper makes one section's scene on a backstage copy)
//   · then the Lab sequence is built from the plan (tools/three-seq.js: one undo step; the song under it, every cut on
//     a bar, a named marker per section, the lyrics as captions) and shown
//   · "⇪ Render" renders it the usual way (9:16 / 16:9 / 1:1, tools/three-export.js)
// Reached without commands: the 🎬 next to the song's name in the Lab timeline, ✦ More › ⇪ Make (the preview's
// right-click), the director's ◎ mission "Make a music video from this song", or asking the director (three_do
// autoedit). /music-video stays the internal API.
const AutoEdit = (() => {
  const A = AutoEditCore;
  const AUD = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const stem = (p) => base(p).replace(/\.[^.]+$/, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FORMATS = ['9:16', '16:9', '1:1', '4:5'];
  const TR_GLYPH = { cut: '│', 'lab-flash-beat': '✸', 'lab-fly': '⤳', 'lab-morph': '≈', dissolve: '◐', 'dip-black': '▪', 'whip-left': '»', 'lab-stutter': '⋯', 'lab-bloom': '✺' };
  const S = { plan: null, key: null, busy: '', made: null, brief: '' };
  const director = () => H.agents().find((a) => a.dock === 'three') || H.agents().find((a) => a.threeTools) || null;

  // ---------- what the Lab has: the song, the scenes ----------
  async function lab(show = false) { return ThreeLab.cmd({ show }); }
  async function songNow({ wait = 30000 } = {}) {
    const L = await lab();
    const P = L.player;
    if (!P?.loaded || P.isClock || !P.duration) return null;
    if (!AUD.test(P.path || '')) return null;
    for (let t = 0; !P.analysis && t < wait; t += 200) { if (t === 600) busy('Listening to the song…'); await sleep(200); }
    const a = P.analysis || {};
    let g = null; try { g = P.timeline().grid; } catch { /* no map yet */ }
    const grid = g?.bpm ? { bpm: g.bpm, anchor: g.downbeat ?? P.downbeat ?? 0, bpb: g.beatsPerBar || P.beatsPerBar || 4 } : (P.bpm ? { bpm: P.bpm, anchor: P.downbeat ?? 0, bpb: P.beatsPerBar || 4 } : null);
    let key = null;
    if (typeof ThreeAudio !== 'undefined' && ThreeAudio.songFeatures) key = (await Promise.race([ThreeAudio.songFeatures().catch(() => null), sleep(2500)]))?.keyName || null;
    return { src: P.path, name: stem(P.path), dur: P.duration, grid, sections: a.sections || [], drops: a.drops || [], level: a.level || null, fps: a.fps || 30, key };
  }
  // the scene on screen first, then your other scenes (latest first; no crew copies)
  function scenesNow(max = 12) {
    const SC = ThreeLab.scenes; if (!SC) return [];
    const cur = SC.currentId?.();
    const all = [...SC.all()].filter((x) => !String(x.id).startsWith('crew_')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const out = [];
    const add = (x) => { if (x && !out.some((y) => y.sketch === x.id)) out.push({ sketch: x.id, name: x.name }); };
    add(SC.get(cur));
    for (const x of all) add(x);
    return out.slice(0, max);
  }
  // the Lab's music for the lyrics alignment (the same as the type layers use)
  function music() {
    const P = ThreeLab.peek?.()?.player;
    if (!P?.loaded || P.isClock || !P.duration) return null;
    const a = P.analysis || {};
    let tl = {}; try { tl = P.timeline(); } catch { /* no map */ }
    return { duration: P.duration, bpm: P.bpm, bpb: P.beatsPerBar || 4, downbeat: P.downbeat ?? 0, beats: P.beatsIn(0, P.duration), onsets: a.onsets || {}, markers: tl.markers || {}, sections: (a.sections || []).map((s) => ({ start: s.start, end: s.end, label: s.label })), file: P.path };
  }
  const formatNow = () => { const id = ThreeLab.peek?.()?.state?.frame?.id; return FORMATS.includes(id) ? id : '9:16'; };

  // ---------- the plan ----------
  const saveSoon = () => { try { store.set('three.autoedit.plan', S.plan); } catch { /* full */ } };
  async function makePlan({ brief = null, fresh = false, seed = null } = {}) {
    const song = await songNow();
    if (!song) throw new Error('Load a song first (🎵 in the Lab timeline)');
    const was = S.plan || store.get('three.autoedit.plan', null);
    if (brief != null) S.brief = String(brief).trim();
    if (!fresh && was?.song?.src === song.src && was.v === 1 && brief == null) { S.plan = was; return S.plan; }
    S.plan = A.plan(song, { scenes: scenesNow(), seed: seed ?? Math.floor(Math.random() * 1e5) + 1, format: was?.song?.src === song.src ? was.format : formatNow(), brief: S.brief, lyrics: was?.song?.src === song.src ? was.lyrics : null });
    S.key = null;
    saveSoon();
    return S.plan;
  }
  function change(fn, label = '') {
    if (!S.plan || S.busy) return false;
    S.plan = fn(S.plan);
    saveSoon();
    Panel.paint();
    if (label) toast(label, { timeout: 1600 });
    return true;
  }
  async function open({ brief = null, fresh = false } = {}) {
    await lab(true);
    Panel.open();
    busy('Reading the song…');
    try { await makePlan({ brief, fresh }); } catch (err) { busy(''); Panel.close(); toast(err.message, { type: 'error', timeout: 5000 }); return null; }
    busy('');
    Panel.paint();
    return S.plan;
  }
  function busy(t) { S.busy = t || ''; Panel.paint(); }

  // ---------- Make it ----------
  // new scenes: one crew helper per section that wants one (its brief: that section's), the cost first; each kept as
  // a sketch; one that came out broken or unchanged falls back to the scene on screen in a variation
  async function makeScenes(p) {
    const fresh = A.newOnes(p);
    if (!fresh.length) return p;
    if (typeof ThreeCrew === 'undefined') throw new Error('The crew isn\'t loaded');
    const d = director();
    if (!d) throw new Error('No Three Director yet: it makes the new scenes (Director › Make the Three Director)');
    const chatId = H.activeChat?.[d.id] || null;
    busy(`${fresh.length} new scene${fresh.length > 1 ? 's' : ''}: your OK on the crew's cost first`);
    Panel.el?.classList.add('ae-up');
    const c = await ThreeCrew.plan(chatId, { n: Math.max(2, fresh.length), brief: `Scenes for a music video on "${p.song.name}"${p.brief ? `: ${p.brief}` : ''}`, angles: fresh.length > 1 ? fresh.map((x) => x.s.scene.brief) : [fresh[0].s.scene.brief, `${fresh[0].s.scene.brief} A second, different take (kept as a spare scene).`], by: 'owner' });
    S.crew = c;
    try {
      if (!(await c.decided)) { toast('Nothing made: the new scenes needed the crew (change them to existing scenes, or Make it again)', { timeout: 5000 }); return null; }
      busy('The crew is making the new scenes…');
      await c.finished;
      const hero = scenesNow(1)[0];
      const made = {};
      for (const [k, x] of fresh.entries()) {
        const h = c.helpers[k];
        if (h && h.changed && !h.broken) { await ThreeCrew.keep(h.n).catch(() => null); if (h.keptAs) made[x.i] = { sketch: h.keptAs, name: ThreeLab.scenes.get(h.keptAs)?.name || `${x.s.label} scene` }; }
        if (!made[x.i] && hero) made[x.i] = hero;
      }
      // (the crew has at least 2 helpers: with one new scene, the second take is kept as a spare sketch)
      for (const h of c.helpers.slice(fresh.length)) if (h.changed && !h.broken) await ThreeCrew.keep(h.n).catch(() => null);
      const n = A.fillNew(p, made);
      S.plan = n; saveSoon();
      return n;
    } finally { Panel.el?.classList.remove('ae-up'); }
  }
  async function make() {
    if (S.busy) throw new Error(`Busy: ${S.busy}`);
    if (!S.plan) await makePlan();
    try {
      const p = await makeScenes(S.plan);
      if (!p) return null;
      busy('Putting the video together…');
      if (typeof ThreeSeq === 'undefined' || !ThreeSeq.applyEdit) throw new Error('The Lab sequence isn\'t loaded');
      const sid = ThreeLab.scenes?.currentId?.() || null;
      const keys = (await ThreeSeq.list()).map((x) => x.key);
      if (S.key && keys.includes(S.key)) await ThreeSeq.open(S.key, { show: true });
      else await ThreeSeq.create(`${p.song.name} video`, { format: p.format, empty: true, show: true, scene: sid });
      if (ThreeSeqData.formatOf(ThreeSeq.edit) !== p.format) ThreeSeq.setFormat(p.format);
      if (ThreeSeqData.songOf(ThreeSeq.edit)?.src !== p.song.src) await ThreeSeq.add({ path: p.song.src, song: true });
      let cues = null;
      if (p.lyrics.on && typeof TypeLyrics !== 'undefined') {
        const parsed = TypeLyrics.parse(p.lyrics.text);
        const m = music();
        const lines = m ? TypeLyrics.align(parsed.lines, m).lines : parsed.lines;
        cues = A.lyricCues(lines, p);
      }
      const r = A.build(ThreeSeq.edit, p, { D: ThreeSeqData, C: CutData, captionItem: SeqCut.captionItem, cues });
      ThreeSeq.applyEdit(r.edit, `🎬 Music video: ${r.info.clips} clips on ${r.info.sections} sections`);
      S.key = ThreeSeq.key; S.made = { at: Date.now(), ...r.info };
      // the sequence takes the view: the strip steps aside (✦ More › ⇪ Make, or 🎬 by the song, brings the plan back)
      Panel.close();
      toast(`🎬 Made: ${r.info.clips} clips, ${Math.round(r.info.seconds)} s, every cut on a bar${r.info.captions ? `, ${r.info.captions} lyric lines` : ''}. ⇪ Render when you like it.`, { timeout: 7000, action: { label: '⇪ Render', fn: () => { Panel.open(); Panel.paint(); Panel.renderMenu(Panel.el?.querySelector('.ae-render')); } } });
      return r.info;
    } finally { busy(''); }
  }

  // ---------- Render (the existing path: the export page, ffmpeg) ----------
  async function render(format = null) {
    if (typeof ThreeSeq === 'undefined') throw new Error('The Lab sequence isn\'t loaded');
    if (!S.key) throw new Error('Make it first');
    if (ThreeSeq.key !== S.key) await ThreeSeq.open(S.key, { show: false });
    const fmts = format === 'all' ? ['9:16', '16:9', '1:1'] : [format || S.plan?.format || '9:16'];
    const out = [];
    for (const f of fmts) out.push(await ThreeSeq.render({ format: f }));
    return out;
  }

  // ---------- the strip ----------
  const Panel = (() => {
    let card = null; let strip = null; let head = null; let foot = null; let sig = '';
    function open() {
      if (card) return;
      head = el('div', { class: 'ae-head' });
      strip = el('div', { class: 'ae-strip', attrs: { role: 'list' } });
      foot = el('div', { class: 'ae-foot' });
      card = el('div', { class: 'ae-panel', attrs: { role: 'dialog', 'aria-label': 'Music video plan' }, dataset: { feature: 'Music video' } }, head, strip, foot);
      document.body.append(card);
      sig = '';
    }
    function close() { card?.remove(); card = null; strip = null; head = null; foot = null; sig = ''; }
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); fn(e); } } });
    const run = (fn) => Promise.resolve().then(fn).catch((err) => toast(err.message, { type: 'error', timeout: 5000 }));
    function sectionItems(i) {
      const p = S.plan; const s = p.sections[i];
      const scenes = scenesNow();
      const pickScene = scenes.map((x, k) => ({ label: `${s.scene.sketch === x.sketch ? '● ' : ''}${x.name}`, hint: k === 0 ? 'on screen now' : '', action: () => change((q) => A.setScene(q, i, x), `${s.label}: “${x.name}”`) }));
      const est = typeof ThreeCrew !== 'undefined' ? ThreeCrew.estimate(2, 450, 970) : null;
      return [
        `${A.ICON[s.label]} ${s.label} · ${A.fmt(s.a)}–${A.fmt(Math.min(s.b, p.end))}`,
        { label: 'Scene', hint: s.scene.kind === 'new' ? 'new (the director makes it)' : s.scene.name, items: () => [...pickScene, '-', { label: `${s.scene.kind === 'new' ? '● ' : ''}✦ A new one, made by the director`, hint: est ? `≈ ${Math.round(est.each / 1000)}k tokens; the cost shows before it runs` : 'the cost shows before it runs', action: () => change((q) => A.setScene(q, i, 'new'), `${s.label}: a new scene`) }] },
        { label: 'Length', hint: `${s.bars} bars`, items: () => [-4, -1, 1, 4].map((d) => ({ label: `${d > 0 ? '+' : '−'}${Math.abs(d)} bar${Math.abs(d) > 1 ? 's' : ''}`, hint: i === p.sections.length - 1 ? 'where the video ends' : 'the next section gives / takes it', action: () => change((q) => A.setBars(q, i, s.bars + d)) })) },
        i > 0 ? { label: 'Transition in', hint: A.TR[s.trans]?.name, items: () => A.TRANS.map((t) => ({ label: `${s.trans === t.id ? '● ' : ''}${TR_GLYPH[t.id] || ''} ${t.name}`, hint: t.beats ? `${t.beats} beat${t.beats === 1 ? '' : 's'}, on the bar` : 'on the bar', action: () => change((q) => A.setTrans(q, i, t.id)) })) } : null,
        { label: 'Look', hint: s.look ? A.LOOK[s.look]?.name : 'none', items: () => [...A.LOOKS.map((l) => ({ label: `${s.look === l.id ? '● ' : ''}${l.name}`, action: () => change((q) => A.setLook(q, i, l.id)) })), '-', { label: `${s.look ? '' : '● '}No look`, action: () => change((q) => A.setLook(q, i, null)) }] },
        { label: 'Cuts', hint: `every ${s.cuts} bar${s.cuts > 1 ? 's' : ''}`, more: true, items: () => [1, 2, 4, 8].filter((b) => b <= s.bars).concat(s.bars > 8 ? [s.bars] : []).map((b) => ({ label: `${s.cuts === b ? '● ' : ''}${b === s.bars ? 'One shot for the section' : `Every ${b} bar${b > 1 ? 's' : ''}`}`, action: () => change((q) => A.setCuts(q, i, b)) })) },
        p.lyrics.on ? { label: s.words ? '🅰 No lyrics here' : '🅰 Lyrics here', more: true, action: () => change((q) => A.setWords(q, i, !s.words)) } : null,
      ].filter(Boolean);
    }
    function renderMenu(anchor = null) {
      const items = [
        ...['9:16', '16:9', '1:1'].map((f) => ({ label: `${f === S.plan?.format ? '● ' : ''}${f}`, hint: { '9:16': 'Shorts, Reels, TikTok', '16:9': 'YouTube', '1:1': 'square' }[f], action: () => run(() => render(f)) })),
        { label: 'All three', hint: 'one video each', action: () => run(() => render('all')) },
      ];
      if (anchor) showMenuAt(anchor, items); else showMenu(innerWidth / 2 - 90, innerHeight - 260, items);
    }
    function lyricsAsk() {
      const p = S.plan;
      Modal.prompt('The lyrics, one line each (or an .lrc / .srt text). Empty: no lyrics.', { value: p.lyrics.text || '', multiline: true }).then((v) => { if (v == null) return; change((q) => A.setLyrics(q, v), String(v).trim() ? 'Lyrics on: they land on the song when you Make it' : 'No lyrics'); });
    }
    function paint() {
      if (!card) return;
      const p = S.plan;
      const want = JSON.stringify([p, S.busy, S.key, S.made?.at]);
      if (want === sig) return;
      sig = want;
      card.classList.toggle('busy', Boolean(S.busy));
      if (!p) { head.replaceChildren(el('b', { text: '🎬 Music video' }), el('span', { class: 'ae-meta', text: S.busy || '' }), el('span', { class: 'spacer' }), btn('✕', 'Close', () => close())); strip.replaceChildren(); foot.replaceChildren(); return; }
      const sm = A.summary(p);
      head.replaceChildren(
        el('b', { text: '🎬 Music video' }),
        el('span', { class: 'ae-meta', text: `${p.song.name} · ${A.fmt(p.end)}${p.song.grid?.bpm ? ` · ${Math.round(p.song.grid.bpm)} BPM` : ''}${p.song.key ? ` · ${p.song.key}` : ''}`, title: p.brief ? `Your brief: ${p.brief}` : p.song.src }),
        el('span', { class: 'spacer' }),
        btn(p.format, 'Frame size of the video', (e) => showMenuAt(e.currentTarget, FORMATS.map((f) => ({ label: `${p.format === f ? '● ' : ''}${f}`, action: () => change((q) => A.setFormat(q, f)) })))),
        btn('🅰', p.lyrics.on ? 'Lyrics on (click: edit them)' : 'Add lyrics (they land on the song)', () => lyricsAsk(), `ghost small${p.lyrics.on ? ' on' : ''}`),
        btn('🎲', 'Another plan (other scenes and looks per section)', () => run(async () => { await makePlan({ fresh: true }); Panel.paint(); })),
        btn('✕', 'Close (the plan stays for next time)', () => close()),
      );
      strip.replaceChildren(...p.sections.map((s, i) => {
        const len = Math.max(0, Math.min(s.b, p.end) - s.a);
        const b = el('button', {
          type: 'button', class: `ae-sec ae-${s.label.toLowerCase()}${s.scene.kind === 'new' ? ' new' : ''}`, attrs: { role: 'listitem' }, dataset: { i: String(i) },
          title: `${s.label}: ${s.scene.kind === 'new' ? s.scene.brief : `“${s.scene.name}”`}\n${s.bars} bars · in: ${A.TR[s.trans]?.name || s.trans} · intensity ${Math.round(s.intensity * 100)} % · cut every ${s.cuts} bar${s.cuts > 1 ? 's' : ''}${s.look ? ` · ${A.LOOK[s.look]?.name}` : ''}\nClick to change`,
          on: { click: (e) => showMenu(e.clientX, e.clientY - 10, sectionItems(i)), contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, sectionItems(i)); } },
        },
        i > 0 ? el('span', { class: 'ae-tr', text: TR_GLYPH[s.trans] || '│', title: A.TR[s.trans]?.name || '' }) : null,
        el('span', { class: 'ae-lab', text: `${A.ICON[s.label]} ${s.label}` }),
        el('span', { class: 'ae-bars', text: `${s.bars} bars` }),
        el('span', { class: 'ae-scene', text: s.scene.kind === 'new' ? '✦ new scene' : s.scene.name }),
        el('span', { class: 'ae-look', text: `${s.look ? A.LOOK[s.look]?.name : ''}${p.lyrics.on && s.words ? ' · 🅰' : ''}` }),
        el('span', { class: 'ae-int' }));
        b.style.flexGrow = Math.max(1, len).toFixed(2); b.style.setProperty('--i', String(s.intensity));
        return b;
      }));
      const est = sm.newScenes && typeof ThreeCrew !== 'undefined' ? ThreeCrew.estimate(Math.max(2, sm.newScenes), 450, 970) : null;
      foot.replaceChildren(
        el('span', { class: 'ae-sum', text: S.busy || `${sm.sections} sections · ${sm.clips} clips · cuts on the bars${sm.newScenes ? ` · ${sm.newScenes} new scene${sm.newScenes > 1 ? 's' : ''} (≈ ${Math.round(est ? est.total / 1000 : 40)}k tokens, the cost shows first)` : ' · nothing to pay'}` }),
        el('span', { class: 'spacer' }),
        btn(S.key ? '↻ Make it again' : '🎬 Make it', 'Build the video from this plan (a Lab sequence; nothing renders yet)', () => run(make), 'primary small ae-make'),
        btn('⇪ Render ▾', S.key ? 'Render it: 9:16, 16:9 or 1:1' : 'Make it first', (e) => renderMenu(e.currentTarget), 'ghost small ae-render'),
      );
      for (const x of foot.querySelectorAll('button')) x.disabled = Boolean(S.busy);
      foot.querySelector('.ae-render').disabled = Boolean(S.busy) || !S.key;
    }
    return { open, close, paint, renderMenu, sectionItems, get el() { return card; }, get strip() { return strip; } };
  })();

  // ---------- the director: three_do autoedit ----------
  const sectionRef = (v) => { const k = Number(v); if (!Number.isFinite(k) || k < 1) throw new Error('section: 1, 2, 3… (as the plan numbers them)'); return k - 1; };
  async function tool(_t, args = {}) {
    const op = String(args.op || 'show');
    try {
      if (op === 'plan') { await lab(true); Panel.open(); await makePlan({ brief: args.brief ?? null, fresh: Boolean(args.fresh) || args.brief != null }); if (args.format) S.plan = A.setFormat(S.plan, args.format); Panel.paint(); return { ok: true, value: `${A.describe(S.plan)}\nThe owner sees this as a strip and may change it; three_do autoedit {op: "set"…} changes a section, {op: "make"} builds it.` }; }
      if (!S.plan) await makePlan();
      if (op === 'show') { Panel.open(); Panel.paint(); return { ok: true, value: A.describe(S.plan) }; }
      if (op === 'set') {
        const i = sectionRef(args.section);
        let p = S.plan;
        if (args.scene != null) {
          const w = String(args.scene);
          const sc = /^new$/i.test(w) ? 'new' : scenesNow(200).find((x) => x.name.toLowerCase() === w.toLowerCase() || x.sketch === w) || scenesNow(200).find((x) => x.name.toLowerCase().includes(w.toLowerCase()));
          if (!sc) throw new Error(`No scene "${w}" (or "new")`);
          p = A.setScene(p, i, sc === 'new' && args.brief ? { kind: 'new', brief: String(args.brief) } : sc);
        }
        if (args.bars != null) p = A.setBars(p, i, args.bars);
        if (args.trans != null) p = A.setTrans(p, i, args.trans);
        if (args.look !== undefined) p = A.setLook(p, i, args.look || null);
        if (args.cuts != null) p = A.setCuts(p, i, args.cuts);
        if (args.lyrics != null) p = A.setWords(p, i, Boolean(args.lyrics));
        S.plan = p; saveSoon(); Panel.paint();
        return { ok: true, value: A.describe(p) };
      }
      if (op === 'lyrics') { S.plan = A.setLyrics(S.plan, args.text || ''); saveSoon(); Panel.paint(); return { ok: true, value: S.plan.lyrics.on ? 'Lyrics on (captions where the plan says lyrics)' : 'No lyrics' }; }
      if (op === 'format') { if (!FORMATS.includes(args.format)) throw new Error('format: 9:16, 16:9, 1:1 or 4:5'); S.plan = A.setFormat(S.plan, args.format); saveSoon(); Panel.paint(); return { ok: true, value: `Format ${args.format}` }; }
      if (op === 'make') { Panel.open(); Panel.paint(); const r = await make(); return r ? { ok: true, value: `Made: ${r.clips} clips, ${Math.round(r.seconds)} s, ${r.sections} sections${r.captions ? `, ${r.captions} lyric lines` : ''} (the sequence is on screen). Render only when the owner asks.` } : { ok: true, value: 'Not made: the owner said no to the crew for the new scenes.' }; }
      if (op === 'render') { const out = await render(args.format || null); return { ok: true, value: { files: out.map((o) => o?.path).filter(Boolean) } }; }
      return { ok: false, error: 'autoedit op: plan {brief, fresh, format} | show | set {section, scene (name|new), brief, bars, trans, look, cuts, lyrics} | lyrics {text} | format {format} | make | render {format|all}' };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_autoedit'], tool);

  // ---------- /music-video (the internal API: the menus and the mission run the same) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('music-video')) {
    Commands.register({
      name: 'music-video', area: 'Three.js Lab', args: '[brief] | again | make | render [9:16|16:9|1:1|all] | close',
      desc: 'A whole music video from the loaded song: a plan per section (scene, length, transition on the beat, look, lyrics) you can change, then Make it and Render',
      examples: ['/music-video', '/music-video neon rain, slow camera', '/music-video again', '/music-video make', '/music-video render 9:16'],
      keywords: 'auto edit autoedit music video clip song sections drop build plan storyboard shorts reel',
      complete: (a) => ['again', 'make', 'render 9:16', 'render 16:9', 'render 1:1', 'render all', 'close'].filter((x) => x.startsWith(a.trim().toLowerCase())).map((value) => ({ value })),
      run: async (args) => {
        const w = String(args || '').trim();
        if (/^close$/i.test(w)) { Panel.close(); return 'Closed (the plan stays for next time)'; }
        if (/^make$/i.test(w)) { if (!Panel.el) await open(); const r = await make(); return r ? `🎬 Made: ${r.clips} clips, ${Math.round(r.seconds)} s` : 'Not made'; }
        const m = /^render\s*(.*)$/i.exec(w);
        if (m) { const out = await render(m[1].trim() || null); return `Rendered: ${out.map((o) => o?.path).filter(Boolean).join(', ') || 'see Renders'}`; }
        const p = await open({ brief: w && !/^again$/i.test(w) ? w : null, fresh: /^again$/i.test(w) });
        return p ? A.describe(p) : 'Load a song first (🎵 in the Lab timeline)';
      },
    });
  }

  // ---------- the director's ◎ mission (only in the Lab's docked director) ----------
  const inLab = (id) => H.agent?.(id)?.dock === 'three';
  if (typeof Missions !== 'undefined' && Missions.add) {
    Missions.add({
      id: 'lab-music-video', icon: '🎬', label: 'Make a music video from this song', when: inLab,
      desc: 'A plan of the whole video by section (scenes, cuts on the beat, looks, lyrics) shows as a strip you can change; nothing is made until Make it. Your words steer the new scenes.',
      submit: (agent, text, t) => { open({ brief: t || null }).catch((err) => toast(err.message, { type: 'error' })); return true; },
    });
  }
  // the 🎬 next to the song in the Lab timeline, ✦ More › ⇪ Make
  const item = () => ({ label: '🎬 A music video from this song', hint: 'a plan per section first; nothing renders until you say', cmd: 'music-video', action: () => open().catch((err) => toast(err.message, { type: 'error' })) });

  return { open, close: () => Panel.close(), make, render, tool, item, makePlan, get plan() { return S.plan; }, set plan(p) { S.plan = p; Panel.paint(); }, get key() { return S.key; }, get busy() { return S.busy; }, get panel() { return Panel.el; }, _Panel: Panel, _S: S };
})();
window.AutoEdit = AutoEdit;
