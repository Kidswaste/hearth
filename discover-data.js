// Round 15 (tour): the data behind "make me discover things" — the upgrade docs parser, how a doc line is matched to
// your habits, the guided spotlights, the daily tips, Surprise me and the ideas for tonight. Plain data and pure
// functions (no DOM), so dev tests can load it in Node too. discover.js and tour.js use it. All local, no tokens.
const DiscoverData = (() => {
  // ---------- docs/upgrades/*.md ----------
  // "12. **Again: Ctrl/⌘+.** repeats your last action (`/again`)" under "## Repeat and pick up"
  function parseDoc(text, file = '') {
    const out = { file, title: '', items: [] };
    let group = '';
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      let m;
      if (!out.title && (m = line.match(/^#\s+(.+)/))) { out.title = m[1].trim(); continue; }
      if ((m = line.match(/^#{2,4}\s+(.+)/))) { group = m[1].replace(/\*\*/g, '').trim(); continue; }
      if (!(m = line.match(/^(\d+)\.\s+(.+)/))) continue;
      const body = m[2].trim();
      const bold = (body.match(/\*\*([^*]+)\*\*/) || [])[1] || '';
      const cmds = [...body.matchAll(/`(\/[a-z0-9][\w-]*(?:\s[^`]*)?)`/gi)].map((x) => x[1].trim());
      const keys = [...body.matchAll(/\b((?:Ctrl\/⌘|⌘\/Ctrl|Ctrl|⌘|Cmd|Alt|Shift)(?:\+[A-Za-z0-9.,;/[\]↑↓←→]+)+)/g)].map((x) => x[1]);
      out.items.push({ id: `${file}#${m[1]}`, n: Number(m[1]), file, group, text: body, plain: plainOf(body), bold: plainOf(bold), cmds, keys });
    }
    return out;
  }
  const plainOf = (s) => String(s || '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  // README.md's table: | what | [file.md](file.md) | count | → { file, desc, round, count, name }
  function parseIndex(text) {
    const rows = [];
    for (const line of String(text || '').split('\n')) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*\[([\w.-]+\.md)\]\([^)]*\)\s*\|\s*([\d,]+)\s*\|/);
      if (!m) continue;
      const desc = plainOf(m[1]);
      const r = desc.match(/\(round (\d+)/i);
      rows.push({ file: m[2], desc, round: r ? Number(r[1]) : 1, count: Number(m[3].replace(/,/g, '')) || 0, name: desc.split(/[(:]/)[0].trim() });
    }
    return rows;
  }
  // the items an update brought: numbers above what this file had before (docs only ever grow at the end of their
  // groups, so a number new to this file is a new line); a file seen for the first time: all of it
  function newSince(doc, before) {
    if (before == null) return doc.items.slice();
    return doc.items.filter((it) => it.n > before);
  }

  // ---------- matching your habits ----------
  // what the owner does most (the brief's tracking: music-driven Three.js visuals with the Three Director, Save /
  // Shuffle / Tap / Freeze / frame sizes); habits.js / speed data add to it at run time
  const PROFILE = {
    lab: 2, 'three.js': 2, slider: 2, sliders: 2, shuffle: 2.4, save: 1.2, tap: 2.2, beat: 2, beats: 2, music: 2, song: 2, sound: 1.4,
    kick: 1.4, freeze: 2.2, '9:16': 1.6, 'frame size': 1.6, sizes: 1, director: 2.2, scene: 1.6, scenes: 1.6, sequence: 1.6, layer: 1.2,
    layers: 1.2, look: 1, looks: 1, palette: 1.2, render: 1.4, renders: 1.4, timeline: 1.6, reels: 1, tiktok: 1, board: 1.1,
    reference: 1, references: 1, vibe: 1.2, astra: 1, jam: 1.2, again: 1.2, video: 0.8, preview: 1, cover: 0.8,
  };
  const STOP = new Set('the and for with from your you that this into when what where them they then its it a an of to in on or by at as is are be one two all any each more less new now same than only also just not no off out up over every'.split(' '));
  function wordsOf(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}:.+/-]+/gu, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)); }
  // profile: { word: weight }; hide: Set of item ids said "not for me"; cold: { file|group: penalty }
  function score(item, profile = PROFILE, cold = {}) {
    const t = ` ${item.plain.toLowerCase()} `;
    let s = 0;
    for (const [w, k] of Object.entries(profile)) if (t.includes(w.length < 5 ? ` ${w}` : w)) s += k;
    if (item.cmds.length) s += 0.8;
    if (item.keys.length) s += 0.3;
    if (item.bold) s += 0.4;
    if (item.plain.length > 260) s -= 0.6; // long lines are rarely the headline
    s -= (cold[item.file] || 0) + (cold[`${item.file}|${item.group}`] || 0);
    return s;
  }
  // the most relevant first, at most `per` from one group so one area doesn't fill the card
  function pick(items, { n = 8, profile = PROFILE, hide = new Set(), cold = {}, per = 2, perFile = 3 } = {}) {
    const ranked = items.filter((it) => !hide.has(it.id)).map((it) => ({ it, s: score(it, profile, cold) })).sort((a, b) => b.s - a.s || a.it.n - b.it.n);
    const out = []; const seen = {};
    for (const { it } of ranked) {
      const g = `${it.file}|${it.group}`;
      if ((seen[g] || 0) >= per || (seen[it.file] || 0) >= perFile) continue;
      seen[g] = (seen[g] || 0) + 1; seen[it.file] = (seen[it.file] || 0) + 1;
      out.push(it);
      if (out.length >= n) break;
    }
    return out;
  }
  // group by area (the doc), keeping the order of the picked items
  function byArea(items, names = {}) {
    const m = new Map();
    for (const it of items) { const k = names[it.file] || it.file.replace(/\.md$/, ''); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()].map(([area, list]) => ({ area, items: list }));
  }

  // ---------- "Show me": what is safe to run straight away ----------
  // commands that only open or show something; anything else is put in the chat box for you to send
  const SAFE = new Set(['renders', 'board', 'boards', 'board-peek', 'commands', 'apps', 'habits', 'keys', 'resume', 'help', 'usage', 'meter',
    'makes', 'progress', 'flows', 'whats-new', 'feature-map', 'ideas', 'spotlight', 'sequence', 'access', 'again', 'macro', 'tucked', 'look', 'appearance',
    'scene', 'scenes', 'footage', 'motion-kit', 'doctor', 'update', 'sync', 'vibe', 'cmdbar', 'tip']);
  const SAFE_ARGS = /^(|list|status|show|help|log|health|learned|keys|presets|history|queue|now|discover|downloads|windows)$/i;
  function safeLine(line, has = () => true) {
    const m = String(line || '').trim().match(/^\/([\w-]+)\s*(.*)$/);
    if (!m || !has(m[1])) return false;
    return SAFE.has(m[1].toLowerCase()) && SAFE_ARGS.test(m[2].trim());
  }

  // ---------- guided spotlights (tour.js) ----------
  // step: { title, text, target: [selectors] (the first one on screen gets the ring), open: 'tool:x' | '/command',
  //         cmd: a line for "Try it" (run when safe, put in the chat box otherwise), when: name of a command that must exist }
  const RAIL = (id) => `.agent-btn[data-id="tool:${id}"]`;
  const TOURS = [
    { id: 'renders', name: 'Render queue', icon: '⇪', why: 'every render, recording and export in one list', steps: [
      { title: 'One queue for everything', text: 'Every render, recording and export lands in one queue. While something renders, ⇪ shows at the bottom of the rail with how many.', target: ['#rq-badge:not([hidden])', '#pg-dot:not([hidden])', '#keys-btn'] },
      { title: 'The queue', text: 'Progress and time left on each job; pause, cancel or retry it. A done one has Open, Reveal and Copy path (right-click: Adobe).', open: '/renders', target: ['.rq-pop'] },
      { title: 'Presets in one panel', text: 'Reels / TikTok / Shorts, Story, Feed, Square, YouTube 1080p / 4K, GIF, WebM, ProRes master, or All socials at once.', target: ['.rq-pop'], cmd: '/renders presets' },
      { title: 'From a chat', text: '“render it again” or /renders works in any chat; a render joins its make, so it shows with its rooms.', target: ['.surface.active .composer textarea'] },
    ] },
    { id: 'studio', name: 'Chaining things', icon: '⛓', why: 'one command feeding the next', steps: [
      { title: 'Chain commands', text: 'In a chat or the command bar (Ctrl/⌘+;): “/a ; /b” runs one after the other, “/shot lab | draft” feeds the result on.', target: ['.surface.active .composer textarea'], cmd: '/cmdbar' },
      { title: 'Then another command', text: 'On ☰ Commands, after a command\'s questions, “then another command” takes its result. A run can be picked up, run Again or Refined.', open: 'tool:commands', target: ['.cp-list', RAIL('commands')] },
      { title: 'Studio pipelines', text: 'Studio chains the board, the Lab, its sequence, renders and apps into one pipeline you can rerun.', when: 'studio', cmd: '/studio' },
      { title: 'Several chats at once', text: '/dispatch splits a video into parts made by several chats (Claude or Astra each), shown live in your scene, followed on one card.', cmd: '/dispatch' },
    ] },
    { id: 'eyes', name: 'Board eyes + Pinterest', icon: '◉', why: 'chats look at your references', steps: [
      { title: 'Your mood board', text: 'Chats can now SEE the board — pictures, clips as timestamped frames — not only read its vibe.', open: 'tool:board', target: ['.bd-item', RAIL('board')] },
      { title: 'Show it to a chat', text: 'Right-click a reference › Show to a chat, or Ask about it. Each look says what it sent (size, ≈ tokens).', target: ['.bd-item'] },
      { title: 'More from Pinterest', text: 'Pinterest searches from the board\'s vibe; in its window ＋ Board adds a pin with its link.', cmd: '/board pinterest' },
      { title: 'From a chat', text: '/board-tools on, then “look at my board”. Small pictures by default; the chat asks for bigger ones only when detail matters.', target: ['.surface.active .composer textarea'], cmd: '/board look' },
    ] },
    { id: 'apps', name: 'Apps + Meshy', icon: '▣', why: 'Meshy, Suno, Figma… in their own windows', steps: [
      { title: 'Apps', text: 'Every app in its own window and sign-in, from one picker in the rail\'s ⋯ menu (search, ★ favorites, recents).', target: ['#apps-btn:not([hidden])', '#rail-more', '#config-btn'], cmd: '/apps' },
      { title: '✨ Discover', text: 'Discover suggests apps that fit what you are doing (the Lab → 3D / video, the board → image AI).', cmd: '/apps discover' },
      { title: 'Meshy from a chat', text: '/meshy a prompt: the cost shows and it asks first; models land in the Lab or on the board.', cmd: '/meshy' },
      { title: 'Downloads go where they fit', text: 'GLB → the Lab, HDRI → the sky, songs → the Lab, clips → the board (or your video player), pictures → the board.', cmd: '/apps downloads' },
    ] },
    { id: 'access', name: 'Chat access cards', icon: '🔐', why: 'what a chat may read, write and run', steps: [
      { title: 'Each chat\'s access', text: 'Chat ⋯ → Access: Off · Read · Read & write · Full, in the chat\'s own folders.', target: ['.surface.active .native-head button[title="Chat options"]', '.surface.active .native-head'] },
      { title: 'From the chat', text: '/access shows it and sets it (/access read, /access add a folder).', cmd: '/access' },
      { title: 'Risky things ask first', text: 'Deleting, publishing, paid credits or folders outside: a card in the chat — Allow once · for this chat · Deny + note. No answer = no.' },
      { title: 'Nothing lost', text: 'Deletes go to the Trash, edits have Undo, and /access log lists what a chat read, wrote, deleted or ran.', cmd: '/access log' },
    ] },
    { id: 'sequence', name: 'Lab sequence editing', icon: '▤', why: 'your scenes cut into a video', steps: [
      { title: '▤ Sequence', text: 'On the Lab timeline: your scenes, footage, titles and the song become one video, frame-exact, no reloads.', open: 'tool:three', target: ['.sq-tab', RAIL('three')], cmd: '/sequence' },
      { title: 'Edit with keys', text: ', / . nudge a clip one frame (Shift: a beat), [ / ] trim its end, Shift+M a named marker. A run of nudges is one undo.', target: ['.sq-view', '.sq-tab'] },
      { title: 'Right-click a clip', text: 'Speed › 0.25–4×, Color ›, Nudge ›, transitions. ✦ Arrange lays your scenes on the song\'s sections.', target: ['.sq-view', '.sq-tab'], cmd: '/arrange' },
      { title: 'Render and health', text: '⇪ Render for every social format; the watchdog repairs the preview by itself (/sequence health says what it did).', cmd: '/sequence health' },
    ] },
    { id: 'keys', name: 'Keys + Again', icon: '⌨', why: 'repeat what you just did', steps: [
      { title: 'The keys button', text: 'Bottom left: every shortcut, yours first (the ones you press most, and keys for things you keep clicking).', target: ['#keys-btn'] },
      { title: 'Again', text: 'Ctrl/⌘+. repeats your last action — Save, Shuffle, a frame size — even while the Lab picture has the keyboard. Ctrl/⌘+Shift+. shows the last ten.', cmd: '/again list' },
      { title: 'Hidden, not gone', text: 'Hold Alt to see tucked buttons; hold Ctrl for key badges. Right-click almost anything for its menu.' },
      { title: 'One-key routines', text: 'Routines you repeat are offered once as one key (Ctrl/⌘+Alt+1…9). /macro learned lists them.', cmd: '/macro learned' },
    ] },
    { id: 'discover', name: 'Discover', icon: '✦', why: 'what\'s new, tips, ideas', steps: [
      { title: 'What\'s new', text: 'After an ⬆ Update, one small card shows the few changes that fit how you work; /whats-new any time, by round.', target: ['#up-btn:not([hidden])', '#keys-btn'], cmd: '/whats-new' },
      { title: 'Feature map', text: 'On ☰ Commands › ✦ Discover: each area with what you used and what you never tried, and ✦ Surprise me.', open: 'tool:commands', target: ['.cp-row[data-ext="tour:discover"]', RAIL('commands')] },
      { title: 'Ideas for tonight', text: 'Things to make from your board, songs, scenes and apps; one click starts the right command.', target: ['.dc-tabs [data-tab="ideas"]', '.cp-row[data-ext="tour:discover"]'], cmd: '/ideas' },
    ] },
  ];

  // ---------- daily tips: one a day at most, for what you have never used, where you are ----------
  // place: 'three' (the Lab) | 'board' | 'chat' | 'any'; used: commands that count as "tried it"
  const TIPS = [
    { id: 'shuffle-pick', place: 'three', text: 'Hold 🎲 Shuffle: a row of thumbnails, you click one (or ✦ Astra picks).', cmd: '/shuffle-pick', used: ['shuffle-pick'] },
    { id: 'again', place: 'three', text: 'Ctrl/⌘+. repeats your last action — Save, Shuffle, a frame size — without moving the mouse.', cmd: '/again list', used: ['again'] },
    { id: 'jam', place: 'three', text: '/jam: Claude and Astra take turns making a music visual on your scene, one card, best round kept.', cmd: '/jam', used: ['jam'] },
    { id: 'sequence', place: 'three', text: '▤ Sequence turns your scenes and the song into one video, right on the Lab timeline.', cmd: '/sequence', used: ['sequence', 'arrange'], tour: 'sequence' },
    { id: 'arrange', place: 'three', text: '/arrange lays your scenes on the song\'s sections: cuts on bars, a transition per section.', cmd: '/arrange', used: ['arrange'] },
    { id: 'decide', place: 'three', text: '/decide look: Astra picks a new look for the scene, with Undo.', cmd: '/decide look', used: ['decide'] },
    { id: 'kinetic', place: 'three', text: '/kinetic: 33 kinetic-type animations fitted to the safe zone, one node each.', cmd: '/kinetic', used: ['kinetic', 'motion-kit'] },
    { id: 'camera-move', place: 'three', text: '/camera-move: whip pans, rack focus, orbits — time-driven, no music needed.', cmd: '/camera-move', used: ['camera-move'] },
    { id: 'footage', place: 'three', text: '/footage: step a video frame by frame in the Lab with no song (J K L, exact timecode).', cmd: '/footage', used: ['footage', 'match-pacing'] },
    { id: 'meshy', place: 'three', text: '/meshy makes a 3D model from words (asks before spending credits) and drops it in the Lab.', cmd: '/meshy', used: ['meshy'], tour: 'apps' },
    { id: 'usual', place: 'three', text: '/usual sets the frame size you use most, in one go.', cmd: '/usual', used: ['usual'] },
    { id: 'renders', place: 'any', text: 'Every render and recording is in one queue: /renders (pause, retry, all socials at once).', cmd: '/renders', used: ['renders'], tour: 'renders' },
    { id: 'resume', place: 'any', text: '/resume takes you back to the last chat, scene (and its sequence spot) or render.', cmd: '/resume', used: ['resume'] },
    { id: 'cmdbar', place: 'any', text: 'Ctrl/⌘+; opens the command bar over any tool; plain words work (“make it 9 by 16”).', cmd: '/cmdbar', used: ['cmdbar'] },
    { id: 'whats-new', place: 'any', text: '/whats-new picks the new things that fit how you work, by round.', cmd: '/whats-new', used: ['whats-new'] },
    { id: 'board-look', place: 'chat', text: 'Chats can see your mood board now: /board look shows it to this chat (small, says the ≈ tokens).', cmd: '/board look', used: ['board-tools'], tour: 'eyes' },
    { id: 'access', place: 'chat', text: '/access lets this chat read or write in its own folders; risky things ask you first.', cmd: '/access', used: ['access'], tour: 'access' },
    { id: 'dispatch', place: 'chat', text: '/dispatch splits a video into parts several chats make at once.', cmd: '/dispatch', used: ['dispatch'] },
    { id: 'makes', place: 'chat', text: '/makes plan … makes the Lab chat and the Video chat at once, same name and mark.', cmd: '/makes', used: ['makes'] },
    { id: 'pinterest', place: 'board', text: '/board pinterest finds pins that match this board\'s vibe; ＋ Board adds them with their link.', cmd: '/board pinterest', used: [], usedKey: /pinterest/i, tour: 'eyes' },
    { id: 'vibe', place: 'board', text: '/vibe reads the board\'s palette, light and mood words — what a chat gets when you say “use my board”.', cmd: '/vibe', used: ['vibe'] },
  ];

  // ---------- Surprise me: fun things you have never tried (safe ones run, the rest go in the chat box) ----------
  const SURPRISES = [
    { cmd: '/shuffle-pick', place: 'three', why: 'thumbnails of shuffles, pick one' },
    { cmd: '/decide look', place: 'three', why: 'Astra picks a look, Undo if not' },
    { cmd: '/kinetic', place: 'three', why: 'kinetic type on your scene' },
    { cmd: '/camera-move', place: 'three', why: 'a camera move on the scene\'s timeline' },
    { cmd: '/jam', place: 'three', why: 'Claude and Astra jam a visual' },
    { cmd: '/arrange', place: 'three', why: 'your scenes on the song\'s sections' },
    { cmd: '/motion-kit', place: 'three', why: 'Hearth on screen, logo reveals, end cards' },
    { cmd: '/sequence', place: 'three', why: 'a video from your scenes' },
    { cmd: '/vibe', place: 'any', why: 'what your board feels like, in words' },
    { cmd: '/board pinterest', place: 'any', why: 'pins that match your board' },
    { cmd: '/apps discover', place: 'any', why: 'an app that fits what you do' },
    { cmd: '/meshy', place: 'any', why: 'a 3D model from words' },
    { cmd: '/suno', place: 'any', why: 'a Suno song prompt from your scene' },
    { cmd: '/studio', place: 'any', why: 'one-click pipelines: board → video, song → visualizer' },
    { cmd: '/dispatch', place: 'chat', why: 'several chats make one video' },
    { cmd: '/renders', place: 'any', why: 'the render queue and its presets' },
    { cmd: '/habits', place: 'any', why: 'what you use most and never touch' },
    { cmd: '/macro learned', place: 'any', why: 'your routines as one key' },
  ];

  // ---------- ideas for tonight, from what you have (no tokens: templates filled locally) ----------
  // ctx: { boards: [names], mood: [words], scenes: [names], songs: [names], apps: [ids] }
  // each: { id, text, why, lines: [commands run in order, safe ones only], draft: a line put in the director's box }
  function ideas(ctx = {}) {
    const q = (s) => `“${s}”`;
    const out = [];
    const b = ctx.boards?.[0]; const b2 = ctx.boards?.[1]; const sc = ctx.scenes || []; const song = ctx.songs?.[0];
    const mood = (ctx.mood || []).slice(0, 2).join(', ');
    if (b) out.push({ id: `loop:${b}`, icon: '▦', text: `Turn your ${q(b)} board into a 9:16 loop`, why: mood ? `its vibe: ${mood}` : 'its palette and light, not its pictures', lines: [`/board-use ${b}`], draft: `Make a seamless 9:16 loop with the vibe of my ${q(b)} board (palette, light, motion), not its footage.`, to: 'three' });
    if (song) out.push({ id: `jam:${song}`, icon: '♫', text: `Jam a visual for ${q(song)} with Claude and Astra`, why: 'they take turns, the best round is kept', lines: [], draft: '/jam', to: 'three' });
    if (sc.length >= 2) out.push({ id: `seq:${sc[0]}`, icon: '▤', text: `Cut ${q(sc[0])} and ${q(sc[1])} into a 15 s sequence on the song`, why: `${sc.length} scenes ready`, lines: ['/sequence'], draft: '/arrange', to: 'three' });
    if (sc[0]) out.push({ id: `socials:${sc[0]}`, icon: '⇪', text: `Render ${q(sc[0])} for Reels, TikTok and Shorts at once`, why: 'All socials in the render panel', lines: ['/renders'], draft: '', to: 'three' });
    if (sc[0]) out.push({ id: `look:${sc[0]}`, icon: '✦', text: `Let Astra pick a new look for ${q(sc[0])}`, why: 'with Undo', lines: [], draft: '/decide look', to: 'three' });
    if (b && ctx.apps?.includes('meshy')) out.push({ id: `meshy:${b}`, icon: '◆', text: `A 3D object for ${q(b)} with Meshy`, why: 'asks before spending credits', lines: [], draft: `/meshy ${mood || 'a sculptural object'} in the style of my board`, to: 'three' });
    if (ctx.apps?.includes('suno') && (sc[0] || b)) out.push({ id: `suno:${sc[0] || b}`, icon: '♪', text: `A Suno song from the vibe of ${q(sc[0] || b)}`, why: 'the prompt is typed into Suno for you', lines: [], draft: '/suno', to: 'chat' });
    if (b) out.push({ id: `pins:${b}`, icon: '📌', text: `Six more references for ${q(b2 || b)} from Pinterest`, why: 'matched to the board\'s vibe', lines: [], draft: '/board pinterest', to: 'chat' });
    if (sc[0]) out.push({ id: `kinetic:${sc[0]}`, icon: 'T', text: `Kinetic type over ${q(sc[0])}`, why: 'fitted to the 9:16 safe zone', lines: [], draft: '/kinetic', to: 'three' });
    out.push({ id: 'intro', icon: '◉', text: 'Make a 15 s social intro for Hearth', why: 'board vibe → Lab scene → sequence → render (Studio)', lines: [], draft: '/studio board-video', to: 'chat' });
    if (!b) out.push({ id: 'board-new', icon: '▦', text: 'Start a mood board for tonight\'s piece', why: 'drop pictures, clips and links', lines: ['/board'], draft: '', to: 'chat' });
    return out;
  }

  return { parseDoc, parseIndex, newSince, plainOf, wordsOf, score, pick, byArea, safeLine, SAFE, PROFILE, TOURS, TIPS, SURPRISES, ideas };
})();
if (typeof module !== 'undefined') module.exports = DiscoverData;
