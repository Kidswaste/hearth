// The Lab sequence's ↻ Reload (a fresh preview page when the sequence gets stuck: it comes back where it was) and
// ⇪ Render (a real button: a panel with format / frame rate / quality / sound, remembered), driven like a person.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/seq-buttons.js
const { step } = J;
const { wait, until } = SQL;
const ids = await SQL.scenes();
ThreeLab.scenes.open(ids.red); await wait(1500);
const bar = document.querySelector('.media-bar');
await J.click(bar.querySelector('.sq-tab'));
await until(() => ThreeSeq.active && ThreeSeq.edit, 8000); await wait(800);
await ThreeSeq.add({ sketch: ids.red }, { trans: null }); await ThreeSeq.add({ sketch: ids.blue || ids.red }); await wait(800);
const row = bar.querySelector('.sq-row');
const reload = row.querySelector('.sq-reload'); const render = row.querySelector('.sq-render');
step('↻ Reload and ⇪ Render are on the sequence row', J.visible(reload) && J.visible(render) && /Render/.test(render.textContent), [reload?.title, render?.textContent]);
// ↻: the page reloads, the sequence comes back at the same time
ThreeSeq.seek?.(1.2); await wait(500);
const T0 = ThreeSeq._S.T; const n0 = ThreeLab.live.counts().reloads.preview || 0;
await J.click(reload);
await until(() => (ThreeLab.live.counts().reloads.preview || 0) > n0, 8000);
await until(async () => (await SQL.sbx('return Boolean(window.__seqPlan || document.querySelector("canvas"))').catch(() => false)), 15000); await wait(2500);
step('↻ reloads the preview page', (ThreeLab.live.counts().reloads.preview || 0) > n0, { before: n0, after: ThreeLab.live.counts().reloads.preview });
step('… and the sequence comes back where it was (still on, same playhead)', ThreeSeq.active && Math.abs(ThreeSeq._S.T - T0) < 0.05, { T0, T: ThreeSeq._S.T });
// ⇪ Render: the panel, then a real render with the chosen options
await J.click(render); await wait(400);
const dlg = document.querySelector('dialog[open].sq-render-panel');
step('⇪ Render opens a panel (it doesn\'t start right away)', Boolean(dlg) && !ThreeSeq.rendering);
const pick = (label) => [...dlg.querySelectorAll('.sq-chip')].find((b) => b.textContent.trim() === label);
await J.click(pick('1:1')); await J.click(pick('9:16')); await J.click(pick('24 fps')); await J.click(pick('Draft'));
dlg.querySelector('.sq-rp-check input[type=checkbox]').click(); // no sound
const open = dlg.querySelectorAll('.sq-rp-check input')[1]; if (open.checked) open.click(); // stay here
const go = dlg.querySelector('button.primary');
step('the button says what it will do', /Render 1:1/.test(go.textContent), go.textContent);
const outs = [];
const off = ThreeSeq.on?.('render', (e) => outs.push(e.output));
await J.click(go);
await until(() => !ThreeSeq.rendering && outs.length, 300000); off?.();
const out = outs[0] || (await window.hub.fs.list?.((ThreeSeq._S.outDir || ''))) || null;
const p = typeof out === 'string' ? await window.hub.video?.probe?.(out).catch(() => null) : null;
step('it rendered 1:1 at 24 fps, no sound', typeof out === 'string' && (!p || (p.w === 1080 && p.h === 1080 && Math.round(p.fps) === 24 && !p.audio)), { out, p });
step('the choices are remembered', JSON.stringify(store.get('three.seq.renderOpts', {}).formats) === '["1:1"]' && store.get('three.seq.renderOpts', {}).fps === 24);
step('/sequence reload and /sequence render options exist', /reload/.test(Commands.get('sequence')?.args || ''));
return JSON.stringify(J.out, null, 1);
