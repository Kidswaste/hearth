// Meshy (round 14, apps stream): AI 3D models, two ways. Its web app in its own window (sign in there; downloads go to
// the Lab / board), and its API driven from chat: /meshy <what to make>, /meshy image (a board picture, a file),
// /meshy texture, /meshy remesh, and the meshy_generate tool for Claude / Astra (opt-in: /apps-tools on).
// Every generation costs Meshy credits: Hearth shows the estimate (and the balance) and asks first, every time
// (Access.ask when the access stream has it, else a confirm). The API key is pasted once (/meshy key), encrypted on
// this computer (safeStorage, in appsmain.js) and never reaches a page, a log or an engine.
// A job runs in the main process (it survives a reload), shows a progress bar (Progress, and its make's when it
// belongs to one), and the GLB lands in the library (kv 'meshy-library', files in data/apps/meshy), then in the Lab
// as a model layer (made from the Lab or its director) or on the board. Meshy's API shape: apps-meshy-api.js only.
const AppsMeshy = (() => {
  const A = MeshyAPI;
  const api = () => window.hub?.apps || null;
  const KV = 'meshy-library';
  let lib = null; // [{ id, name, prompt, op, glb, thumb, task: { step, id }, credits, at }]
  const delivered = new Set();
  async function library() { lib ||= await window.hub.kvGet(KV, []); return lib; }
  const saveLib = () => window.hub.kvSet(KV, (lib || []).slice(0, 300));

  // ---------- the key ----------
  async function keyInfo() { return (await api()?.key('meshy', 'has')) || { has: false }; }
  function keyDialog() {
    return new Promise((resolve) => {
      const input = el('input', { type: 'password', placeholder: 'msy_…', autocomplete: 'off', spellcheck: false });
      const dlg = el('dialog', { class: 'ui-modal apps-key' },
        el('form', { method: 'dialog' },
          el('h2', { text: '🧊 Your Meshy API key' }),
          el('p', { class: 'modal-text', text: 'Meshy → Settings → API → copy your key and paste it here, once. It is encrypted on this computer (your system keychain), used only to talk to Meshy, and never shown to a chat, a log or the other computer.' }),
          el('label', { text: 'API key' }, input),
          el('p', { class: 'hint', text: 'Only trying it? "Use Meshy\'s test key" runs the whole flow with sample models and spends nothing.' }),
          el('div', { class: 'dialog-actions' },
            el('button', { type: 'button', class: 'ghost', text: 'Use Meshy\'s test key', on: { click: () => { input.value = A.TEST_KEY; } } }),
            el('span', { class: 'spacer' }),
            el('button', { type: 'button', text: 'Cancel', on: { click: () => dlg.close() } }),
            el('button', { type: 'submit', class: 'primary', text: 'Save' }))));
      let value = null;
      dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); value = input.value.trim(); dlg.close(); });
      dlg.addEventListener('close', async () => {
        dlg.remove();
        if (!value) { resolve(null); return; }
        const r = await api().key('meshy', 'set', value);
        value = null;
        if (!r?.ok) { toast(r?.error || 'Not saved', { type: 'error', timeout: 6000 }); resolve(null); return; }
        toast(r.stored === 'keychain' ? 'Meshy key saved (encrypted on this computer)' : 'Meshy key kept until Hearth quits (this computer has no keychain to encrypt it)', { timeout: 4000 });
        resolve(r);
      });
      document.body.append(dlg);
      dlg.showModal();
      input.focus();
    });
  }

  // ---------- inputs ----------
  async function boardImage() {
    if (typeof Board === 'undefined') throw new Error('The board isn\'t available');
    await Board.ready();
    const pics = (list) => list.filter((i) => (i.type === 'image' || i.type === 'gif') && i.src);
    const sel = pics(Board.selected?.() || []);
    const it = sel[0] || pics(Board.items()).sort((a, b) => (b.added || 0) - (a.added || 0))[0];
    if (!it) throw new Error('No picture on the board: add one (or select it) first.');
    return { path: it.src, name: it.title || 'board picture' };
  }
  // PNG / JPEG go as they are (main shrinks them); anything else (WebP, GIF, AVIF…) becomes a PNG first
  async function pngOf(p) {
    if (/^(https?:|data:)/i.test(p) || /\.(png|jpe?g)$/i.test(p)) return p;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture couldn\'t be read')); i.src = Apps.fileUrl(p); });
    const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = el('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  async function modelRef(ref) {
    const L = await library();
    const s = String(ref || 'last').trim().toLowerCase().replace(/^#/, '');
    if (!L.length) throw new Error('No Meshy model yet: /meshy <what to make>');
    if (s === 'last' || s === '') return L[0];
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= L.length) return L[n - 1];
    return L.find((m) => m.id === s || m.name.toLowerCase().includes(s)) || null;
  }

  // ---------- one generation: estimate, ask, start ----------
  // op: text (opts.prompt, draft) · image (opts.image) · retexture (opts.ref, opts.stylePrompt) · remesh (opts.ref, polycount)
  async function run(op, opts = {}, ctx = {}) {
    if (!api()) throw new Error('Meshy needs Hearth\'s desktop app');
    if (!(await keyInfo()).has) {
      if (ctx.source === 'agent') return { ok: false, error: 'No Meshy API key yet: ask the owner to run /meshy key once.' };
      const r = await keyDialog();
      if (!r) return { ok: false, error: 'No key: nothing started.' };
    }
    const o = { ...opts };
    let name = o.name || o.prompt || o.stylePrompt || op;
    if (op === 'image') {
      if (!o.image || o.image === 'board') { const b = await boardImage(); o.image = b.path; name = o.name || b.name; }
      o.image = await pngOf(String(o.image));
    }
    if (op === 'retexture' || op === 'remesh') {
      const m = await modelRef(o.ref);
      if (!m) throw new Error(`No model "${o.ref}" in your Meshy library (/meshy models).`);
      if (m.task?.id) o.taskId = m.task.id; else o.model = m.glb;
      name = `${m.name} · ${op === 'remesh' ? 'remeshed' : o.stylePrompt || 'retextured'}`;
    }
    delete o.ref; delete o.name;
    const est = A.estimate(op, o);
    const bal = await api().meshy('balance').catch(() => null);
    const what = op === 'text' ? `“${String(o.prompt).slice(0, 120)}”${o.draft ? ' (shape only, untextured)' : ''}` : op === 'image' ? 'a 3D model from a picture' : op === 'retexture' ? `a new texture: “${o.stylePrompt}”` : 'a cleaner mesh';
    const detail = `Meshy makes ${what}.\n\n${est.lines.join('\n')}\nAbout ${est.credits} credits in all${bal?.ok && Number.isFinite(bal.value) ? ` (you have ${bal.value})` : ''}.${ctx.source === 'agent' ? `\n\n${H.agent?.(ctx.agentId)?.name || 'A chat'} asks for it.` : ''}`;
    const yes = await Apps.ask({ agentId: ctx.agentId || null, action: 'meshy-generate', target: String(name).slice(0, 80), risk: 'high', detail, title: 'Spend Meshy credits?', ok: `Make it (~${est.credits} credits)` });
    if (!yes) return { ok: false, declined: true, error: 'Not started: nothing was spent.' };
    const r = await api().meshy('start', { op, opts: o, name: String(name).slice(0, 60), chatId: ctx.chatId || null, to: ctx.to || null, source: ctx.agentId || null });
    if (!r?.ok) throw new Error(r?.error || 'Meshy didn\'t start');
    track(r.job);
    return { ok: true, job: r.job, credits: est.credits };
  }

  // ---------- progress and arrival ----------
  const titleOf = (j) => `🧊 Meshy · ${j.name}`;
  function track(j) {
    if (typeof Progress === 'undefined') return;
    const key = `meshy:${j.id}`;
    if (j.status === 'running') Progress.set(key, { title: titleOf(j), pct: j.pct || 0, label: j.label || 'working', kind: `meshy:${j.op}`, icon: '🧊', jump: () => libraryDialog(), hungMs: 10 * 60000 });
    else if (j.status === 'done') Progress.done(key, { label: 'ready' });
    else if (Progress.get(key)) Progress.done(key, { ok: false, label: j.error || j.status });
  }
  async function arrive(j) {
    if (j.status !== 'done' || j.acked || delivered.has(j.id) || !j.files?.glb) return;
    delivered.add(j.id);
    const L = await library();
    if (!L.some((m) => m.id === j.id)) {
      const last = j.steps[j.steps.length - 1];
      L.unshift({ id: j.id, name: j.name, prompt: j.prompt, op: j.op, glb: j.files.glb, thumb: j.files.thumb || null, task: { step: last, id: j.tasks?.[last] || null }, credits: j.credits, at: Date.now() });
      saveLib();
    }
    api().meshy('ack', { id: j.id });
    // a make this chat belongs to keeps the model as one of its outputs
    try { const mk = j.chatId && typeof Makes !== 'undefined' ? Makes.ofChat(j.chatId) : null; if (mk) Makes.addOutput(mk, j.files.glb, null, 'model'); } catch { /* makes are a bonus */ }
    let where = '';
    try {
      if (j.to === 'lab') { await AppsLab.addModel(j.files.glb, { name: j.name }); where = ' It is a layer in the Lab now.'; } else if (j.to === 'board') { await toBoard(L.find((m) => m.id === j.id)); where = ' It is on the board.'; }
    } catch (err) { where = ` (${err.message})`; }
    const m = L.find((x) => x.id === j.id);
    const actions = [{ label: '◭ Lab', run: () => toLab(m) }, { label: '▦ Board', run: () => toBoard(m) }, { label: 'Models…', run: () => libraryDialog() }];
    const ag = j.source && H.agent?.(j.source) ? j.source : (j.chatId ? H.agents().find((a) => H.activeChat?.[a.id] === j.chatId)?.id : null);
    if (ag && typeof Native !== 'undefined') Native.note(ag, `🧊 **${j.name}** is ready (Meshy, ~${j.credits} credits).${where}`, { actions: actions.map((a) => ({ label: a.label, run: () => a.run().catch?.((err) => toast(err.message, { type: 'error' })) })) });
    else toast(`🧊 ${j.name} is ready.${where}`, { timeout: 9000, action: j.to === 'lab' ? null : { label: 'Load into the Lab', fn: () => toLab(m) } });
    Apps.emit('meshy-ready', { job: j, model: m });
  }
  function onJob(j) {
    track(j);
    if (j.status === 'done') arrive(j);
    else if (j.status === 'failed' && !delivered.has(j.id)) { delivered.add(j.id); toast(`🧊 Meshy: ${j.name} failed: ${j.error}`, { type: 'error', timeout: 9000 }); }
  }
  Apps.on('meshy', onJob);
  // a model downloaded from Meshy's own website joins the library too (no credits counted: Meshy's site spent them)
  Apps.on('download', async (d) => {
    if (d.app !== 'meshy' || d.state !== 'completed' || !/\.(glb|gltf)$/i.test(d.name)) return;
    const L = await library();
    if (L.some((m) => m.glb === d.path)) return;
    L.unshift({ id: `w${d.id}`, name: d.name.replace(/\.[^.]+$/, ''), prompt: '', op: 'web', glb: d.path, thumb: null, task: null, credits: 0, at: Date.now() });
    saveLib();
  });
  async function boot() {
    const r = await api()?.meshy('jobs').catch(() => null);
    for (const j of r?.value || []) { if (j.status === 'running') track(j); else if (j.status === 'done' && !j.acked) arrive(j); }
  }

  // ---------- the library ----------
  async function toLab(m) { if (!m) throw new Error('No such model'); return AppsLab.addModel(m.glb, { name: m.name }); }
  async function toBoard(m) {
    if (!m) throw new Error('No such model');
    if (typeof Board === 'undefined') throw new Error('The board isn\'t available');
    const [it] = await Board.addFiles([m.thumb || m.glb]);
    if (it) Board.patch([it.id], { title: `🧊 ${m.name}`, model: m.glb, note: m.prompt ? `Meshy: ${m.prompt}` : 'Meshy model' }, 'add a Meshy model');
    activate('tool:board');
    return it || null;
  }
  async function libraryDialog() {
    const L = await library();
    return Apps.grid({
      title: '🧊 Your Meshy models',
      empty: 'No model yet: /meshy <what to make> (or "From a board picture" above).',
      head: el('div', { class: 'apps-grid-tools' },
        el('button', { class: 'ghost small', text: '＋ New from words…', on: { click: async () => { document.querySelector('dialog.apps-grid')?.close(); const p = await Modal.prompt('Make a 3D model', { label: 'What should Meshy make?', placeholder: 'a chrome dragon skull, game-ready' }); if (p) run('text', { prompt: p }, { to: 'lab', source: 'owner' }).catch((err) => toast(err.message, { type: 'error' })); } } }),
        el('button', { class: 'ghost small', text: '▦ From a board picture', on: { click: () => { document.querySelector('dialog.apps-grid')?.close(); run('image', { image: 'board' }, { to: 'lab' }).catch((err) => toast(err.message, { type: 'error' })); } } }),
        el('button', { class: 'ghost small', text: '◌ Meshy\'s website', on: { click: () => { document.querySelector('dialog.apps-grid')?.close(); Apps.open('meshy'); } } })),
      items: L.map((m, i) => ({
        title: m.name, sub: `#${i + 1} · ${m.op === 'image' ? 'from a picture' : m.op}${m.credits ? ` · ~${m.credits} cr` : ''} · ${timeAgo(m.at)}`, thumb: m.thumb, icon: '🧊', tip: m.prompt,
        actions: [
          { label: '◭ Lab', primary: true, run: () => toLab(m) }, { label: '▦ Board', run: () => toBoard(m) },
          { label: 'Texture…', run: async () => { const s = await Modal.prompt('A new texture', { label: 'Describe it', placeholder: 'rusted bronze, gold inlays' }); if (s) await run('retexture', { ref: m.id, stylePrompt: s }, { to: 'lab' }); } },
          { label: 'Show', run: () => window.hub.fs.reveal(m.glb) },
        ],
      })),
    });
  }

  // ---------- chat command ----------
  const sayJob = (r) => (r.ok ? `🧊 Meshy started **${r.job.name}** (~${r.credits} credits): a bar shows its progress; the model lands in your library${r.job.to === 'lab' ? ' and the Lab' : r.job.to === 'board' ? ' and on the board' : ''}.` : r.error);
  const placeTo = (ctx) => (ctx.place === 'three' || H.agent?.(ctx.agentId)?.dock === 'three' ? 'lab' : ctx.place === 'board' ? 'board' : null);
  const SUBS = ['draft', 'image', 'texture', 'remesh', 'models', 'lab', 'board', 'balance', 'cost', 'key', 'status', 'resume', 'stop', 'open'];
  function commands() {
    if (typeof Commands === 'undefined' || Commands.get('meshy')) return;
    Commands.register({
      name: 'meshy', area: 'Apps', args: '<what to make> | draft … | image [board|file] | texture <n> <style> | remesh <n> | models | balance | key | open',
      desc: 'Meshy 3D models from words or a picture, straight into the Lab or onto the board (shows the credit cost and asks first)',
      keywords: '3d model glb text to 3d image to 3d texture remesh credits ai mesh',
      examples: ['/meshy a chrome dragon skull', '/meshy draft low-poly fox', '/meshy image board', '/meshy texture last rusted bronze', '/meshy models'],
      complete: (a) => SUBS.filter((s) => s.startsWith(String(a || '').toLowerCase())).map((v) => ({ value: v })),
      run: async (args, ctx) => {
        const line = String(args || '').trim();
        const [w0 = '', ...rest] = line.split(/\s+/);
        const sub = w0.toLowerCase();
        const tail = rest.join(' ').trim();
        const to = placeTo(ctx);
        const base = { agentId: ctx.agentId, chatId: ctx.chatId || H.activeChat?.[ctx.agentId] || null, to, source: ctx.agentId };
        if (!line) {
          const r = innerWidth / 2 - 150;
          showMenu(Math.max(8, r), 90, [
            { label: '＋ Make a model from words…', action: async () => { const p = await Modal.prompt('Make a 3D model', { label: 'What should Meshy make?' }); if (p) ctx.say(sayJob(await run('text', { prompt: p }, base).catch((err) => ({ error: err.message })))); } },
            { label: '▦ From a board picture', action: async () => ctx.say(sayJob(await run('image', { image: 'board' }, base).catch((err) => ({ error: err.message })))) },
            { label: '📄 From a picture file…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }); if (p) ctx.say(sayJob(await run('image', { image: p }, base).catch((err) => ({ error: err.message })))); } },
            { label: '🧊 Your models…', action: () => libraryDialog() },
            { label: '◌ Meshy\'s website (its own window)', action: () => Apps.open('meshy') },
            { label: 'More', items: () => [{ label: 'Credits left', action: async () => ctx.say(await balanceText()) }, { label: 'API key…', action: () => keyDialog() }, { label: 'Forget the API key', action: async () => { await api().key('meshy', 'forget'); toast('Meshy key forgotten'); } }] },
          ]);
          return null;
        }
        if (sub === 'open' || sub === 'web') { await Apps.open('meshy'); return null; }
        if (sub === 'models' || sub === 'library') { await libraryDialog(); return null; }
        if (sub === 'balance' || sub === 'credits') return balanceText();
        if (sub === 'key') {
          if (/^(forget|remove|off)$/i.test(tail)) { await api().key('meshy', 'forget'); return 'Meshy key forgotten on this computer.'; }
          if (/^test$/i.test(tail)) { const r = await api().key('meshy', 'set', A.TEST_KEY); return r?.ok ? 'Using Meshy\'s test key: generations return sample models and spend nothing. /meshy key to paste your real one.' : r?.error; }
          const r = await keyDialog();
          return r ? null : 'No key saved.';
        }
        if (sub === 'status') return statusText();
        if (sub === 'resume') { const r = await api().meshy('resume', {}); return r?.ok ? `Picking up ${r.job.name} where it was.` : r?.error; }
        if (sub === 'stop') { const r = (await api().meshy('jobs', { resume: false }))?.value?.find((j) => j.status === 'running'); if (!r) return 'Nothing running.'; await api().meshy('stop', { id: r.id }); return `Stopped watching ${r.name} (Meshy may still finish it: /meshy resume).`; }
        if (sub === 'cost') { const op = /^(image|texture|retexture|remesh)$/i.test(rest[0] || '') ? rest[0].toLowerCase().replace(/^texture$/, 'retexture') : 'text'; const e = A.estimate(op, { draft: /draft/i.test(tail) }); return `${e.lines.join(' · ')} → about **${e.credits} credits**.`; }
        if (sub === 'lab' || sub === 'board') { const m = await modelRef(tail || 'last'); if (!m) return `No model "${tail}".`; await (sub === 'lab' ? toLab(m) : toBoard(m)); return null; }
        let r;
        if (sub === 'draft') r = await run('text', { prompt: tail, draft: true }, base);
        else if (sub === 'image') r = await run('image', { image: !tail || /^board$/i.test(tail) ? 'board' : tail.replace(/^["']|["']$/g, '') }, base);
        else if (sub === 'texture' || sub === 'retexture') { const [ref, ...st] = rest; r = await run('retexture', { ref, stylePrompt: st.join(' ') }, base); }
        else if (sub === 'remesh') { const [ref, poly] = rest; r = await run('remesh', { ref, polycount: Number(poly) || undefined }, base); }
        else r = await run('text', { prompt: line }, base);
        return sayJob(r);
      },
    });
  }
  async function balanceText() {
    if (!(await keyInfo()).has) return 'No Meshy key yet: /meshy key';
    const b = await api().meshy('balance');
    return b?.ok ? `Meshy credits left: **${b.value}**${(await keyInfo()).test ? ' (test key)' : ''}.` : b?.error;
  }
  async function statusText() {
    const k = await keyInfo();
    const jobs = (await api().meshy('jobs', { resume: false }))?.value || [];
    const L = await library();
    const run1 = jobs.filter((j) => j.status === 'running');
    return [`Key: ${k.has ? `${k.test ? 'Meshy\'s test key' : 'saved'}${k.stored === 'session' ? ' (until Hearth quits)' : ''}` : 'none (/meshy key)'}`,
      run1.length ? `Running: ${run1.map((j) => `${j.name} ${j.pct} % (${j.label})`).join(' · ')}` : 'Nothing running.',
      `${L.length} model${L.length === 1 ? '' : 's'} in your library (/meshy models).`,
      ...jobs.filter((j) => j.status === 'failed').slice(0, 2).map((j) => `Failed: ${j.name}: ${j.error}`)].join('\n');
  }

  // ---------- the agents' tools (meshy_generate, meshy_status) ----------
  async function tool(name, a = {}, ctx = {}) {
    const base = { agentId: ctx.agentId || null, chatId: ctx.chatId || null, source: 'agent', to: ['lab', 'board'].includes(a.to) ? a.to : null };
    if (name === 'meshy_status') {
      const L = await library();
      return { ok: true, value: `${await statusText()}\n${L.slice(0, 12).map((m, i) => `#${i + 1} ${m.name} (${m.op})`).join('\n')}` };
    }
    if (name === 'meshy_generate') {
      const op = a.op || (a.image ? 'image' : a.model && a.texture ? 'retexture' : a.model && a.polycount ? 'remesh' : 'text');
      const opts = op === 'text' ? { prompt: a.prompt, draft: a.draft === true, art: a.art } : op === 'image' ? { image: a.image || 'board' } : op === 'retexture' ? { ref: a.model || 'last', stylePrompt: a.texture || a.prompt } : { ref: a.model || 'last', polycount: a.polycount };
      try {
        const r = await run(op, { ...opts, name: a.name }, { ...base, agentId: ctx.agentId || base.agentId });
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, value: `Started “${r.job.name}” (~${r.credits} credits, the owner said yes). It takes a few minutes; it lands in the owner's Meshy library${base.to ? ` and the ${base.to}` : ''}. meshy_status follows it.` };
      } catch (err) { return { ok: false, error: err.message }; }
    }
    return { ok: false, error: `Unknown tool ${name}` };
  }

  Apps.register({
    id: 'meshy', name: 'Meshy', icon: '🧊', group: '3D', url: 'https://www.meshy.ai/workspace', hosts: ['meshy.ai'],
    desc: '3D models from words or pictures (its web app, or /meshy straight into the Lab)', keywords: 'ai 3d model glb',
    routes: { model: 'lab-model', image: 'meshy' },
    actions: [
      { id: 'models', label: '🧊 Your Meshy models (library)', run: () => libraryDialog() },
      { id: 'balance', label: 'Credits left', run: async () => { const t = await balanceText(); toast(t.replace(/\*\*/g, ''), { timeout: 5000 }); return t; } },
    ],
  });
  addEventListener('DOMContentLoaded', () => { commands(); setTimeout(boot, 1500); });
  return { run, tool, library: libraryDialog, models: library, toLab, toBoard, keyDialog, boardImage, statusText, balanceText, _: { modelRef, pngOf } };
})();
window.AppsMeshy = AppsMeshy;
