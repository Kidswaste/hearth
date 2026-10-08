// Smoke check: the command bar (Ctrl/⌘+;), plain-language search, argument hints, pipes, history, /repeat,
// timers, macros, favorites, the help view and clickable /commands in replies.
//   node dev/smoke.js --fake-engines --script dev/checks/cmdbar.js --shot /tmp/cmdbar.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(60); } return false; };
const out = { errors: [] };
const claude = H.claudeAgent();
activate(claude.id);
await wait(400);
const key = (k, opts = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const type = async (text) => { const i = document.querySelector('.cmdbar-input'); i.value = text; i.dispatchEvent(new Event('input')); await wait(120); };
const menu = () => [...document.querySelectorAll('.cmdbar .slash-item b')].map((b) => b.textContent);
const card = () => document.querySelector('.cmdbar-out')?.innerText || '';
try {
  out.count = Commands.list().length;
  out.dups = Commands.duplicates().map((d) => `${d.name}: ${d.was} <- ${d.by}`);
  // plain language → command lines
  const nl = (t) => Commands.suggest(t, { limit: 3 }).map((s) => s.line.trim());
  out.nl = {};
  for (const t of ['make it 9 by 16', 'dark theme', 'light theme', 'turn off the click track', 'bpm 128', 'freeze the picture', 'vertical', 'stop every reply', 'make text bigger', 'random colors', 'square', '1080 by 1920', 'record 8 bars', 'every 5 minutes', 'undo',
    'every 5 minutes shuffle colors', 'in 10 minutes freeze', 'at 9pm backup now', 'shuffle 3 times', 'freeze then still 9:16', 'do it again', 'every bar reshuffle', 'red channel', 'smooth framerate']) out.nl[t] = nl(t);
  // a chain typed straight, alias placeholders
  await CmdBar.runLine('/echo a1 ; /echo b2');
  out.chainTyped = card().replace(/\s+/g, ' ').slice(-20);
  await CmdBar.runLine('/alias smoke-two /echo {2} then {1}');
  await CmdBar.runLine('/smoke-two x y');
  out.aliasPos = card().replace(/\s+/g, ' ').slice(-14);
  await CmdBar.runLine('/unalias smoke-two');
  out.dym = Commands.didYouMean('/make it 9 by 16').map((m) => m.line.trim());
  out.dymPath = Commands.didYouMean('/Users/me/file.js is broken').length;
  out.typo = Commands.didYouMean('/frezee').map((m) => m.line);
  const h = Commands.argHint('/size 9');
  out.hint = h && h.parts.map((p) => `${p.state}:${p.text}`).join(' ') + ` eg=${h.example}`;
  out.hint2 = Commands.argHint('/slider glow ')?.now;
  // the bar opens with Ctrl+;
  document.body.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: ';', code: 'Semicolon', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(150);
  out.barOpen = CmdBar.isOpen();
  out.chip = document.querySelector('.cmdbar-place')?.textContent;
  await type('/siz');
  out.menuSiz = menu().slice(0, 4);
  await type('/size 9');
  out.argHintRow = document.querySelector('.cmdbar .slash-arghint')?.textContent;
  await type('make it 9 by 16');
  out.menuNL = menu().slice(0, 3);
  await type('');
  // running from the bar: output in the card
  await CmdBar.runLine('/calc 2*21');
  await wait(100);
  out.calcCard = card().slice(0, 80);
  await CmdBar.runLine('/frezee');
  out.typoCard = card().slice(0, 120);
  await CmdBar.runLine('dark theme please');
  out.plainCard = card().slice(0, 160);
  // history ↑
  const inp = document.querySelector('.cmdbar-input');
  inp.focus(); await type('');
  key('ArrowUp');
  out.histUp = inp.value;
  // !! and /repeat
  await type('');
  await CmdBar.runLine('/echo once');
  await CmdBar.runLine('!!');
  out.bang = card().slice(0, 40);
  await CmdBar.runLine('/repeat 2 /echo twice');
  out.repeat = card().replace(/\s+/g, ' ').slice(0, 120);
  out.last = Commands.last();
  // pipes
  await Commands.tryRun('/calc 6*7 | draft', claude.id, null);
  await wait(80);
  out.pipeDraft = Native.view(claude.id).input.value;
  Native.setDraft(claude.id, '');
  // favorites
  Commands.toggleFav('calc', true);
  CmdBar.open('/');
  await type('/');
  out.pinnedHead = [...document.querySelectorAll('.cmdbar .slash-head')].map((x) => x.textContent).slice(0, 3);
  out.firstRow = menu()[0];
  await type('');
  // timers
  await CmdBar.runLine('/every 1s /echo tick');
  out.timerCard = card().slice(0, 80);
  out.timers1 = CmdBar.timers().length;
  await wait(2300);
  out.timerRuns = CmdBar.timers()[0]?.runs;
  out.timerStored = JSON.parse(localStorage.getItem('cmdbar.timers') || '[]').length;
  await CmdBar.runLine('/timers');
  out.timersCard = card().slice(0, 120);
  await CmdBar.runLine('/timer-cancel all');
  out.timers2 = CmdBar.timers().length;
  out.parseAt = new Date(CmdBar.parseAt('9pm')).getHours();
  out.parseDur = CmdBar.parseDur('1h30m');
  // macros
  await CmdBar.runLine('/macro rec smoke-mac');
  await CmdBar.runLine('/echo step one');
  await CmdBar.runLine('/calc 1+1');
  await CmdBar.runLine('/macro stop');
  out.macroCard = card().replace(/\s+/g, ' ').slice(0, 160);
  out.macroDef = Commands.get('smoke-mac')?.desc;
  await CmdBar.runLine('/smoke-mac');
  out.macroRun = card().replace(/\s+/g, ' ').slice(0, 80);
  await CmdBar.runLine('/unalias smoke-mac');
  // wait in chains
  const t0 = Date.now(); await CmdBar.runLine('/run /echo a ; /wait 300ms ; /echo b'); out.waitMs = Date.now() - t0;
  // misc commands
  for (const c of ['/what size', '/how make it vertical', '/discover', '/keys', '/undo-report', '/cmd-history', '/stars', '/star size']) { await CmdBar.runLine(c); out[c] = card().replace(/\s+/g, ' ').slice(0, 90); }
  await wait(200);
  window.__shotBar = true;
  // help view
  CmdBar.close();
  await Commands.tryRun('/help', claude.id, null);
  await wait(200);
  const dlg = document.querySelector('dialog.cmd-help');
  out.helpOpen = Boolean(dlg);
  const q = dlg.querySelector('.cmd-help-q');
  q.value = 'make it vertical'; q.dispatchEvent(new Event('input')); await wait(100);
  out.helpBest = [...dlg.querySelectorAll('.cmd-help-row .cmd-help-name')].slice(0, 3).map((x) => x.textContent);
  out.helpEx = dlg.querySelectorAll('.ex-chip').length;
  q.value = ''; q.dispatchEvent(new Event('input')); await wait(100);
  out.helpRows = dlg.querySelectorAll('.cmd-help-row').length;
  out.helpList = (await (async () => { let s = ''; await Commands.tryRun('/help list freeze', claude.id, null, { say: (t) => { s = t; } }); return s; })()).slice(0, 60);
  dlg.close();
  // clickable command in a reply (DOM like a reply's inline code)
  const list = Native.view(claude.id).list;
  const msg = el('div', { class: 'msg assistant' }, el('div', { class: 'body', html: '<p>Try <code>/echo from reply</code> or <code>/size &lt;ratio&gt;</code> or <code>/nope</code></p>' }));
  list.append(msg);
  await wait(400);
  out.replyCodes = [...msg.querySelectorAll('code')].map((c) => `${c.textContent}:${c.classList.contains('cmd-code')}`);
  msg.querySelector('code.cmd-code')?.click();
  await wait(150);
  out.replyRan = [...list.querySelectorAll('.msg.note .body')].at(-1)?.textContent;
  msg.querySelector('code.cmd-code.fill')?.click();
  await wait(150);
  out.replyFill = document.querySelector('.cmdbar-input')?.value;
  CmdBar.close();
  await Commands.tryRun('/cmd-links off', claude.id, null);
  out.linksOff = msg.querySelectorAll('code.cmd-code').length;
  await Commands.tryRun('/cmd-links on', claude.id, null);
  await wait(50);
  out.linksOn = msg.querySelectorAll('code.cmd-code').length;
  msg.remove();
  // help view: an area's name opens it; right-click menu
  CmdBar.help('lab');
  await wait(150);
  const d2 = document.querySelector('dialog.cmd-help');
  out.helpArea = d2.querySelector('.cmd-help-area').value + ' · ' + d2.querySelectorAll('.cmd-help-row').length;
  d2.querySelector('.cmd-help-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 300 }));
  out.helpPop = [...d2.querySelectorAll('.cmd-help-pop button')].map((b) => b.textContent).length;
  out.helpMeta = d2.querySelectorAll('.cmd-help-meta').length;
  d2.close();
  // the composer's / menu: plain-language rows and the hint row, same as the bar
  const ci = Native.view(claude.id).input;
  ci.focus(); ci.value = '/make it 9 by 16'; ci.dispatchEvent(new Event('input')); await wait(150);
  out.composerNL = [...ci.parentElement.querySelectorAll('.slash-item b')].map((b) => b.textContent).slice(0, 3);
  ci.value = '/bpm '; ci.dispatchEvent(new Event('input')); await wait(150);
  out.composerHint = ci.parentElement.querySelector('.slash-arghint')?.textContent;
  ci.value = ''; ci.dispatchEvent(new Event('input'));
  // composer typo note with plain-language suggestions
  ci.value = '/make it 9 by 16'; ci.closest('form').requestSubmit(); await wait(150);
  out.composerTypo = [...Native.view(claude.id).list.querySelectorAll('.msg.note .body')].at(-1)?.textContent.slice(0, 140);
  ci.value = '';
  // round 2 of bar features: undo the last command (Ctrl+Z in an empty bar), pause timers, stats, where, pipes
  CmdBar.open('');
  await type(''); // (the bar brings back unsent text)
  await CmdBar.runLine('/theme next');
  const themeAfter = document.documentElement.dataset.skin || document.documentElement.dataset.look;
  document.querySelector('.cmdbar-input').focus();
  key('z', { ctrlKey: true });
  await wait(300);
  out.undoCard = card().replace(/\s+/g, ' ').slice(0, 100);
  out.themeBack = (document.documentElement.dataset.skin || document.documentElement.dataset.look) !== themeAfter;
  for (const c of ['/timers-pause', '/timers-pause off', '/cmd-stats', '/where', '/at tomorrow 9:00 /echo hi', '/timers', '/timer-cancel all']) { await CmdBar.runLine(c); out[c] = card().replace(/\s+/g, ' ').slice(0, 110); }
  // Alt+1: first pinned command
  document.querySelector('.cmdbar-input').focus();
  key('1', { altKey: true, code: 'Digit1' });
  await wait(200);
  out.alt1 = card().replace(/\s+/g, ' ').slice(0, 60) + ' | ' + document.querySelector('.cmdbar-input').value;
  // shell-like prefixes in the bar
  await CmdBar.runLine('=2+2'); out.eq = card().replace(/\s+/g, ' ').slice(-12);
  await CmdBar.runLine('!calc'); out.bangCalc = card().replace(/\s+/g, ' ').slice(-14);
  // a docked director: its composer gets the same menu, and the bar targets it in its tool
  await Commands.tryRun('/director-setup three', claude.id, null);
  await wait(800);
  const dir = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
  out.director = dir?.name;
  // the Lab: context chip + a docked director's composer menu
  activate('tool:three');
  await wait(1500);
  CmdBar.open('');
  out.labChip = document.querySelector('.cmdbar-place')?.textContent;
  out.labTarget = CmdBar.target()?.name;
  out.place = Commands.place();
  await CmdBar.runLine('/lab-state');
  await wait(600);
  out.labState = card().slice(0, 120);
  await type('/');
  out.labMenuHeads = [...document.querySelectorAll('.cmdbar .slash-head')].map((x) => x.textContent).slice(0, 3);
  out.recentLab = Commands.recent('three');
  out.lookHintLab = Commands.argHint('/look ', { agentId: CmdBar.target()?.id })?.parts.map((p) => p.text).join(' ') + ' | ' + Commands.argHint('/look ', { agentId: CmdBar.target()?.id })?.variant;
  await type('');
  if (dir && Native.view(dir.id)) {
    CmdBar.close();
    const di = Native.view(dir.id).input;
    di.focus(); di.value = '/'; di.dispatchEvent(new Event('input')); await wait(200);
    out.dockMenuHeads = [...di.parentElement.querySelectorAll('.slash-head')].map((x) => x.textContent).slice(0, 3);
    di.value = '/size '; di.dispatchEvent(new Event('input')); await wait(200);
    out.dockHint = di.parentElement.querySelector('.slash-arghint')?.textContent;
    out.dockArgs = [...di.parentElement.querySelectorAll('.slash-item b')].map((b) => b.textContent).slice(0, 4);
    window.__dockShot = true;
  }
} catch (err) { out.errors.push(String(err.stack || err)); }
return JSON.stringify(out, null, 1);
