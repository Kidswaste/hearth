#!/usr/bin/env node
// Unit checks for round 52's chatkeep (no Electron, throwaway folders only):
//   · the engines' own records of a conversation (Claude Code's projects/*.jsonl, Codex's sessions rollout) become
//     chats; one your chats already hold (its session, or what you asked in it) is not offered
//   · chats on disk the list didn't show (their AI removed / turned off) and the AI they come back to
//   · 🛟 Recover… (datasafemain.scan / recover) finds both, and a chat save the store gave up on, and brings them back
//   · data/devreport-crashes.json: a page crash keeps its reason and the memory, the page that came back adds what it
//     knew, a reload on purpose is kept (and isn't offered as a crash)
//   · the session marker: an unclean last run is "the last exit" for the whole session
//   node dev/chatkeep-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DS = require(path.join(ROOT, 'datasafe-core.js'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-chatkeep-'));

(async () => {
  // ---------- an engine's own record ----------
  const t0 = Date.parse('2026-10-15T10:00:00Z');
  const iso = (k) => new Date(t0 + k * 1000).toISOString();
  const claudeLines = [
    { type: 'user', sessionId: 'sess-1', cwd: '/x/data/workspace', timestamp: iso(0), message: { role: 'user', content: 'Clink: make the coins spin on every kick' } },
    { type: 'assistant', sessionId: 'sess-1', timestamp: iso(2), message: { content: [{ type: 'text', text: 'On it.' }, { type: 'tool_use', name: 'mcp__hub-three__three_edit_code' }] } },
    { type: 'user', sessionId: 'sess-1', timestamp: iso(3), message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'assistant', sessionId: 'sess-1', timestamp: iso(4), message: { content: [{ type: 'text', text: 'The coins spin on each kick now.' }] } },
    { type: 'user', sessionId: 'sess-1', timestamp: iso(9), isMeta: true, message: { role: 'user', content: '<system-reminder>x</system-reminder>' } },
    { type: 'user', sessionId: 'sess-1', timestamp: iso(10), message: { role: 'user', content: [{ type: 'text', text: 'Faster please' }] } },
    { type: 'assistant', sessionId: 'sess-1', timestamp: iso(12), message: { content: [{ type: 'text', text: 'Twice as fast.' }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  const sc = DS.sessionChat(claudeLines, { engine: 'claude' });
  ok(sc && sc.sessionId === 'sess-1' && sc.messages.length === 4, 'claude: two asks, two answers');
  ok(sc.messages[1].text === 'On it.\n\nThe coins spin on each kick now.', 'claude: one answer per turn (tool steps between are joined)');
  ok(sc.three && sc.startedAt === t0 && sc.updatedAt === t0 + 12000, 'claude: a Lab conversation, with its times');
  const codexLines = [
    { type: 'session_meta', timestamp: iso(0), payload: { id: 'th-9', cwd: '/x/data/workspace' } },
    { type: 'response_item', timestamp: iso(1), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
    { type: 'response_item', timestamp: iso(2), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Make the level darker' }] } },
    { type: 'response_item', timestamp: iso(3), payload: { type: 'function_call', name: 'three_do' } },
    { type: 'response_item', timestamp: iso(4), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Darker now.' }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  const xc = DS.sessionChat(codexLines, { engine: 'codex' });
  ok(xc && xc.sessionId === 'th-9' && xc.messages.length === 2 && xc.three, 'codex: the ask and the answer (its context lines left out)');
  ok(DS.sessionChat('{"type":"user","message":{"content":"only a question"}}', { engine: 'claude' }) === null, 'no answer: nothing to offer');
  ok(DS.sessionKnown(sc, { sessions: new Set(['sess-1']), asks: new Set() }), 'known by its session');
  ok(DS.sessionKnown(sc, { sessions: new Set(), asks: new Set([DS.textKey('Clink: make the coins spin on every kick'), DS.textKey('Faster please')]) }), 'known by what you asked (a fresh session of a chat you have)');
  ok(!DS.sessionKnown(sc, { sessions: new Set(['other']), asks: new Set(['something else entirely']) }), 'unknown: offered');
  const agents = [{ id: 'claude', mode: 'native', engine: 'claude' }, { id: 'astra', mode: 'native', engine: 'codex' }, { id: 'threedirector', mode: 'native', engine: 'claude', dock: 'three', threeTools: true }];
  const chat = DS.chatFromSession(sc, DS.homeFor({ agentId: null }, agents, { three: sc.three, engine: 'claude' }));
  ok(chat.agentId === 'threedirector' && chat.session.id === 'sess-1' && /\(recovered\)$/.test(chat.title) && chat.messages.length === 4, 'a Lab conversation comes back to the director, its session kept (it can go on)');

  // ---------- chats the list didn't show ----------
  const rows = [{ id: 'threedirector2-a', agentId: 'threedirector2' }, { id: 'claude-b', agentId: 'claude' }, { id: 'astra-old', agentId: 'astra' }];
  const off = agents.map((a) => (a.id === 'astra' ? { ...a, enabled: false } : a));
  const hid = DS.hiddenChats(rows, off);
  ok(hid.map((c) => c.id).join() === 'threedirector2-a,astra-old', 'hidden: an AI removed, an AI turned off');
  ok(DS.homeFor(rows[0], off) === 'threedirector', 'a removed director\'s chat → the director docked in the Lab now');
  ok(DS.homeFor(rows[2], off) === 'claude', 'a turned-off Astra\'s chat → Claude (no Astra on)');

  // ---------- 🛟 Recover… end to end on a throwaway data folder ----------
  const D = path.join(tmp, 'data'); const home = path.join(tmp, 'home'); const ws = path.join(D, 'workspace');
  for (const d of [path.join(D, 'chats'), path.join(D, 'trash'), path.join(D, '.held', 'chats'), ws]) fs.mkdirSync(d, { recursive: true });
  const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v)); };
  write(path.join(D, 'chats', 'threedirector2-a.json'), { id: 'threedirector2-a', agentId: 'threedirector2', title: 'Clink level 2', updatedAt: t0, messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'yo' }] });
  write(path.join(D, 'chats', 'claude-b.json'), { id: 'claude-b', agentId: 'claude', title: 'Notes', updatedAt: Date.now(), session: { id: 'sess-known' }, messages: [{ role: 'user', text: 'what is up' }, { role: 'assistant', text: 'all good' }] });
  write(path.join(D, '.held', 'chats', 'threedirector-held.json'), { id: 'threedirector-held', agentId: 'threedirector', title: 'Held save', updatedAt: t0, messages: [{ role: 'user', text: 'x' }] });
  const enc = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');
  const pdir = path.join(home, '.claude', 'projects', enc(ws));
  const now = Date.now();
  const fresh = claudeLines.replace(/2026-10-15T10:00:\d\d\.000Z/g, (m) => new Date(now - 3600e3 + (Date.parse(m) - t0)).toISOString());
  write(path.join(pdir, 'sess-1.jsonl'), fresh);
  write(path.join(pdir, 'sess-known.jsonl'), [{ type: 'user', sessionId: 'sess-known', timestamp: new Date().toISOString(), message: { content: 'what is up' } }, { type: 'assistant', sessionId: 'sess-known', message: { content: [{ type: 'text', text: 'all good' }] } }].map((x) => JSON.stringify(x)).join('\n'));
  const files = () => fs.readdirSync(path.join(D, 'chats')).filter((f) => f.endsWith('.json'));
  const readC = (id) => { try { return JSON.parse(fs.readFileSync(path.join(D, 'chats', `${id}.json`), 'utf8')); } catch { return null; } };
  const store = {
    listChats: () => files().map((f) => { const c = readC(f.slice(0, -5)); return { id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt }; }),
    getChat: (id) => readC(id), saveChat: (c) => write(path.join(D, 'chats', `${c.id}.json`), c),
    getMemory: () => ({}), saveMemory: () => {}, getKV: () => null, setKV: () => {},
  };
  const cfg = { read: () => ({ agents, settings: { backupDir: path.join(tmp, 'no-backups') } }), save: () => ({ ok: true }) };
  const DM = require(path.join(ROOT, 'datasafemain.js'));
  DM._set({ dataDir: D, configPath: path.join(tmp, 'config.json'), store, cfg, syncmain: null, home, workspace: ws });
  const r = await DM.scan({});
  const by = (id) => r.chats.find((c) => c.id === id);
  ok(by('threedirector2-a')?.state === 'hidden' && /its AI was removed/.test(by('threedirector2-a').from), 'Recover lists the chat whose AI was removed');
  ok(by('threedirector-held') && /couldn't reach its file/.test(by('threedirector-held').from), 'Recover lists a save the store gave up on');
  const eng = r.chats.filter((c) => /own record/.test(c.from));
  ok(eng.length === 1 && eng[0].agentId === 'threedirector' && eng[0].messages === 4, 'Recover lists the Lab conversation only Claude Code still has (not the one your chat holds)');
  const quick = await DM.scan({ quick: true });
  ok(!quick.chats.some((c) => /own record/.test(c.from)), 'a quick look leaves the engines\' records alone');
  const r2 = await DM.scan({});
  const done = await DM.recover(r2.chats.map((c) => c.key));
  ok(readC('threedirector2-a')?.agentId === 'threedirector' && readC('threedirector2-a').agentWas === 'threedirector2', 'brought back: the hidden chat goes to the director (its file stays, only its AI changes)');
  const back = files().map((f) => readC(f.slice(0, -5))).find((c) => c.session?.id === 'sess-1');
  ok(back && back.agentId === 'threedirector' && back.messages.length === 4, 'brought back: the engine\'s conversation is a chat again, with its session');
  ok(readC('threedirector-held')?.messages?.length === 1 && done.chats.length === 3, 'brought back: the held save');
  const r3 = await DM.scan({});
  ok(!r3.chats.length, 'a second look finds nothing more (nothing offered twice)');

  // ---------- data/devreport-crashes.json ----------
  const DR = require(path.join(ROOT, 'devreportmain.js'));
  const cf = path.join(tmp, 'devreport-crashes.json');
  DR._setCrashFile(cf);
  DR.noteCrash('page', 'Hearth: oom', { reason: 'oom', code: null });
  ok(DR.annotate({ lastMemory: { heapMB: 3900 }, showing: 'tool:three' }), 'the page that came back adds what it knew');
  ok(!DR.annotate({ again: true }), 'only once');
  DR.noteCrash('reload', 'Ctrl+Shift+R pressed');
  const list = JSON.parse(fs.readFileSync(cf, 'utf8'));
  ok(list[0].reason === 'oom' && list[0].mem && list[0].page.lastMemory.heapMB === 3900, 'the crash: its reason, the memory, the page\'s last reading');
  ok(list[1].kind === 'reload' && list[1].seen, 'the reload on purpose is kept, already seen');
  const fresh2 = DR.takeCrashes();
  ok(fresh2.length === 1 && fresh2[0].kind === 'page', 'only the crash is offered to the window');

  // ---------- the last exit ----------
  const SN = require(path.join(ROOT, 'safetynetmain.js'));
  const sd = path.join(tmp, 'sn');
  fs.mkdirSync(path.join(sd, 'safetynet'), { recursive: true });
  fs.writeFileSync(path.join(sd, 'safetynet', 'session.json'), JSON.stringify({ v: 1, pid: 1, started: Date.now() - 6e4, beat: Date.now() - 6e4, clean: false }));
  SN.openSession(sd);
  ok(SN.last()?.kind === 'process', 'an unclean last run is the last exit (the view comes back)');
  SN.pageGone('oom', null);
  ok(SN.last()?.kind === 'page' && SN.last().reason === 'oom', 'a page crash replaces it, with its reason');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify({ pass: true, checks: n }));
})().catch((err) => { console.error(err); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* fine */ } console.log(JSON.stringify({ pass: false, error: err.message, checks: n })); process.exit(1); });
