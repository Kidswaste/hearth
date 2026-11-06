// ◈ What's new in the Lab (round 137, tour137): the pure part, no DOM, Node-loadable. Rounds 128–136 brought the Lab
// many new things in a short time. Two lists live here:
//   · STEPS: the short tour (12 steps): each one rings a real control (the app side, labtour137.js, finds it, opening
//     its folded menu first) and says in one or two short sentences what it does. demo: Show me works on a demo copy
//     of the scene (the feature could change something); safe: Show me opens it on the owner's scene (it only shows)
//   · FEATURES: every Lab feature since round 128, one line each, with where Open goes. Open uses what Hearth already
//     has, so it stays in sync: a Ctrl/⌘+K action (by the start of its label), a chat command (only ones that just
//     open something), or a tour step's place. dev/checks/tour137.js checks each one is really there, and that every
//     part of the round 128–136 patch notes has a line here (IGNORED: the parts that are fixes or have nothing to open)
// search(q): the index's search (plain words, a few other words for the same thing, typos of one letter).
const LabTourData = (() => {
  const VERSION = 137; // the tour's own number: the note is offered once per version
  const STEPS = [
    { id: 'critique', icon: '✦', title: '✦ Critique', text: 'This ✦ Critique button looks at your scene and suggests 3 fixes. It shows the cost first. Nothing is sent until you click.', show: 'safe' },
    { id: 'explain', icon: '✦', title: '✦ Explain this layer', text: 'Explain this layer says what the selected layer draws and which sliders matter, in plain words. It is in this ⋯ menu, or right-click a layer.', show: 'safe' },
    { id: 'layers', icon: '📁', title: 'A tidier layer list', text: 'This ⋯ tidies your layers: find one, ✦ Name these for me, and groups. Double-click a name to rename it.', show: 'safe' },
    { id: 'versions', icon: '🕘', title: '🕘 Scene versions', text: 'Scene versions keeps earlier versions of your scene. Tick two and Compare them side by side. It is in Sketch ▾ › History.', show: 'safe' },
    { id: 'speed', icon: '⚡', title: '⚡ Speed check', text: 'Speed check measures why the preview is slow, on your computer, and offers one-click fixes. No AI.', show: 'safe' },
    { id: 'render', icon: '⇪', title: '⇪ Render presets', text: 'Render a video from here. The Render card now starts with one-click presets: Vertical reel, Seamless loop, Full song, 4K and Square.', show: 'safe' },
    { id: 'perform', icon: '◉', title: '◉ Perform and 📱 phone', text: 'Right-click ▣ Present. ◉ Perform plays your scene live: 1–9 jump to the song\'s parts. 📱 Live on my phone shows it on your phone.', show: 'safe' },
    { id: 'mywork', icon: '★', title: '★ My work', text: 'Right-click the picture › ＋ Add › ★ From my work. Your past scenes, layers and looks come back here.', show: 'safe' },
    { id: 'dials', icon: '🎛', title: '🎛 Mood dials', text: 'Mood dials are a few big knobs, like Energy or Darkness. Each one moves many sliders at once.', show: 'demo' },
    { id: 'follow', icon: '🎚', title: '🎚 Follow the music', text: 'Follow the music makes a slider move with the bass, the kick or the highs. You see a live meter while you set it.', show: 'demo' },
    { id: 'blocks', icon: '🧩', title: '🧩 Effect blocks', text: 'Blocks are 12 ready-made effects with live previews: glow, trails, kaleidoscope… Click one to add it.', show: 'demo' },
    { id: 'campath', icon: '🎥', title: '🎥 Camera paths', text: 'Right-click the picture › 🎥 Camera moves › ✎ Draw a camera path. Click points: the camera flies through them with the song.', show: 'demo' },
  ];

  // open: { action: 'start of a Ctrl/⌘+K label' } | { cmd: '/name args' } | { step: 'tour step id' } | { place: 'id' }
  const FEATURES = [
    { id: 'brief', round: 128, icon: '✦', name: 'Project brief', line: 'The AI reads your project (moodboard, song, notes) and writes a short plan first.', words: 'plan prepare brief steps palette mood', open: { cmd: '/brief show' }, part: 'The AI prepares before it builds' },
    { id: 'newproject', round: 128, icon: '＋', name: 'A richer new project', line: 'Start a project from a template, a song, pictures, a palette and a size.', words: 'create start template song size frame rate', open: { action: 'Projects: new project' }, part: 'A richer new project' },
    { id: 'projmenu', round: 128, icon: '☰', name: 'One project menu', line: 'One tidy menu for a project: open, make, look, share, settings.', words: 'project menu options ctrl shift o', open: { action: 'Project menu' }, part: 'One project menu' },
    { id: 'draft', round: 129, icon: '✦', name: 'Build a first draft', line: 'The plan card builds the brief\'s first steps in one go. One Undo takes it back.', words: 'first draft build plan steps', open: { cmd: '/brief show' }, part: 'Build a first draft' },
    { id: 'projlook', round: 129, icon: '◆', name: 'The project\'s look', line: 'The small ◆ in the Lab toolbar recolours your layers to the project\'s palette.', words: 'palette colours colors recolor look apply moodboard', open: { place: 'projlook' }, part: 'The project\'s look on the scene' },
    { id: 'nextstep', round: 129, icon: '➜', name: 'Next step', line: 'A small "Next: …" chip under a director reply suggests the next step. Sent only when you click it.', words: 'next suggestion chip habits', open: { place: 'nextstep' }, part: 'Next step, and project templates' },
    { id: 'templates', round: 129, icon: '📐', name: 'Project templates', line: 'Project menu › Save as a template… New projects can start from it.', words: 'template save reuse starter', open: { action: 'Project menu' }, part: 'Next step, and project templates' },
    { id: 'takes', round: 130, icon: '✦', name: '3 takes', line: 'Beside Send in a director chat: three versions of your idea, side by side. Keep the one you like.', words: 'three versions variations compare takes', open: { place: 'takes' }, part: '3 takes' },
    { id: 'mapsong', round: 130, icon: '✦', name: 'Map to the song', line: 'Cues for each part of the song, jumps on the drops and beat links, shown as ghosts first. No AI.', words: 'song sections drops cues beat map music timeline', open: { action: 'Lab: ✦ Map the scene to the song' }, part: 'Map to the song' },
    { id: 'critique', round: 130, icon: '✦', name: 'Critique', line: 'The AI looks at your scene and suggests 3 fixes. The cost shows first.', words: 'critique feedback improve suggestions review fixes', open: { action: 'Lab: Critique this scene' }, step: 'critique', part: 'Critique' },
    { id: 'like', round: 131, icon: '✦', name: 'A layer like this picture', line: 'Pick a picture: the director builds one new layer in its spirit.', words: 'picture image reference moodboard like this inspiration', open: { action: 'Lab: Make a layer like a picture' }, part: 'A layer like this picture' },
    { id: 'renderpre', round: 131, icon: '⇪', name: 'Render presets', line: 'One-click render settings: Vertical reel, Seamless loop, Full song, 4K, Square.', words: 'render export video preset reel loop 4k square', open: { step: 'render' }, step: 'render', part: 'Render presets' },
    { id: 'perform', round: 131, icon: '◉', name: 'Perform', line: 'Play your scene live on a second screen: 1–9 jump to song parts, Q W E switch looks.', words: 'live show perform vj second screen keys midi', open: { step: 'perform' }, step: 'perform', part: 'Perform' },
    { id: 'explain', round: 132, icon: '✦', name: 'Explain this layer', line: 'What a layer draws and which sliders matter, in plain words. Free the second time.', words: 'explain understand layer code sliders what does', open: { action: 'Lab: Explain this layer' }, step: 'explain', part: 'Explain this layer' },
    { id: 'versions', round: 132, icon: '🕘', name: 'Scene versions', line: 'Earlier versions of your scene: compare them side by side, bring one back.', words: 'versions history undo compare restore earlier', open: { action: 'Lab: Scene versions' }, step: 'versions', part: 'Scene versions' },
    { id: 'lyrics', round: 133, icon: '🎤', name: 'Lyrics synced to the song', line: 'Paste lyrics, time them to the song, and show them as a styled layer.', words: 'lyrics words text karaoke lrc srt sing', open: { action: 'Lab: 🎤 Lyrics synced to the song' }, part: 'Lyrics synced to the song' },
    { id: 'campath', round: 133, icon: '🎥', name: 'Camera paths', line: 'Click points on the picture: the camera flies through them with the song.', words: 'camera path fly move curve draw', open: { cmd: '/camera-moves draw' }, step: 'campath', part: 'Camera paths' },
    { id: 'speed', round: 133, icon: '⚡', name: 'Why is this slow?', line: 'Measures why the preview is slow and offers one-click fixes. No AI.', words: 'slow speed fps lag performance fast fix', open: { cmd: '/speed-check' }, step: 'speed', part: 'Why is this slow?' },
    { id: 'blocks', round: 134, icon: '🧩', name: 'Effect blocks', line: '12 ready-made effects with live previews. Click one to add it.', words: 'blocks effects glow trails kaleidoscope grain filters', open: { cmd: '/blocks' }, step: 'blocks', part: 'Effect blocks' },
    { id: 'follow', round: 134, icon: '🎚', name: 'Follow the music', line: 'A slider moves with the bass, the kick or the highs, with a live meter.', words: 'follow music audio react bass kick beat slider', open: { action: 'Lab: 🎚 Follow the music' }, step: 'follow', part: 'Follow the music' },
    { id: 'mywork', round: 134, icon: '★', name: 'My work', line: 'Your past scenes, layers and looks, to start from or add here.', words: 'my work past library reuse old projects', open: { place: 'mywork' }, step: 'mywork', part: 'My work' },
    { id: 'dials', round: 135, icon: '🎛', name: 'Mood dials', line: 'A few big knobs, like Energy or Darkness, that move many sliders at once.', words: 'dials knobs mood energy darkness macro', open: { action: 'Lab: 🎛 Mood dials' }, step: 'dials', part: 'Mood dials' },
    { id: 'layers', round: 136, icon: '📁', name: 'A tidier layer list', line: 'Find a layer, name them for you, groups with colour tags, rename by double-click.', words: 'layers outline groups rename find tidy organise organize', open: { step: 'layers' }, step: 'layers', part: 'A tidier layer list' },
    { id: 'phone', round: 136, icon: '📱', name: 'See it on your phone', line: 'A render, or the live preview, on your phone over your own Wi-Fi.', words: 'phone mobile qr wifi iphone android', open: { step: 'perform' }, step: 'perform', part: 'See it on your phone' },
  ];
  // patch-note parts with nothing to open (a fix, a cheaper message, the toolbar tidied)
  const IGNORED = ['Tidier toolbar', 'Cheaper messages to the Lab\'s AI', 'Jumping in the song right after play'];
  const FROM = 128; const TO = 136;

  // ---------- search ----------
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const SAME = { colour: 'color', colours: 'colors', organise: 'organize', video: 'render', export: 'render', slow: 'speed', laggy: 'slow', knob: 'dials', knobs: 'dials', words: 'lyrics', song: 'music', history: 'versions', undo: 'versions', picture: 'image', photo: 'picture', mobile: 'phone', live: 'perform' };
  const near = (a, b) => { // one letter off (a typo), for words of 4+ letters
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    let i = 0; let j = 0; let miss = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++miss > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return miss + (a.length - i) + (b.length - j) <= 1;
  };
  function score(f, q, typos = false) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return 1;
    const name = norm(f.name); const hay = ` ${norm(`${f.name} ${f.line} ${f.words || ''} round ${f.round}`)} `;
    const toks = hay.trim().split(' ');
    let s = 0;
    for (const w0 of words) {
      const alts = [w0, SAME[w0], SAME[SAME[w0]]].filter(Boolean);
      let best = 0;
      for (const w of alts) {
        if (name.startsWith(w)) best = Math.max(best, 6);
        else if (` ${name} `.includes(` ${w}`)) best = Math.max(best, 5);
        else if (hay.includes(` ${w}`)) best = Math.max(best, 3);
        else if (hay.includes(w)) best = Math.max(best, 2);
        else if (typos && toks.some((t) => near(t, w))) best = Math.max(best, 1);
      }
      if (!best) return 0;
      s += best;
    }
    return s;
  }
  // the features matching q (all of them, newest round first, when q is empty)
  function search(q, list = FEATURES) {
    // typos only when the words as typed find nothing ("slow" isn't "glow")
    let scored = list.map((f, i) => ({ f, s: score(f, q), i })).filter((x) => x.s > 0);
    if (!scored.length) scored = list.map((f, i) => ({ f, s: score(f, q, true), i })).filter((x) => x.s > 0);
    if (!norm(q)) return scored.sort((a, b) => b.f.round - a.f.round || a.i - b.i).map((x) => x.f);
    return scored.sort((a, b) => b.s - a.s || b.f.round - a.f.round || a.i - b.i).map((x) => x.f);
  }
  // where Open goes, given what this copy of Hearth has: has.action(prefix) → bool, has.cmd(name) → bool
  function openOf(f, has = {}) {
    const o = f.open || {};
    if (o.action && has.action?.(o.action)) return { type: 'action', label: o.action };
    if (o.cmd && has.cmd?.(o.cmd.slice(1).split(/\s+/)[0])) return { type: 'cmd', line: o.cmd };
    if (o.step && STEPS.some((s) => s.id === o.step)) return { type: 'step', step: o.step };
    if (o.place) return { type: 'place', place: o.place };
    if (f.step) return { type: 'step', step: f.step };
    return null;
  }
  // the ## parts of one round's patch notes (their plain names)
  const parts = (text) => [...String(text || '').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s*\((lab|mac|windows)[^)]*\)\s*$/i, '').trim());
  return { VERSION, STEPS, FEATURES, IGNORED, FROM, TO, search, score, openOf, parts, norm };
})();
if (typeof module !== 'undefined') module.exports = LabTourData;
