// Trim (round 18): a broad drive of the app for coverage (which functions / CSS rules never run): every lazy group
// loaded, every rail tool opened, the palette and the "/" menu, right-click menus on the things you can point at, a
// streamed reply, then every chat command with no arguments (as qa-sweep, destructive ones skipped) from a chat and
// the Lab / board commands again from their own tool.
// (round 60) commands that open ▶ Play / ▣ Present are checked to open and answer, then closed (see settle below).
//   node dev/smoke.js --fake-engines --check-timeout 900000 --coverage /tmp/cov.json --script dev/checks/trim-drive.js
//   node dev/coverage-report.js /tmp/cov.json
store.set('commands.hidden', false); // (round 26) these drive the "/" menu, hidden by default
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { groups: {}, tools: [], menus: 0 };
const closeAll = () => {
  document.querySelectorAll('dialog[open]').forEach((x) => { try { x.close(); } catch { /* */ } });
  document.querySelectorAll('.palette, .ctx-menu, .slash-menu, .fx-picker').forEach((x) => x.remove());
  try { hideMenu?.(); } catch { /* */ }
};
// 1. every lazy group
for (const g of Lazy.state()) { try { await Lazy.load(g.name); } catch (err) { out.groups[g.name] = `failed ${err.message}`; } }
for (const g of Lazy.state()) out.groups[g.name] ||= g.state;
// 2. every rail tool, then right-click on what's on screen in it
const rclick = async (sel) => {
  for (const node of [...document.querySelectorAll(sel)].slice(0, 3)) {
    const r = node.getBoundingClientRect(); if (!r.width) continue;
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 4, clientY: r.y + 4 }));
    await wait(80);
    if (document.querySelector('.ctx-menu')) out.menus += 1;
    // open each submenu row once
    for (const row of [...document.querySelectorAll('.ctx-menu .ctx-item, .ctx-menu [data-sub]')].slice(0, 6)) { row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await wait(20); }
    closeAll();
  }
};
for (const t of Tools.all()) {
  try { activate(`tool:${t.id}`); await wait(t.id === 'three' ? 2500 : 600); out.tools.push(t.id); } catch (err) { out.tools.push(`${t.id}: ${err.message}`); }
  await rclick('[data-id="tool:' + t.id + '"] button, [data-id="tool:' + t.id + '"] .bd-item, [data-id="tool:' + t.id + '"] canvas');
}
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 20000);
// 3. palette, keys sheet, the "/" menu, a streamed reply, chat right-clicks
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
try { AppUI.palette(); await wait(200); const pin = document.querySelector('.palette-input'); for (const q of ['lab', 'board', 'seq', 'apps', 'look']) { pin.value = q; pin.dispatchEvent(new Event('input')); await wait(60); } } catch { /* */ }
closeAll();
Native.newChat(claude.id);
await Native.send(claude.id, 'code table suggest think tool long');
for (let i = 0; i < 200 && Native.isBusy(H.activeChat[claude.id]); i++) await wait(100);
await rclick('.msg, .chat-row, .rail-item, .agent-row, .tab');
const v = Native.view(claude.id);
v.input.value = '/'; v.input.dispatchEvent(new Event('input')); await wait(200); v.input.value = '/la'; v.input.dispatchEvent(new Event('input')); await wait(100);
v.input.value = ''; v.input.dispatchEvent(new Event('input'));
// 4. every command (as dev/checks/qa-sweep.js), from the chat, then the Lab's and the board's from their tool
const SKIP = /^(rec|record|tour|tours|capture-folder|window-size|delete|del|restore|restore-backup|import|import-chats|backup|trash|reset|reload|relaunch|quit|unalias|forget|wipe|purge|empty|uninstall|clear|clear-all|new-window|update|sleep|restart|sync)$/;
const SKIP_DESC = /\b(delete|remove|forget|wipe|erase|for good|restore|import|reset|quit|uninstall|reload|restart)\b/i;
const res = { ran: 0, errors: [] };
// (round 60, trimdrive60) a command that opens ▶ Play's window or ▣ Present is checked to open and answer, then closed
// before the next one: left running, a Present bake (≈ 0.4 fps here) and Play windows starved the rest of the drive
// past its time limit. ▶ Play builds its page with the local three.js copy run-checks hands it (HEARTH_THREE_DIR).
const heavy = { play: [], present: [], fails: [] };
const settle = async (name) => {
  const playing = () => typeof GameMode !== 'undefined' && GameMode.playing;
  const presenting = () => typeof PresentReady !== 'undefined' && PresentReady.active;
  if (/^(game|present|playtest)$/.test(name)) await until(() => playing() || presenting(), 30000); // (it builds / gets ready first)
  if (playing()) {
    const live = GameMode.state().live; // (a scene the Lab must draw plays through its Stage window: no game window to ask)
    const st = live ? { playing: true } : await window.hub.game.state().catch((err) => ({ error: err.message }));
    const ans = live ? { value: 2 } : await window.hub.game.eval('1 + 1').catch((err) => ({ error: err.message }));
    heavy.play.push(`/${name}${live ? ' (live)' : ''}`);
    if (!st?.playing || ans?.value !== 2) heavy.fails.push(`/${name}: ▶ Play opened but didn't answer (${JSON.stringify(st?.error || ans?.error || ans).slice(0, 80)})`);
    GameMode.leave();
    if (!await until(() => !playing(), 10000)) heavy.fails.push(`/${name}: ▶ Play didn't close`);
  }
  if (presenting()) {
    const st = PresentReady.state();
    heavy.present.push(`/${name}`);
    if (!st?.phase) heavy.fails.push(`/${name}: ▣ Present started but didn't answer`);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (!await until(() => !presenting(), 5000)) { PresentReady.stop(); heavy.fails.push(`/${name}: ▣ Present didn't leave with full screen`); }
  }
};
const sweep = async (list, where) => {
  for (const d of list) {
    if (SKIP.test(d.name) || SKIP_DESC.test(d.desc)) continue;
    activate(where);
    try { await Promise.race([Commands.tryRun(`/${d.name}`, claude.id, v.input), wait(3000)]); } catch (err) { res.errors.push(`/${d.name}: ${err.message}`.slice(0, 160)); }
    await settle(d.name);
    await wait(60);
    res.ran += 1;
    closeAll();
    v.input.value = ''; Native.setDraft?.(claude.id, '');
  }
};
await sweep(Commands.list(), claude.id);
await sweep(Commands.list().filter((d) => /Three|Lab|Nodes|Sequence|Frames|Models|Motion|Music/.test(d.area)), 'tool:three');
await sweep(Commands.list().filter((d) => /Board/.test(d.area)), 'tool:board');
out.sweep = res;
out.heavy = { play: heavy.play, present: heavy.present };
// ▶ Play and ▣ Present must have been reached (the Lab's scene is open) and each answered and closed
if (!heavy.play.length) heavy.fails.push('no command opened ▶ Play');
if (!heavy.present.length) heavy.fails.push('no command started ▣ Present');
out.failures = heavy.fails;
out.misses = Lazy.misses?.().length;
return JSON.stringify(out, null, 1);
