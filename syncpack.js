// (round 89, packs89) The pack lane (Phase 1 of docs/upgrades/bigsave88.md), main side. Created by syncmain.js only
// when Settings › Sync › "Send very long chats in pieces" is ON; with it off nothing here exists and the sync engine
// runs exactly as before (every hook in sync-engine.js is `PK?.…`). The byte work runs on the store's files thread
// (storework.js op syncPack → syncpack-core.js); in Node tests it runs in-process.
//
// What it does, for a chat of 16 MB or more, only while the gate is open (this computer's setting on AND every other
// computer's machine record says packs: 1):
//   · after each sync pass: takes the other computers' newer manifests from <cloud>/Hearth/packs/chats/<id>/ (only
//     when every piece is there and checks out; else "waiting", the chat stays as it is), merged three-way into this
//     computer's chat; then publishes this computer's chat there if it changed (the tail + a manifest: ≈ 1 MB, not 60)
//   · the engine's plan asks it about the chat's WHOLE cloud file (decide): held while the pieces carry the changes,
//     written as today once the chat is quiet (the computer that published it writes it), so an older Hearth that shows
//     up later finds a whole, slightly older chat, never a missing or empty one
//   · its own state: data/sync/packbase/ (state.json, this computer's last versions and the last version taken from each
//     other computer: the bases of later merges). Pieces no manifest names go to data/sync/packtrash/<day>/ (30 days).
// Nothing here is uploaded anywhere but the owner's own cloud folder; nothing secret is in a chat pack that isn't in the
// chat's whole cloud file already (the same bytes, in pieces).
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./syncpack-core');
const P = require('./chatpack-core');

const CHAT = /^chats\/([^/]+)\.json$/;
const ARRIVING_MAX = 30 * 60 * 1000; // a manifest whose pieces haven't come for this long no longer holds the whole file back
const TIDY_EVERY = 6 * 3600 * 1000;

function createPackLane(o = {}) {
  const now = o.now || (() => Date.now());
  const log = o.log || (() => {});
  const min = o.min ?? (Number(process.env.HEARTH_PACKS_MIN) || C.MIN);
  const quietMs = o.quietMs ?? (Number(process.env.HEARTH_PACKS_QUIET_MS) || C.QUIET_MS);
  const on = typeof o.on === 'function' ? o.on : () => o.on !== false;
  const S = require('./sync-merge');
  let api = null; // the engine's (attach)
  let st = null; let broken = ''; let gateNow = { ok: false, why: 'start' };
  const arriving = new Map(); // `${id}:${by}:${seq}` → since (this computer's clock)
  const stats = { published: 0, took: 0, bytesUp: 0, piecesUp: 0, whole: 0, waits: 0, lastWaiting: [] };
  const run = (kind, a) => (o.runOff ? o.runOff('syncPack', { kind, ...a }) : Promise.resolve().then(() => C.op(kind, fs, { ...a, S })));

  const D = () => {
    const cloud = api.cloudDir; const sdir = api.stateDir;
    return { packs: path.join(cloud, 'packs', 'chats'), machines: path.join(cloud, '.sync', 'machines'), base: path.join(sdir, 'packbase'), trash: path.join(sdir, 'packtrash'), deleted: path.join(sdir, 'trash'), recovery: path.join(sdir, 'recovery', 'chats'), file: path.join(sdir, 'packbase', 'state.json') };
  };
  // ---------- its state (a read failure is never "empty": an unreadable state leaves the lane shut, never rewritten) ----------
  function load() {
    if (st || broken) return Boolean(st);
    const r = require('./datasafe-core').load(fs, D().file, null, { prev: false });
    if (r.state === 'unreadable' || (r.value !== null && (typeof r.value !== 'object' || typeof r.value.chats !== 'object'))) { broken = r.code || 'unreadable'; log('packs: state unreadable, lane shut', broken); return false; }
    st = r.value || { v: 1, chats: {} };
    return true;
  }
  let dirty = false;
  function save() {
    if (!st || !dirty) return;
    try { require('./crashsafe-core').writeAtomicSync(fs, D().file, JSON.stringify(st)); dirty = false; } catch (err) { log('packs: state', err.message); }
  }
  const chatOf = (id) => (st.chats[id] ||= { seen: {}, last: {}, pub: null, known: [], had: false, self: [] });
  const know = (c, h) => { if (!C.isHash(h)) return; c.known = [h, ...c.known.filter((x) => x !== h)].slice(0, 32); dirty = true; };
  const me = () => P.safeBy(api.machineId());

  // ---------- the gate ----------
  let gateAt = 0;
  function gate() {
    gateAt = now();
    if (!on()) return (gateNow = { ok: false, why: 'off' });
    if (!api || !load()) return (gateNow = { ok: false, why: broken ? 'state' : 'start' });
    return (gateNow = C.gate(C.readRecords(fs, D().machines, api.machineId()), true));
  }

  // ---------- the engine's plan: a giant chat's whole cloud file this pass ----------
  async function plan({ rel, L, C: Ce, lh, ch, bh }) {
    const m = CHAT.exec(rel);
    if (!m || !api) return null;
    if (now() - gateAt > 5000 || now() < gateAt) gate(); // (once per pass or so: the other computer may have turned it off)
    if (!gateNow.ok || !st) return null;
    if (!L || L.unavailable || !(L.size >= min)) return null;
    const id = m[1]; const c = chatOf(id); // (a giant chat the lane hasn't met yet: it publishes it this very pass)
    const arr = new Set();
    for (const [k, since] of arriving) if (k.startsWith(`${id}:`) && now() - since < ARRIVING_MAX) arr.add(k.split(':')[3]);
    const v = C.decide({ lh, ch, bh, hasL: true, hasC: Boolean(Ce), size: L.size, min, quiet: now() - L.mtime, quietMs, author: !(c.taken || []).includes(lh) /* its own change or a merge: this computer writes the whole file; a copy of theirs: they do */, known: new Set(c.known), arriving: arr });
    if (v?.adopt) {
      const t = await versionText(id, v.adopt).catch(() => null);
      if (!t) return null; // (its bytes can't be had: the engine's own merge, from its own base)
      return { adopt: t, hold: v.hold };
    }
    if (!v && Ce && lh !== ch && ch === bh) stats.whole += 1; // (the whole file goes now: quiet)
    return v;
  }
  // a version this computer took in or published, as whole cloud-form bytes (its own manifest in the cloud, or a copy kept here)
  async function versionText(id, h) {
    const places = [path.join(D().packs, id), path.join(D().base, id)];
    for (const dir of places) {
      for (const x of (() => { try { return P.manifests(fs, dir); } catch { return []; } })()) {
        if (x.m?.wh !== h) continue;
        const r = await run('text', { dir, man: x.m });
        if (r?.buf && r.h === h) return r.buf;
      }
    }
    return null;
  }

  // ---------- after the engine's operations: take, then publish ----------
  async function pass({ local }) {
    const out = { waiting: [], took: 0, published: 0, touched: [] };
    gate();
    if (!gateNow.ok) { if (st) save(); return out; }
    const ids = new Set();
    for (const [rel, L] of local || []) { const m = CHAT.exec(rel); if (m && L && !L.unavailable && L.size >= min) ids.add(m[1]); }
    try { for (const d of fs.readdirSync(D().packs)) if (!d.startsWith('.') && !/[\\/]/.test(d)) ids.add(d); } catch { /* none yet */ }
    for (const id of ids) {
      try { await chat(id, local?.get(`chats/${id}.json`) || null, out); } catch (err) { log('packs', id, err.message); out.waiting.push({ rel: `chats/${id}.json`, why: 'pieces' }); }
    }
    save();
    stats.lastWaiting = out.waiting.slice(0, 10);
    return out;
  }

  async function chat(id, L, out) {
    const rel = `chats/${id}.json`; const D0 = D();
    const dir = path.join(D0.packs, id); const baseDir = path.join(D0.base, id);
    const file = api.localPathOf(rel); const ctx = api.ctx();
    const known = st.chats[id];
    // 1. what the other computers published: whole ones taken, the rest waiting (never a shorter chat)
    let ms = [];
    try { ms = P.manifests(fs, dir); } catch { out.waiting.push({ rel, why: 'pieces' }); return; }
    const c = chatOf(id);
    if (!known && ms.every((x) => x.by === me()) && !(L && L.size >= min)) { delete st.chats[id]; return; } // (nothing to do here)
    const fresh = [];
    for (const x of ms) {
      if (x.by === me()) continue;
      if (x.error) { out.waiting.push({ rel, why: 'pieces' }); continue; }
      if ((c.seen[x.by] || 0) >= x.m.seq) continue;
      const miss = x.m.segs.find((s) => { try { return fs.statSync(path.join(dir, `${s.h}.seg`)).size !== s.b; } catch { return true; } });
      const k = `${id}:${x.by}:${x.m.seq}:${x.m.wh || ''}`;
      if (!arriving.has(k)) arriving.set(k, now());
      if (miss) { out.waiting.push({ rel, why: 'pieces' }); stats.waits += 1; continue; }
      fresh.push(x);
    }
    fresh.sort((a, b) => (a.m.at || 0) - (b.m.at || 0));
    for (const x of fresh) {
      if (!L && c.had) continue; // (gone here: deleted by the owner, or moved away; the engine's own rules decide it)
      const b = x.m.took?.[me()] || 0; const last = c.last[x.by];
      // the base: the newest version both are known to have had (their last one I took, or my own one they took)
      let base = null; let keepAll = false;
      const mine = b && c.self.includes(b) ? { dir: baseDir, by: `self-${b}` } : null;
      const theirs = last ? { dir: baseDir, by: `peer-${x.by}` } : null;
      if (theirs && last.took >= b) base = theirs; else if (mine) base = mine; else if (theirs) { base = theirs; keepAll = true; }
      // a chat with no file here is taken as new only if this computer never had it (never re-made after a delete: the
      // engine's own rules decide those, from the trash copies) · conflicts: settled by themselves (Kept aside) unless
      // the owner turned that off, then listed for a choice as today (a conflict copy in the cloud folder)
      const allowNew = !c.had && !api.knows(rel) && !fs.existsSync(path.join(api.dataDir, 'trash', `${id}.json`));
      const confl = api.autoResolve() ? null : { dir: api.conflictsDir, cid: api.conflictId() };
      const r = await run('take', { file, ctx, dir, man: x.m, by: x.by, me: me(), base, keepAll, allowNew, confl, recovery: path.join(D0.recovery, `${id}.json`), trash: D0.deleted, now: now(), keepAs: { dir: baseDir, by: `peer-${x.by}` } });
      if (r?.gone) continue; // (deleted here meanwhile: the engine decides)
      if (!r || r.wait || r.stale) { out.waiting.push({ rel, why: 'pieces' }); stats.waits += 1; if (r?.wait) log('packs: wait', id, x.by, r.wait); continue; }
      if (r.out) {
        const ok = await api.casWrite(file, r.sig ? { size: r.sig.size, mtime: r.sig.mtime } : null, r.out);
        if (!ok) { out.waiting.push({ rel, why: 'pieces' }); continue; } // (changed here meanwhile: next pass)
        await api.afterLocalWrite(rel, r.lh); out.touched.push(rel);
        api.notePulled(rel, x.by);
        L = { size: r.out.length, mtime: 0 }; // (written: looked at again below)
      }
      if (r.confl) await api.conflict({ id: r.confl.cid, rel, copy: r.confl.copy, fields: r.conflicts || [], by: x.by, oursAt: r.sig?.mtime, theirsAt: x.m.at });
      if (r.lost?.trash) api.asideAdd({ rel, trash: r.lost.trash, why: 'auto', side: r.lost.side, kind: 'json', from: api.nameOf(x.by), fields: r.lost.fields || [] });
      c.seen[x.by] = x.m.seq; c.last[x.by] = { seq: x.m.seq, took: b }; c.had = true;
      know(c, x.m.wh); know(c, r.hm);
      if (r.hm === x.m.wh) c.taken = [r.hm, ...(c.taken || []).filter((h) => h !== r.hm)].slice(0, 16); // (this computer's chat IS theirs now: they write the whole file)
      for (const k of [...arriving.keys()]) if (k.startsWith(`${id}:${x.by}:`) && Number(k.split(':')[2]) <= x.m.seq) arriving.delete(k);
      out.took += 1; stats.took += 1; dirty = true;
    }
    // 2. this computer's chat, published when it changed (a giant chat here only)
    const st0 = (() => { try { return fs.statSync(file); } catch { return null; } })();
    if (!st0 || !(st0.size >= min)) return;
    c.had = true;
    const sig = `${st0.size}:${st0.mtimeMs}`;
    const mineM = ms.find((x) => x.by === me());
    const prev = mineM?.m || null;
    // (unchanged since last looked: only check that this computer's own pieces are all still there, now and then)
    let force = false;
    if (c.sig === sig) {
      if (!prev || now() - (c.checkedAt || 0) < 10 * 60000) return;
      c.checkedAt = now();
      force = prev.segs.some((s) => { try { return fs.statSync(path.join(dir, `${s.h}.seg`)).size !== s.b; } catch { return true; } });
      if (!force) return;
    }
    const skips = [c.pub?.wh, ...Object.keys(c.last).map((by) => ms.find((x) => x.by === by)?.m?.wh)].filter(Boolean);
    const seq = Math.max(c.pub?.seq || 0, prev?.seq || 0) + 1;
    const r = await run('publish', { file, ctx, dir, id, by: me(), took: { ...c.seen }, prev, seq, skips: force ? [] : skips, force, baseDir, cut: o.cut });
    if (!r || r.stale || r.bad || r.gone) { if (r?.bad) log('packs: chat not laid out as expected', id); return; }
    c.sig = `${r.sig.size}:${r.sig.mtime}`; dirty = true;
    if (r.same) { know(c, r.h); return; }
    c.pub = { seq: r.m.seq, wh: r.h, at: now() }; c.checkedAt = now(); know(c, r.h);
    c.self = [r.m.seq, ...c.self.filter((s) => s !== r.m.seq)].slice(0, 4);
    out.published += 1; stats.published += 1; stats.bytesUp += (r.wrote || 0) + (r.manifestBytes || 0); stats.piecesUp += (r.pieces || 0) + 1;
    try { C.trimSelf(fs, baseDir, 4, D0.trash, now()); } catch { /* next time */ }
    // 3. now and then: pieces no manifest names → this computer's pack trash (30 days)
    if (now() - (c.tidyAt || 0) > TIDY_EVERY) {
      c.tidyAt = now();
      run('tidy', { dirs: [dir, baseDir], grace: 24 * 3600e3, now: now(), trash: D0.trash }).catch(() => {});
    }
  }

  return {
    attach: (a) => { api = a; return true; },
    record: () => (on() ? { packs: C.PACKS_V } : {}), // the machine record: "this computer reads packs"
    plan, pass,
    status: () => ({ on: on(), gate: { ...gateNow }, broken, min, quietMs, ...stats, lastWaiting: stats.lastWaiting.slice() }),
    _state: () => st,
  };
}

module.exports = { createPackLane };
