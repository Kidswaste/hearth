// Labcut (round 18): the Lab sequence as a complete, light video editor. Footage and pictures framed per output format
// (fit / position / zoom, a pan from → to, Ken Burns by default on stills), sound (volume, fades, a Voice track the
// music ducks under, SFX), per-clip color looks, chop on every bar, captions from an .srt or typed (a Captions track,
// caption looks, saved back as .srt), lower thirds, the transition library menu, outputs rendered with their framing.
//   sh dev/run-checks.sh labcut-edit
const { step } = J;
const { wait, until, sbx } = SQL;
const Q = ThreeSeq;
const X = SeqCut;
const me = H.claudeAgent().id;
const cmd = async (t) => { const r = await Commands.tryRun(t, me); await wait(300); return r; };
const clipOf = (id) => CutData.find(Q.edit, id)?.clip;
const planGroup = (id) => sbx(`const g = __seqPlan().groups.find((x) => x.id === ${JSON.stringify(id)}); return g ? { frame: g.frame, look: g.look || null, fit: g.fit } : null`);

// ---------- the pure lib (also what the preview page runs) ----------
step('SeqCut: .srt / .vtt parse (tags dropped, two-line cues)', X.parseSubs('1\n00:00:01,000 --> 00:00:02,500\nHi <i>there</i>\n\n2\n00:00:03.000 --> 00:00:04.000\nTwo\nlines').map((c) => `${c.a}-${c.b}:${c.text}`).join('|') === '1-2.5:Hi there|3-4:Two\nlines');
step('SeqCut: framing words ("from left to right zoom 120%", "right third", "fit")', JSON.stringify(X.parseFrame('from left to right zoom 120%')) === JSON.stringify({ x: -1, y: 0, to: { x: 1, y: 0, z: 1.2 }, z: 1.2 }) && X.parseFrame('right third').x === 0.5 && X.parseFrame('fit').fit === 'contain');
step('SeqCut: ducking envelope (−12 dB under the voice, ramps on both sides)', Math.abs(X.duckAt([[1, 3]], 2) - 0.25) < 1e-6 && X.duckAt([[1, 3]], 0.5) === 1 && X.duckAt([[1, 3]], 0.9) < 1 && X.duckAt([[1, 3]], 0.9) > 0.25);
step('SeqCut: chop times on the bars inside a clip', JSON.stringify(X.chopTimes({ bpm: 120, bpb: 4, anchor: 0 }, 0, 8.1)) === '[2,4,6,8]');

// ---------- a sequence with a song, footage and a picture ----------
const ids = await SQL.scenes();
ThreeLab.scenes.open(ids.red); await wait(1200);
const b = await SQL.build({ name: 'Labcut seq', song: true });
await until(() => Q.active, 5000);
// a 1920×1080 picture: white on the left half, black on the right (where the 9:16 crop sits shows which)
const pic = '/tmp/labcut-pic.png';
{
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 1080); g.fillStyle = '#fff'; g.fillRect(0, 0, 960, 1080);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await window.hub.fs.write(pic, new Uint8Array(await blob.arrayBuffer()));
}
const picId = await Q.add({ path: pic }, { dur: 2, trans: null });
await wait(800);
step('a picture lands with an id and a slow push-in by default (Ken Burns)', picId && (await planGroup(picId))?.frame?.b?.z > 1, await planGroup(picId));
await Q.setMotion('none', [picId]);
const T0 = ThreeSeqData.timing(Q.edit).find((x) => x.clip.id === picId);
const at = async (t) => { Q.play(false); Q.seek(t); await Q.settle(2000); await wait(450); return sbx('return __seqPixels({ size: 60, x: 0.5, y: 0.5 })'); };
await Q.setFrame({ x: -1, y: 0 }, [picId]);
const left = await at(T0.start + 1);
await Q.setFrame({ x: 1, y: 0 }, [picId]);
const right = await at(T0.start + 1);
step('Frame › Position: left shows the picture\'s left (white), right its right (black) in 9:16', left.at[0] > 200 && right.at[0] < 40, { left: left.at, right: right.at });
step('…stored for this format only (frames["9:16"])', clipOf(picId).frames?.['9:16']?.x === 1 && !clipOf(picId).frames?.['16:9'], clipOf(picId).frames);
await Q.setFit('contain', [picId]);
const fitted = await sbx('return __seqPixels({ size: 60, x: 0.5, y: 0.08 })');
step('Frame › Fit inside: bars above / below (black at the top of 9:16)', fitted.at[0] < 30 && clipOf(picId).frames['9:16'].fit === 'contain', fitted.at);
await cmd('/sequence frame 5 reset');
step('/sequence frame <clip> reset: back to auto (centered)', !clipOf(picId).frames, clipOf(picId));
await cmd('/sequence frame 5 from left to right zoom 120%');
step('/sequence frame … from left to right: a keyframed pan for this format', clipOf(picId).frames?.['9:16']?.to?.x === 1 && clipOf(picId).frames['9:16'].x === -1, clipOf(picId).frames);
await cmd('/sequence move-cam 5 auto');
step('/sequence move-cam <clip> auto: a move that suits it', clipOf(picId).motion === 'auto');

// ---------- sound: volume, fades, voice + ducking, tracks as rows ----------
await cmd('/sequence volume 3 50%');
step('/sequence volume 3 50%: the footage\'s sound on at half', clipOf(b.clips.foot).volume === 0.5 && clipOf(b.clips.foot).mute === false, clipOf(b.clips.foot));
await cmd('/sequence fade 3 out 0.5');
step('/sequence fade 3 out 0.5', clipOf(b.clips.foot).fadeOut === 0.5);
const vId = await Q.add({ path: SQL.SONG, role: 'voice' }, { at: 1 });
const vk = Q.edit.tracks.find((k) => k.items.some((x) => x.id === vId));
step('a voice-over goes on its own Voice track', vk?.name === 'Voice', vk?.name);
await until(async () => (await sbx('return __seqPlan().duck || null'))?.ranges, 4000);
const duck = await sbx('return __seqPlan().duck || null');
step('the music ducks under the voice (the plan carries the voice\'s ranges)', duck?.ranges?.length >= 1 && Math.abs(duck.ranges[0][0] - 0.9) < 0.05 && duck.amount === X.DEFAULT_DUCK, duck);
await cmd('/sequence duck 18 dB');
step('/sequence duck 18 dB', Math.abs(Q.edit.seq.duckAmt - 10 ** (-18 / 20)) < 1e-3, Q.edit.seq);
const sfx = await Q.add({ path: SQL.SONG, role: 'sfx' }, { at: 0.2 });
Q._draw();
const ls = Q._lanes(); const sound = ls.find((l) => l.id === 'sound');
step('the Sound lane shows a row per track (Song · Voice · SFX) and the timeline grows to fit', sound.rows.length === 3 && sound.rows.map((k) => k.name).join(',') === 'Sound,Voice,SFX' && document.querySelector('.sq-tl').offsetHeight > 112, { rows: sound.rows.map((k) => k?.name), h: document.querySelector('.sq-tl').offsetHeight });
const r = Q._S.L ? document.querySelector('.sq-canvas').getBoundingClientRect() : null;
const sx = r.left + Q._xOf(0.4); const sy = r.top + sound.y + sound.rowH * 2 + sound.rowH / 2;
const h = Q._hit({ clientX: sx, clientY: sy });
step('clicking the SFX row hits the SFX clip (not the song under it)', h.zone === 'clip' && h.clip.id === sfx, { zone: h.zone, id: h.clip?.id, sfx });
await cmd('/sequence mute SFX');
step('/sequence mute SFX', Q.edit.tracks.find((k) => k.name === 'SFX').mute === true);

// ---------- color looks ----------
Q.select(null);
await cmd('/sequence grade 1 bw');
const gray = await at(0.3);
step('/sequence grade 1 bw: the red scene shows in black & white', clipOf(b.clips.red).grade?.look === 'bw' && Math.abs(gray.at[0] - gray.at[1]) < 30 && gray.at[0] > 20, gray.at);
await cmd('/sequence grade all teal-orange');
step('/sequence grade all <look>: a look for the whole sequence', Q.edit.seq.grade?.look === 'teal-orange');
await cmd('/sequence grade all none');

// ---------- chop on the music ----------
await until(() => Q.status().grid, 15000);
const n0 = Q.edit.clips.length;
const blue0 = ThreeSeqData.timing(Q.edit).find((x) => x.clip.id === b.clips.blue);
await Q.setLength(b.clips.blue, 4 * 60 / Q.status().grid.bpm * 4);
const cuts = Q.chop('bar', [b.clips.blue]);
step('✂ Chop on every bar: the clip cut on the song\'s bars', cuts >= 2 && Q.edit.clips.length === n0 + cuts, { cuts, n0, n1: Q.edit.clips.length, blue0: blue0.start });

// ---------- captions, lower thirds ----------
const srt = '/tmp/labcut-caps.srt';
await window.hub.fs.write(srt, '1\n00:00:00,500 --> 00:00:01,800\nHello Hearth\n\n2\n00:00:02,000 --> 00:00:03,000\nMade in the Lab\n');
await cmd(`/sequence captions ${srt}`);
const caps = () => Q.edit.tracks.filter((k) => /^Captions/.test(k.name)).flatMap((k) => k.items).sort((p, q) => p.start - q.start);
step('/sequence captions <file.srt>: a Captions track with its cues at their times', caps().length === 2 && caps()[0].start === 0.5 && caps()[0].style === 'caption', caps().map((x) => [x.start, x.text, x.style]));
await cmd('/sequence caption-look social');
step('/sequence caption-look social: every caption takes the look', caps().every((x) => x.style === 'caption-tiktok'));
await cmd('/sequence captions one | two | three');
step('/sequence captions typed lines: added after the playhead, one a bar (a row of their own where they overlap)', caps().length === 5, caps().map((x) => x.text));
const saved = await Q.exportCaptions().catch((err) => ({ error: err.message }));
const srtBack = typeof saved === 'string' ? await window.hub.fs.read(saved) : '';
step('Save the captions as .srt (read back)', /Hello Hearth/.test(srtBack) && /00:00:00,500 --> 00:00:01,800/.test(srtBack), { saved, head: srtBack.slice(0, 80) });
await cmd('/sequence lower Ada Lovelace — Engineer at 1');
const lower = Q.edit.tracks.flatMap((k) => k.items).find((x) => x.lower);
step('/sequence lower <Name — Role>: a lower third (two lines, the Forgeheart look)', lower?.text === 'Ada Lovelace\nEngineer' && lower.lower === 'forge' && Math.abs(lower.start - 1) < 0.05, lower);

// ---------- menus: the clip menu, the transition library ----------
const cr = document.querySelector('.sq-canvas').getBoundingClientRect();
const main = Q._lanes().find((l) => l.id === 'main');
const gx = ThreeSeqData.timing(Q.edit).find((x) => x.clip.id === b.clips.green);
document.querySelector('.sq-canvas').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: cr.left + Q._xOf(gx.start + 1), clientY: cr.top + main.y + 10 }));
await wait(300);
const rows = () => [...document.querySelectorAll('#menu button')].map((x) => x.textContent);
step('right-click a scene clip: Color look and Transition in', rows().some((t) => /Color look/.test(t)) && rows().some((t) => /Transition in/.test(t)), rows());
[...document.querySelectorAll('#menu button')].find((x) => /Transition in/.test(x.textContent))?.click();
await wait(400);
step('Transition in: one searchable library (filter field, most used first, groups as submenus)', Boolean(document.querySelector('#menu .menu-filter')) && rows().some((t) => /Dissolve/.test(t)) && rows().some((t) => /Lab moves/.test(t)) && rows().some((t) => /^Wipe/.test(t)), rows().slice(0, 30));
hideMenu();

// ---------- outputs: one sequence, several formats, each its own framing ----------
await cmd('/sequence outputs 9:16 1:1');
step('/sequence outputs 9:16 1:1', JSON.stringify(Q.outputsOf()) === '["9:16","1:1"]');
await Q.setFrame({ x: -1, y: 0 }, [picId]);
await Q.setMotion('none', [picId]);
Q.setRange(T0.start + 0.5, T0.start + 0.8);
const outs = await Q.renderOutputs({ range: Q.rangeOf(), crf: 30 }).catch((err) => [{ error: err.message }]);
step('⇪ Render the outputs: one file per format', outs.length === 2 && outs.every((o) => o.path) && outs[1].format === '1:1', outs.map((o) => o.path || o.error));
const sq = outs[1]?.path ? await window.hub.video.probe(outs[1].path).catch(() => null) : null;
step('…the 1:1 one is 1080×1080 with sound', sq?.w === 1080 && sq?.h === 1080 && Boolean(sq?.audio), sq);
const srtNext = outs[0]?.path ? await window.hub.fs.stat(outs[0].path.replace(/\.mp4$/, '.srt')).catch(() => null) : null;
step('…and the Captions track as an .srt next to each video', Boolean(srtNext));

// ---------- chat surface ----------
step('no duplicate commands', Commands.duplicates().length === 0, Commands.duplicates());
const help = await Q.handle('three_sequence', { op: 'help' });
step('directors: the labcut ops are in three_sequence help', /render_outputs/.test(help.value) && /captions/.test(help.value) && /grade/.test(help.value));
const keys = Keys.all().filter((k) => k.area === 'Lab sequence').map((k) => k.keys);
step('B / Shift+B (chop) are in the keys sheet', keys.includes('B / Shift+B'), keys.slice(-3));
return J.done();
