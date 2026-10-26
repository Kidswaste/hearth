// (round 67, slowbutton67) 🐢 That was slow, end to end in a throwaway profile: a freeze of the window (a click whose
// handler runs 1.1 s) and then a freeze of the MAIN process (jank:test-stall, test copies only, 1.5 s, while the window
// tells it the owner is busy), made on purpose; the rail's ⋯ wears its dot after the window's freeze; ⋯ › 🐢 That was slow
// opens the card (by real clicks); the card names the last hiccup in plain words ("The last hiccup: 1.5 s, while you were
// in … (main process busy with a test freeze (made on purpose))"), the day's count (both freezes, counted once each)
// and yesterday's; 📋 Copy report for Claude puts the report on the clipboard; nothing new runs before the click (the
// card's code isn't loaded, no profile was taken, the raw minute stays small).
//   node dev/smoke.js --check-timeout 120000 --script dev/checks/slowbutton67.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(100); } return null; };
const out = { ok: [], bad: [], info: {} };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const mouse = (type, x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } });
const click = async (node) => { const r = node.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };

await until(() => window.Jank && document.getElementById('rail-more'), 15000);
const stub = Lazy.state().find((g) => g.name === 'jankwatch')?.state;
check('the card\'s code is not loaded before the click (lazy group jankwatch)', stub === 'stub' && typeof window.SlowCard === 'undefined', stub);
check('the main side answers hub.jank.recent (jankmain recent())', typeof window.hub?.jank?.recent === 'function' && typeof window.hub?.jank?.testStall === 'function');
// a known start: yesterday had 4, today nothing
const d0 = new Date(); d0.setDate(d0.getDate() - 1);
const yKey = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
localStorage.setItem('jank.hiccups', JSON.stringify({ [yKey]: 4 }));
await sleep(1500); // let start-up settle (a long frame there isn't the owner's hiccup)
const days = () => JSON.parse(localStorage.getItem('jank.hiccups') || '{}');
const before = days();

// ---------- 1. the window freezes: a click whose handler runs 1.1 s ----------
const btn = document.createElement('button');
btn.textContent = 'freeze'; btn.style.cssText = 'position:fixed;left:45%;top:45%;z-index:2147483647;width:90px;height:44px';
btn.addEventListener('click', () => { const t = performance.now(); while (performance.now() - t < 1100) { /* frozen on purpose */ } });
document.body.append(btn);
await sleep(200);
await click(btn);
await sleep(1200);
btn.remove();
const ev = Jank.slow().last;
const fr = ev.filter((x) => x.kind === 'frame' && x.ms >= 1000);
const inp = ev.filter((x) => x.kind === 'input' && x.ms >= 1000);
check('the window\'s freeze kept: a long frame and the click that waited', fr.length >= 1 && inp.length >= 1, JSON.stringify(ev.slice(-4)));
const dot = await until(() => document.getElementById('rail-more')?.dataset.slow != null, 3000);
const tint = getComputedStyle(document.getElementById('rail-more')).color;
check('the rail ⋯ turns amber after a freeze of a second or more (its tooltip says why)', dot && tint === 'rgb(245, 165, 36)' && /That was slow/.test(document.getElementById('rail-more').title), `${tint} ${document.getElementById('rail-more')?.title}`);
const afterWin = days();
const todayKey = Object.keys(afterWin).find((k) => k !== yKey);
check('the window\'s freeze counted once today (frame + input = one hiccup)', todayKey && afterWin[todayKey] - (before[todayKey] || 0) === 1, JSON.stringify({ before, afterWin }));

// ---------- 2. the main process freezes 1.5 s while the window says the owner is busy ----------
await sleep(1500); // the busy hold (0.7 s) is over, so the next key sends a fresh "busy" message
const stall = window.hub.jank.testStall(1500);
await sleep(80); // the stall has begun in the main process
dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })); // Jank: busy → a message to the main process (it waits)
await stall;
await sleep(300);
const main = await window.hub.jank.recent(20000);
out.info.main = main;
check('the main process named its own freeze (the IPC handler that ran long)', main.slow.some((x) => x.what === 'jank:test-stall' && x.ms >= 1400), JSON.stringify(main.slow));
check('the window\'s message arrived late (the main process stuck)', main.late.some((x) => x.ms >= 1000), JSON.stringify(main.late));

// ---------- 3. ⋯ › 🐢 That was slow, by real clicks ----------
await click(document.getElementById('rail-more'));
const row = await until(() => [...document.querySelectorAll('#menu button')].find((b) => /That was slow/.test(b.textContent)), 4000);
check('the rail ⋯ menu has "That was slow" first', row && [...document.querySelectorAll('#menu button')].filter((b) => !b.hidden)[0] === row, [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim()).slice(0, 4).join(' | '));
if (row) await click(row);
const card = await until(() => document.querySelector('dialog.slowcard[open]'), 8000);
check('the card opened', Boolean(card));
const head = card?.querySelector('.sc-head')?.textContent || '';
const count = card?.querySelector('.sc-count')?.textContent || '';
out.info.card = { head, lines: [...(card?.querySelectorAll('.sc-lines li') || [])].map((x) => x.textContent), tip: card?.querySelector('.sc-tip')?.textContent, count };
check('headline: the last hiccup is the main process\'s, in plain words',
  /^The last hiccup: 1\.[4-9] s, while you were in .+ \(main process busy with a test freeze \(made on purpose\)\)\.$/.test(head), head);
check('details say what the main process did', /spent 1\.\d s on a test freeze \(made on purpose\) \(jank:test-stall\)/.test(out.info.card.lines.join(' ')), out.info.card.lines.join(' / '));
// (both freezes, plus whatever else ran ≥ 200 ms on this busy test machine: a menu opening, start-up)
check('the hiccups of the last 30 s counted, the worst named', /([2-9]|\d\d) hiccups in the last 30 s, the worst \d/.test(out.info.card.lines.join(' ')), out.info.card.lines.join(' / '));
const nowDays = days();
check('daily count: both freezes, once each, and yesterday\'s', count === `Hiccups over 500 ms today: ${nowDays[todayKey]} (yesterday: 4)` && nowDays[todayKey] - (before[todayKey] || 0) === 2, `${count} ${JSON.stringify(nowDays)}`);
check('the week\'s bars: 7 days, today last', card?.querySelectorAll('.sc-bar').length === 7 && card.querySelectorAll('.sc-bar')[6].dataset.n === String(nowDays[todayKey]));
check('the amber went when the card opened (tooltip back)', document.getElementById('rail-more')?.dataset.slow == null && /^More/.test(document.getElementById('rail-more').title), document.getElementById('rail-more').title);
out.info.shot = window.SLOW_SHOT || `${window.SMOKE_TMP || '/tmp'}/slowbutton67-card.png`; // (--eval "window.SLOW_SHOT='…'" to keep it)
await smoke({ shot: out.info.shot });

// ---------- 4. 📋 Copy report for Claude: clipboard only ----------
const copyBtn = card?.querySelector('[data-k="copy"]');
let clip = '';
const realWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
navigator.clipboard.writeText = (t) => { clip = t; return realWrite(t).catch(() => {}); };
if (copyBtn) await click(copyBtn);
await until(() => clip, 3000);
navigator.clipboard.writeText = realWrite;
out.info.report = clip.slice(0, 3000);
check('Copy report for Claude: the report on the clipboard', /That was slow" report/.test(clip) && /main IPC handler "jank:test-stall" ran 1[45]\d\d ms synchronously/.test(clip) && /Card said: The last hiccup/.test(clip), clip.slice(0, 400));
check('the button says it was copied', await until(() => /Copied/.test(copyBtn?.textContent || ''), 3000), copyBtn?.textContent);
check('no profile was taken to make the card', !Jank.profiling() && !(Jank._test.live()?.ad || {})['profile (asked)']);
check('the raw minute stays small', Jank.slow().last.length <= 120, String(Jank.slow().last.length));
card?.querySelector('[data-k="close"]') && await click(card.querySelector('[data-k="close"]'));
await sleep(300);
check('Close closes it', !document.querySelector('dialog.slowcard[open]'));

// ---------- 5. Ctrl/⌘+K and the command also open it ----------
check('/slow exists (a second way in)', Boolean(Commands.get('slow')));
const r = await Commands.tryRun('/slow', H.claudeAgent().id);
const card2 = await until(() => document.querySelector('dialog.slowcard[open]'), 4000);
check('/slow opens the card too', Boolean(card2), JSON.stringify(r));
card2?.close();

out.pass = out.bad.length === 0;
return JSON.stringify(out, null, 1);
