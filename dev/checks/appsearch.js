// 🔎 Find anything (round 37, appsearch), driven like the owner would: not loaded before use; Ctrl/⌘+K (a real key
// press) opens the palette and loads it; no "/command" on screen; plain words ("dark mode", "cheaper", "permissions",
// "computer") typed letter by letter, each keystroke timed (< 16 ms); Enter on a Settings switch opens Settings on it
// (Advanced unfolded, the row lit); Enter on an AI setup row inside a closed fold opens that fold (and the one inside
// it) and lights the row; every Settings and AI setup row of the catalog is found on screen; a chat is found by what was
// said in it and opens; a menu row (the chat header's Pin to top) runs; a mission is set; a patch-notes part opens;
// in the Lab its things are found (Lab search's index) and "Search the Lab for…" opens Lab search with the words.
// Ends with the palette open on "dark mode" for the screenshot.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/appsearch.js --shot /tmp/appsearch.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const lazyState = (n) => Lazy.state().find((g) => g.name === n)?.state;
const box = () => document.querySelector('.palette');
const input = () => document.querySelector('.palette-input');
const rows = () => [...document.querySelectorAll('.palette .palette-item')].map((r) => ({ label: r.querySelector('.p-label').textContent, detail: r.querySelector('.p-detail').textContent, kind: r.querySelector('.p-kind').textContent }));
const top = (n = 5) => rows().slice(0, n).map((r) => `${r.label} [${r.kind}]`);
const ctrlK = async () => {
  for (const type of ['rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, modifiers: 2 } }), wait(3000)]);
};
const closePal = () => { if (box()?.isConnected) input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
async function openPal() {
  closePal();
  AppUI.palette();
  await until(() => box()?.isConnected, 3000);
  await wait(60); // the opening's fresh rows (the next task)
}
// types like the keyboard, one letter at a time; each keystroke timed (the search alone, and search + the list)
const times = [];
async function type(q) {
  const i = input();
  i.value = ''; i.dispatchEvent(new Event('input'));
  for (const ch of q) {
    i.value += ch;
    const t0 = performance.now();
    i.dispatchEvent(new Event('input'));
    times.push({ q: i.value, find: AppSearch.last.ms, all: Math.round((performance.now() - t0) * 100) / 100 });
  }
}
const enterOn = async (pred) => {
  const list = rows();
  const k = list.findIndex(pred);
  if (k < 0) return false;
  for (let j = 0; j < k; j += 1) input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
};
// every element lit (the gold flash), noted as it happens (on a busy machine a poll can miss the 1.6 s flash), with
// whether it was in view then
const flashed = new Map();
new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('ks-flash') && !flashed.has(m.target)) { const r = m.target.getBoundingClientRect(); flashed.set(m.target, { inView: r.top >= 0 && r.bottom <= innerHeight && r.height > 0 }); } })
  .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
const lit = (n) => Boolean(n && (n.classList.contains('ks-flash') || flashed.has(n)));

try {
  await until(() => typeof Lazy !== 'undefined' && lazyState('appsearch'), 20000);
  await wait(1500);
  step('first screen: Find anything is not loaded (tier "use"), nor the search core', lazyState('appsearch') === 'stub' && lazyState('searchcore') === 'stub', [lazyState('appsearch'), lazyState('searchcore')]);

  // ---------- Ctrl/⌘+K, a real key press ----------
  document.querySelector('.surface.active .composer textarea')?.focus();
  await ctrlK();
  const opened = await until(() => box()?.isConnected, 5000);
  const loaded = await until(() => Lazy.isIn('appsearch') && Lazy.isIn('searchcore'), 15000);
  step('Ctrl/⌘+K opens the palette and loads Find anything; it says so', opened && loaded && /Find anything/.test(input().placeholder), { placeholder: input()?.placeholder, labsearch: lazyState('labsearch') });
  await wait(1500); // Settings' switches and the patch notes join (later())

  // ---------- no command names on screen ----------
  await type('compact');
  const slash = rows().filter((r) => /(^|\s)\/[a-z][\w-]{2,}/i.test(`${r.label} ${r.detail}`));
  step('no "/command" text in the rows (they say what they do)', rows().length > 3 && !slash.length, { top: top(6), slash: slash.slice(0, 3) });

  // ---------- plain words ----------
  await type('dark mode');
  step('"dark mode" → ◐ Match my computer first', /Match my computer/.test(rows()[0]?.label), top());
  await type('cheaper');
  const ch6 = rows().slice(0, 6).map((r) => r.label).join(' | ');
  step('"cheaper" → Spending, Short answers (How long its answers are) and Continue lighter in the first 6', /Spending/.test(ch6) && /How long its answers are/.test(ch6) && /Continue lighter/.test(ch6), top(6));
  await type('permissions');
  step('"permissions" → Files it can use (the chat menu) in the first 4', rows().slice(0, 4).some((r) => r.label === 'Files it can use' && /right-click/.test(r.detail)), top(4));
  await type('computer');
  const c3 = rows().slice(0, 3).map((r) => r.label).join(' | ');
  step('"computer" → Check this AI and Check this computer… first', /Check this AI/.test(c3) && /Check this computer/.test(c3), top(3));
  await type('persnality');
  step('a typo: "persnality" → Personality (AI setup)', rows()[0]?.label === 'Personality' && rows()[0]?.kind.startsWith('AI setup'), top(3));
  await type('how do i back up');
  step('"how do i back up" → a backup row first (Backups…, Back up hub data…, the help answer)', /back ?up/i.test(rows()[0]?.label), top(3));

  // ---------- a Settings row: Settings opens on it ----------
  await type('chime');
  const chime = await enterOn((r) => r.label === 'A chime when a reply ends' && r.kind === 'Settings');
  const sdlg = await until(() => document.querySelector('dialog.settings-dialog[open]'), 5000);
  const chimeRow = await until(() => [...(sdlg?.querySelectorAll('.sf-row') || [])].find((r) => /A chime when a reply ends/.test(r.textContent)), 3000);
  await until(() => lit(chimeRow), 3000);
  step('Enter on a Settings switch: Settings opens, Advanced unfolded, the row lit and in view', chime && chimeRow && sdlg.querySelector('details.settings-more')?.open && lit(chimeRow) && flashed.get(chimeRow)?.inView, { jumped: AppSearch.last.jumped, lit: lit(chimeRow), inView: flashed.get(chimeRow)?.inView });
  sdlg?.close();
  await wait(200);

  // ---------- an AI setup row inside a closed fold (and the fold inside it) ----------
  store.set('options.open', []);
  Options?.hide?.();
  await openPal();
  await type('where its tokens go');
  const tg = await enterOn((r) => r.label === 'Where its tokens go');
  const sum = await until(() => { const b = Options.sheet?.body; const s = b && [...b.querySelectorAll('summary')].find((x) => /Where its tokens go/.test(x.textContent)); return s && lit(s) ? s : null; }, 6000);
  step('Enter on an AI setup row in a closed fold: AI setup opens, Spending and its "Where its tokens go" fold open, the row lit', tg && sum && sum.closest('[data-fold="spending"]')?.open && sum.parentElement.open, { jumped: AppSearch.last.jumped, top: top(3) });
  Options.hide();
  await wait(200);

  // ---------- every catalog row is found on screen ----------
  const missS = [];
  for (const r of AppSearchData.SETTINGS) {
    const n = await AppSearch.toSettings(r);
    const sec = n?.closest('.settings-section')?.querySelector('h3')?.textContent.trim();
    if (!n || (r.sec && sec !== r.sec && !n.matches('.settings-section'))) missS.push(r.id);
    else if (r.find && !n.textContent.toLowerCase().includes(r.find.toLowerCase().trim()) && !r.sel) missS.push(`${r.id} (text)`);
    document.querySelector('dialog.settings-dialog[open]')?.close();
    await wait(30);
  }
  // SettingsFind's switches too (they're found the same way)
  for (const s of SettingsFind.live()) {
    const it = AppSearch.findById(`set:sw:${s.cmd}`);
    const n = it ? await AppSearch.toSettings(it) : null;
    if (!n || !n.textContent.includes(s.label)) missS.push(`switch ${s.cmd}`);
    document.querySelector('dialog.settings-dialog[open]')?.close();
    await wait(30);
  }
  step('every Settings row Find anything knows is found in Settings (catalog + switches)', !missS.length, { n: AppSearchData.SETTINGS.length + SettingsFind.live().length, missing: missS });
  const missA = [];
  for (const r of AppSearchData.AI_SETUP) {
    const n = await AppSearch.toAiSetup(r);
    if (!n) { missA.push(r.id); continue; }
    const fold = r.fold ? n.closest(`[data-fold="${r.fold}"]`) : null;
    if (r.fold && !fold?.open) missA.push(`${r.id} (fold closed)`);
    for (let d = n.closest('details'); d; d = d.parentElement?.closest('details')) if (!d.open) { missA.push(`${r.id} (a fold around it is closed)`); break; }
  }
  Options.hide();
  step('every ⋯ AI setup row Find anything knows is found, its folds opened', !missA.length, { n: AppSearchData.AI_SETUP.length, missing: missA });

  // ---------- a chat found by what was said in it ----------
  const claude = H.claudeAgent();
  activate(claude.id);
  await wait(200);
  Native.newChat(claude.id);
  await wait(300);
  await Native.sendText(claude.id, 'Plan the zebrafinch orchestra intro: brass first, then strings');
  await until(() => !Native.isAgentBusy(claude.id), 30000);
  const said = H.activeChat[claude.id];
  Native.newChat(claude.id);
  await wait(500);
  await openPal();
  await type('zebrafinch');
  const inChat = await until(() => rows().find((r) => r.kind === 'In a chat' && /zebrafinch/i.test(r.label)) || rows().find((r) => r.kind === 'Chat' && /zebrafinch/i.test(r.label)), 6000);
  const hitKind = inChat?.kind;
  const went = await enterOn((r) => r === inChat || (r.label === inChat?.label && r.kind === inChat?.kind));
  const back = await until(() => H.activeChat[claude.id] === said, 4000);
  step('a chat is found by what was said in it (its message) and Enter opens it', inChat && went && back, { kind: hitKind, row: inChat, top: top(4) });

  // ---------- a menu action runs (the chat header's right-click: Organise › Pin to top) ----------
  await openPal();
  await type('pin to top');
  const pinRow = rows().find((r) => /Pin to top/.test(r.label) && r.kind === 'Menu');
  await enterOn((r) => r === pinRow || (r.label === pinRow?.label && r.kind === 'Menu'));
  const pinned = await until(() => H.chats.find((c) => c.id === said)?.pinned, 4000);
  step('a menu row runs the menu\'s own action (chat header › Organise › Pin to top pins this chat)', pinRow && pinned, { row: pinRow, menus: AppSearch.last.menus });

  // ---------- a mission ----------
  await openPal();
  await type('swarm');
  const sw = await enterOn((r) => r.kind === 'Mission' && /Swarm/.test(r.label));
  const setOk = await until(() => Missions.current(claude.id).id === 'swarm', 3000);
  step('a mission: Enter makes it the next message\'s', sw && setOk, top(3));
  Missions.set(claude.id, 'normal');

  // ---------- patch notes ----------
  // a part of the newest round (search only keeps the newest 8 rounds, so a fixed one would age out)
  const newest = ((await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).match(/round-\d+\.md/) || [])[0];
  const NEWS = ((await (await fetch(`docs/patch-notes/${newest}`, { cache: 'no-store' })).text()).match(/\n## ([^\n]+)/) || [])[1].replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await openPal();
  await type(`what's new: ${NEWS.toLowerCase()}`);
  const pn = rows()[0];
  await enterOn((r) => r.label === pn?.label);
  const pnd = await until(() => document.querySelector('dialog.pn-dialog[open]'), 5000);
  const pnh = await until(() => [...(pnd?.querySelectorAll('.pn-body :is(h2, h3, h4, h5)') || [])].find((h) => h.textContent.includes(NEWS) && lit(h)), 4000);
  step('"what\'s new: <a part of the newest round>" → that part of the patch notes, opened and lit', new RegExp(`What's new: ${esc(NEWS)}`).test(pn?.label || '') && pnh, { NEWS, row: pn, jumped: AppSearch.last.jumped });
  pnd?.close();

  // ---------- the Lab: Lab search's things, and its own box ----------
  await SQL.lab();
  await wait(1000);
  await openPal();
  await until(() => AppSearch.labOn, 15000);
  await type('vertical video');
  const labRows = rows().filter((r) => r.kind === 'Lab');
  step('in the Lab: its things are found (Lab search\'s index), "vertical video" → ▦ All formats', labRows.some((r) => /All formats/.test(r.label)), { top: top(5), lab: labRows.slice(0, 3).map((r) => r.label) });
  const more = await enterOn((r) => /^Search the Lab for/.test(r.label));
  const ls = await until(() => document.querySelector('dialog.ls-dlg[open]'), 8000);
  step('"Search the Lab for…" opens Lab search with the words', more && ls && LabSearch.input()?.value === 'vertical video', LabSearch.input()?.value);
  LabSearch.close();
  activate(claude.id);
  await wait(300);

  // ---------- time per keystroke ----------
  // every keystroke above was timed as it happened; on a busy machine a few land on a garbage collection or another
  // process's turn, so each one over 16 ms is typed again (palette open, the indexes' word memo emptied first, so the
  // words are looked up afresh: the real first-time cost), best of 3
  await openPal();
  const slow = times.filter((t) => t.all >= 16);
  const again = [];
  for (const t of slow) {
    let best = Infinity; let bestFind = Infinity;
    for (let k = 0; k < 3; k += 1) {
      AppSearch.index.fixed.memo.clear(); AppSearch.index.live.memo.clear();
      const i = input(); i.value = t.q;
      const t0 = performance.now();
      i.dispatchEvent(new Event('input'));
      best = Math.min(best, performance.now() - t0); bestFind = Math.min(bestFind, AppSearch.last.ms);
      await wait(30);
    }
    again.push({ q: t.q, first: t.all, again: Math.round(best * 100) / 100, find: bestFind });
  }
  const sorted = times.map((t) => t.all).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const avgAll = times.reduce((a, t) => a + t.all, 0) / times.length;
  step('instant: every keystroke under 16 ms (search + the list; one that landed on a pause typed again)', again.every((x) => x.again < 16) && avgAll < 8, { keys: times.length, avgAll: Math.round(avgAll * 100) / 100, p95, maxFind: Math.max(...times.map((t) => t.find)), again, items: AppSearch.last.items, liveMs: AppSearch.last.liveMs });

  // ---------- for the screenshot ----------
  await openPal();
  await type('dark mode');
  await wait(300);
} catch (e) { step('threw', false, String(e?.stack || e)); }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.failed.length;
return JSON.stringify(out, null, 1);
