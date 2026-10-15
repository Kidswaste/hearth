// ✦ Since you were away (round 42, whatsnew). Simulates an update that brings rounds 33–41 to a computer that last saw
// round 32 (store whatsnew.seen = 32), then:
//   · the digest card is the first after-update note (Hints: update:…), instead of the "Hearth updated" toast
//   · it lists ≤ 12 plain lines grouped Lab · Chats & AIs · Saving tokens · Mac & Windows · … · Fixes, "and N more"
//     opens the rest in place, the lead says 9 rounds (33–41); seen is now the newest round; the ✦ What's new card
//     stays away for that update
//   · Show me jumps: "Where its tokens go" → ⋯ AI setup on that row; a Lab line → the Lab's search on its name
//   · Read the full notes opens the per-round reader; Settings › What's new… › Since you were away opens it again
//   · after a reload: not shown again; a hand-pulled update (seen 39) brings it once through the queue (rounds 40–41)
//   node dev/smoke.js --check-timeout 180000 --script dev/checks/whatsnew.js --shot /tmp/whatsnew.png
store.set('whatsnew.seen', 32);
store.set('whatsnew.last', null);
store.set('hints.seen', {}); store.set('hints.off', false); store.set('hints.last', 0);
store.set('hints.test', { gap: 0, start: 0, startNotice: 0 });
store.set('update.just', { from: 'aaaaaaa', to: 'bbbbbbb', n: 240, at: Date.now(), restart: false, note: '', files: ['docs/patch-notes/round-41.md', 'docs/upgrades/routines.md'] });
return 'set';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const fail = []; const out = { steps: [] };
// (round 42) the newest round comes from the notes themselves, so this check doesn't need editing every round
const NEW = Number(((await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).match(/round-(\d+)\.md/) || [])[1]) || 41;
const ok = (c, what, info) => { out.steps.push(`${c ? '✓' : '✗'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!c) fail.push(what); return Boolean(c); };
try {
  activate(H.claudeAgent().id);
  const card = await until(() => document.querySelector('.wn-card'), 15000);
  ok(Boolean(card), 'after the update: the Since you were away card');
  const log = Hints.state().log.filter((x) => x.what === 'show').map((x) => x.id);
  ok(log[0]?.startsWith('update:'), 'it is the first after-update note (patch notes first)', log);
  ok(![...document.querySelectorAll('#toasts .toast')].some((t) => /Hearth updated/.test(t.textContent)), 'no separate "Hearth updated" toast on top of it');
  const lead = card?.querySelector('.wn-lead')?.textContent || '';
  ok(new RegExp(`^Hearth updated: ${NEW - 32} rounds of changes \\(33–${NEW}\\)`).test(lead), `it says what: Hearth updated, ${NEW - 32} rounds (33–${NEW})`, lead);
  const groups = [...(card?.querySelectorAll('.wn-body > .wn-group') || [])].map((g) => g.dataset.group);
  const order = WhatsNewCore.GROUPS.map((g) => g.id);
  ok(groups.length >= 4 && groups.every((g, i) => !i || order.indexOf(groups[i - 1]) < order.indexOf(g)) && groups[0] === 'lab', 'grouped: Lab first, then Chats & AIs, Saving tokens, Mac & Windows…', groups);
  const rows = [...(card?.querySelectorAll('.wn-body > .wn-group .wn-row') || [])];
  ok(rows.length > 6 && rows.length <= 12, '≤ 12 lines', rows.length);
  ok(rows.every((r) => !/\*\*|`|(^|\s)\/[a-z][\w-]{2,}/.test(r.querySelector('.wn-text').textContent)), 'plain lines (no Markdown, no /commands)');
  ok(new Set(rows.map((r) => r.dataset.round)).size >= 4, 'lines from several rounds', rows.map((r) => r.dataset.round));
  ok(rows.filter((r) => r.querySelector('.wn-show')).length >= 4, 'Show me where a feature has a place');
  ok(Number(store.get('whatsnew.seen', 0)) === Math.max(...(await WhatsNew.rounds())), 'seen is now the newest round', store.get('whatsnew.seen', 0));
  ok(WhatsNew.covers(Hints.state().log.find((x) => x.id.startsWith('update:'))?.id.slice(7) * 1), 'the ✦ What\'s new card stays away for this update');
  const more = card?.querySelector('.wn-more');
  ok(more && /^and \d+ more$/.test(more.textContent), '"and N more"', more?.textContent);
  more?.click();
  ok(card?.querySelectorAll('.wn-rest .wn-row').length > 10, '…opens the rest in place', card?.querySelectorAll('.wn-rest .wn-row').length);
  if (typeof smoke === 'function') await smoke({ shot: '/tmp/whatsnew-card.png' }).catch(() => {});
  // ---------- Show me: ⋯ AI setup › Spending › Where its tokens go ----------
  const tokRow = rows.find((r) => /Where its tokens go/.test(r.textContent));
  ok(Boolean(tokRow?.querySelector('.wn-show')), '"Where its tokens go" has Show me');
  tokRow?.querySelector('.wn-show')?.click();
  const jumped = await until(() => AppSearch?.last?.jumped?.id === 'ai:tokens-go' && AppSearch.last.jumped, 10000);
  ok(jumped?.found && Options.sheet?.root?.isConnected !== false && !document.querySelector('.wn-card:not(.out)'), 'Show me → ⋯ AI setup, on "Where its tokens go"', jumped);
  Options.hide?.();
  await wait(400);
  // ---------- the dialog, a Lab line's Show me ----------
  await WhatsNew.open({ since: 32 });
  const dlg = await until(() => document.querySelector('dialog.wn-dialog[open]'), 4000);
  ok(Boolean(dlg), 'the digest opens as a page too');
  if (typeof smoke === 'function') await smoke({ shot: '/tmp/whatsnew-dialog.png' }).catch(() => {});
  const labRow = [...(dlg?.querySelectorAll('.wn-group[data-group="lab"] .wn-row') || [])].find((r) => r.querySelector('.wn-show'));
  const labName = labRow?.querySelector('b')?.textContent;
  labRow?.querySelector('.wn-show')?.click();
  const ls = await until(() => typeof LabSearch !== 'undefined' && LabSearch.isOpen && LabSearch.input?.()?.value, 30000);
  ok(H.surfaceIdFor(H.activeId) === 'tool:three' && ls === labName, 'a Lab line\'s Show me → the Lab, its search on that name', { ls, labName, at: H.activeId });
  LabSearch.close?.();
  document.querySelector('dialog.ls-dialog[open], dialog[open]')?.close();
  await wait(300);
  // ---------- Read the full notes ----------
  await WhatsNew.open({ since: 32 });
  (await until(() => document.querySelector('dialog.wn-dialog[open] .wn-full'), 4000))?.click();
  const pn = await until(() => document.querySelector('dialog.pn-dialog[open] .pn-body h1, dialog.pn-dialog[open] .pn-body h2, dialog.pn-dialog[open] .pn-body h3') && document.querySelector('dialog.pn-dialog[open]'), 8000);
  ok(pn && /^Round \d+/.test(pn.querySelector('.pn-pick')?.selectedOptions?.[0]?.textContent || '') && !document.querySelector('dialog.wn-dialog[open]'), 'Read the full notes → the per-round reader', pn?.querySelector('.pn-pick')?.value);
  pn?.close();
  await wait(200);
  // ---------- Settings › What's new… › Since you were away ----------
  activate(H.claudeAgent().id);
  await AppUI.openSettings();
  const wbtn = await until(() => [...document.querySelectorAll('dialog.settings-dialog[open] button')].find((b) => b.textContent.trim() === 'What\'s new…'), 6000);
  wbtn?.click();
  const item = await until(() => [...document.querySelectorAll('#menu:not([hidden]) .menu-item, #menu:not([hidden]) button, #menu:not([hidden]) [role=menuitem]')].find((n) => /Since you were away/.test(n.textContent)), 4000);
  ok(Boolean(item), 'Settings › What\'s new… has "Since you were away"');
  item?.click();
  ok(await until(() => document.querySelector('dialog.wn-dialog[open]') && !document.querySelector('dialog.settings-dialog[open]'), 6000), '…which opens the digest');
  document.querySelector('dialog.wn-dialog[open]')?.close();
  out.stats = WhatsNew.stats;
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ pass: !fail.length, fail, ...out }, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const fail = []; const out = { steps: [] };
const NEW = Number(((await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).match(/round-(\d+)\.md/) || [])[1]) || 41;
const ok = (c, what, info) => { out.steps.push(`${c ? '✓' : '✗'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!c) fail.push(what); return Boolean(c); };
try {
  // not shown again: the next start (4 s after ready: the index check) brings nothing
  await wait(7000);
  ok(!document.querySelector('.wn-card') && !Hints.state().log.some((x) => /^whatsnew:|^update:/.test(x.id)), 'after a reload: not shown again', Hints.state().log.map((x) => x.id));
  // a hand-pulled update (this computer saw 39): once, through the queue, rounds 40–41
  store.set('whatsnew.seen', 39);
  if (window.Lazy && !Lazy.isIn('whatsnew')) await Lazy.load('whatsnew');
  const p = WhatsNew.atStart();
  const card = await until(() => document.querySelector('.wn-card'), 10000);
  ok(card && new RegExp(`${NEW - 39} rounds of changes \\(40–${NEW}\\)`).test(card.querySelector('.wn-lead')?.textContent || '') && Hints.state().log.some((x) => x.what === 'show' && /^whatsnew:/.test(x.id)), `pulled by hand (seen 39): once, through the queue, rounds 40–${NEW}`, card?.querySelector('.wn-lead')?.textContent);
  await p;
  card?.querySelector('.sr-x')?.click();
  ok((await WhatsNew.atStart()) === false, '…and not again', store.get('whatsnew.seen', 0));
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
store.set('hints.test', null); Hints.config(null);
return JSON.stringify({ pass: !fail.length, fail, ...out }, null, 1);
