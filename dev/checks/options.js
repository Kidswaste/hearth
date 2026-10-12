// ⋯ Options (options.js): the chat's ⋯ opens the drawer with tabs; a switch runs its command and shows its state; a
// choice, a slider (min / max), a "tell it" box; the search finds across tabs; Modes; a preset saved and set again;
// right-click ⋯ is still the quick menu; a window's ⋯ opens on its tab; ⚙ Options in the rail, no Commands button.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/options.js --shot /tmp/options.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const S = () => document.querySelector('aside.opt-sheet');
const row = (name) => S()?.querySelector(`.opt-row[data-name="${name}"]`);
const tab = async (id) => { S().querySelector(`.opt-tabs [data-tab="${id}"]`).click(); await wait(150); };
const find = async (q) => { const s = S().querySelector('.opt-search'); s.value = q; s.dispatchEvent(new Event('input')); await wait(150); };
try {
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const dots = Native.view(C.id).root.querySelector('.native-head button[title="Chat options"]');
  dots.click();
  ok(await until(() => S()), 'the chat ⋯ opens Options');
  out.tabs = [...S().querySelectorAll('.opt-tabs button')].map((b) => b.textContent);
  ok(out.tabs.length >= 6 && S().querySelector('.opt-tabs .on')?.dataset.tab === 'chat', `tabs, on This chat (${out.tabs})`);
  ok(/Model/.test(S().textContent), 'this chat\'s own menu is there');
  out.sections = [...S().querySelectorAll('.opt-h')].map((h) => h.textContent);
  ok(S().querySelector('.opt-pick'), 'Model › / Access › are pick rows');
  await find('fold long');
  ok(row('autofold')?.querySelector('.opt-switch'), 'Fold long replies is a switch');
  ok(/Fold|long/i.test(row('autofold')?.title || ''), 'hovering it says what it does');

  // a switch: runs /autofold and reads back the state
  const before = store.get('chat.autoFold', true);
  row('autofold').querySelector('.opt-switch').click();
  ok(await until(() => store.get('chat.autoFold', true) !== before), 'the switch turned it over');
  ok(row('autofold').querySelector('.opt-switch').getAttribute('aria-checked') === String(!before), 'and shows the new state');
  row('autofold').querySelector('.opt-switch').click(); await until(() => store.get('chat.autoFold', true) === before);

  // search across tabs, a choice
  await find('spacing');
  const dens = row('density');
  ok(dens?.querySelectorAll('.opt-seg button').length === 3, 'search finds Spacing in another tab, as 3 buttons');
  dens?.querySelector('[data-v="compact"]').click(); await wait(400);
  ok(dens?.querySelector('[data-v="compact"]').classList.contains('on'), 'a choice is marked');
  row('density')?.querySelector('[data-v="normal"]')?.click(); await wait(300);
  await find('');

  // Modes
  await tab('modes');
  ok(S().querySelectorAll('.opt-mode').length === 4, 'four modes');
  S().querySelector('.opt-mode').click(); await wait(600);
  ok(S().querySelector('.opt-mode.on'), 'the mode you picked is marked');

  // a preset: set an option in App, save, set it again
  await tab('app');
  out.appKinds = [...S().querySelectorAll('.opt-sec .opt-h')].map((h) => h.textContent.trim());
  const sliders = S().querySelectorAll('input[type=range]').length;
  const texts = S().querySelectorAll('.opt-text').length;
  ok(texts > 0, `"tell it" boxes (${texts}), sliders (${sliders})`);
  store.set('options.vals', { ...store.get('options.vals', {}), density: 'normal' });
  const realPrompt = Modal.prompt; Modal.prompt = async () => 'Calm desk';
  [...S().querySelectorAll('.opt-presets button')].find((b) => /Save as preset/.test(b.textContent)).click(); await wait(300);
  Modal.prompt = realPrompt;
  const chip = [...S().querySelectorAll('.opt-presets .chip')].find((b) => b.textContent === 'Calm desk');
  ok(chip && store.get('options.presets', []).some((p) => p.name === 'Calm desk' && p.lines.includes('/density normal')), 'a preset keeps what you set');
  chip?.click(); await wait(400);
  store.set('options.presets', store.get('options.presets', []).filter((p) => p.name !== 'Calm desk'));

  // Esc closes; right-click ⋯ is the quick menu
  S().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  ok(!S(), 'Esc closes it');
  dots.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 60 })); await wait(200);
  ok([...document.querySelectorAll('#menu button')].some((b) => /Model|Compact/.test(b.textContent)), 'right-click ⋯: the quick menu');
  if (typeof hideMenu === 'function') hideMenu();

  // a window's ⋯ opens on its tab; the rail
  activate('tool:three'); await until(() => document.querySelector('.surface.active .tool-head .tool-opts'), 15000);
  document.querySelector('.surface.active .tool-head .tool-opts').click();
  ok(await until(() => S()?.querySelector('.opt-tabs .on')?.dataset.tab === 'lab'), 'the Lab\'s ⋯ opens on the Lab tab');
  out.labRows = S()?.querySelectorAll('.opt-row').length;
  ok(out.labRows > 20, `Lab options (${out.labRows})`);
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  ok(document.querySelector('#rail [data-id="tool:options"]') && !document.querySelector('#rail [data-id="tool:commands"]'), 'rail: ⚙ Options, no Commands button');
  ok(Commands.get('commands'), '/commands still works');
  activate(C.id);
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
