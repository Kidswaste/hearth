// Apps (round 14), the pure part: no DOM, no Electron. It loads in the hub page, in each app window's chrome
// (apps-window.html) and in Node for dev/apps-unit-test.js. What lives here is what every side must agree on:
//   kindOf(name)            → 'model' | 'hdri' | 'audio' | 'video' | 'image' | 'font' | 'archive' | 'file'
//   routesFor(name, prefer) → [{ id, label }] where a downloaded file can go (Lab, board, the system player…), best first
//   palette(url)            → hex colors read from a Coolors-style address ("coolors.co/264653-2a9d8f-…")
//   sunoPrompt(vibe)        → { title, style, lyrics, exclude }: a Suno prompt written from a scene's vibe, locally
//   splitSuno(text)         → { style, lyrics, title } from a chat reply (the "Style:" line and the [Verse] blocks)
//   safeName(text)          → a file name that works on a Mac and on Windows
//   hostOf(url), sameSite(a, b)  → for keeping a service's own links inside its window
const AppsCore = (() => {
  const EXT = {
    model: /\.(glb|gltf|fbx|obj|stl|ply|usdz|splinecode)$/i,
    hdri: /\.(hdr|exr)$/i,
    audio: /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i,
    video: /\.(mp4|mov|webm|m4v|mkv)$/i,
    image: /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i,
    font: /\.(ttf|otf|woff2?)$/i,
    archive: /\.(zip|7z|rar|tar|gz)$/i,
  };
  const kindOf = (name) => Object.keys(EXT).find((k) => EXT[k].test(String(name || '').split(/[?#]/)[0])) || 'file';

  // Where each kind of file can go, best first. An app can put its own favourite first (Suno: audio → the Lab's song).
  const TARGETS = {
    'lab-model': '◭ Load into the Lab (model layer)',
    'lab-hdri': '◭ Lab: light and backdrop',
    'lab-song': '◭ Use as the Lab\'s song',
    'lab-ref': '◭ Add to the Lab\'s references',
    board: '▦ Put on the board',
    open: '▶ Open (the system player)',
    chat: '💬 Attach to the chat',
    meshy: '🧊 Make a 3D model of it (Meshy)',
    make: '✦ Add to the make in progress',
    assets: '🗂 In your assets (tags, use anywhere)', // (round 24) the asset library (assets.js)
    reveal: '📂 Show in folder',
  };
  const BY_KIND = {
    model: ['lab-model', 'board', 'assets', 'reveal'],
    hdri: ['lab-hdri', 'lab-ref', 'assets', 'reveal'],
    audio: ['lab-song', 'open', 'board', 'chat', 'assets', 'reveal'],
    video: ['board', 'open', 'lab-song', 'lab-ref', 'chat', 'assets', 'reveal'],
    image: ['board', 'lab-ref', 'chat', 'meshy', 'assets', 'reveal'],
    font: ['lab-ref', 'assets', 'reveal'],
    archive: ['reveal'],
    file: ['chat', 'reveal'],
  };
  function routesFor(name, prefer = {}) {
    const kind = kindOf(name);
    let ids = (BY_KIND[kind] || BY_KIND.file).slice();
    const fav = prefer[kind] === 'review' ? 'open' : prefer[kind]; // (an app's old "Video Review" favourite opens the file)
    if (fav && ids.includes(fav)) ids = [fav, ...ids.filter((x) => x !== fav)];
    // a .glb can load as a layer; .fbx / .obj / .stl only as a reference (the Lab's model viewer reads them)
    if (kind === 'model' && !/\.(glb|gltf)$/i.test(name)) ids = ['lab-ref', ...ids.filter((x) => x !== 'lab-model' && x !== 'lab-ref')];
    return ids.map((id) => ({ id, label: TARGETS[id] }));
  }

  // ---------- palettes in addresses (Coolors, and any page whose address lists hex colors) ----------
  function palette(url) {
    const s = String(url || '');
    let m = s.match(/(?:^|[/=#])((?:[0-9a-f]{6}-){1,9}[0-9a-f]{6})(?:$|[/?#&])/i);
    if (m) return m[1].split('-').map((h) => `#${h.toLowerCase()}`);
    m = s.match(/(?:%23|#)[0-9a-f]{6}/gi);
    return m && m.length > 1 ? [...new Set(m.map((h) => `#${h.replace(/^%23|^#/, '').toLowerCase()}`))].slice(0, 10) : [];
  }

  // ---------- Suno prompts from a scene's vibe (no tokens: local words) ----------
  // vibe: { text, words: [], palette: ['#hex'], bpm, name, instrumental, seconds }
  const HUE_WORDS = [
    [0, 'warm', 'driving'], [25, 'golden', 'sunlit'], [50, 'bright', 'uplifting'], [90, 'organic', 'airy'], [150, 'lush', 'dreamy'],
    [190, 'cool', 'spacious'], [220, 'nocturnal', 'cinematic'], [265, 'mystic', 'hypnotic'], [300, 'neon', 'glossy'], [335, 'romantic', 'pulsing'],
  ];
  const MOODS = {
    dark: ['dark', 'moody', 'minor key'], neon: ['synthwave', 'neon', 'retro synths'], dream: ['dream pop', 'reverb-washed', 'hazy'],
    calm: ['ambient', 'calm', 'soft pads'], energy: ['energetic', 'punchy drums', 'driving bass'], epic: ['cinematic', 'epic', 'big drums'],
    glitch: ['glitch', 'IDM', 'stuttering'], lofi: ['lo-fi', 'dusty', 'tape warmth'], techno: ['techno', 'four-on-the-floor', 'hypnotic'],
    house: ['house', 'groovy', 'warm chords'], trap: ['trap', '808s', 'hi-hat rolls'], orchestral: ['orchestral', 'strings', 'swelling'],
    rock: ['indie rock', 'guitars', 'live drums'], jazz: ['jazz', 'brushed drums', 'upright bass'], ethereal: ['ethereal', 'choir', 'shimmer'],
    retro: ['80s', 'analog synths', 'gated reverb'], space: ['space ambient', 'cosmic', 'slow evolving'], fire: ['intense', 'distorted', 'aggressive'],
    ocean: ['oceanic', 'flowing', 'gentle'], minimal: ['minimal', 'sparse', 'clean'], happy: ['happy', 'bright', 'major key'], sad: ['melancholic', 'piano', 'slow'],
  };
  const MOOD_HINTS = {
    dark: /\b(dark|night|noir|shadow|black|gloom)/i, neon: /\b(neon|cyber|synth|vapor|80s neon)/i, dream: /\b(dream|haze|soft focus|pastel)/i,
    calm: /\b(calm|still|quiet|zen|slow|breath)/i, energy: /\b(energy|fast|punch|kick|hype|rush|beat)/i, epic: /\b(epic|huge|grand|hero|trailer)/i,
    glitch: /\b(glitch|datamosh|pixel|noise|corrupt)/i, lofi: /\b(lo-?fi|vhs|grain|tape|found footage)/i, techno: /\b(techno|rave|warehouse|strobe)/i,
    house: /\b(house|groove|disco)/i, trap: /\b(trap|808|drill)/i, orchestral: /\b(orchestra|strings|classical)/i, rock: /\b(rock|guitar|punk)/i,
    jazz: /\b(jazz|smoky|lounge)/i, ethereal: /\b(ethereal|angel|heaven|choir|glow)/i, retro: /\b(retro|80s|chrome|outrun)/i,
    space: /\b(space|cosmic|galaxy|orb|star|nebula|planet)/i, fire: /\b(fire|ember|flame|burn|forge|molten|lava)/i, ocean: /\b(ocean|wave|water|sea|tide)/i,
    minimal: /\b(minimal|clean|simple|swiss|grid)/i, happy: /\b(happy|joy|sunny|playful|fun)/i, sad: /\b(sad|lonely|rain|melanchol)/i,
  };
  function hexHue(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
    if (d < 0.08) return { h: null, l: (max + min) / 2 };
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return { h, l: (max + min) / 2 };
  }
  function colorWords(pal = []) {
    const out = [];
    let lum = 0; let n = 0;
    for (const c of pal.slice(0, 5)) {
      const hv = hexHue(c);
      if (!hv) continue;
      lum += hv.l; n += 1;
      if (hv.h == null) continue;
      let best = HUE_WORDS[0];
      for (const w of HUE_WORDS) if (Math.abs(((hv.h - w[0] + 540) % 360) - 180) < Math.abs(((hv.h - best[0] + 540) % 360) - 180)) best = w;
      out.push(best[1 + (out.length % 2)]);
    }
    if (n && lum / n < 0.3) out.unshift('dark');
    if (n && lum / n > 0.7) out.unshift('bright');
    return [...new Set(out)].slice(0, 3);
  }
  const cap = (s, n) => (s.length > n ? s.slice(0, n).replace(/,\s*[^,]*$/, '') : s);
  function sunoPrompt(vibe = {}) {
    const text = [vibe.text, vibe.name, ...(vibe.words || [])].filter(Boolean).join(' ');
    const moods = Object.keys(MOOD_HINTS).filter((k) => MOOD_HINTS[k].test(text));
    const tags = [];
    for (const k of moods.slice(0, 3)) tags.push(...MOODS[k].slice(0, 2));
    tags.push(...colorWords(vibe.palette || []));
    for (const w of (vibe.words || []).slice(0, 4)) if (/^[a-z][a-z -]{2,20}$/i.test(w)) tags.push(w.toLowerCase());
    if (!tags.length) tags.push('electronic', 'atmospheric', 'evolving');
    const bpm = Math.round(Number(vibe.bpm) || 0);
    if (bpm >= 50 && bpm <= 200) tags.push(`${bpm} bpm`);
    const instrumental = vibe.instrumental !== false;
    tags.push(instrumental ? 'instrumental' : 'vocals');
    const style = cap([...new Set(tags)].join(', '), 200);
    const seconds = Math.max(0, Number(vibe.seconds) || 0);
    // the structure follows the scene's length when it's short (a 15 s reel needs a hook, not a song)
    const short = seconds && seconds <= 40;
    const sections = short ? ['[Intro]', '[Drop]', '[Outro]'] : ['[Intro]', '[Build]', '[Drop]', '[Break]', '[Build]', '[Drop]', '[Outro]'];
    const mood = moods[0] ? MOODS[moods[0]][0] : 'atmospheric';
    const lyrics = instrumental
      ? `${sections.map((s) => `${s}${s === '[Drop]' ? `\n(${mood} hook, full energy)` : ''}`).join('\n')}\n[Instrumental]`
      : `[Verse]\n(write about: ${cap(text || mood, 80)})\n\n[Chorus]\n(a short, repeatable hook)\n\n[Verse]\n\n[Chorus]\n[Outro]`;
    const title = String(vibe.name || '').trim() || `${(moods[0] || 'night').replace(/^\w/, (c) => c.toUpperCase())} ${['Signal', 'Drift', 'Bloom', 'Pulse'][style.length % 4]}`;
    const exclude = instrumental ? 'vocals, spoken word' : '';
    return { title: cap(title, 80), style, lyrics, exclude, moods };
  }
  // A chat reply that writes a Suno prompt: "Style: …" (or "Style of music:"), "Title: …", the rest is lyrics.
  function splitSuno(text) {
    const t = String(text || '').replace(/```[a-z]*\n?|```/g, '');
    const line = (re) => { const m = t.match(re); return m ? m[1].trim().replace(/^["“]|["”]$/g, '') : ''; };
    const style = line(/^\s*(?:\*\*)?style(?: of music)?(?:\*\*)?\s*[:：](?:\*\*)?\s*(.+)$/im);
    const title = line(/^\s*(?:\*\*)?title(?:\*\*)?\s*[:：](?:\*\*)?\s*(.+)$/im);
    const lyrics = t.split('\n').filter((l) => !/^\s*(?:\*\*)?(style(?: of music)?|title|exclude)(?:\*\*)?\s*[:：]/i.test(l)).join('\n').replace(/^\s*(?:\*\*)?lyrics(?:\*\*)?\s*[:：]?\s*$/im, '').trim();
    return { style: cap(style, 1000), title, lyrics: lyrics.slice(0, 5000) };
  }

  // ---------- small helpers ----------
  const safeName = (s, max = 60) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max).trim() || 'file';
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  // two addresses of the same service: example.com, app.example.com and cdn.example.com all count
  function sameSite(a, b) {
    const base = (h) => h.split('.').slice(-2).join('.');
    const ha = hostOf(a); const hb = hostOf(b);
    return Boolean(ha && hb && base(ha) === base(hb));
  }

  return { EXT, TARGETS, kindOf, routesFor, palette, sunoPrompt, splitSuno, colorWords, safeName, hostOf, sameSite };
})();
if (typeof module !== 'undefined') module.exports = AppsCore;
if (typeof window !== 'undefined') window.AppsCore = AppsCore;
