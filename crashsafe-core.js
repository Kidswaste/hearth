// Nothing is lost when Hearth or the computer stops suddenly (round 50, crashsafe), the pure parts. UMD: main
// (crashsafemain.js, store / sync / backups writing files), the window (crashsafe.js) and Node tests
// (dev/crashsafe-test.js). safetynet (round 29) keeps drafts, Lab edits, board edits and text boxes; this adds what
// it couldn't see:
//   writes   writeAtomicSync / writeAtomic: a temp file next to the real one, flushed to the disk (fsync), then renamed
//            over it (retried while Windows holds the file); after a power cut the file is the old one or the new one,
//            never half. Used for every JSON store the main process writes itself (settings, sync, backups' state…)
//   leftovers a temp file a killed write left behind (<name>.tmp, .w.tmp, .hubtmp, .<pid>.tmp…): tmpPlan decides,
//            against the real file, whether it is the newest whole version (the real one is missing or cut short:
//            it takes its place, the cut one is kept aside) or just junk (to the Trash)
//   replies  what an AI was writing when Hearth stopped: the main process journals the reply as it streams
//            (replies.json, ≤ 1 s behind); replyPlan turns a journaled reply into the chat's messages: the words it
//            had written, marked "cut off — Continue" (offline.js's Continue: the same session, one short line)
//   inflight renders / exports / backups / sync copies that write a file over minutes: begun and ended in a small
//            list; one still listed at the next start was cut off: its half-made file goes to the Trash
const CrashSafeCore = (() => {
  const V = 1;
  const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'UNKNOWN']);
  const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no wait */ } };
  let ui = null; // Electron's main thread (not the store thread, not Node, not a page)
  const uiThread = () => { if (ui == null) { try { ui = typeof process !== 'undefined' && process.type === 'browser' && require('worker_threads').isMainThread === true; } catch { ui = false; } } return ui; };
  let seq = 0;
  const pid = () => (typeof process !== 'undefined' && process.pid) || 0;
  const tmpOf = (file) => `${file}.${pid()}-${(seq = (seq + 1) % 1e6)}.tmp`;

  // ---------- atomic writes ----------
  // fs: Node's fs. data: a string or bytes. → true. Throws only when the rename can't be done at all (the temp file is
  // removed then: the real file is untouched). dirSync: the folder entry is flushed too (not on Windows: it can't).
  function writeAtomicSync(fs, file, data, { tries = 5, wait = sleepSync, dirSync = true, platform = (typeof process !== 'undefined' && process.platform) || '' } = {}) {
    const tmp = tmpOf(file);
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, typeof data === 'string' ? data : Buffer.from(data)); try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } } finally { fs.closeSync(fd); }
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, file); break; } catch (err) {
        // (round 65, mainhang65) on Electron's main thread: 50 ms of waiting at most in all (scenesafe-core waitFor)
        const ms = uiThread() ? [5, 10, 15, 20][i] ?? 0 : 40 * (i + 1);
        if (i < tries - 1 && BUSY.has(err.code) && ms) { wait(ms); continue; }
        try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ }
        throw err;
      }
    }
    if (dirSync && platform !== 'win32') { try { const d = fs.openSync(require('path').dirname(file), 'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* best effort */ } }
    return true;
  }
  // the same off the main thread (fs.promises)
  async function writeAtomic(fsp, file, data, { tries = 5 } = {}) {
    const tmp = tmpOf(file);
    const h = await fsp.open(tmp, 'w');
    try { await h.writeFile(data); try { await h.sync(); } catch { /* a disk that can't */ } } finally { await h.close(); }
    for (let i = 0; ; i++) {
      try { await fsp.rename(tmp, file); return true; } catch (err) {
        if (i < tries - 1 && BUSY.has(err.code)) { await new Promise((r) => setTimeout(r, 40 * (i + 1))); continue; }
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
    }
  }

  // ---------- leftovers of a killed write ----------
  // name → the real file's name it was written for, or null when it isn't a temp file of Hearth's
  //   x.json.tmp · x.json.w.tmp (the store thread) · x.json.hubtmp (fsapi) · x.json.1234.tmp / x.json.1234-5.tmp (pid)
  //   · x.json.k3j2.tmp (sync's random) · x.json.partial (backups)
  const KNOWN = /\.(json|zip|mp4|mov|webm|m4v|gif|png|jpe?g|webp|txt|md|css|js|html|glb|wav|mp3)$/i;
  function realOf(name) {
    name = String(name || '');
    let b = name.replace(/\.(tmp|hubtmp|partial)$/i, '');
    if (b === name || !b || b.startsWith('.')) return null;
    if (/\.w$/.test(b)) b = b.slice(0, -2);
    else if (!KNOWN.test(b)) { const m = /^(.+\.[a-z0-9]{1,5})\.[a-z0-9-]+$/i.exec(b); if (m && KNOWN.test(m[1])) b = m[1]; }
    return b || null;
  }
  const isJsonName = (n) => /\.json$/i.test(n);
  const parses = (text) => { try { JSON.parse(text); return true; } catch { return false; } };
  // what to do with a temp file found at start (written before this run): tmp / real: their text (null: not there /
  // not readable), real present but unreadable for a moment (Windows) = 'held' →
  //   'promote'  the temp file is a whole JSON and the real one is missing or cut short: it takes the real one's place
  //              (the cut one is kept aside first)
  //   'trash'    junk: the real file is whole, or the temp file is itself cut short
  //   'leave'    can't tell now (the real file is held): looked at again next start
  function tmpPlan({ name, tmpText, realText, realState = realText == null ? 'missing' : 'ok' }) {
    const real = realOf(name);
    if (!real) return { action: 'leave', why: 'not a temp file' };
    if (realState === 'held') return { action: 'leave', why: 'the real file is held' };
    if (!isJsonName(real)) return { action: 'trash', why: 'a half-written copy' };
    const tmpWhole = tmpText != null && parses(tmpText);
    const realWhole = realState === 'ok' && realText != null && parses(realText);
    if (realWhole) return { action: 'trash', why: 'the real file is whole' };
    if (tmpWhole) return { action: 'promote', why: realState === 'missing' ? 'the real file is missing' : 'the real file is cut short', real };
    return { action: 'trash', why: 'the temp file is cut short too' };
  }
  // a JSON file cut short mid-write (a power cut without fsync): true when it doesn't parse but has text
  const torn = (text) => typeof text === 'string' && text.trim().length > 0 && !parses(text);

  // ---------- replies being written ----------
  // the journal of a streaming reply (main): { chatId, agentId, gen, started, at, text, tools: [names], thinking?,
  //   session?, final?: { type, text, session, usage } }
  // add(entry, event) → the entry after an engine event (delta / tool / thinking / done / stopped / error)
  const CAP = 200000; // a reply's words kept (the chat keeps more once it's saved; this is only the crash copy)
  function add(e, ev) {
    if (!e || !ev) return e;
    e.at = Date.now();
    if (ev.session?.id) e.session = ev.session;
    if (ev.type === 'delta' && ev.text && !ev.parent) { e.text = (e.text + ev.text).slice(-CAP); }
    else if (ev.type === 'tool' && !ev.parent) { e.tools.push(String(ev.name || 'tool')); if (e.text && !e.text.endsWith('\n\n')) e.text += '\n\n'; }
    else if (ev.type === 'thinking' && ev.text) { e.thinking = ((e.thinking || '') + ev.text).slice(-20000); }
    else if (ev.type === 'done' || ev.type === 'stopped' || ev.type === 'error') e.final = { type: ev.type, text: ev.type === 'done' ? String(ev.text || e.text) : e.text, message: ev.message || '', session: ev.session || e.session || null, usage: ev.usage || null };
    return e;
  }
  const newReply = (chatId, agentId, gen = 0, now = Date.now()) => ({ chatId, agentId, gen, started: now, at: now, text: '', tools: [] });
  const VISIBLE = (t) => String(t || '').replace(/<remember>[\s\S]*?<\/remember>/gi, '').replace(/<suggest>[\s\S]*?<\/suggest>/gi, '').trim();
  // entry + the chat as saved now → { action: 'none' | 'cut' | 'final', messages: [to append], why }
  //   none   the chat already has it (saved after the reply started: a newer save wins), or nothing was written
  //   final  the reply finished while no page was there to take it (the window's page had crashed): the whole reply
  //   cut    it stopped half-way: the words so far (marked stopped + cut) and a "cut off" line with Continue
  function replyPlan(e, chat, now = Date.now()) {
    if (!e || !chat) return { action: 'none', messages: [], why: 'no chat' };
    const msgs = chat.messages || [];
    const after = msgs.filter((m) => (m.at || 0) >= (e.started || 0));
    if (after.some((m) => m.role === 'assistant' || m.role === 'error')) return { action: 'none', messages: [], why: 'already saved' };
    if (e.final?.type === 'done') {
      const text = VISIBLE(e.final.text);
      if (!text) return { action: 'none', messages: [], why: 'empty' };
      return { action: 'final', session: e.final.session, messages: [{ role: 'assistant', text, at: e.at || now, ...(e.final.usage ? { usage: e.final.usage } : {}), ...(e.tools.length ? { tools: e.tools.slice() } : {}), crashsafe: 'finished' }] };
    }
    // the question went out and nothing came back yet: an empty cut reply, so Continue asks again (with the question)
    if (!msgs.length || msgs.at(-1).role !== 'user' && !VISIBLE(e.text)) return { action: 'none', messages: [], why: 'nothing to continue' };
    const text = VISIBLE(e.text);
    const at = e.at || now;
    const out = [];
    out.push(text ? { role: 'assistant', text, at, stopped: true, cut: true, ...(e.tools.length ? { tools: e.tools.slice() } : {}), crashsafe: 'cut' }
      : { role: 'assistant', text: EMPTY_TEXT, at, stopped: true, cut: true, ...(e.tools.length ? { tools: e.tools.slice() } : {}), crashsafe: 'empty' });
    out.push({ role: 'error', text: CUT_TEXT, at: at + 1, net: { kind: 'cutoff', crashed: true }, crashsafe: 'cut' });
    return { action: 'cut', session: e.session || null, messages: out };
  }
  const CUT_TEXT = 'Reply cut off — Hearth closed while it was being written';
  const EMPTY_TEXT = '…(Hearth closed before this reply had any words)';

  // ---------- long writes in flight (renders, exports, backups, sync copies) ----------
  // list: [{ id, kind, label, files: [abs paths this job made], at }] still listed at a start → what to put in the
  // Trash: only files that exist and that the job made itself (never a file that was there before it started)
  function leftovers(list, exists = () => true) {
    const out = [];
    for (const it of Array.isArray(list) ? list : []) {
      const files = (it.files || []).filter((f) => typeof f === 'string' && f && exists(f));
      out.push({ id: it.id, kind: it.kind || 'render', label: String(it.label || ''), files, at: it.at || 0 });
    }
    return out;
  }
  const KIND = { render: 'A render', export: 'An export', backup: 'A backup', sync: 'A sync copy' };
  function leftoverLine(l) {
    const what = KIND[l.kind] || 'A long save';
    const name = l.label ? ` (${l.label})` : '';
    return l.files.length ? `${what}${name} was cut off — its half-made file went to the Trash` : `${what}${name} was cut off`;
  }

  return { V, BUSY, writeAtomicSync, writeAtomic, realOf, tmpPlan, torn, add, newReply, replyPlan, CUT_TEXT, leftovers, leftoverLine, VISIBLE };
})();
if (typeof module !== 'undefined') module.exports = CrashSafeCore;
