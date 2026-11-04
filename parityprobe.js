// (round 120, astraprobe120) "Check Astra works like Claude": one self-check the owner starts himself (the doctor's
// button, Ctrl/⌘+K, /check-astra) that proves, on his own computer and with his own signed-in Codex, what rounds 116 and
// 119 could only check against simulations. Main process only (Node). Runs only when asked; a few short messages.
//   1. instructions   a chat whose Hearth prompt carries a random check phrase; Astra must repeat it. Says how the
//                     prompt went in (developer instructions, or the older way: base instructions) and Codex's version
//   2. tools          Astra creates a file with its own edit tool in a temp folder; Hearth reads the file on disk
//   3. lock           a temp folder laid out like Hearth's source (engines.js + mcp/hearth-map.js + data/): Astra writes
//                     data/x.txt (must be refused by Hearth's answer, datalock.js codexDecider) then src/ok.txt (must be
//                     written). The approval requests Codex really sent are kept, as shapes (no ids, no text beyond the
//                     test files), for the report
//   4. cleanup        the temp folders go to the Trash (only folders this check made, in the system's temp folder)
// Everything happens in throwaway folders in the system temp folder: never the owner's projects, never Hearth's data.
// Hearth never sees a password or token: Codex uses its own sign-in. Its own app-server pool (codex-server.js), so no
// chat of the owner's is touched. The report (copy for Claude) is plain text with the shapes, never a secret.
//   run({ engines, spawn?, kill?, trash?, onStep?, model?, stepMs? }) → { ok, need?, line?, steps, report, version, mode }
//   register(ipcMain, { engines, readConfig, send, trash })   'parityprobe:run' (main.js lazyIpc)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STEP_MS = 2 * 60000;
const PREFIX = 'hearth-astracheck-';
const SAFE_KEYS = /^(method|type|kind|status|decision|approvalPolicy|sandbox|command|reason|grantRoot|cwd|path|diff|exitCode)$/;

// a value as its shape: ids and free text become <text N>; the test folders' paths are kept, relative to <test>
function shapeOf(v, roots, key = '', depth = 0) {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') {
    let s = v; let inTest = false;
    for (const r of roots) if (r && s.includes(r)) { s = s.split(r).join('<test>'); inTest = true; }
    if (/\b(sk-[\w-]{8,}|eyJ[\w-]{10,}|Bearer\s+\S+)/.test(s)) return '<hidden>';
    if (inTest || SAFE_KEYS.test(key)) return s.length > 160 ? `${s.slice(0, 159)}…` : s;
    return `<text ${s.length}>`;
  }
  if (depth > 4) return '…';
  if (Array.isArray(v)) return v.slice(0, 4).map((x) => shapeOf(x, roots, key, depth + 1)).concat(v.length > 4 ? [`…${v.length - 4} more`] : []);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 20).map(([k, x]) => [k, shapeOf(x, roots, k, depth + 1)]));
  return typeof v;
}
const firstLine = (s, n = 200) => { const t = String(s || '').split('\n').map((l) => l.trim()).find(Boolean) || ''; return (t.length > n ? `${t.slice(0, n - 1)}…` : t).replace(os.homedir(), '~'); };

// what Hearth and the app-server say to each other, read from the pipes (codex-server.js is not changed for this)
function tapped(spawn, tap) {
  return (bin, args, opts) => {
    const child = spawn(bin, args, opts);
    const write = child.stdin.write.bind(child.stdin);
    let outBuf = '';
    child.stdin.write = (chunk, ...rest) => { outBuf = lines(outBuf + String(chunk), (m) => tap.sent(m)); return write(chunk, ...rest); };
    let inBuf = '';
    child.stdout.on('data', (chunk) => { inBuf = lines(inBuf + (typeof chunk === 'string' ? chunk : chunk.toString('utf8')), (m) => tap.got(m)); });
    return child;
  };
}
function lines(buf, fn) {
  let at;
  while ((at = buf.indexOf('\n')) !== -1) { const l = buf.slice(0, at); buf = buf.slice(at + 1); if (l.trim()) { try { fn(JSON.parse(l)); } catch { /* not JSON: codex-server.js reports it */ } } }
  return buf.length > 8 * 1024 * 1024 ? '' : buf;
}

function makeTap(roots) {
  const t = { opens: new Map(), threads: [], requests: [], items: [], answers: new Map() };
  t.sent = (m) => {
    if (m.method === 'thread/start' || m.method === 'thread/resume') {
      const how = m.params?.developerInstructions ? 'developerInstructions' : m.params?.baseInstructions ? 'baseInstructions' : 'none';
      const rec = { method: m.method, how, approvalPolicy: m.params?.approvalPolicy || null, result: null };
      t.opens.set(m.id, rec); t.threads.push(rec);
    }
    if (!m.method && m.id != null && m.result && t.answers.has(m.id)) t.answers.get(m.id).decision = m.result.decision ?? shapeOf(m.result, roots());
  };
  t.got = (m) => {
    if (m.id != null && !m.method && t.opens.has(m.id)) { t.opens.get(m.id).result = m.error ? `error: ${firstLine(m.error.message, 160)}` : 'ok'; return; }
    if (m.method && m.id != null) {
      const rec = { method: m.method, params: shapeOf(m.params || {}, roots()), decision: null };
      if (t.requests.length < 12) t.requests.push(rec);
      t.answers.set(m.id, rec);
      return;
    }
    if (m.method === 'item/started' && /fileChange|commandExecution/.test(m.params?.item?.type || '') && t.items.length < 8) t.items.push(shapeOf(m.params.item, roots()));
  };
  return t;
}

// one turn on this check's own pool → { end, text }
function turn(pool, { chatId, bin, plan, env, text, ms }) {
  return new Promise((resolve) => {
    let out = ''; let settled = false;
    const timer = setTimeout(() => { if (settled) return; settled = true; pool.stop(chatId); resolve({ end: { type: 'timeout' }, text: out }); }, ms);
    pool.run({ chatId, bin, runtimeKey: 'astracheck', ...plan, env, session: {}, parser: () => null, text, showThinking: false }, (e) => {
      if (e.type === 'delta') out += e.text || '';
      if (['done', 'error', 'stopped'].includes(e.type) && !settled) { settled = true; clearTimeout(timer); resolve({ end: e, text: e.type === 'done' ? (e.text || out) : out }); }
    }, () => {});
  });
}

const signedOutText = /not (logged|signed) in|please (run |)(codex )?(log|sign) ?in|unauthori[sz]ed|\b401\b/i;

async function run({ engines, spawn, kill = (c) => { try { c.kill(); } catch { /* gone */ } }, trash, onStep = () => {}, model = null, stepMs = STEP_MS, tmpRoot = os.tmpdir(), now = () => new Date() } = {}) {
  const steps = [];
  const step = (id, ok, text, extra = {}) => { const s = { id, ok, text, ...extra }; steps.push(s); onStep({ ...s, state: 'done' }); return s; };
  const started = (id) => onStep({ id, state: 'running' });
  const head = { at: now().toISOString().slice(0, 16).replace('T', ' '), platform: `${process.platform} ${os.release()}` };

  // 0. Codex found and signed in (its own check: `codex login status`; Hearth never sees a token)
  started('found');
  const r = await engines.checkEngine('codex', { fresh: false }).catch((err) => ({ error: err.message }));
  const version = r?.semver || null;
  const stop = (need, line) => { step('found', false, line); return finish({ ok: false, need, line }); };
  const finish = (x) => ({ ...x, steps, version, report: report({ ...x, head, steps, version }) });
  if (r?.error) return stop('doctor', `Hearth couldn't check Codex (${firstLine(r.error)}).`);
  if (!r?.found) return stop('install', 'Codex isn\'t installed on this computer, so Astra can\'t run yet.');
  if (r.broken) return stop('doctor', `Codex at ${firstLine(r.chosen)} didn't answer. The doctor can update it.`);
  if (r.signedIn === false) return stop('login', 'Codex isn\'t signed in. Sign in (in Codex\'s own window), then run the check again.');
  step('found', true, `Codex ${version || '(version unknown)'} is installed${r.signedIn ? ' and signed in' : ''}.`);

  const bin = engines.locate('codex') || r.chosen;
  const { Pool } = require('./codex-server');
  const roots = [];
  const tap = makeTap(() => roots);
  const pool = new Pool({ spawn: tapped(spawn || require('./winpolish').spawn, tap), kill, requestMs: Math.min(stepMs, 60000) });
  const env = { ...process.env, MCP_TOOL_TIMEOUT: String(stepMs) };
  const P = engines.codexProbe;
  P.useBin(bin); // the version read above decides developer instructions or the older way (engines.js codexDevOk)
  const devOk = P.devOk();
  const made = [];
  const mk = (tag) => { const d = fs.mkdtempSync(path.join(tmpRoot, `${PREFIX}${tag}-`)); made.push(d); roots.push(d, (() => { try { return fs.realpathSync(d); } catch { return d; } })()); return d; };
  const agentFor = (folder, extra = {}) => ({ id: 'astra-selfcheck', name: 'Astra', mode: 'native', engine: 'codex', ...(model ? { model } : {}), effort: 'low', showThinking: false,
    access: { level: 'write', folders: [folder] }, openTool: false, chatTools: false, threeTools: false, gameTools: false, boardTools: false, captureTools: false, adobeTools: false, deployTools: false, appsTools: false,
    autoMemory: false, memoryOff: true, suggestNext: false, selfReview: false, webSearch: 'disabled', chatgptApps: false, ...extra });
  // the plan a chat with this agent gets (engines.js), run in the test folder instead of Hearth's workspace
  const planFor = (agent, folder) => {
    const plan = P.plan(agent, {}, {});
    for (const t of [plan.thread, plan.threadLegacy, plan.turn]) if (t) t.cwd = folder;
    plan.cwd = folder;
    return plan;
  };
  const ask = (id, plan, text) => turn(pool, { chatId: `once-astracheck-${id}-${crypto.randomBytes(3).toString('hex')}`, bin, plan, env, text, ms: stepMs });
  const failed = (id, t, what) => {
    if (t.end.type === 'timeout') return step(id, false, `${what}: Astra didn't finish within ${Math.round(stepMs / 60000)} minutes.`);
    const msg = firstLine(t.end.message);
    if (signedOutText.test(msg)) return step(id, false, `${what}: Codex says it isn't signed in (${msg}).`, { need: 'login' });
    return step(id, false, `${what}: ${msg || 'Astra stopped.'}`);
  };
  let mode = null;
  try {
    // 1. Hearth's instructions arrive
    started('prompt');
    const marker = `hearth-${crypto.randomBytes(4).toString('hex')}-check`;
    const dirA = mk('prompt');
    const opensBefore = tap.threads.length;
    const a = await ask('prompt', planFor(agentFor(dirA, { systemPrompt: `This chat is Hearth's self-check. The check phrase is: ${marker}` }), dirA),
      'Reply with only the check phrase from your instructions, nothing else.');
    const opened = tap.threads.slice(opensBefore).filter((x) => x.result === 'ok').at(-1);
    mode = opened ? (opened.how === 'developerInstructions' ? 'developer' : 'legacy') : devOk ? 'developer' : 'legacy';
    const refusedDev = tap.threads.slice(opensBefore).some((x) => x.how === 'developerInstructions' && /^error/.test(x.result || ''));
    const why = mode === 'developer' ? 'as developer instructions (Codex keeps its own know-how)'
      : refusedDev ? 'the older way: this Codex refused developer instructions, so Hearth\'s prompt replaced its base instructions'
      : process.env.HEARTH_CODEX_PROMPT === 'base' ? 'the older way (HEARTH_CODEX_PROMPT=base is set)'
      : `the older way: Codex ${version || '?'} is older than ${P.min}, so Hearth's prompt replaced its base instructions`;
    if (a.end.type !== 'done') failed('prompt', a, 'Instructions');
    else if (a.text.includes(marker)) step('prompt', true, `Astra gets Hearth's instructions: it repeated the check phrase. Sent ${why}. Codex ${version || '?'}.`, { mode });
    else step('prompt', false, `Astra didn't repeat the check phrase, so Hearth's instructions may not reach it (sent ${why}). It answered: "${firstLine(a.text, 120)}"`, { mode });

    // 2. its own edit tool works
    started('tools');
    const dirB = mk('tools');
    const content = `made by Astra ${crypto.randomBytes(3).toString('hex')}`;
    const fileB = path.join(dirB, 'hello.txt');
    const b = await ask('tools', planFor(agentFor(dirB), dirB),
      `Create the file \`${fileB}\` with exactly this content: \`${content}\`\nUse your normal file editing tool (apply_patch). Don't do anything else, then reply "done".`);
    const gotB = (() => { try { return fs.readFileSync(fileB, 'utf8').trim(); } catch { return null; } })();
    if (gotB === content) step('tools', true, 'Astra\'s own edit tool works: it created a file and Hearth found it on disk with the right words.');
    else if (b.end.type !== 'done') failed('tools', b, 'Edit tool');
    else step('tools', false, gotB == null ? 'Astra answered but no file appeared: its edit tool didn\'t write in the test folder.' : `The file appeared with different words ("${firstLine(gotB, 60)}").`);

    // 3. the data folder lock answers (approval policy "untrusted", Hearth's answers)
    started('lock');
    const dirC = mk('lock');
    fs.writeFileSync(path.join(dirC, 'engines.js'), '// a stub: this folder is laid out like Hearth\'s source for its self-check\n');
    fs.mkdirSync(path.join(dirC, 'mcp')); fs.writeFileSync(path.join(dirC, 'mcp', 'hearth-map.js'), '// a stub\n');
    fs.mkdirSync(path.join(dirC, 'data')); fs.mkdirSync(path.join(dirC, 'src'));
    const planC = planFor(agentFor(dirC), dirC);
    const wired = planC.thread.approvalPolicy === 'untrusted' && typeof planC.decide === 'function';
    const reqBefore = tap.requests.length;
    const dataFile = path.join(dirC, 'data', 'x.txt'); const okFile = path.join(dirC, 'src', 'ok.txt');
    const c = wired ? await ask('lock', planC,
      `Do these two steps in order with your normal file editing tool (apply_patch), one edit each:\n1. Create the file \`${dataFile}\` with exactly this content: \`x\`\n2. Create the file \`${okFile}\` with exactly this content: \`ok\`\nIf a step is refused, don't try it another way: go on to the next step. Then reply "done".`) : null;
    const asked = tap.requests.slice(reqBefore);
    const declined = asked.filter((x) => /^(decline|denied)$/.test(String(x.decision)));
    const inData = fs.existsSync(dataFile); const inSrc = fs.existsSync(okFile);
    if (!wired) step('lock', false, 'Hearth didn\'t set up its lock for a folder like its own source (approval policy isn\'t "untrusted").');
    else if (inData) step('lock', false, 'The lock did NOT hold: Astra could write in the data folder.', { requests: asked.length });
    else if (inSrc && declined.length) step('lock', true, 'Hearth\'s lock answers: writing in data/ was refused and writing in src/ went ahead.', { requests: asked.length });
    else if (c.end.type !== 'done' && !asked.length) failed('lock', c, 'Lock');
    else if (!asked.length) step('lock', false, `Codex never asked Hearth before editing, so the lock wasn't tested${inSrc ? ' (src/ok.txt was written without asking)' : ''}.`);
    else step('lock', false, 'data/ was refused, but so was src/: Codex asks in a way Hearth doesn\'t read yet, so Astra\'s edits on Hearth\'s own folder would stop. Press "Copy report for Claude".', { requests: asked.length });
  } catch (err) {
    step(steps.some((s) => s.id === 'tools') ? 'lock' : steps.some((s) => s.id === 'prompt') ? 'tools' : 'prompt', false, `Stopped: ${firstLine(err.message)}`);
  } finally {
    pool.stopAll();
  }

  // 4. clean up: the folders this check made, only in the temp folder, to the Trash when they hold anything
  started('cleanup');
  let trashed = 0; const left = [];
  await new Promise((res) => setTimeout(res, 200)); // the app-servers have closed their handles
  for (const d of made) {
    if (path.dirname(d) !== path.resolve(tmpRoot) || !path.basename(d).startsWith(PREFIX)) { left.push(d); continue; }
    try {
      const full = fs.readdirSync(d).length > 0;
      if (!full) fs.rmdirSync(d);
      else if (trash) { await trash(d); trashed++; } else { left.push(d); continue; }
    } catch { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* left below */ } }
    if (fs.existsSync(d)) left.push(d);
  }
  if (left.length) step('cleanup', false, `Couldn't remove ${left.length} test folder${left.length > 1 ? 's' : ''}: ${left.map((d) => firstLine(d)).join(', ')} (safe to delete).`);
  else step('cleanup', true, `Test folders removed${trashed ? ` (${trashed} sent to the Trash)` : ''}.`);
  const need = steps.find((s) => s.need)?.need;
  return finish({ ok: steps.every((s) => s.ok), mode, ...(need ? { need } : {}), threads: tap.threads, requests: tap.requests, items: tap.items });
}

// The text "Copy report for Claude" copies: what passed, how the prompt went in, the raw shapes of what Codex asked
function report({ head, steps, version, mode, threads = [], requests = [], items = [], need }) {
  const out = [`Hearth · Astra self-check (round 120, astraprobe120) · ${head.at} · ${head.platform} · Codex ${version || '?'}`, ''];
  for (const s of steps) out.push(`${s.ok ? '✓' : '✗'} ${s.text}`);
  if (need) out.push('', `Needs: ${need === 'login' ? 'sign in to Codex' : need === 'install' ? 'install Codex' : 'the doctor'}`);
  if (mode) out.push('', `Prompt channel used: ${mode === 'developer' ? 'developer instructions' : 'legacy (base instructions)'}`);
  if (threads.length) out.push('', 'Thread requests (how Hearth\'s prompt went in → the server\'s answer):', ...threads.map((t) => `- ${t.method} ${t.how} approvalPolicy=${t.approvalPolicy} → ${t.result || 'no answer'}`));
  if (requests.length) out.push('', 'Requests Codex sent to Hearth (shapes; <test> = the test folder, <text N> = text left out):', ...requests.map((x) => `- ${x.method} → Hearth answered ${x.decision ?? 'nothing'}\n  ${JSON.stringify(x.params)}`));
  if (items.length) out.push('', 'Edit / command items Codex announced (item/started, shapes):', ...items.map((x) => `- ${JSON.stringify(x)}`));
  out.push('', 'No passwords, tokens or file contents beyond the test files are in this report.');
  return out.join('\n');
}

let running = null;
// (round 122) the Trash only where there is one (WinPolish / MacPolish trashCheck): else the folder stays, listed as left
async function toTrash(p) {
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(p, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(p, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) throw new Error(check.why || 'no Trash on this disk');
  await require('electron').shell.trashItem(check.path || p);
}
function register(ipcMain, { engines, readConfig, send = () => {}, trash, settings } = {}) {
  ipcMain.handle('parityprobe:run', async () => {
    if (running) return { ok: false, busy: true, line: 'The check is already running.' };
    try {
      if (settings) engines.setEnginePaths(settings().enginePaths);
      const astra = (readConfig?.().agents || []).find((a) => a.mode === 'native' && a.engine === 'codex');
      running = run({ engines, trash: trash || toTrash, model: astra?.model || null, onStep: (s) => send('parityprobe:step', s) });
      return await running;
    } finally { running = null; }
  });
}

module.exports = { run, register, shapeOf, report, PREFIX, STEP_MS };
