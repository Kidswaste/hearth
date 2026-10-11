// Round 15 (tour): "feel free to make me discover things". Hearth has ≈ 10,000 upgrades you haven't seen; this
// shows them a few at a time, picked for how you work, and never in the way:
// - What's new: after an ⬆ Update, one small card with the 5 changes that fit your habits best, built from the
//   docs/upgrades files that update changed (only their new numbered lines). Each has ▶ Show me (rings the control,
//   runs a safe command or puts it in the chat box, or starts its guided tour) and × Not for me (that area sinks).
//   /whats-new any time; /whats-new round 14; /whats-new history.
// - Daily tip: at most one "Did you know?" a day, for something you have never used, where you are (Try it · Later ·
//   Stop tips). Never when Hearth opens, never over another card, never during a tour.
// - Feature map (☰ Commands › Discover, /feature-map): every area with what you used and what you never tried, and
//   ✦ Surprise me (/surprise-me) that picks something fun you never tried.
// - Ideas for tonight (/ideas): things to make from your boards, songs, scenes and apps; one click starts it.
// All local and token-free: the docs are read from the app folder, your habits from usage / speed data; nothing is
// sent to an engine and nothing is added to any prompt. Data: data/kv/discover.json (+ a few store keys).
const Discover = (() => {
  const D = DiscoverData;
  const KV = 'discover';
  const DAY = 864e5;
  const T0 = Date.now();
  // { base: { file: highest number seen }, updates: [{ to, from, at, items: [ids], files }], hide: [ids], cold: { key: n }, surprised: [cmds] }
  let data = { base: {}, updates: [], hide: [], cold: {}, surprised: [] };
  let loaded = false;
  const ready = window.hub.kvGet(KV, null).then((d) => { if (d && typeof d === 'object') data = { ...data, ...d }; }).catch(() => {}).finally(() => { loaded = true; });
  const save = debounce(() => { if (loaded) window.hub.kvSet(KV, data); }, 800);
  const today = () => new Date().toLocaleDateString('en-CA');
  const short = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const C = () => (typeof Commands !== 'undefined' ? Commands : null);

  // ---------- the docs ----------
  const docs = new Map(); // file → parsed
  let index = null;
  async function readText(path) { const r = await fetch(path, { cache: 'no-store' }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.text(); }
  async function loadIndex(force = false) {
    if (index && !force) return index;
    try { index = D.parseIndex(await readText('docs/upgrades/README.md')); } catch { index = []; }
    return index;
  }
  async function loadDoc(file, force = false) {
    const f = String(file).replace(/^docs\/upgrades\//, '');
    if (docs.has(f) && !force) return docs.get(f);
    let doc;
    try { doc = D.parseDoc(await readText(`docs/upgrades/${f}`), f); } catch { doc = { file: f, title: '', items: [] }; }
    docs.set(f, doc);
    return doc;
  }
  const nameOf = (file) => index?.find((r) => r.file === file)?.name || docs.get(file)?.title?.split(/[(:]/)[0].trim() || file.replace(/\.md$/, '');
  const roundOf = (file) => index?.find((r) => r.file === file)?.round || null;
  const findItem = (id) => { const [f, n] = String(id).split('#'); return docs.get(f)?.items.find((x) => x.n === Number(n)) || null; };

  // ---------- your habits → what matters ----------
  function profile() {
    const p = { ...D.PROFILE };
    const add = (w, k) => { if (w && w.length > 2 && !/^\d+$/.test(w)) p[w] = Math.min(3, (p[w] || 0) + k); };
    try {
      const items = Object.entries(Usage.data?.items || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 40);
      for (const [key, v] of items) for (const w of D.wordsOf(key.split(' › ').pop())) add(w, Math.min(1.2, Math.log2(1 + v.n) / 4));
    } catch { /* no usage yet */ }
    try { for (const [name, n] of Object.entries(C()?.counts?.() || {}).sort((a, b) => b[1] - a[1]).slice(0, 25)) { add(`/${name}`, Math.min(1.5, Math.log2(1 + n) / 3)); for (const w of name.split('-')) add(w, 0.4); } } catch { /* none */ }
    return p;
  }
  // a command counts as tried when it ran, it was clicked through speed, or the usage log has it
  function usedCmd(name) {
    const n = String(name || '').replace(/^\//, '').toLowerCase();
    try { if ((C()?.counts?.() || {})[n]) return true; } catch { /* none */ }
    try { if (C()?.recent?.().includes(n)) return true; } catch { /* none */ }
    try { if (Speed.stat?.(Speed.cmdKey(n))?.n) return true; } catch { /* none */ }
    try { if (Usage.data?.items?.[`Chat command › /${n}`]?.n) return true; } catch { /* none */ }
    return false;
  }
  const exists = (line) => { const m = String(line || '').match(/^\/([\w-]+)/); return Boolean(m && C()?.get(m[1])); };
  const placeNow = () => { try { const p = C().place().id; return p === 'chat' ? 'chat' : p; } catch { return 'chat'; } };

  // ---------- What's new ----------
  // before an update: the highest number each doc has now (updater.js calls it; ≤ a second, all local files)
  async function beforeUpdate() {
    await ready;
    const rows = await loadIndex(true);
    await Promise.all(rows.map(async (r) => { const d = await loadDoc(r.file, true); if (d.items.length) data.base[r.file] = Math.max(...d.items.map((x) => x.n)); }));
    data.baseAt = Date.now();
    window.hub.kvSet(KV, data);
  }
  // after it: the new lines of the docs it changed (all docs that grew, when the update didn't say)
  let handling = 0;
  async function fromUpdate(j) {
    await ready;
    if (!j || handling === j.at || data.updates.some((u) => u.at === j.at && u.to === j.to)) return null;
    handling = j.at;
    const rows = await loadIndex(true);
    const listed = (j.files || []).filter((f) => /^docs\/upgrades\/[\w.-]+\.md$/.test(f) && !/README\.md$/.test(f)).map((f) => f.replace(/^docs\/upgrades\//, ''));
    const files = listed.length ? listed : rows.map((r) => r.file);
    const items = [];
    for (const f of files) {
      const d = await loadDoc(f, true);
      const before = data.base[f];
      if (!listed.length && before == null) continue; // no record and no list: can't tell what's new there
      items.push(...D.newSince(d, before));
      if (d.items.length) data.base[f] = Math.max(...d.items.map((x) => x.n));
    }
    const rec = { to: j.to || '', from: j.from || '', at: j.at || Date.now(), files, items: items.map((x) => x.id), n: items.length };
    data.updates = [rec, ...data.updates].slice(0, 30);
    save();
    if (items.length) setTimeout(() => card(rec), 3500);
    return rec;
  }
  function picked(items, n = 6) { return D.pick(items, { n, profile: profile(), hide: new Set(data.hide), cold: data.cold }); }
  async function itemsOf(rec) { for (const f of rec.files || []) await loadDoc(f); return (rec.items || []).map(findItem).filter(Boolean); }
  // the newest round's docs, when no update has been seen yet
  async function roundItems(round) {
    const rows = await loadIndex();
    const r = round ?? Math.max(0, ...rows.map((x) => x.round));
    const files = rows.filter((x) => x.round === r).map((x) => x.file);
    const out = [];
    for (const f of files) out.push(...(await loadDoc(f)).items);
    return { round: r, files, items: out };
  }
  async function current() {
    const rec = data.updates[0];
    if (rec && Date.now() - rec.at < 21 * DAY && rec.n) return { label: `this update (${rec.from || '…'} → ${rec.to || 'now'})`, items: await itemsOf(rec) };
    const r = await roundItems();
    return { label: `round ${r.round}`, items: r.items };
  }

  // ▶ Show me: ring the control if it is on screen, else run its command (safe ones) / put it in the chat box, else its tour
  const TOUR_OF = { 'renders.md': 'renders', 'eyes.md': 'eyes', 'apps.md': 'apps', 'access.md': 'access', 'sequence.md': 'sequence', 'seq2.md': 'sequence', 'seqguard.md': 'sequence', 'speed.md': 'keys', 'keys.md': 'keys', 'declutter.md': 'keys', 'tour.md': 'discover', 'studio.md': 'studio', 'cmdbar.md': 'studio' };
  function controlFor(it) {
    const words = [it.bold, ...(it.bold.match(/[“"]([^”"]+)[”"]/g) || []).map((x) => x.slice(1, -1))].map((w) => w.replace(/[:.…]+$/, '').trim()).filter((w) => w.length > 2 && w.length < 40);
    if (!words.length) return null;
    const lc = words.map((w) => w.toLowerCase());
    for (const b of document.querySelectorAll('button, [role=button], .tool-btn, .agent-btn')) {
      if (b.closest('.tour-card, .dc-card, .msg, #toasts, .cp-right')) continue;
      const t = `${b.dataset.feature || ''} ${b.getAttribute('aria-label') || ''} ${b.title || ''} ${b.textContent || ''}`.toLowerCase();
      if (lc.some((w) => t.includes(w)) && b.getBoundingClientRect().width > 2) return b;
    }
    return null;
  }
  async function showMe(id) {
    const it = typeof id === 'object' ? id : findItem(id);
    if (!it) return 'That item is gone.';
    const ctl = controlFor(it);
    if (ctl && Tour.pulse(ctl, { label: 'here' })) return `Here: ${it.bold || short(it.plain, 40)}`;
    // a command the line is about (named in its headline) first; one only given as an example comes after its keys
    const lines = it.cmds.map((c) => c.replace(/\s*[[<].*$/, '').trim()).filter((c) => exists(c));
    const head = `${it.bold} ${it.plain.slice(0, 50)}`;
    const about = lines.find((c) => head.includes(c.split(' ')[0]));
    const run = async (line) => { const r = await Tour.runLine(line); return r === 'draft' ? `${line} is in the chat box.` : `Ran ${line}.`; };
    if (about) return run(about);
    if (it.keys.length) { Tour.pulse('#keys-btn', { label: it.keys[0], ms: 5000 }); toast(`${it.bold || 'Keys'}: ${it.keys.join(', ')} (the keys button lists them)`, { timeout: 4000 }); return `Keys: ${it.keys.join(', ')}`; }
    if (lines[0]) return run(lines[0]);
    const tour = TOUR_OF[it.file];
    if (tour) { Tour.start(tour); return `Guided tour: ${tour}.`; }
    toast(short(it.plain, 200), { timeout: 6000 });
    return short(it.plain, 120);
  }
  function notForMe(id) {
    const it = typeof id === 'object' ? id : findItem(id);
    if (!it) return;
    if (!data.hide.includes(it.id)) data.hide.push(it.id);
    data.hide = data.hide.slice(-600);
    const g = `${it.file}|${it.group}`;
    data.cold[g] = (data.cold[g] || 0) + 1.5; data.cold[it.file] = (data.cold[it.file] || 0) + 0.5;
    save();
  }

  // ---------- the cards (one at a time, bottom left like the pick-up card, never over it) ----------
  let cardEl = null; let hideT = 0;
  function closeCard() { clearTimeout(hideT); if (!cardEl) return; const c = cardEl; cardEl = null; c.classList.add('out'); setTimeout(() => c.remove(), 160); }
  const otherCard = () => [...document.querySelectorAll('.speed-card')].some((c) => c !== cardEl && !c.classList.contains('out'));
  // waits (a check every 1.5 s, at most 30 s) for the pick-up card or a tour card to go
  async function whenFree(ms = 30000) { const t0 = Date.now(); while (otherCard() || Tour.current) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 1500)); } return true; }
  function mountCard(cls, head, rows, foot, { timeout = 30000, menu = [] } = {}) {
    closeCard();
    cardEl = el('div', { class: `speed-card dc-card ${cls}`, role: 'dialog', 'aria-label': head, 'data-no-usage': '' },
      el('div', { class: 'sr-head' }, el('b', { text: head }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'sr-x', text: '×', title: 'Dismiss', on: { click: () => closeCard() } })),
      ...rows, foot);
    if (menu.length) cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menu); });
    const arm = () => { clearTimeout(hideT); if (timeout) hideT = setTimeout(closeCard, timeout); };
    cardEl.addEventListener('mouseenter', () => clearTimeout(hideT));
    cardEl.addEventListener('mouseleave', arm);
    document.body.append(cardEl);
    arm();
    return cardEl;
  }
  const icon = (file) => ({ 'renders.md': '⇪', 'eyes.md': '◉', 'apps.md': '▣', 'access.md': '🔐', 'adobe.md': 'Ps', 'speed.md': '⚡', 'seqguard.md': '▤', 'sequence.md': '▤', 'seq2.md': '▤', 'board.md': '▦', 'tour.md': '✦' }[file] || '•');
  function itemRow(it, { onGone } = {}) {
    const row = el('div', { class: 'dc-row', dataset: { item: it.id }, title: it.plain },
      el('span', { class: 'sr-ic', text: icon(it.file) }),
      el('span', { class: 'dc-text' }, el('b', { text: short(it.bold || it.plain, 46) }), el('span', { class: 'dc-sub', text: `${nameOf(it.file)}${it.bold ? ` · ${short(it.plain.replace(it.bold, '').replace(/^[\s:.—-]+/, ''), 60)}` : ''}` })),
      el('button', { type: 'button', class: 'dc-show', text: '▶', title: 'Show me', on: { click: async (e) => { e.stopPropagation(); const t = await showMe(it); if (t && !/^Here|chat box|Ran|Guided/.test(t)) toast(t, { timeout: 2500 }); } } }),
      el('button', { type: 'button', class: 'dc-no', text: '×', title: 'Not for me (this kind sinks next time)', on: { click: (e) => { e.stopPropagation(); notForMe(it); row.remove(); onGone?.(); } } }));
    return row;
  }
  async function card(rec) {
    if (!rec?.n || !(await whenFree())) return null;
    const items = await itemsOf(rec);
    const top = picked(items, 5);
    if (!top.length) return null;
    const foot = el('div', { class: 'dc-foot' },
      el('button', { type: 'button', class: 'ghost small', text: `All ${items.length} new ›`, on: { click: () => { closeCard(); openPane('new'); } } }),
      el('span', { class: 'spacer' }),
      el('span', { class: 'sr-hint', text: '/whats-new' }));
    return mountCard('dc-new', `✦ What's new · ${items.length} change${items.length === 1 ? '' : 's'}`, top.map((it) => itemRow(it)), foot, { timeout: 45000,
      menu: [{ label: 'All of it on the Commands page', action: () => openPane('new') }, { label: 'Dismiss', action: () => closeCard() }] });
  }

  // ---------- daily tip ----------
  const tipState = () => store.get('discover.tips', { day: '', seen: [], later: {}, off: false });
  const setTips = (v) => store.set('discover.tips', { ...tipState(), ...v });
  function tipCandidates(place = placeNow()) {
    const st = tipState();
    return D.TIPS.filter((t) => (t.place === 'any' || t.place === place) && exists(t.cmd) && !st.seen.includes(t.id) && !((st.later[t.id] || 0) > Date.now())
      && !(t.used || []).some(usedCmd) && !(t.usedKey && Object.keys(Usage?.data?.items || {}).some((k) => t.usedKey.test(k))));
  }
  // one a day at most; { force } = /tip (any time, still only one card)
  async function maybeTip({ force = false } = {}) {
    const st = tipState();
    if (!force && (st.off || st.day === today() || Date.now() - T0 < 120e3 || Tour.current || otherCard() || document.hidden)) return null;
    const list = tipCandidates();
    const here = list.filter((t) => t.place !== 'any');
    const tip = (here.length ? here : list)[0];
    if (!tip) return null;
    setTips({ day: today(), seen: [...st.seen, tip.id].slice(-80) });
    const foot = el('div', { class: 'dc-foot' },
      el('button', { type: 'button', class: 'small primary', text: 'Try it', on: { click: () => { closeCard(); Tour.runLine(tip.cmd); } } }),
      tip.tour ? el('button', { type: 'button', class: 'ghost small', text: 'Show me around', on: { click: () => { closeCard(); Tour.start(tip.tour); } } }) : null,
      el('button', { type: 'button', class: 'ghost small', text: 'Later', on: { click: () => { const s = tipState(); setTips({ seen: s.seen.filter((x) => x !== tip.id), later: { ...s.later, [tip.id]: Date.now() + 3 * DAY } }); closeCard(); } } }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost small dc-stop', text: 'Stop tips', on: { click: () => { setTips({ off: true }); closeCard(); toast('No more tips (/tip on brings them back; /tip shows one)', { timeout: 2600 }); } } }));
    mountCard('dc-tip', 'Did you know?', [el('p', { class: 'dc-tiptext', text: tip.text })], foot, { timeout: 25000 });
    cardEl.dataset.tip = tip.id;
    return tip;
  }
  const tipSoon = debounce(() => { maybeTip().catch(() => {}); }, 6000);

  // ---------- feature map + Surprise me ----------
  function featureMap() {
    const by = new Map();
    for (const d of C()?.list() || []) {
      if (d.hidden) continue;
      const a = by.get(d.area) || { area: d.area, used: 0, never: 0, total: 0, neverNames: [] };
      a.total += 1;
      if (usedCmd(d.name)) a.used += 1; else { a.never += 1; if (a.neverNames.length < 6) a.neverNames.push(d.name); }
      by.set(d.area, a);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }
  async function surprise() {
    const place = placeNow();
    const recent = data.surprised || [];
    let pool = D.SURPRISES.filter((s) => exists(s.cmd) && !usedCmd(s.cmd.slice(1).split(' ')[0]) && !recent.includes(s.cmd));
    if (!pool.length) pool = D.SURPRISES.filter((s) => exists(s.cmd) && !recent.slice(0, 3).includes(s.cmd));
    if (!pool.length) return null;
    const here = pool.filter((s) => s.place === place);
    const from = here.length && Math.random() < 0.7 ? here : pool;
    const s = from[Math.floor(Math.random() * from.length)];
    data.surprised = [s.cmd, ...recent.filter((x) => x !== s.cmd)].slice(0, 6);
    save();
    const r = await Tour.runLine(s.cmd);
    return { ...s, how: r === 'draft' ? 'draft' : r ? 'ran' : 'missing' };
  }

  // ---------- ideas for tonight ----------
  async function ideasCtx() {
    const ctx = { boards: [], mood: [], scenes: [], songs: [], apps: [] };
    try { const idx = await window.hub.kvGet('boards', null); ctx.boards = (idx?.list || []).filter((b) => (b.count || 0) > 0).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((b) => b.name).slice(0, 3); } catch { /* none */ }
    try { if (typeof Board !== 'undefined' && Board.current?.()) { const m = {}; for (const it of Board.items()) for (const w of it.vibe?.moods || []) m[w] = (m[w] || 0) + 1; ctx.mood = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 3); } } catch { /* none */ }
    try {
      const sk = await window.hub.kvGet('three-sketches', []);
      const ex = await window.hub.kvGet('three-lab-extras', {});
      const list = (Array.isArray(sk) ? sk : []).filter((x) => x?.name && !/^(untitled|sketch \d+|new sketch)$/i.test(x.name)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      ctx.scenes = list.map((x) => x.name).slice(0, 4);
      ctx.songs = list.map((x) => ex?.[x.id]?.media?.path).filter((p) => p && /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(p)).map((p) => p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')).slice(0, 2);
    } catch { /* none */ }
    try { ctx.apps = ['meshy', 'suno'].filter((id) => Apps.get?.(id)); } catch { /* none */ }
    return ctx;
  }
  async function ideas() { return D.ideas(await ideasCtx()).filter((x) => (!x.draft || !x.draft.startsWith('/') || exists(x.draft)) && x.lines.every(exists)); }
  // start one: its setup commands (safe ones only), then the line in the right chat box (the Lab's director for Lab ideas)
  async function startIdea(idea) {
    for (const l of idea.lines) if (D.safeLine(l, (n) => Boolean(C()?.get(n)))) await C().tryRun(l, H.claudeAgent().id, null, { source: 'code', say: () => {}, note: () => {} });
    if (!idea.draft) return 'started';
    let agent = null;
    if (idea.to === 'three') { try { agent = Tools.dockedAgent?.('three') || null; } catch { /* none */ } }
    const id = agent?.id || (H.agent?.(H.activeId) ? H.activeId : H.claudeAgent().id);
    if (idea.to === 'three' && H.surfaceIdFor?.(H.activeId) !== 'tool:three' && !agent) activate(id);
    if (idea.to === 'three' && agent) activate('tool:three');
    if (idea.to !== 'three') activate(id);
    if (idea.draft.startsWith('/') && D.safeLine(idea.draft, (n) => Boolean(C()?.get(n)))) { await C().tryRun(idea.draft, id, null, { source: 'code' }); return 'ran'; }
    Native.setDraft(id, idea.draft);
    toast('In the chat box: press Enter to start, or change it first', { timeout: 2600 });
    return 'draft';
  }

  // ---------- ☰ Commands › Discover (rows on the page, the pane on the right) ----------
  // one row when the list is browsed (the page stays compact); its four parts as rows when you search
  const PARTS = [
    ['new', '✦', 'What\'s new', 'the changes that fit how you work, by round', 'whats new update changes latest round'],
    ['map', '◫', 'Feature map', 'what you use, what you never tried · ✦ Surprise me', 'feature map areas used never tried surprise'],
    ['ideas', '💡', 'Ideas for tonight', 'from your boards, songs, scenes and apps', 'ideas tonight make inspiration'],
    ['tours', '⌖', 'Guided tours', 'a ring on the real controls, 3–5 steps', 'tour guided spotlight walkthrough'],
  ];
  const pageRow = (id, ic, name, desc) => el('button', { class: 'cp-row dc-pagerow', type: 'button', dataset: { ext: `tour:${id}` } },
    el('span', { class: 'cp-pv cp-ficon', text: ic }), el('span', { class: 'cp-rtext' }, el('b', { text: name }), el('span', { class: 'cp-desc', text: desc })), el('span', { class: 'cp-area', text: 'discover' }));
  function pageSections(q) {
    const s = String(q || '').trim().toLowerCase().replace(/^\//, '');
    if (!s) return [{ head: 'Discover', items: [{ node: pageRow('discover', '✦', 'Discover', 'what\'s new · feature map · ideas for tonight · guided tours') }] }];
    const rows = PARTS.filter((r) => `${r[2]} ${r[4]}`.toLowerCase().includes(s));
    return rows.length ? [{ head: 'Discover', items: rows.map(([id, ic, name, desc]) => ({ node: pageRow(id, ic, name, desc) })) }] : [];
  }
  let want = 'new';
  function pagePick(id, right) {
    if (!String(id).startsWith('tour:')) return;
    const what = id === 'tour:discover' ? want : id.slice(5);
    want = 'new';
    const pane = el('div', { class: 'dc-pane', dataset: { pane: what } }, el('p', { class: 'hint', text: '…' }));
    const draw = (k) => ({ new: paneNew, map: paneMap, ideas: paneIdeas, tours: paneTours }[k] || paneNew)(pane).catch((err) => pane.replaceChildren(el('p', { class: 'hint', text: err.message })));
    const tabs = el('div', { class: 'dc-tabs', role: 'tablist' }, ...PARTS.map(([k, ic, name]) => el('button', { type: 'button', class: `ghost small${k === what ? ' on' : ''}`, text: `${ic} ${name}`, dataset: { tab: k }, on: { click: (e) => { for (const b of tabs.children) b.classList.toggle('on', b === e.currentTarget); pane.dataset.pane = k; draw(k); } } })));
    right.replaceChildren(el('div', { class: 'dc-wrap' }, tabs, pane));
    draw(what);
  }
  function openPane(what = 'new') {
    if (typeof CmdPage === 'undefined') return false;
    want = what;
    const go = () => { const s = CmdPage.state; if (s.query) { s.search.value = ''; s.query = ''; CmdPage.refreshList(); } const b = s.list?.querySelector('.cp-row[data-ext="tour:discover"]'); if (b) { b.click(); b.scrollIntoView({ block: 'nearest' }); return true; } return false; };
    CmdPage.open();
    requestAnimationFrame(() => { if (!go()) setTimeout(go, 300); });
    return true;
  }
  async function paneNew(pane, round = null) {
    const rows = await loadIndex();
    const cur = round == null ? await current() : await roundItems(round).then((r) => ({ label: `round ${r.round}`, items: r.items }));
    const top = picked(cur.items, 8);
    const rounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => b - a);
    const list = el('div', { class: 'dc-list' });
    const fill = (items) => list.replaceChildren(...D.byArea(items, Object.fromEntries(rows.map((r) => [r.file, r.name]))).map((g) => el('div', { class: 'dc-group' }, el('div', { class: 'dc-ghead', text: g.area }), ...g.items.map((it) => itemRow(it)))));
    fill(top);
    pane.replaceChildren(
      el('h3', { class: 'dc-h', text: `✦ What's new · ${cur.label}` }),
      el('p', { class: 'hint', text: `${cur.items.length} change${cur.items.length === 1 ? '' : 's'}; the ${top.length} that fit how you work first. ▶ shows it, × = not for me (that kind sinks).` }),
      list,
      el('div', { class: 'dc-foot' },
        cur.items.length > top.length ? el('button', { type: 'button', class: 'ghost small', text: `Show all ${cur.items.length}`, on: { click: (e) => { fill([...top, ...cur.items.filter((x) => !top.includes(x) && !data.hide.includes(x.id))].slice(0, 400)); e.currentTarget.remove(); } } }) : null,
        el('span', { class: 'spacer' }),
        el('select', { class: 'dc-round', title: 'History by round', on: { change: (e) => { const v = e.target.value; paneNew(pane, v === 'now' ? null : Number(v)); } } },
          el('option', { value: 'now', text: 'Latest' }), ...rounds.map((r) => el('option', { value: String(r), text: r === 1 ? 'Rounds 1–2' : `Round ${r}`, selected: r === round })))));
  }
  async function paneMap(pane) {
    const map = featureMap();
    const used = map.reduce((s, a) => s + a.used, 0); const total = map.reduce((s, a) => s + a.total, 0);
    const out = el('div', { class: 'dc-sout hint' });
    pane.replaceChildren(
      el('h3', { class: 'dc-h', text: '◫ Feature map' }),
      el('p', { class: 'hint', text: `You have tried ${used} of ${total} commands. Click an area to see its commands; ✦ Surprise me picks something fun you never tried.` }),
      el('div', { class: 'dc-foot' }, el('button', { type: 'button', class: 'primary small dc-surprise', text: '✦ Surprise me', on: { click: async () => { const s = await surprise(); out.textContent = s ? `${s.cmd} — ${s.why}${s.how === 'draft' ? ' (in the chat box: press Enter)' : ''}` : 'You have tried every surprise. Impressive.'; } } }), out),
      el('div', { class: 'dc-map' }, ...map.map((a) => el('button', { type: 'button', class: 'dc-area', title: a.never ? `Never tried: ${a.neverNames.map((n) => `/${n}`).join(' ')}${a.never > a.neverNames.length ? '…' : ''}` : 'All tried', on: { click: () => { const s = CmdPage.state; s.search.value = a.area; s.query = a.area; CmdPage.refreshList(); } } },
        el('span', { class: 'dc-aname', text: a.area }),
        el('span', { class: 'dc-bar' }, el('i', { style: { width: `${Math.round((a.used / Math.max(1, a.total)) * 100)}%` } })),
        el('span', { class: 'dc-anum', text: `${a.used} used · ${a.never} new` })))));
  }
  async function paneIdeas(pane) {
    const list = await ideas();
    pane.replaceChildren(
      el('h3', { class: 'dc-h', text: '💡 Ideas for tonight' }),
      el('p', { class: 'hint', text: 'Made from your boards, songs, scenes and apps (nothing is sent anywhere). Click one: it opens the right place and puts the first step in the chat box.' }),
      el('div', { class: 'dc-list' }, ...list.map((x) => el('button', { type: 'button', class: 'dc-idea', dataset: { idea: x.id }, on: { click: () => startIdea(x) } },
        el('span', { class: 'sr-ic', text: x.icon }), el('span', { class: 'dc-text' }, el('b', { text: x.text }), el('span', { class: 'dc-sub', text: x.why }))))));
  }
  async function paneTours(pane) {
    const p = Tour.progress();
    pane.replaceChildren(el('h3', { class: 'dc-h', text: '⌖ Guided tours' }),
      el('p', { class: 'hint', text: 'A ring on the real control and one small card. × or Esc pauses; the same tour picks up there. /tour <name> from any chat.' }),
      el('div', { class: 'dc-list' }, ...D.TOURS.map((t) => el('button', { type: 'button', class: 'dc-idea', dataset: { tour: t.id }, on: { click: () => Tour.start(t) } },
        el('span', { class: 'sr-ic', text: t.icon }), el('span', { class: 'dc-text' }, el('b', { text: t.name }), el('span', { class: 'dc-sub', text: `${t.why}${p[t.id]?.done ? ' · seen ✓' : p[t.id] ? ` · paused at ${(p[t.id].step || 0) + 1}` : ''}` }))))));
  }

  // ---------- commands ----------
  function register() {
    const Cm = C();
    if (!Cm) return;
    const reg = (def) => { if (!Cm.get(def.name)) Cm.register({ area: 'App', ...def }); };
    reg({
      name: 'whats-new', aliases: ['whatsnew', 'news'], args: '[round <n> | history | all | show <n> | skip <n>]',
      desc: 'What\'s new in Hearth: the changes that fit how you work (after an ⬆ Update, or a round), each with Show me',
      keywords: 'new changes update release notes changelog latest round discover',
      examples: ['/whats-new', '/whats-new round 14', '/whats-new history', '/whats-new show 2'],
      complete: async () => { const rows = await loadIndex(); return [{ value: 'history' }, { value: 'all', hint: 'on the Commands page' }, ...[...new Set(rows.map((r) => r.round))].sort((a, b) => b - a).map((r) => ({ value: `round ${r}` }))]; },
      run: async (args, ctx) => {
        await ready;
        const a = String(args || '').trim().toLowerCase();
        if (a === 'all' || a === 'page') { openPane('new'); return null; }
        if (a === 'history') {
          const rows = await loadIndex();
          const by = new Map(); for (const r of rows) { if (!by.has(r.round)) by.set(r.round, []); by.get(r.round).push(r); }
          const ups = data.updates.slice(0, 5).map((u) => `- ${timeAgo(u.at)}: ${u.from || '…'} → ${u.to || ''} · ${u.n} new`).join('\n');
          return `**What's new, by round** (\`/whats-new round <n>\`)\n${[...by.entries()].sort((x, y) => y[0] - x[0]).map(([r, list]) => `- **${r === 1 ? 'Rounds 1–2' : `Round ${r}`}** · ${list.reduce((s, x) => s + x.count, 0)}: ${list.map((x) => x.name).join(', ')}`).join('\n')}${ups ? `\n\n**Your updates**\n${ups}` : ''}`;
        }
        let m;
        const cur = (m = a.match(/^round\s+(\d+)/)) ? await roundItems(Number(m[1])).then((r) => ({ label: `round ${r.round}`, items: r.items })) : await current();
        const top = picked(cur.items, 6);
        if ((m = a.match(/^(show|skip)\s+(\d+)/))) { const it = top[Number(m[2]) - 1]; if (!it) return `No item ${m[2]} (1–${top.length}).`; if (m[1] === 'skip') { notForMe(it); return `Not for you: “${short(it.bold || it.plain, 50)}” (that kind sinks next time).`; } return showMe(it); }
        if (!top.length) return cur.items.length ? 'Nothing new that fits you — /whats-new all shows everything.' : 'Nothing new here yet.';
        const text = `**✦ What's new · ${cur.label}** (${cur.items.length} change${cur.items.length === 1 ? '' : 's'}; these fit how you work)\n${top.map((it, i) => `${i + 1}. ${it.bold ? `**${it.bold}** ` : ''}${short(it.bold ? it.plain.replace(it.bold, '').replace(/^[\s:.—-]+/, '') : it.plain, 140)} · _${nameOf(it.file)}_`).join('\n')}\n\n\`/whats-new show 2\` · \`/whats-new skip 2\` (not for me) · \`/whats-new all\``;
        if (ctx?.note) { ctx.note(text, { id: 'whats-new', actions: [...top.slice(0, 5).map((it, i) => ({ label: `▶ ${i + 1}`, run: () => showMe(it) })), { label: 'All ›', run: () => openPane('new') }] }); return undefined; }
        return text;
      },
    });
    reg({
      name: 'tip', aliases: ['did-you-know'], args: '[on | off]', desc: 'A "Did you know?" for something you have never used (at most one a day by itself)',
      keywords: 'tips hint discover learn feature daily', examples: ['/tip', '/tip off', '/tip on'],
      complete: () => ['on', 'off'].map((value) => ({ value })),
      run: async (args) => {
        const a = String(args || '').trim().toLowerCase();
        if (a === 'off') { setTips({ off: true }); return 'Daily tips are off (/tip still shows one).'; }
        if (a === 'on') { setTips({ off: false }); return 'Daily tips are on: at most one a day, for something you have never used, never when Hearth opens.'; }
        const t = await maybeTip({ force: true });
        return t ? null : 'You have tried everything the tips know about here. /feature-map shows the rest.';
      },
    });
    reg({
      name: 'feature-map', aliases: ['features-map'], args: '', desc: 'Every area with what you used and what you never tried (☰ Commands › Discover), with ✦ Surprise me',
      keywords: 'feature map areas used never tried coverage discover', examples: ['/feature-map'],
      run: (_a, ctx) => {
        const map = featureMap().slice(0, 14);
        const text = `**◫ Feature map** · used / never tried\n${map.map((a) => `- **${a.area}**: ${a.used} / ${a.never}${a.never ? ` (try \`/${a.neverNames[0]}\`)` : ''}`).join('\n')}`;
        if (ctx?.note) { ctx.note(text, { id: 'feature-map', actions: [{ label: '✦ Surprise me', run: () => surprise().then((s) => s && toast(`${s.cmd}: ${s.why}`, { timeout: 2600 })) }, { label: 'Open the map ›', run: () => openPane('map') }] }); return undefined; }
        return text;
      },
    });
    reg({
      name: 'surprise-me', aliases: ['surprise-feature'], args: '', desc: 'Picks something fun you have never tried and starts it (or puts it in the chat box)',
      keywords: 'random surprise discover try new feature fun', examples: ['/surprise-me'],
      run: async () => { const s = await surprise(); return s ? `✦ **${s.cmd}** — ${s.why}${s.how === 'draft' ? ' (in the chat box: press Enter)' : ''}` : 'You have tried every surprise.'; },
    });
    reg({
      name: 'ideas', aliases: ['tonight'], args: '[n]', desc: 'Ideas for tonight from your boards, songs, scenes and apps; each starts the right command (no tokens)',
      keywords: 'ideas inspiration what to make tonight suggest board song scene', examples: ['/ideas', '/ideas 2'],
      run: async (args, ctx) => {
        const list = await ideas();
        const n = Number(String(args || '').trim());
        if (n && list[n - 1]) { const r = await startIdea(list[n - 1]); return r === 'draft' ? `“${list[n - 1].text}”: the first step is in the chat box.` : `Started: ${list[n - 1].text}`; }
        const text = `**💡 Ideas for tonight**\n${list.slice(0, 6).map((x, i) => `${i + 1}. ${x.icon} ${x.text} · _${x.why}_`).join('\n')}\n\n\`/ideas 1\` starts the first one.`;
        if (ctx?.note) { ctx.note(text, { id: 'ideas', actions: list.slice(0, 4).map((x, i) => ({ label: `${i + 1}. ${short(x.text, 22)}`, run: () => startIdea(x) })) }); return undefined; }
        return text;
      },
    });
  }

  // ---------- wiring ----------
  function start() {
    register();
    if (typeof CmdPage !== 'undefined' && CmdPage.ext) { CmdPage.ext.sections.push(pageSections); CmdPage.ext.pick.push(pagePick); }
    // after an ⬆ Update (updater.js keeps the last one in update.last): once per update
    const j = store.get('update.last', null);
    if (j && Date.now() - (j.at || 0) < 2 * DAY) fromUpdate(j);
    document.addEventListener('hearth:updated', (e) => fromUpdate(e.detail));
    // the daily tip: after you open a screen or run a command, never in the first two minutes
    try { Usage.onTrack?.((key) => { if (String(key).startsWith('Open › ')) tipSoon(); }); } catch { /* no usage */ }
    try { C()?.onRun?.(() => tipSoon()); } catch { /* none */ }
    try {
      AppUI.addAction?.('What\'s new in Hearth', () => C().tryRun('/whats-new', H.claudeAgent().id));
      AppUI.addAction?.('Feature map: what you never tried', () => openPane('map'));
      AppUI.addAction?.('Surprise me: try something new', () => surprise());
      AppUI.addAction?.('Ideas for tonight', () => openPane('ideas'));
    } catch { /* no palette */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return {
    ready, loadIndex, loadDoc, beforeUpdate, fromUpdate, current, roundItems, picked, showMe, notForMe, card, closeCard, maybeTip, tipCandidates,
    featureMap, surprise, ideas, ideasCtx, startIdea, openPane, usedCmd, profile, get data() { return data; }, get cardEl() { return cardEl; },
  };
})();
