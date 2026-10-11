// Studio (round 15): one-click creative pipelines that chain what Hearth already has, so the owner discovers what's
// possible ("feel free to make me discover things"). A recipe (studio-data.js) becomes:
//   - a make (makes.js): one name, one mark, its rooms made now (a board frame, a Three Director chat "<Name> · Lab",
//     a second Three Director chat for the video…) and its other parts as steps, each with a progress bar;
//   - a Flows run (flows.js): its questions asked first (only the ones it needs), then every step moves by itself; the
//     run shows on the Commands page under "Going now", as a live card in the Lab room's chat, hung → pick up here,
//     ↻ Again. Each step is /studio-do <recipe> <step> <run> (a quiet action), the scene itself is the room's Three
//     Director in its own chat (one lean prompt), the rest reuses the existing parts: the board's vibe, Pinterest
//     searches, the Lab's song analysis, ✦ Arrange, the render queue, Meshy (cost shown and asked first, by its
//     adapter), Poly Haven skies, the camera moves, Deploy (asks before anything goes public), Photoshop, Suno.
// Where: one "Studio" entry — Ctrl/⌘+K "Studio…", a Studio section on the Commands page, /studio in any chat. Each
// recipe shows its one-line pitch, what it may cost (tokens / Meshy credits) and what is missing on this computer
// (ffmpeg, Photoshop, a publishing CLI, a Meshy key…) with the fix one click away.
// Token frugality: nothing reaches any prompt unless a recipe runs; its one director step is a two-line ask with the
// vibe capped at 600 characters. Chats read about Studio on demand only (hearth-map topic "studio").
const Studio = (() => {
  const D = StudioData;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const LIVE = ['running', 'waiting-ai', 'waiting-you', 'hung'];

  // ---------- what this computer has (cached 30 s; one look per need, nothing per frame) ----------
  let have = null; let haveAt = 0;
  async function needsNow(fresh = false) {
    if (have && !fresh && Date.now() - haveAt < 30000) return have;
    const h = {};
    const tryIt = async (k, fn) => { try { h[k] = await fn(); } catch { h[k] = false; } };
    await Promise.all([
      tryIt('claude', async () => H.agents().some((a) => a.mode === 'native' && a.engine === 'claude')),
      tryIt('ffmpeg', async () => Boolean((await window.hub.ffmpegStatus?.())?.ffmpeg)),
      tryIt('meshy', async () => Boolean((await window.hub.apps?.key('meshy', 'has'))?.has)),
      tryIt('photoshop', async () => { const s = await Adobe.status(); const a = s.apps.find((x) => x.id === 'photoshop'); h.photoshopWhy = a?.reason || ''; return Boolean(a?.found); }),
      tryIt('deploy', async () => (await Deploy.status(false)).providers.some((p) => p.found)),
      tryIt('board', async () => { await Board.ready(); return Board.items().some((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden); }),
      tryIt('suno', async () => typeof AppsSuno !== 'undefined'),
    ]);
    have = h; haveAt = Date.now();
    return h;
  }
  // [{ id, label, fix, cmd, soft }] what a recipe misses here (soft: it still runs, it asks or does less)
  async function missing(r, fresh = false) {
    const h = await needsNow(fresh);
    return [...(r.needs || []).map((id) => ({ id, soft: false })), ...(r.soft || []).map((id) => ({ id, soft: true }))]
      .filter((n) => !h[n.id]).map((n) => ({ ...n, ...D.NEEDS[n.id], ...(n.id === 'photoshop' && h.photoshopWhy ? { why: h.photoshopWhy } : {}) }));
  }
  function costText(r) {
    const parts = [];
    if (r.tokens) parts.push(r.tokens);
    if (r.credits) { let c = '?'; try { c = MeshyAPI.estimate(r.credits, {}).credits; } catch { /* the adapter isn't loaded */ } parts.push(`Meshy ≈ ${c} credits (shown and asked first)`); }
    return parts.join(' · ') || 'free';
  }
  const chain = (r) => r.rooms.map((x) => x.label || MakesCore.KINDS[x.kind]?.label || x.kind).join(' → ');

  // ---------- starting a recipe: the make (rooms now), then the run ----------
  const hereAgent = () => { const a = H.agent(H.activeId); return a?.mode === 'native' ? a.id : (H.claudeAgent?.()?.id || null); };
  // o: { vars (answers given up front: song, idea, vibewords, words), name, agentId, chatId, open, source }
  async function start(ref, o = {}) {
    const r = typeof ref === 'object' ? ref : D.get(ref) || D.find(ref);
    if (!r) throw new Error(`No recipe “${ref}” (/studio lists them)`);
    if (typeof Flows === 'undefined' || typeof Makes === 'undefined') throw new Error('Studio needs Flows and Makes');
    await Makes.ready();
    const vars = { ...(o.vars || {}) };
    const words = vars.idea || (vars.song && !/^suno$/i.test(vars.song) ? base(vars.song).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : '') || vars.words || '';
    const name = o.name || (words ? MakesCore.nameFor(words) : '') || '';
    const plan = D.partsOf(r);
    const make = await Makes.plan({ text: words, name }, { show: false, name: name || null, kinds: plan.map((p) => ({ kind: p.kind, brief: p.brief })), who: { cmd: `/studio ${r.id}`, source: o.source || 'studio' } });
    make.idea = cap(`${r.name}${words ? `: ${words}` : ''} · ${r.pitch}`, 300);
    make.studio = { recipe: r.id };
    const parts = {};
    plan.forEach((p, i) => { const part = make.parts[i]; if (!part) return; parts[p.key] = part.id; if (p.label) Makes.setPart(make, part, part.status || 'planned', { label: p.label }); });
    const lab = plan.findIndex((p) => p.kind === 'lab');
    const labPart = lab >= 0 ? make.parts[lab] : null;
    const agentId = labPart?.agentId || o.agentId || hereAgent();
    const chatId = labPart?.chatId || o.chatId || (agentId ? H.activeChat?.[agentId] : null) || null;
    const flow = D.flowOf(r, { agentId: labPart?.agentId || null });
    try { Flows.define(flow, { source: 'studio' }); } catch { /* a run carries its own copy anyway */ }
    const sid = `st${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    Object.assign(vars, { sid, make: make.id, name: make.name, parts, lab: labPart?.chatId || '' });
    // answers given up front skip their question (a skipped question clears its own var, so they live beside it)
    if (vars.song) { vars.song0 = vars.song; vars.songset = '1'; delete vars.song; }
    if (vars.idea) { vars.idea0 = vars.idea; vars.ideaset = '1'; delete vars.idea; }
    if (labPart && o.open !== false) await Makes.openRoom(make, labPart);
    const done = Flows.start(flow, { agentId, chatId, vars, title: `${r.icon} ${make.name}` });
    const run = Flows.runs().find((x) => x.vars?.sid === sid) || null;
    if (run) { make.studio.runId = run.id; sync(run); }
    done.catch((err) => toast(`Studio: ${err.message}`, { type: 'error', timeout: 6000 }));
    return { make, run, recipe: r, done };
  }

  // ---------- the run moves the make: each step's part is working / done / stuck, with its bar ----------
  const synced = new Map(); // run id → last written key (compare before writing)
  function sync(run) {
    if (!run?.vars?.sid || !run.flow?.studio) return;
    const make = Makes.get(run.vars.make);
    if (!make) return;
    const parts = run.vars.parts || {};
    const own = new Set(run.vars.watchParts || []);
    const byPart = new Map();
    for (const n of run.flow.nodes) if (n.part && parts[n.part] && !own.has(n.part)) { if (!byPart.has(n.part)) byPart.set(n.part, []); byPart.get(n.part).push(n); }
    const last = new Map(); for (const e of run.steps || []) last.set(e.node, e);
    const out = [];
    for (const [key, nodes] of byPart) {
      const es = nodes.map((n) => last.get(n.id)).filter(Boolean);
      const done = nodes.filter((n) => ['done', 'skipped', 'error'].includes(last.get(n.id)?.status)).length;
      const cur = es.find((e) => ['running', 'waiting', 'hung'].includes(e.status));
      const stuck = cur?.status === 'hung' || (run.status === 'hung' && cur);
      const st = stuck ? 'stuck' : done === nodes.length ? 'done' : es.length ? 'working' : 'planned';
      out.push([key, st, Math.round((100 * done) / nodes.length), cur ? (nodes.find((n) => n.id === cur.node)?.title || '') : '']);
    }
    const k = JSON.stringify(out);
    if (synced.get(run.id) === k) return;
    synced.set(run.id, k);
    for (const [key, st, pct, label] of out) {
      const part = make.parts.find((p) => p.id === parts[key]);
      if (!part) continue;
      if (st === 'stuck') { Makes.setPart(make, part, 'stuck'); continue; }
      if (st === 'planned') continue;
      if (st === 'working' && part.status !== 'working') Makes.setPart(make, part, 'working');
      Makes.progress(make.id, part.id, { pct: st === 'done' ? 100 : Math.max(5, pct), label: st === 'done' ? 'done' : label });
    }
  }

  // ---------- the steps (/studio-do <recipe> <step> <sid>) ----------
  const runOf = (sid) => Flows.runs().filter((r) => r.vars?.sid === sid).sort((a, b) => (LIVE.includes(b.status) - LIVE.includes(a.status)) || b.updated - a.updated)[0] || null;
  const partOf = (run, key) => { const m = Makes.get(run.vars.make); return m ? { make: m, part: m.parts.find((p) => p.id === run.vars.parts?.[key]) || null } : { make: null, part: null }; };
  // a command run quietly for a step (its text is the step's output); errors become the step's error
  async function cmd(line, run) {
    let out = ''; let err = null;
    await Commands.tryRun(line, run.agentId || hereAgent(), null, { source: 'flow', history: false, say: (t) => { out += `${out ? '\n' : ''}${t}`; }, note: (t) => { out += `${out ? '\n' : ''}${t}`; }, error: (m) => { err = m; } });
    if (err) throw new Error(err);
    return String(out || '').replace(/\*\*/g, '').trim();
  }
  async function labScene(run) {
    await ThreeLab.cmd({ show: false });
    for (let i = 0; i < 80 && !(ThreeLab.scenes && ThreeLab.director); i += 1) await sleep(100);
    return (run.vars.lab && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf(run.vars.lab) : null) || ThreeLab.scenes?.currentId?.() || null;
  }
  const STEPS = {
    // the board's vibe (text, capped: it rides in the director's one prompt)
    async vibe({ run }) {
      await Board.ready();
      const b = Board.current();
      const refs = (b?.items || []).filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
      if (!refs.length) { run.vars.vibe = ''; run.vars.hasvibe = ''; return `${b?.name || 'The board'} has no references yet.`; }
      const text = BoardDrawer.vibeText({ board: b, rule: false }).replace(/^[^:\n]*:\n/, '');
      run.vars.vibe = cap(text, 600); run.vars.hasvibe = '1';
      return `${refs.length} reference${refs.length === 1 ? '' : 's'} on ${b.name}: ${cap(text, 220)}`;
    },
    // Pinterest searches for what the board misses: buttons in the room's chat (nothing opens by itself)
    async pins({ run }) {
      await Board.ready();
      const s = await BoardPins.forBoard(Board.current(), run.vars.vibewords || '');
      if (!s?.phrases?.length) return 'No searches to suggest.';
      const id = run.agentId;
      if (id && Native.view?.(id)) Native.note(id, `📌 **Pinterest searches** for more references (click one: ＋ Board on a pin adds it; the run goes on meanwhile)`, { id: `studio-pins-${run.vars.sid}`, actions: s.phrases.map((p) => ({ label: `📌 ${p}`, run: () => BoardPins.open(p) })) });
      return `Pinterest searches: ${s.phrases.join(' · ')}`;
    },
    // the Lab room in front (its director's chat is where the scene step talks)
    async room({ run }) {
      const { make, part } = partOf(run, 'lab');
      if (!make || !part) return 'No Lab room: the open scene is used.';
      await Makes.openRoom(make, part);
      await labScene(run);
      return `Opened ${MakesCore.roomTitle(make, part)}`;
    },
    // a song (a path, "suno", or the Lab's own) loaded in the room's scene and analysed: tempo and sections
    async song({ run }) {
      let p = String(run.vars.song || run.vars.song0 || '').trim().replace(/^["']|["']$/g, '');
      if (/^suno$/i.test(p)) { p = await AppsSuno.newestSong(); if (!p) throw new Error('No Suno song downloaded yet: download one in the Suno window (/suno), then pick up here.'); }
      await labScene(run);
      let info;
      if (p) { const r = await HubBridge.call('three_load_media', { path: p }); if (!r?.ok) throw new Error(r?.error || `The Lab couldn't load ${base(p)}`); info = r.value; }
      else { const r = await HubBridge.call('three_media_info', {}); info = r?.value; if (!info?.loaded) throw new Error('No song: give a file path or "suno" (✎ change the answer), or load one in the Lab, then pick up here.'); }
      const secs = []; for (const s of info.sections || []) if (s?.label && secs.at(-1) !== s.label) secs.push(s.label);
      const bpm = Math.round(info.grid?.bpm || 0);
      return `${base(info.file || p)}${bpm ? ` · ${bpm} BPM` : ''}${info.duration ? ` · ${Math.round(info.duration)} s` : ''}${secs.length ? ` · ${secs.slice(0, 8).join(' → ')}` : ''}`;
    },
    // ✦ Arrange on the room's scene alone (on its song when it has one)
    async sequence({ run, step }) {
      const sid = await labScene(run);
      if (!sid) throw new Error('No Lab scene to cut.');
      await ThreeSeq.current({ scene: sid });
      const info = await ThreeSeq.arrange({ names: [sid], template: step.template || null, secs: step.secs || null });
      return `${info?.clips ?? '?'} clips, ${Number(info?.seconds || 0).toFixed(1)} s${info?.cutsOnBars ? ', cuts on bars' : ''}`;
    },
    // into the render queue; the make's render (and video) parts follow the jobs from here
    async render({ run, step }) {
      const fmt = String(run.vars.fmt || step.fmt || 'reels').trim();
      const at = Date.now() - 500;
      const text = await cmd(`/renders render ${fmt} seq`, run);
      if (/^Nothing to render/.test(text)) throw new Error(text);
      run.vars.watch = { at, review: false };
      run.vars.watchParts = ['render', ...(run.flow.nodes.some((n) => n.part === 'video') ? ['video'] : [])];
      watch(run);
      return cap(text.replace(/^⇪ In the queue: /, '').split('. They render')[0], 200);
    },
    // the first finished render opens in the system player (the video room gets it too)
    async review({ run }) {
      if (run.vars.watch) run.vars.watch.review = true;
      watch(run);
      return 'It opens in your video player when it\'s rendered.';
    },
    // Meshy: the adapter shows the cost (and the balance) and asks; nothing starts without a yes
    async meshy({ run }) {
      const idea = String(run.vars.idea || run.vars.idea0 || '').trim();
      const img = /^board$/i.test(idea) || (!idea && (await needsNow()).board);
      if (!idea && !img) throw new Error('Nothing to make: say what the hero should be.');
      const r = await AppsMeshy.run(img ? 'image' : 'text', img ? { image: 'board' } : { prompt: idea, name: run.vars.name }, { chatId: run.vars.lab || null, to: 'lab' });
      if (!r?.ok) throw new Error(r?.error || 'Meshy didn\'t start');
      run.vars.jobId = r.job.id;
      return `Meshy started “${r.job.name}” (≈ ${r.credits} credits, you said yes).`;
    },
    // polled: the model is in the library (and the Lab) → ready; a failed job stops here (pick up here retries the wait)
    async 'meshy-wait'({ run }) {
      const id = run.vars.jobId;
      if (!id) throw new Error('No Meshy job in this run.');
      const lib = await AppsMeshy.models();
      const m = lib.find((x) => x.id === id);
      if (m) return `ready: ${m.name}`;
      const j = ((await window.hub.apps.meshy('jobs', { resume: false }))?.value || []).find((x) => x.id === id);
      if (j?.status === 'failed') throw new Error(`Meshy: ${j.error || 'the job failed'}`);
      const { make, part } = partOf(run, 'model');
      if (make && part && j) Makes.progress(make.id, part.id, { pct: Math.max(5, Math.min(95, j.pct || 0)), label: `Meshy ${j.label || 'working'}` });
      return `${j?.pct || 0} % · ${j?.label || 'waiting'}`;
    },
    // a free Poly Haven sky that fits the words (studio light when nothing fits)
    async sky({ run }) {
      if (!window.AppsPoly) throw new Error('Poly Haven isn\'t loaded.');
      const words = String(run.vars.idea || run.vars.idea0 || '').toLowerCase();
      const want = ['night', 'sunset', 'sunrise', 'forest', 'city', 'beach', 'snow', 'desert', 'indoor', 'studio'].find((w) => words.includes(w)) || (/space|neon|cyber|dark/.test(words) ? 'night' : 'studio');
      let list = await AppsPoly.search(want, 'hdris');
      if (!list.length) list = await AppsPoly.search('', 'hdris');
      const a = list[0];
      if (!a) throw new Error('Poly Haven had no sky to give (offline?).');
      const p = await AppsPoly.fetchAsset(a.id, 'hdris', '1k');
      await Apps.route(p, 'lab-hdri', { name: a.name || a.id });
      return a.name || a.id;
    },
    camera: ({ run }) => cmd('/camera-move orbit for 6 s', run),
    // Deploy builds, previews and asks before anything goes public
    async publish({ run }) {
      const r = await Deploy.publish({ what: 'scene', ref: '', agentId: run.agentId });
      if (!r?.ok) throw new Error(r?.error || 'Not published');
      if (r.url) { const { make } = partOf(run, 'pub'); if (make) { make.idea = cap(`${make.idea} · ${r.url}`, 300); } }
      return r.url || r.previewUrl || 'published';
    },
    async link({ run }) { if (!/^https?:/.test(run.vars.url || '')) return 'No link to copy.'; await copyText(run.vars.url, 'Link copied'); return 'Copied.'; },
    async still({ run }) {
      await labScene(run);
      const p = await Adobe.labStill();
      const { make, part } = partOf(run, 'still');
      if (make) Makes.addOutput(make, p, part?.id || null, 'still');
      return p;
    },
    async photoshop({ run }) {
      const a = (await Adobe.status(true)).apps.find((x) => x.id === 'photoshop');
      if (!a?.found) throw new Error(`${a?.reason || 'Photoshop isn\'t installed'} (${D.NEEDS.photoshop.fix})`);
      await Adobe.psOpen(run.vars.still);
      let more = '';
      if (run.vars.sizes) {
        const s = await Adobe.psSizes(run.vars.sizes, run.vars.still);
        const { make, part } = partOf(run, 'ps');
        if (make) for (const f of s.files || []) Makes.addOutput(make, typeof f === 'string' ? f : f.path, part?.id || null, 'still');
        more = ` ${(s.files || []).length} social sizes in ${base(s.dir)}.`;
      }
      return `Open in Photoshop.${more}`;
    },
    async 'to-board'({ run }) {
      const ps = [...(run.steps || [])].reverse().find((e) => e.node === 'ps');
      if (ps?.error) run.vars.psout = `Photoshop wasn't reached (${cap(ps.error, 140)}).`;
      if (!run.vars.still) return 'No still to place.';
      await Board.ready();
      await Board.addFiles([run.vars.still]);
      return `On ${Board.current()?.name || 'the board'}.`;
    },
    async 'suno-prompt'({ run }) { return cmd(`/suno prompt ${run.vars.words || ''}`.trim(), run).then(async (t) => { run.vars.sunoBefore = (await AppsSuno.newestSong()) || ''; try { await AppsSuno.paste(); } catch (err) { return `${cap(t, 160)} (${err.message})`; } return 'Written from the vibe and pasted into Suno: press Create there, then download the song.'; }); },
    async 'suno-wait'({ run }) { const p = await AppsSuno.newestSong(); return p && p !== run.vars.sunoBefore ? `ready: ${base(p)}` : 'waiting for a Suno download'; },
    async 'suno-use'({ run }) { const p = await AppsSuno.use('lab-song'); return `${base(p)} is the Lab's song.`; },
  };
  async function doStep(args) {
    const [rid, stepId, sid] = String(args || '').trim().split(/\s+/);
    const r = D.get(rid);
    const step = r?.steps.find((s) => s.id === stepId);
    const fn = step && STEPS[step.do || step.wait];
    if (!fn) return `Usage: /studio-do <recipe> <step> <run> (a Studio run's own step; /studio starts one)`;
    const run = runOf(sid);
    if (!run) throw new Error('That Studio run is gone.');
    return fn({ run, r, step });
  }

  // ---------- renders → the make's outputs, opened at the end (a quiet poll while something renders) ----------
  const watched = new Map(); // run id → run
  let watchT = 0;
  function watch(run) {
    if (!run?.vars?.watch || run.vars.watch.ended) return;
    watched.set(run.id, run);
    if (!watchT) watchT = setInterval(tickWatch, 3000);
    tickWatch();
  }
  function tickWatch() {
    if (typeof Renders === 'undefined') return;
    for (const [id, run] of watched) {
      const w = run.vars.watch;
      const make = Makes.get(run.vars.make);
      const jobs = Renders.list().filter((j) => (j.created || 0) >= w.at && (j.kind !== 'ffmpeg' || j.output || j.title));
      if (!jobs.length) continue;
      const live = jobs.filter((j) => ['queued', 'starting', 'running', 'paused'].includes(j.status));
      const ok = jobs.filter((j) => j.status === 'done' && j.output);
      const rp = make?.parts.find((p) => p.id === run.vars.parts?.render);
      const vp = make?.parts.find((p) => p.id === run.vars.parts?.video);
      if (make) for (const j of ok) Makes.addOutput(make, j.output, rp?.id || null, 'video');
      const pct = Math.round(jobs.reduce((s, j) => s + (j.status === 'done' ? 100 : Number(j.pct) || 0), 0) / jobs.length);
      const k = `${pct}|${live.length}|${ok.length}`;
      if (w.k !== k) { w.k = k; if (make && rp) { if (rp.status !== 'working' && live.length) Makes.setPart(make, rp, 'working'); Makes.progress(make.id, rp.id, { pct: live.length ? Math.max(3, Math.min(99, pct)) : 100, label: live.length ? `${live.length} rendering` : `${ok.length} rendered` }); } }
      if (w.review && ok.length && !w.opened) {
        w.opened = true;
        MediaFile.open(ok[0].output);
        if (make && vp) Makes.progress(make.id, vp.id, { pct: 100, label: 'opened' });
      }
      if (!live.length) {
        w.ended = true; watched.delete(id);
        if (make && vp && !w.review) Makes.setPart(make, vp, 'ready');
        if (!ok.length && make && rp) Makes.setPart(make, rp, 'stuck');
        else toast(`✦ ${run.vars.name}: ${ok.length} render${ok.length === 1 ? '' : 's'} ready`, { timeout: 4000, action: { label: 'Show', fn: () => Makes.show(make?.id) } });
      }
    }
    if (!watched.size) { clearInterval(watchT); watchT = 0; }
  }

  // ---------- the picker (one dialog: search, a card per recipe, what's missing with its fix, ▶ Start) ----------
  async function pick(q = '') {
    document.querySelector('dialog.studio-pick')?.close();
    const list = el('div', { class: 'studio-list' });
    const search = el('input', { type: 'search', class: 'studio-search', placeholder: 'Find a pipeline…', value: q });
    const dlg = el('dialog', { class: 'ui-modal studio-pick' },
      el('div', { class: 'studio-head' }, el('h2', { text: '✦ Studio' }), el('span', { class: 'studio-sub', text: 'one click: Hearth chains its parts for you' }), el('span', { class: 'spacer' }), search, el('button', { type: 'button', class: 'ghost small', text: 'Close', on: { click: () => dlg.close() } })),
      list);
    const go = async (r, vars = {}) => { dlg.close(); try { await start(r, { vars, source: 'picker' }); } catch (err) { toast(err.message, { type: 'error', timeout: 6000 }); } };
    async function card(r) {
      const miss = await missing(r);
      const extra = r.id === 'song-viz' ? el('button', { type: 'button', class: 'ghost small', text: '♪ Pick a song…', title: 'Choose the song file now (else it asks)', on: { click: async () => { const ps = await window.hub.openDialog({ title: 'A song for the visualizer', properties: ['openFile'], filters: [{ name: 'Audio / video', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mov'] }] }); if (ps?.[0]) go(r, { song: ps[0] }); } } }) : null;
      return el('div', { class: 'studio-card', dataset: { recipe: r.id }, tabindex: 0 },
        el('div', { class: 'studio-icon', text: r.icon }),
        el('div', { class: 'studio-body' },
          el('b', { text: r.name }), el('p', { class: 'studio-pitch', text: r.pitch }),
          el('div', { class: 'studio-chain', text: chain(r) }),
          el('div', { class: 'studio-cost', text: `Costs: ${costText(r)}` }),
          miss.length ? el('div', { class: 'studio-miss' }, ...miss.map((m) => el('div', { class: `studio-need${m.soft ? ' soft' : ''}` },
            el('span', { text: `${m.soft ? '○' : '⚠'} ${m.soft ? 'Better with' : 'Missing'}: ${m.label}` }),
            el('button', { type: 'button', class: 'ghost small', text: 'Fix', title: m.fix, on: { click: async () => { dlg.close(); toast(m.fix, { timeout: 6000 }); await Commands.tryRun(m.cmd, hereAgent(), null, { source: 'studio' }); } } })))) : null),
        el('div', { class: 'studio-acts' }, el('button', { type: 'button', class: 'primary small', text: '▶ Start', title: miss.some((m) => !m.soft) ? 'It starts anyway: the step that needs it waits (fix it, then pick up here)' : 'Its questions come first, then it runs by itself', on: { click: () => go(r) } }), extra));
    }
    async function paint() {
      const s = search.value.trim();
      const rs = s ? D.RECIPES.filter((r) => `${r.name} ${r.pitch} ${r.words}`.toLowerCase().includes(s.toLowerCase()) || D.find(s) === r) : D.RECIPES;
      const cards = await Promise.all(rs.map(card));
      list.replaceChildren(...(cards.length ? cards : [el('p', { class: 'hint', text: `No pipeline for “${s}”.` })]));
    }
    search.addEventListener('input', () => { clearTimeout(search.t); search.t = setTimeout(paint, 120); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const id = list.querySelector('.studio-card')?.dataset.recipe; if (id) go(D.get(id)); } });
    list.addEventListener('contextmenu', (e) => {
      const c = e.target.closest('.studio-card'); if (!c) return;
      e.preventDefault();
      const r = D.get(c.dataset.recipe);
      showMenu(e.clientX, e.clientY, [{ label: '▶ Start', action: () => go(r) }, { label: `Copy /studio ${r.id}`, action: () => copyText(`/studio ${r.id}`, 'Copied') }, { label: 'Its steps as a flow (node view)', action: () => { dlg.close(); Flows.define(D.flowOf(r), { source: 'studio' }); FlowsUI.open?.({ flowId: `studio-${r.id}` }); } }]);
    });
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    await needsNow(true).catch(() => null);
    await paint();
    dlg.showModal();
    search.focus();
    return dlg;
  }

  // ---------- chat: /studio ----------
  const runs = () => Flows.runs().filter((r) => r.flow?.studio);
  const statusLine = (r) => `${r.flow.icon || '✦'} ${r.vars?.name || ''} · ${D.get(r.flow.studio)?.name || r.flowName} · ${Flows.STATUS_LABEL[r.status] || r.status} · ${Flows.line?.(r) || ''}`.replace(/ · $/, '');
  async function listText() {
    const out = [];
    for (const r of D.RECIPES) {
      const miss = await missing(r);
      out.push(`${D.line(r)}\n   ${chain(r)} · costs: ${costText(r)}${miss.length ? `\n   ${miss.map((m) => `${m.soft ? '○' : '⚠'} ${m.label}: ${m.fix}`).join('\n   ')}` : ''}\n   /studio ${r.id}`);
    }
    return `**Studio**: one-click pipelines (each is a make with its rooms, and a run on the Commands page)\n${out.join('\n')}`;
  }
  async function studioCmd(args, ctx = {}) {
    const s = String(args || '').trim();
    const [w0 = '', ...rest] = s.split(/\s+/);
    const v = w0.toLowerCase();
    if (!s) { await pick(); return null; }
    if (v === 'list' || v === 'recipes' || v === 'help') return listText();
    if (v === 'status' || v === 'runs') { const rs = runs().slice(0, 6); return rs.length ? rs.map(statusLine).join('\n') : 'No Studio run yet: /studio picks one.'; }
    if (v === 'needs' || v === 'missing') { const h = await needsNow(true); return Object.entries(D.NEEDS).map(([k, n]) => `${h[k] ? '✓' : '·'} ${n.label}${h[k] ? '' : `: ${n.fix}`}`).join('\n'); }
    // /studio <recipe words…> [: words for it]  ·  the recipe takes the longest prefix that names one
    let r = null; let tail = '';
    const ws = s.split(/\s+/);
    const hay = (x) => new Set(`${x.id.replace(/-/g, ' ')} ${D.norm(x.name)} ${x.words}`.split(' '));
    for (let k = Math.min(ws.length, 4); k >= 1 && !r; k -= 1) { const head = ws.slice(0, k).join(' ').replace(/[:→]$/, ''); const hit = D.RECIPES.find((x) => x.id === head.toLowerCase() || D.norm(x.name) === D.norm(head)); if (hit) { r = hit; tail = ws.slice(k).join(' '); } }
    // forgiving: the first one or two words, each a word of the recipe ("song", "3d", "song viz", "photoshop")
    for (let k = Math.min(ws.length, 2); k >= 1 && !r; k -= 1) { const head = D.norm(ws.slice(0, k).join(' ')).split(' ').filter(Boolean); const hit = head.length && D.RECIPES.find((x) => head.every((w) => hay(x).has(w))); if (hit) { r = hit; tail = ws.slice(k).join(' '); } }
    tail = tail.replace(/^[:—-]\s*/, '');
    if (!r) { await pick(s); return null; }
    const vars = {};
    if (tail) { if (r.id === 'song-viz') vars.song = tail; else if (r.id === 'idea-3d') vars.idea = tail; else if (r.id === 'board-video') vars.vibewords = tail; else vars.words = tail; }
    const res = await start(r, { vars, agentId: ctx.agentId, chatId: ctx.chatId, source: ctx.source || 'chat' });
    return `✦ **${res.make.name}** · ${r.name} started: ${chain(r)}. ${r.steps.some((x) => x.ask && !(x.skipIf && vars[x.var])) ? 'Its questions are in the card; then it runs by itself.' : 'It runs by itself.'} Follow it on the Commands page (Going now) or /studio status.`;
  }

  // ---------- the Commands page: a Studio section ----------
  function pageSections(q) {
    const s = String(q || '').trim().toLowerCase().replace(/^\//, '');
    const rs = s ? D.RECIPES.filter((r) => `studio ${r.name} ${r.pitch} ${r.words}`.toLowerCase().includes(s)) : D.RECIPES;
    if (!rs.length) return [];
    return [{ head: `✦ Studio · ${rs.length}`, items: rs.map((r) => ({ node: el('button', { class: 'cp-row studio-row', type: 'button', dataset: { ext: `studio:${r.id}` }, title: r.pitch },
      el('span', { class: 'cp-pv studio-pv', text: r.icon }),
      el('span', { class: 'cp-rtext' }, el('b', { text: r.name }), el('span', { class: 'cp-desc', text: r.pitch })),
      el('span', { class: 'cp-area', text: 'studio' })) })) }];
  }
  async function pagePick(id, right) {
    if (!String(id).startsWith('studio:')) return;
    const r = D.get(String(id).slice(7));
    if (!r) return;
    const miss = await missing(r);
    const last = runs().filter((x) => x.flow.studio === r.id).slice(0, 3);
    right.replaceChildren(el('div', { class: 'cp-example studio-detail' },
      el('div', { class: 'cp-ex-head' }, el('h2', { text: `${r.icon} ${r.name}` }), el('span', { class: 'cp-area', text: 'studio' })),
      el('p', { class: 'cp-def', text: r.pitch }),
      el('div', { class: 'studio-chain', text: chain(r) }),
      el('ol', { class: 'studio-steps' }, ...r.steps.filter((x) => !x.result).map((x) => el('li', { text: `${x.ask ? '✎ ' : x.director ? '✦ ' : ''}${x.title}` }))),
      el('div', { class: 'studio-cost', text: `Costs: ${costText(r)}` }),
      ...miss.map((m) => el('div', { class: `studio-need${m.soft ? ' soft' : ''}`, text: `${m.soft ? '○' : '⚠'} ${m.label}: ${m.fix}` })),
      el('div', { class: 'studio-acts' }, el('button', { type: 'button', class: 'primary', text: '▶ Start', on: { click: () => start(r, { source: 'commands-page' }).catch((err) => toast(err.message, { type: 'error' })) } }), el('code', { text: `/studio ${r.id}` })),
      last.length ? el('div', { class: 'studio-last' }, el('b', { text: 'Last runs' }), ...last.map((x) => el('button', { type: 'button', class: 'ghost small', text: statusLine(x), on: { click: () => CmdPage.openRun(x.id) } }))) : null));
  }
  function pageMenu(id, e) {
    if (!String(id).startsWith('studio:')) return;
    const r = D.get(String(id).slice(7));
    if (r) showMenu(e.clientX, e.clientY, [{ label: '▶ Start', action: () => start(r, { source: 'commands-page' }).catch((err) => toast(err.message, { type: 'error' })) }, { label: `Copy /studio ${r.id}`, action: () => copyText(`/studio ${r.id}`, 'Copied') }]);
  }

  // ---------- registering ----------
  function register() {
    const reg = (def) => { if (Commands.get(def.name)) { console.warn(`studio: /${def.name} is taken`); return; } Commands.register({ area: 'Studio', ...def }); };
    reg({
      name: 'studio', aliases: ['recipes'].filter((a) => !Commands.get(a)), args: '[<pipeline> [words] | list | status | needs]',
      desc: 'One-click creative pipelines (Board → video, Song → visualizer, Idea → 3D hero, Scene → website, Still → Photoshop, Vibe → song): each a make with its rooms, run step by step',
      keywords: 'pipeline recipe chain workflow make board video song visualizer meshy 3d website deploy photoshop suno discover',
      examples: ['/studio', '/studio song /path/to/track.mp3', '/studio idea-3d a chrome dragon skull', '/studio board-video', '/studio list'],
      complete: (a) => { const w = String(a || '').toLowerCase(); return [...D.RECIPES.map((r) => ({ value: r.id, hint: r.name })), { value: 'list', hint: 'every pipeline, its cost, what\'s missing' }, { value: 'status', hint: 'Studio runs' }, { value: 'needs', hint: 'what this computer has' }].filter((x) => x.value.startsWith(w)); },
      run: studioCmd,
    });
    reg({ name: 'studio-do', hidden: true, args: '<recipe> <step> <run>', desc: 'One step of a Studio run (the run calls it; /studio starts one)', run: (a) => doStep(a) });
    try { AppUI.addAction?.('Studio: one-click pipelines (board → video, song → visualizer, idea → 3D…)', () => pick()); } catch { /* the palette is optional */ }
    if (typeof CmdPage !== 'undefined' && CmdPage.ext) { CmdPage.ext.sections.push(pageSections); CmdPage.ext.pick.push(pagePick); CmdPage.ext.menu.push(pageMenu); }
    Flows.onChange((run) => { if (run?.flow?.studio) sync(run); });
    // renders that were still going when Hearth closed: their make keeps following them
    setTimeout(() => { for (const r of runs()) if (r.vars?.watch && !r.vars.watch.ended && Date.now() - (r.updated || 0) < 864e5) watch(r); }, 4000);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register, { once: true }); else register();

  return { start, pick, missing, needsNow, costText, chain, runs, sync, STEPS, doStep, _: { watched, synced } };
})();
window.Studio = Studio;
