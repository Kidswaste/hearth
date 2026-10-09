// App-wide smoothness: idle (nothing should run: no frames, no DOM writes), a menu, a dialog, a toast, a tooltip,
// the meter pill while a reply streams. Lists the animations still running at idle.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-app.js
const { wait, until, measure, brief, mouse } = M;
const out = {};
const claude = H.claudeAgent();
activate(claude.id); await wait(1500);
const running = () => document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.transitionProperty || a.constructor.name}@${String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName).slice(0, 40)}${a.effect?.pseudoElement || ''}`);
// idle: a chat, nothing happening
out.idleAnimations = running();
out.idle = brief(await measure(3000));
// a menu (the chat's ⋯ options) opening
const v = Native.view(claude.id);
const menuBtn = [...v.root.querySelectorAll('button')].find((b) => b.textContent.trim() === '⋯' && b.getBoundingClientRect().width);
if (menuBtn) {
  const r = menuBtn.getBoundingClientRect();
  out.menuOpen = brief(await measure(500, async () => { await mouse('mousePressed', r.left + r.width / 2, r.top + r.height / 2); await mouse('mouseReleased', r.left + r.width / 2, r.top + r.height / 2); }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('#menu, .ctx-menu')?.remove?.(); await wait(400);
}
// the palette (Ctrl+K)
out.paletteOpen = brief(await measure(500, async () => { AppUI.palette(); }));
document.querySelector('.palette')?.remove(); await wait(300);
// a dialog
out.dialogOpen = brief(await measure(600, async () => { Modal.prompt('Smooth test', { value: 'x' }); }));
document.querySelectorAll('dialog[open]').forEach((d) => d.close()); await wait(400);
// a toast
out.toast = brief(await measure(800, async () => { toast('Smooth test toast', { timeout: 3000 }); }));
await wait(3500);
// a tooltip: hover a titled button and wait for it
const tipBtn = [...document.querySelectorAll('#rail button[title], .tool-btn[title]')].find((b) => b.getBoundingClientRect().width);
if (tipBtn) {
  const r = tipBtn.getBoundingClientRect();
  out.tooltip = brief(await measure(1200, async () => { await mouse('mouseMoved', r.left + r.width / 2, r.top + r.height / 2, { button: 'none' }); }));
  await mouse('mouseMoved', 700, 500, { button: 'none' }); await wait(400);
}
// the meter pill while a reply streams (the reply's own painting is in smooth-chat.js)
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'long');
await until(() => v.list.querySelector('.msg.streaming .body p'), 8000);
{ const m = await measure(1500); const pill = document.querySelector('.meter-pill'); out.streamPill = { line: typeof brief(m) === 'string' ? brief(m) : brief(m).line, pillMutations: m.mut.top.filter((x) => /mp-|meter/.test(x)) }; }
out.streamAnimations = running().filter((x) => /mt-|meter|mp-/.test(x));
await window.hub.stop(H.activeChat[claude.id]);
await until(() => !Native.isBusy(H.activeChat[claude.id]), 8000);
await wait(1500);
out.idleAfter = brief(await measure(2000));
out.idleAfterAnimations = running();
// the owner's look (Forgeheart skin, v2 look) at idle with the cursor in the composer (where it usually rests)
document.documentElement.dataset.skin = 'forge'; document.documentElement.dataset.look = 'v2';
v.input.focus(); await wait(2500);
out.forgeIdleAnimations = running();
out.forgeIdle = brief(await measure(2500));
return JSON.stringify(out, null, 1);
