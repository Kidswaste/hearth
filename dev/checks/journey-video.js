// Journey 2: review and export, with real mouse / keyboard events: open Video Review on a folder of test renders,
// open one, compare it with its other version, draw a note on the frame, send the feedback to the Video Director,
// then "Export all 4 socials" (ffmpeg) and check the files.
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/journey-video.js --shot /tmp/j2.png
const { wait, until, step, click, key, type, shot, visible, hitOk } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
// a fresh copy of the test renders for each run (exports land next to them)
const SRC = window.VIDS || '/tmp/hearth-test-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`).catch(async () => { await window.hub.fs.write(`${VIDS}/.keep`, ''); await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`); });
const claude = H.claudeAgent();
const btnText = (root, re) => [...root.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) && visible(b));

// 1. the folder of renders: typed as a command (the Folders… button opens a native folder picker)
activate(claude.id); await wait(300);
await J.command(claude.id, `/video-folders add ${VIDS}`, 1500);
activate('tool:ae'); await Review.ensureMounted(); await Review.waitReady?.().catch(() => null);
await until(() => Review.videos.length >= 6, 10000);
step('library lists the renders', Review.videos.length >= 6, Review.videos.map((v) => v.name || v.path.split('/').pop()));
const R = H.surfaces.get('tool:ae').el;
await wait(800);
await shot('library');
// the Video Director, docked on the right (the owner's setup): /director-setup video, then "Add it"
activate(claude.id); await wait(300);
const setupP = J.command(claude.id, '/director-setup video', 1200);
await until(() => [...document.querySelectorAll('dialog[open] button, .modal button')].some((b) => /Add it/.test(b.textContent) && visible(b)), 6000);
const addIt = [...document.querySelectorAll('dialog[open] button, .modal button')].find((b) => /Add it/.test(b.textContent) && visible(b));
if (addIt) await click(addIt);
await setupP;
await until(() => H.agents().some((a) => a.dock === 'ae'), 5000);
const vdir = H.agents().find((a) => a.dock === 'ae');
activate('tool:ae'); await wait(1200);
step('Video Director docked', Boolean(vdir) && visible(Native.view(vdir.id)?.input));

// 2. open the newest neon_tunnel (v2; v1 is grouped under it as a version) with a click on its card
const item = [...R.querySelectorAll('.vr-card')].find((n) => visible(n) && /neon_tunnel/.test(n.textContent));
step('library card visible', Boolean(item) && hitOk(item), item?.textContent.slice(0, 60));
if (item) await click(item);
await until(() => /neon_tunnel_v2/.test(Review.current?.path || ''), 6000);
await Review.waitReady?.();
step('render opened', /neon_tunnel_v2/.test(Review.current?.path || ''));
await wait(800);
await shot('opened');

// 3. play / pause with Space, step frames with the arrows
const vid = R.querySelector('video');
await key(' '); await wait(900);
const playing = !vid.paused;
await key(' ');
const t1 = vid.currentTime;
step('Space plays and pauses', playing && t1 > 0.2 && vid.paused, { t: t1.toFixed(2), playing, paused: vid.paused });
await key('ArrowRight'); await wait(300);
step('→ steps one frame', Math.abs(vid.currentTime - t1 - 1 / 30) < 0.02, { from: t1.toFixed(3), to: vid.currentTime.toFixed(3) });

// 4. compare with the other version (v1), side by side, typed in the director's chat
await J.command(vdir?.id || claude.id, '/compare neon_tunnel_v1 side', 1500);
await wait(800);
step('A/B side by side with v1', /neon_tunnel_v1/.test(Review.state.cmp.path || '') && Review.state.cmp.mode === 'side', { b: Review.state.cmp.path, mode: Review.state.cmp.mode });
await shot('compare');
await J.command(vdir?.id || claude.id, '/compare off', 600);
step('/compare off', !Review.state.cmp.path);

// 5. a drawn note: D, drag an arrow on the frame, type the note, Enter
const notes0 = Review.notes().length;
const drawBtn = [...R.querySelectorAll('button')].find((b) => /^Draw on the frame/.test(b.title) && visible(b));
await click(drawBtn); await wait(300);
await J.drag(vid, [0.3, 0.3], [0.6, 0.6]);
await wait(300);
await key('n'); await wait(400); // N while drawing: the same note (it used to start over and drop the drawing)
const ta = [...R.querySelectorAll('textarea')].find((n) => visible(n) && /What should change/.test(n.placeholder));
if (ta) { await click(ta); await type('The flash is too strong here'); await key('Enter'); }
await wait(800);
const notes = Review.notes();
step('drawn note added', notes.length === notes0 + 1 && notes.at(-1)?.draw?.length > 0, notes.map((n) => ({ t: n.t?.toFixed?.(2), text: n.text, draw: n.draw?.length, cat: n.cat })));
await shot('note');

// 6. send feedback to the Video Director (its chat box gets the notes + frame grabs)
const send = btnText(R, /^Send feedback/);
step('Send feedback button', Boolean(send) && hitOk(send));
if (send) await click(send);
await wait(800);
const menuItem = [...document.querySelectorAll('#menu button, .menu button, .ctx-menu button, [role=menuitem]')].find((b) => visible(b) && /Send to/.test(b.textContent));
if (menuItem) await click(menuItem);
await wait(1500);
const dir = vdir;
const draftOf = (id) => Native.view(id)?.input?.value || '';
const target = dir || claude;
step('feedback in the director\'s chat box', /Visual feedback on the render/.test(draftOf(target.id)), { agent: target.name, draft: draftOf(target.id).slice(0, 80), attachments: Native.view(target.id)?.attachments?.length });
await shot('feedback');
// send it (the fake director answers)
if (/Visual feedback/.test(draftOf(target.id))) {
  await click(Native.view(target.id).input); await key('Enter');
  await until(() => Native.isBusy(H.activeChat[target.id]), 3000);
  await until(() => !Native.isBusy(H.activeChat[target.id]), 60000);
  step('director answered the feedback', /Fake reply/.test(Native.current(target.id)?.messages.at(-1)?.text || ''));
}

// 7. Export all 4 socials (⋯ → Export → All social formats)
activate('tool:ae'); await wait(500);
const exportsDir = `${VIDS}/exports`;
const before = new Set(((await window.hub.fs.list(exportsDir).catch(() => [])) || []).map((f) => f.name));
const outs = await Review.exportAllSocials();
await until(async () => ((await window.hub.fs.list(exportsDir).catch(() => [])) || []).filter((f) => !before.has(f.name)).length >= 3, 120000);
const made = ((await window.hub.fs.list(exportsDir).catch(() => [])) || []).filter((f) => !before.has(f.name)).map((f) => f.name);
step('3 other social formats exported', made.length >= 3, made);
await shot('exported');
return J.done();
