#!/usr/bin/env node
// (round 86, chatwindow86) a giant chat held WINDOWED (chatwin.js) keeps only part of its messages in the window. The
// array itself never lets "not loaded" pass for "not there" (an unloaded message is a stub whose content throws
// NotLoaded; a write it can't see is refused: dev/chatwindow86-test.js). What this scan holds the code to:
//   A. every file Hearth ships that reads a chat's `.messages` is in AUDIT below, with how it was checked:
//        windowed   reads only what a windowed chat has (its end, its loaded blocks, the small fields of the others:
//                   role / at / usage / flags), or goes through the access layer (chatwin.js)
//        load-all   loads the chat whole first (Native.loadWhole / ChatWin.whole) before reading it
//        thread     its whole-chat part is worked out on the store thread from the file (chatCalc / chatFind)
//        throws     may reach an unloaded message's content: it then stops with NotLoaded (nothing changed, the chat
//                   loads whole in the background and trying again works); a command run by Commands.exec is run
//                   again by itself once the chat is whole
//        not-chat   not a live chat (an import's or a project's own list, a version, a copy made here, a fixture)
//      with the number of lines reading `.messages`: a new reading (or a new file) fails until it's looked at and
//      the count updated here
//   B. no line turns a failed read of messages into an empty answer (`.catch(() => [])`, `catch { … = [] }` next to
//      `.messages`): "not loaded" / "can't be read" must never become "none"
//   node dev/chatwin-scan.js            (unit:chatwin-scan) → "N files, 0 problems" or FAIL lines
//   node dev/chatwin-scan.js --list     the files and their counts (to update AUDIT after a review)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['dev', 'docs', 'data', 'electron', 'electron-mac', 'node_modules', '.git', '.claude', 'mac', 'assets', 'tools/basisu', 'lib']);
// [file, lines reading .messages, how, why]
const AUDIT = [
  ['a11y.js', 1, 'windowed', 'the last message (at(-1))'],
  ['access.js', 2, 'windowed', 'its own fields; your last 3 messages / last message of yours by role, from the end'],
  ['activity.js', 4, 'windowed', 'the last message (at(-1))'],
  ['addons-cmds.js', 2, 'windowed', 'the last reply by role; the other line is an import count'],
  ['aiundo.js', 2, 'throws', "an undo finds its reply from the end (an old one's big aiChanges throws); a windowed chat is redrawn without reading its older messages (round 86)"],
  ['appui-dialogs.js', 2, 'not-chat', 'a chat in Recently deleted (a file read for its preview)'],
  ['astra-connect.js', 1, 'windowed', 'a steering message pushed at the end (Codex: unchanged)'],
  ['astra-workspace.js', 2, 'windowed', 'a copy it makes; the last usage from the end (Codex: unchanged)'],
  ['astra.js', 22, 'throws', 'pushes, lookups by role / from the end, withContext (rows from the end, round 86); the handoff lines (/handoff) read every text: they throw, the command runs again once the chat is whole (Codex: unchanged)'],
  ['attachlean.js', 2, 'windowed', 'the message count'],
  ['autocompact.js', 6, 'thread', 'the "continue lighter?" decision from the store thread (chatCalc); continuing lighter loads the chat whole first'],
  ['bigchat-core.js', 4, 'not-chat', "the store thread's byte-level code on files"],
  ['board-plus.js', 1, 'throws', "every picture of a chat (an explicit action): an old message's big images list throws"],
  ['cachewise.js', 1, 'windowed', "the last reply's usage, from the end"],
  ['chat-calm.js', 1, 'windowed', 'the message under the pointer (drawn: loaded)'],
  ['chat-cmds.js', 33, 'throws', 'commands on the chat on screen: lookups by role / index read small fields; whatever reads older content throws and Commands.exec runs it again once the chat is whole (round 86); /export loads it whole first; Chat stats (stats, moved from native.js in round 93) runs after Native has loaded the chat whole'],
  ['chat-cost.js', 6, 'throws', 'counts by role, the last messages from the end; the nearest "ctx" from the end throws when it is old'],
  ['chat-fresh.js', 4, 'throws', "the last usage / ctx from the end; a fresh summary found by its flag (its text throws when it's old: /fresh edit runs again whole)"],
  ['chat-live.js', 1, 'windowed', 'the last reply, from the end'],
  ['chat-media.js', 1, 'windowed', 'the reply holding its things, from the end (round 86: findLast)'],
  ['chat-memory.js', 1, 'windowed', 'the last 31 messages'],
  ['chat-reach.js', 3, 'windowed', 'a reply found from the end (round 86: findLast); waiting things in the loaded messages of a windowed chat (round 86); the last opens from the end'],
  ['chat-refs.js', 1, 'thread', "@file: paths in messages from the end until 12; a windowed chat's older messages walked on the store thread from the file (chatwin.js scan → chatScan, round 87: first try)"],
  ['chat-rest.js', 7, 'windowed', 'resting blocks: woken by range first, let go when they rest (round 86); find by the store thread'],
  ['chat-things.js', 2, 'windowed', 'a message by index (drawn); every thing made in the chat ("Made here", /things): a windowed chat\'s older replies\' things from their records (chatwin.js things, round 87: first try; a list ≥ 4 KB isn\'t in its record and still throws)'],
  ['chat-ux.js', 3, 'windowed', 'the message just bookmarked (loaded first: toggleMark); the last reply'],
  ['chatexport-core.js', 3, 'load-all', '/export loads the chat whole first (chat-cmds.js)'],
  ['chatparse-worker.js', 1, 'not-chat', 'a worker parsing bytes'],
  ['chatcalc-core.js', 2, 'not-chat', 'store thread: the parsed file (the whole way) and its records per message (round 87)'],
  ['chatsafe.js', 2, 'windowed', 'the read-only reader (never a windowed chat): a chat under 8 MB as read; a giant one by range from the store thread, its last messages then "Show earlier" a page at a time (round 87: never read whole on the main process)'],
  ['chatwin-core.js', 1, 'windowed', 'the access layer itself'],
  ['chatwin.js', 15, 'windowed', 'the access layer itself'],
  ['comp-dispatch.js', 3, 'windowed', 'count, push, the last message'],
  ['context-core.js', 2, 'not-chat', 'pure: the list it is handed (its callers are listed)'],
  ['costcoach-core.js', 1, 'not-chat', "main process: a chat file's records"],
  ['crashsafe-core.js', 1, 'windowed', 'pure: messages after a time (at, role)'],
  ['crashsafe.js', 1, 'windowed', 'messages pushed at the end'],
  ['datasafe-core.js', 7, 'not-chat', 'main process: copies of data files'],
  ['datasafe.js', 2, 'not-chat', 'counts shown in the Data safety dialog'],
  ['datasafemain.js', 9, 'not-chat', 'main process: data files'],
  ['devreport.js', 3, 'throws', "a bug report: the last tool reply from the end (an old one's tools throw), the last 3 by role"],
  ['director-task.js', 2, 'windowed', 'count; the last three messages read from the end (round 86)'],
  ['engine-health.js', 2, 'windowed', 'count, the last message'],
  ['flows-ui.js', 1, 'windowed', 'the last reply, from the end'],
  ['handoff.js', 14, 'load-all', 'a brief / the whole chat / earlier messages: the chat loaded whole first (round 86)'],
  ['historylean-core.js', 8, 'not-chat', 'pure: the chat it is handed (historylean.js hands a windowed one to the store thread)'],
  ['historylean.js', 7, 'thread', 'the lighter history and its inputs from the store thread (chatCalc lean, round 86)'],
  ['hooks.js', 2, 'windowed', 'the last message, your last message from the end'],
  ['importer.js', 6, 'not-chat', 'chats being imported'],
  ['invite.js', 1, 'not-chat', 'an app named Messages'],
  ['jam.js', 5, 'windowed', 'push; the last jam message from the end; includes() by identity'],
  ['makes.js', 4, 'windowed', 'the last reply from the end, counts by role'],
  ['meter.js', 3, 'windowed', 'usage totals and lookups (small fields)'],
  ['missions.js', 11, 'windowed', 'push, the last message, lookups by role / time / mission (small fields), a result inserted after its message near the end'],
  ['tools/three-chatlink.js', 1, 'windowed', 'round 92: reads only messages.length (the true count) to tell a brand-new chat'],
  ['native.js', 73, 'windowed', 'converted (round 86): drawing, saving, find / jump, actions on old messages load their block, branch / stats / second opinion / compact load the chat whole (round 93: stats counted in chat-cmds.js)'],
  ['nodes-code.js', 1, 'throws', 'the code blocks of the whole chat (the Nodes view, an explicit action): older ones throw'],
  ['notes.js', 1, 'windowed', 'your last message by role'],
  ['offline-project.js', 1, 'not-chat', 'main process: whether a chat file is here'],
  ['offline.js', 33, 'throws', 'retries and the calm lines at the end (pushes, the last messages, splices near the end); "pick up with the other AI" reads every older text: it throws'],
  ['projbundle-core.js', 4, 'not-chat', "a project bundle's own list"],
  ['projbundle-work.js', 4, 'not-chat', 'main-process thread: chat files'],
  ['projbundle.js', 1, 'not-chat', 'a gathered chat (a giant one is a stand-in)'],
  ['projects-cmds.js', 1, 'not-chat', 'search results'],
  ['projfind-core.js', 1, 'not-chat', 'store thread: chat files'],
  ['questguide.js', 1, 'not-chat', "a quest context's list (Codex: unchanged)"],
  ['quickstart-core.js', 6, 'not-chat', 'a count'],
  ['quickstart-hooks.js', 1, 'windowed', 'the count'],
  ['quickstart.js', 2, 'windowed', 'the count; missions of the messages (a small field)'],
  ['recall-core.js', 1, 'not-chat', 'store thread: chat files'],
  ['recall.js', 1, 'not-chat', "a search result's count"],
  ['router.js', 6, 'windowed', 'the last reply and its route from the end, roles'],
  ['routerlearn.js', 3, 'windowed', 'count, your last message from the end, roles'],
  ['routine-feedback.js', 3, 'throws', 'visual feedback compares the whole conversation (JSON): it throws on a windowed chat'],
  ['routines.js', 8, 'windowed', 'the last message, the last usage from the end'],
  ['safetynet.js', 1, 'windowed', 'your last 8 messages (roles, then the end)'],
  ['sendpreview-core.js', 2, 'not-chat', 'pure: the chat it is handed (sendpreview.js hands a windowed one to the store thread)'],
  ['sendpreview.js', 8, 'thread', 'the history it re-reads from the store thread (chatCalc preview, round 86); calibration skips a windowed chat'],
  ['store.js', 7, 'not-chat', 'main process: chat files'],
  ['storework.js', 15, 'not-chat', 'store thread: chat files'],
  ['swarmlean.js', 3, 'throws', "a mission's estimate sums every text (in a try: no estimate)"],
  ['sync-conflicts.js', 2, 'not-chat', 'two versions of a chat from sync'],
  ['sync-panel.js', 3, 'not-chat', 'two versions of a chat from sync'],
  ['tokenaudit.js', 1, 'windowed', 'the last message'],
  ['tokenauditmain.js', 1, 'not-chat', 'main process'],
  ['tools/quest-chat-core.js', 5, 'windowed', "the last 12 messages of a chat; a context's own list (Codex: unchanged)"],
  ['tools/quest-chat.js', 3, 'windowed', "a context's list; a message found by its time (Codex: unchanged)"],
  ['tools/quest-journal.js', 5, 'throws', "a message picked from a chat's list (its text throws when old) (Codex: unchanged)"],
  ['tools/quest-proof.js', 2, 'windowed', 'the last 60 messages (Codex: unchanged)'],
  ['tools/quest-review.js', 3, 'throws', "a proof's message found by its text (throws when old) (Codex: unchanged)"],
  ['tools/three-stage-midi.js', 1, 'not-chat', 'MIDI message counts'],
  ['versions-core.js', 4, 'not-chat', 'earlier versions (copies)'],
  ['versions.js', 2, 'not-chat', "an earlier version's preview"],
  ['versionsmain.js', 3, 'not-chat', 'main process: copies'],
  ['visual-feedback-core.js', 1, 'throws', "pure: the recent messages by role and text (a windowed chat's older texts throw)"],
  ['visual-feedback.js', 1, 'throws', 'the recent messages of the project chat (throws on older texts)'],
  ['voice.js', 2, 'windowed', 'the last message'],
];
const READ = /[\w)\]?]\.messages\b(?!-)/;
const EMPTY = /\.messages\b[^\n]*(?:\.catch\(\s*\(\)\s*=>\s*(?:\[\]|''|0|null)\s*\)|catch\s*(?:\([^)]*\))?\s*\{[^}]*(?:=\s*(?:\[\]|''|0)|return\s+(?:\[\]|''|0))\s*;?\s*\})/;

function files(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}${e.name}`;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !SKIP.has(r)) out.push(...files(path.join(dir, e.name), `${r}/`)); } else if (/\.(?:m?js|cjs)$/.test(e.name)) out.push(r);
  }
  return out;
}
function scan() {
  const problems = []; const counts = new Map(); const empties = [];
  for (const f of files()) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    let n = 0;
    lines.forEach((l, i) => {
      if (/^\s*\/\//.test(l) || !READ.test(l)) return;
      n += 1;
      if (EMPTY.test(l) && !EMPTY_OK.some(([ff, piece]) => ff === f && l.includes(piece))) empties.push(`${f}:${i + 1}: a failed read of messages turned into an empty answer (${l.trim().slice(0, 140)})`);
    });
    if (n) counts.set(f, n);
  }
  const listed = new Map(AUDIT.map((a) => [a[0], a]));
  for (const [f, n] of counts) {
    const a = listed.get(f);
    if (!a) problems.push(`${f}: reads .messages on ${n} line(s) and isn't in AUDIT (look at each: does it read a windowed chat's older messages? then route it, load the chat whole first, or let it throw; add it with how)`);
    else if (a[1] !== n) problems.push(`${f}: AUDIT says ${a[1]} line(s) read .messages, now ${n}: look at the new or changed ones, then update the count`);
    else if (!['windowed', 'load-all', 'thread', 'throws', 'not-chat'].includes(a[2])) problems.push(`${f}: AUDIT's "how" (${a[2]}) isn't one of windowed / load-all / thread / throws / not-chat`);
  }
  for (const [f] of listed) if (!counts.has(f)) problems.push(`${f}: in AUDIT but reads no .messages any more (remove it)`);
  problems.push(...empties);
  return { files: counts.size, counts, problems };
}
// [file, a piece of the line, why it's fine]
const EMPTY_OK = [
  ['datasafemain.js', 'n = o.store.getChat(c.id)?.messages?.length || 0; } catch { n = 0; }', 'main process: a count shown next to a chat waiting for its AI in Data safety (display only, nothing written from it)'],
];

if (require.main === module) {
  const r = scan();
  if (process.argv.includes('--list')) { for (const [f, n] of [...r.counts].sort()) console.log(`  ['${f}', ${n}],`); process.exit(0); }
  // the scan catches each kind (a quick self-test on made-up lines)
  const self = [];
  for (const bad of ['const t = chat.messages.map((m) => m.text).catch(() => [])', 'try { x = chat.messages.filter(f); } catch { x = []; }', 'try { return c.messages.length; } catch { return 0; }']) if (!(READ.test(bad) && EMPTY.test(bad))) self.push(`the scan misses: ${bad}`);
  for (const good of ['const n = chat.messages.length;', "list.closest('.messages-wrap')", "document.querySelector('.messages')", 'try { x = chat.messages.at(-1); } catch (err) { console.warn(err); }']) if (READ.test(good) && EMPTY.test(good)) self.push(`the scan wrongly flags: ${good}`);
  if (READ.test("node.closest('.messages')") || READ.test('el.messages-wrap')) self.push('the scan counts a CSS selector');
  const all = [...self, ...r.problems];
  for (const p of all) console.log(`FAIL ${p}`);
  console.log(`${r.files} files read .messages, ${all.length} problem(s)`);
  process.exit(all.length ? 1 : 0);
}
module.exports = { scan, AUDIT };
