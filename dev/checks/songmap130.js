// (round 130, songmap130) ✦ Map to the song (docs/upgrades/songmap130.md), in one check:
//   1. a known song (dev/make-test-song.js --form, 128 BPM, intro / build / drop / break / drop / outro) on a scene
//      with real sliders and saved looks: ✦ Map in the timeline proposes a cue per section the song's analysis finds,
//      named after it, on its downbeat (with the looks that fit), drop keyframes on a real slider, kick / snare links
//   2. the ghosts change nothing in the scene (cues, keyframes, links, slider values read back the same)
//   3. ✕ on one item: its ghost goes, the scene is still unchanged
//   4. Keep all: everything left is in the scene (and the ✕'d one isn't); ONE Ctrl/⌘+Z puts the scene back exactly
//   5. Keep this section (the first drop) keeps only that section; ✦ Ask the AI to refine shows the cost first
//   6. the AI: three_do map_song through the fake engine (real MCP route) shows the plan, then apply keeps it, and
//      /undo-edit takes the whole reply back (beat links too)
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/songmap130.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;

  const CODE = `import * as THREE from 'three';
const P = tweak({ glow: [0.5, 0, 2], intensity: [1, 0, 3], spark: [0.2, 0, 1], tint: { value: '#ff3d7f', label: 'Tint' } });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop(() => { mesh.rotation.y += 0.01 * P.intensity; mesh.scale.setScalar(0.6 + P.glow * 0.3 + P.spark * 0.2); renderer.render(scene, cam); });`;
  const layers = [ThreeLayers.defaults({ id: 'smMain', name: 'Main', code: CODE, slot: 0 })];
  const sk = SC.create({ name: 'Song map check', code: CODE, layers, frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.ctlOf('smMain')?.controls().some((c) => c.key === 'spark'), 20000);
  const ctl = () => hk.ctlOf('smMain');
  // two saved looks: a calm one and a big one (a cue can carry looks)
  ctl().setMany({ glow: 0.2, intensity: 0.6 }); ctl().looksApi.save('Calm');
  ctl().setMany({ glow: 1.6, intensity: 2.4 }); ctl().looksApi.save('Hype');
  ctl().setMany({ glow: 0.5, intensity: 1 });
  const r0 = await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  step('the fixture song loads and is analyzed', P.analysis?.sections?.length >= 4, { ok: r0?.ok, sections: P.analysis?.sections?.map((s) => `${s.label}@${Math.round(s.start)}`) });

  const L = () => LabMatHook.host().layerById('smMain');
  const sig = () => JSON.stringify({ cues: P.timeline().cues, keys: L().keys || {}, ctl: ctl().controls().map((c) => [c.key, c.value, c.followsMusic || null]) });
  const before = sig();

  // ---------- 1. ✦ Map in the timeline: the plan ----------
  const mapBtn = await until(() => { const b = document.querySelector('.media-bar .mb-songmap'); return b && !b.hidden && b.offsetParent ? b : null; }, 10000);
  mapBtn?.click();
  await until(() => window.SongMap?.plan && document.querySelector('.sm-panel .sm-item'), 20000);
  const plan = SongMap.plan;
  const tl = P.timeline();
  const bar = (tl.grid.beatsPerBar * 60) / tl.grid.bpm; const db = tl.grid.downbeat || 0;
  const cues = plan.items.filter((x) => x.kind === 'cue');
  const onBar = (t) => { const k = (t - db) / bar; return Math.abs(k - Math.round(k)) < 0.01; };
  // the analysis's own sections (named as the timeline's Sections ▾ names them: the second Drop is "Drop 2")
  const want = []; { const n = {}; for (const sec of P.analysis.sections) { n[sec.label] = (n[sec.label] || 0) + 1; want.push({ name: n[sec.label] > 1 ? `${sec.label} ${n[sec.label]}` : sec.label, start: sec.start, label: sec.label }); } }
  step('✦ Map (in the timeline) proposes a cue per section of the song, named after it, each on a downbeat', mapBtn && cues.length === want.length && want.every((w) => cues.some((c) => c.name === w.name && Math.abs(c.time - w.start) <= bar / 2 + 0.05)) && cues.every((c) => onBar(c.time) || c.time === 0),
    { cues: cues.map((c) => `${c.name}@${c.time}`), sections: want.map((w) => `${w.name}@${Math.round(w.start * 10) / 10}`), bpm: tl.grid.bpm, downbeat: db });
  const drop = cues.find((c) => c.name === 'Drop');
  const quiet = cues.find((c) => /^(Intro|Break|Outro)/.test(c.name));
  step('…the drop cue sits on the song\'s first drop', drop && Math.abs(drop.time - (P.analysis.drops?.[0] ?? want.find((w) => w.label === 'Drop').start)) < bar / 2 + 0.05, { cue: drop?.time, drops: P.analysis.drops });
  step('…the cues carry the looks that fit (Drop: Hype; Intro / Break / Outro: Calm)', drop?.looks.some((l) => l.name === 'Hype') && quiet?.looks.some((l) => l.name === 'Calm'), cues.map((c) => `${c.name}:${c.looks.map((l) => l.name).join('+')}`));
  const keys = plan.items.filter((x) => x.kind === 'keys');
  const realKeys = ctl().controls().map((c) => c.key);
  step('drop keyframes on a real slider: it jumps on each drop and eases back over the bar', keys.length >= 2 && keys.every((k) => k.prop.startsWith('s:') && realKeys.includes(k.prop.slice(2))) && keys.every((k) => { const pk = k.keys.find((q) => q.ease === 'out'); const last = k.keys[k.keys.length - 1]; return pk && cues.some((c) => /^Drop/.test(c.name) && Math.abs(c.time - pk.t) < 0.01) && Math.abs(last.t - pk.t - bar) < 0.01 && pk.v > last.v; }),
    keys.map((k) => `${k.prop} ${k.keys.map((q) => `${q.t}=${q.v}`).join(' ')}`));
  const links = plan.items.filter((x) => x.kind === 'link');
  step('kick and snare beat links on fitting sliders (kick → glow, snare → spark)', links.some((l) => l.link.band === 'kick' && l.key === 'glow') && links.some((l) => l.link.band === 'snare' && l.key === 'spark'), links.map((l) => `${l.key}:${l.link.band}`));
  await smoke({ shot: '/tmp/songmap130-ghosts.png' }).catch(() => {});

  // ---------- 2. ghosts change nothing ----------
  step('the ghosts change nothing in the scene (cues, keyframes, links, slider values)', sig() === before && document.querySelectorAll('.sm-panel .sm-item').length === plan.items.length, { items: plan.items.length });

  // ---------- 3. ✕ one item ----------
  const snareRow = [...document.querySelectorAll('.sm-panel .sm-item')].find((r) => /Snare/.test(r.textContent));
  snareRow?.querySelector('.sm-x')?.click();
  await wait(150);
  step('✕ on one item: its ghost goes, the scene is still unchanged', snareRow && !SongMap.plan.items.some((x) => x.kind === 'link' && x.link.band === 'snare') && sig() === before, SongMap.plan.items.length);

  // ---------- 4. Keep all: ONE undo ----------
  document.querySelector('.sm-panel .sm-keepall')?.click();
  await wait(300);
  const kept = { cues: P.timeline().cues, keys: L().keys?.[keys[0]?.prop] || [], glow: ctl().binding('glow'), spark: ctl().binding('spark') };
  step('Keep all: the cues, the drop keyframes and the kick link are in the scene (the ✕\'d snare link is not)', cues.every((c) => kept.cues.some((x) => Math.abs(x.time - c.time) < 0.01 && x.name === c.name)) && kept.cues.find((x) => x.name === 'Drop')?.looks?.some((l) => l.name === 'Hype') && kept.keys.length >= 5 && kept.glow?.band === 'kick' && !kept.spark && !SongMap.plan,
    { cues: kept.cues.length, keys: kept.keys.length, glow: kept.glow?.band, spark: kept.spark });
  hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  step('ONE Ctrl/⌘+Z in the Lab puts the scene back exactly', sig() === before, sig() === before ? 'same' : { now: sig().slice(0, 300) });

  // ---------- 5. Keep this section; the AI refine shows its cost first ----------
  await SongMap.open({ quiet: true });
  await until(() => document.querySelector('.sm-panel .sm-sec'), 5000);
  const dropSec = [...document.querySelectorAll('.sm-panel .sm-sec')].find((s) => s.querySelector('.sm-sec-head b')?.textContent === 'Drop');
  const secIds = SongMap.plan.items.filter((x) => x.section === drop?.section).map((x) => x.id);
  dropSec?.querySelector('.sm-keepsec')?.click();
  await wait(300);
  const tl5 = P.timeline().cues;
  step('Keep this section (Drop): only its cue and its drop move are kept, the rest stays ghosts', secIds.length === 2 && tl5.length === 1 && tl5[0].name === 'Drop' && (L().keys?.[keys[0].prop] || []).length === 3 && SongMap.plan?.items.length > 0 && !SongMap.plan.items.some((x) => secIds.includes(x.id)), { kept: tl5.map((c) => c.name), ghostsLeft: SongMap.plan?.items.length });
  SongMap.undo({ quiet: true });
  await wait(200);
  document.querySelector('.sm-panel button[title^="The director gets this plan"]')?.click();
  const dlg = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /tokens/.test(d.textContent)), 5000);
  const dlgText = dlg?.textContent || '';
  [...(dlg?.querySelectorAll('button') || [])].find((b) => /Cancel|No/i.test(b.textContent))?.click();
  if (dlg?.open) dlg.close();
  await wait(200);
  step('✦ Ask the AI to refine shows the token cost first (nothing sent, the scene unchanged)', /≈[\d,]+ tokens/.test(dlgText) && sig() === before && SongMap.stats.asked === 0, dlgText.replace(/\s+/g, ' ').slice(0, 160));
  SongMap.close();

  // ---------- 6. the AI: three_do map_song through the fake engine ----------
  Native.newChat(agent.id);
  await wait(600);
  const chatId = H.activeChat[agent.id];
  ChatScenes.link(chatId, sk.id, { rename: false });
  if (SC.currentId() !== sk.id) SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && P.loaded && P.analysis?.sections?.length, 30000);
  const b6 = sig();
  const idle = async () => { await until(() => Native.isBusy(chatId), 4000); await until(() => !Native.isBusy(chatId), 90000); await wait(800); };
  await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'map_song' }]])}`);
  await idle();
  step('the AI\'s three_do map_song (fake engine, real MCP route) shows the plan as ghosts and changes nothing', Boolean(SongMap.plan?.items.length) && document.querySelector('.sm-panel .sm-item') && sig() === b6, { items: SongMap.plan?.items.length, reply: String(Native.current(agent.id)?.messages.at(-1)?.text || '').slice(0, 160) });
  await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'map_song', apply: true }]])}`);
  await idle();
  step('…with apply: true it keeps the plan (cues, drop moves, links in the scene)', P.timeline().cues.length >= 5 && (L().keys?.[keys[0].prop] || []).length >= 5 && ctl().binding('glow')?.band === 'kick', { cues: P.timeline().cues.length, reply: String(Native.current(agent.id)?.messages.at(-1)?.text || '').slice(0, 160) });
  await Commands.tryRun('/undo-edit', agent.id, null, { say: () => {}, note: () => {}, error: () => {} });
  await until(() => P.timeline().cues.length === 0, 8000);
  await until(() => !ctl().binding('glow'), 4000);
  step('…and its reply is one undo step: /undo-edit puts the cues, keyframes and beat links back', sig() === b6, sig() === b6 ? 'same' : { cues: P.timeline().cues.length, keys: (L().keys?.[keys[0].prop] || []).length, glow: ctl().binding('glow')?.band || null });
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
