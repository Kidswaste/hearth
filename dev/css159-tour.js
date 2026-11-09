// css159 (round 159): a scripted tour of the app's views, for CSS rule usage (`--coverage`) and for before / after
// screenshots (dev/css159-diff.js sets window.CSS159_SHOTS to a folder: animations and transitions are stopped and
// the caret hidden, so two runs of the same build draw the same pixels). Not a check: it never fails.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --coverage /tmp/cov-tour.json --script dev/css159-tour.js
//   node dev/css159-diff.js shoot /tmp/before [--app <other checkout>]   ·   node dev/css159-diff.js compare /tmp/before /tmp/after
const SHOTS = window.CSS159_SHOTS || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { shots: [], errors: [] };
const frozen = () => { if (!SHOTS || document.getElementById('css159-freeze')) return; const s = document.createElement('style'); s.id = 'css159-freeze'; s.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'; document.head.append(s); };
// with each picture, every element's computed style (and its ::before / ::after) as a 32-bit hash, in document order:
// dev/css159-diff.js compares them too (a moved rule that loses or wins differently shows even off screen)
out.styles = {};
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const styleOf = (cs) => { const a = []; for (let i = 0; i < cs.length; i++) a.push(`${cs[i]}:${cs.getPropertyValue(cs[i])};`); return a.sort().join(""); }; // (sorted: the order custom properties come in follows the sheets they were declared in)
const styles = () => { const hs = []; const tags = []; for (const e of document.querySelectorAll('body *')) { if (e.id === 'css159-freeze') continue; let t = styleOf(getComputedStyle(e)); for (const pe of ['::before', '::after']) { const c = getComputedStyle(e, pe); if (c.content !== 'none' && c.content !== 'normal') t += pe + styleOf(c); } hs.push(fnv(t.replace(/hearth-smoke-[^/"')]+/g, "APP"))); tags.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/).join('.')}` : ''}`.slice(0, 80)); } return { hs, tags }; };
const shot = async (name) => { if (!SHOTS) return; frozen(); document.activeElement?.blur?.(); await wait(350); await smoke({ shot: `${SHOTS}/${name}.png` }); out.shots.push(name); try { const t0 = performance.now(); out.styles[name] = styles(); out.styleMs = (out.styleMs || 0) + Math.round(performance.now() - t0); } catch (err) { out.errors.push(`styles ${name}: ${err.message}`); } };
const step = async (name, fn) => { try { await fn(); } catch (err) { out.errors.push(`${name}: ${String(err?.message || err).slice(0, 120)}`); } };
const closeAll = async () => {
  document.querySelectorAll('dialog[open]').forEach((x) => { try { x.close(); } catch { /* */ } });
  document.querySelectorAll('.palette, .ctx-menu, .slash-menu').forEach((x) => x.remove());
  try { if (KeysUI.isOpen()) KeysUI.close(); } catch { /* */ }
  try { if (CmdBar.isOpen()) CmdBar.close(); } catch { /* */ }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(150);
};
store.set('commands.hidden', false);
const claude = H.claudeAgent();
await wait(800);
await step('start', async () => { activate(claude.id); await wait(300); await shot('01-start'); });

// a chat with a streamed reply (code, a table, suggestions, thinking, a tool call)
await step('chat', async () => {
  Native.newChat(claude.id); await wait(200);
  await Native.send(claude.id, 'code table suggest think tool long');
  await until(() => !Native.isBusy(H.activeChat[claude.id]), 30000);
  await wait(600);
  const box = Native.view(claude.id)?.el?.querySelector('.messages'); if (box) box.scrollTop = 0;
  await shot('02-chat-top');
  if (box) box.scrollTop = box.scrollHeight;
  await shot('03-chat-end');
});
await step('slash', async () => { const v = Native.view(claude.id); v.input.value = '/'; v.input.dispatchEvent(new Event('input')); await wait(300); await shot('04-slash-menu'); v.input.value = ''; v.input.dispatchEvent(new Event('input')); await closeAll(); });
await step('ctx', async () => {
  const m = [...document.querySelectorAll('.msg')].find((n) => n.getBoundingClientRect().width);
  if (m) { const r = m.getBoundingClientRect(); m.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 10 })); await wait(200); await shot('05-msg-menu'); }
  await closeAll();
});

// the looks (every preset; a picture of the featured ones), then the appearance toggles
const look0 = H.config?.theme?.preset || '';
await step('looks', async () => {
  for (const id of Object.keys(AppUI.THEMES)) {
    Look.applyPreset(id, { quiet: true }); await wait(120);
    if (['forgeheart', 'classic', 'forge-light'].includes(id) || /plain/i.test(id)) await shot(`06-look-${id}`);
  }
  for (const [k, vs] of [['motion', ['calm', 'off']], ['density', ['compact', 'comfortable']], ['corners', ['round', 'square']], ['chatfont', ['clean']], ['texture', [false]], ['glow', [0, 100]], ['tips', [false]]]) {
    for (const v of vs) { try { Look.setFx({ [k]: v }); } catch { /* */ } await wait(80); }
  }
  H.config.theme.fx = {}; Look.applyPreset(look0 || 'forgeheart', { quiet: true }); await wait(300);
});

// Settings (first sight, every fold open), Trim Hearth
await step('settings', async () => {
  await AppUI.openSettings(); await wait(800); await shot('07-settings');
  const dlg = document.querySelector('dialog.settings-dialog[open]');
  dlg?.querySelectorAll('details').forEach((d) => { d.open = true; });
  await wait(400); await shot('08-settings-open');
  const f = dlg?.querySelector('form'); if (f) { f.scrollTop = f.scrollHeight / 2; await shot('09-settings-mid'); f.scrollTop = f.scrollHeight; await shot('10-settings-end'); }
  await closeAll();
});
await step('trim', async () => { await Lazy.load('trim'); await Trim.open(); await wait(800); await shot('11-trim'); await closeAll(); });

// the palette, the keys sheet, the command bar, the Alt reveal
await step('palette', async () => { AppUI.palette(); await wait(300); await shot('12-palette'); const pin = document.querySelector('.palette-input'); if (pin) { pin.value = 'look'; pin.dispatchEvent(new Event('input')); await wait(200); await shot('13-palette-look'); } await closeAll(); });
await step('keys', async () => { KeysUI.open(); await wait(500); await shot('14-keys'); await closeAll(); });
await step('cmdbar', async () => { await Lazy.load('cmdbar').catch(() => {}); CmdBar.open(); await wait(400); await shot('15-cmdbar'); await closeAll(); });
await step('hints', async () => { KeysUI.showHints?.(); await wait(300); await shot('16-key-hints'); KeysUI.hideHints?.(); await wait(100); });

// dialogs
for (const [name, fn] of [['usage', 'usageDialog'], ['downloads', 'downloadsDialog'], ['backups', 'backupsDialog'], ['find', 'find']]) {
  await step(name, async () => { const p = AppUI[fn]?.(); await Promise.race([p, wait(1200)]); await wait(500); await shot(`17-dialog-${name}`); await closeAll(); });
}

// every rail tool (projects, boards, the Lab …), one picture each
await step('tools', async () => {
  for (const t of Tools.all()) {
    try { activate(`tool:${t.id}`); } catch { continue; }
    if (t.id === 'three') { await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 20000); await wait(2500); } else await wait(800);
    await shot(`20-tool-${t.id}`);
    await closeAll();
  }
});
// the Lab: its menus, the look toggle (Forgeheart / Plain), the scene controls shown
await step('lab', async () => {
  activate('tool:three'); await wait(800);
  const L = H.surfaces.get('tool:three')?.el;
  for (const b of [...(L?.querySelectorAll('.three-toolbar button') || [])].slice(0, 12)) { const r = b.getBoundingClientRect(); if (!r.width) continue; b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 3, clientY: r.y + 3 })); await wait(60); await closeAll(); }
  try { await Commands.tryRun('/stage show', claude.id, Native.view(claude.id).input); } catch { /* */ }
  await wait(400);
  document.documentElement.setAttribute('data-lablook', 'plain'); await wait(300);
  document.documentElement.removeAttribute('data-lablook'); await wait(300);
});
activate(claude.id); await wait(300);
await shot('30-back-to-chat');
return JSON.stringify(out);
