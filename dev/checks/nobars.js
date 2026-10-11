// Round 21 "nobars": screenshots of the surfaces that used to carry colored left accent bars, in each look, plus a
// count of the bars still drawn (any visible element whose left border is wider than its other borders, or whose
// box-shadow has an inset left strip, or a thin ::before strip at the left edge).
//   node dev/smoke.js --fake-engines --eval "window.NOBARS_DIR='/tmp/nobars/after'" --script dev/checks/nobars.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
const DIR = window.NOBARS_DIR || '/tmp/nobars';
const shot = (name) => smoke({ shot: `${DIR}/${name}.png` });
const root = document.documentElement;
const LOOKS = { forgeheart: { skin: 'forge', look: 'v2' }, classic: { skin: 'forge', look: '' }, swirl: { skin: 'forge swirl', look: 'v2' }, plain: { skin: '', look: '' } };
const setLook = (k) => { const l = LOOKS[k]; if (l.look) root.setAttribute('data-look', l.look); else root.removeAttribute('data-look'); root.dataset.skin = l.skin; };

// every visible element still drawing a left bar (fixed thin elements like playheads are reported separately)
function bars() {
  const out = [];
  for (const n of document.querySelectorAll('body *')) {
    if (!n.checkVisibility?.()) continue;
    const cs = getComputedStyle(n);
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const other = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderRightWidth) || 0, parseFloat(cs.borderBottomWidth) || 0);
    const colored = cs.borderLeftStyle !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.borderLeftColor);
    const why = [];
    if (bl >= 2 && bl > other && colored) why.push(`border-left ${cs.borderLeftWidth}`);
    if (/inset\s+[2-9]px 0px 0px/.test(cs.boxShadow) || /[2-9]px 0px 0px 0px inset/.test(cs.boxShadow)) why.push('inset strip');
    const b = getComputedStyle(n, '::before');
    if (b.content !== 'none' && b.position === 'absolute' && parseFloat(b.width) <= 4 && parseFloat(b.height) > 12 && b.backgroundColor !== 'rgba(0, 0, 0, 0)') why.push('::before strip');
    if (why.length) out.push(`${n.tagName.toLowerCase()}.${[...n.classList].join('.')} (${why.join(', ')})`);
  }
  return [...new Set(out)];
}
const found = {};

// ---------- a chat with thinking, tool steps, a quote, a callout, a note, a flow card, a pinned reply ----------
const agent = H.claudeAgent();
activate(agent.id);
await Native.send(agent.id, 'think tool code');
await until(() => !Native.isBusy(H.activeChat[agent.id]));
const chat = Native.chatOf?.(agent.id) || H.chats.find((c) => c.id === H.activeChat[agent.id]);
chat.messages.push({ role: 'user', text: 'Show me a quote and a callout', at: Date.now() },
  { role: 'assistant', text: 'A quote from the brief:\n\n> Would love to remove most colored left bars in most UIs.\n\n> [!WARNING] Heads up\n> Callouts keep their tint and their icon.\n\nDone.', at: Date.now(), thinking: 'Look at the bars, keep the meaning.' },
  { role: 'opinion', from: 'Astra', text: 'A second opinion: looks calmer.', at: Date.now() });
await Native.refresh(agent.id);
await Commands.tryRun('/pin-msg 2', agent.id).catch(() => {});
Native.note(agent.id, 'A note: notes keep their tint and dashed frame.');
const fc = Native.note(agent.id, '**⇢ Doctor** · 2 steps · Running\n\nChecking the engines…', { id: 'flow-demo' });
fc?.classList.add('flow-card', 'flow-running');
for (const d of document.querySelectorAll('.msg .thinking')) d.open = true;
const v = Native.view(agent.id);
v.list.scrollTop = v.list.scrollHeight;
await wait(500);
for (const k of Object.keys(LOOKS)) { setLook(k); await wait(250); await shot(`chat-${k}`); found[`chat-${k}`] = bars(); }
setLook('forgeheart');
// a reply being written (the old rainbow edge)
Native.send(agent.id, 'think slow long');
await wait(1800);
v.list.scrollTop = v.list.scrollHeight;
await shot('chat-streaming'); found.streaming = bars();
await until(() => !Native.isBusy(H.activeChat[agent.id]), 25000);

// ---------- toasts, a menu with a hovered row, the palette ----------
toast('Saved the sketch');
toast('Render failed: no ffmpeg', { type: 'error' });
await wait(400);
showMenu(420, 160, [{ label: 'Copy' }, { label: 'Quote' }, { label: 'Branch from here' }, { label: 'More ›', items: [{ label: 'x' }] }]);
await wait(200);
const mb = document.querySelector('#menu button');
if (mb) { const r = mb.getBoundingClientRect(); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: r.x + 20, y: r.y + r.height / 2 } }); }
await wait(250);
for (const k of ['forgeheart', 'classic']) { setLook(k); await wait(200); await shot(`toast-menu-${k}`); found[`toast-menu-${k}`] = bars(); }
setLook('forgeheart');
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
AppUI.palette?.();
await wait(500);
await shot('palette'); found.palette = bars();
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
document.querySelector('.palette')?.remove();
await wait(200);

// ---------- Commands page, settings, board, renders, the Lab ----------
await Commands.tryRun('/commands', agent.id).catch(() => {});
await wait(1500);
await shot('commands'); found.commands = bars();
await AppUI.openSettings();
await wait(900);
await shot('settings'); found.settings = bars();
document.querySelector('dialog[open]')?.close();
await wait(200);
activate('tool:board');
await wait(1500);
await shot('board'); found.board = bars();
await Commands.tryRun('/renders', agent.id).catch(() => {});
await wait(900);
await shot('renders'); found.renders = bars();
document.querySelector('dialog[open]')?.close();
activate('tool:three');
await wait(5000);
// a changed slider row and a selected layer
const row = document.querySelector('.tweaks .tw-row'); row?.classList.add('changed');
document.querySelector('.ly-row')?.classList.add('on');
await wait(300);
for (const k of ['forgeheart', 'classic']) { setLook(k); await wait(250); await shot(`lab-${k}`); found[`lab-${k}`] = bars(); }
setLook('forgeheart');

// ---------- a specimen sheet of the rarer ones (same classes as the app draws) ----------
const sheet = el('div', { class: 'nobars-sheet', attrs: { style: 'position:fixed;inset:40px 60px auto 300px;z-index:9999;max-height:85vh;overflow:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--bg);border:1px solid var(--line)' } });
sheet.innerHTML = `
  <div class="kanban-cards"><div class="kanban-card p1"><div class="kanban-title">P1 task: fix export</div></div><div class="kanban-card p2"><div class="kanban-title">P2 task</div></div></div>
  <div class="tweaks"><div class="tw-notice">The sketch has no sliders yet</div><div class="tw-row changed"><span class="tw-name">Speed</span></div><div class="tw-bind">Bound to kick</div></div>
  <div class="layers"><div class="ly-list"><div class="ly-row on"><span class="ly-name">Rings</span></div><div class="ly-row"><span class="ly-name">Glow</span></div></div></div>
  <div class="msg"><div class="qa-done"><span class="qa-q">❓ Which size?</span><span class="qa-a">→ 1080×1920</span></div><span class="tool-chips">⚙ Read · Edit</span> <span class="queue-chip">queued: make it pink</span></div>
  <div class="jam-dir">Astra: push the contrast</div><div class="jam-dir by-claude">Claude: slower spin</div>
  <div class="comp-row" style="--pc:#ff6a3d"><span class="comp-still none">◆</span><span class="comp-mark">◆</span><b>1. Intro</b></div>
  <div class="mk-parts"><div class="mk-part mk-c-stuck"><span class="mk-picon">◭</span><span class="mk-ptext">Stuck part</span></div></div>
  <div class="mk-group" style="--mk:#7c5cff;padding:6px">make group</div>
  <div class="nv-picker-item on" style="--nc:#48ddff;padding:4px">picker item</div>
  <div class="memory-row pinned"><span class="memory-text" style="border:1px solid var(--line);padding:3px">pinned fact</span></div>
  <div class="keys-sheet"><div class="ks-line kb-on">Ctrl+K · palette</div></div>
  <div class="toast rq-done"><span>Render done</span></div><div class="toast rq-fail"><span>Render failed</span></div>
  <div class="toast scene-toast" style="--chat-ident:#ff3ddc"><span class="chat-ident">✦</span><span>Scene note</span></div>
  <div class="engine-codex"><div class="msg assistant"><div class="body">Astra reply</div></div></div>`;
document.body.append(sheet);
await wait(300);
for (const k of Object.keys(LOOKS)) { setLook(k); await wait(250); await shot(`sheet-${k}`); found[`sheet-${k}`] = bars().filter((s) => !/nobars-sheet/.test(s)); }
setLook('forgeheart');
sheet.remove();
return JSON.stringify(found, null, 1);
