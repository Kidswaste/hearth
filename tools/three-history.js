// The Lab's time machine (round 23, timemachine): every meaningful change to a scene becomes a version with a tiny
// picture, who made it (you, Claude, Astra or a crew helper) and a one-line label. Scrub them on the preview, compare
// two, restore one (undoable), branch from one into a new scene, or pick one layer / the colors / the slider values
// from it. Each director turn's start is bookmarked, so "back to before Claude's last 3 edits" is one step.
//   Data: kv three-tm-<scene> (tools/three-history-core.js: deltas against a few full states, thinned: every version
//   of today, hourly for the week, daily after) and kv three-tm-<scene>-t (the pictures, read only when shown).
//   Hooks: tools/three.js calls ThreeHistory.changed(kind) on a run, a layer change, saved sliders and a scene changed
//   backstage; three-tweaks.js on a shuffle; its HubBridge handler goes through ThreeHistory.director (who changed it).
//   UI: tools/three-history-ui.js · commands: tools/three-history-cmds.js (/history, /back, /branch).
const ThreeHistory = (() => {
  const C = TMCore;
  const KV = (id) => `three-tm-${id}`;
  const KVT = (id) => `three-tm-${id}-t`;
  const okId = (id) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const T = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.tm : null);
  const THUMB = 120; // px, the long side: ≈ 3–6 KB a picture
  const CACHE = 6; // scenes whose history stays in memory
  // the director's tools that only read: they never make a version
  const READ = /^three_(get_code|read_code|search_code|screenshot|console|layers|errors|contact_sheet|timeline|report|fps|eval|input|help|state)$/;
  const stats = { captured: 0, skipped: 0, thumbs: 0, saves: 0, lastMs: 0 };

  // ---------- a scene's history in memory: loaded on first use, saved 1.5 s after the last change ----------
  const docs = new Map(); // scene id → { id, doc, last: the newest version's state }
  const loading = new Map();
  function docOf(id) {
    if (docs.has(id)) { const e = docs.get(id); docs.delete(id); docs.set(id, e); return Promise.resolve(e); }
    if (!loading.has(id)) {
      loading.set(id, (async () => {
        let d = null;
        try { d = okId(id) ? await window.hub.kvGet(KV(id), null) : null; } catch { /* a new one */ }
        const doc = d?.versions && d.keys ? d : C.blank();
        C.heal(doc); C.gc(doc);
        const e = { id, doc, last: null };
        const lv = C.latest(doc);
        e.last = lv ? C.stateOf(doc, lv) : null;
        docs.set(id, e); loading.delete(id);
        for (const [k] of docs) { if (docs.size <= CACHE) break; if (!saveT.has(k) && k !== id && k !== S()?.currentId()) docs.delete(k); }
        return e;
      })());
    }
    return loading.get(id);
  }
  const saveT = new Map();
  function saveSoon(id) {
    clearTimeout(saveT.get(id));
    saveT.set(id, setTimeout(() => {
      saveT.delete(id);
      const e = docs.get(id);
      if (e && okId(id)) { stats.saves += 1; window.hub.kvSet(KV(id), e.doc).catch((err) => console.warn('time machine save', err)); }
    }, 1500));
  }
  // another computer's versions arrived (cloud sync): merged in by id (the delete of a thinned one is left to thinning)
  function mergeIn(e, disk) {
    if (!disk?.versions) return 0;
    const have = new Set(e.doc.versions.map((v) => v.id));
    let n = 0;
    for (const [k, st] of Object.entries(disk.keys || {})) if (!e.doc.keys[k]) e.doc.keys[k] = st;
    for (const v of disk.versions) if (v?.id && !have.has(v.id)) { e.doc.versions.push(v); n += 1; }
    if (n) { C.heal(e.doc); const lv = C.latest(e.doc); e.last = lv ? C.stateOf(e.doc, lv) : null; emit(e.id, null); }
    return n;
  }
  addEventListener('hearth:synced', (ev) => {
    for (const f of ev.detail?.files || []) {
      const m = /^kv\/three-tm-([\w-]+?)(-t)?\.json$/.exec(f.rel || '');
      if (!m) continue;
      if (m[2]) { thumbMem.delete(m[1]); continue; }
      const e = docs.get(m[1]);
      if (e) window.hub.kvGet(KV(m[1]), null).then((d) => { if (mergeIn(e, d)) saveSoon(m[1]); }).catch(() => {});
    }
  });

  // ---------- who is changing a scene ----------
  const hints = new Map(); // scene id → { by, until } (a crew helper's pick, a restore)
  const active = new Map(); // scene id → { by, chat, tools: Set, running, until } (a director's calls)
  const sceneFor = (chatId) => (chatId && typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId)) || S()?.currentId() || null;
  function engineOf(chatId) {
    const w = chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.workers?.(chatId) : null;
    if (w?.active) return w.active === 'codex' ? 'codex' : 'claude';
    const c = chatId ? (H.chats || []).find((x) => x.id === chatId) : null;
    return H.agent?.(c?.agentId)?.engine === 'codex' ? 'codex' : 'claude';
  }
  function actorFor(id) {
    const h = hints.get(id);
    if (h && h.until > Date.now()) return h;
    const a = active.get(id);
    if (a && a.running > 0) return a;
    return { by: 'you' };
  }
  // the Lab's HubBridge handler goes through here (tools/three.js): the owner's own changes so far are recorded as
  // theirs first, then what the call changed is the director's
  async function director(tool, args, ctx = {}, fn) {
    const id = READ.test(tool) ? null : sceneFor(ctx.chatId);
    if (!id || !T()) return fn(tool, args, ctx);
    if (timers.has(id)) await capture(id).catch(() => null);
    window.LabTry?.touch?.(id, ctx.chatId); // (round 43, directorpreview) Try it first: the scene as it was, before this edit
    const a = active.get(id) || { tools: new Set(), running: 0 };
    a.by = engineOf(ctx.chatId); a.chat = ctx.chatId || null; a.running += 1;
    a.tools.add(String(args?.cmd ? `${args.cmd}` : tool).replace(/^three_/, ''));
    active.set(id, a);
    try { return await fn(tool, args, ctx); } finally {
      // what the call changed is recorded as it ends (the Lab answers once the change is on screen), so the owner's
      // next move is never counted as the director's
      a.running = Math.max(0, a.running - 1);
      if (!a.running) capture(id, { kind: 'director', by: a.by, actor: a }).catch(() => null);
      if (!a.running) window.LabAB?.note?.('director', { id, by: a.by, chat: a.chat }); // (round 37, abcompare)
    }
  }
  const as = (id, by, ms = 4000) => { if (id) hints.set(id, { by, until: Date.now() + ms }); };

  // ---------- recording ----------
  // kind: run (code ran) · layers (a layer added / removed / moved / its props) · sliders (saved into the code) ·
  // shuffle (kept for 5 s) · scene (changed backstage) · director · restore · pick · branch · turn · start
  const RANK = { scene: 1, run: 2, layers: 3, shuffle: 5, sliders: 6 };
  const timers = new Map(); // scene id → { t, kind }
  const DELAY = { shuffle: 5000, run: 1200, layers: 900, sliders: 600, scene: 900 };
  function schedule(id, kind, ms = DELAY[kind] ?? 900) {
    const p = timers.get(id);
    clearTimeout(p?.t);
    const k = p && (RANK[p.kind] || 0) > (RANK[kind] || 0) ? p.kind : kind;
    timers.set(id, { kind: k, t: setTimeout(() => capture(id).catch((err) => console.warn('time machine', err)), kind === 'shuffle' ? DELAY.shuffle : ms) });
  }
  function changed(kind = 'run', id = null) {
    const tm = T(); const sc = S();
    if (!tm || !sc) return;
    id ||= sc.currentId();
    if (!id) return;
    if (scrub && id === scrub.id) { if (!inShow) scrubTouched(); return; }
    if (tm.quiet) return;
    window.LabAB?.note?.(kind, { id }); // (round 37, abcompare) ◧ Before / after: a change to the look is being made
    schedule(id, kind);
  }
  const chains = new Map(); // one capture at a time per scene
  function capture(id, extra = {}) {
    const p = timers.get(id);
    clearTimeout(p?.t); timers.delete(id);
    const kind = extra.kind || p?.kind || 'run';
    const run = (chains.get(id) || Promise.resolve()).then(() => record(id, kind, extra));
    chains.set(id, run.catch(() => null));
    return run;
  }
  async function record(id, kind, extra) {
    const tm = T();
    if (!tm || (scrub && scrub.id === id && !extra.force)) return null;
    if (!extra.force && kind !== 'turn' && kind !== 'start' && window.LabTry?.holds?.(id)) return null; // (round 43) an edit tried first: Keep is its one version
    const e = await docOf(id);
    const t0 = performance.now();
    const st = tm.state(id);
    if (!st) return null;
    let v = null;
    if (!e.last) {
      v = C.add(e.doc, st, { kind: 'start', label: extra.label || 'Opened', by: 'you', mark: extra.mark });
    } else if (C.same(st, e.last)) {
      if (extra.mark) { const lv = C.latest(e.doc); if (lv) { lv.mark = extra.mark; saveSoon(id); emit(id, lv); } }
      stats.skipped += 1;
      return null;
    } else {
      const c = C.changes(e.last, st);
      const who = extra.actor || (extra.by ? { by: extra.by } : actorFor(id));
      // slider moves you didn't save or keep (a drag that rebuilt the scene) aren't a version on their own
      const valsOnly = !c.added.length && !c.removed.length && !c.code.length && !c.props.length && !c.order && !c.palette;
      if (valsOnly && who.by === 'you' && !['shuffle', 'sliders', 'restore', 'pick', 'turn', 'branch'].includes(kind) && !extra.force) { stats.skipped += 1; return null; }
      if (C.none(c) && !extra.force) { e.last = st; return null; }
      const label = extra.label || (who.by !== 'you' && who.tools?.size
        ? `${C.summary(c)}`.replace(/^./, (x) => x.toUpperCase())
        : C.label(kind, c));
      v = C.add(e.doc, st, { kind: who.by !== 'you' && kind !== 'restore' && kind !== 'pick' ? 'director' : kind, label, by: who.by, chat: who.chat, mark: extra.mark });
      if (who.tools) { v.tools = [...who.tools].slice(0, 6); who.tools.clear(); }
    }
    e.last = st;
    C.thin(e.doc);
    saveSoon(id);
    stats.captured += 1; stats.lastMs = Math.round((performance.now() - t0) * 10) / 10;
    emit(id, v);
    if (id === S()?.currentId() && !scrub) thumbSoon(id, v.id);
    return v;
  }
  const emit = (id, v) => dispatchEvent(new CustomEvent('hearth:tm', { detail: { id, version: v?.id || null } }));
  // any change waiting to be recorded, now
  async function flush(id = S()?.currentId()) { if (id && timers.has(id)) await capture(id); else if (id) await chains.get(id); return id ? docOf(id) : null; }
  // a scene opened: its first version (or what changed since the last one) once the Lab is idle
  addEventListener('hearth:sketch', (ev) => {
    const { id, from } = ev.detail || {};
    if (scrub && from === scrub.id && id !== scrub.id) leaveScrubbed(); // you switched scenes while scrubbing: it goes back
    if (!id) return;
    const go = () => { if (S()?.currentId() === id && !T()?.quiet) capture(id, { kind: 'start', label: undefined }).catch(() => {}); };
    setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 4000 }) : go()), 2500);
  });

  // ---------- director turns: a bookmark where each one starts ----------
  if (typeof Native !== 'undefined' && Native.hooks) {
    Native.hooks.send.push((agentId, chat, text) => {
      const a = H.agent?.(agentId);
      if (!chat?.id || !(a?.threeTools || a?.dock === 'three') || !T() || /^\s*\//.test(String(text || ''))) return;
      const id = sceneFor(chat.id);
      if (!id) return;
      const by = a.engine === 'codex' ? 'codex' : 'claude';
      capture(id, { kind: 'turn', mark: { by, chat: chat.id, at: Date.now(), text: String(text || '').replace(/\s+/g, ' ').slice(0, 80) } }).catch(() => {});
    });
  }
  // the director turns that changed this scene, newest first: [{ version (the bookmark: the state before), by, text, edits }]
  async function turns(id = S()?.currentId(), { by = null } = {}) {
    const e = await flush(id);
    if (!e) return [];
    const list = C.byTime(e.doc);
    const out = [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const v = list[i];
      if (!v.mark || (by && v.mark.by !== by)) continue;
      let edits = 0;
      // (the next bookmark can sit on this turn's last edit: the state the next turn started from)
      for (let j = i + 1; j < list.length; j += 1) { if (list[j].by === v.mark.by) edits += 1; if (list[j].mark) break; }
      if (edits) out.push({ version: v, by: v.mark.by, text: v.mark.text || '', at: v.mark.at || v.at, edits });
    }
    return out;
  }
  // back to before the director's last n turns (by: 'claude' | 'codex' for one of them)
  async function back(n = 1, { id = S()?.currentId(), by = null } = {}) {
    const t = await turns(id, { by });
    if (!t.length) throw new Error(`No ${by ? `${C.whoName(by)} ` : 'director '}edits to go back from on this scene yet.`);
    const to = t[Math.min(Math.max(1, n), t.length) - 1];
    const r = await restore(to.version.id, { id, label: `Back before ${C.whoName(to.by)}'s last ${Math.min(n, t.length) === 1 ? 'edit' : `${Math.min(n, t.length)} edits`}` });
    return { ...r, turns: Math.min(n, t.length), by: to.by };
  }

  // ---------- reading ----------
  async function list(id = S()?.currentId()) { const e = await flush(id); return e ? C.byTime(e.doc) : []; }
  async function stateOf(vid, id = S()?.currentId()) {
    if (vid === 'now') return T()?.state(id) || null;
    const e = await docOf(id);
    const v = e.doc.versions.find((x) => x.id === vid);
    return v ? C.stateOf(e.doc, v) : null;
  }
  // "n back" (1 = the one before the newest), a version id, or 'now'
  async function resolve(ref, id = S()?.currentId()) {
    const l = await list(id);
    if (ref === 'now' || ref == null || ref === '') return ref === 'now' ? 'now' : l.at(-1)?.id || null;
    if (/^\d+$/.test(String(ref))) return l[l.length - 1 - Number(ref)]?.id || null;
    return l.find((v) => v.id === ref)?.id || null;
  }
  async function changesBetween(a, b, id = S()?.currentId()) {
    const [sa, sb] = [await stateOf(a, id), await stateOf(b, id)];
    if (!sa || !sb) return null;
    const c = C.changes(sa, sb);
    const code = c.code.map((x) => ({ ...x, lines: C.codeDiff(sa.layers.find((L) => L.id === x.id)?.code, sb.layers.find((L) => L.id === x.id)?.code, { ctx: 2, max: 120 }) }));
    return { ...c, code, summary: C.summary(c, { max: 6 }) };
  }

  // ---------- pictures: tiny, made by the preview off its frames (the thumbnail channel), read only when shown ----------
  const thumbMem = new Map(); // scene id → { vid: dataUrl } (loaded)
  const pendingThumbs = new Map(); // scene id → { vid: dataUrl } (not written yet)
  let thumbT = 0;
  function thumbSoon(id, vid, { forScrub = false } = {}) {
    clearTimeout(thumbT);
    thumbT = setTimeout(() => {
      const go = async () => {
        if (S()?.currentId() !== id) return;
        if (forScrub ? scrub?.at !== vid : scrub) return;
        if (typeof ThreeSeq !== 'undefined' && ThreeSeq.active) return;
        const url = await ThreeLab.director?.shotSmall?.(THUMB).catch(() => null);
        if (!url || S()?.currentId() !== id || (forScrub ? scrub?.at !== vid : scrub)) return;
        putThumb(id, vid, url);
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2500 }); else go();
    }, forScrub ? 700 : 1600);
  }
  function putThumb(id, vid, url) {
    stats.thumbs += 1;
    if (thumbMem.has(id)) thumbMem.get(id)[vid] = url;
    (pendingThumbs.get(id) || pendingThumbs.set(id, {}).get(id))[vid] = url;
    dispatchEvent(new CustomEvent('hearth:tm-thumb', { detail: { id, version: vid, url } }));
    saveThumbsSoon(id);
  }
  const thumbSaveT = new Map();
  function saveThumbsSoon(id) {
    clearTimeout(thumbSaveT.get(id));
    thumbSaveT.set(id, setTimeout(async () => {
      thumbSaveT.delete(id);
      if (!okId(id)) return;
      const add = pendingThumbs.get(id) || {}; pendingThumbs.delete(id);
      const map = thumbMem.get(id) || { ...(await window.hub.kvGet(KVT(id), {}).catch(() => ({}))), ...add };
      const e = docs.get(id);
      if (e) { const ids = new Set(e.doc.versions.map((v) => v.id)); for (const k of Object.keys(map)) if (!ids.has(k)) delete map[k]; }
      window.hub.kvSet(KVT(id), map).catch(() => {});
    }, 3000));
  }
  async function thumbs(id = S()?.currentId()) {
    if (!thumbMem.has(id)) { const m = okId(id) ? await window.hub.kvGet(KVT(id), {}).catch(() => ({})) : {}; thumbMem.set(id, { ...(m || {}), ...(pendingThumbs.get(id) || {}) }); }
    // (round 34, lightweight) only the last few scenes' pictures stay in memory, like their histories (the rest are
    // read again from disk when shown; not-yet-written ones wait in pendingThumbs)
    const mine = thumbMem.get(id); thumbMem.delete(id); thumbMem.set(id, mine);
    for (const [k] of thumbMem) { if (thumbMem.size <= CACHE) break; if (k !== S()?.currentId()) thumbMem.delete(k); }
    return mine;
  }

  // ---------- scrubbing: a version on the preview, nothing saved until you keep it ----------
  let scrub = null; // { id, live (the state when scrubbing began), at (version id), shown }
  let inShow = false;
  function show(st) { inShow = true; try { T().show(st, { keep: false }); } finally { inShow = false; } }
  async function preview(vid, id = S()?.currentId()) {
    if (!T() || !id || id !== S()?.currentId()) throw new Error('Open that scene in the Lab first.');
    if (vid === 'now') { endScrub(false); return null; }
    await flush(id);
    const st = await stateOf(vid, id);
    if (!st) throw new Error('No such version.');
    if (!scrub || scrub.id !== id) { if (scrub) endScrub(false); scrub = { id, live: T().state(id), at: null, shown: null }; }
    scrub.at = vid; scrub.shown = st;
    show(st);
    const tm = await thumbs(id);
    if (!tm[vid]) thumbSoon(id, vid, { forScrub: true });
    dispatchEvent(new CustomEvent('hearth:tm-scrub', { detail: { id, version: vid } }));
    return st;
  }
  // back to what was on screen before scrubbing (keep: the version shown becomes the scene, as a restore)
  async function endScrub(keep = false) {
    if (!scrub) return null;
    const s = scrub;
    if (keep && s.at) { scrub = null; T().unquiet(); return restore(s.at, { id: s.id }); }
    scrub = null;
    if (S()?.currentId() === s.id) { show(s.live); T().unquiet(); T().persist(); }
    dispatchEvent(new CustomEvent('hearth:tm-scrub', { detail: { id: s.id, version: null } }));
    return null;
  }
  function leaveScrubbed() {
    const s = scrub; scrub = null; T()?.unquiet();
    const x = S()?.get(s.id);
    if (x) { x.layers = C.clone(s.live.layers); S().changed(s.id); }
    dispatchEvent(new CustomEvent('hearth:tm-scrub', { detail: { id: s.id, version: null } }));
  }
  // something changed the scene while a version showed: if it's more than the version's own re-run (you typed, moved a
  // layer…), that version is kept as the scene, with your change on top
  let touchT = 0;
  function scrubTouched() {
    clearTimeout(touchT);
    touchT = setTimeout(() => {
      if (!scrub) return;
      const now = T().state(scrub.id);
      const strip = (st) => JSON.stringify((st?.layers || []).map((L) => [L.id, L.code, L.opacity ?? 1, L.visible !== false, L.blend || 'normal', L.x || 0, L.y || 0, L.scale ?? 1, L.rotate || 0]));
      if (!now || strip(now) === strip(scrub.shown)) return;
      const s = scrub; scrub = null; T().unquiet();
      dispatchEvent(new CustomEvent('hearth:tm-scrub', { detail: { id: s.id, version: null, kept: s.at } }));
      capture(s.id, { kind: 'restore', by: 'you', force: true, label: 'Changed an earlier version (it became the scene)' }).catch(() => {});
      if (typeof toast === 'function') toast('You changed the version on screen: it is the scene now (the one before is in the time machine)', { timeout: 4000 });
    }, 300);
  }

  // ---------- restore, pick, branch ----------
  // the scene becomes `st` (on screen: in place; backstage: saved), recorded as a version; undo puts back the one before
  async function apply(id, st, { kind = 'restore', label = 'Restored', by = 'you' } = {}) {
    const sc = S();
    if (!sc?.get(id)) throw new Error('That scene is gone.');
    await flush(id);
    if (scrub) { if (scrub.id === id) { scrub = null; T().unquiet(); dispatchEvent(new CustomEvent('hearth:tm-scrub', { detail: { id, version: null } })); } else endScrub(false); }
    const e = await docOf(id);
    const before = C.latest(e.doc);
    as(id, by, 3000);
    if (id === sc.currentId()) T().show(st, { keep: true });
    else { const x = sc.get(id); x.layers = C.clone(st.layers); if (st.palette) x.palette = [...st.palette]; else delete x.palette; sc.changed(id); }
    const v = await capture(id, { kind, label, by, force: true });
    return { version: v, before: before?.id || null, undo: before ? () => apply(id, C.stateOf(e.doc, before), { kind: 'restore', label: `Undid: ${label}` }) : null };
  }
  // (round 29, safetynet) work that didn't reach the disk before Hearth closed unexpectedly: added as a version of its
  // scene WITHOUT putting it on screen (the scene stays as saved; the version is one click away); none when the newest
  // version already shows the same thing (a reload during the restore)
  async function keepVersion(id, st, { label = 'Recovered', at = Date.now() } = {}) {
    if (!okId(id) || !st?.layers?.length) return null;
    const e = await docOf(id);
    const lv = C.latest(e.doc);
    if (lv && C.same(C.stateOf(e.doc, lv), st)) return lv;
    const v = C.add(e.doc, C.clone(st), { kind: 'restore', label, by: 'you', at });
    saveSoon(id); emit(id, v);
    return v;
  }
  async function restore(vid, { id = S()?.currentId(), label = null } = {}) {
    const e = await docOf(id);
    const v = e.doc.versions.find((x) => x.id === vid);
    if (!v) throw new Error('No such version.');
    return apply(id, C.stateOf(e.doc, v), { kind: 'restore', label: label || `Restored “${v.label}” (${fmtWhen(v.at)})` });
  }
  async function pick(vid, what, { id = S()?.currentId(), layer = null } = {}) {
    const e = await docOf(id);
    const v = e.doc.versions.find((x) => x.id === vid);
    if (!v) throw new Error('No such version.');
    const from = C.stateOf(e.doc, v); const now = T().state(id);
    if (what === 'layer') { const r = C.pickLayer(now, from, layer); return apply(id, r.state, { kind: 'pick', label: `Picked the layer ${r.layer} from “${v.label}”` }); }
    const r = C.pickValues(now, from, { colors: what === 'colors' });
    if (!r.changed) throw new Error(what === 'colors' ? 'That version has the same colors.' : 'That version has the same slider values.');
    return apply(id, r.state, { kind: 'pick', label: `Picked the ${what === 'colors' ? 'colors' : 'slider values'} from “${v.label}”` });
  }
  // a new scene from a version (or from now): its song, frame size and looks come along; unsaved slider values are
  // written into its code
  async function branch(vid = null, { id = S()?.currentId(), name = null, open = true } = {}) {
    const sc = S();
    const src = sc?.get(id);
    if (!src) throw new Error('No scene.');
    const st = vid && vid !== 'now' ? await stateOf(vid, id) : T().state(id);
    if (!st) throw new Error('No such version.');
    const e = await docOf(id);
    const v = vid && vid !== 'now' ? e.doc.versions.find((x) => x.id === vid) : null;
    if (scrub?.id === id) await endScrub(false);
    const saved = C.pickValues(st, st).state;
    const copy = sc.duplicate(id, name || `${src.name} · branch`);
    copy.layers = C.clone(saved.layers);
    copy.code = copy.layers[0]?.code ?? copy.code;
    if (saved.palette) copy.palette = [...saved.palette]; else delete copy.palette;
    sc.changed(copy.id);
    await capture(copy.id, { kind: 'branch', by: 'you', force: true, label: `Branched from ${src.name}${v ? ` · “${v.label}”` : ''}` });
    if (open) sc.open(copy.id);
    return copy;
  }

  const fmtWhen = (t) => { const d = new Date(t); const today = new Date(); return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  addEventListener('beforeunload', () => { if (scrub) endScrub(false); });

  return {
    changed, director, as, capture, flush, list, stateOf, resolve, changesBetween, thumbs, turns, back,
    preview, endScrub, restore, pick, branch, fmtWhen, keepVersion, apply, // (round 52, chatkeep: apply puts work kept by safetynet back on screen)
    get scrubbing() { return scrub ? { id: scrub.id, version: scrub.at } : null; },
    // dev checks: sizes and counts
    stats: () => ({ ...stats, cached: docs.size }),
    async info(id = S()?.currentId()) { const e = await flush(id); return e ? { versions: e.doc.versions.length, keys: Object.keys(e.doc.keys).length, bytes: JSON.stringify(e.doc).length } : null; },
    thin: async (id = S()?.currentId(), now = Date.now()) => { const e = await flush(id); const n = C.thin(e.doc, now); if (n) { saveSoon(id); emit(id, null); } return n; },
    _doc: (id) => docs.get(id)?.doc || null,
  };
})();
window.ThreeHistory = ThreeHistory; // the Lab's hooks call it as window.ThreeHistory?.… (it loads after them)
