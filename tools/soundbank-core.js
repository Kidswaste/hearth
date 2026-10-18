// (round 63, soundbank63) Sound bank, the pure part (Node-testable: dev/soundbank63-test.js; also loaded in the window).
// Every Serum 2 / Vital preset the owner has gets local tags and a small "sound vector" made from its parameter values
// (filter cutoff, envelope times, unison, mono, effects…), so the picker can search words + tags and find "similar to
// this" by distance. No AI here: the optional "tag with AI" builds one tiny prompt per batch (aiPrompt / aiParse).
//   features(parameters)  the desk / host parameter list ({ key, label, value, min, max, display }) → features
//   vitalFeatures(json)   a Vital preset / state JSON ({ settings: {...}, preset_style }) → features
//   tagsOf({ name, folder, style, metaTags, features }) → ['bass', 'dark', 'mono', …] (the TAGS vocabulary)
//   vector(features) / distance(a, b) / similar(entry, entries, n)
//   search(entries, query) · serumMeta(bytes) (the JSON header of a .SerumPreset) · PREVIEW (the 3 s audition)
const SoundBankCore = (() => {
  const CATEGORIES = ['bass', 'lead', 'pad', 'pluck', 'keys', 'fx', 'seq', 'chord'];
  const TAGS = [...CATEGORIES, 'dark', 'bright', 'mono', 'poly', 'wide', 'wet', 'gritty', 'soft'];
  // the 3-second preview, rendered once offline: a C3 stab, then a C minor 7 chord with room for the release
  const PREVIEW = { duration: 3, notes: [{ note: 48, time: 0, length: .3 }, ...[48, 51, 55, 58].map(note => ({ note, time: .85, length: 1.45 }))] };
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // ---------- reading a parameter list ----------
  const norm = s => String(s || '').toLowerCase().replace(/[_\-/().]+/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim();
  function position(p) { // where the control sits in its range, 0–1
    const v = typeof p.value === 'boolean' ? (p.value ? 1 : 0) : num(p.value);
    if (v === null) { if (p.choices?.length > 1) { const i = p.choices.indexOf(p.value); return i < 0 ? null : i / (p.choices.length - 1); } return null; }
    const lo = num(p.min), hi = num(p.max);
    return lo !== null && hi !== null && hi > lo ? clamp((v - lo) / (hi - lo)) : clamp(v);
  }
  function seconds(p) { // envelope time in seconds: from the display's unit when there is one
    const d = String(p.display ?? '').toLowerCase(), m = d.match(/(-?[\d.]+)\s*(ms|msec|s|sec|secs|seconds)\b/);
    if (m) return Number(m[1]) / (m[2].startsWith('ms') ? 1000 : 1);
    const n = position(p); return n === null ? null : 8 * n ** 3; // no unit: a typical 0–8 s curve
  }
  function hertzPos(p) { // a cutoff as 0–1 on a 20 Hz – 20 kHz log scale when the display has Hz
    const d = String(p.display ?? '').toLowerCase(), m = d.match(/([\d.]+)\s*(k?hz)/);
    if (m) { const hz = Number(m[1]) * (m[2] === 'khz' ? 1000 : 1); return clamp(Math.log(hz / 20) / Math.log(1000)); }
    return position(p);
  }
  function count(p) { // voices: the display's number, else the value when it is a count, else the range position
    const d = String(p.display ?? '').match(/^\s*(\d+)/); if (d) return Number(d[1]);
    const v = num(p.value); if (v !== null && v >= 1 && Number.isInteger(v)) return v;
    const n = position(p); return n === null ? null : Math.round(1 + 15 * n);
  }
  const on = p => (p ? (typeof p.value === 'boolean' ? p.value : (position(p) ?? 0) >= .5) : true);
  function features(parameters = []) {
    const list = parameters.map(p => ({ p, t: norm(`${p.label || ''} ${p.key || ''}`) }));
    const find = (re, prefer) => { const all = list.filter(x => re.test(x.t)); return (prefer && all.find(x => prefer.test(x.t))) || all[0]; };
    const env = /\b(env 1|env1|amp env|env amp|amp)\b/, osc1 = /\b(osc 1|osc a|a)\b/;
    const f = {};
    const cut = find(/\bcutoff\b|\bcut off\b/, /\b(filter 1|filt 1|fil 1|filter a|filter)\b/); if (cut) f.cutoff = hertzPos(cut.p);
    const filterOn = find(/\b(filter|filt|fil)\b.*\b(on|switch|enable|enabled)\b/, /\b1\b/); if (filterOn && !on(filterOn.p)) f.cutoff = 1;
    const res = find(/\breso(nance)?\b|\bres\b/, /\b(filter 1|filter)\b/); if (res) f.reso = position(res.p);
    for (const [k, re] of [['attack', /\b(attack|atk)\b/], ['decay', /\b(decay|dec)\b/], ['release', /\b(release|rel)\b/]]) { const x = find(re, env); if (x && !/\b(lfo|reverb|delay|comp|glide)\b/.test(x.t)) f[k] = seconds(x.p); }
    const sus = find(/\b(sustain|sus)\b/, env); if (sus) f.sustain = position(sus.p);
    const uni = list.filter(x => /\b(unison|uni)\b/.test(x.t) && !/\b(detune|blend|spread|width|stereo|mode|phase|pan|range|warp|stack)\b/.test(x.t)).map(x => count(x.p)).filter(v => v !== null); if (uni.length) f.unison = Math.max(...uni);
    const poly = list.find(x => /\b(polyphony|poly|voices|voice count)\b/.test(x.t) && !/\b(unison|uni)\b/.test(x.t)); if (poly) f.poly = count(poly.p);
    const mono = find(/\b(mono|legato)\b/); if (mono) f.mono = on(mono.p) && !/\bpoly\b/.test(String(mono.p.value).toLowerCase());
    if (f.poly === 1) f.mono = true; else if (f.mono === undefined && f.poly > 1) f.mono = false;
    const glide = find(/\b(glide|portamento|porta)\b/); if (glide) f.glide = position(glide.p);
    const fx = (name, mixRe) => { const sw = find(new RegExp(`\\b${name}\\b.*\\b(on|switch|enable|enabled)\\b`)); const mix = find(new RegExp(`\\b${name}\\b.*${mixRe}`)); if (sw && !on(sw.p)) return 0; return mix ? position(mix.p) : sw ? .3 : undefined; };
    const fxs = { reverb: fx('(reverb|verb)', '\\b(mix|dry wet|wet|amount)\\b'), delay: fx('delay', '\\b(mix|dry wet|wet|amount)\\b'), dist: fx('(distortion|dist)', '\\b(mix|drive|amount|dry wet)\\b'), chorus: fx('chorus', '\\b(mix|dry wet|wet|amount)\\b') };
    for (const [k, v] of Object.entries(fxs)) if (v !== undefined && v !== null) f[k] = v;
    const noise = find(/\bnoise\b.*\b(level|vol|volume|amount)\b/); if (noise) f.noise = position(noise.p);
    const tr = find(/\b(transpose|octave|oct|coarse|tune)\b/, osc1);
    if (tr) { const d = String(tr.p.display ?? '').match(/^\s*([+-]?\d+)/), v = d ? Number(d[1]) : num(tr.p.value); if (v !== null) f.transpose = /\b(octave|oct)\b/.test(tr.t) ? v * 12 : v; }
    return clean(f);
  }
  // Vital presets (.vital) and Vital's plugin state are the same JSON: real units, no guessing.
  function vitalFeatures(json) {
    const s = json?.settings; if (!s || typeof s !== 'object') return {};
    const v = k => num(s[k]), f = {};
    const filters = [1, 2].filter(i => v(`filter_${i}_on`)), fil = filters[0];
    f.cutoff = fil ? clamp(((v(`filter_${fil}_cutoff`) ?? 136) - 8) / 128) : 1;
    if (fil) f.reso = clamp(v(`filter_${fil}_resonance`) ?? 0);
    const t = k => { const x = v(k); return x === null ? undefined : Math.max(0, x) ** 4; }; // Vital stores envelope times as seconds^¼
    f.attack = t('env_1_attack'); f.decay = t('env_1_decay'); f.release = t('env_1_release'); f.sustain = v('env_1_sustain') ?? undefined;
    const oscs = [1, 2, 3].filter(i => v(`osc_${i}_on`));
    if (oscs.length) { f.unison = Math.max(...oscs.map(i => v(`osc_${i}_unison_voices`) ?? 1)); f.transpose = v(`osc_${oscs[0]}_transpose`) ?? 0; }
    f.poly = v('polyphony') ?? undefined; f.mono = f.poly === 1 || v('legato') === 1;
    f.glide = v('portamento_time') !== null ? clamp((v('portamento_time') + 10) / 14) * (v('portamento_time') > -9.9 ? 1 : 0) : undefined;
    const fx = (name, mix) => (v(`${name}_on`) ? clamp(v(mix) ?? .3) : 0);
    f.reverb = fx('reverb', 'reverb_dry_wet'); f.delay = fx('delay', 'delay_dry_wet'); f.dist = fx('distortion', 'distortion_mix'); f.chorus = fx('chorus', 'chorus_dry_wet');
    f.noise = v('sample_on') ? clamp(v('sample_level') ?? .5) : 0;
    return clean(f);
  }
  function clean(f) { const o = {}; for (const [k, x] of Object.entries(f)) if (typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))) o[k] = typeof x === 'number' ? Math.round(x * 1000) / 1000 : x; return o; }

  // ---------- tags ----------
  const WORDS = { bass: ['bass', 'bs', 'ba', 'sub', 'reese', '808', 'wobble', 'growl', 'bassline'], lead: ['lead', 'ld', 'lds', 'solo'], pad: ['pad', 'pd', 'pads', 'atmo', 'atmos', 'atmosphere', 'ambient', 'drone', 'texture', 'strings'],
    pluck: ['pluck', 'pl', 'plk', 'plucks', 'pizz', 'pizzicato'], keys: ['keys', 'key', 'ky', 'kys', 'piano', 'rhodes', 'organ', 'epiano', 'ep', 'bell', 'bells', 'mallet'], fx: ['fx', 'sfx', 'riser', 'impact', 'sweep', 'whoosh', 'downlifter', 'uplifter', 'noise'],
    seq: ['seq', 'arp', 'sequence', 'arpeggio'], chord: ['chord', 'chords', 'chd', 'stab', 'stabs'], dark: ['dark', 'deep', 'murky'], bright: ['bright', 'shiny', 'airy'], wide: ['wide', 'supersaw', 'hoover'], gritty: ['dirty', 'gritty', 'distorted', 'grit'], soft: ['soft', 'warm', 'mellow'] };
  const WORD_TAG = new Map(Object.entries(WORDS).flatMap(([tag, ws]) => ws.map(w => [w, tag])));
  const STYLE = { bass: 'bass', lead: 'lead', pad: 'pad', keys: 'keys', pluck: 'pluck', seq: 'seq', sfx: 'fx', fx: 'fx', experiment: 'fx', drum: 'fx' };
  const tokens = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  function wordTags(text) { const out = new Set(); for (const w of tokens(text)) { const t = WORD_TAG.get(w); if (t) out.add(t); } return [...out]; }
  function featureTags(f = {}) {
    const t = new Set(), has = k => typeof f[k] === 'number';
    if (has('attack') && (f.attack >= .2 || (f.attack >= .05 && (f.release ?? 0) >= 1.2 && (f.sustain ?? 0) >= .5))) t.add('pad');
    else if (has('attack') && f.attack < .03 && has('sustain') && f.sustain <= .15 && (f.decay ?? .4) <= .9) t.add('pluck');
    if (!t.size && ((f.transpose ?? 0) <= -12 || (f.mono && (f.cutoff ?? 1) < .55))) t.add('bass');
    if (!t.size && (f.mono || (f.glide ?? 0) > .05) && (f.transpose ?? 0) >= 0 && (f.sustain ?? 1) >= .5) t.add('lead');
    if (!t.size && (f.unison ?? 1) >= 5 && (f.sustain ?? 0) >= .6 && (f.attack ?? 1) < .05) t.add('lead');
    if (!t.size && has('attack') && f.attack < .03 && has('sustain') && f.sustain > .15 && f.sustain <= .7 && !f.mono && (f.unison ?? 1) <= 2) t.add('keys');
    if ((f.noise ?? 0) >= .5 || ((f.reverb ?? 0) >= .7 && (f.attack ?? 0) >= .3)) t.add('fx');
    if (has('cutoff')) { if (f.cutoff < .4) t.add('dark'); else if (f.cutoff > .78) t.add('bright'); }
    if (f.mono === true) t.add('mono'); else if (f.mono === false || (f.poly ?? 0) > 1) t.add('poly');
    if ((f.unison ?? 1) >= 4) t.add('wide');
    if ((f.reverb ?? 0) >= .35 || (f.delay ?? 0) >= .35) t.add('wet');
    if ((f.dist ?? 0) >= .3) t.add('gritty');
    if ((f.attack ?? 0) >= .08 && !t.has('fx')) t.add('soft');
    return [...t];
  }
  // name / folder / the preset's own style or tags first (the person who made it knew); the controls fill in the rest,
  // and they never add a second category when the name already said one.
  function tagsOf({ name = '', folder = '', style = '', metaTags = [], features: f = null } = {}) {
    const named = new Set([...wordTags(`${name} ${folder}`), ...(STYLE[String(style).toLowerCase()] ? [STYLE[String(style).toLowerCase()]] : []), ...metaTags.flatMap(x => wordTags(x))]);
    const fromControls = featureTags(f || {}), hasCat = [...named].some(x => CATEGORIES.includes(x));
    for (const x of fromControls) if (!(hasCat && CATEGORIES.includes(x)) && !(x === 'bright' && named.has('dark')) && !(x === 'dark' && named.has('bright'))) named.add(x);
    if (named.has('mono') && named.has('poly')) named.delete('poly');
    return TAGS.filter(x => named.has(x));
  }

  // ---------- similarity ----------
  const logT = s => clamp(Math.log10(1 + s * 100) / Math.log10(1 + 3200));
  const DIMS = [['cutoff', x => x, 1.4], ['reso', x => x, .5], ['attack', logT, 1.3], ['decay', logT, .8], ['sustain', x => x, 1], ['release', logT, .9], ['unison', x => clamp((x - 1) / 15), .8],
    ['mono', x => (x ? 1 : 0), .9], ['glide', x => x, .4], ['reverb', x => x, .6], ['delay', x => x, .5], ['dist', x => x, .5], ['chorus', x => x, .3], ['noise', x => x, .4], ['transpose', x => clamp((x + 24) / 48), .9]];
  function vector(f = {}) { return DIMS.map(([k, fn]) => (f[k] === undefined || f[k] === null ? null : fn(f[k]))); }
  function distance(a, b) { // weighted RMS over the dimensions both presets know; tags decide when too few are shared
    const va = a.vector || vector(a.features), vb = b.vector || vector(b.features); let sum = 0, w = 0, n = 0;
    DIMS.forEach(([, , wt], i) => { if (va[i] !== null && vb[i] !== null && va[i] !== undefined && vb[i] !== undefined) { sum += wt * (va[i] - vb[i]) ** 2; w += wt; n++; } });
    const ta = new Set(a.tags || []), tb = new Set(b.tags || []), inter = [...ta].filter(x => tb.has(x)).length, uni = new Set([...ta, ...tb]).size;
    const tagD = uni ? 1 - inter / uni : 1;
    if (n < 3) return .6 + .4 * tagD + (a.name === b.name ? 0 : .05);
    return Math.sqrt(sum / w) + .15 * tagD + (a.instrument === b.instrument ? 0 : .05);
  }
  function similar(entry, entries, n = 8) { return entries.filter(x => x.id !== entry.id).map(x => ({ x, d: distance(entry, x) })).sort((p, q) => p.d - q.d).slice(0, n).map(({ x, d }) => ({ ...x, distance: Math.round(d * 1000) / 1000 })); }

  // ---------- search ----------
  const SOURCES = { bank: 'bank', hover: '✦ preset window', plugin: 'plugin folder' };
  function search(entries, query = '') {
    const words = tokens(query).filter(w => !['the', 'a', 'an', 'with', 'and'].includes(w));
    const wantFav = words.some(w => ['fav', 'favs', 'favorite', 'favorites', 'favourite', 'favourites', 'starred'].includes(w)), rest = words.filter(w => !/^(fav|favs|favou?rites?|starred)$/.test(w));
    const scored = [];
    for (const x of entries) {
      if (wantFav && !x.favorite) continue;
      const tagSet = new Set([...(x.tags || []), ...(x.aiTags || [])]), name = tokens(`${x.name} ${x.label || ''}`), hay = new Set([...name, ...tokens(`${x.instrument} ${x.folder || ''} ${SOURCES[x.source] || ''} ${x.author || ''}`)]);
      let score = 0, all = true;
      for (const w of rest) {
        const tag = WORD_TAG.get(w) || (TAGS.includes(w) ? w : null);
        if (tag && tagSet.has(tag)) score += 3;
        else if (name.some(t => t === w)) score += 4;
        else if (name.some(t => t.startsWith(w)) || [...hay].some(t => t.startsWith(w))) score += 2;
        else { all = false; break; }
      }
      if (!all) continue;
      scored.push({ x, score: score + (x.favorite ? .5 : 0) + (x.usedIn?.length ? .2 : 0) });
    }
    return scored.sort((a, b) => b.score - a.score || String(a.x.name).localeCompare(String(b.x.name))).map(s => s.x);
  }

  // ---------- Serum 2 presets: the readable JSON header ("XferJson" + JSON) ----------
  function serumMeta(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []); if (b.length < 10) return null;
    const head = String.fromCharCode(...b.subarray(0, 8)); if (head !== 'XferJson') return null;
    let i = 8; while (i < Math.min(b.length, 64) && b[i] !== 0x7b) i++; if (b[i] !== 0x7b) return null;
    let depth = 0, str = false, esc = false, end = -1;
    for (let j = i; j < Math.min(b.length, i + 65536); j++) {
      const c = b[j];
      if (str) { if (esc) esc = false; else if (c === 0x5c) esc = true; else if (c === 0x22) str = false; continue; }
      if (c === 0x22) str = true; else if (c === 0x7b) depth++; else if (c === 0x7d && --depth === 0) { end = j + 1; break; }
    }
    if (end < 0) return null;
    let j; try { j = JSON.parse(new TextDecoder().decode(b.subarray(i, end))); } catch { return null; }
    const pick = (...ks) => { for (const k of ks) if (typeof j[k] === 'string' && j[k].trim()) return j[k].trim().slice(0, 120); return ''; };
    const tags = [j.tags, j.presetTags, j.category, j.presetCategory].flat().filter(x => typeof x === 'string').map(x => x.slice(0, 40)).slice(0, 12);
    return { name: pick('presetName', 'name'), author: pick('presetAuthor', 'author'), description: pick('presetDescription', 'description'), tags, product: pick('product', 'fileType') };
  }

  // ---------- "tag with AI" (opt-in): one tiny prompt per batch of ≤ 20 presets ----------
  const AI_PERSONA = 'You tag synth presets. Answer with one JSON object only.';
  function summary(f = {}) {
    const out = []; const r = x => Math.round(x * 100) / 100;
    if (f.cutoff !== undefined) out.push(`cut ${r(f.cutoff)}`); if (f.attack !== undefined) out.push(`atk ${r(f.attack)}s`); if (f.decay !== undefined) out.push(`dec ${r(f.decay)}s`);
    if (f.sustain !== undefined) out.push(`sus ${r(f.sustain)}`); if (f.release !== undefined) out.push(`rel ${r(f.release)}s`); if (f.unison > 1) out.push(`uni ${f.unison}`);
    if (f.mono) out.push('mono'); if (f.transpose) out.push(`tr ${f.transpose}`); if (f.reverb) out.push(`rev ${r(f.reverb)}`); if (f.dist) out.push(`dist ${r(f.dist)}`);
    return out.join(' ');
  }
  function aiPrompt(batch) {
    return `Tags allowed: ${TAGS.join(' ')}. Give each preset 2–4 of them.\nReply {"<id>":["tag",…],…}\n` + batch.slice(0, 20).map((x, i) => `${i + 1}|${String(x.name).slice(0, 48)}|${x.instrument}|${summary(x.features)}`).join('\n');
  }
  function aiParse(text, batch) {
    const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) return {};
    let j; try { j = JSON.parse(s.slice(a, b + 1)); } catch { return {}; }
    const out = {}; batch.slice(0, 20).forEach((x, i) => { const v = j[String(i + 1)] ?? j[x.id]; if (Array.isArray(v)) { const tags = [...new Set(v.map(t => String(t).toLowerCase().trim()).filter(t => TAGS.includes(t)))].slice(0, 4); if (tags.length) out[x.id] = tags; } });
    return out;
  }
  return { TAGS, CATEGORIES, PREVIEW, features, vitalFeatures, featureTags, wordTags, tagsOf, vector, distance, similar, search, serumMeta, tokens, aiPrompt, aiParse, AI_PERSONA, summary };
})();
if (typeof module !== 'undefined') module.exports = SoundBankCore;
