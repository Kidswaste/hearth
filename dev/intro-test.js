#!/usr/bin/env node
// Unit checks of the video projects' data and planning math (intro-data.js), in Node: every template makes a valid
// plan at its length, every preset id exists in the editor's presets (tools/cut-presets.js), cuts land on the song's
// grid, cut-downs keep the hook and the end card, words fill, Astra's replies parse, covers score.
//   node dev/intro-test.js
const assert = require('assert');
const D = require('../intro-data.js');
const FX = require('../tools/cut-presets.js');
const V = require('../tools/video-data.js');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

// presets exist in the editor
for (const s of D.TRANSITION_SETS) for (const t of s.list) ok(t === 'cut' || FX.TRANS[t], `transition ${t} (${s.id})`);
for (const l of D.TITLE_LOOKS) for (const [style, anim] of [l.hook, l.body, l.end]) { ok(FX.TSTYLE[style], `title style ${style} (${l.id})`); ok(FX.TANIM[anim], `title anim ${anim} (${l.id})`); }
for (const g of D.GRADES) ok(FX.LOOK[g], `grade ${g}`);
for (const f of D.FORMATS) ok(V.EXPORT_PRESETS.some((p) => p.id === f.preset), `export preset ${f.preset}`);
ok(FX.SHAPE['glow-ember'] && FX.SHAPE['pulse-ring'], 'shapes used by end / stat beats');
// unique ids
const uniq = (list, what) => ok(new Set(list.map((x) => x.id)).size === list.length, `unique ${what}`);
uniq(D.TEMPLATES, 'templates'); uniq(D.RECIPES, 'recipes'); uniq(D.TRANSITION_SETS, 'transition sets'); uniq(D.TITLE_LOOKS, 'title looks'); uniq(D.CUT_MODES, 'cut modes'); uniq(D.COVER_MODES, 'cover modes'); uniq(D.POSTS, 'posts'); uniq(D.STATS, 'stats');

// every template: a plan at its length and at other lengths, beats valid
const counts = { commands: 860, transitions: 131, looks: 197, titles: 117, templates: 72, formats: 4 };
for (const t of D.TEMPLATES) {
  for (const secs of [t.secs, 6, 15, 30]) {
    const p = D.makePlan({ template: t.id, secs, counts });
    ok(near(D.total(p), secs, 0.05) || secs < p.beats.length * 0.6, `${t.id} ${secs}s → ${D.total(p)}`);
    ok(p.beats.every((b) => D.KINDS[b.kind] && b.secs >= 0.6 && b.id && b.n), `${t.id} beats valid`);
    ok(p.beats.every((b) => !/\{\w+\}/.test(`${b.words || ''} ${b.sub || ''}`)), `${t.id} words filled: ${p.beats.map((b) => b.words).join(' / ')}`);
    ok(p.beats.filter((b) => b.kind === 'tour' || b.kind === 'shot').every((b) => D.recipeFor(b.area)), `${t.id} recipes`);
    ok(p.formats.every((f) => D.FORMAT[f]), `${t.id} formats`);
  }
  ok(t.beats.some((b) => b.pri === 1), `${t.id} has beats to keep in cuts`);
}
// recipes: tours with record / stop and the padding
for (const r of D.RECIPES) {
  const txt = D.tourText(r, '16:9');
  ok(/^record 16:9 30fps mute mp4$/m.test(txt) && /\nstop$/.test(txt), `tour ${r.id}`);
  ok(!/\b(cmd|type|send|click)\b/.test(r.steps), `recipe ${r.id} only looks (no clicks, commands or typing)`);
}
// formats
ok(D.parseFormat('vertical') === '9:16' && D.parseFormat('16x9') === '16:9' && D.parseFormat('square') === '1:1' && D.parseFormat('nope') === null, 'parseFormat');

// music: cuts on the bars of a 120 bpm song (a bar = 2 s)
{
  const beats = Array.from({ length: 64 }, (_, i) => 0.5 + i * 0.5);
  const p = D.makePlan({ template: 'product-intro', secs: 20 });
  const f = D.fitToMusic(p.beats, { bpm: 120, beats, drops: [8.5] }, 'bars');
  let t = 0;
  for (const b of f.beats) { t += b.secs; ok(near((t / 2) % 1, 0, 0.01) || near((t / 2) % 1, 1, 0.01), `cut at ${t} on a bar`); }
  ok(f.start === 0.5, 'the song starts at its first beat');
  const d = D.fitToMusic(p.beats, { bpm: 120, beats, drops: [8.5] }, 'drop');
  ok(near(d.beats[0].secs, 8), `drop mode: the hook lasts until the drop (${d.beats[0].secs})`);
  const free = D.fitToMusic(p.beats, { bpm: 120, beats }, 'free');
  ok(free.beats.every((b, i) => b.secs === p.beats[i].secs), 'free mode keeps the lengths');
  const half = D.fitToMusic(p.beats, { bpm: 120, beats }, 'beats');
  ok(half.beats.every((b) => near((b.secs * 2) % 1, 0, 0.01) || near((b.secs * 2) % 1, 1, 0.01)), 'beats mode: whole beats');
}
// cut-downs
{
  const p = D.makePlan({ template: 'feature-tour', secs: 30 });
  for (const s of [15, 6, 3]) {
    const c = D.cutDown(p, s);
    ok(near(D.total(c), s, 0.05) || c.beats.length * 0.6 > s, `cut ${s}s → ${D.total(c)}`);
    ok(c.beats[0].from === p.beats[0].id && c.beats.at(-1).from === p.beats.at(-1).id, `cut ${s}s keeps the hook and the end`);
    ok(c.beats.length <= Math.max(2, Math.floor(s / 1.5)), `cut ${s}s has room (${c.beats.length} beats)`);
  }
}
// words
ok(D.fill('Meet {name}. {n:commands} commands', { name: 'Hearth', counts }) === 'Meet Hearth. 860 commands', 'fill');
ok(D.featureLines(counts).includes('860 chat commands'), 'feature lines from the counts');
ok(D.copyFor('lab', 7).length > 3 && D.copyFor('nowhere', 0).length > 3, 'copyFor wraps and falls back');
{
  const p = D.makePlan({ template: 'stat-hype', counts });
  ok(p.beats[0].words === '860' && /chat commands/.test(p.beats[0].sub), `stat beat: ${p.beats[0].words} / ${p.beats[0].sub}`);
}
// Astra's replies
{
  const d = D.parseDecision('template: launch\nhook: "Two AIs. One window."\nend: out now\ntitles: forge\ncuts: bold\nlength: 15 s\nformats: 9:16, 1:1');
  ok(d.template === 'launch' && d.hook === 'Two AIs. One window.' && d.end === 'out now' && d.titles === 'forge' && d.trans === 'bold' && d.secs === 15 && d.formats.join() === '9:16,1:1', `parseDecision ${JSON.stringify(d)}`);
  ok(Object.keys(D.parseDecision('I think the launch template is best')).length === 0, 'parseDecision ignores prose');
  const p = D.makePlan({ template: 'kinetic' });
  const w = D.parseWords('1 | One window.\n2: Two minds\n9 | nope', p.beats);
  ok(w[1] === 'One window.' && w[2] === 'Two minds' && !w[9], `parseWords ${JSON.stringify(w)}`);
  const notes = D.parseNotes('0:01 | Push the contrast\n0:12.5 | Cut the grain\nnot a note');
  ok(notes.length === 2 && notes[1].t === 12.5, `parseNotes ${JSON.stringify(notes)}`);
}
// covers
ok(D.coverScore({ black: true }) < 0, 'black frames never win');
ok(D.coverScore({ luma: 0.45, contrast: 0.5, sat: 0.6, words: true }) > D.coverScore({ luma: 0.9, contrast: 0.05, sat: 0.05 }), 'contrast and color win');
ok(D.coverScore({ luma: 0.4, contrast: 0.3, sat: 0.3, kind: 'lab' }, 'lab') > D.coverScore({ luma: 0.4, contrast: 0.6, sat: 0.6, kind: 'tour' }, 'lab'), 'lab mode prefers Lab frames');
// vibe → style
{
  const dark = D.vibeStyle({ palette: [{ hex: '#0b0f1a', share: 0.6 }, { hex: '#ff2e88', share: 0.2 }, { hex: '#2de2e6', share: 0.2 }], light: 0.2, contrast: 0.6, sat: 0.7, warmth: 0, motion: 0.8 });
  ok(dark.trans === 'hype' && dark.grade === 'cyberpunk' && ['#ff2e88', '#2de2e6'].includes(dark.accent) && dark.backdrop === '#0b0f1a', `dark neon vibe ${JSON.stringify(dark)}`);
  const airy = D.vibeStyle({ palette: [{ hex: '#f2e8dc', share: 1 }], light: 0.8, sat: 0.2, warmth: 0.3, motion: 0.1 });
  ok(airy.grade === 'airy' && airy.titles === 'minimal' && airy.trans === 'soft', `airy vibe ${JSON.stringify(airy)}`);
  ok(D.vibeStyle(null).trans === null, 'no vibe: the template decides');
  const idea = D.sceneIdea({ scene: 'a bold opening', secs: 3 }, { palette: ['#ff2e88', '#2de2e6'], moods: ['neon', 'night'] });
  ok(idea.length <= 200 && /neon/.test(idea) && /#ff2e88/.test(idea), `sceneIdea ${idea}`);
}
// plan edits
{
  const p = D.makePlan({ template: 'product-intro' });
  const r = D.retime(p, 12);
  ok(near(D.total(r), 12), 'retime');
  const s = D.swapKind(p.beats[1], 'tour');
  ok(s.kind === 'tour' && s.area === 'chats', 'swapKind');
  ok(D.starts([{ secs: 2 }, { secs: 3 }, { secs: 2 }], 0.4).join() === '0,1.6,4.2', `starts ${D.starts([{ secs: 2 }, { secs: 3 }, { secs: 2 }], 0.4)}`);
  ok(D.planText(p).split('\n').length === p.beats.length + 1, 'planText');
  ok(D.findTemplate('teaser').id === 'teaser' && D.findTemplate('Product intro').id === 'product-intro' && D.findTemplate('loop').id === 'loop', 'findTemplate');
  ok(D.slug('Hearth intro · 20 s!') === 'hearth-intro-20-s', `slug ${D.slug('Hearth intro · 20 s!')}`);
}
console.log(`intro-test: ${n} checks passed (${D.TEMPLATES.length} templates, ${D.RECIPES.length} recipes, ${D.TRANSITION_SETS.length} cut sets, ${D.TITLE_LOOKS.length} title looks).`);
