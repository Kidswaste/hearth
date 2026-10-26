// (round 68, bugbutton68) 🪲 Something broke, end to end in a throwaway profile that starts like the morning after a
// crash: dev/fixtures/bugbutton68 holds a fake crash marker (safetynet's session.json still "running") and the last
// run's problem log (a Lab error with a key and a user folder in it, the VST host stopping). Then:
//   · the one-time note "Hearth closed unexpectedly last time" with 🪲 See what happened; clicking it opens the card on
//     the saved report (redacted again on the way: no key, no user folder); the note isn't offered twice
//   · a renderer error (thrown for real), a main-process error (an unhandled rejection), a request that fails and a
//     program that stops, made on purpose (bug:test, test copies only), each with a secret, a private folder or chat
//     text in it: all kept, all redacted
//   · ⋯ › Something broke by real clicks: the newest problem in plain words with the page that was open, the counts,
//     the list; Copy report for Claude (the clipboard only); Restart Hearth and Reload this page only there (Reload
//     held back while a reply is being written); /broke too
//   · nothing loaded before the first click (the card's code is in the lazy group 'jankwatch')
//   node dev/smoke.js --data dev/fixtures/bugbutton68 --check-timeout 120000 --script dev/checks/bugbutton68.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(100); } return null; };
const out = { ok: [], bad: [], info: {} };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const mouse = (type, x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } });
const click = async (node) => { const r = node.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
const LEAK = /sk-ant|hunter2|Private|diary|\bBob\b|my private chat|\/tmp\/|\/root\//;

await until(() => window.BugWatch && window.Jank && document.getElementById('rail-more'), 20000);
const stub = Lazy.state().find((g) => g.name === 'jankwatch')?.state;
check('the card\'s code is not loaded before a click (lazy group jankwatch)', stub === 'stub' && typeof window.BugCard === 'undefined', stub);
check('the window\'s recorder is in (bugwatch.js, with errorcalm) and the main side answers', typeof window.hub?.bug?.recent === 'function' && typeof BugWatch.add === 'function');

// ---------- 1. the morning after a crash: the note, once ----------
const noteBtn = await until(() => [...document.querySelectorAll('#toasts .toast')].find((t) => /Hearth closed unexpectedly last time/.test(t.textContent))?.querySelector('button:not(.toast-x)'), 20000);
check('the one-time note: "Hearth closed unexpectedly last time" with 🪲 See what happened', noteBtn && /See what happened/.test(noteBtn.textContent), noteBtn?.closest('.toast')?.textContent);
const r0 = await window.hub.bug.recent();
check('the last run\'s log was kept as a saved report (data/bugbutton/saved.json)', r0.saved.length === 1 && r0.saved[0].kind === 'closed' && r0.saved[0].n === 2, JSON.stringify(r0.saved));
check('the note is once (asked again: nothing)', (await window.hub.bug.start()) === null);
if (noteBtn) await click(noteBtn);
let card = await until(() => document.querySelector('dialog.bugcard[open]'), 8000);
const savedHead = card?.querySelector('.bc-saved .bc-head')?.textContent || '';
const savedText = card?.querySelector('.bc-saved')?.textContent || '';
out.info.saved = savedText;
check('the card opens on the saved report', /^Hearth closed unexpectedly last time \(last sign of life \d\d:\d\d\)\.$/.test(savedHead), savedHead);
check('what went wrong before it, in plain words, with the page', /Before that: .*2 window errors/.test(savedText) && /1 program stopped/.test(savedText) && /Something in the window broke: TypeError/.test(savedText) && /the plugin host \(VST\) stopped \(exit code 3221225477\)/.test(savedText) && /the Lab/.test(savedText), savedText);
check('the saved report was redacted again (no key, no user folder)', !LEAK.test(savedText) && /Hearth\/tools\/three\.js|\[key\]/.test(JSON.stringify(await window.hub.bug.saved(r0.saved[0].id))), savedText);
card?.querySelector('[data-k="close"]') && await click(card.querySelector('[data-k="close"]'));
await sleep(300);
check('Close closes the saved report\'s card (one card at a time)', document.querySelectorAll('dialog.bugcard[open]').length === 0, String(document.querySelectorAll('dialog.bugcard[open]').length));
document.querySelectorAll('dialog.bugcard[open]').forEach((d) => d.close());

// ---------- 2. problems made on purpose, each with something private in it ----------
await window.hub.bug.test('child');
let ipcErr = null; try { await window.hub.bug.test('ipc'); } catch (err) { ipcErr = err; }
check('a request that fails still fails for its caller (as before)', Boolean(ipcErr));
await window.hub.bug.test('main');
await sleep(300);
setTimeout(() => { throw new Error('bugbutton68 (made on purpose): a window error, key sk-ant-api03-WINDOWabcdefghijklmnopqrstu, "this is my private chat message, never in a report"'); }, 0);
const r1 = await until(async () => { const r = await window.hub.bug.recent(); return r.entries.some((e) => e.kind === 'error' && e.src === 'window') && r.entries.some((e) => e.kind === 'main') ? r : null; }, 6000);
const ents = r1?.entries || [];
out.info.entries = ents;
const by = (k) => ents.find((e) => e.kind === k);
check('the window\'s error kept, with the page that was open', by('error')?.src === 'window' && /bugbutton68 \(made on purpose\): a window error/.test(by('error').what) && by('error').where, JSON.stringify(by('error')));
check('the main process\'s error kept (an unhandled rejection), with the page', /^bugbutton68 \(made on purpose\): a main-process error/.test(by('main')?.what || '') && Boolean(await until(async () => (await window.hub.bug.recent()).entries.find((e) => e.kind === 'main')?.where, 3000)), JSON.stringify(by('main')));
check('the failed request kept by channel', by('ipc')?.ch === 'bug:test' && /a request that fails/.test(by('ipc').what), JSON.stringify(by('ipc')));
check('the program that stopped kept', by('child')?.name === 'the plugin host (VST)' && by('child').code === 3221225477, JSON.stringify(by('child')));
check('all of it redacted: no key, password, private folder or chat text', !LEAK.test(JSON.stringify(ents)) && /\[key\]/.test(by('error')?.what || '') && /password=\[hidden\]/.test(by('ipc')?.what || '') && /"\[text\]"/.test(by('error')?.what || '') && /\/bugmain\.js/.test(by('ipc')?.what || ''), JSON.stringify(ents.map((e) => e.what)));

// ---------- 3. ⋯ › Something broke, by real clicks ----------
document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()); // (the page error's own report offer)
await click(document.getElementById('rail-more'));
const row = await until(() => [...document.querySelectorAll('#menu button')].find((b) => /Something broke/.test(b.textContent)), 4000);
const rows = [...document.querySelectorAll('#menu button')].filter((b) => !b.hidden).map((b) => b.textContent.trim());
check('the rail ⋯ has "Something broke" right after "That was slow" (with its icon)', row && row.querySelector('.menu-ico') && /That was slow/.test(rows[0]) && /Something broke/.test(rows[1]), rows.slice(0, 3).join(' | '));
if (row) await click(row);
card = await until(() => document.querySelector('dialog.bugcard[open]'), 8000);
const head = card?.querySelector('.bc-head')?.textContent || '';
const counts = card?.querySelector('.bc-counts')?.textContent || '';
const lines = [...(card?.querySelectorAll('.bc-lines li') || [])].map((x) => x.textContent);
out.info.card = { head, counts, lines, tip: card?.querySelector('.bc-tip')?.textContent, earlier: card?.querySelector('.bc-earlier')?.textContent };
check('headline: the newest problem in plain words, when and where', /^Something in the window broke, just now, in .+\.$/.test(head), head);
check('the counts by kind', ['1 window error', '1 failed request', '1 program stopped', '1 main-process error'].every((w) => counts.includes(w)), counts);
check('the list: each with its time, newest first', lines.length >= 4 && /^\d\d:\d\d/.test(lines[0]) && /Something in the window broke/.test(lines[0]), lines.slice(0, 5).join(' / '));
check('nothing private on the card', !LEAK.test(card?.textContent || ''), card?.textContent?.slice(0, 300));
check('the saved report stays one click away (Earlier: …)', /Earlier: Hearth closed unexpectedly/.test(out.info.card.earlier || ''), out.info.card.earlier);
const btn = (k) => card?.querySelector(`[data-k="${k}"]`);
check('Restart Hearth and Reload this page only are there; Reload is offered (nothing busy)', btn('restart') && /Restart Hearth/.test(btn('restart').textContent) && btn('reload') && !btn('reload').disabled, `${btn('reload')?.disabled} ${btn('reload')?.title}`);
const busy0 = Native.isAgentBusy;
Native.isAgentBusy = () => true;
check('Reload this page only is held back while a reply is being written', BugCard.reloadBlock() === 'a reply is being written');
Native.isAgentBusy = busy0;
out.info.shot = window.BUG_SHOT || `${window.SMOKE_TMP || '/tmp'}/bugbutton68-card.png`;
await smoke({ shot: out.info.shot });

// ---------- 4. 📋 Copy report for Claude: the clipboard only ----------
let clip = '';
const realWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
navigator.clipboard.writeText = (t) => { clip = t; return realWrite(t).catch(() => {}); };
if (btn('copy')) await click(btn('copy'));
await until(() => clip, 3000);
navigator.clipboard.writeText = realWrite;
out.info.report = clip.slice(0, 3000);
check('Copy report for Claude: the report on the clipboard', /^🪲 "Something broke" report from Hearth/.test(clip) && /## This start/.test(clip) && /channel bug:test/.test(clip) && /child \(main process\) · (in .+ · )?the plugin host \(VST\) · code 3221225477/.test(clip) && /Card said: Something in the window broke/.test(clip), clip.slice(0, 500));
check('the report is redacted too', !LEAK.test(clip), (clip.match(LEAK) || [])[0]);
check('the button says it was copied', await until(() => /Copied/.test(btn('copy')?.textContent || ''), 3000));
card?.querySelector('[data-k="close"]') && await click(card.querySelector('[data-k="close"]'));
await sleep(300);
check('Close closes it', !document.querySelector('dialog.bugcard[open]'));

// ---------- 5. the other ways in ----------
check('/broke exists', Boolean(Commands.get('broke')));
await Commands.tryRun('/broke', H.claudeAgent().id);
const card2 = await until(() => document.querySelector('dialog.bugcard[open]'), 4000);
check('/broke opens the card too', Boolean(card2));
card2?.close();

out.pass = out.bad.length === 0;
return JSON.stringify(out, null, 1);
