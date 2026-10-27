#!/usr/bin/env node
// (round 73, syncmedia73) Big files through the two-computer simulator (dev/sync-sim.js): a ≈ 2 GB mix of Lab captures,
// renders, stems, session sketches, photos and tickets, plus chats, synced PC → cloud → Mac. Each file has its own
// random header and sparse zeros after it (the simulator writes its downloads sparse and keeps the server's copy as a
// hard link), so the disk only holds what the engines really write (≈ 2 × the mix). Measured for each phase: wall time,
// bytes the process read / wrote (/proc/self/io), the event loop's longest delay, and:
//   · how long a chat written while the big files go up takes to reach the cloud folder (two lanes: it shouldn't wait)
//   · partial files a cloud client would see (and start uploading) in the cloud folder while big files copy
//   · steady passes afterwards: nothing re-read (no rehash of unchanged big files)
//   · a copy cut short (quit mid-file) and the restart: what is copied again
//   · the Mac joining: the same chat test while the big files come down; Free up space (where the engine has it)
// Never touches real data: a temp folder (removed at the end unless --keep). --root <dir>: another copy of Hearth's
// engine (the round's base commit, for before → after).   node dev/syncmedia73-perf.js [--gb 2] [--root DIR] [--json]
'use strict';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');
const Sim = require('./sync-sim');
Sim.install(); // (placeholders: a Mac stat sees no blocks)
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const { createEngine } = require(path.join(ROOT, 'sync-engine.js'));
const GB = Number(opt('--gb', 2));
const JSON_OUT = argv.includes('--json');
const TMP = opt('--tmp', os.tmpdir());
const MB = 1024 * 1024;

// ---------- the mix (sizes in MB at --gb 2, scaled) ----------
const SCALE = GB / 2;
const MIX = [
  ...[1, 2].map((i) => [`renders/Intro final ${i}.mp4`, 400]),
  ...[1, 2, 3, 4].map((i) => [`captures/recordings/Lab take ${i}.mp4`, 150]),
  ...Array.from({ length: 12 }, (_, i) => [`creative-sketches/Night drive/stem ${i + 1}.wav`, 25]),
  ...Array.from({ length: 10 }, (_, i) => [`creative-park/Park sketch/take ${i + 1}.wav`, 12]),
  ...Array.from({ length: 60 }, (_, i) => [`paris-photos/2026-10/photo ${i + 1}.jpg`, 3]),
  ...Array.from({ length: 10 }, (_, i) => [`tickets/show-${i + 1}/ticket.pdf`, 1]),
].map(([rel, mb]) => [rel, Math.max(1, Math.round(mb * SCALE * MB))]);
const TOTAL = MIX.reduce((a, [, s]) => a + s, 0);
const free = (() => { try { const s = fs.statfsSync(TMP); return s.bavail * s.bsize; } catch { return Infinity; } })();
if (free < TOTAL * 2.4 + 512 * MB) { console.error(`syncmedia73-perf: not enough free disk in ${TMP} for a ${(TOTAL / 1e9).toFixed(1)} GB mix (${(free / 1e9).toFixed(1)} GB free, needs ≈ ${(TOTAL * 2.4 / 1e9).toFixed(1)} GB). Try --gb 1.`); process.exit(2); }

const RUN = fs.mkdtempSync(path.join(TMP, 'hearth-syncmedia73-perf-'));
const clock = { now: () => Date.now() };
const cloud = Sim.cloud({ blobDir: path.join(RUN, 'server') });
const io = () => { const t = fs.readFileSync('/proc/self/io', 'utf8'); const g = (k) => Number(new RegExp(`${k}: (\\d+)`).exec(t)?.[1] || 0); return { r: g('rchar'), w: g('wchar') }; };
function sparseFile(file, size, seed) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, crypto.randomBytes(Math.min(size, 64 * 1024)), 0, Math.min(size, 64 * 1024), 0);
  if (size > 128 * 1024) fs.writeSync(fd, Buffer.from(`end ${seed}`), 0, Buffer.byteLength(`end ${seed}`), size - 64); // a tail, so two files never share a hash
  fs.ftruncateSync(fd, size); fs.closeSync(fd);
}
function computer(name, platform) {
  const base = path.join(RUN, name);
  const m = { name, data: path.join(base, 'data'), cloudRoot: path.join(base, 'cloud') };
  fs.mkdirSync(path.join(base, 'app'), { recursive: true });
  fs.writeFileSync(path.join(base, 'app', 'config.json'), JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: {} }));
  fs.writeFileSync(path.join(base, 'app', 'theme.css'), '/* */\n');
  fs.mkdirSync(m.data, { recursive: true });
  m.view = cloud.view(m.cloudRoot, { name, style: platform === 'win32' ? 'onedrive' : 'icloud', placeholders: null, ci: false, now: clock.now });
  m.make = () => {
    const e = createEngine({ dataDir: m.data, configPath: path.join(base, 'app', 'config.json'), themePath: path.join(base, 'app', 'theme.css'), cloudRoot: m.cloudRoot, machineName: name, home: base, platform, settleMs: 0, cloudAttributes: m.view.attributes,
      onLane: () => setTimeout(() => m.e === e && e.pass().catch(() => {}), 0) }); // (what syncmain does: a pass after each big file)
    return e;
  };
  m.e = m.make();
  m.cloudFile = (rel) => path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/'));
  return m;
}
const pc = computer('PC', 'win32'); const mac = computer('Mac', 'darwin');
const lanes = (m) => (typeof m.e.laneIdle === 'function' ? m.e.laneIdle() : Promise.resolve());
async function settle(m) { for (let i = 0; i < 40; i++) { await m.e.pass(); await lanes(m); const st = m.e.status(); if (!st.pending && !(st.transfers || []).length) return st; } return m.e.status(); }
const out = { root: ROOT, mixBytes: TOTAL, files: MIX.length, phases: [] };
async function phase(label, fn) {
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  const a = io(); const t0 = Date.now();
  const extra = (await fn()) || {};
  const ms = Date.now() - t0; const b = io(); h.disable();
  const row = { label, ms, readMB: Math.round((b.r - a.r) / MB), wroteMB: Math.round((b.w - a.w) / MB), loopMaxMs: Math.round(h.max / 1e6), ...extra };
  out.phases.push(row);
  if (!JSON_OUT) console.log(`${label.padEnd(44)} ${String(ms).padStart(7)} ms   read ${String(row.readMB).padStart(5)} MB   wrote ${String(row.wroteMB).padStart(5)} MB   loop max ${String(row.loopMaxMs).padStart(5)} ms   ${Object.entries(extra).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  return row;
}
// partial files a cloud client would see in a cloud folder (and upload as they grow), watched every 100 ms
function partials(m) {
  const seen = new Map(); let stop = false;
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.hearth-part/.test(e.name)) { try { seen.set(f, Math.max(seen.get(f) || 0, fs.statSync(f).size)); } catch { /* gone */ } } } };
  const loop = () => { if (stop) return; walk(path.join(m.cloudRoot, 'Hearth')); setTimeout(loop, 100); };
  loop();
  return () => { stop = true; return { files: seen.size, MB: Math.round([...seen.values()].reduce((a, x) => a + x, 0) / MB) }; };
}
// how long until a file appears (polled every 20 ms; a pass asked again every 2.5 s, like the folder watcher)
async function until(file, m, max = 600000) {
  const t0 = Date.now(); let ask = t0;
  while (!fs.existsSync(file)) {
    if (Date.now() - t0 > max) return -1;
    if (Date.now() - ask > 2500) { ask = Date.now(); m.e.pass().catch(() => {}); }
    await new Promise((r) => setTimeout(r, 20));
  }
  return Date.now() - t0;
}
const chat = (id) => JSON.stringify({ id, agentId: 'claude', title: id, messages: [{ role: 'user', at: Date.now(), text: 'while the videos copy' }] });

(async () => {
  if (!JSON_OUT) console.log(`mix: ${MIX.length} files, ${(TOTAL / 1e9).toFixed(2)} GB · engine: ${ROOT}\n`);
  MIX.forEach(([rel, size], i) => sparseFile(path.join(pc.data, ...rel.split('/')), size, i));
  for (let i = 0; i < 40; i++) fs.mkdirSync(path.join(pc.data, 'chats'), { recursive: true }), fs.writeFileSync(path.join(pc.data, 'chats', `c${i}.json`), chat(`c${i}`));
  // 1. everything goes up; a chat written 300 ms in must not wait for the videos
  await phase('PC: the mix goes up (first sync)', async () => {
    const parts = partials(pc);
    const p = pc.e.pass();
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(path.join(pc.data, 'chats', 'during-up.json'), chat('during-up'));
    pc.e.pass().catch(() => {});
    const chatMs = await until(pc.cloudFile('chats/during-up.json'), pc);
    await p; await settle(pc);
    const missing = MIX.filter(([rel]) => !fs.existsSync(pc.cloudFile(rel))).length;
    const pv = parts();
    return { chatInCloudMs: chatMs, partialFiles: pv.files, partialMB: pv.MB, missing };
  });
  for (let i = 1; i <= 2; i++) await phase(`PC: steady pass ${i} (nothing changed)`, async () => { await pc.e.pass(); await lanes(pc); return { pending: pc.e.status().pending }; });
  // 2. a copy cut short: Hearth quits halfway through a new 300 MB render, starts again
  const cut = 'renders/Cut short.mp4'; const cutSize = Math.round(300 * SCALE * MB);
  sparseFile(path.join(pc.data, ...cut.split('/')), cutSize, 999);
  await phase('PC: quit halfway through a new render', async () => {
    const p = pc.e.pass();
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { const st = pc.e.status(); const tr = (st.transfers || []).find((x) => x.rel === cut); if ((tr && tr.done >= cutSize / 2) || (!tr && (st.bytes || 0) >= cutSize / 2)) break; await new Promise((r) => setTimeout(r, 5)); }
    pc.e.stop(); await p.catch(() => {}); await lanes(pc);
    return { stoppedAt: `${Math.round(((pc.e.status().transfers || [])[0]?.done || pc.e.status().bytes || 0) / MB)} MB` };
  });
  pc.e = pc.make();
  await phase('PC: started again, the render finishes', async () => { await settle(pc); return { inCloud: fs.existsSync(pc.cloudFile(cut)), resumed: pc.e.status().resumed || 0 }; });
  // 3. the cloud provider brings it all to the Mac's cloud folder (not measured: the simulator's own work)
  for (let i = 0; i < 4; i++) { pc.view.tick(); mac.view.tick(); }
  // 4. the Mac joins: everything comes down; a chat the PC writes meanwhile must not wait for the videos
  await phase('Mac: joins (the mix comes down)', async () => {
    const p = mac.e.pass();
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(path.join(pc.data, 'chats', 'during-down.json'), chat('during-down'));
    await pc.e.pass(); const tt = Date.now(); pc.view.tick(); mac.view.tick(); if (process.env.PERF_DEBUG) console.log("ticks ms", Date.now() - tt);
    mac.e.pass().catch(() => {});
    const chatMs = await until(path.join(mac.data, 'chats', 'during-down.json'), mac);
    await p; await settle(mac);
    const missing = [...MIX, [cut]].filter(([rel]) => !fs.existsSync(path.join(mac.data, ...rel.split('/')))).length;
    return { chatHereMs: chatMs, missing };
  });
  for (let i = 1; i <= 2; i++) await phase(`Mac: steady pass ${i} (nothing changed)`, async () => { await mac.e.pass(); await lanes(mac); return { pending: mac.e.status().pending }; });
  // 5. Free up space on the Mac (the engine's list + the simulated provider's evict), then a pass: nothing downloads again
  if (typeof mac.e.freeable === 'function') {
    mac.e.set({ evict: async (file) => mac.view.evict(file) });
    await phase('Mac: Free up space (online-only)', async () => {
      const list = await mac.e.freeable();
      const r = await mac.e.free(list.items.map((x) => x.rel));
      return { listed: list.items.length, listedMB: Math.round(list.bytes / MB), freedMB: Math.round(r.bytes / MB), failed: r.failed.length };
    });
    await phase('Mac: next pass after freeing', async () => { const d = mac.view.stats.down; await mac.e.pass(); await lanes(mac); mac.view.tick(); return { pending: mac.e.status().pending, downloads: mac.view.stats.down - d }; });
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  for (const m of [pc, mac]) m.e.stop();
  if (!argv.includes('--keep')) fs.rmSync(RUN, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); if (!argv.includes('--keep')) fs.rmSync(RUN, { recursive: true, force: true }); process.exit(1); });
