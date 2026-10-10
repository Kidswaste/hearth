// The orb (round 10): a new director chat's scene is a node-built glowing orb on the scene's own timeline (no song,
// no music reactivity), in the chat's color; the timeline is frame-exact with keyframes on it; a song loaded on it
// keeps the keyframes / cues at their seconds and shows bars (✦ snap to bars), taking it out brings the scene's own
// timeline back; each chat's scene, timeline and sequence switch together; everything survives a reload.
//   node dev/smoke.js --fake-engines --script dev/checks/orb.js --wait 6000 --check-timeout 400000 --shot /tmp/orb.png
// (uses /tmp/hearth-test-song.wav: sh dev/run-checks.sh orb makes it)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };
const SONG = '/tmp/hearth-test-song.wav';

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
const lab = await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(800);
const S = ThreeLab.scenes; const D = ThreeLab.director; const P = lab.player;
const cur = () => S.get(S.currentId());
const orbLayer = (id) => S.layersOf(S.get(id)).find((L) => L.name === 'Orb');
// a picture of the preview → pixels (the layers merged, like a recording)
async function pixels() {
  const url = await D.shot();
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = 96; c.height = Math.max(2, Math.round(96 * img.height / img.width));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
}
const at = (p, x, y) => { const i = (Math.round(y * (p.h - 1)) * p.w + Math.round(x * (p.w - 1))) * 4; return [p.d[i], p.d[i + 1], p.d[i + 2]]; };
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// the brightest spot in the middle of the frame (the orb's rim and glow) vs a corner (the backdrop's vignette)
const peak = (p) => { let best = [0, 0, 0]; for (let y = 0.25; y <= 0.75; y += 0.025) for (let x = 0.25; x <= 0.75; x += 0.025) { const c = at(p, x, y); if (lum(c) > lum(best)) best = c; } return best; };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.d.length; i += 4) s += Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); return s / (a.d.length / 4) / 3; };
const drawn = () => until(() => { const st = D.report().stats; return st && typeof st === 'object' && st.fps > 0; }, 20000);

// 1. "New chat": the orb, two node layers, its own timeline (10 s, 30 fps), keyframes on it, no music
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat' && S.layersOf(cur()).length === 2, 10000);
const draft = cur();
step(S.layersOf(draft).map((L) => L.name).join(',') === 'Backdrop,Orb', 'a new chat opens the orb: Backdrop + Orb layers', S.layersOf(draft).map((L) => L.name));
const graphs = S.layersOf(draft).map((L) => ThreeNodes.fromCode(L.code));
step(graphs.every((g) => g && !g.edited), 'both layers are node graphs (code = the graph)', graphs.map((g) => g?.graph.nodes.map((n) => n.type).join('+')));
step(['timeline', 'orb', 'orbHalo', 'camera', 'output'].every((t) => graphs[1]?.graph.nodes.some((n) => n.type === t)) && graphs[0]?.graph.nodes.some((n) => n.type === 'backdrop'), 'the graphs: Timeline → Glowing orb + Orb halo + Camera, and a Backdrop');
step(S.layersOf(draft).every((L) => !/\baudio\./.test(L.code.replace(/\/\/ @nodes:v1.*$/m, ''))), 'nothing in it reads the music');
await until(() => P.isClock, 8000);
step(P.isClock && Math.abs(P.duration - 10) < 1e-6 && P.clock?.fps === 30 && P.path === `scene:${draft.id}`, 'it has its own timeline: 10 s at 30 fps, no song', P.clock);
const info = D.media.info();
step(Boolean(info.sceneTimeline) && !info.file, 'the director sees "no song: the scene\'s own timeline"', info.note?.slice(0, 70));
const keys = orbLayer(draft.id).keys || {};
step(['s:orb1_scale', 's:orb1_glow', 's:camera1_distance', 's:camera1_height'].every((k) => keys[k]?.length >= 3), 'keyframes on the timeline from the start (size, glow, camera drift)', Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.length])));
const tlRead = D.timeline();
const orbTrack = tlRead.layers.find((x) => x.name === 'Orb');
step(Object.keys(orbTrack?.keyframes || {}).length === 4 && orbTrack.lanes.includes('slider orb1_glow'), 'the timeline shows them (track keys + the Glow lane)', orbTrack?.lanes);
step(Boolean(document.querySelector('.media-bar.mb-clock')) && /Scene timeline/.test(document.querySelector('.media-bar .mb-name')?.textContent || ''), 'the timeline bar says "⏱ Scene timeline · 10 s"', document.querySelector('.media-bar .mb-name')?.textContent);
await until(() => P.playing, 15000); // (a busy machine: the preview starts a little later)
step(P.playing, 'it plays on its own (silent) so the orb moves');
await drawn();
await wait(1200);
let px = await pixels();
const mid = peak(px); const corner = at(px, 0.03, 0.03);
step(lum(mid) > 90 && lum(mid) > lum(corner) + 60, 'the orb is drawn: bright in the middle, dark at the edges', { mid, corner });
await smoke({ shot: '/tmp/hearth-orb/1-new-chat-orb.png' });
// the Nodes view shows the orb's graph
ThreeNodes.lab.setMode('nodes');
await wait(600);
const shownTypes = ThreeNodes.lab.view.getGraph().nodes.map((n) => n.type);
step(shownTypes.includes('orb') && shownTypes.includes('timeline'), 'the Nodes view shows the orb\'s graph', shownTypes);
await smoke({ shot: '/tmp/hearth-orb/2-nodes-view.png' });
ThreeNodes.lab.setMode('code');

// 2. the first message: the chat takes it, in its own color
await Native.send(agent.id, 'Orb A: a calm ember orb');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const A = H.activeChat[agent.id];
const skA = ChatScenes.linkOf(A);
const colA = ChatScenes.identity(A).color;
step(skA === draft.id && orbLayer(skA).code.includes(`orb1_color: { value: '${colA}'`), 'the chat owns it and its orb takes the chat\'s color', colA);
step(S.timelineOf(skA)?.len === 10 && P.path === `scene:${skA}`, 'still on its own timeline after the recolor');

// 3. frame-exact: the same frame is the same picture; steps land on frames
await drawn();
await wait(2500); // the recolor re-ran the layers
P.toggle(false);
await until(() => !P.playing, 4000);
const shotAt = async (t) => { P.seek(t); await wait(900); return pixels(); };
let a1 = await shotAt(2.5);
step(Math.abs(P.time - 2.5) < 1e-9 && /f75\b/.test(document.querySelector('.media-bar .mb-time')?.textContent || ''), 'seek 2.5 s = frame 75 (counter shows f75)', document.querySelector('.media-bar .mb-time')?.textContent);
let b1 = await shotAt(7.2);
let a2 = await shotAt(2.5);
// a busy machine can catch one picture mid-redraw: once more before judging
if (diff(a1, a2) >= 1.5) { a1 = await shotAt(2.5); b1 = await shotAt(7.2); a2 = await shotAt(2.5); }
step(diff(a1, a2) < 1.5 && diff(a1, b1) > 3, 'the same frame twice → the same picture; another frame → another one', { same: Math.round(diff(a1, a2) * 100) / 100, other: Math.round(diff(a1, b1) * 100) / 100 });
P.seek(1.234);
step(Math.abs(P.time * 30 - Math.round(P.time * 30)) < 1e-6, 'any seek lands on a frame start', P.time);
const m1 = await say('/scene-timeline go f120', agent.id);
step(Math.abs(P.time - 4) < 1e-9, '/scene-timeline go f120 → 4 s', m1);
const m2 = await say('/scene-timeline', agent.id);
step(/own timeline: 10 s at 30 fps/.test(m2) && /4 keyframe|keyframes/.test(m2), '/scene-timeline says what is on it', m2.slice(0, 160));
// keyframed values follow the timeline (glow peaks at 2.5 s)
P.seek(2.5);
await wait(300);
const glowNow = ThreeLayers.evalKeys(orbLayer(skA).keys['s:orb1_glow'], P.time, 1.2);
step(Math.abs(glowNow - 1.7) < 0.05, 'keyframed glow at 2.5 s = 1.7 (the sandbox evaluates the same keys at the timeline\'s time)', glowNow);
// a cue on the scene's own timeline
P.addCue(3, 'Rise');
step(P.cues.some((c) => c.name === 'Rise' && Math.abs(c.time - 3) < 1e-3), 'a cue on the scene\'s timeline (no song)');
// the director's timeline edit acts on it with no song
const te = await HubBridge.call('three_timeline_edit', { length: 12 }, { chatId: A });
step(te.ok !== false && Math.abs(P.duration - 12) < 1e-6 && S.timelineOf(skA).len === 12, 'three_timeline_edit { length } on the scene\'s own timeline', te.error || te.value?.changed);
await HubBridge.call('three_timeline_edit', { length: 10 }, { chatId: A });
// no music until asked
const react = await say('/make-it-react', agent.id);
step(/no song on this scene yet/.test(react), '/make-it-react on a scene with no song says it waits for music', react.slice(0, 120));
await say('/make-it-react undo', agent.id);

// 4. a song on the orb scene: keyframes stay at their seconds, the cue comes along, bars show; ✦ snap to bars
const keysBefore = JSON.stringify(orbLayer(skA).keys);
const lm = await HubBridge.call('three_load_media', { path: SONG }, { chatId: A });
step(lm.ok !== false && P.path === SONG && !P.isClock, 'three_load_media puts a song on the scene', lm.error || P.path);
step(JSON.stringify(orbLayer(skA).keys) === keysBefore, 'the keyframes keep their seconds on the song');
await until(() => P.cues.some((c) => c.name === 'Rise'), 5000);
step(P.cues.some((c) => c.name === 'Rise' && Math.abs(c.time - 3) < 1e-3), 'the scene\'s cue is on the song\'s timeline too', P.cues);
const grid = P.timeline().grid;
step(grid?.bpm > 0 && P.beatsIn(0, 10).length > 8, 'the timeline shows the song\'s beats and bars', { bpm: grid?.bpm, beats: P.beatsIn(0, 10).length });
await until(() => [...document.querySelectorAll('.toast button')].some((b) => /Snap them to bars/.test(b.textContent)), 8000);
const snapBtn = [...document.querySelectorAll('.toast button')].find((b) => /Snap them to bars/.test(b.textContent));
step(Boolean(snapBtn), 'a one-click suggestion: ✦ Snap them to bars');
await smoke({ shot: '/tmp/hearth-orb/3-song-loaded.png' });
snapBtn?.click();
await wait(300);
const bar = 60 / grid.bpm * (grid.beatsPerBar || 4); const beat = 60 / grid.bpm; const a0 = grid.downbeat ?? 0;
const onGrid = (t) => [bar, beat].some((u) => Math.abs((t - a0) / u - Math.round((t - a0) / u)) < 0.01);
const snapped = Object.values(orbLayer(skA).keys).flat();
step(snapped.every((k) => onGrid(k.t)), 'snapped: every keyframe on a bar (or a beat)', snapped.map((k) => k.t));
const riseT = P.cues.find((c) => c.name === 'Rise')?.time;
step(riseT != null && onGrid(riseT), 'the cue too', riseT);
// taking the song out: the scene's own timeline comes back, with the cue
document.querySelector('.media-bar .mb-x')?.click();
await until(() => P.isClock, 6000);
step(P.isClock && P.path === `scene:${skA}` && !S.songOf(skA), 'taking the song out brings the scene\'s own timeline back', P.path);
await until(() => P.cues.some((c) => c.name === 'Rise'), 4000);
step(P.cues.some((c) => c.name === 'Rise'), 'with the cue on it');
step(Object.values(orbLayer(skA).keys).flat().length === snapped.length, 'and the keyframes');

// 5. chat B: its own orb, timeline and sequence; switching chats switches all three
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat', 8000);
await Native.send(agent.id, 'Orb B: a violet one');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const B = H.activeChat[agent.id];
const skB = ChatScenes.linkOf(B);
const colB = ChatScenes.identity(B).color;
step(skB && skB !== skA && colB !== colA && orbLayer(skB).code.includes(`'${colB}'`), 'chat B: its own orb in its own color', { colA, colB });
await until(() => P.path === `scene:${skB}`, 5000);
step(P.path === `scene:${skB}` && P.isClock, 'B\'s own timeline is on screen', P.path);
const kA = await ThreeSeq.keyForScene(skA); const kB = await ThreeSeq.keyForScene(skB);
step(kA && kB && kA !== kB, 'each scene owns its sequence', { kA, kB });
await ThreeSeq.open(kB, { show: false });
const eB = ThreeSeq.edit;
step(eB?.clips?.[0]?.kind === 'scene' && eB.clips[0].sketch === skB && Math.abs(eB.clips[0].dur - 10) < 1e-6, 'B\'s sequence starts with B\'s scene as its clip (its timeline\'s length)', eB?.clips?.map((c) => `${c.kind} ${c.dur}`));
await ThreeSeq.enter();
await wait(800);
Native.open(agent.id, A);
await until(() => S.currentId() === skA && ThreeSeq.owner === skA, 10000);
step(S.currentId() === skA && ThreeSeq.owner === skA && ThreeSeq.key === kA, 'switching chats with ▤ showing: A\'s scene and A\'s sequence', ThreeSeq.key);
await ThreeSeq.leave();
await until(() => P.path === `scene:${skA}`, 6000);
step(P.path === `scene:${skA}` && P.isClock, 'leaving the sequence: A\'s own timeline again', P.path);
Native.open(agent.id, B);
await until(() => S.currentId() === skB && P.path === `scene:${skB}`, 8000);
step(P.path === `scene:${skB}`, 'back to B: B\'s scene and B\'s timeline', P.path);
// Duplicate keeps the timeline
const copy = S.duplicate(skB, 'Orb B copy');
step(S.timelineOf(copy.id)?.len === 10, 'a duplicated scene keeps its own timeline', S.timelineOf(copy.id));
await drawn();
const tintB = colB.match(/\w\w/g).map((h) => parseInt(h, 16));
const dom = (c) => c.indexOf(Math.max(...c));
// (the preview may still be coming back from the sequence's frame size: wait for the picture)
await until(async () => { px = await pixels(); return lum(peak(px)) > 90; }, 15000);
// the middle's average color (the rim is near white: its hue is in the rest)
const meanMid = (p) => { const m = [0, 0, 0]; let n = 0; for (let y = 0.3; y <= 0.7; y += 0.02) for (let x = 0.3; x <= 0.7; x += 0.02) { const c = at(p, x, y); if (lum(c) > 20) { m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; n += 1; } } return m.map((v) => Math.round(v / Math.max(1, n))); };
const seenB = meanMid(px);
step(lum(peak(px)) > 90 && dom(seenB) === dom(tintB), 'B\'s orb is drawn, in B\'s color', { seen: seenB, tint: tintB });
await smoke({ shot: '/tmp/hearth-orb/4-chat-B.png' });
localStorage.setItem('orbcheck', JSON.stringify({ A, B, skA, skB, colA, colB, keysA: Object.values(orbLayer(skA).keys).flat().length }));
await wait(1500); // kv saves are debounced
return JSON.stringify(out, null, 1);
//@@ reload
// 6. after a reload: the scenes, their timelines, cues, keyframes and sequences are all still there
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const st = JSON.parse(localStorage.getItem('orbcheck') || '{}');
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
const lab = await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
const S = ThreeLab.scenes; const P = lab.player;
Native.open(agent.id, st.A);
await until(() => S.currentId() === st.skA && P.path === `scene:${st.skA}`, 15000);
step(S.currentId() === st.skA && P.isClock && Math.abs(P.duration - 10) < 1e-6, 'after a reload: A\'s orb on its own timeline', P.path);
await until(() => P.cues.some((c) => c.name === 'Rise'), 5000);
step(P.cues.some((c) => c.name === 'Rise'), 'its cue');
const keysA = Object.values(S.layersOf(S.get(st.skA)).find((L) => L.name === 'Orb').keys).flat().length;
step(keysA === st.keysA, 'its keyframes', keysA);
step(S.layersOf(S.get(st.skA)).find((L) => L.name === 'Orb').code.includes(`'${st.colA}'`), 'its color');
const kA = await ThreeSeq.keyForScene(st.skA, { make: false });
step(Boolean(kA), 'its sequence', kA);
Native.open(agent.id, st.B);
await until(() => S.currentId() === st.skB && P.path === `scene:${st.skB}`, 15000);
step(P.path === `scene:${st.skB}`, 'B too', P.path);
const ok = await until(() => { const s2 = ThreeLab.director.report().stats; return s2 && typeof s2 === 'object' && s2.fps > 0; }, 20000);
step(ok, 'and it draws');
return JSON.stringify(out, null, 1);
