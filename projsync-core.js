// (round 76, projsync76) A project across two computers, the pure part (Node + window; dev/projsync76-test.js):
//   status(p, o) → the Desk's one "Sync status" line: "All here · synced 2 min ago" / "3 files still arriving from Mac"
//                  (+ the names in its tooltip), from what sync already reports (its waiting list, the other computer,
//                  when it last synced) and what this computer has. Nothing is read or asked: a few array lookups.
//   arriving(err)  → is this "not on this computer yet" (a project opened before its chat / scene / board arrived)?
//   rels(p, o)     → the data-folder files a project is made of (its chats, the scenes / boards stores, its worktable,
//                    its files inside the data folder): what "still arriving" looks for in sync's list
const ProjSyncCore = (() => {
  const DAY = 864e5;
  // sync's reasons for a file it waits for that mean "coming from the other computer" (sync-engine.js status.waiting)
  const IN = new Set(['arriving', 'cloud-only', 'deleting', 'copy-check', 'unlisted', 'cloud-error']);
  // …and the ones that mean "going there / moving" (a big file's lane goes both ways)
  const OUT = new Set(['writing', 'retry', 'queued', 'moving', 'error', 'disk-full', 'unreadable']);
  const fwd = (s) => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '');
  // an absolute path inside the data folder → its rel ("captures/a.png"), else null
  function relOf(abs, dataDir, ci = false) {
    const a = fwd(abs); const d = fwd(dataDir);
    if (!a || !d) return null;
    const head = a.slice(0, d.length);
    if (!(ci ? head.toLowerCase() === d.toLowerCase() : head === d) || a[d.length] !== '/') return null;
    return a.slice(d.length + 1);
  }
  // the files of an item: [rel, …] (a folder item: its rel, matched as a prefix)
  function itemRels(x, o) {
    if (x.type === 'chat') return [`chats/${x.ref}.json`];
    if (x.type === 'scene' || x.type === 'seq') return ['kv/three-sketches.json'];
    if (x.type === 'board') return [`kv/board-${x.ref}.json`, 'kv/boards.json'];
    if (['capture', 'render', 'file', 'download'].includes(x.type)) { const r = relOf(o.pathOf ? o.pathOf(x) || '' : x.ref, o.dataDir, o.ci); return r ? [r] : []; }
    return [];
  }
  function rels(p, o = {}) {
    const out = new Set([`kv/workbench-${p.id}.json`]);
    for (const x of p.items || []) for (const r of itemRels(x, o)) out.add(r);
    return [...out];
  }
  const under = (rel, set) => set.has(rel) || [...set].some((r) => rel.startsWith(`${r}/`) || r.startsWith(`${rel}/`));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // o: { sync: Sync.status() ({ on, state, paused, waiting: [{ rel, why }], cloudOnly: [rel], lastOk, at, peers }),
  //      present(x) → true | false | null (null: can't tell), dataDir, ci (Windows: paths without case), pathOf(x),
  //      now, ago(ms) → "2 min ago", names(x) → a name }
  // → { kind: 'off' | 'here' | 'arriving' | 'going' | 'offline' | 'paused', n, names, text, title } (null: sync is off)
  function status(p, o = {}) {
    const st = o.sync || {};
    if (!p || !st.on) return null;
    const now = o.now || Date.now();
    const ago = o.ago || ((t) => (t ? `${Math.max(1, Math.round((now - t) / 60000))} min ago` : 'not yet'));
    const peer = [...(st.peers || [])].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0]?.name || 'your other computer';
    const waitIn = new Set(); const waitOut = new Set();
    for (const w of st.waiting || []) (IN.has(w.why) ? waitIn : OUT.has(w.why) ? waitOut : waitIn).add(w.rel);
    for (const r of st.cloudOnly || []) waitIn.add(r);
    const arriving = []; const going = [];
    const recent = (x) => Math.max(x.at || 0, p.updated || 0, p.at || 0) > now - DAY;
    for (const x of p.items || []) {
      const rs = itemRels(x, o);
      const here = o.present ? o.present(x) : null;
      const inbound = rs.some((r) => under(r, waitIn));
      // a chat / scene / board missing here: on its way when sync says so, or when the project changed in the last day
      // (the other computer's cloud client may not have even listed it yet); older and missing = deleted (faded on the Desk)
      if (here === false && (inbound || recent(x))) arriving.push(x);
      else if (here !== false && ['capture', 'render', 'file', 'download'].includes(x.type) && inbound) arriving.push(x);
      else if (rs.some((r) => under(r, waitOut)) && !['scene', 'seq', 'board'].includes(x.type)) going.push(x);
    }
    if (under(`kv/workbench-${p.id}.json`, waitIn)) arriving.push({ type: 'worktable', ref: p.id, name: 'The worktable' });
    const nameOf = (x) => (o.names ? o.names(x) : x.name || x.ref);
    const last = st.lastOk || st.at || 0;
    const names = arriving.slice(0, 12).map(nameOf);
    const tip = (head) => `${head}${names.length ? `\n${names.map((n) => `· ${n}`).join('\n')}${arriving.length > names.length ? `\n· and ${arriving.length - names.length} more` : ''}` : ''}\nClick: the sync panel`;
    if (st.paused) return { kind: 'paused', n: arriving.length, names, text: `Sync paused · last synced ${ago(last)}`, title: tip('Sync is paused: nothing comes or goes until you resume it.') };
    if (st.state === 'offline') return { kind: 'offline', n: arriving.length, names, text: arriving.length ? `Offline · ${plural(arriving.length, 'file')} still to arrive from ${peer}` : `Offline · last synced ${ago(last)}`, title: tip('The cloud drive isn\'t reachable: everything here keeps working and catches up when it\'s back.') };
    if (arriving.length) return { kind: 'arriving', n: arriving.length, names, text: `${plural(arriving.length, 'file')} still arriving from ${peer}`, title: tip(`On their way from ${peer} (or deleted there). The project opens with what's here; the rest shows as it lands.`) };
    if (going.length) return { kind: 'going', n: going.length, names: going.slice(0, 12).map(nameOf), text: `${plural(going.length, 'file')} still syncing`, title: `Being copied to the cloud drive now.\n${going.slice(0, 12).map((x) => `· ${nameOf(x)}`).join('\n')}\nClick: the sync panel` };
    return { kind: 'here', n: 0, names: [], text: `All here · synced ${ago(last)}`, title: `Everything in this project is on this computer and synced with ${peer}.\nClick: the sync panel` };
  }
  // "not here yet" errors from opening a project (project-workspace.js) — the open waits calmly instead of failing
  const arriving = (err) => /not (available|arrived)( on this computer)?( yet)?|has not arrived|hasn.t arrived|still arriving|is still loading/i.test(String(err?.message || err || ''));
  return { status, arriving, rels, relOf, itemRels, IN, OUT };
})();
if (typeof module !== 'undefined') module.exports = ProjSyncCore;
