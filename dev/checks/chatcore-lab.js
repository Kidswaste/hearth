// Chats at the core (round 9) in the Lab: the Three Director's replies show the scene they changed and the Lab frame
// they looked at as cards (live while it works, kept after), a sequence card from three_do sequence, a board card from
// board_add, the dock's "/" menu puts the Lab first (recent here, "In Three.js Lab", the Lab's area first; typed words
// rank the Lab's commands first), the context strip lists the scene / sequence / board, "render it again" names the
// sequence in one line, and dragging a scene card carries the Lab sequence's own type.
//   node dev/smoke.js --fake-engines --wait 6000 --check-timeout 400000 --script dev/checks/chatcore-lab.js --shot /tmp/chatcore-lab.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const quiet = { say: () => {}, note: () => {} };
try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const D = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd();
  await until(() => ThreeLab.scenes && ThreeLab.director);
  await wait(800);
  Native.newChat(D.id);
  await wait(600);
  const v = Native.view(D.id);
  const ask = async (text, live = null) => {
    await Native.send(D.id, text);
    if (live) await live();
    await wait(300);
    await until(() => !Native.isBusy(H.activeChat[D.id]), 150000);
    await wait(400);
    return Native.current(D.id).messages.at(-1);
  };

  // a director turn: a new layer through real MCP calls, a look with a small screenshot
  let liveSeen = false;
  const r1 = await ask('direct: add a tunnel', async () => { liveSeen = await until(() => v.list.querySelector('.msg.streaming .live-cards .thing'), 60000); });
  out.r1things = (r1.things || []).map((t) => `${t.k}:${t.name}`);
  ok(liveSeen, 'a card shows in the reply while the director works');
  ok(r1.things?.some((t) => t.k === 'scene'), `the scene it changed is a card (${out.r1things})`);
  ok(r1.things?.some((t) => t.k === 'frame'), `the Lab frame it looked at is a card (${out.r1things})`);
  await until(() => r1.things?.find((t) => t.k === 'frame')?.path, 8000);
  await Native.refresh(D.id); await wait(500);
  const frameCard = v.list.querySelector('.msg.assistant:last-of-type .thing-frame img, .thing-strip .thing-frame img');
  ok(frameCard && await until(() => frameCard.naturalWidth > 0, 5000), 'the frame card shows the saved picture');
  const sceneCard = [...v.list.querySelectorAll('.thing-scene')].at(-1);
  ok(sceneCard, 'scene card drawn');
  if (sceneCard) {
    const dt = new DataTransfer();
    sceneCard.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    out.sceneDrag = [...dt.types];
    ok(dt.types.includes('application/x-hearth-scene'), `a scene card drags onto the Lab sequence (${out.sceneDrag})`);
  }
  // the tool calls folded to one line
  out.fold = [...v.list.querySelectorAll('.tool-fold summary')].at(-1)?.textContent;
  ok(/⚙ \d+ steps/.test(out.fold || ''), `director steps folded (${out.fold})`);

  // a sequence and a board item made by tool calls
  await Commands.tryRun('/board-tools on', D.id, null, quiet);
  const r2 = await ask('mcp please\nmcp: [["three_do", {"cmd": "sequence", "op": "status"}], ["board_add", {"kind": "note", "text": "chatcore note"}]]');
  out.r2things = (r2.things || []).map((t) => `${t.k}:${t.name}`);
  ok(r2.things?.some((t) => t.k === 'sequence'), `a sequence card (${out.r2things})`);
  ok(r2.things?.some((t) => t.k === 'board'), `a board card (${out.r2things})`);

  // the context strip: scene, sequence, board
  await ChatContext.paint(D.id); await wait(300);
  out.strip = [...v.form.querySelectorAll('.ctx-strip .ctx-chip')].map((c) => c.dataset.k);
  ok(['scene', 'sequence', 'board'].every((k) => out.strip.includes(k)), `context strip in the dock (${out.strip})`);
  // "render it again" names the sequence (echo: the fake returns what it got)
  const r3 = await ask('echo render it again please');
  out.again = r3.text.slice(-200);
  ok(/\[Hearth context: [^\]]*Lab sequence "/.test(r3.text), '“render it again” names the sequence');

  // the "/" menu in the Lab
  const ta = v.input; ta.focus(); ta.value = '/'; ta.dispatchEvent(new Event('input'));
  await until(() => v.root.querySelector('.slash-menu .slash-area'), 3000);
  const sm = v.root.querySelector('.slash-menu');
  out.labHeads = [...sm.querySelectorAll('.slash-head')].map((h) => h.textContent);
  out.firstArea = sm.querySelector('.slash-area b')?.textContent;
  ok(out.labHeads.some((h) => /^In /.test(h)) && /^(Three\.js Lab|Lab)/.test(out.firstArea || ''), `Lab first in the "/" view (${out.labHeads} · ${out.firstArea})`);
  window.__labSlash && await smoke({ shot: window.__labSlash });
  ta.value = '/s'; ta.dispatchEvent(new Event('input')); await wait(250);
  const typed = [...v.root.querySelectorAll('.slash-menu .slash-item b')].map((b) => b.textContent.split(' ')[0].slice(1)).slice(0, 6);
  out.typedLab = typed.map((n) => `${n}:${Commands.get(n)?.area}`);
  ok(Commands.get(typed[0])?.area === Commands.place().area || Commands.recent('three').includes(typed[0]) || Commands.recent().includes(typed[0]) || Commands.favs().includes(typed[0]), `typed rows: the Lab's first (${out.typedLab})`);
  ta.value = ''; ta.dispatchEvent(new Event('input'));
  // /things in the dock
  await Commands.tryRun('/things scenes', D.id);
  ok(v.list.querySelector('.msg.note[data-note-id="things"]'), '/things scenes in the dock');
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
