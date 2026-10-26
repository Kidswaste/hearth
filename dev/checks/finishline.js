// ⚑ Finish line (round 67, finishlines67: tools/three-finish.js) in the app, on a throwaway scene made here and taken
// back at the end (to History's deleted sketches, as Delete… does). The quest journal and the guide are stand-ins for
// the run: Track writes into a fresh journal in memory, never the owner's kv 'quest-journal'.
//   node dev/smoke.js --script dev/checks/finishline.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
activate('tool:three'); await ThreeLab.cmd(); await until(() => ThreeLab.scenes, 15000);
await Lazy.load('labfinish');
const sc = ThreeLab.scenes.create({ name: 'Finish line check', code: ThreeData.TEMPLATES[0].code, open: true });
try {
  await until(() => ThreeLab.scenes.currentId() === sc.id);
  ok(await until(() => LabFinish.mountChip() && LabFinish.chip?.isConnected), 'the ⚑ chip is in the Lab toolbar');
  ok(LabFinish.chip.previousElementSibling?.matches('.three-sketch-select'), 'the chip sits right after the scene picker');
  ok(LabFinish.chip.textContent === '⚑ Finish line', `a fresh scene's chip invites (${LabFinish.chip.textContent})`);
  LabFinish.chip.click();
  ok(LabFinish.card?.isConnected, 'a click opens the card');
  [...LabFinish.card.querySelectorAll('.fl-size')].find((b) => b.textContent === '10 s').click();
  out.items = LabFinish.state(sc.id).items.map((x) => x.text);
  ok(out.items.length === 3, '10 s gives three lines');
  ok(!ThreeLab.scenes.songOf(sc.id) ? ThreeLab.scenes.timelineOf(sc.id)?.len === 10 : true, 'a scene without a song gets a 10 s timeline');
  ok(/10 s · 0\/3/.test(LabFinish.chip.textContent), `the chip counts (${LabFinish.chip.textContent})`);
  // edit a line by clicking its words
  LabFinish.card.querySelector('.fl-text').click();
  const input = LabFinish.card.querySelector('input.fl-edit');
  ok(input, 'clicking a line\'s words edits it');
  input.value = 'The orb breathes';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(LabFinish.state(sc.id).items[0].text === 'The orb breathes', 'Enter keeps the new words');
  // Polish with lines open: three steps from them
  [...LabFinish.card.querySelectorAll('button')].find((b) => /Polish this/.test(b.textContent)).click();
  // (the card's buttons run their action a tick after the click: wait for the steps to be drawn)
  out.steps = (await until(() => { const s = [...LabFinish.card.querySelectorAll('.fl-steps li b')].map((b) => b.textContent); return s.length ? s : null; }, 3000)) || [];
  ok(out.steps.length === 3, 'Polish this shows exactly three steps');
  // Track + guide me, into a journal in memory
  await Lazy.load('questhud'); await QuestHud.core();
  let journal = QuestCore.upgrade(QuestCore.initial()); const guided = [];
  LabFinish._seam({
    hud: { write: async (fn) => { const d = QuestCore.clone(journal); const r = await fn(d); journal = QuestCore.validate(d); return { result: r, after: journal }; }, open: () => {} },
    guide: async (o) => { guided.push(o); return { ok: true, value: {} }; },
  });
  [...LabFinish.card.querySelectorAll('button')].find((b) => /Track \+ guide me/.test(b.textContent)).click();
  ok(await until(() => guided.length, 5000), 'the guide was asked to start');
  ok(journal.sideQuests.length === 1 && /^q-finish-/.test(journal.sideQuests[0].id), 'the side quest is in the journal');
  ok(guided[0]?.steps?.length === 3 && guided[0].questId === journal.sideQuests[0].id, 'the guide gets the same three steps');
  // the limit: three more side quests can't all be tracked
  for (let i = 0; i < 2; i += 1) journal.sideQuests.push({ ...journal.sideQuests[0], id: `q-finish-x${i}-1` });
  LabFinish.polish(sc.id);
  [...LabFinish.card.querySelectorAll('button')].find((b) => b.textContent === 'Track it').click();
  ok(await until(() => /3 side quests/.test(LabFinish.card.querySelector('.fl-warn')?.textContent || ''), 5000), 'the side-quest limit is said plainly');
  // every line ticked: done + Record it
  for (const b of LabFinish.card.querySelectorAll('.fl-item input[type="checkbox"]')) if (!b.checked) { b.checked = true; b.dispatchEvent(new Event('change')); }
  ok(/Done\. This piece is finished/.test(LabFinish.card.textContent), 'all ticked: the card says it\'s done');
  ok([...LabFinish.card.querySelectorAll('button')].some((b) => /Record it/.test(b.textContent)), '…and offers Record it');
  ok(/done ✓/.test(LabFinish.chip.textContent), 'the chip says done');
  out.chip = LabFinish.chip.textContent;
} finally {
  LabFinish._seam(null);
  LabFinish.close();
  ThreeLab.scenes.remove(sc.id);
}
return { pass: !fail.length, fail, ...out };
