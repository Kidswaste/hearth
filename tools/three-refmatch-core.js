// ✦ Make a layer like this (round 131, refmatch131): the pure part (loads in Node). docs/upgrades/refmatch131.md
// A reference picture (a Lab reference, a moodboard picture, a file) → ONE new layer in its spirit, built by the Lab's
// director (Claude or Astra) with its usual tools, tweak() sliders for the key parameters. The palette is read from the
// picture here (Kit.paletteFromImage); the project's palette wins when the owner ticks it. Nothing here talks to an AI.
//   name(title)                         → the new layer's name ("Like <title>")
//   pickPalette({ picture, project, useProject }) → { colors, from: 'picture' | 'project' }
//   message({ title, name, palette, from, words, usePicture, refKey, note }) → the one message the director gets
//   again(dir, { name, title, palette, picture })   → the "closer / looser" follow-up message
//   toolBrief({ title, name, palette, words, refKey }) → three_do references {action: "like"}'s words (with the picture)
//   picTokens({ w, h }) · estimate({ base, pic, chars, again }) · costLine(est, who, model, pic)
//   added(before, after) → the layers the reply added (by id) · parse(args) → /like's arguments
const RefMatchCore = (() => {
  const HEAD = '✦ Make a layer like this';
  const AGAIN = { closer: '✦ Closer to the picture', looser: '✦ Looser, freer from the picture' };
  const MAX_PIC = 512; // px, the longest side of the picture the AI gets
  const clean = (s, n = 40) => String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^\d{10,}-/, '').replace(/[\r\n"`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const hexes = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().toLowerCase()).map((c) => (/^#?[0-9a-f]{6}$/.test(c) ? `#${c.replace('#', '')}` : '')).filter(Boolean))].slice(0, 6);

  function name(title) { return `Like ${clean(title, 26) || 'the picture'}`; }

  // the picture's colors (read here) unless the owner ticked "the project's palette"
  function pickPalette({ picture = [], project = [], useProject = false } = {}) {
    const pic = hexes(picture); const proj = hexes(project);
    return useProject && proj.length ? { colors: proj, from: 'project' } : { colors: pic, from: 'picture' };
  }

  // The one message (≈ 170 tokens + the owner's note). The director keeps its own guide and tools; this says what to
  // study, what to build (one layer, its name, sliders), the palette, and what not to do (copy the picture in).
  function message({ title = '', name: nm = '', palette = [], from = 'picture', words = [], usePicture = false, refKey = '', note = '' } = {}) {
    const t = clean(title, 60) || 'the picture';
    const n = nm || name(title);
    const pal = hexes(palette);
    return [
      `${HEAD}: "${t}" (the attached picture).`,
      'Study it first: composition, shapes, motion cues, palette, texture, light.',
      `Then build ONE new layer named "${n}" in its spirit (three_add_layer, a complete module) with what the Lab has. Leave every other layer as it is.`,
      pal.length ? `Palette: ${pal.join(' ')} (${from === 'project' ? 'the project\'s palette: the owner chose it over the picture\'s' : 'read from the picture'}; use these colors).` : '',
      words.length ? `Its look, measured here: ${words.slice(0, 6).join(' · ')}.` : '',
      'Give it tweak() sliders for the key parameters (its colors, size or density, speed, glow or contrast) so the owner can tune it.',
      usePicture && refKey ? `The owner wants the picture itself in it: use refTexture('${refKey}').` : 'Don\'t put the picture itself in the scene (no refTexture of it): borrow its feel.',
      'Then one small screenshot to check, and one line saying what you took from it.',
      note ? `The owner adds: ${clean(note, 300)}` : '',
    ].filter(Boolean).join('\n');
  }

  // one more pass on the same layer: closer to the picture, or freer from it
  function again(dir, { name: nm = '', title = '', palette = [], picture = false } = {}) {
    const closer = dir === 'closer';
    const n = nm || name(title);
    return [
      `${AGAIN[closer ? 'closer' : 'looser']}: rework the layer "${n}" only (three_update_layer or three_edit_code on it); keep its name and its sliders.`,
      closer
        ? `Follow "${clean(title, 60) || 'the picture'}" more closely: its composition, shapes, proportions and light${picture ? ' (the picture is attached again)' : ''}.`
        : `Take more freedom from "${clean(title, 60) || 'the picture'}": keep its mood and palette, push the shapes and motion your own way.`,
      hexes(palette).length ? `Palette: ${hexes(palette).join(' ')}.` : '',
      'Then one small screenshot, and one line on what changed.',
    ].filter(Boolean).join('\n');
  }

  // three_do references {action: "like", name}: what the director gets with the picture (it asked for it itself)
  function toolBrief({ title = '', name: nm = '', palette = [], words = [], refKey = '' } = {}) {
    const n = nm || name(title);
    return [
      'The picture is attached. Study its composition, shapes, motion cues, palette, texture and light.',
      `Build ONE new layer "${n}" in its spirit (three_add_layer) with tweak() sliders for the key parameters; other layers stay.`,
      hexes(palette).length ? `Palette read from it: ${hexes(palette).join(' ')}.` : '',
      words.length ? `Its look: ${words.slice(0, 6).join(' · ')}.` : '',
      refKey ? `Don't put the picture itself in the scene (refTexture('${refKey}')) unless the owner asked.` : '',
    ].filter(Boolean).join('\n');
  }

  // ---------- cost ----------
  // the picture as the AI gets it: ≤ 512 px on its longest side, ≈ w·h / 750 tokens
  function picSize({ w = 0, h = 0 } = {}) {
    const k = Math.min(1, MAX_PIC / Math.max(1, w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  const picTokens = (dims) => { if (!dims?.w || !dims?.h) return 0; const s = picSize(dims); return Math.ceil((s.w * s.h) / 750); };
  // one director reply: ≈ 4 trips (look, add the layer, screenshot, a fix or the last line); each re-reads the fixed part,
  // the picture and the message (from the cache after the first); a follow-up pass is ≈ 3 trips, the picture again or not
  function estimate({ base = 9000, pic = null, chars = 900, again: isAgain = false } = {}) {
    const trips = isAgain ? 3 : 4;
    const per = Math.max(0, base) + picTokens(pic) + Math.ceil(chars / 3.6);
    const input = Math.round(trips * per + 450 * (trips * (trips - 1)) / 2);
    const output = isAgain ? 1500 : 2200;
    return { trips, input, output, pic: picTokens(pic) };
  }
  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude', model = '', pic = true) => `About ${kfmt(c.input)} tokens in (${pic ? '1 picture, ' : ''}most re-read from the cache) and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''}`;

  // the layers a reply added: in after, not in before (by id)
  function added(before, after) {
    const had = new Set((before?.layers || []).map((L) => L.id));
    return (after?.layers || []).filter((L) => !had.has(L.id));
  }

  // /like <ref name | file path> · /like closer | looser | undo | status | (nothing: pick a picture)
  function parse(args) {
    const a = String(args || '').trim();
    const w = a.split(/\s+/)[0].toLowerCase();
    if (!a) return { op: 'pick' };
    if (['closer', 'looser', 'undo', 'status', 'go', 'cancel'].includes(w) && a.split(/\s+/).length === 1) return { op: w };
    if (/^(["']?)([a-z]:[\\/]|[\\/]|~[\\/])/i.test(a) || /\.(png|jpe?g|webp|gif|bmp|avif)["']?$/i.test(a)) return { op: 'file', path: a.replace(/^["']|["']$/g, '') };
    return { op: 'ref', name: a.replace(/^["']|["']$/g, '') };
  }

  const api = { HEAD, AGAIN, MAX_PIC, name, pickPalette, message, again, toolBrief, picSize, picTokens, estimate, costLine, added, parse, hexes };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
