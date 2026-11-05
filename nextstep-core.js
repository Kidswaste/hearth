// (round 129, next129) "Next: <step>": the one small chip under a director's finished reply, the pure part (loads in
// Node too). Where the step comes from, in this order, with no AI call of its own:
//   1. the project brief's next unticked step (ProjectBrief.get(id): steps / done)
//   2. the reply's own <suggest> buttons (native.js keeps them as m.suggest; a "/command" one is skipped)
//   3. a cheap local rule from the scene and the chat: a song but no layer keyed to it → "Key the main layer to the
//      drop"; an edit with no look at the screen since → "Check it on screen"
// The window side is nextstep.js (lazy group "nextstep"); docs/upgrades/next129.md.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.NextStepCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const MAX = 70;
  const RULES = { drop: 'Key the main layer to the drop', look: 'Check it on screen' };
  // a step made short enough for a chip (whole words, one line)
  function short(text, n = MAX) {
    const s = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1); const sp = cut.lastIndexOf(' ');
    return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[.,;:–-]+$/, '')}…`;
  }
  // the brief's next step not ticked yet → { text, index } | null
  function fromBrief(brief) {
    const steps = Array.isArray(brief?.steps) ? brief.steps : [];
    const done = new Set(Array.isArray(brief?.done) ? brief.done : []);
    const i = steps.findIndex((s, k) => !done.has(k) && String(s || '').trim());
    return i < 0 ? null : { text: String(steps[i]).trim(), index: i };
  }
  const fromSuggest = (list) => (Array.isArray(list) ? list.map((s) => String(s || '').trim()).find((s) => s && !s.startsWith('/')) : null) || null;

  // ---------- the local rules ----------
  const AUDIO_CODE = /\baudio\s*\.|\b(?:uBeat|uLevel|uBass|uKick|uHats|bassFlow)\b|\b(?:bass|kick|snare|beat|onset|energy|fft|spectrum)\s*[*+\-/)<>=]/;
  const nonEmpty = (o) => Boolean(o && typeof o === 'object' && Object.keys(o).length);
  // a layer follows the music: a ♪ link on one of its sliders, a keyframe, or its code reads the sound
  // scene: { song, layers: [{ id, code, keys }], extras: { bindings, layers: { id: { bindings } } } }
  function keyed(scene) {
    const ex = scene?.extras || {};
    if (nonEmpty(ex.bindings)) return true;
    for (const v of Object.values(ex.layers || {})) if (nonEmpty(v?.bindings)) return true;
    for (const L of scene?.layers || []) {
      if (L?.keys && Object.values(L.keys).some((k) => Array.isArray(k) && k.length)) return true;
      if (AUDIO_CODE.test(String(L?.code || ''))) return true;
    }
    return false;
  }
  // the chat's tool calls in order (oldest first): an edit with no look after it
  const EDIT = /three_(?:add_layer|edit_code|set_code|update_layer|remove_layer|keyframes|animate|timeline_edit|set_frame|new_sketch|triggers|comp|motion|model|footage|nodes|looks|load_media|run)\b/;
  const LOOK = /three_(?:screenshot|contact_sheet)\b|capture_(?:shot|frames)\b/;
  function unchecked(tools) {
    let edit = -1; let look = -1;
    (tools || []).forEach((t, i) => { const n = String(t || ''); if (LOOK.test(n)) look = i; else if (EDIT.test(n)) edit = i; });
    return edit >= 0 && edit > look;
  }
  function fromRules({ scene = null, tools = [] } = {}) {
    if (scene?.song && (scene.layers || []).length && !keyed(scene)) return RULES.drop;
    if (unchecked(tools)) return RULES.look;
    return null;
  }

  // → { text (the chip's words), full (what is sent), from: 'brief' | 'suggest' | 'rule', index } | null
  function pick({ brief = null, suggest = null, scene = null, tools = [] } = {}) {
    const b = fromBrief(brief);
    if (b) return { text: short(b.text), full: b.text, from: 'brief', index: b.index };
    const s = fromSuggest(suggest);
    if (s) return { text: short(s), full: s, from: 'suggest' };
    const r = fromRules({ scene, tools });
    return r ? { text: r, full: r, from: 'rule' } : null;
  }
  // the tool names of a chat's replies, oldest first (the last `n` messages)
  const toolsOf = (messages, n = 40) => (messages || []).slice(-n).flatMap((m) => (m?.role === 'assistant' && Array.isArray(m.tools) ? m.tools : []));
  return { pick, short, fromBrief, fromSuggest, fromRules, keyed, unchecked, toolsOf, RULES, MAX };
});
