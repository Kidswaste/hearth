// Smoke check: chat commands end to end, with the fake engines streaming real replies.
//   node dev/smoke.js --fake-engines --script dev/checks/chat-cmds.js --shot /tmp/cmds.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
const out = { errors: [] };
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.engine === 'codex');
activate(claude.id);
const v = () => Native.view(claude.id);
const notes = () => [...v().list.querySelectorAll('.msg.note .body')].map((n) => n.textContent);
const lastNote = () => notes().at(-1) || '';
const idle = () => until(() => !Native.isBusy(H.activeChat[claude.id]));
async function cmd(text, agentId = claude.id) {
  const before = notes().length;
  const ok = await Commands.tryRun(text, agentId, v()?.input);
  await wait(60);
  return { ok, note: notes().length > before ? lastNote().slice(0, 160) : '' };
}
const log = {};
try {
  out.count = Commands.list().length;
  out.areas = Commands.areas();
  log.new = await cmd('/new think code table suggest');
  await idle();
  const chat = Native.current(claude.id);
  out.reply = { n: chat.messages.length, suggest: chat.messages.at(-1).suggest };
  // a /command suggestion chip runs the command
  const chip = [...v().list.querySelectorAll('.suggest-chip.cmd')][0];
  out.cmdChip = Boolean(chip);
  chip?.click(); await wait(100);
  out.chipNote = lastNote().slice(0, 60);
  for (const c of ['/help chat', '/stats', '/tokens', '/tokens today', '/context', '/code', '/links', '/files', '/recent', '/agents', '/model', '/memory', '/tags', '/pins', '/drafts', '/wc', '/time', '/calc 1080*16/9', '/echo hi', '/snippet', '/template', '/tone', '/persona', '/lang', '/feedback', '/bookmarks', '/unread', '/queue', '/restore', '/thinking open', '/thinking close']) {
    log[c] = await cmd(c);
  }
  log.rename = await cmd('/rename Smoke test chat');
  out.title = Native.current(claude.id).title;
  log.title = await cmd('/title');
  log.undoRename = await cmd('/undo');
  log.pin = await cmd('/pin'); out.pinned = Native.current(claude.id).pinned;
  log.tag = await cmd('/tag music, test');
  log.folder = await cmd('/folder Experiments');
  log.pinmsg = await cmd('/pin-msg');
  log.bookmark = await cmd('/bookmark');
  log.react = await cmd('/react fire nice colors');
  out.marks = Native.current(claude.id).messages.at(-1);
  out.marks = { pinnedMsg: out.marks.pinnedMsg, bookmark: out.marks.bookmark, reaction: out.marks.reaction };
  out.strip = Boolean(v().list.querySelector('.pinned-strip'));
  log.jump1 = await cmd('/jump 1');
  log.jumpTop = await cmd('/jump top');
  log.find = await cmd('/find fake');
  out.findHits = v().list.querySelectorAll('mark.find-hit').length;
  ChatUX.closeFind(claude.id);
  log.fold = await cmd('/fold all');
  log.unfold = await cmd('/unfold all');
  log.tone = await cmd('/tone concise');
  out.styleChip = v().styleBox.textContent;
  // style rides along once: echo shows what the engine got
  await Native.send(claude.id, 'echo this');
  await idle();
  out.echoed = Native.current(claude.id).messages.at(-1).text.slice(0, 80);
  log.lang = await cmd('/lang French');
  log.styleOff = await cmd('/style off');
  log.remember = await cmd('/remember The owner likes neon');
  log.forget = await cmd('/forget neon');
  log.copyCode = await cmd('/copy code');
  log.copy = await cmd('/copy');
  log.export = await cmd('/export md clipboard');
  log.wrap = await cmd('/wrap on'); out.wrap = document.body.classList.contains('chat-wrap-code');
  await cmd('/wrap off');
  log.zoom = await cmd('/zoom 120%'); out.scale = getComputedStyle(document.documentElement).getPropertyValue('--chat-scale');
  await cmd('/zoom 0');
  log.width = await cmd('/width wide');
  await cmd('/width normal');
  log.numbers = await cmd('/numbers on');
  log.density = await cmd('/density compact');
  log.focus = await cmd('/focus'); out.focus = document.body.classList.contains('chat-focus');
  await cmd('/focus');
  log.filter = await cmd('/filter pinned'); out.panelView = Panel.view();
  out.panelRows = document.querySelectorAll('#chat-groups .item').length;
  await cmd('/filter all');
  // other agents from here
  log.astra = await cmd('/astra think hello from claude');
  await until(() => !Native.isBusy(H.activeChat[astra.id]));
  out.astraChat = (await window.hub.getChat(H.activeChat[astra.id]))?.messages.at(-1)?.text.slice(0, 50);
  out.unreadAstra = H.unreadChats.has(H.activeChat[astra.id]);
  log.both = await cmd('/both quick question');
  await idle(); await until(() => !Native.isBusy(H.activeChat[astra.id]));
  log.summarize = await cmd('/summarize 3');
  await idle();
  log.shorter = await cmd('/shorter');
  await idle();
  log.retry = await cmd('/retry');
  await idle();
  log.compact = await cmd('/compact');
  await idle(); await wait(300);
  out.compacted = Boolean(Native.current(claude.id).compact);
  log.queue = await cmd('/queue list');
  log.dup = await cmd('/duplicate');
  out.dupTitle = Native.current(claude.id).title;
  log.del = await cmd('/delete');
  out.afterDelete = H.activeChat[claude.id];
  log.undoDel = await cmd('/undo');
  await wait(300);
  out.restored = Native.current(claude.id)?.title;
  log.open = await cmd('/open Smoke');
  log.next = await cmd('/next-chat');
  log.stopNothing = await cmd('/stop');
  log.newEmpty = await cmd('/new');
  out.menuItems = (() => { const ta = v().input; ta.value = '/'; ta.dispatchEvent(new Event('input')); return null; })();
  await wait(300);
  out.slashMenu = { heads: [...document.querySelectorAll('.slash-head')].map((h) => h.textContent).slice(0, 6), items: document.querySelectorAll('.slash-item').length };
  const ta = v().input; ta.value = '/model '; ta.dispatchEvent(new Event('input')); await wait(300);
  out.modelMenu = [...document.querySelectorAll('.slash-item b')].map((b) => b.textContent);
  ta.value = ''; ta.dispatchEvent(new Event('input'));
} catch (err) { out.errors.push(String(err.stack || err)); }
out.log = Object.fromEntries(Object.entries(log).map(([k, x]) => [k, x?.note || (x?.ok ? 'ok' : x)]));
return JSON.stringify(out, null, 1);
