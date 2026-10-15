// Tell me when… (round 44, notify): the plain part (notify-core.js) and the main side (notifymain.js) with a recorder in
// place of Electron's Notification: which events notify, the switches, the words and actions (a permission's action
// opens the card, never approves), one per chat (replace, don't stack), a burst summed up, an AI waiting for you never
// folded away, focus, clicks (the file revealed without bringing Hearth up; the chat / card told to the window).
//   node dev/notify-test.js
const C = require('../notify-core.js');
const M = require('../notifymain.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const away = { focused: false };

// ---------- which events notify ----------
ok('every type answers to one of the five switches', Object.values(C.TYPE).every((s) => C.IDS.includes(s)) && C.IDS.length === 5);
ok('the switches are Replies · Renders · Keep going · When an AI needs me · Updates', C.SWITCHES.map((s) => s.label).join(' · ') === 'Replies · Renders · Keep going · When an AI needs me · Updates');
ok('defaults: everything on (no setting saved)', Object.values(C.prefs({})).every(Boolean) && C.prefs(undefined).on);
ok('a long reply while away notifies', C.decide({ type: 'reply', ms: 25000 }, away).show);
ok('a short reply does not (the Dock / taskbar number is enough)', C.decide({ type: 'reply', ms: 8000 }, away).why === 'short');
ok('a reply of unknown length (a mission, Astra in a jam) notifies', C.decide({ type: 'reply' }, away).show);
ok('a failed reply notifies even when short', C.decide({ type: 'reply', ms: 3000, failed: true }, away).show);
ok('nothing while Hearth is in front', C.decide({ type: 'reply', ms: 60000 }, { focused: true }).why === 'focused' && C.decide({ type: 'permission' }, { focused: true }).why === 'focused');
ok('render done: > 10 s notifies, a 4 s one does not; a failure always', C.decide({ type: 'render', ms: 15000 }, away).show && !C.decide({ type: 'render', ms: 4000 }, away).show && C.decide({ type: 'render', ms: 1000, failed: true }, away).show);
ok('other long work: only past a minute', !C.decide({ type: 'job', ms: 30000 }, away).show && C.decide({ type: 'job', ms: 90000 }, away).show);
ok('keep going, permission, question, plan, stuck, sync, update, back online all notify', ['keepgoing', 'permission', 'question', 'plan', 'stuck', 'sync', 'update', 'back'].every((t) => C.decide({ type: t }, away).show));
ok('an unknown event never notifies', C.decide({ type: 'confetti' }, away).why === 'unknown');

// ---------- the switches silence each type ----------
ok('the master switch silences everything', ['reply', 'render', 'keepgoing', 'permission', 'update'].every((t) => C.decide({ type: t, ms: 99999 }, { settings: { notify: false } }).why === 'off'));
for (const [sw, types] of Object.entries({ replies: ['reply', 'back'], renders: ['render', 'job'], keepgoing: ['keepgoing'], needs: ['permission', 'question', 'plan', 'stuck', 'sync'], updates: ['update'] })) {
  const settings = { notifyWhen: { [sw]: false } };
  const others = Object.keys(C.TYPE).filter((t) => !types.includes(t));
  ok(`${sw} off silences ${types.join(', ')} and nothing else`, types.every((t) => C.decide({ type: t, ms: 99999 }, { settings }).why === 'switch') && others.every((t) => C.decide({ type: t, ms: 99999 }, { settings }).show));
}
ok('the fold line: all on, a few, off', /^All on/.test(C.summary({})) && C.summary({ notifyWhen: { replies: false, renders: false, keepgoing: false } }) === 'When an AI needs you, updates' && C.summary({ notify: false }) === 'Off');

// ---------- words and actions ----------
const rep = C.compose({ type: 'reply', agent: 'Claude', agentId: 'claude', chatId: 'c1', chatTitle: 'Intro video', text: '## Done\n**Here** is `the` cut', ms: 31000 }, { platform: 'darwin' });
ok('a reply: who, which chat, the gist without Markdown, Open the chat', rep.title === 'Claude replied in “Intro video”' && rep.body === 'Done Here is the cut' && rep.actions[0].text === 'Open the chat' && rep.actions[0].go.chat[1] === 'c1' && rep.group === 'chat:c1', rep);
const rd = C.compose({ type: 'render', file: '/Users/me/Hearth/renders/intro 9x16.mp4', ms: 42000 }, { platform: 'darwin' });
ok('render done (Mac): Show in Finder first (the click), the file named', rd.actions[0].text === 'Show in Finder' && rd.actions[0].go.file.endsWith('intro 9x16.mp4') && /intro 9x16\.mp4/.test(rd.body) && rd.group === 'renders', rd);
ok('render done (Windows): Show in Explorer', C.compose({ type: 'render', file: 'C:\\x\\a.mp4', ms: 20000 }, { platform: 'win32' }).actions[0].text === 'Show in Explorer');
const rf = C.compose({ type: 'render', failed: true, name: 'All formats', why: 'ffmpeg missing' }, { platform: 'win32' });
ok('render failed: why, See why opens the renders', rf.title === 'A render failed' && /ffmpeg missing/.test(rf.body) && rf.actions[0].go.renders === 1, rf);
const pm = C.compose({ type: 'permission', agent: 'Claude', agentId: 'claude', chatId: 'c2', text: 'wants to delete: old-renders/', card: 'c7' });
ok('a permission: "needs you", "Allow…" OPENS its card in its chat (no allow / approve field anywhere)', pm.title === 'Claude needs you' && pm.actions.length === 1 && pm.actions[0].text === 'Allow…' && pm.actions[0].go.card === 'c7' && pm.actions[0].go.chat[1] === 'c2' && !JSON.stringify(pm).match(/"(allow|approve|answer)"\s*:/i), pm);
ok('a permission says the verb once', C.compose({ type: 'permission', agent: 'Claude', text: 'wants to delete: Delete: old-renders/' }).body === 'Wants to delete: old-renders/', C.compose({ type: 'permission', agent: 'Claude', text: 'wants to delete: Delete: old-renders/' }).body);
ok('a question: Answer… opens its card', C.compose({ type: 'question', agent: 'Astra', text: 'asks: Which ratio?', card: 'c8', agentId: 'a', chatId: 'c3' }).actions[0].text === 'Answer…');
const kg = C.compose({ type: 'keepgoing', phase: 'stop', agent: 'Claude', agentId: 'claude', chatId: 'c1', chatTitle: 'Upgrades', why: 'the spending cap was reached', cost: '4 rounds · ≈ 60k tokens' });
ok('keep going stopped: and why', kg.title === '🔁 Keep going stopped in “Upgrades”' && kg.body === 'The spending cap was reached · 4 rounds · ≈ 60k tokens' && kg.group === 'chat:c1', kg);
ok('keep going round: round n of m', C.compose({ type: 'keepgoing', phase: 'round', agent: 'Claude', n: 2, of: 5, chatId: 'c1', agentId: 'claude' }).title === '🔁 Claude: round 2 of 5 done');
ok('back online / usage limit reset', /^Back online/.test(C.compose({ type: 'back', reason: 'offline', agent: 'Claude' }).title) && /^Usage limit reset/.test(C.compose({ type: 'back', reason: 'limit', agent: 'Claude' }).title));
ok('an update: See what\'s new…', C.compose({ type: 'update', n: 3 }).actions[0].go.update === 1 && C.compose({ type: 'update', n: 3 }).group === 'update');

// ---------- grouping: replace, don't stack; a burst becomes one summary ----------
let g = C.grouper();
const note = (type, group, title) => ({ type, group, title: title || `${type} ${group}`, sw: C.switchOf(type), actions: [] });
let ops = g.add(note('reply', 'chat:a', 'first'), 0);
ok('the first one shows', ops.length === 1 && ops[0].op === 'show');
ops = g.add(note('reply', 'chat:a', 'second'), 1000);
ok('the same chat again: the old one closes, the new one shows (one per chat)', ops.map((o) => o.op).join() === 'close,show' && ops[0].group === 'chat:a' && g.open().length === 1);
ops = g.add(note('render', 'renders'), 2000);
ok('another group: shown beside it', ops.length === 1 && g.open().length === 2);
ops = g.add(note('reply', 'chat:b', 'third'), 3000);
ok('a third group within 12 s: a burst → those close, ONE summary shows', ops.filter((o) => o.op === 'close').length === 2 && ops.at(-1).note.group === 'summary' && /Hearth: 4 things/.test(ops.at(-1).note.title) && g.open().join() === 'summary', { ops, open: g.open() });
ops = g.add(note('reply', 'chat:c', 'fourth'), 5000);
ok('while summing up: the summary is replaced with one more, nothing stacks', ops.map((o) => o.op).join() === 'close,show' && /5 things/.test(ops[1].note.title) && g.open().join() === 'summary');
ops = g.add(note('permission', 'chat:d', 'Claude needs you'), 6000);
ok('an AI waiting for you is never folded into the summary', ops.length === 1 && ops[0].note.group === 'chat:d' && g.open().includes('chat:d'));
ops = g.add(note('reply', 'chat:e'), 40000);
ok('after a quiet while, back to one each', ops.length === 1 && ops[0].note.group === 'chat:e' && !g.summing);
g = C.grouper();
g.add(note('permission', 'chat:x', 'needs you'), 0);
ops = g.add(note('keepgoing', 'chat:x', 'round done'), 500);
ok('something else about a chat whose AI waits for you goes beside it, not over it', !ops.some((o) => o.op === 'close') && g.open().includes('chat:x') && g.open().includes('chat:x~'));
ops = g.seen('chat:x');
ok('looking at that chat clears both', ops.length === 2 && !g.open().length);
ops = g.add(note('reply', 'chat:y'), 1000); g.closed('chat:y');
ok('closed by the OS / clicked: forgotten', !g.open().includes('chat:y'));

// ---------- the main side, with a recorder for Electron's Notification ----------
const sentToWin = [];
const revealed = [];
const win = { focused: false, visible: true, min: false, shown: 0, isDestroyed: () => false, isVisible() { return this.visible; }, isMinimized() { return this.min; }, isFocused() { return this.focused; }, restore() { this.min = false; }, show() { this.shown += 1; this.visible = true; }, focus() { this.focused = true; } };
const handlers = {};
const ipc = { handle: (ch, fn) => { handlers[ch] = fn; } };
let stole = 0;
const made = []; // a stand-in for Electron's Notification (the real path, not the checks' recorder)
class FakeN { constructor(o) { this.opts = o; this.handlers = {}; made.push(this); } on(e, f) { this.handlers[e] = f; return this; } show() { this.shown = true; } close() { this.closed = true; } static isSupported() { return true; } }
M.register(ipc, { getWin: () => win, app: { focus: (o) => { if (o?.steal) stole += 1; }, getAppPath: () => '/x' }, shell: { showItemInFolder: (p) => revealed.push(p) }, appshell: { ensureIcon: () => '/x/icon.png', APP_NAME: 'Hearth' }, Notification: FakeN, send: (ch, d) => sentToWin.push([ch, d]) });
const T = (a) => handlers['notify:test']({}, a);
const S = (ev) => handlers['notify:send']({}, ev);
T({ stub: true, clear: true });
ok('IPC: notify:send, notify:seen, notify:test', ['notify:send', 'notify:seen', 'notify:test'].every((c) => handlers[c]));
win.focused = true;
ok('main: Hearth in front → nothing shown', S({ type: 'reply', agent: 'Claude', agentId: 'claude', chatId: 'c1', ms: 30000 }).why === 'focused' && !T({}).log.some((l) => l.shown));
win.focused = false;
let r = S({ type: 'reply', agent: 'Claude', agentId: 'claude', chatId: 'c1', text: 'All done', ms: 30000 });
let log = T({}).log;
ok('main: away → one notification with Open the chat, never urgent, sound left to the OS', r.shown && log.filter((l) => l.shown).length === 1 && log[0].shown.actions[0] === 'Open the chat' && log[0].shown.silent === false && !log[0].shown.urgency, log);
r = S({ type: 'reply', agent: 'Claude', agentId: 'claude', chatId: 'c1', text: 'And more', ms: 30000 });
log = T({}).log;
ok('main: the same chat again replaces it (the old one closed)', log.some((l) => l.closed === 'chat:c1') && T({}).open.join() === 'chat:c1');
T({ click: { group: 'chat:c1' } });
ok('main: a click restores + focuses the window (Mac: steals focus from the other app) and tells it the chat', win.focused && win.shown > 0 && (process.platform !== 'darwin' || stole) && sentToWin.at(-1)[0] === 'notify:go' && sentToWin.at(-1)[1].go.chat[1] === 'c1', sentToWin.at(-1));
win.focused = false; const before = sentToWin.length;
M._test.reset(); T({ stub: false });
S({ type: 'render', file: '/tmp/out/intro.mp4', ms: 30000 });
const rn = made.at(-1);
ok('main (Electron path): shown with its buttons, an icon off the Mac, not silent, never urgent', rn.shown && rn.opts.actions.map((a) => a.text).join() === `${C.revealWord(process.platform)},Open the renders` && rn.opts.silent === false && !('urgency' in rn.opts) && !('timeoutType' in rn.opts) && (process.platform === 'darwin' || rn.opts.icon === '/x/icon.png'), rn.opts);
rn.handlers.action({}, 0);
ok('main: render done → Show file reveals it without bringing Hearth up', revealed.at(-1) === '/tmp/out/intro.mp4' && sentToWin.length === before && !win.focused);
S({ type: 'render', file: '/tmp/out/b.mp4', ms: 30000 });
const rn2 = made.at(-1); S({ type: 'render', file: '/tmp/out/c.mp4', ms: 30000 });
ok('main (Electron path): the next render replaces it (the old one closed)', rn2.closed && made.at(-1).shown && !made.at(-1).closed);
made.at(-1).handlers.click();
ok('main: a click on the notification itself does its first action', revealed.at(-1) === '/tmp/out/c.mp4');
T({ stub: true });
S({ type: 'permission', agent: 'Claude', agentId: 'claude', chatId: 'c9', text: 'wants to delete: x', card: 'c1' });
T({ click: { group: 'chat:c9', action: 0 } });
const go = sentToWin.at(-1)[1].go;
ok('main: a permission\'s Allow… brings Hearth up on the card (go.card), nothing else', go.card === 'c1' && go.chat[1] === 'c9' && Object.keys(go).sort().join() === 'card,chat', go);
win.focused = false; M._test.reset(); T({ stub: true });
for (const c of ['a', 'b', 'c', 'd']) S({ type: 'reply', agent: 'Claude', agentId: 'claude', chatId: c, ms: 30000 });
log = T({}).log; const open = T({}).open;
ok('main: a burst of 4 chats → the summary stands for them (one open)', open.join() === 'summary' && log.filter((l) => l.shown).at(-1).shown.title.startsWith('Hearth: 4 things'), { open, log });
handlers['notify:seen']({}, 'summary');
ok('main: seen closes it', !T({}).open.length);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
