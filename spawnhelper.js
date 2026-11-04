// (round 122, sendpath122) Starting the engines' programs from a small helper process instead of the main process.
// child_process.spawn from Hearth's main process held its loop 8–30 ms per message (Linux / the Mac copy the whole big
// process to start one; measured in docs/upgrades/sendpath122.md), and every typed key and streamed word waits behind
// that. spawnhelper-child.js is forked once (lazily, or at an idle moment: warm()) and starts them instead; the main
// process sends one message.
//   spawn(bin, args, opts) → a ChildProcess-like object (pid, exitCode, signalCode, stdin / stdout / stderr streams,
//   'error' / 'spawn' / 'exit' / 'close', kill()) that engines.js and codex-server.js use exactly like a real one.
// What runs is what winpolish.js spawnPlan works out in the main process (Windows' cmd /d /s /c, npm's .cmd through
// Node, the Mac's own Node), with the env given (or the main process's own: the helper's ELECTRON_RUN_AS_NODE never
// leaks). Every byte, event and exit code comes back in order; kill() signals the program itself by pid (a quit can't
// lose it in a message); Windows' process-tree kill (engines.js kill → taskkill) works on the same pid.
// Fallback, automatic: the setting off (settings.spawnHelper === false, HEARTH_SPAWN_HELPER=0), the helper not starting,
// or gone / not answering before it confirmed a start → that start is made directly in the main process, as before
// (its input was held back until the confirmation, so nothing runs twice). The helper gone after a start: those
// programs are stopped and end as "stopped unexpectedly". Two helper failures in one run: direct starts from then on.
'use strict';
const cp = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough, Writable } = require('stream');

// a start not confirmed by then: the helper is stuck (a helper still starting itself, under load, gets longer)
const ACK_MS = Number(process.env.HEARTH_SPAWN_HELPER_ACK_MS) || 4000;
const BOOT_MS = 20000;
const MAX_FAILS = 2;
let enabled = process.env.HEARTH_SPAWN_HELPER !== '0';
let helper = null; // the forked ChildProcess
let ready = false; // it has answered once (its own start is done)
let fails = 0;
let nextId = 1;
const live = new Map(); // id -> HelperChild (started through the helper, not closed yet)
const stats = { helper: 0, direct: 0, fallbacks: 0, starts: 0, lastFail: '' };
let logFn = () => {};
let directSpawn = (bin, args, opts) => cp.spawn(bin, args, opts);
let planOf = (bin, args, opts) => ({ command: bin, args, options: opts });

function configure({ spawn, plan, log, on } = {}) {
  if (typeof spawn === 'function') directSpawn = spawn;
  if (typeof plan === 'function') planOf = plan;
  if (typeof log === 'function') logFn = log;
  if (typeof on === 'boolean') enabled = on && process.env.HEARTH_SPAWN_HELPER !== '0';
}
const usable = () => enabled && fails < MAX_FAILS;

// ---------- the helper process ----------
function ensure() {
  if (!usable()) return null;
  if (helper && helper.connected) return helper;
  try {
    stats.starts += 1;
    const h = cp.fork(path.join(__dirname, 'spawnhelper-child.js'), [], {
      execPath: process.execPath, execArgv: [], serialization: 'advanced', windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    ready = false;
    h.on('message', (m) => { if (helper === h) ready = true; onMessage(m); });
    const gone = (why) => { if (helper !== h) return; helper = null; failed(why); };
    h.on('error', (e) => gone(`error: ${e.message}`));
    h.on('exit', (code, signal) => gone(`exit ${code} ${signal || ''}`.trim()));
    h.on('disconnect', () => gone('disconnected'));
    helper = h;
    post({ op: 'ping' });
    refresh();
    return h;
  } catch (e) {
    failed(`fork: ${e.message}`);
    return null;
  }
}
// the helper keeps no test (or quit) waiting while nothing runs through it
function refresh() {
  if (!helper) return;
  try { if (live.size) { helper.ref(); helper.channel?.ref?.(); } else { helper.unref(); helper.channel?.unref?.(); } } catch { /* closing */ }
}
function failed(why) {
  fails += 1;
  stats.lastFail = why;
  logFn(`process helper: ${why}${fails >= MAX_FAILS ? ' (direct starts from now on)' : ''}`);
  const h = helper; helper = null;
  if (h) { try { h.kill('SIGKILL'); } catch { /* gone */ } }
  for (const p of [...live.values()]) p._helperGone();
}
function post(m) {
  if (!helper?.connected) return false;
  try { helper.send(m); return true; } catch { return false; }
}
function onMessage(m) {
  const p = m && live.get(m.id);
  if (p) p._on(m);
}

// ---------- the ChildProcess-like object ----------
const bufOf = (d) => (Buffer.isBuffer(d) ? d : Buffer.from(d.buffer, d.byteOffset, d.byteLength));
const errFrom = (e) => Object.assign(new Error(e?.message || 'spawn failed'), { code: e?.code, errno: e?.errno, syscall: e?.syscall, path: e?.path });

class HelperChild extends EventEmitter {
  constructor(id, plan, pipeIn) {
    super();
    this.id = id;
    this.plan = plan;
    this.pid = undefined;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.hearthHelper = true;
    if (plan.via) this.hearthVia = plan.via;
    this._acked = false; this._real = null; this._held = []; this._ends = 0; this._closeArgs = null; this._done = false;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    for (const fd of ['stdout', 'stderr']) {
      const s = this[fd];
      s.on('end', () => this._ended());
      s.on('close', () => { if (!s.readableEnded && this._acked && !this._real) post({ op: 'destroy', id, fd }); });
    }
    const self = this;
    this.stdin = pipeIn ? new Writable({
      write(chunk, enc, cb) { self._in({ op: 'in', data: Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc) }); cb(); },
      final(cb) { self._in({ op: 'end' }); cb(); },
    }) : null;
  }
  // stdin waits for the confirmed start (see the top)
  _in(m) {
    if (this._real) { try { if (m.op === 'in') this._real.stdin.write(m.data); else this._real.stdin.end(); } catch { /* its 'error' says why */ } return; }
    if (!this._acked) { this._held.push(m); return; }
    post({ ...m, id: this.id });
  }
  _on(m) {
    if (m.op === 'spawned') {
      this._acked = true; clearTimeout(this._timer);
      this.pid = m.pid;
      for (const x of this._held.splice(0)) post({ ...x, id: this.id });
      if (this._killWanted) this.kill(this._killWanted);
      this.emit('spawn');
    } else if (m.op === 'threw') {
      // the start itself was refused (spawn threw: EINVAL…): as a direct start throws, said through 'error'
      clearTimeout(this._timer); this._acked = true; this._finish();
      const err = errFrom(m.err); err.hearthThrown = true;
      this.emit('error', err);
    } else if (m.op === 'data') {
      const s = this[m.fd];
      if (s && !s.destroyed) s.write(bufOf(m.data));
    } else if (m.op === 'inerr') {
      if (this.stdin && !this.stdin.destroyed) this.stdin.destroy(errFrom(m.err));
    } else if (m.op === 'error') {
      this.emit('error', errFrom(m.err));
    } else if (m.op === 'exit') {
      this._exited(m.code, m.signal);
    } else if (m.op === 'close') {
      this._exited(m.code, m.signal); // (a close always follows an exit; kept in case only the close came)
      this._closeArgs = [m.code, m.signal];
      this._finish();
      this.stdout.end(); this.stderr.end();
      this._ended();
    }
  }
  _exited(code, signal) {
    if (this._exitSeen) return;
    this._exitSeen = true;
    this.exitCode = code; this.signalCode = signal;
    this.emit('exit', code, signal);
  }
  // 'close' once both streams have given out what they hold (as a real child's close comes after its output)
  _ended() {
    if (!this._closeArgs || this._closed) return;
    const flowing = (s) => s.readableFlowing === true && !s.readableEnded && !s.destroyed;
    if (flowing(this.stdout) || flowing(this.stderr)) return;
    this._closed = true;
    setImmediate(() => this.emit('close', ...this._closeArgs));
  }
  _finish() { if (this._done) return; this._done = true; live.delete(this.id); refresh(); }
  kill(sig = 'SIGTERM') {
    if (this._real) return this._real.kill(sig);
    if (this.exitCode !== null || this.signalCode !== null) return false;
    if (!this._acked) { this._killWanted = sig; return true; } // sent as soon as the start is confirmed
    // by pid, here: the same signal a direct child.kill() sends, and a quit right after can't lose it in a message
    try { process.kill(this.pid, sig); this.killed = true; return true; } catch { return post({ op: 'kill', id: this.id, sig }); }
  }
  ref() { this._real?.ref?.(); }
  unref() { this._real?.unref?.(); }
  // the helper didn't confirm the start: made directly, as before (its input still here, never sent)
  _fallback(why) {
    if (this._acked || this._real) return;
    clearTimeout(this._timer);
    this._finish();
    stats.fallbacks += 1; stats.direct += 1;
    logFn(`process helper: ${why}; started directly`);
    let child;
    try { child = directSpawn(this.plan.bin, this.plan.binArgs, this.plan.opts); } catch (e) {
      const err = errFrom(e); err.hearthThrown = true;
      setImmediate(() => this.emit('error', err));
      return;
    }
    this._attach(child);
  }
  _attach(child) {
    this._real = child;
    this.pid = child.pid;
    if (child.hearthVia) this.hearthVia = child.hearthVia;
    child.stdout?.on('data', (d) => { if (!this.stdout.destroyed) this.stdout.write(d); });
    child.stderr?.on('data', (d) => { if (!this.stderr.destroyed) this.stderr.write(d); });
    child.stdout?.on('end', () => { this._outEnd = (this._outEnd || 0) + 1; });
    child.stdin?.on('error', (e) => { if (this.stdin && !this.stdin.destroyed) this.stdin.destroy(e); });
    for (const fd of ['stdout', 'stderr']) this[fd].on('close', () => { if (!this[fd].readableEnded) { try { child[fd]?.destroy(); } catch { /* gone */ } } });
    child.on('spawn', () => this.emit('spawn'));
    child.on('error', (e) => this.emit('error', e));
    child.on('exit', (code, signal) => { this.exitCode = child.exitCode; this.signalCode = child.signalCode; this._exitSeen = true; this.emit('exit', code, signal); });
    child.on('close', (code, signal) => { this.exitCode = child.exitCode; this.signalCode = child.signalCode; this._closeArgs = [code, signal]; this.stdout.end(); this.stderr.end(); this._ended(); });
    for (const m of this._held.splice(0)) this._in(m);
    if (this._killWanted) child.kill(this._killWanted);
  }
  _helperGone() {
    if (!this._acked) { this._fallback('the helper stopped before the start was confirmed'); return; }
    if (this._real || this._done) return;
    // started there, its pipes gone with the helper: the program is stopped, and ends as stopped unexpectedly
    try { process.kill(this.pid, 'SIGKILL'); } catch { /* already gone */ }
    this._finish();
    this._exited(null, 'SIGKILL');
    this._closeArgs = [null, 'SIGKILL'];
    this.stdout.end(); this.stderr.end();
    this._ended();
  }
}

function spawn(bin, args = [], opts = {}) {
  const options = { ...opts, env: opts.env || process.env }; // (the helper's own env is never what runs)
  const plan = planOf(bin, args, options);
  const stdio = options.stdio;
  const pipeIn = !(stdio === 'ignore' || (Array.isArray(stdio) && stdio[0] !== 'pipe' && stdio[0] != null));
  // what can't go through a message (a stream or handle in stdio, detached, ipc) is started directly, as before
  const plain = (s) => s == null || s === 'pipe' || s === 'ignore';
  const simple = !opts.detached && (stdio == null || typeof stdio === 'string' ? plain(stdio) : Array.isArray(stdio) && stdio.length <= 3 && stdio.every(plain));
  if (!simple || !ensure()) { stats.direct += 1; return directSpawn(bin, args, opts); }
  const id = nextId++;
  const p = new HelperChild(id, { ...plan, bin, binArgs: args, opts }, pipeIn);
  const { env, ...rest } = plan.options || {};
  if (!post({ op: 'spawn', id, command: plan.command, args: plan.args, options: { ...rest, env } })) { stats.direct += 1; return directSpawn(bin, args, opts); }
  stats.helper += 1;
  live.set(id, p);
  refresh();
  const ms = ready ? ACK_MS : BOOT_MS;
  p._timer = setTimeout(() => { if (!p._acked && live.get(id) === p) failed(`no answer in ${ms} ms`); }, ms);
  p._timer.unref?.();
  return p;
}

// started at an idle moment (main.js), so the first message doesn't pay the helper's own start
function warm() { if (usable()) ensure(); return Boolean(helper); }
function stop() { const h = helper; helper = null; if (h) { try { h.disconnect(); } catch { /* gone */ } } }

module.exports = { spawn, warm, stop, configure, usable, stats: () => ({ ...stats, live: live.size, up: Boolean(helper?.connected), fails, enabled }), _test: { get helper() { return helper; }, reset: () => { stop(); fails = 0; enabled = process.env.HEARTH_SPAWN_HELPER !== '0'; }, failed, live } };
