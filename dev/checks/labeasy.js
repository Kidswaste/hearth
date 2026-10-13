// The Lab without commands (round 26, labeasy): the audit (every Lab command has a place: a new menu entry, a home it
// had, "just ask the director", or kept as a command), the preview's right-click ✦ More (real right-click in the
// picture), the toolbar ⋯ › Director, a layer's right-click (hide / show), menu rows running their commands (answers
// without "/command" talk), the Lab missions in the director's ◎ (only there; one sent for real through the dock's
// chat box, answered by the fake engine), and no visible "/command" in the Lab, its dock and the menus opened here.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/labeasy.js --shot /tmp/labeasy.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const cdp = (method, params) => smoke({ cdp: method, params });
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
const rowsOf = (sel = '#menu') => [...document.querySelectorAll(`${sel} button`)].filter((b) => b.offsetParent).map((b) => b.textContent.trim());
const clickRow = (start, sel = '#menu') => { const b = [...document.querySelectorAll(`${sel} button`)].find((x) => x.offsetParent && x.textContent.trim().startsWith(start)); b?.click(); return Boolean(b); };
const seen = []; // menu texts opened in this check (scanned for "/command" at the end)
const keep = (sel = '#menu') => { for (const n of document.querySelectorAll(`${sel} button`)) seen.push(n.textContent, n.title || ''); };
const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
const ok = await until(() => typeof LabEasy !== 'undefined' && typeof LabEasyData !== 'undefined', 20000);
step('loaded with the Lab: LabEasy, LabEasyData, Missions.add', ok && typeof Missions.add === 'function');
const dir = H.agents().find((a) => a.dock === 'three');

// ---------- 1. the audit: every Lab command has a place ----------
const placed = LabEasy.placed();
const labCmds = Commands.list().filter((d) => LabEasyData.AREAS.includes(d.area));
const unsorted = labCmds.filter((d) => !placed.has(d.name) && !LabEasyData.homes.has(d.name)).map((d) => d.name);
const fresh = labCmds.filter((d) => placed.has(d.name) && LabEasyData.homes.get(d.name)?.kind !== 'had').map((d) => d.name);
step('audit: every Lab command has a place (none unsorted)', labCmds.length > 150 && !unsorted.length, { lab: labCmds.length, unsorted });
step('audit: the commands with no button before have one now (≥ 18)', fresh.length >= 18, fresh);
const gone = [...placed.keys()].filter((n) => !Commands.get(n));
step('every new menu row runs a command that exists', !gone.length, gone);

// ---------- 2. the preview's right-click: ✦ More ----------
const frame = [...document.querySelectorAll('iframe.three-frame')].find((f) => f.offsetParent && f.getBoundingClientRect().width > 100);
const fr = frame.getBoundingClientRect();
const cx = Math.round(fr.left + fr.width / 2); const cy = Math.round(fr.top + fr.height / 2);
await wait(2500); // the preview page answers right-clicks once it's up
for (let i = 0; i < 4 && !rowsOf().some((t) => t.startsWith('❚❚') || t.startsWith('▶')); i++) {
  await mouse('mouseMoved', cx, cy);
  await mouse('mousePressed', cx, cy, { button: 'right', buttons: 2, clickCount: 1 });
  await mouse('mouseReleased', cx, cy, { button: 'right', buttons: 0, clickCount: 1 });
  await until(() => rowsOf().length > 3, 2500);
}
const prev = rowsOf();
keep();
step('preview right-click: one "✦ More" row', prev.filter((t) => t.startsWith('✦ More')).length === 1, prev.slice(0, 20));
clickRow('✦ More');
await until(() => rowsOf().some((t) => t.startsWith('♪ Music')), 3000);
const more = rowsOf(); keep();
step('✦ More: Music, Look & motion, Make, What\'s going on', ['♪ Music', '✨ Look & motion', '⇪ Make', 'ℹ What'].every((s) => more.some((t) => t.startsWith(s))), more);
clickRow('♪ Music');
await until(() => rowsOf().some((t) => t.startsWith('✦ Make it react')), 3000);
const music = rowsOf(); keep();
step('♪ Music: make it react, the next drop, click on every beat…', ['✦ Make it react', 'Jump to the next drop', 'Click on every beat', 'What\'s in the song'].every((s) => music.some((t) => t.startsWith(s))), music);
await smoke({ shot: '/tmp/labeasy-more.png' });
clickRow('‹ back'); await wait(150);
clickRow('✨ Look & motion'); await until(() => rowsOf().some((t) => t.startsWith('Put Hearth on screen')), 3000); keep();
clickRow('‹ back'); await wait(150);
clickRow('⇪ Make'); await until(() => rowsOf().some((t) => t.startsWith('👥 4 variations')), 3000); keep();
step('⇪ Make: 4 variations of this scene', rowsOf().some((t) => t.startsWith('👥 4 variations')), rowsOf());
esc(); hideMenu?.(); await wait(150);

// ---------- 3. the toolbar's ⋯ › Director ----------
const moreBtn = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent === '⋯' && /^More: focus/.test(b.title));
moreBtn?.click();
await until(() => rowsOf('.mb-menu.lab-pop').some((t) => t.startsWith('Director')), 3000);
keep('.mb-menu.lab-pop');
step('toolbar ⋯: a "Director" row', rowsOf('.mb-menu.lab-pop').some((t) => t.startsWith('Director')), rowsOf('.mb-menu.lab-pop'));
clickRow('Director', '.mb-menu.lab-pop');
await wait(200);
const dirRows = rowsOf('.mb-menu.lab-pop'); keep('.mb-menu.lab-pop');
step('⋯ › Director: what it is making, did, costs, its last picture, undo', ['What it is making', 'What it did lately', 'What it costs per message', '↶ Undo its last code edit'].every((s) => dirRows.some((t) => t.startsWith(s))), dirRows);
clickRow('What it costs per message', '.mb-menu.lab-pop');
await until(() => LabEasy.last.line === '/director-cost' && (LabEasy.last.text || LabEasy.last.error), 8000);
await wait(300);
const costText = document.querySelector('.ui-modal .modal-text')?.textContent || '';
step('a Director row runs its command and shows the answer (no "/command" in it)', LabEasy.last.text && !LabEasy.last.error && costText.length > 20 && !/(^|\s)\/[a-z][\w-]+/.test(costText), { text: costText.slice(0, 160), error: LabEasy.last.error });
document.querySelector('.ui-modal button.primary')?.click();
await wait(200);

// ---------- 4. a layer's right-click ----------
const row = document.querySelector('.ly-row');
const rr = row.getBoundingClientRect();
row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rr.left + 30, clientY: rr.top + 8 }));
await until(() => rowsOf().some((t) => t.startsWith('◌ Hide') || t.startsWith('👁 Show')), 3000);
const lay = rowsOf(); keep();
step('layer right-click: hide, show only this one, rename, duplicate, react, filter above, look, More…', ['◌ Hide', 'Rename', '⧉ Duplicate', '✦ Make it react', 'Add a filter above', 'Apply a look', 'More…'].every((s) => lay.some((t) => t.startsWith(s))), lay);
clickRow('More…'); await wait(200); keep();
step('layer right-click › More…: blend, animate, ease, recolor, stop following the sound, reset, save', ['Blend', 'Animate', 'Ease every keyframe', 'Recolor', 'Stop it following', 'Reset its sliders', '💾 Save its sliders'].every((s) => rowsOf().some((t) => t.startsWith(s))), rowsOf());
esc(); hideMenu?.(); await wait(150);
const lid = row.dataset.id;
row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rr.left + 30, clientY: rr.top + 8 }));
await until(() => rowsOf().some((t) => t.startsWith('◌ Hide')), 3000);
clickRow('◌ Hide');
await until(() => document.querySelector(`.ly-row[data-id="${lid}"]`)?.classList.contains('hidden-layer'), 3000);
const hid = document.querySelector(`.ly-row[data-id="${lid}"]`)?.classList.contains('hidden-layer');
const row2 = document.querySelector(`.ly-row[data-id="${lid}"]`);
row2.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rr.left + 30, clientY: rr.top + 8 }));
await until(() => rowsOf().some((t) => t.startsWith('👁 Show')), 3000);
clickRow('👁 Show');
await until(() => !document.querySelector(`.ly-row[data-id="${lid}"]`)?.classList.contains('hidden-layer'), 3000);
step('layer right-click › Hide hides it, › Show brings it back', hid && !document.querySelector(`.ly-row[data-id="${lid}"]`)?.classList.contains('hidden-layer'));

// ---------- 5. rows running their commands ----------
await LabEasy.run('/lab-state', { quiet: true });
step('“What the Lab shows now” answers', LabEasy.last.text.length > 20 && !LabEasy.last.error, LabEasy.last.text.slice(0, 120));
const layersBefore = document.querySelectorAll('.ly-row').length;
await LabEasy.run('/surprise filter', { quiet: true });
await until(() => document.querySelectorAll('.ly-row').length > layersBefore, 6000);
step('“Surprise me › A filter” adds a filter layer', document.querySelectorAll('.ly-row').length > layersBefore && !LabEasy.last.error, { before: layersBefore, after: document.querySelectorAll('.ly-row').length, said: LabEasy.last.text, error: LabEasy.last.error });
await LabEasy.run('/click-track', { quiet: true }); const c1 = LabEasy.last.text;
await LabEasy.run('/click-track', { quiet: true }); const c2 = LabEasy.last.text;
step('“Click on every beat” toggles (on, then off)', c1 && c2 && c1 !== c2 && !LabEasy.last.error, [c1, c2]);
const P = LabEasy.plain;
const plainCases = [
  [P('✦ Bound 3 sliders · /make-it-react undo takes it back'), '✦ Bound 3 sliders'],
  [P('No drop found in this song (/analyze shows its sections)'), 'No drop found in this song'],
  [P('Live sound is off (/live system or /live mic)'), 'Live sound is off'],
  [P('Saved to /Users/me/a.mp4 (**done**)'), 'Saved to /Users/me/a.mp4 (done)'],
];
step('answers lose the "/command" talk, paths stay', plainCases.every(([a, b]) => a === b), plainCases);

// ---------- 6. Lab missions: only in the director's ◎ ----------
const ids = (agentId) => Missions.shown(agentId).map((m) => m.id);
const labIds = ['lab-variations', 'lab-react', 'lab-vertical', 'lab-polish', 'lab-render'];
step('the Lab director\'s missions: the 5 Lab ones (swarm stands aside: 4 variations does it here)', labIds.every((x) => ids(dir.id).includes(x)) && !ids(dir.id).includes('swarm'), ids(dir.id));
step('a chat outside the Lab: no Lab missions, swarm is there', !ids(H.claudeAgent().id).some((x) => labIds.includes(x)) && ids(H.claudeAgent().id).includes('swarm'), ids(H.claudeAgent().id));
const dock = H.surfaces.get('tool:three').el;
const msBtn = dock.querySelector('.ms-btn');
msBtn?.click();
await until(() => document.querySelector('.ms-pop'), 3000);
const cards = [...document.querySelectorAll('.ms-pop .ms-pick b')].map((b) => b.textContent);
step('the dock\'s ◎ lists them in plain words', ['Make 4 variations', 'Make it react to the music', 'Make a 9:16 version', 'Polish the look', 'Render it'].every((s) => cards.some((t) => t.includes(s))), cards);
await smoke({ shot: '/tmp/labeasy-missions.png' });
[...document.querySelectorAll('.ms-pop .ms-pick')].find((b) => b.textContent.includes('Polish the look'))?.click();
await wait(200);
step('picked: ◎ shows the mission', /Polish the look/.test(msBtn.textContent), msBtn.textContent);
// sent for real through the dock's chat box (the fake engine answers)
const ta = dock.querySelector('.composer textarea');
ta.value = 'warmer and softer'; ta.dispatchEvent(new Event('input', { bubbles: true }));
ta.closest('form').requestSubmit();
await until(() => (Native.chatOf(dir.id)?.messages || []).some((m) => m.role === 'user' && /warmer and softer/.test(m.text)), 10000);
const sent = (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user').at(-1)?.text || '';
step('sent with the mission\'s brief in front, visible, then your words', /^🎨 Mission: polish the look/.test(sent) && /warmer and softer$/.test(sent), sent);
step('a once-mission goes back to a normal reply', Missions.current(dir.id).id === 'normal' && msBtn.textContent === '◎', msBtn.textContent);
await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);
// the others, with the sending stubbed (no crew run here)
const got = [];
const realSend = Native.send; const realTry = Commands.tryRun;
Native.send = async (a, t) => { got.push(['send', t]); };
Commands.tryRun = async (line, ...rest) => { if (/^\/crew /.test(line)) { got.push(['run', line]); return true; } return realTry(line, ...rest); };
try {
  for (const id of ['lab-variations', 'lab-react', 'lab-vertical', 'lab-render']) { Missions.set(dir.id, id); Missions.submit(dir.id, 'a neon city'); await wait(id === 'lab-vertical' ? 1500 : 200); }
} finally { Native.send = realSend; Commands.tryRun = realTry; }
step('4 variations → a crew of 4 on your words; the others → your words with their brief', got.length === 4 && got[0][1] === '/crew 4 a neon city' && /^♪ Mission: make it react/.test(got[1][1]) && /^📱 Mission: a 9:16 version/.test(got[2][1]) && /^🎬 Mission: render it/.test(got[3][1]) && got.slice(1).every(([, t]) => t.endsWith('a neon city')), got);
step('“Make a 9:16 version” set the frame to 9:16 first', /9:16/.test(await (async () => { await LabEasy.run('/lab-state', { quiet: true }); return LabEasy.last.text; })()), LabEasy.last.text.slice(0, 160));
document.querySelector('.ms-pop')?.remove();

// ---------- 7. no "/command" on screen in the Lab, its dock and the menus opened here ----------
const CMD = /(^|[\s(·:'"])\/(?!Users\b|home\b|tmp\b|Volumes\b)[a-z][a-z0-9]*(-[a-z0-9]+)*(?=$|[\s).,:;'"])/;
const vis = [];
const pane = H.surfaces.get('tool:three').el;
for (const n of pane.querySelectorAll('*')) {
  if (!n.offsetParent && n.tagName !== 'OPTION') continue;
  if (n.closest('.cm-editor, .CodeMirror, .three-code, textarea, .msg, .messages, .lab-console, pre, code')) continue; // code, the chat's messages, the console
  const own = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ');
  for (const t of [own, n.title || '', n.getAttribute?.('placeholder') || '']) if (CMD.test(t)) vis.push(t.trim().slice(0, 120));
}
for (const n of pane.querySelectorAll('[placeholder]')) if (n.offsetParent && CMD.test(n.placeholder)) vis.push(`placeholder: ${n.placeholder}`);
for (const t of seen) if (CMD.test(t)) vis.push(`menu: ${t.trim().slice(0, 120)}`);
step('no visible "/command" in the Lab, its dock or its menus', !vis.length, [...new Set(vis)].slice(0, 30));
return JSON.stringify(out);
