// Two computers (round 35, twocomputers): switching between the Mac and the Windows PC is seamless.
//   · "This computer: Mac (name)" where sync is shown (Settings → Sync, the sync dot's menu, /sync status).
//   · An AI's folders are each computer's own (agent.fileAccess.folders); the other computer's choices travel in a
//     portable form (agent.fileAccess.computers, see twocomputers-core.js). On load, a folder found at the same place
//     here (inside the home folder, a cloud drive or Hearth's data) is used; anything else waits in ⋯ AI setup → Files
//     on this computer as "Pick this folder on this computer" (one click), or "Not on this computer". Never a guess.
//   · Engines, sign-ins and Hearth's Chrome are this computer's own (sync never carries them, sync-merge.js): the
//     welcome note says to check each AI here (Check this AI).
//   · A once-per-computer welcome note after the first sync on a new computer: what needs a click.
//   · Media files (Lab songs, footage) are found again by their place (home / cloud drive relative) or their content;
//     a file that isn't here shows a plain "Find this file" (the Lab's toast, 🩺 Fix my scene).
//   /this-computer [welcome] · Ctrl/⌘+K "This computer: what needs a click here". No tokens, nothing sent to any AI.
const TwoComputers = (() => {
  const T = () => window.TwoCore;
  const api = () => window.hub?.two;
  let me = null; let at = 0; let loading = null;
  async function info(force = false) {
    if (!api() || !T()) return null;
    if (me && !force && Date.now() - at < 60000) return me;
    loading ||= api().info().then((i) => { if (i) { me = i; at = Date.now(); } return me; }).catch(() => me).finally(() => { loading = null; });
    return loading;
  }
  const hereLine = () => (me ? `This computer: ${me.label}` : '');
  // the line as an element that fills itself when the answer comes (Settings → Sync)
  function hereEl() {
    const p = el('p', { class: 'hint two-here', text: hereLine() });
    if (!me) info().then(() => { p.textContent = hereLine(); }).catch(() => {});
    return p;
  }
  const otherOf = (i) => (i?.peers?.length ? i.peers.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0] : null);
  const yourOther = (k) => (k === 'Mac' ? 'your Mac' : `your ${k}`);

  // ---------- an AI's folders ----------
  const pendingCache = new Map(); // agentId → [pending]
  async function pendingOf(fa, i) {
    const comps = fa?.computers || {};
    const cand = [...new Set(Object.entries(comps).filter(([id]) => id !== i.id).flatMap(([, c]) => (c?.folders || []).map((f) => (f.rel ? T().fromPortable(f.rel, i.roots) : null)).filter(Boolean)))];
    const ex = cand.length ? await api().exists(cand).catch(() => []) : [];
    const yes = new Set(cand.filter((_, k) => ex[k]));
    return T().pendingHere(fa, i, i.roots, (p) => yes.has(p));
  }
  const agentsNow = () => (typeof H !== 'undefined' && Array.isArray(H.config?.agents) ? H.config.agents : []);
  function setFa(agentId, fa) { for (const t of new Set([H.agent?.(agentId), agentsNow().find((a) => a.id === agentId)].filter(Boolean))) t.fileAccess = fa; }
  const changed = (agentId) => document.dispatchEvent(new CustomEvent('hearth:file-access', { detail: { agentId } }));
  // each AI: this computer's own folders written down (portable form), the other computer's found here used
  let busy = false; let again = false;
  async function reconcile() {
    if (busy) { again = true; return null; }
    busy = true;
    const used = [];
    try {
      const i = await info();
      if (!i) return null;
      let dirty = false;
      for (const a of agentsNow()) {
        const fa = a.fileAccess;
        if (!fa || typeof fa !== 'object') continue;
        let next = T().recordHere(fa, i, i.roots).fa;
        let pend = [];
        if ((next.level || 'off') !== 'off') {
          pend = await pendingOf(next, i);
          const same = pend.filter((p) => p.how === 'same');
          if (same.length) {
            next = T().recordHere({ ...next, folders: [...new Set([...(next.folders || []), ...same.map((p) => p.here)])].slice(0, 12) }, i, i.roots).fa;
            used.push(...same.map((p) => ({ agent: a.name, name: p.name, here: p.here, from: p.fromKind })));
            pend = pend.filter((p) => p.how !== 'same');
          }
        }
        const before = JSON.stringify(pendingCache.get(a.id) || []);
        pendingCache.set(a.id, pend);
        const mine = JSON.stringify(next) !== JSON.stringify(fa);
        if (mine) { setFa(a.id, next); dirty = true; }
        if (mine || before !== JSON.stringify(pend)) changed(a.id);
      }
      if (dirty && typeof saveConfig === 'function') await saveConfig();
      if (used.length) toast(used.length === 1 ? `${used[0].agent} uses ${used[0].name} here too: the same folder as on ${yourOther(used[0].from)}.` : `${used.length} folders from ${yourOther(used[0].from)} are used here too (the same places on this computer).`, { timeout: 6000 });
      return used;
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(() => reconcile().catch(() => {}), 400); }
    }
  }
  async function pick(agentId, p) {
    const i = await info();
    const folder = await window.hub.pickFolder(p.here || i?.roots?.home, `Where is "${p.name}" on this computer?`);
    if (!folder) return null;
    if (typeof Access !== 'undefined') await Access.addAiFolder(agentId, folder);
    const a = H.agent(agentId);
    setFa(agentId, T().matchHere(a?.fileAccess || {}, i, p.key, folder, i.roots));
    if (typeof saveConfig === 'function') await saveConfig();
    pendingCache.set(agentId, (pendingCache.get(agentId) || []).filter((x) => x.key !== p.key));
    changed(agentId);
    toast(`${a?.name || 'It'} uses ${T().baseName(folder)} on this computer for "${p.name}".`, { timeout: 3500 });
    return folder;
  }
  async function skip(agentId, p) {
    const i = await info();
    setFa(agentId, T().skipHere(H.agent(agentId)?.fileAccess || {}, i, p.key));
    if (typeof saveConfig === 'function') await saveConfig();
    pendingCache.set(agentId, (pendingCache.get(agentId) || []).filter((x) => x.key !== p.key));
    changed(agentId);
  }
  async function useHome(agentId, p) {
    if (typeof Access === 'undefined') return null;
    const r = await Access.addHome(agentId); // the same warning as over there
    if (!r) return null;
    const i = await info();
    setFa(agentId, T().matchHere(H.agent(agentId)?.fileAccess || {}, i, p.key, p.here, i.roots));
    if (typeof saveConfig === 'function') await saveConfig();
    pendingCache.set(agentId, (pendingCache.get(agentId) || []).filter((x) => x.key !== p.key));
    changed(agentId);
    return p.here;
  }
  // ⋯ AI setup → Files on this computer: the other computer's folders this one hasn't got yet (access.js aiSection)
  const asked = new Set();
  function filesRows(agent, repaint) {
    if (!agent?.id) return null;
    if (!pendingCache.has(agent.id) && !asked.has(agent.id)) {
      asked.add(agent.id);
      info().then((i) => (i ? pendingOf(agent.fileAccess || {}, i) : [])).then((p) => { pendingCache.set(agent.id, p.filter((x) => x.how !== 'same')); if (p.length) repaint?.(); if (p.some((x) => x.how === 'same')) reconcile().catch(() => {}); }).catch(() => {}).finally(() => asked.delete(agent.id));
      return null;
    }
    const list = (pendingCache.get(agent.id) || []).slice(0, 8);
    if (!list.length) return null;
    const fail = (err) => toast(err.message, { type: 'error' });
    return el('div', { class: 'two-files' },
      el('p', { class: 'opt-hint two-files-head', text: `Also used on ${yourOther(list[0].fromKind)}, not set up here yet:` }),
      list.map((p) => el('div', { class: 'access-folder two-folder' },
        el('span', { class: 'access-fname', text: `📁 ${p.name || 'a folder'}`, title: `${p.from}: ${p.on || p.name}` }),
        el('span', { class: 'access-fpath', text: p.how === 'ask' ? `the whole ${p.on || 'folder'}` : p.on || '' }),
        p.how === 'ask'
          ? el('button', { type: 'button', class: 'ghost small two-pick', text: 'Use it here too…', title: 'The same warning as on the other computer comes first', on: { click: () => useHome(agent.id, p).then(() => repaint?.()).catch(fail) } })
          : el('button', { type: 'button', class: 'ghost small two-pick', text: 'Pick this folder on this computer', title: `Show where "${p.name}" is on this computer (nothing is used until you pick it)`, on: { click: () => pick(agent.id, p).then(() => repaint?.()).catch(fail) } }),
        el('button', { type: 'button', class: 'ghost small two-skip', text: '✕', title: 'Not on this computer (it stays on the other one)', on: { click: () => skip(agent.id, p).then(() => repaint?.()).catch(fail) } }))));
  }
  async function pendingAll() {
    const i = await info();
    if (!i) return [];
    const out = [];
    for (const a of agentsNow()) if (a.fileAccess && (a.fileAccess.level || 'off') !== 'off') for (const p of await pendingOf(a.fileAccess, i)) if (p.how !== 'same') out.push({ ...p, agentId: a.id, agent: a.name });
    return out;
  }

  // ---------- media found again ----------
  const IDS = 'media-ids'; // synced: [{ path, rel, hash, size, name, at }] (paths mapped by sync for each computer)
  let ids = null; let idsSave = null;
  async function loadIds() { if (!ids) { try { ids = (await window.hub.kvGet(IDS, [])) || []; } catch { ids = []; } } return ids; }
  const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
  async function metaOf(path) {
    const list = await loadIds();
    const n = norm(path);
    const i = await info();
    const rel = i ? T().toPortable(path, i.roots) : null;
    return list.find((x) => norm(x.path) === n) || (rel && list.find((x) => x.rel === rel)) || { path, rel, name: T().baseName(path) };
  }
  // a file that opened fine: its place and content noted (once), so the other computer can find it again
  async function noteFile(path, size) {
    if (!api() || !path || /^scene:/.test(path)) return;
    const list = await loadIds();
    const n = norm(path);
    const had = list.find((x) => norm(x.path) === n);
    if (had && (size == null || had.size === size) && had.hash) return;
    const q = await api().hash(path).catch(() => null);
    if (!q?.hash) return;
    const i = await info();
    const row = { path, rel: i ? T().toPortable(path, i.roots) : null, hash: q.hash, size: q.size, name: T().baseName(path), at: Date.now() };
    const at2 = list.indexOf(had);
    if (at2 >= 0) list.splice(at2, 1, row); else list.push(row);
    if (list.length > 600) list.splice(0, list.length - 600);
    clearTimeout(idsSave); idsSave = setTimeout(() => window.hub.kvSet(IDS, ids).catch?.(() => {}), 800);
  }
  // → this computer's path for a file written on the other one, or null
  async function relink(path) {
    if (!api() || !path) return null;
    const m = await metaOf(path);
    const r = await api().relink({ ...m, path }).catch(() => null);
    return r?.path && r.path !== path ? r.path : null;
  }
  const missing = new Map(); // path → { path, name, retry } (this session; 🩺 Fix my scene lists them)
  const noted = new Set();
  // a file that isn't here: one calm note with "Find this file" (once per file per session)
  function missingNote({ path, retry, where = 'scene' } = {}) {
    if (!path) return;
    const name = T()?.baseName(path) || path;
    missing.set(path, { path, name, retry, where });
    if (noted.has(path)) return;
    noted.add(path);
    toast(`${name} isn't on this computer${me?.peers?.length ? ` (the ${where} came from ${yourOther(T().shortLabel(otherOf(me)))})` : ''}.`, { timeout: 12000, action: { label: 'Find this file', fn: () => findMissing(path).catch((err) => toast(err.message, { type: 'error' })) } });
  }
  // "Find this file": pick it here; remembered on this computer only (the other one keeps its own)
  async function findFile(path) {
    if (!api()) return null;
    const m = await metaOf(path);
    const name = m.name || T().baseName(path);
    const ext = (/\.([a-z0-9]{1,5})$/i.exec(name) || [])[1] || '';
    const picked = await api().pickFile({ title: `Find ${name} on this computer`, name, ext: ext.toLowerCase() });
    if (!picked) return null;
    const r = await api().link({ ...m, path }, picked);
    if (!r?.ok) throw new Error(r?.error || 'Could not use that file.');
    if (r.same === false && typeof Modal !== 'undefined') {
      const yes = await Modal.confirm('This file looks different', `${T().baseName(picked)} isn't the same file as ${name} on the other computer (other content). Use it anyway?`, { ok: 'Use it' });
      if (!yes) return null;
    }
    return picked;
  }
  async function findMissing(path) {
    const picked = await findFile(path);
    if (!picked) return null;
    const m = missing.get(path);
    missing.delete(path);
    try { await m?.retry?.(picked); } catch (err) { toast(err.message, { type: 'error' }); }
    return picked;
  }
  // the plain button, for any place that shows a missing file
  const findButton = (path, onFound) => el('button', { type: 'button', class: 'ghost small two-find', text: 'Find this file', title: 'Show where this file is on this computer', on: { click: () => findFile(path).then((p) => { if (p) onFound?.(p); }).catch((err) => toast(err.message, { type: 'error' })) } });
  const missingList = () => [...missing.values()].map(({ path, name, where }) => ({ path, name, where }));

  // ---------- the welcome note on a new computer ----------
  let note = null;
  async function welcome({ force = false } = {}) {
    const i = await info(true);
    if (!i) return null;
    if (!force && (!i.peers.length || store.get('two.welcomed', 0))) return null;
    store.set('two.welcomed', Date.now());
    await reconcile().catch(() => null);
    const pend = await pendingAll().catch(() => []);
    const natives = (typeof H !== 'undefined' ? H.agents?.() || agentsNow() : []).filter((a) => a.mode === 'native');
    const list = T().welcomeList({ pending: pend, agents: natives, media: missing.size });
    note?.remove();
    const other = otherOf(i);
    const close = () => { note?.remove(); note = null; };
    const act = (label, fn) => el('button', { type: 'button', class: 'ghost small', text: label, on: { click: () => { Promise.resolve(fn()).catch((err) => toast(err.message, { type: 'error' })); } } });
    const rows = list.map((r) => el('div', { class: `two-row two-${r.kind}` }, el('span', { text: r.text }),
      r.kind === 'folders' ? act('Pick folders…', () => openSetup(pend[0]?.agentId)) : null,
      r.kind === 'check' ? el('span', { class: 'two-acts' }, natives.slice(0, 3).map((a) => act(`Check ${a.name}`, () => checkAi(a.id)))) : null));
    note = el('div', { class: 'two-welcome', attrs: { role: 'dialog', 'aria-label': 'Welcome to this computer' } },
      el('b', { text: 'Welcome to this computer' }),
      el('p', { class: 'two-sub', text: `${hereLine()}${other ? ` · in sync with ${other.label}` : ''}. Chats, scenes, boards and settings came along; each computer keeps its own folders, engines and sign-ins.` }),
      rows.length ? rows : el('p', { class: 'two-sub', text: 'Nothing needs a click here.' }),
      el('div', { class: 'two-foot' }, act('Got it', close)));
    document.body.append(note);
    return list;
  }
  const openSetup = (agentId) => Promise.resolve(window.Lazy?.load?.('options')).then(() => { if (typeof Options !== 'undefined') Options.open({ agentId }); });
  const checkAi = (agentId) => Promise.resolve(window.Lazy?.load?.('options')).then(() => (typeof AiCheck !== 'undefined' ? AiCheck.openAndRun(agentId) : openSetup(agentId)));

  // ---------- ways in ----------
  async function summary() {
    const i = await info(true);
    if (!i) return 'This computer is unknown (no main side).';
    const pend = await pendingAll().catch(() => []);
    const other = otherOf(i);
    const lines = [`**${hereLine()}**${other ? ` · in sync with ${other.label}` : i.sync.on ? '' : ' · sync is off'}`];
    for (const p of pend.slice(0, 8)) lines.push(`- ${p.agent}: "${p.name}" (${p.on}) on ${yourOther(p.fromKind)}: pick it in ⋯ AI setup → Files on this computer`);
    for (const m of missingList().slice(0, 5)) lines.push(`- ${m.name} isn't on this computer: Find this file`);
    if (lines.length === 1) lines.push('Nothing needs a click here. Engines and sign-ins are this computer\'s own: Check this AI in ⋯ AI setup shows them.');
    return lines.join('\n');
  }
  function menuItem() {
    if (!me) return null;
    const n = [...pendingCache.values()].reduce((s, l) => s + l.length, 0) + missing.size;
    return n ? { label: 'What needs a click on this computer…', hint: String(n), action: () => welcome({ force: true }) } : null;
  }
  function register() {
    if (typeof Commands !== 'undefined' && !Commands.get?.('this-computer')) {
      Commands.register({
        name: 'this-computer', aliases: ['computers'], area: 'Sync', args: '[welcome]',
        desc: 'Which computer this is (Mac / Windows PC) and what needs a click here: folders your AIs use on the other computer, files not here yet; welcome: the note again',
        keywords: 'mac pc windows other computer switch machine folders paths engines sign in missing file find',
        complete: () => [{ value: 'welcome', label: 'the welcome note again' }],
        run: async (args, ctx) => {
          if (/^welcome/i.test(String(args || '').trim())) { await welcome({ force: true }); return null; }
          const t = await summary();
          if (ctx?.say) { ctx.say(t); return null; }
          return t;
        },
      });
    }
    AppUI.addAction?.('This computer: what needs a click here', () => welcome({ force: true }));
  }
  async function init() {
    if (!api() || !T()) return;
    register();
    // (after the start settles: the main side loads on first use, never before the first frame)
    await new Promise((r) => setTimeout(r, 2500));
    await info();
    reconcile().catch(() => {});
    window.hub.onConfigChanged?.(() => setTimeout(() => reconcile().catch(() => {}), 600));
    // after the first sync on a new computer (another computer is known): the welcome note, once
    const onSt = (s) => { if (s?.on && s.lastOk && (s.peers || []).length && !store.get('two.welcomed', 0)) welcome().catch(() => {}); };
    window.hub.sync?.onStatus?.(onSt);
    window.hub.sync?.status?.().then(onSt).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);

  return { info, hereLine, hereEl, reconcile, filesRows, pick, skip, pendingAll, relink, noteFile, missingNote, findFile, findMissing, findButton, missingList, welcome, summary, menuItem, get me() { return me; } };
})();
window.TwoComputers = TwoComputers; // (other streams' files call it guarded: window.TwoComputers?.…)
