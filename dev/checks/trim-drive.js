// Trim (round 18): a broad drive of the app for coverage (which functions / CSS rules never run): every lazy group
// loaded, every rail tool opened, the palette and the "/" menu, right-click menus on the things you can point at, a
// streamed reply, then every chat command with no arguments (as qa-sweep, destructive ones skipped) from a chat and
// the Lab / board commands again from their own tool.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --coverage /tmp/cov.json --script dev/checks/trim-drive.js
//   node dev/coverage-report.js /tmp/cov.json
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
const sweep = async (list, where) => {
  for (const d of list) {
    if (SKIP.test(d.name) || SKIP_DESC.test(d.desc)) continue;
    activate(where);
    try { await Promise.race([Commands.tryRun(`/${d.name}`, claude.id, v.input), wait(3000)]); } catch (err) { res.errors.push(`/${d.name}: ${err.message}`.slice(0, 160)); }
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
out.misses = Lazy.misses?.().length;
return JSON.stringify(out, null, 1);
