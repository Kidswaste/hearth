// ✨ "Make it look finished" (round 30, autopolish) on a deliberately bad 9:16 scene: too dark, three clashing color
// sliders, standing still. Loaded with the Lab; reachable from ✦ More › ✨ Look & motion, the preview's right-click
// (a real right-click through CDP) and the ◎ mission "Polish the look" (Lab director only). One click → exposure up on
// ◐ Grade, the colors moved into one harmony, the speed up; measured again: brighter, moving, a better finish score;
// the card (before / after pictures, a row per fix with its numbers); unticking one puts only that one back; ↶ Undo
// puts everything back (grade, sliders, palette, Light mode); /autopolish check only lists; the mission runs the local
// pass first, then asks the director for what's left with the cost first.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/autopolish.js --shot /tmp/autopolish.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const cdp = (name, params) => smoke({ cdp: name, params });

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof AutoPolish !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });
step('loaded with the Lab: PolishCore, AutoPolish, /autopolish', typeof PolishCore !== 'undefined' && Boolean(Commands.get('autopolish')));
step('the ◎ mission "Polish the look" is there for the Lab director (only)', Missions.shown(dir.id).some((m) => m.id === 'lab-polish') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-polish'));
const look = LabEasy.previewItem().items().find((x) => /Look & motion/.test(x.label)).items();
step('✦ More › ✨ Look & motion › ✨ Make it look finished (and the Lab audit finds it)', look.some((x) => /Make it look finished/.test(x.label)) && LabEasy.placed().has('autopolish'), look.map((x) => x.label));

// ---------- the deliberately bad scene: dark, clashing, static, 9:16 ----------
const hsl = (h, s, l) => PolishCore.hslToHex(h, s, l);
const C1 = '#d02020'; const C2 = hsl(70, 0.7, 0.45); const C3 = hsl(290, 0.7, 0.45);
await d.newSketch('polish probe', `const P = tweak({ speed: [0, 0, 2], size: [1, 0.5, 2], c1: '${C1}', c2: '${C2}', c3: '${C3}' });
const c = document.createElement('canvas'); c.width = 270; c.height = 480; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const t0 = performance.now();
function draw() {
  const t = (performance.now() - t0) / 1000;
  g.globalAlpha = 1; g.fillStyle = '#020202'; g.fillRect(0, 0, 270, 480); g.globalAlpha = 0.3;
  [P.c1, P.c2, P.c3].forEach((col, i) => { const a = t * P.speed * 2 + i * 2.09; g.fillStyle = col; g.beginPath(); g.arc(135 + Math.cos(a) * 70 * P.size, 220 + Math.sin(a) * 70 * P.size, 52 * P.size, 0, 7); g.fill(); });
  requestAnimationFrame(draw);
}
draw();`, 3);
cmd.size('9:16');
const probe = () => d.layers().layers.find((L) => !/^◐/.test(L.name || ''));
const slid = () => d.sliders(probe().id).sliders || [];
await until(() => slid().some((s) => s.key === 'c3'), 12000);
await wait(1500);
const light0 = Boolean(cmd.perf().light);
const pal0 = d.refs.palette().slice();
const val = (k) => slid().find((s) => s.key === k)?.value;

// ---------- /autopolish check: only says what it would fix ----------
const chk = await Commands.get('autopolish').run('check', {});
step('/autopolish check lists the fixes, changes nothing', /Too dark/i.test(chk) && /clash/i.test(chk) && /static/i.test(chk) && !(await LabGrade.findLayers(d)).grade && val('speed') === 0, chk);

// ---------- one click ----------
let t0 = performance.now();
const r = await AutoPolish.run().catch((e) => ({ error: e.message }));
const ms = Math.round(performance.now() - t0);
const ids = (r.fixes || []).map((f) => f.id);
step('one click: too dark, colors clashing, too static all found and fixed', ['dark', 'clash', 'static'].every((x) => ids.includes(x)), { error: r.error, ids, left: r.left, ms });
const gs = await LabGrade.state();
step('… exposure up on ◐ Grade', gs.grade?.exposure > 0.5, gs.grade && { exposure: gs.grade.exposure, tone: gs.grade.tone });
step('… the colors moved into one harmony (the lead kept), and the palette follows', val('c1') === C1 && (val('c2') !== C2 || val('c3') !== C3) && PolishCore.clash([val('c1'), val('c2'), val('c3')]).score === 0, { c: [val('c1'), val('c2'), val('c3')], pal: d.refs.palette() });
step('… the speed up from 0', val('speed') > 0, val('speed'));
const fx = (id) => r.fixes.find((f) => f.id === id);
step('measured again: brighter, moving, a better finish score (the real numbers, not a guess)', r.after > r.before && fx('dark')?.after > fx('dark')?.before && fx('static')?.after > fx('static')?.before,
  { score: [r.before, r.after], dark: [fx('dark')?.beforeText, fx('dark')?.afterText], motion: [fx('static')?.beforeText, fx('static')?.afterText], clash: [fx('clash')?.beforeText, fx('clash')?.afterText] });
const card = AutoPolish.card;
step('the card: finish score before → after, Before / After pictures, a ticked row per fix with its numbers, Undo / Before / Ask', card?.isConnected && card.querySelectorAll('.ap-fix input:checked').length === r.fixes.length && card.querySelectorAll('.ap-pic img').length === 2 && /→/.test(card.querySelector('.ap-score')?.textContent || '') && card.querySelectorAll('.ap-n').length && [...card.querySelectorAll('.ap-fix:not(.off) .ap-n')].filter((n) => !/frame rate/.test(n.textContent)).every((n) => /→/.test(n.textContent)) && ['↶ Undo', 'Before'].every((t) => [...card.querySelectorAll('button')].some((b) => b.textContent === t)) && card.querySelector('.ap-ask'), card?.textContent.slice(0, 400));
const hold = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Before');
hold.dispatchEvent(new PointerEvent('pointerdown')); await wait(100);
const ov = document.querySelector('.ap-before');
hold.dispatchEvent(new PointerEvent('pointerup')); await wait(100);
step('hold "Before": the picture before the fixes over the preview, gone on release', Boolean(ov?.src) && !document.querySelector('.ap-before'));

// ---------- untick one: only that one goes back ----------
const row = [...card.querySelectorAll('.ap-fix')].find((x) => /clashing/i.test(x.textContent));
const box = row?.querySelector('input');
box.checked = false; box.dispatchEvent(new Event('change'));
await AutoPolish.queue;
step('untick "Colors clashing": the colors go back, the exposure and the speed stay', val('c2') === C2 && val('c3') === C3 && (await LabGrade.state()).grade?.exposure > 0.5 && val('speed') > 0 && AutoPolish.card.querySelector('.ap-fix.off'), { c: [val('c2'), val('c3')], speed: val('speed') });

// ---------- ↶ Undo: everything back ----------
await AutoPolish.undo();
await wait(400);
const U = await LabGrade.findLayers(d);
step('↶ Undo: no grade, speed 0, the colors, the palette and Light mode as before, the card gone', !U.grade && !U.lens && val('speed') === 0 && val('c2') === C2 && JSON.stringify(d.refs.palette()) === JSON.stringify(pal0) && Boolean(cmd.perf().light) === light0 && !AutoPolish.card, { speed: val('speed'), light: [light0, cmd.perf().light] });

// ---------- the preview's right-click (a real one) ----------
const fr = ThreeLab.stageHooks.frameRect;
const x = fr.left + fr.width / 2; const y = fr.top + fr.height / 2;
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
await until(() => document.querySelector('#menu button'), 4000);
const menu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
step('the preview\'s right-click: ✨ Make it look finished, near the top', menu.slice(0, 4).some((t) => /Make it look finished/.test(t)), menu.slice(0, 8));
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(200);

// ---------- the ◎ mission: the local pass first, then the director for what's left (cost first) ----------
const lastUserMsg = () => (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user').at(-1) || null;
const handled = Missions.start(dir.id, 'lab-polish', 'warmer highlights');
const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'), 60000) && document.querySelector('dialog.ui-modal[open]');
const st = AutoPolish.state();
step('mission "Polish the look": the local pass ran first (fixes applied, no tokens) before anything goes out', handled && st.on && st.fixes.some((f) => f.id === 'dark') && Boolean((await LabGrade.findLayers(d)).grade) && !/polish the look/.test(lastUserMsg()?.text || ''), { fixes: st.fixes.map((f) => f.id) });
const costText = dlg?.textContent || '';
step('… then asks before the director gets anything, with the cost in tokens', /tokens/.test(costText) && /fixed \d+ thing/.test(costText), costText.slice(0, 300));
dlg?.querySelector('button.primary')?.click();
await until(() => /polish the look/.test(lastUserMsg()?.text || ''), 15000);
const um = lastUserMsg();
step('… the director gets what was done (with the numbers), what\'s left and your words', um && /A local pass already did/.test(um.text) && /too dark/.test(um.text) && /→/.test(um.text) && /warmer highlights/.test(um.text) && um.text.length < 1400, um?.text);
await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);
// (the card stays up for the screenshot)
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
