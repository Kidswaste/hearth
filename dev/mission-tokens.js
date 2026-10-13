#!/usr/bin/env node
// (round 33, swarmlean) What each ◎ mission costs in tokens, measured with the fake engines: the app runs every mission
// once on a typical request in a chat with three earlier exchanges (dev/checks/mission-tokens.js), the fakes log what
// each engine run was sent (FAKE_TOKEN_LOG: system prompt, new message, the conversation a resumed session re-reads)
// and this adds it up per mission. Tokens ≈ characters / 4, like mcp/cost.js. Output tokens are the fakes' short
// scripted replies padded to a typical length (FAKE_REPLY_CHARS, default 1,600 characters ≈ 400 tokens).
//   node dev/mission-tokens.js                     # run + table
//   node dev/mission-tokens.js --save after.json   # also keep the numbers
//   node dev/mission-tokens.js --compare before.json after.json
//   node dev/mission-tokens.js --only swarm,duo
// "cached" = the part of a run's input a prompt cache can serve: a resumed session's earlier conversation + system
// prompt, or the longest prefix it shares with an earlier run on the same engine and model (byte-stable prompts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const tok = (n) => Math.ceil(n / 4);
const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// next: the following normal message's fresh input (what the mission's carried outcome adds to the chat afterwards)
function table(rows, title) {
  const lines = [title, `${'mission'.padEnd(10)} runs  input   cached  fresh   output  total   next(fresh)  models`];
  for (const [id, r] of Object.entries(rows)) {
    if (id.endsWith(':next')) continue;
    const n = rows[`${id}:next`];
    lines.push(`${id.padEnd(10)} ${String(r.runs).padStart(4)}  ${k(r.input).padStart(6)}  ${k(r.cached).padStart(6)}  ${k(r.input - r.cached).padStart(6)}  ${k(r.output).padStart(6)}  ${k(r.input + r.output).padStart(6)}  ${(n ? k(n.input - n.cached) : '-').padStart(11)}  ${r.models.join(' ')}`);
  }
  return lines.join('\n');
}

function measure(logFile, windows) {
  const runs = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const commonPrefix = (a, b) => { const n = Math.min(a.length, b.length); let i = 0; while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1; return i; };
  const seen = []; // earlier runs of the same mission: { key, text, id } (caches last minutes: other missions don't count)
  const sessions = new Set();
  const per = {};
  for (const r of runs) {
    const head = `${r.system}\n\u0000\n${r.prompt}`;
    const key = `${r.engine}|${r.model || ''}`;
    const id = Object.entries(windows).find(([, [a, b]]) => r.at >= a && r.at <= b)?.[0];
    let cached = 0;
    if (sessions.has(`${r.engine}|${r.session}`)) cached = r.system.length + r.prior; // a resumed session: system + earlier turns
    else for (const s of seen) if (s.key === key && s.id === id) cached = Math.max(cached, Math.min(commonPrefix(s.text, head), r.system.length + r.prompt.length));
    sessions.add(`${r.engine}|${r.session}`);
    seen.push({ key, text: head, id });
    if (!id) continue;
    const p = (per[id] ||= { runs: 0, input: 0, cached: 0, output: 0, models: [] });
    p.runs += 1;
    p.input += tok(r.system.length + r.prior + r.prompt.length);
    p.cached += tok(cached);
    p.output += tok(r.out);
    const m = `${r.engine === 'codex' ? 'A' : 'C'}:${r.model || 'default'}${r.effort ? `·${r.effort}` : ''}`;
    if (!p.models.includes(m)) p.models.push(m);
  }
  return per;
}

if (args.includes('--compare')) {
  const [a, b] = [opt('--compare'), args[args.indexOf('--compare') + 2]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  console.log(table(a.rows, 'BEFORE'));
  console.log(`\n${table(b.rows, 'AFTER')}`);
  console.log('\nchange (input+output, fresh input):');
  for (const id of Object.keys(a.rows)) {
    if (id.endsWith(':next')) continue;
    const x = a.rows[id]; const y = b.rows[id];
    if (!y) continue;
    const t = (r) => r.input + r.output; const f = (r) => r.input - r.cached;
    console.log(`  ${id.padEnd(10)} ${k(t(x)).padStart(6)} → ${k(t(y)).padStart(6)} (${Math.round((t(y) / t(x) - 1) * 100)}%)   fresh ${k(f(x))} → ${k(f(y))}`);
  }
  process.exit(0);
}

const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mission-tokens-')), 'runs.jsonl');
const smokeArgs = [path.join(__dirname, 'smoke.js'), '--fake-engines', '--check-timeout', '900000', '--script', path.join(__dirname, 'checks', 'mission-tokens.js')];
if (opt('--only')) smokeArgs.push('--eval', `window.__missionTokensOnly = ${JSON.stringify(opt('--only'))}; 'only'`);
const r = spawnSync(process.execPath, smokeArgs, { env: { ...process.env, FAKE_TOKEN_LOG: log, FAKE_DELAY: process.env.FAKE_DELAY || '1', FAKE_REPLY_CHARS: process.env.FAKE_REPLY_CHARS || '1600' }, encoding: 'utf8', maxBuffer: 64 << 20 });
const line = (r.stdout || '').split('\n').find((l) => l.startsWith('{"windows"'));
if (!line) { console.log(r.stdout, r.stderr); process.exit(1); }
const res = JSON.parse(line);
const rows = measure(log, res.windows);
console.log(table(rows, 'tokens per mission (typical request, 3 earlier exchanges)'));
if (Object.values(res.estimates || {}).some(Boolean)) console.log(`\nestimates shown on the picker: ${Object.entries(res.estimates).map(([id, e]) => `${id} ${e ? e.line || e : '-'}`).join(' · ')}`);
console.log(`\nnotes: ${JSON.stringify(res.notes)}`);
if (opt('--save')) fs.writeFileSync(opt('--save'), JSON.stringify({ rows, notes: res.notes, estimates: res.estimates }, null, 2));
if (/problem\(s\)/.test(r.stdout || '')) console.log(r.stdout.slice(r.stdout.indexOf('problem(s)') - 4));
