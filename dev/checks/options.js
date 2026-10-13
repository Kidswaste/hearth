// ⋯ AI setup (options.js): the chat's ⋯ opens it; a personality, an instruction (added, paused, removed), a tool
// switched on and off, habits, how hard it thinks: all saved on the agent and in its system prompt, never in your
// message; "/" opens no command menu; right-click ⋯ is the quick menu; a window's ⋯; ⚙ in the rail.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/options.js --shot /tmp/options.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const S = () => document.querySelector('aside.opt-sheet');
const secOf = (title) => [...(S()?.querySelectorAll('.opt-sec') || [])].find((s) => s.querySelector('.opt-h')?.textContent === title);
const rowOf = (label) => [...(S()?.querySelectorAll('.opt-row') || [])].find((r) => r.querySelector('.opt-label')?.textContent === label);
try {
  store.set('commands.hidden', true);
  const C = H.claudeAgent(); activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const A = () => H.agent(C.id); // saveConfig may hand back fresh agent objects
  const keep = JSON.stringify({ systemPrompt: C.systemPrompt, instructions: C.instructions, boardTools: C.boardTools, effort: C.effort, selfReview: C.selfReview, fileAccess: C.fileAccess });

  // "/" in the chat box: no command menu
  const box = Native.view(C.id).root.querySelector('textarea');
  box.value = '/'; box.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
  ok(!document.querySelector('.slash-menu'), 'typing "/" opens no command menu');
  box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true }));

  const dots = Native.view(C.id).root.querySelector('.native-head button[title="Chat options"]');
  dots.click();
  ok(await until(() => S()), 'the chat ⋯ opens AI setup');
  out.sections = [...S().querySelectorAll('.opt-h')].map((h) => h.textContent);
  ok(['Personality', 'Instructions', 'What it can use', 'Memory', 'Habits', 'How hard it thinks'].every((t) => out.sections.includes(t)), `the six parts (${out.sections})`);
  ok(S().querySelector('.opt-who .opt-chip.on')?.textContent.includes(C.name), 'set up for this chat\'s AI');

  // personality
  const psel = secOf('Personality').querySelector('select');
  const pick = [...psel.options].find((o) => /Deep thinker|Motion designer|Data analyst/.test(o.textContent));
  psel.value = pick.value; psel.dispatchEvent(new Event('change')); await wait(300);
  ok(A().systemPrompt && secOf('Personality').querySelector('.opt-what')?.textContent, `a personality is saved on the agent (${pick?.textContent})`);

  // instructions: add, pause, remove
  const add = secOf('Instructions').querySelector('.opt-add');
  add.value = 'Always give a 9:16 version too'; add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(300);
  ok(A().instructions?.[0]?.text === 'Always give a 9:16 version too' && secOf('Instructions').querySelectorAll('.opt-rule').length === 1, 'an instruction is added');
  const prompt = await window.hub.debugPrompt?.(C.id);
  if (prompt != null) ok(/standing instructions[\s\S]*9:16 version/.test(prompt), 'it is in the system prompt');
  const cb = secOf('Instructions').querySelector('.opt-rule input'); cb.click(); await wait(300);
  ok(A().instructions[0].on === false && secOf('Instructions').querySelector('.opt-rule-text.off'), 'paused');
  secOf('Instructions').querySelector('.opt-rule button').click(); await wait(300);
  ok(!A().instructions && !secOf('Instructions').querySelector('.opt-rule'), 'removed');

  // a tool, a habit, thinking
  const was = Boolean(A().boardTools);
  rowOf('Mood board').querySelector('.opt-switch').click(); await wait(300);
  ok(Boolean(A().boardTools) !== was, 'Mood board switched for this AI');
  rowOf('Mood board').querySelector('.opt-switch').click(); await wait(300);
  ok(Boolean(A().boardTools) === was, 'and back');
  ok(rowOf('Files on this computer')?.querySelector('select'), 'files access is there');
  // (round 32) the row sets the AI's own level (every chat), not just the open chat
  const fsel = rowOf('Files on this computer')?.querySelector('select');
  if (fsel) { fsel.value = 'full'; fsel.dispatchEvent(new Event('change')); }
  ok(await until(() => A().fileAccess?.level === 'full' && A().fileAccess.folders?.length), 'Files → Full is saved on the AI, with a folder');
  ok(await until(() => [...S().querySelectorAll('.access-ai button')].some((b) => /Add a folder/.test(b.textContent))), 'its folders: ＋ Add a folder…');
  Native.newChat(C.id); await wait(200);
  ok(Access.effective(Native.chatOf(C.id) || { agentId: C.id }).level === 'full' && Access.sendOptions(Native.chatOf(C.id) || { agentId: C.id }).access?.level === 'full', 'a new chat gets Full (and sends it)');
  [...secOf('How hard it thinks').querySelectorAll('button')].find((b) => b.textContent === 'Deep').click(); await wait(300);
  ok(A().effort === 'high', 'Deep → effort high');

  // switch to the other AI
  const other = [...S().querySelectorAll('.opt-who .opt-chip')].find((b) => !b.classList.contains('on'));
  if (other) { other.click(); await wait(200); ok(S().querySelector('.opt-who .opt-chip.on') === other || S().querySelector('.opt-who .opt-chip.on')?.textContent === other.textContent, 'the chips switch which AI you set up'); }

  S().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  ok(!S(), 'Esc closes it');
  dots.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 60 })); await wait(200);
  ok([...document.querySelectorAll('#menu button')].some((b) => /Model|Compact/.test(b.textContent)), 'right-click ⋯: the quick menu');
  if (typeof hideMenu === 'function') hideMenu();

  // a window's ⋯ and the rail
  activate('tool:three'); await until(() => document.querySelector('.surface.active .tool-head .tool-opts'), 15000);
  document.querySelector('.surface.active .tool-head .tool-opts').click();
  ok(await until(() => S()), 'the Lab\'s ⋯ opens it');
  out.labAgent = S()?.querySelector('.opt-who .opt-chip.on')?.textContent;
  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  ok(document.querySelector('#rail [data-id="tool:options"]') && !document.querySelector('#rail [data-id="tool:commands"]'), 'rail: ⚙ AI setup, no Commands button');
  const k = JSON.parse(keep); for (const [key, v] of Object.entries(k)) { if (v === undefined) delete A()[key]; else A()[key] = v; } await saveConfig();
  activate(C.id);
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
