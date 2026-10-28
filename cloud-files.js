// Windows cloud placeholders expose readiness through attributes, not Node's stat.
// Read metadata in one bounded, hidden subprocess; never read/hydrate file contents.
const cp = require('child_process');
const NEEDS_DOWNLOAD = 0x1000 | 0x40000 | 0x400000;
const pending = attributes => !Number.isInteger(attributes) || Boolean(attributes & NEEDS_DOWNLOAD);
const SCRIPT = `[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$paths = ConvertFrom-Json ([Console]::In.ReadToEnd())
$result = @(foreach ($p in $paths) {
  $a = $null
  try { $a = [int][IO.File]::GetAttributes([string]$p) } catch { }
  @{ path = [string]$p; attributes = $a }
})
ConvertTo-Json -InputObject $result -Compress`;
// (sweep67) Windows' own PowerShell by its full path (a PATH without System32\WindowsPowerShell still works), and the
// script as -EncodedCommand (UTF-16LE base64): no cmd.exe quoting of a multi-line script, whatever the argument holds.
const PS_EXE = () => require('path').win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64');
// (round 74, synchard74) in batches: 50,000 files in one PowerShell call ran past its 8 s / 8 MB limits, and a failed
// call marks every file "unknown" (nothing synced on the PC). Each batch is its own call; one that fails marks only
// its own files unknown.
const BATCH = 1500;
// (round 78, winperf78) ONE long-lived hidden PowerShell answers every question of the session: on Windows each
// PowerShell start costs ≈ 300–800 ms (more while Defender scans it), and a sync pass after any change started a new
// one. One JSON line of paths in, one '@@H <json>' line out; it quits by itself after 2 minutes without a question (and
// with Hearth). A server that doesn't answer (a locked-down PowerShell, a policy) is dropped and that question asked the
// one-shot way below, as before; after two such failures, the one-shot way for the rest of the session.
const SERVER_SCRIPT = `[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Length -eq 0) { continue }
  $out = 'null'
  try {
    $paths = ConvertFrom-Json $line
    $result = @(foreach ($p in $paths) {
      $a = $null
      try { $a = [int][IO.File]::GetAttributes([string]$p) } catch { }
      @{ path = [string]$p; attributes = $a }
    })
    $out = ConvertTo-Json -InputObject $result -Compress
  } catch { }
  [Console]::Out.WriteLine('@@H ' + $out)
  [Console]::Out.Flush()
}`;
const SERVER_ENCODED = Buffer.from(SERVER_SCRIPT, 'utf16le').toString('base64');
const T = { idle: 120000, first: 6000, answer: 8000 }; // ms: quits after idle · the first answer (its start) · each answer
const S = { child: null, buf: '', waiting: null, queue: Promise.resolve(), idle: null, fails: 0, broken: false, starts: 0, asked: 0 };
const failed = () => { S.fails += 1; S.broken = S.fails >= 2; };
function stopServer() {
  const c = S.child; S.child = null; S.buf = '';
  clearTimeout(S.idle); S.idle = null;
  if (S.waiting) { const w = S.waiting; S.waiting = null; w(null); }
  if (c) { try { c.stdin?.end?.(); } catch { /* gone */ } try { c.kill?.(); } catch { /* gone */ } }
}
function startServer(spawn) {
  const c = spawn(PS_EXE(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', SERVER_ENCODED], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  S.child = c; S.buf = ''; S.starts += 1;
  const gone = () => { if (S.child === c) stopServer(); };
  c.on?.('error', gone); c.on?.('exit', gone);
  c.stdin?.on?.('error', () => {});
  c.stdout?.setEncoding?.('utf8');
  c.stdout?.on?.('data', (d) => {
    if (S.child !== c) return;
    S.buf += String(d);
    let i;
    while ((i = S.buf.indexOf('\n')) >= 0) {
      const line = S.buf.slice(0, i).replace(/\r$/, ''); S.buf = S.buf.slice(i + 1);
      if (!line.startsWith('@@H ') || !S.waiting) continue; // (anything else PowerShell prints is not an answer)
      const w = S.waiting; S.waiting = null; w(line.slice(4));
    }
  });
  // never what keeps Hearth (or a test) running
  try { c.unref?.(); c.stdout?.unref?.(); c.stdin?.unref?.(); } catch { /* fine */ }
  return c;
}
process.on?.('exit', () => { try { S.child?.kill?.(); } catch { /* gone */ } });
// → Map, or null when the server can't answer (the caller asks the one-shot way)
function viaServer(unique, spawn) {
  if (S.broken) return Promise.resolve(null);
  const run = () => new Promise((resolve) => {
    if (S.broken) { resolve(null); return; }
    let first = false;
    try { if (!S.child) { startServer(spawn); first = true; } } catch { failed(); resolve(null); return; }
    clearTimeout(S.idle); S.idle = null;
    const c = S.child;
    function answer(text) {
      clearTimeout(timer);
      if (text == null) { failed(); resolve(null); return; } // (it quit mid-question)
      S.idle = setTimeout(stopServer, T.idle); S.idle.unref?.();
      S.asked += 1;
      const result = new Map(unique.map(p => [p, null]));
      try {
        const rows = JSON.parse(String(text).replace(/^﻿/, ''));
        for (const row of Array.isArray(rows) ? rows : [rows]) if (result.has(row?.path)) result.set(row.path, row.attributes);
      } catch { /* unknown, as the one-shot call says */ }
      resolve(result);
    }
    const timer = setTimeout(() => { if (S.waiting === answer) { S.waiting = null; failed(); stopServer(); resolve(null); } }, first ? T.first : T.answer);
    S.waiting = answer;
    try { c.stdin.write(`${JSON.stringify(unique)}\n`); } catch { S.waiting = null; clearTimeout(timer); failed(); stopServer(); resolve(null); }
  });
  const p = S.queue.then(run, run); // one question at a time: answers come back in order
  S.queue = p.catch(() => null);
  return p;
}
function oneShot(unique, execFile) {
  return new Promise(resolve => {
    const unknown = () => new Map(unique.map(p => [p, null]));
    try {
      const child = execFile(PS_EXE(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED],
        { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
          if (err) return resolve(unknown());
          try {
            const rows = JSON.parse(String(out).replace(/^﻿/, ''));
            const result = unknown();
            for (const row of Array.isArray(rows) ? rows : [rows]) if (result.has(row?.path)) result.set(row.path, row.attributes);
            resolve(result);
          } catch { resolve(unknown()); }
        });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(unique));
    } catch { resolve(unknown()); }
  });
}
// execFile given (tests, synchard74): one PowerShell call per batch, as before; otherwise the long-lived one (spawn can
// be given, for tests), a question it can't answer asked the one-shot way
async function attributes(paths, { platform = process.platform, execFile = null, spawn = null, batch = BATCH } = {}) {
  const unique = [...new Set(paths)];
  if (!unique.length || platform !== 'win32') return new Map(unique.map(p => [p, 0]));
  if (unique.length > batch) {
    const out = new Map();
    for (let i = 0; i < unique.length; i += batch) for (const [k, v] of await attributes(unique.slice(i, i + batch), { platform, execFile, spawn, batch })) out.set(k, v);
    return out;
  }
  if (!execFile) { const r = await viaServer(unique, spawn || cp.spawn); if (r) return r; }
  return oneShot(unique, execFile || cp.execFile);
}
// (tests) the server's state · stop() · reset() forgets a broken server
const server = {
  state: () => ({ running: Boolean(S.child), starts: S.starts, asked: S.asked, fails: S.fails, broken: S.broken }),
  stop: stopServer,
  reset(o = {}) { stopServer(); Object.assign(S, { fails: 0, broken: false, starts: 0, asked: 0, queue: Promise.resolve() }); Object.assign(T, { idle: 120000, first: 6000, answer: 8000 }, o); },
};
module.exports = { attributes, pending, server };
