/* (round 61, presethover61) Preset hover: the pure part. Which of the open Serum 2 / Vital's real parameters a request
   needs (grouped by section, capped), the short prompt for a toolless helper, reading its JSON patch back, validating it
   against the real list, and the undo / redo steps. No DOM, no hub: node dev/presethover61-test.js runs it. */
(function(root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.PresetHoverCore = api; })(globalThis, () => {
  const CAP = 48, MAX_SET = 40, MAX_CHOICES = 8;
  // Sections by the words in a parameter's key / label: its own section name first (osc / filter / env / lfo / an effect),
  // then what it controls (a "drive" alone is distortion, "filter 1 drive" stays filter); a request's words wake sections.
  const NAMES = [
    ['osc', /\b(osc|oscillator|wavetable|wt|sub|noise|sample)\b/], ['filter', /\b(filter|flt)\b/], ['env', /\b(env|envelope|adsr)\b/],
    ['lfo', /\b(lfo)\b/], ['mod', /\b(macro|mod|modulation)\b/], ['reverb', /\b(reverb|verb)\b/], ['delay', /\b(delay|echo)\b/],
    ['chorus', /\b(chorus|flanger|phaser|ensemble)\b/], ['dist', /\b(distortion|dist|overdrive|bitcrush|crush)\b/], ['eq', /\b(eq|equalizer)\b/],
    ['comp', /\b(compressor|comp|ott|multiband)\b/],
  ];
  const ATTRS = [
    ['osc', /\b(wave|unison|detune|voices|spread|warp|phase|pitch|transpose|tune|octave|semi|fine|blend|stack)\b/],
    ['filter', /\b(cutoff|cut|resonance|res|reso|keytrack|formant|comb)\b/],
    ['env', /\b(attack|decay|sustain|release|hold)\b/],
    ['lfo', /\b(rate|tempo|sync|wobble)\b/],
    ['reverb', /\b(room|hall|space|dampen|damping|predelay)\b/],
    ['delay', /\b(feedback|ping|pong)\b/],
    ['chorus', /\b(width|stereo)\b/],
    ['dist', /\b(drive|saturat\w*|fold|grit)\b/],
    ['comp', /\b(threshold|ratio)\b/],
    ['master', /\b(master|volume|gain|output|polyphony|legato|glide|portamento|porta|voice|level)\b/],
  ];
  // Plain-language words → the sections they mean (a "dark reese" is detuned oscillators + a low cutoff + movement…)
  const WORDS = [
    [/\b(bass|sub|low|deep|808|reese)\b/, ['osc', 'filter', 'env', 'master', 'dist']],
    [/\b(reese|detun\w*|unison|supersaw|wide|width|stereo|thick|fat|huge)\b/, ['osc', 'chorus']],
    [/\b(dark|darker|bright|brighter|dull|warm|warmer|muffled|open|closed|airy|harsh|soft|softer|mellow|sharp)\b/, ['filter', 'eq']],
    [/\b(mov\w*|slow|fast|evolv\w*|wobbl\w*|wub|sweep\w*|pulsing|pulse|animated|motion|breath\w*|modulat\w*|lfo)\b/, ['lfo', 'mod', 'filter']],
    [/\b(pluck\w*|short|long|stab|snappy|punch\w*|attack|release|decay|sustain|swell\w*|fade)\b/, ['env']],
    [/\b(pad|pads|ambient|lush|atmos\w*|drone|cinematic)\b/, ['env', 'reverb', 'chorus', 'osc', 'filter']],
    [/\b(lead|leads|keys|piano|bell|bells|arp)\b/, ['osc', 'env', 'filter', 'delay']],
    [/\b(reverb|verb|space|spacious|room|hall|wet|dry|distant|far|close)\b/, ['reverb']],
    [/\b(delay|echo|echoes|ping|pong)\b/, ['delay']],
    [/\b(chorus|flang\w*|phas\w*|shimmer)\b/, ['chorus']],
    [/\b(dirty|distort\w*|drive|gritty|grit|crunch\w*|saturat\w*|aggressive|growl\w*|harsh|clean|cleaner)\b/, ['dist', 'filter']],
    [/\b(loud|louder|quiet|quieter|volume|level|gain)\b/, ['master']],
    [/\b(glide|portamento|legato|mono|poly)\b/, ['master']],
  ];
  const lower = s => String(s || '').toLowerCase().replace(/[_./-]+/g, ' ');
  function sectionOf(p) { const t = lower(`${p.key} ${p.label}`); for (const [name, re] of [...NAMES, ...ATTRS]) if (re.test(t)) return name; return 'other'; }
  // Controls an AI shouldn't touch from words: MIDI CC lanes, the mod matrix's hundreds of slots, preset / bypass plumbing
  const SKIP = /\b(midi|cc ?\d+|program|preset|bypass|mpe|pitch ?wheel|mod ?wheel|aftertouch|mod ?matrix|matrix|slot ?\d|modulation ?\d+ ?(amount|bipolar|bypass|power|stereo)|random ?seed|view|zoom|oversampl\w*|quality)\b/;
  const usable = p => p && typeof p.key === 'string' && !SKIP.test(lower(`${p.key} ${p.label}`)) && (typeof p.value === 'boolean' || (typeof p.value === 'number' && Number.isFinite(p.min) && Number.isFinite(p.max) && p.max > p.min) || (typeof p.value === 'string' && Array.isArray(p.choices) && p.choices.length > 1 && p.choices.length <= MAX_CHOICES));
  const terms = text => lower(text).split(/[^a-z0-9]+/).filter(w => w.length > 2);
  // The parameters a request needs: sections its words wake (plus what earlier steps touched), the parameters whose
  // names share its words, the first oscillator / filter / envelope first. Capped (CAP): never the whole list.
  function pick(parameters, request, { touched = [], cap = CAP } = {}) {
    const text = lower(request), words = terms(request), wanted = new Map();
    WORDS.forEach(([re, secs], i) => { if (re.test(text)) secs.forEach((s, j) => wanted.set(s, Math.max(wanted.get(s) || 0, 10 - j - i * .01))); });
    if (!wanted.size) ['osc', 'filter', 'env', 'master'].forEach((s, i) => wanted.set(s, 6 - i));
    const touch = new Set(touched);
    const scored = parameters.filter(usable).map((p, i) => {
      const name = lower(`${p.key} ${p.label}`), sec = sectionOf(p);
      let score = wanted.get(sec) || 0;
      for (const w of words) if (name.includes(w)) score += 6;
      if (touch.has(p.key)) score += 30;
      if (score <= 0) return null;
      // the first unit of a kind first (osc 1 / filter 1 / env 1 / lfo 1), later ones a little less
      const n = Number((name.match(/\b(\d)\b/) || [])[1] || 1); score -= (n - 1) * 1.5;
      if (/\b(level|cutoff|resonance|attack|release|decay|sustain|detune|unison|voices|rate|frequency|mix|dry ?wet|amount|drive|size|volume)\b/.test(name)) score += 2;
      return { p, score, sec, i };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, cap);
    // grouped by section, in the plugin's own order inside each
    const groups = {};
    scored.sort((a, b) => a.i - b.i).forEach(s => (groups[s.sec] ||= []).push(s.p));
    return { groups, count: scored.length, of: parameters.length };
  }
  const num = v => { const r = Math.abs(v) >= 100 ? Math.round(v) : +v.toPrecision(3); return String(r); };
  // One short line per parameter: key=now [min..max] (shown value) — {a|b|c} for choices, on|off for switches.
  function line(p) {
    if (typeof p.value === 'boolean') return `${p.key}=${p.value ? 1 : 0} (switch)`;
    if (typeof p.value === 'string') return `${p.key}=${p.value} {${p.choices.join('|')}}`;
    const shown = p.display && String(p.display) !== String(p.value) && String(p.display).length <= 12 ? ` ${p.display}` : '';
    const label = lower(p.label).replace(/\s*\(0–1\)/, '');
    const hint = label && !lower(p.key).includes(label.split(' ')[0]) ? ` "${label.slice(0, 24)}"` : '';
    return `${p.key}=${num(p.value)} [${num(p.min)}..${num(p.max)}]${shown}${hint}`;
  }
  const PERSONA = 'You are a synth sound designer. You set the listed parameters of a software synth to match the request. Reply with one JSON object only, no prose, no code fence. No tools.';
  // The helper's one message. `steps`: earlier requests in this preset (newest last), so "brighter" has its context.
  function prompt({ instrument, request, groups, steps = [] }) {
    const lines = [`PATCH FOR ${instrument}`, `Request: ${String(request).slice(0, 300)}`];
    const earlier = steps.slice(-3).map(s => `"${String(s.request).slice(0, 80)}"`);
    if (earlier.length) lines.push(`Earlier (already applied, values below are current): ${earlier.join(', ')}`);
    lines.push('Params (key=now [min..max]):');
    for (const [sec, list] of Object.entries(groups)) { lines.push(`# ${sec}`); list.forEach(p => lines.push(line(p))); }
    lines.push(`Reply: {"set":{"key":value,…},"name":"2-4 word preset name","say":"one short line"}. Only listed keys, within range, at most ${MAX_SET} changes; change only what the request needs.`);
    return lines.join('\n');
  }
  // The reply's JSON: the first {...} object, code fences or a sentence around it allowed. {"set":{…}} or a flat object.
  function parse(text) {
    const s = String(text || '').replace(/```(?:json)?/gi, '');
    const start = s.indexOf('{'); if (start < 0) throw Error('The AI answered without a patch. Try again or reword it.');
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < s.length; i++) { const c = s[i]; if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { end = i; break; } }
    if (end < 0) throw Error('The AI’s patch was cut off. Try again.');
    let o; try { o = JSON.parse(s.slice(start, end + 1)); } catch { throw Error('The AI’s patch wasn’t valid JSON. Try again.'); }
    const set = o && typeof o.set === 'object' && !Array.isArray(o.set) ? o.set : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !['name', 'say', 'set'].includes(k))) : {};
    return { set, name: typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '', say: typeof o.say === 'string' ? o.say.trim().slice(0, 160) : '' };
  }
  // Checks a patch against the plugin's real parameter list. Unknown keys and impossible values are rejected (listed in
  // `rejected`); numbers a little out of range are clamped (listed in `clamped`); unchanged values dropped. `values` is
  // ready for the host (whose own check is strict: in range, normalized 0–1 where it says so).
  function validate(parameters, set, { max = MAX_SET } = {}) {
    const byKey = new Map(parameters.map(p => [p.key, p])), values = {}, rejected = [], clamped = [];
    if (!set || typeof set !== 'object' || Array.isArray(set)) return { values, rejected: [{ key: '(patch)', why: 'not an object' }], clamped };
    for (const [key, raw] of Object.entries(set)) {
      const p = byKey.get(key);
      if (!p) { rejected.push({ key, why: 'unknown parameter' }); continue; }
      if (Object.keys(values).length >= max) { rejected.push({ key, why: `over ${max} changes` }); continue; }
      let v = raw;
      if (typeof p.value === 'boolean') {
        if (v === 1 || v === 0 || v === '1' || v === '0' || v === 'on' || v === 'off') v = v === 1 || v === '1' || v === 'on';
        if (typeof v !== 'boolean') { rejected.push({ key, why: 'expected on/off' }); continue; }
      } else if (typeof p.value === 'number') {
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v)) v = +v;
        if (typeof v !== 'number' || !Number.isFinite(v)) { rejected.push({ key, why: 'not a number' }); continue; }
        const span = p.max - p.min;
        // far outside (a value in Hz for a 0–1 control, say): the AI misread the scale, so don't guess
        if (v < p.min - span * .25 || v > p.max + span * .25) { rejected.push({ key, why: `outside ${num(p.min)}–${num(p.max)}` }); continue; }
        if (v < p.min || v > p.max) { v = Math.min(p.max, Math.max(p.min, v)); clamped.push(key); }
        if (p.step && p.step >= 1) v = Math.min(p.max, Math.max(p.min, p.min + Math.round((v - p.min) / p.step) * p.step));
      } else {
        const hit = (p.choices || []).find(c => String(c).toLowerCase() === String(v).toLowerCase());
        if (hit == null) { rejected.push({ key, why: 'not one of its choices' }); continue; }
        v = hit;
      }
      if (v === p.value) continue;
      values[key] = v;
    }
    return { values, rejected, clamped };
  }
  // Undo / redo of applied steps: each step keeps the values it changed, before and after.
  function history() {
    const steps = []; let at = 0;
    return {
      push(step) { steps.splice(at); steps.push(step); at = steps.length; return step; },
      undo() { return at > 0 ? steps[--at] : null; },
      redo() { return at < steps.length ? steps[at++] : null; },
      get canUndo() { return at > 0; }, get canRedo() { return at < steps.length; },
      applied: () => steps.slice(0, at), all: () => steps.slice(), clear() { steps.length = 0; at = 0; },
    };
  }
  const before = (parameters, values) => Object.fromEntries(Object.keys(values).map(k => [k, parameters.find(p => p.key === k)?.value]));
  // rough token count of a text (≈ 3 characters a token for key=number lines): the cost line before a send
  const tokens = text => Math.ceil(String(text).length / 3);
  // (round 64, vstembed64) the one line the window shows for a change (the owner's words, never control names / values):
  // "darker and slower" → "Darker and slower — applied"
  function summary(request, max = 48) {
    let t = String(request || '').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '');
    if (t.length > max) t = `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
    return (t ? t[0].toUpperCase() + t.slice(1) : 'Your sound') + ' — applied';
  }
  return { pick, line, prompt, parse, validate, history, before, tokens, sectionOf, usable, summary, PERSONA, CAP, MAX_SET };
});
