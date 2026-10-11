// Capture × the Lab: the Lab preview at its exact frame size (9:16 → 1080×1920), a Lab-only recording, a recording
// put on the Lab sequence and added to the Lab as media, and the agents' capture_shot on the Lab.
//   node dev/smoke.js --script dev/checks/capture-lab.js --check-timeout 240000
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agentId = H.claudeAgent().id;
activate('tool:three');
const c = await ThreeLab.cmd({ show: true });
await sleep(3500);
await Commands.tryRun('/size 9:16', agentId, null, { source: 'code', say: () => {} });
await sleep(2500);
const lab = await Capture.shot({ target: 'lab', quiet: true });
out.lab = { w: lab.w, h: lab.h, path: lab.path };
ok(lab.w === 1080 && lab.h === 1920, 'Lab preview at its exact frame size (1080×1920)');
const said = []; await Commands.tryRun('/shot lab 1:1', agentId, null, { source: 'code', say: (t) => said.push(t) });
out.labSquare = said[0];
ok(/1080×1080/.test(said[0] || ''), '/shot lab 1:1 renders the Lab at 1080×1080 (then puts the size back)');
await sleep(2500);
const tool = await HubBridge.call('capture_shot', { target: 'lab' });
out.tool = tool.ok ? tool.value : tool.error;
ok(tool.ok && tool.images?.length === 1 && /1080×1920/.test(tool.value.size), 'capture_shot lab for the agents');
const toolSel = await HubBridge.call('capture_shot', { selector: '.three-preview', crop: '1:1', see: false });
ok(toolSel.ok && !toolSel.images && /1080×1080/.test(toolSel.value.size), 'capture_shot by selector + social crop, path only');
const region = await HubBridge.call('capture_shot', { target: 'region' });
ok(!region.ok && /owner/.test(region.error), 'region needs the owner (clear refusal)');
// record only the Lab preview for 2 s
await Capture.record({ target: 'lab', fps: 30, countdown: 0, mp4: true, audio: 'none' });
await sleep(1500);
out.mid = Capture.status();
await sleep(700);
const r = await Capture.stop({ quiet: true });
const p = (await window.hub.capture.frames('probe', r.mp4)).value;
const rect = Capture.rectOf(Capture.elementFor('lab'));
out.rec = { path: r.mp4, w: p.w, h: p.h, dur: p.duration, frames: ((await window.hub.capture.frames('times', r.webm || r.mp4 || r.path)).value || []).length, rect };
ok(Math.abs(p.w - Math.round(rect.width / 2) * 2) <= 2 && Math.abs(p.h - Math.round(rect.height / 2) * 2) <= 2, 'the recording is the Lab preview\'s size');
ok(out.rec.frames >= 1 && p.duration > 0, 'a playable take (the steady rate is checked in capture-record.js; WebGL in software on a busy test machine starves the encoder)');
ok(out.mid.framesIn > 3, 'the moving Lab sends frames');
const f = await FrameRead.at(r.mp4, { time: 1 });
out.labFrame = f.path;
await sleep(200);
// (round 17) its menu opens it in the system player / Finder or puts it on the Lab sequence (no Video Review)
const labels = CaptureView.itemsFor(r.mp4).filter(Boolean).map((x) => x.label || '');
out.menu = labels.join(' | ').slice(0, 300);
ok(labels.includes('Open in the system player') && labels.includes(MediaFile.revealLabel) && labels.includes('Add to the Lab sequence') && !labels.some((l) => /Video Review|editor/.test(l)), 'its menu: system player, Finder / Explorer, the Lab sequence');
ok(typeof Capture.openInReview === 'undefined' && typeof Capture.addToEdit === 'undefined', 'no Video Review / editor hand-offs left');
const onSeq = await Capture.addToSequence(r.mp4).catch((e) => e.message);
await sleep(800);
out.onSeq = onSeq;
ok(onSeq === true && (ThreeSeq.edit?.clips || []).some((c) => c.src === r.mp4), `on the Lab sequence as a footage clip (${onSeq})`);
await smoke({ shot: '/tmp/capture-lab-sequence.png' });
// and as Lab media
const added = await Capture.addToLab(r.mp4).catch((e) => e.message);
out.addedToLab = added;
ok(added === true, 'added to the Lab as media');
await Commands.tryRun('/size fit', agentId, null, { source: 'code', say: () => {} });
return JSON.stringify(out, null, 1);
