// 🕘 Earlier versions, main side (round 75, versions75): finds every older version of one chat / project / Lab scene /
// board / the settings in the safety copies Hearth already keeps, and restores one without ever losing the version in
// place. Nothing here copies anything new in the background: it only looks when the window asks (on a click).
//   Where it looks (versions-core.js gathers them into one timeline, one entry per distinct content):
//     · data/.versions/<kind>-<id>/          what a restore replaced (written here, this computer only: the Undo)
//     · <store>.prev.json, .history copies   the save before the last one, the automatic copies (datasafe / scenesafe)
//     · data/sync/base/<rel>(.prev)          the last version both computers had (sync's base) and the one before it
//     · data/sync/trash/<day>/…              what sync set aside on this computer (a conflict choice, a delete from the other)
//     · <cloud>/Hearth/files/<rel>           what the cloud folder holds now (on its way from the other computer)
//     · <cloud>/Hearth/trash/<day>/…         sync's Deleted files (both computers), resolved conflicts' copies
//     · <cloud>/Hearth/.sync/conflicts/…     an open conflict's other version (which computer it came from)
//     · "Keep both" copies                   chats / scenes / projects named "… (from Mac)" (the window passes their ids)
//     · backups (phase 'backups')            the newest checked backup zips, one file read out of each
//   The cloud provider's own version history (iCloud "Browse all versions", OneDrive's version history) isn't reachable
//   without the provider's app or web page: not looked at.
//   restore(subject, token)   the version in place now is kept first (data/.versions/…: listed as "kept before a
//                             restore", the Undo); then the restored thing is saved through the store like any edit,
//                             stamped now, so sync sends it to the other computer as an ordinary change (merged there
//                             with whatever the other computer changed meanwhile)
//   deleted() / undelete(key) Deleted things: chats (Recently deleted, sync's set-asides), projects, Lab scenes, boards
//   IPC (lazy, versions.js): versions:list · versions:read · versions:keep · versions:restore · versions:deleted · versions:undelete
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const C = require('./versions-core');
const SS = require('./scenesafe-core');
let SM = null; const merge = () => (SM ||= require('./sync-merge'));

const MAX_BYTES = 64 * 1024 * 1024; // bigger files aren't versions anyone reads here
// (round 82, bigchat82) a chat this big is listed from DIGESTS made on the files thread (o.digest: bigchat-core.js), never
// parsed here: three copies of a 60 MB chat held the main process ≈ 7 s
const BIG_CHAT = Number(process.env.HEARTH_BIGCHAT_MIN) || 8 * 1024 * 1024;
const KEEP_BEFORE = 20; // versions kept before restores, per thing
const BACKUPS = 12; // newest backup zips looked into
const hereWord = (p = process.platform) => (p === 'darwin' ? 'this Mac' : p === 'win32' ? 'this PC' : 'this computer');
const rand = () => crypto.randomBytes(6).toString('hex');
const fromTitle = (t) => /\(from ([^()]{1,40})\)\s*$/.exec(String(t || ''))?.[1] || '';

// o: { dataDir, configPath, stateDir, cloudDir(), ctx(), conflicts(), incoming(rel), backups(), here, now(),
//      readChat(id), writeChat(chat), readKV(name) → { state, value }, writeKV(name, value), readConfig(), saveConfig(cfg),
//      restoreChat(id) (data/trash → chats), syncRestore(id) (sync's Deleted files) }
function create(o = {}) {
  const now = () => (o.now ? o.now() : Date.now());
  const here = o.here || hereWord();
  const cloudDir = () => { try { return (typeof o.cloudDir === 'function' ? o.cloudDir() : o.cloudDir) || null; } catch { return null; } };
  const ctx = () => { try { return (typeof o.ctx === 'function' ? o.ctx() : o.ctx) || null; } catch { return null; } };
  const stateDir = o.stateDir || path.join(o.dataDir, 'sync');
  const fileOf = (rel) => (rel === 'config.json' ? o.configPath : path.join(o.dataDir, ...rel.split('/')));
  const cloudRel = (rel) => (rel === 'config.json' ? 'app/config.json' : rel);
  const subj = (s) => {
    const kind = String(s?.kind || ''); const id = kind === 'settings' ? 'config' : String(s?.id || '');
    if (!C.okId(kind, id)) throw new Error('Not something with versions.');
    return { kind, id, rel: C.KINDS[kind].rel(id), also: (Array.isArray(s.also) ? s.also : []).filter((x) => typeof x === 'string' && /^[\w-]{1,80}$/.test(x) && x !== id).slice(0, 8) };
  };

  // ---------- reading ----------
  async function readJson(file) {
    const st = await fsp.stat(file).catch(() => null);
    if (!st || !st.isFile() || st.size > MAX_BYTES || st.size === 0) return null;
    try { return { v: merge().parseJson(await fsp.readFile(file, 'utf8')), st }; } catch { return null; }
  }
  const local = (v, cloudForm) => { if (!cloudForm) return v; const c = ctx(); try { return c ? merge().fromCloud(v, c) : v; } catch { return v; } };
  // tokens: what the window may ask to read again (never a path from the window)
  const tokens = new Map();
  function tok(t) {
    const k = rand(); tokens.set(k, t);
    if (tokens.size > 4000) for (const x of [...tokens.keys()].slice(0, 1000)) tokens.delete(x);
    return k;
  }
  async function readTok(k) {
    const t = tokens.get(String(k || ''));
    if (!t) return null;
    if (t.value) return t.value;
    let v = null;
    if (t.zip) v = await fromZip(t.zip, t.member);
    else { const r = await readJson(t.file); v = r ? local(r.v, t.cloud) : null; }
    if (v && t.wrapped) v = v.thing;
    return v ? C.KINDS[t.kind].pick(v, t.pick) : null;
  }

  // ---------- the places ----------
  async function days(root) { try { return (await fsp.readdir(root)).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort().reverse().slice(0, 40); } catch { return []; } }
  // a file kept under its name, or with a random prefix ("1a2b3c4d-name.json") when the name was taken that day
  async function namesIn(dir, base) {
    let ns = []; try { ns = await fsp.readdir(dir); } catch { return []; }
    return ns.filter((n) => n === base || (n.endsWith(`-${base}`) && /^[0-9a-f]{8}-/.test(n))).map((n) => path.join(dir, n));
  }
  const copiesDir = (S, rel) => {
    if (rel === 'config.json') return path.join(o.dataDir, '.history', 'config');
    const m = /^kv\/([\w-]+)\.json$/.exec(rel);
    return m ? path.join(o.dataDir, 'kv', '.history', m[1]) : null;
  };
  const beforeDir = (S) => path.join(o.dataDir, '.versions', `${S.kind}-${S.id}`);

  async function candidates(S, phase, looked, big = false) {
    const out = [];
    const add = async (file, t) => {
      if (big) { // (round 82) a giant chat's copy: its digest, from the files thread
        const st = await fsp.stat(file).catch(() => null);
        if (!st || !st.isFile() || st.size > MAX_BYTES || st.size === 0) return;
        const dg = await o.digest({ file, ctx: t.cloud ? ctx() : null, wrapped: Boolean(t.wrapped) }).catch(() => null);
        if (dg) out.push({ token: tok({ file, cloud: t.cloud, wrapped: t.wrapped, kind: S.kind, pick: t.pick || S.id }), src: t.src, label: t.label, at: t.at || st.mtimeMs, machine: t.machine, value: dg, key: dg.key, ...(t.note ? { note: t.note } : {}) });
        return;
      }
      const r = await readJson(file);
      if (!r) return;
      let v = local(r.v, t.cloud);
      if (t.wrapped) v = v?.thing;
      const thing = C.KINDS[S.kind].pick(v, t.pick || S.id);
      if (!thing) return;
      out.push({ token: tok({ file, cloud: t.cloud, wrapped: t.wrapped, kind: S.kind, pick: t.pick || S.id }), src: t.src, label: t.label, at: t.at || r.st.mtimeMs, machine: t.machine, value: thing, ...(t.note ? { note: t.note } : {}) });
    };
    const file = fileOf(S.rel); const crel = cloudRel(S.rel);
    if (phase !== 'backups') {
      // what restores replaced (this computer)
      let ns = []; try { ns = await fsp.readdir(beforeDir(S)); } catch { /* none */ }
      for (const n of ns) { const c = SS.parseCopy(n); if (c) await add(path.join(beforeDir(S), n), { src: 'before', label: C.SRC_WORDS.before, at: c.at, machine: here, wrapped: true }); }
      looked.push('restores');
      // the save before the last one, the automatic copies
      if (S.kind !== 'chat') { await add(file.replace(/\.json$/, '.prev.json'), { src: 'prev', label: C.SRC_WORDS.prev, machine: here }); looked.push('the last save'); }
      const cd = copiesDir(S, S.rel);
      if (cd) {
        let cs = []; try { cs = (await fsp.readdir(cd)).map(SS.parseCopy).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 30); } catch { /* none */ }
        for (const c of cs) await add(path.join(cd, c.name), { src: 'copy', label: C.SRC_WORDS.copy, at: c.at, machine: here });
        looked.push('automatic copies');
      }
      // a deleted chat's copy in Recently deleted (both computers have it: data/trash syncs)
      if (S.kind === 'chat') await add(path.join(o.dataDir, 'trash', `${S.id}.json`), { src: 'trash', label: 'Recently deleted', machine: here });
      // sync: the base and the one before it, what it set aside here
      const base = path.join(stateDir, 'base', ...crel.split('/'));
      await add(base, { src: 'base', label: C.SRC_WORDS.base, cloud: true, machine: 'both computers' });
      await add(`${base}.prev`, { src: 'base', label: 'synced version before that', cloud: true, machine: 'both computers' });
      for (const d of await days(path.join(stateDir, 'trash'))) for (const f of await namesIn(path.join(stateDir, 'trash', d, ...crel.split('/').slice(0, -1)), path.basename(crel))) await add(f, { src: 'trash', label: C.SRC_WORDS.trash, machine: here });
      looked.push('sync');
      const cl = cloudDir();
      if (cl) {
        const inc = o.incoming?.(crel) || null;
        await add(path.join(cl, 'files', ...crel.split('/')), { src: 'cloud', label: inc?.from ? `on its way from ${inc.from}` : C.SRC_WORDS.cloud, cloud: true, machine: inc?.from || 'the cloud folder' });
        for (const d of await days(path.join(cl, 'trash'))) {
          for (const f of await namesIn(path.join(cl, 'trash', d, ...crel.split('/').slice(0, -1)), path.basename(crel))) await add(f, { src: 'cloudtrash', label: C.SRC_WORDS.cloudtrash, cloud: true, machine: 'either computer' });
          // resolved conflicts: the record says which file and which computer
          let cs = []; try { cs = (await fsp.readdir(path.join(cl, 'trash', d, 'conflicts'))).filter((n) => /^\d{4}-\d\d-\d\d-[0-9a-f]{8}\.json$/.test(n)); } catch { /* none */ }
          for (const n of cs) {
            const r = await readJson(path.join(cl, 'trash', d, 'conflicts', n));
            if (r?.v?.rel === crel && r.v.copy) await add(path.join(cl, 'trash', d, 'conflicts', r.v.copy), { src: 'conflict', label: 'conflict copy (settled)', cloud: true, at: r.v.theirsAt || r.v.at, machine: r.v.from || 'the other computer' });
          }
        }
        const recs = await Promise.resolve(o.conflicts?.()).catch(() => []) || [];
        for (const rec of recs) if (rec?.rel === crel && rec.copy) await add(path.join(cl, '.sync', 'conflicts', rec.copy), { src: 'conflict', label: 'conflict: the other version', cloud: true, at: rec.theirsAt || rec.at, machine: rec.from || 'the other computer' });
        looked.push('the cloud folder');
      }
      // "Keep both" copies (the window found them by their names)
      for (const sid of S.also) {
        if (S.kind === 'chat' && big) { const f = fileOf(`chats/${sid}.json`); const dg = await o.digest({ file: f, ctx: null }).catch(() => null); const st = await fsp.stat(f).catch(() => null); if (dg && st) out.push({ token: tok({ file: f, kind: 'chat', pick: sid }), src: 'keepboth', label: `“Keep both” copy: ${C.KINDS.chat.name(dg)}`, at: st.mtimeMs, machine: fromTitle(dg.title) || 'the other computer', value: dg, key: dg.key }); } else if (S.kind === 'chat') { const r = await readJson(fileOf(`chats/${sid}.json`)); if (r?.v) out.push({ token: tok({ value: r.v, kind: 'chat', pick: sid }), src: 'keepboth', label: `“Keep both” copy: ${C.KINDS.chat.name(r.v)}`, at: r.st.mtimeMs, machine: fromTitle(r.v.title) || 'the other computer', value: r.v }); } else if (S.kind === 'scene' || S.kind === 'project') {
          const store = await readStore(S.kind).catch(() => null);
          const x = store && C.KINDS[S.kind].pick(store, sid);
          if (x) out.push({ token: tok({ value: x, kind: S.kind, pick: sid }), src: 'keepboth', label: `“Keep both” copy: ${C.KINDS[S.kind].name(x)}`, at: C.KINDS[S.kind].time(x), machine: fromTitle(x.name) || 'the other computer', value: x });
        }
      }
    }
    if (phase !== 'local' && o.backups) {
      let list = []; try { list = (await o.backups()) || []; } catch { list = []; }
      const member = S.rel === 'config.json' ? 'config.json' : `data/${S.rel}`;
      const t0 = Date.now();
      for (const b of list.filter((x) => x && x.ok !== false && x.path).slice(0, BACKUPS)) {
        if (Date.now() - t0 > 8000) break; // a slow disk: the newest ones are enough
        if (big) { const dg = await fromZip(b.path, member, true).catch(() => null); if (dg) out.push({ token: tok({ zip: b.path, member, kind: S.kind, pick: S.id }), src: 'backup', label: `${C.SRC_WORDS.backup}${b.reason === 'update' ? ' (before an update)' : ''}`, at: b.at, machine: b.mine === false && b.computer ? b.computer : here, value: dg, key: dg.key }); continue; }
        const v = await fromZip(b.path, member).catch(() => null);
        const thing = v && C.KINDS[S.kind].pick(v, S.id);
        if (thing) out.push({ token: tok({ zip: b.path, member, kind: S.kind, pick: S.id }), src: 'backup', label: `${C.SRC_WORDS.backup}${b.reason === 'update' ? ' (before an update)' : ''}`, at: b.at, machine: b.mine === false && b.computer ? b.computer : here, value: thing });
      }
      looked.push('backups');
    }
    return out;
  }
  // one file out of a backup zip (read through a temporary folder, removed after)
  async function fromZip(zip, member, digest = false) {
    const Zip = require('./zipkit');
    const ents = await Zip.entries(zip);
    const e = ents.find((x) => !x.dir && x.name.replace(/^(\.\/)+/, '') === member);
    if (!e || e.size > MAX_BYTES) return null;
    const dest = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-versions-'));
    try {
      await Zip.extract(zip, dest, { members: [e.name] });
      if (digest) return await o.digest({ file: path.join(dest, ...e.name.split('/')), ctx: null }); // (round 82) a giant chat: its digest
      return merge().parseJson(await fsp.readFile(path.join(dest, ...e.name.split('/')), 'utf8'));
    } catch { return null; } finally { fsp.rm(dest, { recursive: true, force: true }).catch(() => {}); }
  }

  // ---------- what is there now (through the store: a save on its way counts) ----------
  const storeName = (kind) => (kind === 'project' ? 'projects' : kind === 'scene' ? 'three-sketches' : null);
  async function readKV(name) {
    if (o.readKV) return o.readKV(name);
    return SS.readStatus(fs, path.join(o.dataDir, 'kv', `${name}.json`));
  }
  async function readStore(kind) {
    const r = await readKV(storeName(kind));
    if (r?.state === 'ok') return r.value;
    if (r?.state === 'missing') return null;
    const e = new Error('That list can\'t be read just now (another program may be holding it). Nothing was changed; try again in a moment.'); e.code = 'EHELD'; throw e;
  }
  async function current(S) {
    if (S.kind === 'chat') {
      const f = fileOf(S.rel);
      if (o.readChat) { const v = await o.readChat(S.id); if (v) return v; } else { const r = await readJson(f); if (r) return r.v; }
      if (fs.existsSync(f)) { const e = new Error('This chat can\'t be read just now. Nothing was changed; try again in a moment.'); e.code = 'EHELD'; throw e; }
      return null;
    }
    if (S.kind === 'board') { const r = await readKV(`board-${S.id}`); if (r?.state === 'unreadable') { const e = new Error('This board can\'t be read just now. Nothing was changed.'); e.code = 'EHELD'; throw e; } return r?.state === 'ok' ? C.KINDS.board.pick(r.value) : null; }
    if (S.kind === 'settings') { const v = o.readConfig ? await o.readConfig() : (await readJson(o.configPath))?.v; if (!v) { const e = new Error('Settings can\'t be read just now. Nothing was changed.'); e.code = 'EHELD'; throw e; } return v; }
    return C.KINDS[S.kind].pick(await readStore(S.kind), S.id);
  }

  // ---------- the timeline ----------
  // (round 82, bigchat82) a giant chat (it, or its Recently deleted copy, or sync's base, is that big): listed from digests
  async function bigChat(S) {
    if (S.kind !== 'chat' || !o.digest) return false;
    for (const f of [fileOf(S.rel), path.join(o.dataDir, 'trash', `${S.id}.json`), path.join(stateDir, 'base', ...cloudRel(S.rel).split('/'))]) { const st = await fsp.stat(f).catch(() => null); if (st && st.size >= BIG_CHAT) return true; }
    return false;
  }
  async function currentDigest(S) {
    await o.chatIdle?.(); // (its changes on their way land first)
    const f = fileOf(S.rel);
    if (!fs.existsSync(f)) return null;
    const dg = await o.digest({ file: f, ctx: null });
    if (!dg) { const e = new Error('This chat can\'t be read just now. Nothing was changed; try again in a moment.'); e.code = 'EHELD'; throw e; }
    return dg;
  }
  async function list(s, { phase = 'local' } = {}) {
    const S = subj(s);
    const looked = [];
    const big = await bigChat(S);
    const cur = await (big ? currentDigest(S) : current(S)).catch((err) => ({ __error: err.message }));
    const curOk = cur && !cur.__error ? cur : null;
    const cands = await candidates(S, phase, looked, big);
    const r = C.gather(S.kind, cands, curOk, { withSame: true });
    return { kind: S.kind, id: S.id, phase, name: curOk ? C.KINDS[S.kind].name(curOk) : (r.list[0]?.name || ''), exists: Boolean(curOk), error: cur?.__error || null, versions: r.list.slice(0, 200), same: r.same, looked, here };
  }
  // (round 82, bigchat82) a giant chat's version for the window (Preview, Restore): its bytes in this computer's form,
  // made on the files thread ({ __chatBytes }: the window parses them); never parsed here
  async function read(token) {
    const t = tokens.get(String(token || ''));
    if (t && t.kind === 'chat' && t.file && !t.zip && o.chatBytes) {
      const st = await fsp.stat(t.file).catch(() => null);
      if (st && st.size >= BIG_CHAT && st.size <= MAX_BYTES) { const r = await o.chatBytes({ file: t.file, ctx: t.cloud ? ctx() : null, wrapped: Boolean(t.wrapped) }).catch(() => null); if (r?.bytes) return { __chatBytes: r.bytes }; }
    }
    return readTok(token);
  }

  // ---------- keeping the version in place, restoring ----------
  async function keep(s, thing, { why = 'before' } = {}) {
    const S = subj(s);
    if (!thing || typeof thing !== 'object') return null;
    const dir = beforeDir(S);
    await fsp.mkdir(dir, { recursive: true });
    const at = now();
    let name = SS.copyName(at, 0, why === 'before' ? 'before' : 'kept');
    if (fs.existsSync(path.join(dir, name))) name = SS.copyName(at + 1000, 0, 'before');
    const f = path.join(dir, name); const tmp = `${f}.${rand()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ v: 1, kind: S.kind, id: S.id, at, machine: here, thing }));
    await fsp.rename(tmp, f);
    // the newest 20 stay
    try { const all = (await fsp.readdir(dir)).map(SS.parseCopy).filter(Boolean).sort((a, b) => b.at - a.at); for (const c of all.slice(KEEP_BEFORE)) await fsp.rm(path.join(dir, c.name), { force: true }); } catch { /* fine */ }
    return tok({ file: f, wrapped: true, kind: S.kind, pick: S.id });
  }
  async function atomic(file, text) { await fsp.mkdir(path.dirname(file), { recursive: true }); const t = `${file}.${rand()}.tmp`; await fsp.writeFile(t, text); await fsp.rename(t, file); }
  async function writeKV(name, value) {
    if (o.writeKV) { const r = await o.writeKV(name, value); if (r?.error) throw new Error(r.error); return; }
    const f = path.join(o.dataDir, 'kv', `${name}.json`);
    try { await fsp.copyFile(f, f.replace(/\.json$/, '.prev.json')); } catch { /* new */ }
    await atomic(f, JSON.stringify(value, null, 2));
  }
  // restore: the thing in place now is kept first (no keep, no restore), then the version goes in through the store
  // o.over: an Undo — the thing as the restore left it: only what the restore changed is taken back (merged onto the
  // thing as it is now), so what arrived from the other computer since stays
  async function restore(s, token, o2 = {}) {
    const S = subj(s);
    const big = await restoreBig(S, tokens.get(String(token || '')), o2); // (round 84, bigchat84)
    if (big) return big;
    if (o2.over?.__bigOver) o2 = { ...o2, over: null }; // (a giant chat's Undo that can't go that way: the version as it was)
    const thing = await readTok(token);
    if (!thing) return { ok: false, error: 'That version isn\'t there any more (open the list again).' };
    const cur = await current(S);
    const before = cur ? await keep(S, cur) : null;
    const next = C.restoreValue(S.kind, undoOnto(S.kind, o2.over, thing, cur), cur, now());
    if (S.kind === 'chat') {
      if (o.writeChat) await o.writeChat(next); else await atomic(fileOf(S.rel), JSON.stringify(next, null, 2));
    } else if (S.kind === 'board') await writeKV(`board-${S.id}`, next);
    else if (S.kind === 'settings') {
      // only what syncs: this computer's own paths, keys and window stay as they are
      const M = merge();
      const v = M.applyPortable(cur, M.portableConfig(next));
      if (o.saveConfig) { const r = await o.saveConfig(v); if (r && r.ok === false) throw new Error(r.error || 'Settings weren\'t saved.'); } else await atomic(o.configPath, JSON.stringify(v, null, 2));
    } else {
      const store = await readStore(S.kind);
      await writeKV(storeName(S.kind), C.putInto(S.kind, store, S.id, next));
    }
    return { ok: true, kind: S.kind, id: S.id, before, name: C.KINDS[S.kind].name(next), value: S.kind === 'settings' ? null : next };
  }

  // (round 84, bigchat84) a GIANT chat (the version or the chat ≥ BIG_CHAT) restored on the store thread (o.chatRestore:
  // storework.js chatRestore): read, kept first, written there; the main process only names the files (it held seconds
  // parsing both, keeping, cloning and sending 60 MB to the window). The window gets no copy back: { __bigOver } stands
  // for the chat as the restore left it (its Undo is made again from the same files on the thread). null: the usual way
  async function restoreBig(S, t, o2) {
    if (S.kind !== 'chat' || !o.chatRestore || !t || t.value || t.del || !(t.file || t.zip)) return null;
    let tmp = null; let file = t.file;
    try {
      if (t.zip) { // one file out of a backup zip (as fromZip), into a temporary folder removed after
        const Zip = require('./zipkit');
        const e = (await Zip.entries(t.zip)).find((x) => !x.dir && x.name.replace(/^(\.\/)+/, '') === t.member);
        if (!e || e.size > MAX_BYTES) return null;
        tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hearth-versions-'));
        await Zip.extract(t.zip, tmp, { members: [e.name] });
        file = path.join(tmp, ...e.name.split('/'));
      }
      const size = async (f) => (await fsp.stat(f).catch(() => null))?.size || 0;
      if ((await size(file)) < BIG_CHAT && (await size(fileOf(S.rel))) < BIG_CHAT) return null;
      const src = { file, ctx: t.cloud ? ctx() : null, wrapped: Boolean(t.wrapped) };
      const dir = beforeDir(S); await fsp.mkdir(dir, { recursive: true });
      const at = now();
      let name = SS.copyName(at, 0, 'before');
      if (fs.existsSync(path.join(dir, name))) name = SS.copyName(at + 1000, 0, 'before');
      const keepFile = path.join(dir, name);
      const ov = o2?.over?.__bigOver ? tokens.get(String(o2.over.__bigOver))?.overSpec || null : null;
      const r = await o.chatRestore({ id: S.id, src, keep: { file: keepFile, id: S.id, machine: here }, at, over: ov });
      if (!r) return null;
      if (!r.ok) return { ok: false, error: r.error || 'Not restored.', code: r.code || null };
      try { const all = (await fsp.readdir(dir)).map(SS.parseCopy).filter(Boolean).sort((a, b) => b.at - a.at); for (const c of all.slice(KEEP_BEFORE)) await fsp.rm(path.join(dir, c.name), { force: true }); } catch { /* fine */ }
      const before = r.kept ? tok({ file: keepFile, wrapped: true, kind: S.kind, pick: S.id }) : null;
      const overKey = before && !tmp ? tok({ overSpec: { src, before: keepFile, at } }) : null; // (a backup's copy is gone after: its Undo is the version as it was)
      return { ok: true, kind: S.kind, id: S.id, before, name: r.title || 'Chat', value: overKey ? { __bigOver: overKey } : null, big: true };
    } finally { if (tmp) fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }

  // the change from `over` (as a restore left it) to `target` (what it replaced), put onto `cur` (three-way, lists by id)
  function undoOnto(kind, over, target, cur) {
    if (!over || typeof over !== 'object' || !cur || kind === 'settings') return target;
    try { const v = merge().merge3(JSON.parse(JSON.stringify(over)), JSON.parse(JSON.stringify(target)), JSON.parse(JSON.stringify(cur))).value; return v && typeof v === 'object' ? v : target; } catch { return target; }
  }

  // ---------- Deleted things ----------
  // (round 84, bigchat84) a chat's title / AI / count for the list: a giant one from its own fields (o.chatHead: cut on
  // the files thread), never parsed here (0.7 s of the main process per 60 MB chat each time the list opened)
  async function readMeta(file) {
    const st = file && o.chatHead ? await fsp.stat(file).catch(() => null) : null;
    if (st && st.isFile() && st.size >= BIG_CHAT && st.size <= MAX_BYTES) {
      const h = await o.chatHead(file).catch(() => null);
      if (h?.head && h.messages) return { v: { ...h.head, messages: new Array(h.n) }, st }; // (only its count is read)
      if (h?.error) return null;
    }
    return readJson(file);
  }
  async function deleted() {
    const out = { chats: [], projects: [], scenes: [], boards: [] };
    const seen = new Set();
    const chatHere = (id) => fs.existsSync(path.join(o.dataDir, 'chats', `${id}.json`));
    // chats: Recently deleted (30 days), then what sync set aside / its Deleted files
    let ns = []; try { ns = (await fsp.readdir(path.join(o.dataDir, 'trash'))).filter((n) => /^[\w-]{1,80}\.json$/.test(n)); } catch { /* none */ }
    for (const n of ns) {
      const id = n.slice(0, -5);
      const r = await readMeta(path.join(o.dataDir, 'trash', n));
      if (!r?.v || chatHere(id) || seen.has(id)) continue;
      seen.add(id);
      out.chats.push({ key: tok({ del: 'chat-trash', id }), id, name: r.v.title || 'Chat', at: r.st.mtimeMs, n: (r.v.messages || []).length, agentId: r.v.agentId || null, where: 'Recently deleted', machine: here });
    }
    const syncTrash = await Promise.resolve(o.syncTrash?.()).catch(() => []) || [];
    for (const t of syncTrash) {
      const m = /^chats\/([\w-]{1,80})\.json$/.exec(t.rel || '');
      if (!m || chatHere(m[1]) || seen.has(m[1])) continue;
      seen.add(m[1]);
      const where = /^(cloud|here):(\d{4}-\d\d-\d\d)\/(.+)$/.exec(String(t.id || ''));
      const cl = cloudDir();
      const r = where ? await readMeta(where[1] === 'cloud' ? (cl ? path.join(cl, 'trash', where[2], ...where[3].split('/')) : '') : path.join(stateDir, 'trash', where[2], ...where[3].split('/'))) : null;
      out.chats.push({ key: tok({ del: 'chat-sync', id: m[1], syncId: t.id }), id: m[1], name: r?.v?.title || t.title || m[1], at: r?.st?.mtimeMs || Date.parse(t.day) || 0, n: Array.isArray(r?.v?.messages) ? r.v.messages.length : null, where: t.where === 'cloud' ? 'sync\'s Deleted files' : 'set aside by sync', machine: t.where === 'cloud' ? 'either computer' : here });
    }
    // projects: Recently deleted projects (kept in the synced projects list)
    try {
      const p = await readStore('project');
      const live = new Set((p?.list || []).map((x) => x?.id));
      for (const x of (p?.trash || [])) if (x?.id && !live.has(x.id)) out.projects.push({ key: tok({ del: 'project', id: x.id }), id: x.id, name: x.name || 'Project', at: x.deletedAt || 0, n: (x.items || []).length, where: 'Recently deleted projects', machine: 'both computers' });
    } catch { /* not readable now: none listed */ }
    // Lab scenes: History's deleted sketches
    try {
      const live = new Set(((await readStore('scene')) || []).map((x) => x?.id));
      const h = await readKV('three-history');
      const seenS = new Set();
      for (const x of (h?.state === 'ok' && Array.isArray(h.value?.trash) ? h.value.trash : []).slice().sort((a, b) => (b?.deletedAt || 0) - (a?.deletedAt || 0))) {
        if (!x?.id || live.has(x.id) || seenS.has(x.id)) continue;
        seenS.add(x.id);
        out.scenes.push({ key: tok({ del: 'scene', id: x.id, at: x.deletedAt }), id: x.id, name: x.name || 'Scene', at: x.deletedAt || 0, n: (x.layers || []).length || 1, where: 'the Lab\'s History', machine: 'both computers' });
      }
    } catch { /* none */ }
    // boards: a deleted board's data stays as kv board-<id> (only the boards list forgets it)
    try {
      const idx = await readKV('boards');
      if (idx?.state === 'ok') {
        const live = new Set((idx.value?.list || []).map((x) => x?.id));
        const files = (await fsp.readdir(path.join(o.dataDir, 'kv'))).filter((n) => /^board-[\w-]{1,80}\.json$/.test(n) && !/\.prev\.json$/.test(n));
        for (const n of files) {
          const id = n.slice(6, -5);
          if (live.has(id)) continue;
          const r = await readJson(path.join(o.dataDir, 'kv', n));
          if (!r?.v || !Array.isArray(r.v.items)) continue;
          out.boards.push({ key: tok({ del: 'board', id }), id, name: r.v.name || 'Board', at: r.st.mtimeMs, n: r.v.items.length, where: 'kept when deleted', machine: 'both computers' });
        }
      }
    } catch { /* none */ }
    for (const k of Object.keys(out)) out[k].sort((a, b) => b.at - a.at);
    return out;
  }
  // what to bring back (the window brings back what its live lists hold itself: projects, scenes and boards on screen)
  async function deletedThing(key) {
    const t = tokens.get(String(key || ''));
    if (!t?.del) return null;
    if (t.del === 'project') { const p = await readStore('project'); return (p?.trash || []).find((x) => x?.id === t.id) || null; }
    if (t.del === 'scene') { const h = await readKV('three-history'); return (h?.value?.trash || []).find((x) => x?.id === t.id && (!t.at || x.deletedAt === t.at)) || (h?.value?.trash || []).find((x) => x?.id === t.id) || null; }
    if (t.del === 'board') { const r = await readJson(path.join(o.dataDir, 'kv', `board-${t.id}.json`)); return r?.v || null; }
    return null;
  }
  async function undelete(key) {
    const t = tokens.get(String(key || ''));
    if (!t?.del) return { ok: false, error: 'That isn\'t in Deleted things any more (open the list again).' };
    if (t.del === 'chat-trash' || t.del === 'chat-sync') {
      // never over a chat that's there: the restore of a version is the way for that
      if (fs.existsSync(path.join(o.dataDir, 'chats', `${t.id}.json`))) return { ok: false, error: 'That chat is already in your list.', exists: true };
      if (t.del === 'chat-trash') {
        if (o.restoreChat) { if (!(await o.restoreChat(t.id))) return { ok: false, error: 'It isn\'t in Recently deleted any more.' }; } else await fsp.rename(path.join(o.dataDir, 'trash', `${t.id}.json`), path.join(o.dataDir, 'chats', `${t.id}.json`));
      } else {
        const r = await o.syncRestore?.(t.syncId);
        if (!r?.ok) return { ok: false, error: r?.error || 'Sync isn\'t on, so its Deleted files can\'t be reached.' };
      }
      return { ok: true, kind: 'chat', id: t.id };
    }
    if (t.del === 'project') {
      const p = await readStore('project');
      const x = (p?.trash || []).find((y) => y?.id === t.id);
      if (!x) return { ok: false, error: 'It isn\'t in Recently deleted projects any more.' };
      if ((p.list || []).some((y) => y?.id === t.id)) return { ok: false, error: 'That project is already in your list.', exists: true };
      const { deletedAt, ...rest } = x;
      await writeKV('projects', C.putInto('project', p, t.id, { ...rest, updated: now() }));
      return { ok: true, kind: 'project', id: t.id };
    }
    if (t.del === 'scene') {
      const x = await deletedThing(key);
      if (!x) return { ok: false, error: 'It isn\'t in the Lab\'s deleted scenes any more.' };
      const scenes = (await readStore('scene')) || [];
      if (scenes.some((y) => y?.id === t.id)) return { ok: false, error: 'That scene is already in your list.', exists: true };
      const { deletedAt, ...rest } = x;
      await writeKV('three-sketches', C.putInto('scene', scenes, t.id, { ...rest, code: rest.layers?.[0]?.code ?? rest.code ?? '', updatedAt: now() }));
      // out of History's deleted list (kept there if that can't be read: it's only listed twice)
      const h = await readKV('three-history');
      if (h?.state === 'ok' && Array.isArray(h.value?.trash)) await writeKV('three-history', { ...h.value, trash: h.value.trash.filter((y) => y?.id !== t.id) });
      return { ok: true, kind: 'scene', id: t.id };
    }
    if (t.del === 'board') {
      const b = await deletedThing(key);
      const idx = await readKV('boards');
      if (!b || idx?.state !== 'ok') return { ok: false, error: 'The boards list can\'t be read just now. Nothing was changed.' };
      const v = idx.value || { list: [] };
      if ((v.list || []).some((x) => x?.id === t.id)) return { ok: false, error: 'That board is already in your list.', exists: true };
      await writeKV('boards', { ...v, list: [{ id: t.id, name: b.name || 'Board', updated: now(), count: (b.items || []).filter((i) => i?.type !== 'frame').length, chats: b.chats || [] }, ...(v.list || [])] });
      return { ok: true, kind: 'board', id: t.id };
    }
    return { ok: false, error: 'Unknown.' };
  }

  return { list, read, keep, restore, undoOnto, deleted, deletedThing, undelete, _tokens: tokens, _subj: subj };
}

// ---------- the app ----------
let inst = null;
function register(ipcMain, opts = {}) {
  const { store, syncmain } = opts && typeof opts === 'object' ? opts : {};
  const eng = () => { try { return syncmain?.engine?.() || null; } catch { return null; } };
  const made = () => inst || (inst = create({
    dataDir: store.DATA_DIR, configPath: opts.configPath, stateDir: path.join(store.DATA_DIR, 'sync'),
    cloudDir: () => eng()?.cloudDir || null, ctx: () => eng()?.ctx?.() || null,
    conflicts: () => eng()?.conflicts?.() || [], incoming: (rel) => eng()?.incoming?.(rel) || null,
    syncTrash: async () => (eng() ? eng().trash() : []), syncRestore: async (id) => (eng() ? eng().restore(id) : { ok: false, error: 'Sync is off.' }),
    backups: async () => { try { return (await require('./backupautomain').list()).items; } catch { return []; } },
    readChat: (id) => (store.getChatFresh ? store.getChatFresh(id) : store.getChat(id)), writeChat: (chat) => store.saveChat(chat), restoreChat: (id) => store.restoreChat(id),
    chatRestore: store.restoreChatBig, chatHead: store.chatHead, // (round 84, bigchat84) a giant chat restored / listed on the store threads
    digest: store.runOff ? (a) => store.runOff('chatDigest', a) : undefined, chatIdle: store.idle, chatBytes: store.runOff ? (a) => store.runOff('chatBytes', a) : undefined, // (round 82, bigchat82) giant chats: listed from digests made on the files thread
    readKV: (name) => store.getKVStatus(name), writeKV: (name, v) => store.setKV(name, v),
    readConfig: opts.readConfig, saveConfig: opts.saveConfig,
  }));
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { made(); return await fn(...a); } catch (err) { return { ok: false, error: err.message, code: err.code || null }; } });
  h('versions:list', (s, o) => inst.list(s, o || {}));
  h('versions:read', (token) => inst.read(token));
  h('versions:keep', async (s, thing) => ({ ok: true, before: await inst.keep(s, thing) }));
  h('versions:restore', (s, token, o) => inst.restore(s, token, o || {}));
  h('versions:undo', async (kind, over, target, cur) => inst.undoOnto(String(kind), over, target, cur)); // (a thing the window holds: the merged value it applies)
  h('versions:deleted', () => inst.deleted());
  h('versions:thing', (key) => inst.deletedThing(key));
  h('versions:undelete', (key) => inst.undelete(key));
}

module.exports = { create, register, hereWord };
