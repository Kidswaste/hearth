// Hearth never loses work (round 29, safetynet), end to end with a REAL renderer crash: unsaved Lab code + a slider
// moved but not saved, a chat draft typed a moment ago, a board note's words just changed, and an AI-setup-like text
// box (a dialog that saves only on OK) half written; the journal is kept, then the window's page is crashed the hard
// way (webContents.forcefullyCrashRenderer, before any of the app's own saves could run). The main process reloads
// the page; the next page finds the unexpected exit and restores: the Lab work as a version in the time machine (the
// scene itself stays as saved), the draft back in its box, the board edit put back, the dialog's words as a note;
// one card "Hearth closed unexpectedly — here's what was restored" lists them with Open; Open on the Lab line opens
// the time machine on that version; the status is cleared afterwards (a normal reload restores nothing again).
//   node dev/smoke.js --wait 8000 --check-timeout 120000 --script dev/checks/safetynet.js --shot /tmp/safetynet.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await Lazy.load('safetynet');
  step(typeof SafetyNet !== 'undefined' && typeof SafetyNetCore !== 'undefined', 'the safetynet group loads');
  step((await window.hub.safetynet.status()) === null, 'a normal start: nothing to restore');

  // the Lab: a scene, saved, then code typed and a slider moved
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1200);
  const code = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code
    .replace('const cube = ', 'const P = tweak({ size: [1, 0.2, 3], speed: [1, 0, 4] });\nconst cube = ')
    .replace('cube.rotation.set(t * 0.4, t * 0.6, 0);', 'cube.rotation.set(t * 0.4 * P.speed, t * 0.6 * P.speed, 0); cube.scale.setScalar(P.size);');
  ThreeLab.openCode(code);
  await until(() => c.sliders().some((x) => x.key === 'size'), 15000);
  await wait(2500); // its first saves and its first time-machine version settle
  const sid = ThreeLab.scenes.currentId();
  let slider = null;
  try { const s = c.sliders().find((x) => x.key === 'size'); if (s) { const v = s.value === 0 ? 1 : s.value * 0.5; c.setSlider(s.label, v); slider = { label: s.label, key: s.key, v }; } } catch (err) { out.sliderError = err.message; }
  step(Boolean(slider), 'a slider moved (not saved)', slider || out.sliderError);

  // a board note: made and saved, then its words changed (the board saves 0.4 s later)
  await Lazy.load('board');
  await Board.ready();
  const note = Board.addNote('before the crash');
  await wait(1200);
  const noteId = (note?.id) || Board.items().filter((i) => i.type === 'note').at(-1)?.id;
  Board.patch([noteId], { text: 'words typed right before the crash' }, 'edit note');

  // a dialog that saves only on OK (like AI setup's personality): half written
  Modal.prompt('Edit instruction', { multiline: true });
  await until(() => document.querySelector('dialog.ui-modal textarea'));
  const box = document.querySelector('dialog.ui-modal textarea');
  box.value = 'Always answer like a blunt art director, in three bullet points';
  box.dispatchEvent(new Event('input', { bubbles: true }));

  // a chat draft, typed a moment ago (the chat box saves it 0.4 s later)
  const agent = H.claudeAgent();
  activate(agent.id);
  await until(() => Native.view(agent.id)?.input);
  const input = Native.view(agent.id).input;
  input.value = 'Make the orb pulse on every kick and go gold on the drop';
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // last: code typed in the Lab's code box (an input event, as the keyboard makes; the Lab saves it 0.6 s later)
  const area = ThreeNodes.lab.hook.editor.area;
  const mark = `// safetynet ${Date.now().toString(36)}`;
  area.value = `${area.value}\n${mark}`;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await SafetyNet.keepNow();
  const j = SafetyNet.journal.entries;
  step(Object.values(j).some((e) => e.k === 'lab' && e.state.layers.some((L) => (L.code || '').includes(mark))), 'the journal holds the unsaved Lab code');
  step(Object.values(j).some((e) => e.k === 'draft' && e.text.includes('orb pulse')), 'the journal holds the draft');
  step(Object.values(j).some((e) => e.k === 'board' && e.items.some((i) => i.text === 'words typed right before the crash')), 'the journal holds the board edit');
  step(Object.values(j).some((e) => e.k === 'field' && /blunt art director/.test(e.text) && /Edit instruction/.test(e.where)), 'the journal holds the half-written dialog', Object.values(j).filter((e) => e.k === 'field').map((e) => e.where));
  sessionStorage.setItem('sn.test', JSON.stringify({ sid, mark, slider, noteId, agent: agent.id, chat: H.activeChat[agent.id] || null }));
  localStorage.setItem('sn.test', sessionStorage.getItem('sn.test'));
  localStorage.setItem('sn.steps', JSON.stringify(out.steps));
  // crash the page now: none of the app's own saves (0.4–0.6 s) has run
  await window.hub.safetynet.testCrash();
  await wait(8000);
  out.problems.push('the page did not crash');
} catch (err) { out.problems.push(`error: ${err.message}`); }
return JSON.stringify(out, null, 1);
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const T = JSON.parse(localStorage.getItem('sn.test') || '{}');
out.steps.push(...JSON.parse(localStorage.getItem('sn.steps') || '[]'));
try {
  await until(() => typeof SafetyNet !== 'undefined', 20000);
  await SafetyNet.recovering;
  const rep = await until(() => SafetyNet.last(), 20000);
  step(Boolean(rep?.items?.length), 'after the crash the next page restored work', rep?.items?.map((i) => i.label));
  step((await window.hub.safetynet.status()) === null, 'the unexpected exit is settled (a reload won\'t restore again)');
  const kinds = new Set((rep?.items || []).map((i) => i.k));
  step(['lab', 'draft', 'board', 'field'].every((k) => kinds.has(k)), 'the card lists the Lab work, the draft, the board edit and the dialog\'s words', [...kinds]);

  // the Lab: a version in the time machine, the scene itself as saved
  await Lazy.load('lab');
  const labIt = rep.items.find((i) => i.k === 'lab');
  const st = labIt && await ThreeHistory.stateOf(labIt.open.vid, T.sid);
  step(Boolean(st?.layers?.some((L) => (L.code || '').includes(T.mark))), 'the unsaved code came back as a version', labIt?.label);
  step(!T.slider || Object.values(st?.vals || {}).some((v) => Object.values(v).includes(T.slider.v)), 'the slider move is in that version', st?.vals);
  const sketches = await window.hub.kvGet('three-sketches', []);
  const saved = sketches.find((s) => s.id === T.sid);
  step(saved && !JSON.stringify(saved.layers || saved.code).includes(T.mark), 'the scene itself was not overwritten (the version is one click away)');

  // the draft
  const key = `draft.${T.agent}.${T.chat || 'new'}`;
  step((store.get(key, '') || '').includes('orb pulse on every kick'), 'the draft is back in its chat box', store.get(key, ''));

  // the board
  const b = await window.hub.kvGet(`board-${Board.current()?.id || (await Board.ready())?.id}`, null);
  step(b?.items?.some((i) => i.id === T.noteId && i.text === 'words typed right before the crash'), 'the board edit was put back');

  // the dialog's words: a note
  const notes = await Notes.list();
  const n = notes.find((x) => /^Recovered: /.test(x.title) && x.text.includes('blunt art director'));
  step(Boolean(n), 'the half-written dialog became a note', n?.title);

  // the card, its Open on the Lab line
  SafetyNet.showCard(rep);
  const card = await until(() => document.querySelector('.speed-card.safetynet-card'));
  step(Boolean(card) && card.textContent.includes('Hearth closed unexpectedly'), 'one calm card says what came back', card?.textContent.slice(0, 160));
  await smoke({ shot: `${window.SMOKE_SAVES || '/tmp'}/safetynet-card.png` });
  card?.querySelector('[data-resume="sn-lab"]')?.click();
  const open = await until(() => window.ThreeHistoryUI?.isOpen() && ThreeHistoryUI.versions[ThreeHistoryUI.index]?.id === labIt.open.vid, 15000);
  step(Boolean(open), 'Open on the Lab line shows that version in the time machine');
  ThreeHistoryUI?.close();
  step((await window.hub.safetynet.status()) === null, 'nothing is restored twice');
} catch (err) { out.problems.push(`error: ${err.message}`); }
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
