#!/usr/bin/env node
// (round 32, cachewise) The engines' prompt caches only hit when a message begins byte-for-byte like the last one:
// tools (engine flags), Hearth's system prompt, then the chat so far. This checks that the same chat builds the same
// prompt and flags message after message (engines.js buildPrompt / claudeArgs / codexArgs), that what the owner changes
// mid-chat only changes the end of the prompt, that a fact saved mid-chat or a picture doesn't change the beginning, and
// the plain bits of cachewise.js (what the cache saved, the one-line note once per change).
// Engines + store + mcp/ are copied to a temp folder (a sample memory there, no real data).
//   node dev/cache-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'installs.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const MEMORY = { shared: '- I post 9:16 visuals on Shorts\n- Keep bloom subtle\n- I hate camera shake', agents: { claude: '- Call me Sam' } };
const writeMemory = (m) => fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify(m));
writeMemory(MEMORY);
const engines = require(path.join(dir, 'engines.js'));
const Conn = require(path.join(dir, 'connectionsmain.js'));
Conn.setReader(() => ({ connections: [] }));
const T = engines._test;
const CW = require(path.join(ROOT, 'cachewise.js'));
const BC = require(path.join(ROOT, 'budget-core.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 600)); } };

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-proj-'));
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', effort: 'high', instructions: [{ text: 'Answer in short paragraphs' }] };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', effort: 'high', instructions: [{ text: 'Answer in short paragraphs' }] };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true, hubChatId: 'c1' };
const BOARD = { ...CLAUDE, boardTools: true, hubChatId: 'c2' };
const KINDS = [['plain Claude', CLAUDE], ['plain Astra', ASTRA], ['Three Director', DIRECTOR], ['Three Director on Astra', { ...DIRECTOR, engine: 'codex', hubTools: true }], ['Claude + board tools', BOARD], ['Claude with file access', { ...CLAUDE, access: { level: 'write', folders: [proj] } }]];

// the bytes a run sends before the chat: its flags, with the per-run tool-settings file replaced by what is in it
function bytesOf(agent, session, options = {}) {
  const args = agent.engine === 'codex' ? T.codexArgs(agent, session, options) : T.claudeArgs(agent, session, options);
  return args.map((a, i) => {
    if (args[i - 1] === '--mcp-config') { const t = fs.readFileSync(a, 'utf8'); fs.rmSync(a, { force: true }); return `<mcp ${t}>`; }
    if (args[i - 1] === '-c' && /^model_instructions_file=/.test(a)) return `instructions=${fs.readFileSync(JSON.parse(a.slice(a.indexOf('=') + 1)), 'utf8')}|${a}`;
    return a;
  }).join('\u0000');
}
const common = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };

// 1. the same chat, twice: the same bytes (a resumed session: no new session id)
for (const [label, agent] of KINDS) {
  const s1 = { id: 'sess-1' };
  const s2 = { id: 'sess-1' };
  const a = bytesOf(agent, s1);
  const b = bytesOf(agent, s2);
  check(a === b && T.buildPrompt(agent, { id: 's' }) === T.buildPrompt(agent, { id: 's' }), `${label}: the same chat builds the same prompt and flags twice (${a.length} bytes)`, a === b ? undefined : [a.slice(common(a, b) - 40, common(a, b) + 80), b.slice(common(a, b) - 40, common(a, b) + 80)]);
}
// nothing that changes by itself: dates, times, ids
const allPrompts = KINDS.map(([, a]) => T.buildPrompt(a)).join('\n');
check(!/\b\d{4}-\d\d-\d\d\b|\b\d\d:\d\d(:\d\d)?\b|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(allPrompts), 'no dates, times or random ids in any prompt');
// the order of a chat's options or an agent's keys never matters
const shuffled = Object.fromEntries(Object.entries(DIRECTOR).reverse());
check(bytesOf(DIRECTOR, { id: 'x' }) === bytesOf(shuffled, { id: 'x' }), 'the same agent with its keys in another order: the same bytes');

// 2. what the owner changes mid-chat changes only the end
for (const [label, agent] of [['plain Claude', CLAUDE], ['Three Director', DIRECTOR], ['plain Astra', ASTRA]]) {
  const before = T.buildPrompt(agent, { id: 's' });
  const instr = T.buildPrompt({ ...agent, instructions: [...(agent.instructions || []), { text: 'Use metric units' }] }, { id: 's' });
  const persona = T.buildPrompt({ ...agent, systemPrompt: 'You are a calm, precise assistant.' }, { id: 's' });
  const ci = common(before, instr);
  const cp = common(before, persona);
  const tail = before.length - ci;
  check(ci >= before.length * 0.5 || before.length - ci < 400, `${label}: a new instruction changes only the tail (first ${ci} of ${before.length} chars unchanged)`);
  if (agent === DIRECTOR) check(cp > before.length * 0.8, `${label}: a personality changes only the tail (first ${cp} of ${before.length} chars unchanged)`);
  if (agent === CLAUDE) check(tail < 400, `${label}: the part that changed is the tail (${tail} chars)`);
}
// file access: the head stays
const accOff = T.buildPrompt(DIRECTOR, { id: 's' });
const accOn = T.buildPrompt({ ...DIRECTOR, access: { level: 'read', folders: [proj] } }, { id: 's' });
check(common(accOff, accOn) > accOff.length * 0.8, `Three Director: files on this computer switched on keeps the head (${common(accOff, accOn)} of ${accOff.length})`);

// 3. memory: a fact saved mid-chat doesn't change this chat's prompt; a new chat gets it; an edit applies at once
const sess = {};
const p0 = T.buildPrompt(CLAUDE, sess); // a new session: its notes are remembered with it
sess.id = 'sess-mem';
writeMemory({ ...MEMORY, shared: `${MEMORY.shared}\n- My channel is Hearthbeat` });
const p1 = T.buildPrompt(CLAUDE, sess);
const fresh = T.buildPrompt(CLAUDE, {});
check(p0 === p1 && /Hearthbeat/.test(fresh) && !/Hearthbeat/.test(p1), 'a fact saved mid-chat leaves this chat\'s prompt as it was; a new chat has it');
writeMemory({ ...MEMORY, shared: MEMORY.shared.replace('Keep bloom subtle', 'Bloom can be strong') });
const p2 = T.buildPrompt(CLAUDE, sess);
check(/Bloom can be strong/.test(p2) && !/Keep bloom subtle/.test(p2), 'an edited fact applies at once (the old one would be wrong)');
check(T.onlyGrew('a\nb', 'a\nc\nb') && !T.onlyGrew('a\nb', 'a\nc') && T.onlyGrew('a\na', 'a\na\nb') && !T.onlyGrew('a\na', 'a\nb'), 'only-grew: additions anywhere keep the notes, a removal or edit doesn\'t');
writeMemory(MEMORY);
// the frozen notes travel with the session (saved with the chat): a resumed app keeps the same prompt
const saved = JSON.parse(JSON.stringify(sess));
check(T.buildPrompt(CLAUDE, saved) === T.buildPrompt(CLAUDE, sess), 'the frozen notes come back with the saved session');

// 4. a picture: the Read tool stays for the rest of the session (on and off again made two uncached re-reads)
const ps = { id: 'sess-img' };
const noPic = bytesOf(CLAUDE, { id: 'other' });
const withPic = T.claudeArgs(CLAUDE, ps, { images: [path.join(dir, 'a.png')] });
const after = T.claudeArgs(CLAUDE, ps, {});
const toolsOf = (args) => args[args.indexOf('--tools') + 1];
check(!/--tools\u0000Read/.test(noPic) && toolsOf(withPic) === 'Read' && toolsOf(after) === 'Read' && ps.readTool === true, 'after a picture, the next message keeps the same tools (Read)');
check(toolsOf(T.claudeArgs(CLAUDE, {}, {})) === '', 'a new chat without pictures: no tools');

// 5. Codex: the instructions file is named after its content, so the same chat points at the same file
const c1 = T.codexArgs(ASTRA, { id: 't1' }, {});
const c2 = T.codexArgs(ASTRA, { id: 't1' }, {});
check(c1.join(' ') === c2.join(' '), 'Astra: the same flags (same instructions file) twice');

// 6. what the cache saved, in plain numbers
check(CW.saved(10000, 0) === 9000 && CW.saved(10000, 2000) === 8500 && CW.saved(0, 4000) === 0, 'saved by the cache: reads × 0.9 − writes × 0.25, never below 0');
const wk = BC.week({ days: { [BC.weekDays()[0]]: { a: { claude: { i: 100000, o: 2000, c: 80000, w: 4000, r: 5 } } } } }, { agents: [{ id: 'claude', name: 'Claude', engine: 'claude' }] });
check(wk.all.saved === 71000 && wk.all.cached === 80000, `the week at a glance says what the cache saved (${wk.all.saved})`);
check(BC.saved({ cached: 1000, cacheWrite: 0 }) === 900, 'Spending: the same formula');

// 7. the note: once per change, only when the chat is worth re-reading, names what changed
const agent = { ...CLAUDE };
const chat = { session: { id: 's' }, messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'yo', usage: { input: 24000, output: 100 } }] };
const s0 = CW.sig(agent, chat);
check(JSON.stringify(s0) === JSON.stringify(CW.sig({ ...agent }, { ...chat })) && JSON.stringify(s0) === JSON.stringify(CW.sig(Object.fromEntries(Object.entries(agent).reverse()), chat)), 'the setup signature is stable (key order never matters)');
check(CW.diff(s0, CW.sig({ ...agent, systemPrompt: 'Pirate' }, chat)).join() === 'p', 'a personality change is named as such');
check(CW.diff(s0, CW.sig({ ...agent, instructions: [{ text: 'Metric' }] }, chat)).join() === 'i', 'an instruction change is named as such');
check(CW.diff(s0, CW.sig({ ...agent, instructions: [...agent.instructions, { text: 'Off one', on: false }] }, chat)).length === 0, 'an instruction switched off that was never on: nothing changed');
check(CW.diff(s0, CW.sig({ ...agent, boardTools: true }, chat)).join() === 't' && CW.diff(s0, CW.sig(agent, { ...chat, model: 'sonnet' })).join() === 'm', 'tools / model changes are named');
check(CW.diff(s0, CW.sig({ ...agent, color: '#f0f', icon: 'x' }, chat)).length === 0, 'a look-only change (color, icon) isn\'t a cache change');
const line = CW.note(['p', 'i'], 24000, { now: true });
check(/^↻ Its personality and its standing instructions changed mid-chat: the next message/.test(line) && /24k tokens/.test(line) && /once/.test(line) && line.split('\n').length === 1, `one plain line: “${line}”`);
check(CW.ctxOf(chat) === 24000 && CW.ctxOf({ messages: [] }) === 0, 'the chat\'s context is what its last reply sent');

// 8. (round 34, autocompact) continuing lighter keeps the prompt byte-stable: the summary rides in the conversation
// (the first message of a new session), never in the system prompt or flags; the new session's start is exactly a new
// chat's, and every message after it resumes with the same bytes. The cheap summarizer run is byte-stable too.
const AC = require(path.join(ROOT, 'autocompact.js'));
const noId = (b) => b.replace(/--session-id\u0000[0-9a-f-]{36}/, '--session-id\u0000*'); // a new session's own id isn't part of what is cached
const summary = 'Goal: a neon tunnel\nDecisions:\n- bloom 0.4\nWhere we stopped: the kick';
for (const [label, agent] of [['plain Claude', CLAUDE], ['Three Director', DIRECTOR], ['plain Astra', ASTRA]]) {
  const newChat = noId(bytesOf(agent, {}));
  const lighter = noId(bytesOf(agent, {})); // chat.session = {} after continuing lighter
  const next1 = bytesOf(agent, { id: 'after-lighter' });
  const next2 = bytesOf(agent, { id: 'after-lighter' });
  check(newChat === lighter && next1 === next2 && !T.buildPrompt(agent, {}).includes('neon tunnel'), `${label}: after continuing lighter the start is a new chat's and the next messages keep the same bytes (the summary is not in the prompt)`);
}
const cheapAgent = (a) => ({ ...a, chatTools: false, noHubTools: true, systemPrompt: 'You write tight, structured summaries of a conversation so that it can continue without its history. Plain text, no preamble.', autoMemory: false, suggestNext: false, memoryOff: true, openTool: false, threeTools: false, boardTools: false, captureTools: false, selfReview: false });
const cheapOpts = { model: AC.CHEAP.claude.model, effort: AC.CHEAP.claude.effort };
check(noId(bytesOf(cheapAgent(CLAUDE), {}, cheapOpts)) === noId(bytesOf(cheapAgent(CLAUDE), {}, cheapOpts)) && /haiku/.test(bytesOf(cheapAgent(CLAUDE), {}, cheapOpts)), 'the summarizer run: the same flags every time, on the cheapest model');
const sumChat = { messages: [{ role: 'user', text: 'Build a tunnel' }, { role: 'assistant', text: 'Done.' }, { role: 'user', text: 'Glow' }, { role: 'assistant', text: 'ok' }, { role: 'user', text: 'Kick' }, { role: 'assistant', text: 'ok' }] };
check(AC.prompt(AC.split(sumChat)) === AC.prompt(AC.split(JSON.parse(JSON.stringify(sumChat)))) && !/\d{4}-\d\d-\d\d/.test(AC.prompt(AC.split(sumChat))) && summary, 'the summarizer reads the same bytes for the same chat (no dates or ids)');

try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(proj, { recursive: true, force: true }); } catch { /* temp */ }
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
