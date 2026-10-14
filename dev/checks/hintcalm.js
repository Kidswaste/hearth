// 🤫 One hint at a time (round 38, hintcalm). Simulates an update, then the first open of several features (a chat, the
// Lab with its look-around hint, 🩺 and the ✦ card), with a short gap between tips so it fits in a test:
//   · the update note (patch notes) comes first; never more than one optional hint on screen (sampled every 50 ms)
//   · in the Lab: 🩺 (rank 10) before the look-around hint (20) before the ✦ card (30)
//   · none while you type in the chat box (it shows a few seconds after the last key) or while a reply streams
//   · Settings › Hearth › Don't show tips silences tips and lines (notices still show); essential notes (an error) show
//     at once, also while you type and with tips off; Off brings tips back
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/hintcalm.js --shot /tmp/hintcalm.png
store.set('update.just', { from: 'aaaaaaa', to: 'bbbbbbb', n: 12, at: Date.now(), restart: false, note: '', files: ['docs/upgrades/quickstart.md', 'docs/upgrades/bigscreen.md'] });
store.set('quickstart.testAuto', true);
store.set('quickstart', {});
store.set('hints.seen', {}); store.set('hints.off', false); store.set('hints.last', 0);
store.set('three.viewHint', false);
store.set('hints.test', { gap: 6000, start: 1500, startNotice: 0 }); // (the real gap is 3 minutes)
return 'set';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(50); } return null; };
const fail = []; const out = { steps: [] };
const ok = (c, what, info) => { out.steps.push(`${c ? '✓' : '✗'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!c) fail.push(what); return Boolean(c); };
const C = H.claudeAgent();
// every optional hint that can be on screen by itself
const HINT_TOAST = /Hearth updated|Back on the previous version|Look around:|Full screen\.|is fixed in this update|Make it one key|Install ffmpeg|💡|hintcalm tip/;
const onScreen = () => {
  const cards = [...document.querySelectorAll('.qs-card:not(.qs-out), .speed-card:not(.out), .two-welcome, .sd-hint')].filter((n) => n.checkVisibility?.({ visibilityProperty: true }) ?? true);
  const toasts = [...document.querySelectorAll('#toasts .toast')].filter((t) => HINT_TOAST.test(t.textContent));
  return [...cards.map((n) => n.className.split(' ')[0]), ...toasts.map((t) => t.textContent.slice(0, 24))];
};
let max = 0; let worst = []; let sampling = true;
(async () => { while (sampling) { const v = onScreen(); if (v.length > max) { max = v.length; worst = v; } await wait(50); } })();
const shown = () => Hints.state().log.filter((x) => x.what === 'show').map((x) => x.id);
const closeAll = () => { for (const b of document.querySelectorAll('.qs-card .qs-x, .speed-card .sr-x, .sd-hint .lm-x, .two-welcome button')) b.click(); for (const t of document.querySelectorAll('#toasts .toast')) if (HINT_TOAST.test(t.textContent)) t.remove(); };
try {
  ok(typeof Hints !== 'undefined' && Commands.get('hints')?.area === 'App', 'the queue and /hints are there');
  // ---------- after the update: the patch notes first ----------
  activate(C.id);
  const upd = await until(() => [...document.querySelectorAll('#toasts .toast')].find((t) => /Hearth updated/.test(t.textContent)), 8000);
  ok(upd && /Patch notes/.test(upd.textContent), 'after the update: "Hearth updated" with 📰 Patch notes');
  ok(shown()[0]?.startsWith('update:'), 'the patch notes came first', shown());
  const comp = document.querySelector('.surface.active .composer');
  if (upd && comp) { const a = upd.getBoundingClientRect(); const b = comp.getBoundingClientRect(); ok(!(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top), 'the note is not over the chat box'); }
  // what came by itself next, one at a time (each closed once seen, like the owner would)
  const seenNext = [];
  for (let i = 0; i < 3; i++) {
    const before = shown().length;
    const next = await until(() => shown().length > before && Hints.current, 20000);
    if (!next) break;
    seenNext.push(Hints.current?.id || shown().at(-1));
    await wait(600);
    closeAll();
  }
  ok(seenNext.some((id) => /^quickstart:chat/.test(id)), 'then, a few seconds apart: the ✦ card of this chat', seenNext);
  // ---------- the Lab: three of them at once ----------
  closeAll();
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.peek?.() && ThreeLab.stageHooks?.host?.checkVisibility?.({ visibilityProperty: true }), 30000);
  await wait(1500);
  closeAll();
  Hints.config({ gap: 1500 });
  ThreeGestures.onBox({ type: 'view-hint' });
  SceneDoctorHook.hint(`hintcalm|${Date.now()}`, 'The frame is blank.');
  QuickstartHooks.soon(10);
  const labOrder = [];
  for (let i = 0; i < 3; i++) {
    const before = shown().length;
    const got = await until(() => shown().length > before, 15000);
    if (!got) break;
    labOrder.push(shown().at(-1));
    ok(onScreen().length <= 1, `Lab: one on screen at a time (${shown().at(-1)})`, onScreen());
    await wait(500);
    closeAll();
  }
  ok(labOrder[0] === 'scenedoctor' && labOrder[1] === 'lab.view', 'in the Lab: 🩺 first, then the look-around hint (then the ✦ card)', labOrder);
  // ---------- none while typing ----------
  activate(C.id);
  await wait(400); closeAll();
  Hints.config({ gap: 0 });
  const ta = document.querySelector('.surface.active .composer textarea');
  ta.focus();
  let typing = true;
  (async () => { while (typing) { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); await wait(300); } })();
  await wait(400);
  const p1 = Hints.offer({ id: `hc-type-${Date.now()}`, show: () => toast('hintcalm tip while typing', { timeout: 3000 }) });
  let early = false; p1.then((v) => { if (typing) early = v; });
  await wait(4000);
  typing = false;
  const stopAt = Date.now();
  const r1 = await Promise.race([p1, wait(9000).then(() => 'late')]);
  ok(!early && r1 === true && Date.now() - stopAt >= 3000, 'none while you type: it shows a few seconds after the last key', { early, r1, after: Date.now() - stopAt });
  closeAll();
  // ---------- none while a reply streams ----------
  Native.sendText(C.id, 'slow: count to five');
  await until(() => Native.isAgentBusy(C.id), 5000);
  const p2 = Hints.offer({ id: `hc-stream-${Date.now()}`, show: () => toast('hintcalm tip after the reply', { timeout: 3000 }) });
  let during = false; p2.then((v) => { if (Native.isAgentBusy(C.id)) during = v; });
  const line = Hints.offer({ id: `hc-line-${Date.now()}`, kind: 'inline', show: () => Native.note(C.id, 'hintcalm line after the reply') });
  await wait(400);
  ok(Native.isAgentBusy(C.id) && !during && !document.querySelector('.surface.active .msg.note')?.textContent.includes('hintcalm line'), 'none while a reply streams (a tip, a line in the chat)');
  await until(() => !Native.isAgentBusy(C.id), 30000);
  ok((await Promise.race([p2, wait(6000)])) === true && !during, 'the tip shows when the reply has ended');
  ok((await Promise.race([line, wait(6000)])) === true, '… and the line in the chat');
  closeAll();
  // ---------- Don't show tips (Settings) ----------
  await AppUI.openSettings('tips');
  const row = await until(() => [...document.querySelectorAll('.sf-row')].find((r) => /Don't show tips/.test(r.textContent)), 8000);
  ok(Boolean(row), 'Settings has one switch: "Don\'t show tips"');
  row?.querySelector('button[data-v="on"]')?.click();
  ok(await until(() => Hints.off(), 4000), 'its On silences the tips');
  document.querySelector('dialog.settings-dialog[open]')?.close();
  await wait(300);
  const t3 = Hints.offer({ id: `hc-off-${Date.now()}`, show: () => toast('hintcalm tip with tips off') });
  const l3 = Hints.offer({ id: `hc-off-line-${Date.now()}`, kind: 'inline', show: () => Native.note(C.id, 'hintcalm line with tips off') });
  store.set('quickstart', {}); QuickstartHooks.soon(10);
  await wait(3500);
  ok((await Promise.race([t3, wait(100).then(() => 'waiting')])) === false && (await Promise.race([l3, wait(100).then(() => 'waiting')])) === false && !onScreen().length && !document.querySelector('.qs-card'), 'with tips off: no tip, no line, no ✦ card by itself', onScreen());
  // essential: at once, while typing, tips off
  ta.focus(); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  toast('hintcalm: something went wrong', { type: 'error', timeout: 4000 });
  ok([...document.querySelectorAll('#toasts .toast.error')].some((t) => /hintcalm: something went wrong/.test(t.textContent)), 'an error still shows at once (typing, tips off)');
  const n3 = Hints.offer({ id: `hc-notice-${Date.now()}`, kind: 'notice', show: () => toast('hintcalm notice') });
  ok((await Promise.race([n3, wait(9000)])) === true, 'a notice (like the update note) still shows with tips off');
  await AppUI.openSettings('tips');
  const row2 = await until(() => [...document.querySelectorAll('.sf-row')].find((r) => /Don't show tips/.test(r.textContent)), 8000);
  row2?.querySelector('button[data-v="off"]')?.click();
  ok(await until(() => !Hints.off(), 4000), 'its Off brings them back');
  document.querySelector('dialog.settings-dialog[open]')?.close();
  sampling = false;
  ok(max <= 1, 'never more than one optional hint on screen', { max, worst });
  if (typeof smoke === 'function') await smoke({ shot: '/tmp/hintcalm-end.png' }).catch(() => {});
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
sampling = false;
store.set('hints.test', null); Hints.config(null);
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
