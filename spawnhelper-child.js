// (round 122, sendpath122) The process helper: a tiny long-lived Node process (Hearth's own Electron as Node, forked
// once by spawnhelper.js) that starts the engines' command-line programs for the main process. Starting a program
// from the big main process held its loop 8–30 ms (the OS copying a big process); from here it costs the main process
// one message. Nothing here decides anything: it runs the command, arguments and options it is given (worked out in
// the main process, winpolish.js spawnPlan), and passes back every event and every byte, in order.
//   in : { op: 'spawn', id, command, args, options } · { op: 'in', id, data } · { op: 'end', id } · { op: 'kill', id, sig }
//        · { op: 'destroy', id, fd } · { op: 'ping' }
//   out: { op: 'spawned', id, pid } · { op: 'threw', id, err } · { op: 'data', id, fd, data } · { op: 'inerr', id, err }
//        · { op: 'error', id, err } · { op: 'exit', id, code, signal } · { op: 'close', id, code, signal } · { op: 'pong' }
// stdin waits in the main process until 'spawned': a program the helper started but never confirmed (the helper gone
// in between) never gets its input, so it can't run a turn nobody reads. The helper never logs what passes through.
'use strict';
const cp = require('child_process');

const kids = new Map(); // id -> ChildProcess
const errOf = (e) => ({ message: String(e?.message || e), code: e?.code, errno: e?.errno, syscall: e?.syscall, path: e?.path });
const out = (m) => { try { process.send(m); } catch { /* the main process is gone */ } };

function start(m) {
  let child;
  try { child = cp.spawn(m.command, m.args, m.options || {}); } catch (e) { out({ op: 'threw', id: m.id, err: errOf(e) }); return; }
  kids.set(m.id, child);
  out({ op: 'spawned', id: m.id, pid: child.pid });
  for (const fd of ['stdout', 'stderr']) child[fd]?.on('data', (data) => out({ op: 'data', id: m.id, fd, data }));
  child.stdin?.on('error', (e) => out({ op: 'inerr', id: m.id, err: errOf(e) }));
  child.on('error', (e) => out({ op: 'error', id: m.id, err: errOf(e) }));
  child.on('exit', (code, signal) => out({ op: 'exit', id: m.id, code, signal }));
  child.on('close', (code, signal) => { kids.delete(m.id); out({ op: 'close', id: m.id, code, signal }); });
}

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.op === 'ping') { out({ op: 'pong' }); return; }
  if (m.op === 'spawn') { start(m); return; }
  const child = kids.get(m.id);
  if (!child) return;
  try {
    if (m.op === 'in') child.stdin.write(Buffer.from(m.data.buffer, m.data.byteOffset, m.data.byteLength));
    else if (m.op === 'end') child.stdin.end();
    else if (m.op === 'kill') child.kill(m.sig || 'SIGTERM');
    else if (m.op === 'destroy') child[m.fd]?.destroy();
  } catch (e) { if (m.op === 'in' || m.op === 'end') out({ op: 'inerr', id: m.id, err: errOf(e) }); }
});
// The main process gone (a quit, a crash): the helper goes too. What it started is left as a direct start leaves it
// (their pipes close; Hearth's quit stops them first).
process.on('disconnect', () => process.exit(0));
