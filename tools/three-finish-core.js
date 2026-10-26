// ⚑ Finish line (round 67, finishlines67): the pure part (UMD: the window loads it with tools/three-finish.js, Node
// tests require it: node dev/finishline-test.js). A Lab scene gets a size (10 s / 30 s / full), a short "done when"
// checklist that starts from that size's defaults, and "Polish this": the unticked lines (or, when every line is
// ticked, a short look at the scene) turned into exactly three small, concrete steps, as a side quest for the quest
// journal (QuestCore's side-quest shape) with the same three steps for the step-by-step guide. No model call: 0 tokens.
// State per scene (ThreeLab.scenes extras, key `finish`): { v: 1, size, items: [{ id, text, done }], custom, quest, doneAt }
(function (root, make) { const api = make(); if (typeof module === 'object' && module.exports) module.exports = api; else root.FinishCore = api; })(typeof self !== 'undefined' ? self : this, () => {
  const SIZES = [
    { id: '10s', label: '10 s', seconds: 10, title: 'A short loop or a moment: one idea, done well' },
    { id: '30s', label: '30 s', seconds: 30, title: 'A short piece with a start, a middle and an end' },
    { id: 'full', label: 'Full', seconds: null, title: 'The whole song or the whole timeline' },
  ];
  const DEFAULTS = {
    '10s': ['One clear idea', 'Loops cleanly', 'Sound fits'],
    '30s': ['A clear start, middle and end', 'One moment that surprises', 'Sound fits the cuts', 'Nothing looks broken at full size'],
    full: ['Strong first 5 seconds', 'Changes with each part of the song', 'Ends on purpose, not just stops', 'Sound and picture stay together', 'Looks right at the size you’ll post'],
  };
  const MAX_ITEMS = 8, MAX_TEXT = 80;
  const cap = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const sizeOf = (id) => SIZES.find((s) => s.id === id) || null;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // short stable ids (the journal's ids are lower-case letters, digits and dashes)
  function hash(v) { let a = 2166136261, b = 5381; for (const c of String(v)) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); } return (a >>> 0).toString(36) + (b >>> 0).toString(36); }
  let seq = 0;
  const itemId = (text) => `i${hash(`${text}|${Date.now()}|${++seq}`).slice(0, 8)}`;
  const items = (size) => (DEFAULTS[size] || []).map((text, i) => ({ id: `d${i}`, text, done: false }));

  // anything read back from the extras file: kept when it makes sense, never thrown on
  function normalize(raw) {
    const st = { v: 1, size: null, items: [], custom: false, quest: null, doneAt: null };
    if (!raw || typeof raw !== 'object') return st;
    if (sizeOf(raw.size)) st.size = raw.size;
    const seen = new Set();
    for (const it of Array.isArray(raw.items) ? raw.items : []) {
      const text = cap(it?.text, MAX_TEXT);
      let id = cap(it?.id, 24) || itemId(text);
      if (!text) continue;
      if (seen.has(id)) id = itemId(text);
      seen.add(id);
      st.items.push({ id, text, done: it.done === true });
      if (st.items.length >= MAX_ITEMS) break;
    }
    st.custom = raw.custom === true;
    if (raw.quest && typeof raw.quest === 'object' && /^q-finish-[a-z0-9-]+$/.test(raw.quest.id || '')) st.quest = { id: raw.quest.id, title: cap(raw.quest.title, 250), at: Number(raw.quest.at) || 0 };
    if (Number(raw.doneAt) > 0) st.doneAt = Number(raw.doneAt);
    return st;
  }
  // a size picked: untouched default lines follow the size (ticks kept on lines both sizes share); edited ones stay
  function setSize(st0, size) {
    const st = normalize(st0);
    if (!sizeOf(size)) return st;
    st.size = size;
    if (!st.custom || !st.items.length) {
      const was = new Map(st.items.map((x) => [x.text.toLowerCase(), x.done]));
      st.items = items(size).map((x) => ({ ...x, done: was.get(x.text.toLowerCase()) === true }));
      st.custom = false;
    }
    return stamp(st);
  }
  function stamp(st) {
    const p = progress(st);
    if (p.finished && !st.doneAt) st.doneAt = Date.now();
    if (!p.finished) st.doneAt = null;
    return st;
  }
  const edit = (st0, fn) => { const st = normalize(st0); fn(st); return stamp(st); };
  const toggle = (st0, id, on = null) => edit(st0, (st) => { const x = st.items.find((y) => y.id === id); if (x) x.done = on == null ? !x.done : Boolean(on); });
  const rename = (st0, id, text) => edit(st0, (st) => { const x = st.items.find((y) => y.id === id); const t = cap(text, MAX_TEXT); if (x && t && t !== x.text) { x.text = t; st.custom = true; } });
  const add = (st0, text) => edit(st0, (st) => { const t = cap(text, MAX_TEXT); if (t && st.items.length < MAX_ITEMS) { st.items.push({ id: itemId(t), text: t, done: false }); st.custom = true; } });
  const remove = (st0, id) => edit(st0, (st) => { const n = st.items.length; st.items = st.items.filter((x) => x.id !== id); if (st.items.length !== n) st.custom = true; });
  const reset = (st0) => { const st = normalize(st0); st.custom = false; st.items = []; return st.size ? setSize(st, st.size) : stamp(st); };
  function progress(st0) {
    const st = st0?.v === 1 ? st0 : normalize(st0);
    const total = st.items.length, done = st.items.filter((x) => x.done).length;
    return { done, total, left: total - done, finished: Boolean(st.size) && total > 0 && done === total };
  }
  // the chip's words
  function chip(st0) {
    const st = normalize(st0);
    if (!st.size) return { text: '⚑ Finish line', title: 'Give this piece a size and a short "done when" list' };
    const p = progress(st), z = sizeOf(st.size);
    if (p.finished) return { text: `⚑ ${z.label} · done ✓`, title: 'Every line is ticked: this piece is finished. Click to record it.' };
    return { text: `⚑ ${z.label} · ${p.done}/${p.total}`, title: `${p.left} line${p.left === 1 ? '' : 's'} left before this piece is done` };
  }

  // ---------- Polish this: exactly three small steps ----------
  // a checklist line → one concrete step (what to do, in the Lab, and how to know it's true)
  // (first match wins: the more specific lines first)
  const RULES = [
    [/start.*end|beginning|shape|\barc\b/i, (t) => ({ title: 'Give it a shape', instruction: `Play it and mark three spots: where it starts, where it peaks, where it ends. Make the peak the biggest moment (more movement, light or sound) and the end calmer. Then tick “${t}”.` })],
    [/together|sync|timing/i, (t) => ({ title: 'Line up sound and picture', instruction: `Play the busiest part slowly. Move the one key or cut that lands off the beat onto it. Then tick “${t}”.` })],
    [/middle|part|section|change|surprise|moment/i, (t) => ({ title: 'Add one surprise', instruction: `Find the moment where it starts to feel the same. Change one thing there (a color, a camera move, a new layer coming in). Then tick “${t}”.` })],
    [/loop|seam|cycle/i, (t) => ({ title: 'Make the seam invisible', instruction: `Play the last second into the first a few times. Fix the one jump you notice (∞ Make it loop in the Lab checks the seam for you). Then tick “${t}”.` })],
    [/sound|music|audio|beat|song|cuts?\b/i, (t) => ({ title: 'Land one hit on the music', instruction: `Play it with the sound on. Pick the strongest beat and make one visible thing react to it (a slider on the beat, or a cut). Then tick “${t}”.` })],
    [/idea|focus|clear|simple/i, (t) => ({ title: 'Cut to the one idea', instruction: `Say the idea in five words. Hide the layer or effect that helps it least and watch again; keep it hidden if nothing is missing. Then tick “${t}”.` })],
    [/start|first|open/i, (t) => ({ title: 'Make the opening count', instruction: `Watch only the first 5 seconds. Make one thing happen sooner or bigger there (a reveal, a move, a color). Then tick “${t}”.` })],
    [/\bend|finish|stop|outro/i, (t) => ({ title: 'End it on purpose', instruction: `Watch the last 5 seconds. Add one ending move (a fade, a freeze, a final hit) so it stops on purpose. Then tick “${t}”.` })],
    [/size|broken|post|frame|look|sharp|blurr?y|cut off/i, (t) => ({ title: 'Check it at real size', instruction: `Switch the preview to the size you'll post (9:16, 16:9…) and play it once. Fix the one thing that is cut off, too small or blurry. Then tick “${t}”.` })],
  ];
  function stepFor(text) {
    const t = cap(text, MAX_TEXT);
    for (const [re, make] of RULES) if (re.test(t)) return make(t);
    return { title: cap(`Make “${t}” true`, 140), instruction: `Watch it once and decide what's missing for “${t}”. Change just that one thing, watch again, then tick “${t}”.` };
  }
  // a short look at the scene (every line ticked, or no list yet): what it has decides the words
  function lookSteps(info = {}) {
    const layers = (info.layers || []).map((x) => cap(x, 40)).filter(Boolean);
    const len = Number(info.seconds) || null;
    const watch = { title: 'Watch it through once', instruction: `Play it from the start${len ? ` (${Math.round(len)} s)` : ''} without touching anything. Write down the one moment that feels least finished.` };
    const change = layers.length > 1
      ? { title: 'Change only that moment', instruction: `Fix that moment with one change: one slider, one key or one layer (${layers.slice(0, 4).join(', ')}${layers.length > 4 ? '…' : ''}). Save. Leave everything else alone.` }
      : { title: 'Change only that moment', instruction: 'Fix that moment with one change: one slider or one key. Save. Leave everything else alone.' };
    const keep = { title: 'Record it and watch it back', instruction: `Record a short take (⏺ in the timeline, or Record it on the Finish line card) and watch it once at full size. Keep it if it's better.` };
    return [watch, change, keep];
  }
  // the three steps: unticked lines first (in their order), then the scene look fills what's left
  function polishSteps(st0, info = {}) {
    const st = normalize(st0);
    const open = st.items.filter((x) => !x.done);
    const steps = open.slice(0, 3).map((x) => ({ ...stepFor(x.text), item: x.id }));
    const used = new Set(steps.map((s) => s.title));
    for (const s of lookSteps(info)) { if (steps.length >= 3) break; if (!used.has(s.title)) { steps.push(s); used.add(s.title); } }
    return steps.slice(0, 3).map((s, i) => ({ id: `finish-${i + 1}`, title: cap(s.title, 140), instruction: cap(s.instruction, 1500), ...(s.item ? { item: s.item } : {}) }));
  }
  // a side quest for the quest journal (QuestCore.validate's side-quest rules) + the guide's steps
  function quest({ sceneId, sceneName, size, n = 1 }, steps) {
    const name = cap(sceneName, 60) || 'this scene';
    const z = sizeOf(size);
    const id = `q-finish-${hash(sceneId).slice(0, 10)}-${Math.max(1, Math.min(9999, Math.floor(n) || 1))}`;
    const list = steps.map((s, i) => `${i + 1}. ${s.title}`).join(' ');
    return {
      id, path: 'visual', tool: 'lab', minutes: 15, xp: 40,
      title: cap(`Polish ${name}${z ? ` (${z.label})` : ''}`, 250),
      done: cap(`Do three small things in ${name}: ${list}`, 1000),
      tiny: cap(steps[0]?.instruction || `Open ${name} in the Lab.`, 500),
      deep: 'Only after these three: tick the Finish line card again, or record it.',
      finishLine: { v: 1, sceneId: cap(sceneId, 100) },
      guideSteps: steps.map((s) => ({ id: s.id, title: s.title, instruction: `In the Lab, on “${name}”: ${s.instruction}`, check: 'manual', action: { type: 'hearth-tool', tool: 'lab' } })),
    };
  }
  // what the guide gets (window.hub.questGuide({ op: 'start', ... }))
  const guideStart = (q) => ({ op: 'start', questId: q.id, title: q.title, kind: 'custom', steps: clone(q.guideSteps) });
  const isOurs = (questId) => /^q-finish-[a-z0-9]+-\d+$/.test(String(questId || ''));

  return { SIZES, DEFAULTS, MAX_ITEMS, sizeOf, normalize, setSize, toggle, rename, add, remove, reset, progress, chip, stepFor, lookSteps, polishSteps, quest, guideStart, isOurs, hash };
});
