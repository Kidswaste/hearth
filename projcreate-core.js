// (round 128, projcreate128) The new-project card's pure parts: what a project can start from (the Lab's own starting
// points, by id: tools/three-gallery-data.js STARTS and ThreeLayers templates), the frame sizes and rates, a few
// palettes, a Coolors link / hex codes read into colors, the colors of several pictures merged into one palette, the
// files sorted by kind, the remembered defaults (per computer) and what the brief is asked for. Loads in Node too.
// The window side is projcreate.js (lazy group "projcreate"); docs/upgrades/projcreate128.md.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.ProjCreateCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  // what a project starts from: `start` is a gallery starting point's id, `layers` a gallery-style recipe
  // ({ t: ThreeLayers template id } | { f: filter id }); `need` is a file the start uses when given
  const STARTS = [
    { id: 'empty', icon: '◻', label: 'Empty scene', hint: 'A fresh animated scene, nothing in it yet' },
    { id: 'visualizer', icon: '〰', label: 'Audio visualizer', hint: 'A 3D crown of spectrum bars that follows the music', start: 'spectrum-crown' },
    { id: 'particles', icon: '✦', label: 'Particles', hint: '30,000 particles that burst on every kick', start: 'beat-burst' },
    { id: 'shader', icon: '◇', label: 'Shader art', hint: 'An endless zoom into a fractal, with a soft bloom', start: 'fractal' },
    { id: 'type', icon: '🅰', label: 'Kinetic type', hint: 'One big word per beat, letters rising in', start: 'kinetic-opener' },
    { id: 'model', icon: '🧊', label: '3D model showcase', hint: 'A turning object in studio light; pick your own .glb to show it instead', start: 'chrome-knot', withModel: [{ t: 'mesh-gradient' }], need: 'model' },
    { id: 'footage', icon: '🎞', label: 'Footage + effects', hint: 'Your video full frame, with a film look on top', layers: [{ t: 'footage-fill' }, { f: 'film' }], need: 'footage' },
  ];
  const startOf = (id) => STARTS.find((s) => s.id === id) || STARTS[0];
  // frame sizes: ids of tools/three-media.js SIZES (what the scene's frame is set to)
  const SIZES = [
    { id: '16:9', label: '16:9 · 1080p', hint: '1920×1080: YouTube, screens' },
    { id: '9:16', label: '9:16 · vertical', hint: '1080×1920: Shorts, Reels, TikTok' },
    { id: '1:1', label: '1:1 · square', hint: '1080×1080: a square post' },
    { id: '4k', label: '4K', hint: '3840×2160: 4K video' },
  ];
  const RATES = [24, 30, 60];
  // a few palettes to click (the Lab's own list: tools/three-fx-data.js), with no Lab loaded
  const PALETTES = [
    ['Techno', '050505 1a1a1a ff0040 00e5ff ffffff'], ['House', '1b1035 5b2a86 f15bb5 fee440 00bbf9'],
    ['Synth pop', '0d0221 261447 2de2e6 f6019d ff6c11'], ['Lo-fi', '2d2a32 6c5b7b c06c84 f67280 f8b195'],
    ['Ambient', '0b1d26 1f4e5f 79a3b1 d0e1e6 fcf8ec'], ['Hyperpop', 'ff00e5 00fff7 fff500 7a00ff ffffff'],
    ['Jazz', '1b1b2f 162447 1f4068 e43f5a f5d6ba'], ['Classical', '1c1814 4a3f35 8c7a5b d4c39f f7f1e3'],
  ].map(([name, hex]) => ({ name, colors: hex.split(' ').map((h) => `#${h}`) }));
  const HEX = /^#[0-9a-f]{6}$/i;
  // a Coolors link (coolors.co/264653-2a9d8f-e9c46a…, /palette/…), hex codes, or a mix → up to 10 colors
  function parsePalette(text) {
    const out = [];
    for (const m of String(text || '').matchAll(/(?:^|[^0-9a-z])#?([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi)) {
      let h = m[1].toLowerCase();
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (!out.includes(`#${h}`)) out.push(`#${h}`);
    }
    return out.slice(0, 10);
  }
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => { const A = rgb(a); const B = rgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  // several pictures' colors (each list most common first) → one palette: taken in turns, near-duplicates skipped
  function mergePalettes(lists, n = 5) {
    const ls = (lists || []).map((l) => (l || []).filter((h) => HEX.test(h)));
    const out = [];
    for (let i = 0; out.length < n && ls.some((l) => i < l.length); i += 1) {
      for (const l of ls) { const c = l[i]; if (c && out.length < n && out.every((o) => dist(o, c) > 40)) out.push(c.toLowerCase()); }
    }
    return out;
  }
  const KINDS = { song: /\.(mp3|wav|ogg|flac|m4a|aac|opus|aiff?)$/i, footage: /\.(mp4|mov|webm|m4v|mkv)$/i, picture: /\.(png|jpe?g|webp|gif|bmp|avif)$/i, model: /\.(glb|gltf|fbx|obj|stl|ply)$/i };
  const kindOf = (p) => Object.keys(KINDS).find((k) => KINDS[k].test(String(p || ''))) || null;
  function sortFiles(paths) {
    const out = { songs: [], footage: [], pictures: [], models: [], other: [] };
    for (const p of paths || []) { const k = kindOf(p); (k === 'song' ? out.songs : k === 'footage' ? out.footage : k === 'picture' ? out.pictures : k === 'model' ? out.models : out.other).push(p); }
    return out;
  }
  // the remembered choices (this computer): a size, a rate and an AI that still exist, else the defaults
  function defaults(saved = {}, agentIds = []) {
    const s = saved && typeof saved === 'object' ? saved : {};
    return {
      frame: SIZES.some((z) => z.id === s.frame) ? s.frame : '16:9',
      fps: RATES.includes(Number(s.fps)) ? Number(s.fps) : 30,
      agentId: agentIds.includes(s.agentId) ? s.agentId : agentIds[0] || null,
    };
  }
  // "Let the AI prepare a brief": on by default when there's a moodboard (pictures) or a song, unless the owner set it
  const briefOn = (st) => (st.briefTouched ? Boolean(st.brief) : Boolean(st.pictures?.length || st.song));
  // what ProjectBrief.prepare is asked for (aiprep128's contract): the moodboard's pictures only with the owner's tick
  const briefOptions = (st) => ({ moodboard: Boolean(st.consent), refs: true, song: true, scene: true, notes: String(st.intent || '').trim() });
  // "Suggest a name": the words to the AI, and its answer made into a name
  const base = (p) => String(p || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  function namePrompt(intent, song) {
    return `Suggest one short, evocative name (1 to 4 words) for a music-visual project. Facts: ${JSON.stringify({ idea: String(intent || '').slice(0, 600), song: song ? base(song) : null })}. Reply with the name only.`;
  }
  function cleanName(text) {
    const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    return line.replace(/^(name|title)\s*:\s*/i, '').replace(/^["'“”‘’*_`]+|["'“”‘’*_`.]+$/g, '').trim().slice(0, 48);
  }
  // one line per section, under its label
  function summary(st, agents = []) {
    const s = startOf(st.start);
    const start = st.start === 'copy' ? 'A copy of one of my scenes' : st.start === 'duplicate' ? 'A copy of a project' : st.start === 'mytemplate' ? 'One of my Lab templates' : st.start === 'projtemplate' ? `My template “${st.projTemplateName || 'template'}”` /* (round 129, next129) */ : s.label;
    const media = [st.song ? `🎵 ${base(st.song)}` : '', st.footage ? `🎞 ${base(st.footage)}` : ''].filter(Boolean).join(' · ') || 'Skip for now';
    const size = SIZES.find((z) => z.id === st.frame);
    const look = [st.pictures?.length ? `${st.pictures.length} picture${st.pictures.length === 1 ? '' : 's'}` : '', st.palette?.length ? `${st.palette.length} colors` : '', `${size?.label || st.frame} · ${st.fps} fps`].filter(Boolean).join(' · ');
    const ai = [agents.find((a) => a.id === st.agentId)?.name || 'AI', briefOn(st) ? 'brief' : '', st.consent ? 'sees the moodboard' : ''].filter(Boolean).join(' · ');
    return { start, media, look, ai };
  }
  return { STARTS, startOf, SIZES, RATES, PALETTES, parsePalette, mergePalettes, kindOf, sortFiles, defaults, briefOn, briefOptions, namePrompt, cleanName, summary, base };
});
