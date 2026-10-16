#!/usr/bin/env node
// Unit test for "nothing is lost when Hearth or the computer stops suddenly" (round 50, crashsafe), on throwaway
// folders only: atomic writes (a writer process killed hundreds of times mid-write: the file is always whole; the old
// way for comparison), a held rename retried, a power cut simulated (files cut mid-JSON, temp files left behind: the
// start-up sweep puts the whole newest version back and sends junk to the Trash), the reply journal (coalesced writes,
// a reply cut off by a killed main process, a reply that finished while the window's page was gone), renders cut off
// (the half file goes, nothing that was there before), the Lab export's ffmpeg stopped when its page crashes, and the
// words / prompts that come back.
//   node dev/crashsafe-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-crashsafe-'));
process.env.HEARTH_TEST_SAVE_DIR = base; // the Trash is a folder in the throwaway data (crashsafemain)
const C = require(path.join(ROOT, 'crashsafe-core.js'));

let fails = 0;
const check = (ok, label, extra) => { if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 300)}` : ''}`); } else console.log(`✓ ${label}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parses = (p) => { try { JSON.parse(fs.readFileSync(p, 'utf8')); return true; } catch { return false; } };

// a writer process that saves a ~300 KB JSON store over and over, killed (SIGKILL) at a random moment
function killedWriter(file, mode, ms) {
  const code = `const fs=require('fs');const C=require(${JSON.stringify(path.join(ROOT, 'crashsafe-core.js'))});let i=0;const big='x'.repeat(300000);
    for(;;){i++;const t=JSON.stringify({i,big});${mode === 'atomic' ? 'C.writeAtomicSync(fs,process.argv[1],t,{dirSync:false})' : 'fs.writeFileSync(process.argv[1],t)'};if(i===2)process.stdout.write('go');}`;
  return new Promise((resolve) => {
    const ch = spawn(process.execPath, ['-e', code, file], { stdio: ['ignore', 'pipe', 'ignore'] });
    ch.stdout.once('data', () => setTimeout(() => ch.kill('SIGKILL'), ms));
    ch.on('exit', () => resolve());
  });
}

(async () => {
  // ---------- atomic writes ----------
  const w = path.join(base, 'w'); fs.mkdirSync(w);
  const f1 = path.join(w, 'store.json');
  C.writeAtomicSync(fs, f1, JSON.stringify({ a: 1 }));
  check(JSON.parse(fs.readFileSync(f1, 'utf8')).a === 1 && fs.readdirSync(w).length === 1, 'an atomic write lands whole and leaves no temp file');
  await C.writeAtomic(fs.promises, f1, JSON.stringify({ a: 2 }));
  check(JSON.parse(fs.readFileSync(f1, 'utf8')).a === 2 && fs.readdirSync(w).length === 1, 'the same off the main thread');
  // Windows: the rename refused while another program holds the file, then allowed
  let tries = 0;
  const heldFs = { ...fs, renameSync: (a, b) => { tries += 1; if (tries < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); return fs.renameSync(a, b); } };
  C.writeAtomicSync(heldFs, f1, JSON.stringify({ a: 3 }), { wait: () => {} });
  check(tries === 3 && JSON.parse(fs.readFileSync(f1, 'utf8')).a === 3, 'a rename refused while the file is held (EBUSY) is tried again', tries);
  const stuckFs = { ...fs, renameSync: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } };
  let threw = false; try { C.writeAtomicSync(stuckFs, f1, '{"a":4}', { wait: () => {} }); } catch { threw = true; }
  check(threw && JSON.parse(fs.readFileSync(f1, 'utf8')).a === 3 && fs.readdirSync(w).length === 1, 'a rename that never works: the real file is untouched and the temp file is removed');

  // a process killed mid-write, 40 times at random moments: the atomic way is always whole; the old way for comparison
  const k = path.join(base, 'kill'); fs.mkdirSync(k);
  let whole = 0; let tornOld = 0; const N = 40;
  for (let i = 0; i < N; i++) {
    const fa = path.join(k, `a${i}.json`); const fb = path.join(k, `b${i}.json`);
    const ms = 5 + Math.floor(Math.random() * 60);
    await Promise.all([killedWriter(fa, 'atomic', ms), killedWriter(fb, 'old', ms)]);
    if (parses(fa)) whole += 1;
    if (!parses(fb)) tornOld += 1;
  }
  check(whole === N, `killed mid-write ${N} times: the store is whole every time (atomic: temp + flush + rename)`, { whole });
  console.log(`  (the old way, writing in place: ${tornOld} of ${N} files were cut short or empty)`);
  const leftTmp = fs.readdirSync(k).filter((n) => C.realOf(n));
  check(leftTmp.every((n) => C.realOf(n).startsWith('a')), 'killed writes leave temp files behind (the start-up sweep is for them)', leftTmp.length);

  // ---------- leftovers of killed writes / a power cut ----------
  check(C.realOf('three-sketches.json.tmp') === 'three-sketches.json' && C.realOf('notes.json.w.tmp') === 'notes.json' && C.realOf('x.json.1234-5.tmp') === 'x.json'
    && C.realOf('state.json.ab12cd34.tmp') === 'state.json' && C.realOf('a.json.hubtmp') === 'a.json' && C.realOf('notes.json') === null && C.realOf('.hearth-tmp-abc-x.json') === null, 'temp file names → the file they were for');
  check(C.tmpPlan({ name: 'a.json.tmp', tmpText: '{"v":2}', realText: '{"v":1}' }).action === 'trash', 'a whole real file: its temp file is junk');
  check(C.tmpPlan({ name: 'a.json.tmp', tmpText: '{"v":2}', realText: '{"v":' }).action === 'promote', 'a real file cut short + a whole temp file: the temp file takes its place');
  check(C.tmpPlan({ name: 'a.json.tmp', tmpText: '{"v":2}', realText: null }).action === 'promote', 'a missing real file + a whole temp file: the temp file takes its place');
  check(C.tmpPlan({ name: 'a.json.tmp', tmpText: '{"v":', realText: null }).action === 'trash', 'a temp file cut short is junk');
  check(C.tmpPlan({ name: 'a.json.tmp', tmpText: '{"v":2}', realText: null, realState: 'held' }).action === 'leave', 'a real file held by another program (Windows): nothing decided now');

  const M = require(path.join(ROOT, 'crashsafemain.js'));
  const data = path.join(base, 'data'); const kv = path.join(data, 'kv'); fs.mkdirSync(kv, { recursive: true });
  const old = (p) => { const t = new Date(Date.now() - 5 * 60000); fs.utimesSync(p, t, t); };
  const put = (n, text, aged = true) => { const p = path.join(kv, n); fs.writeFileSync(p, text); if (aged) old(p); return p; };
  put('scenes.json', '[{"id":"s1","name":"Ki'); put('scenes.json.4321-7.tmp', '[{"id":"s1","name":"Kick orb"},{"id":"s2","name":"Rings"}]');
  put('notes.json', '[{"id":"n1"}]'); put('notes.json.w.tmp', '[{"id":"n1"},{"id":"n2"}');
  put('tags.json.tmp', '{"t":1}');
  put('boards.json', '{"b":1}'); put('boards.json.tmp', '{"b":2}', false); // being written right now
  put('.hearth-tmp-ab-x.json', '{}');
  M.open(data);
  const done = await M.sweep({ roots: [data] });
  const byFile = Object.fromEntries(done.map((d) => [path.basename(d.file), d.action]));
  check(JSON.parse(fs.readFileSync(path.join(kv, 'scenes.json'), 'utf8')).length === 2, 'a scenes file cut short by a power cut: the whole newer version from its temp file is back', byFile);
  check(fs.readdirSync(kv).some((n) => /^scenes-torn-.*\.json$/.test(n)), 'the cut-short file is kept aside, not deleted');
  check(parses(path.join(kv, 'notes.json')) && JSON.parse(fs.readFileSync(path.join(kv, 'notes.json'), 'utf8')).length === 1 && !fs.existsSync(path.join(kv, 'notes.json.w.tmp')), 'a whole store + a cut temp file: the store stays, the temp file goes to the Trash');
  check(fs.existsSync(path.join(kv, 'tags.json')) && !fs.existsSync(path.join(kv, 'tags.json.tmp')), 'a store whose only whole copy is its temp file: it comes back');
  check(fs.existsSync(path.join(kv, 'boards.json.tmp')), 'a temp file being written right now is left alone');
  check(fs.existsSync(path.join(kv, '.hearth-tmp-ab-x.json')), 'sync\'s own temp files are left to sync');
  check(fs.readdirSync(path.join(data, 'safetynet', 'test-trash')).some((n) => n.endsWith('notes.json.w.tmp')), 'junk goes to the Trash (a folder in tests)');
  // a store cut short with a .prev copy: datasafe's careful read gives the last whole version, never "empty"
  const DS = require(path.join(ROOT, 'datasafe-core.js'));
  put('memory.json', '{"facts":["likes neon"'); put('memory.prev.json', '{"facts":["likes neon"]}');
  const r = DS.load(fs, path.join(kv, 'memory.json'), {});
  check(r.value?.facts?.[0] === 'likes neon' && r.from === 'prev', 'a store cut short mid-JSON reads from its .prev copy, never as empty', { state: r.state, from: r.from });

  // ---------- replies being written ----------
  let writes = 0;
  const orig = C.writeAtomic;
  C.writeAtomic = (...a) => { writes += 1; return orig(...a); };
  M.reply('chat1', 'claude', { type: 'start' });
  for (let i = 0; i < 300; i++) M.reply('chat1', 'claude', { type: 'delta', text: `word${i} ` });
  M.reply('chat1', 'claude', { type: 'tool', name: 'three_edit_code' });
  M.reply('chat1', 'claude', { type: 'delta', text: 'and the orb pulses <remember>likes gold</remember>' });
  await wait(1100); await M.flushReplies();
  const rj = JSON.parse(fs.readFileSync(path.join(data, 'safetynet', 'replies.json'), 'utf8'));
  check(writes <= 2 && rj.list[0]?.text.includes('word299'), `302 streamed events → ${writes} write(s) within ~1 s (coalesced, off the main thread)`, writes);
  C.writeAtomic = orig;
  // the main process is killed now (no done): the next start finds the reply
  delete require.cache[require.resolve(path.join(ROOT, 'crashsafemain.js'))];
  const M2 = require(path.join(ROOT, 'crashsafemain.js'));
  const prev = M2.open(data);
  const e = prev.replies.find((x) => x.chatId === 'chat1');
  check(Boolean(e) && !e.final, 'after the main process was killed, the next start has the reply that was being written');
  const chat = { id: 'chat1', agentId: 'claude', messages: [{ role: 'user', text: 'Make the orb pulse', at: e.started - 10 }] };
  const plan = C.replyPlan(e, chat);
  check(plan.action === 'cut' && plan.messages[0].stopped && plan.messages[0].cut && plan.messages[0].text.includes('word299') && !plan.messages[0].text.includes('<remember>'), 'it comes back as the words so far, marked cut off (hidden tags left out)');
  check(plan.messages[1].role === 'error' && plan.messages[1].net?.kind === 'cutoff' && plan.messages[1].net.crashed, 'followed by "Reply cut off — Hearth closed…" with Continue (offline.js)');
  check(C.replyPlan(e, { ...chat, messages: [...chat.messages, { role: 'assistant', text: 'saved', at: e.started + 5 }] }).action === 'none', 'a reply the chat already saved never comes back twice');
  const empty = C.replyPlan({ ...C.newReply('c', 'a', 0, 100), at: 200 }, { messages: [{ role: 'user', text: 'hi', at: 50 }] });
  check(empty.action === 'cut' && empty.messages[0].crashsafe === 'empty', 'cut off before any words: an empty cut reply, so Continue asks again');
  check(C.replyPlan({ ...C.newReply('c', 'a', 0, 100), at: 200 }, { messages: [] }).action === 'none', 'nothing asked: nothing to bring back');
  check(fs.existsSync(path.join(data, 'safetynet', 'replies-prev.json')), 'the last run\'s replies are kept aside until the window took them');
  M2.done();
  check(!fs.existsSync(path.join(data, 'safetynet', 'replies-prev.json')), 'and let go once it did');
  // a reply that finishes while the window's page is gone: kept whole for the next page
  M2.reply('chat2', 'claude', { type: 'start' });
  M2.reply('chat2', 'claude', { type: 'delta', text: 'Half of it' });
  M2.pageGone('crash');
  M2.reply('chat2', 'claude', { type: 'delta', text: ' and the rest.' });
  M2.reply('chat2', 'claude', { type: 'done', text: 'Half of it and the rest.', session: { id: 'sess-9' }, usage: { input: 10, output: 5 } });
  const o = M2._state().replies.get('chat2');
  check(o.final?.type === 'done' && o.gen !== M2._state().gen, 'a reply ending while its page was gone is kept as the next page\'s');
  const fin = C.replyPlan(o, { messages: [{ role: 'user', text: 'q', at: o.started - 1 }] });
  check(fin.action === 'final' && fin.messages[0].text === 'Half of it and the rest.' && fin.session?.id === 'sess-9', 'it comes back whole, with its session (the chat goes on in it)');
  M2.ack('chat2');
  check(!M2._state().replies.has('chat2'), 'once in its chat, its journal copy goes');

  // ---------- long writes cut off ----------
  const outDir = path.join(base, 'exports'); fs.mkdirSync(outDir);
  const half = path.join(outDir, 'Intro 1080p.mp4'); fs.writeFileSync(half, 'half a video');
  const kept = path.join(outDir, 'Finished.mp4'); fs.writeFileSync(kept, 'a whole video');
  M2.begin('export', [half], 'Intro 1080p.mp4');
  const id2 = M2.begin('export', [kept], 'Finished.mp4'); M2.end(id2);
  delete require.cache[require.resolve(path.join(ROOT, 'crashsafemain.js'))];
  const M3 = require(path.join(ROOT, 'crashsafemain.js'));
  const p3 = M3.open(data);
  const left = await p3.cleaning;
  check(!fs.existsSync(half) && fs.existsSync(kept), 'a render cut off by a crash: its half file goes to the Trash at the next start; a finished one stays');
  check(left.length === 1 && /cut off — its half-made file went to the Trash/.test(left[0].line), 'the card line says so', left.map((l) => l.line));
  check(C.leftovers([{ id: 'x', files: ['/nope/a.mp4'] }], () => false)[0].files.length === 0, 'a file that was never made is not looked for');

  // the Lab export streaming into ffmpeg when its page crashes: ffmpeg stopped, the half video removed (not left waiting)
  const ff = spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : null;
  if (ff) {
    const rf = require(path.join(ROOT, 'renderfastmain.js'));
    const out = path.join(outDir, 'streamed.mp4');
    const o2 = rf.open({ id: 'cs1', args: ['-y', '-f', 'image2pipe', '-c:v', 'png', '-i', 'INPUT', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'OUTPUT'], output: out }, { ffmpeg: ff });
    check(o2.ok && M3._state().inflight.some((x) => x.files.includes(out)), 'a streamed export is listed while it runs');
    M3.pageGone('crash');
    await wait(1500);
    check(!rf._jobs.has('cs1') && !fs.existsSync(out) && !M3._state().inflight.some((x) => x.files.includes(out)), 'its page crashed: ffmpeg stopped, the half video removed, nothing left listed');
  } else console.log('  (no ffmpeg here: the streamed export step is skipped)');

  // ---------- words ----------
  const OC = require(path.join(ROOT, 'offline-core.js'));
  check(OC.line('cutoff', { crashed: true }) === 'Reply cut off — Hearth closed while it was being written', 'the cut-off line says Hearth closed (not the connection)');
  const cp = OC.continuePrompt('the orb pulses', 'Make the orb pulse on every kick');
  check(OC.isContinue(cp) && cp.includes('Make the orb pulse on every kick') && cp.length < 400, 'Continue after a crash: one short line + the question (the engine may not have it)', cp.length);
  check(OC.continuePrompt('x') === OC.continuePrompt('x', ''), 'Continue after a dropped connection: unchanged (byte-stable)');

  fs.rmSync(base, { recursive: true, force: true });
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
