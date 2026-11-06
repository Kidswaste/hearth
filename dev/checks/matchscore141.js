// (round 141, matchscore141) ◎ How close am I? (tools/three-matchscore*.js, docs/upgrades/matchscore141.md), ONE check by
// clicks, on the check's own temp data (smoke.js) and pictures / a clip it makes itself; never an owner's scene:
//   chip     🖼 References › a picture's ⋯ › ◎ Match against this → a "◎ N %" chip by the preview's stats line; it
//            updates about twice a second
//   updown   the Background colour slider moved toward the picture's orange → the score goes up; moved away (blue) → down
//   parts    the chip opens the card: Colours, Light, Energy (no Motion for a still), each a number and a bar
//   cost     each update's work on the Lab's own thread stays under 1 ms (median; load-aware: a busy box is "can't tell")
//   closer   ◎ Closer raises the score (the colour sliders move toward the picture), and ONE Ctrl/⌘+Z in the Lab puts
//            every slider back
//   ai       ✦ Ask the AI for the rest shows the cost line first and sends nothing; ✦ Send sends ONE message (no picture)
//   clip     a clip as the reference (made here with MediaRecorder): its motion is read, and the card has a fourth part,
//            Motion, measured from the scene's frames
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/matchscore141.js
const out = { steps: [], info: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const ORANGE = '#e65a1e'; const DARK = '#281014'; const BLUE = '#1030c0'; const START = '#607080';
const st = () => LabMatch.state();
const card = () => document.querySelector('.ms-card');
const cardBtn = (re) => [...(card()?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()));
// a fresh score: wait for two more updates after a change (the first may have started before it)
const fresh = async () => { const n = st().updates; await until(() => st().updates >= n + 2, 15000, 80); return st().parts; };

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  try { cmd.size('16:9'); } catch { /* the default */ }
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const CODE = `import * as THREE from 'three';
const P = tweak({ bg: { value: '${START}', label: 'Background' }, tint: { value: '#c0c0c0', label: 'Tint' } });
const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 96, 12), new THREE.MeshBasicMaterial({ color: P.tint }));
scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 400; mesh.rotation.x = t / 900; scene.background = new THREE.Color(P.bg); mesh.material.color.set(P.tint); renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Match check', code: CODE, layers: [ThreeLayers.defaults({ id: 'msMain', name: 'Main', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.ctlOf('msMain')?.controls().some((c) => c.key === 'bg'), 20000);
  const bg = () => hk.ctlOf('msMain').controls().find((c) => c.key === 'bg')?.value;
  const setBg = (v) => hk.ctlOf('msMain').setMany({ bg: v });
  // the reference: a picture drawn here (mostly orange, a dark band), a Lab reference "sunset"
  const pic = document.createElement('canvas'); pic.width = 160; pic.height = 90;
  const g = pic.getContext('2d'); g.fillStyle = ORANGE; g.fillRect(0, 0, 110, 90); g.fillStyle = DARK; g.fillRect(110, 0, 50, 90);
  const path = await window.hub.saveAttachment('sunset.png', pic.toDataURL('image/png').split(',')[1]);
  const ref = await ThreeLab.addReference(path, { key: 'sunset' });
  step('setup: a scene with a Background colour slider and a picture reference "sunset"', bg() === START && ref?.key === 'sunset', { bg: bg(), ref: ref?.key });

  // ---------- chip ----------
  const refsBtn = await until(() => [...(H.surfaces.get('tool:three')?.el.querySelectorAll('button') || [])].find((b) => b.dataset.feature === 'References'), 10000);
  refsBtn?.click();
  const more = await until(() => [...document.querySelectorAll('.refs-dialog .refs-card button')].find((b) => b.textContent.trim() === '⋯'), 10000);
  more?.click();
  const row = await until(() => [...document.querySelectorAll('button')].find((b) => /◎ Match against this/.test(b.textContent) && b.offsetParent), 5000);
  step('chip: the reference\'s card has ⋯ › ◎ Match against this', Boolean(more && row));
  row?.click();
  const chip = await until(() => { const c = document.querySelector('.three-preview .ms-chip'); return c && !c.hidden && /◎ \d+ %/.test(c.textContent) ? c : null; }, 30000);
  step('chip: picking it shows a small "◎ N %" chip by the preview\'s stats line (nothing else on screen)', Boolean(chip) && !card() && Boolean(document.querySelector('.three-preview .three-stats')), chip?.textContent);
  const u0 = st().updates; await wait(2600);
  step('chip: it updates about twice a second', st().updates - u0 >= 3, st().updates - u0);
  out.info.palette = st().palette;

  // ---------- updown ----------
  const p0 = await fresh();
  setBg(ORANGE); const pUp = await fresh();
  setBg(BLUE); const pDown = await fresh();
  out.info.updown = { start: p0?.overall, toward: pUp?.overall, away: pDown?.overall, colours: [p0?.colours, pUp?.colours, pDown?.colours] };
  step('updown: the Background moved toward the picture\'s orange → the score goes up', pUp?.overall > p0?.overall + 3 && pUp?.colours > p0?.colours, out.info.updown);
  step('updown: moved away (blue) → the score goes down', pDown?.overall < pUp?.overall - 3 && pDown?.colours < pUp?.colours, out.info.updown);

  // ---------- parts ----------
  chip?.click();
  const c1 = await until(() => card()?.querySelectorAll('.ms-row').length ? card() : null, 5000);
  const parts = [...(c1?.querySelectorAll('.ms-row') || [])].map((r) => [r.querySelector('.ms-name').textContent, r.querySelector('.ms-v').textContent]);
  out.info.parts = parts;
  step('parts: the card shows the overall match and Colours, Light, Energy in plain words (no Motion for a still)', /◎ \d+ %/.test(c1?.querySelector('.ms-all')?.textContent || '') && parts.map((x) => x[0]).join() === 'Colours,Light,Energy' && parts.every((x) => /^\d+ %$/.test(x[1])), parts);
  step('parts: what is off, in words (the picture leans orange…)', /orange|warmer|picture/.test(c1?.textContent || ''), c1?.querySelector('.ms-rows')?.textContent.slice(0, 200));

  // ---------- cost ----------
  await wait(1500);
  const cost = st().cost;
  const box = await smoke({ loadwait: 'snap' }).catch(() => null);
  const busy = (box?.loadavg?.[0] / Math.max(1, box?.cpus || 1)) >= 0.75;
  out.info.cost = { ...cost, loadavg: box?.loadavg?.[0], cpus: box?.cpus };
  if (cost.median < 1) step('cost: each update costs the Lab\'s thread under 1 ms (median of the last updates)', cost.n >= 5, out.info.cost);
  else if (busy && cost.median < 4) { out.cantTell.push({ cost: out.info.cost }); step('cost: under 1 ms, or can\'t tell on a busy box', true, out.info.cost); } else step('cost: each update costs the Lab\'s thread under 1 ms', false, out.info.cost);

  // ---------- closer ----------
  const steps0 = window.LabDirect?.steps?.length || 0;
  const before = await fresh();
  const go = cardBtn(/^◎ Closer$/);
  go?.click();
  await until(() => st().busy, 3000, 30);
  await until(() => !st().busy && st().closer, 20000, 100);
  const cl = st().closer;
  const after = await fresh();
  out.info.closer = { before: before?.overall, after: after?.overall, run: cl, bg: bg() };
  step('closer: ◎ Closer raises the score (kept only what helped, within about 2 s)', Boolean(go) && cl && !cl.none && cl.best > cl.start && after?.overall > before?.overall + 2 && cl.ms < 6000, out.info.closer);
  step('closer: it moved the colour sliders toward the picture', bg() !== BLUE, bg());
  step('closer: one undo step in the Lab', (window.LabDirect?.steps?.length || 0) === steps0 + 1, (window.LabDirect?.steps || []).slice(-2));
  hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, metaKey: false, bubbles: true, cancelable: true }));
  await wait(300);
  const backTint = hk.ctlOf('msMain').controls().find((c) => c.key === 'tint')?.value;
  step('closer: ONE Ctrl/⌘+Z puts every slider back', bg() === BLUE && backTint === '#c0c0c0' && st().closer?.undone, { bg: bg(), tint: backTint });

  // ---------- ai ----------
  const chatLen = async () => { const id = H.activeChat?.[agent.id]; return id ? ((await Native.load(id).catch(() => null))?.messages?.length || 0) : 0; };
  const m0 = await chatLen();
  if (!card()) document.querySelector('.ms-chip')?.click();
  await until(() => cardBtn(/Ask the AI for the rest/), 5000);
  cardBtn(/Ask the AI for the rest/)?.click();
  const line = await until(() => { const t = card()?.querySelector('.ms-cost')?.textContent || ''; return /tokens/.test(t) ? t : null; }, 20000);
  await wait(1500);
  out.info.ai = { line, sent: st().sent.length };
  step('ai: ✦ Ask the AI for the rest shows the cost first (tokens · Claude)', /^About [\d.]+[kM]? tokens in \(most re-read from the cache\) and [\d.]+k? out · Claude/.test(line || ''), line);
  step('ai: nothing is sent before the click', st().sent.length === 0 && await chatLen() === m0, { sent: st().sent.length });
  cardBtn(/^✦ Send$/)?.click();
  await until(() => st().sent.length === 1, 10000);
  const sent = st().sent[0];
  await until(async () => (await chatLen()) > m0, 20000);
  step('ai: ✦ Send sends ONE message to the director, the parts still off in words, no picture', sent && sent.agentId === agent.id && sent.images.length === 0 && /^◎ Match: my scene is \d+ % like "sunset"/.test(sent.text) && /Colours|Light|Energy/.test(sent.text) && await chatLen() > m0, sent?.text.slice(0, 300));
  await until(() => !Native.isBusy?.(H.activeChat?.[agent.id]), 60000, 300);

  // ---------- clip ----------
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90; const cg = cv.getContext('2d');
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const t0 = performance.now(); let anim = 0;
  const draw = () => { const t = (performance.now() - t0) / 1000; cg.fillStyle = DARK; cg.fillRect(0, 0, 160, 90); cg.fillStyle = ORANGE; cg.fillRect(((t * 140) % 200) - 40, 0, 50, 90); cg.fillRect(0, ((t * 90) % 120) - 20, 160, 14); anim = requestAnimationFrame(draw); };
  draw(); rec.start(200); await wait(3200); rec.stop(); await new Promise((r) => { rec.onstop = r; }); cancelAnimationFrame(anim);
  const blob = new Blob(chunks, { type: 'video/webm' });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  const clipPath = await window.hub.saveAttachment('moving.webm', b64);
  await LabMatch.start({ path: clipPath, kind: 'video', title: 'moving' });
  if (!card()) document.querySelector('.ms-chip')?.click();
  await until(() => st().parts?.motion != null, 20000, 150);
  const rows = [...(card()?.querySelectorAll('.ms-row .ms-name') || [])].map((n) => n.textContent);
  out.info.clip = { kind: st().kind, refMotion: st().refMotion, parts: st().parts, rows };
  step('clip: a clip as the reference: its motion is read (frame-to-frame change)', st().kind === 'clip' && st().refMotion > 0.005, out.info.clip);
  step('clip: the card has a fourth part, Motion, measured from the scene\'s frames', rows.join() === 'Colours,Light,Energy,Motion' && typeof st().parts?.motion === 'number', out.info.clip);
  await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/matchscore141-card.png` }).catch(() => {});
  LabMatch.stop();
  step('stop: the chip goes away', !document.querySelector('.ms-chip') && !card());
} catch (err) { step(`threw: ${err.stack || err}`, false); }
out.ok = !out.problems?.length;
return JSON.stringify(out, null, 1);
