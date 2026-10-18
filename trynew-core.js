// ✦ Try what's new (round 64, newtour64): the pure part, no DOM, Node-tested (dev/trynew-test.js). Rounds 61–63 brought
// 13 things the owner hasn't tried yet (quests in Paris, the ✦ tracker, live Serum 2 / Vital, park jams, shows, playtest
// notes…). Each gets one short hands-on path (30–60 s, 1–3 steps) that trynew.js runs on Hearth's own guided spotlight
// (tour.js: a ring on the real control + one small card). Here: the paths as data, and the progress rules.
//   · a step: { title, text, open?, target, cmd?, need? }
//       open: where it opens first — 'chat' | 'studio:world' | 'studio:rewards' | 'week' | 'review' | 'desk' | 'lab' | 'sounds'
//             (every one only shows a place: nothing is saved by opening it)
//       target: CSS selectors (the first visible wins) or 'text:<button label>' (a visible button whose words start so)
//       cmd: the exact command the owner can run for real ("Try it" puts it in the chat box: Enter does it)
//       need: 'audiodoctor' = shown only when /audio doctor exists in this copy (audiodoctor64)
//   · progress (store trynew.progress, this computer): { [id]: { state: 'tried' | 'skipped' | 'later', at } }
//       tried = the path was finished or its command tried; skipped = "not for me" (still one click away); later = paused
const TryNewCore = (() => {
  const CHAT = ['.surface.active .composer textarea'];
  const CHIP = ['#rail .qh-chip'];
  const PLAY = ['.surface.active [data-feature="Play"]', '[data-feature="Play"]'];
  const SHOWS = ['.surface.active [aria-label^="Shows this week"]'];
  const PATHS = [
    // ---------- round 61 ----------
    { id: 'tracker', round: 61, icon: '✦', name: 'Quest tracker', why: 'your quest and its next step, on every screen', steps: [
      { title: 'Start a quest', open: 'chat', target: CHAT, cmd: '/quest add airpods', text: 'Try it puts “/quest add airpods” in the chat box: press Enter and the Get my AirPods quest starts (pickup booked first).' },
      { title: 'The ✦ chip', target: CHIP, text: 'This chip in the rail shows your quest and its next step, on every screen. Click it (or Ctrl/⌘+Shift+O) to check a step off or take today’s picks.' },
    ] },
    { id: 'paris', round: 61, icon: '🗺', name: 'Paris map + guide', why: '36 places worth the trip, each a small quest', steps: [
      { title: 'Your Paris map', open: 'studio:world', target: ['.surface.active .qj-atlas-pin'], cmd: '/quest paris', text: '“/quest paris” adds the guide to this map: 36 places worth the trip (Philharmonie, Petit Bain, Superfly…), each a pin with a 3-step quest.' },
      { title: 'A place quest', open: 'studio:world', target: ['.surface.active .qj-paris-start'], cmd: '/quest go canal', text: 'Pick a pin, then this: go → do one thing there → bring proof home. Filter by shows, records, night, food, free or sunset.' },
    ] },
    { id: 'shows', round: 61, icon: '🎟', name: 'This week’s shows', why: 'Shotgun + DICE, on the map', steps: [
      { title: 'Shows this week', open: 'studio:world', target: SHOWS, cmd: '/shows week', text: 'Paris shows from Shotgun and DICE, venues as pins, a day-by-day list. Checked once a day at most, only when you ask. One click turns a show into a quest.' },
    ] },
    { id: 'livevst', round: 61, icon: '🎹', name: 'Live Serum 2 / Vital', why: 'play through your UA interface', steps: [
      { title: 'Pick your interface', open: 'desk', target: ['.surface.active select[aria-label="Audio output"]', 'text:Set up live audio'], text: 'Choose your UA interface here (ASIO first, WASAPI as the fallback), then Buffer 128 or 64. First time only: Set up live audio (1–3 min, once).' },
      { title: 'Check the audio', need: 'audiodoctor', target: CHAT, cmd: '/audio doctor', open: 'chat', text: 'Something off (no sound, crackles, no ASIO)? /audio doctor checks the interface, the driver and the buffer in one go.' },
    ] },
    { id: 'preset', round: 61, icon: '✦', name: '✦ Preset window', why: 'describe a sound, hear it live', steps: [
      { title: 'Describe a sound', open: 'desk', target: ['.surface.active .ph-win .ph-input', '.surface.active .ph-pill'], cmd: '/preset dark reese bass with slow movement', text: 'Type a sound here (“dark reese bass with slow movement”): Claude or Astra writes it with the plugin’s real controls, live. About 1.5k tokens a request.' },
      { title: 'Undo, redo, save', open: 'desk', target: ['.surface.active .ph-win .ph-undo', '.surface.active .ph-pill'], text: 'Follow up (“brighter”), step back or forward through each AI change, and Save keeps it as a named preset.' },
    ] },
    // ---------- round 62 ----------
    { id: 'week', round: 62, icon: '🗓', name: 'Week plan + review', why: '3–5 quests on days, then how it went', steps: [
      { title: 'Plan my week', open: 'week', target: ['.wq-panel .wq-days', '.wq-panel'], cmd: '/quest week', text: '3–5 quests for the coming week: shows, places near that night’s venue, a park session on the best dry day. Drag them onto days; nothing is kept until you accept.' },
      { title: 'Week in review', open: 'review', target: ['.wq-panel'], cmd: '/quest review', text: 'Quests done, XP, your streak of weeks out, the moments you collected; save it as a page in Sidequest Studio.' },
    ] },
    { id: 'park', round: 62, icon: '🌳', name: 'Park jam → song', why: 'park mode, a loop, then arrange', steps: [
      { title: 'Park mode', open: 'desk', target: ['.surface.active .wb-park-toggle'], cmd: '/jam park buttes', text: 'One tap: the laptop’s own output when the UA isn’t plugged in, a safe buffer, battery-friendly settings, remembered per park. Off puts everything back.' },
      { title: 'Capture the moment', open: 'desk', target: ['.surface.active .wb-park > summary', '.surface.active .wb-park-toggle'], text: 'Record a 4 / 8 / 16-bar loop of what you play (it starts on your first note) with 10 s of park ambience underneath.' },
      { title: 'Arrange', open: 'desk', target: ['text:Arrange', '.surface.active .wb-park-toggle'], cmd: '/song', text: 'Your park takes on 4 lanes, snapped to bars: repeat, trim, fade, re-play through another preset; export a mix, stems and the MIDI.' },
    ] },
    { id: 'showprep', round: 62, icon: '🎫', name: 'Show night', why: 'get ready, then “how was it?”', steps: [
      { title: 'Get ready', open: 'studio:world', target: SHOWS, cmd: '/shows prep ', text: 'Pick a show: doors and start in Paris time, the nearest Métro, a listen link per artist, a calendar file and an optional reminder on the day.' },
      { title: 'How was it?', open: 'chat', target: CHAT, cmd: '/shows went ', text: 'After the night: a rating, one moment and a photo go into Shows I went to (/shows log), and count as the show quest’s proof.' },
    ] },
    { id: 'playnotes', round: 62, icon: '🎮', name: 'Playtest notes (F8)', why: 'a note with a picture, mid-game', steps: [
      { title: 'Play, then F8', open: 'lab', target: PLAY, text: 'Press ▶ Play, then F8 in the game: a picture of that moment, the time, the player position and the frame rate. Shift+F8 adds typed or spoken words.' },
      { title: 'Back in the Lab', open: 'lab', target: PLAY, cmd: '/playtest notes', text: '“3 notes from this playtest”: click one to return to that moment, or Fix this to draft it for the Three Director. Costs nothing until you press the key.' },
    ] },
    // ---------- round 63 ----------
    { id: 'walk', round: 63, icon: '🚶', name: 'Quest walk', why: 'an afternoon route, Métro to Métro', steps: [
      { title: 'Ask for a walk', open: 'studio:world', target: ['.surface.active .qj-atlas-pin'], cmd: '/quest walk belleville 3h', text: '3–5 Paris places you haven’t visited, in the best order, fitting the time you ask (ending at tonight’s show if you have one). A preview first: saving it is your call.' },
      { title: 'The route', open: 'studio:world', target: ['.surface.active [aria-label^="Walk preview"]', '.surface.active .qj-atlas-pin'], text: 'The dotted route is on the map: “Open walking route” goes to Google Maps, Save makes it a quest the ✦ chip follows stop by stop.' },
    ] },
    { id: 'soundbank', round: 63, icon: '🎛', name: 'Sound bank', why: 'every Serum 2 / Vital preset, searchable', steps: [
      { title: 'Find a sound', open: 'sounds', target: ['.sb-win input', '.sb-win'], cmd: '/sounds dark', text: 'Every Serum 2 / Vital preset you have, in one place: search, tags, hover to hear a 3-second preview, click to play it live, ★ and ≈ similar.' },
      { title: 'Previews and folders', open: 'sounds', target: ['.sb-win [aria-label="Sound bank menu"]', '.sb-win'], text: '⋯ makes previews (in the background, never touching your live sound) and can include your plugins’ own folders, read-only.' },
    ] },
    { id: 'hitchmap', round: 63, icon: '📍', name: 'Hitch map', why: 'where Clink stutters', steps: [
      { title: 'Turn it on, play', open: 'lab', target: PLAY, cmd: '/playtest hitchmap on', text: 'With the hitch map on, ▶ Play records where you were and how long each frame took (about 0.02 ms a frame). Off by default; also on the right-click in ▶ Play.' },
      { title: 'After playing', open: 'lab', target: PLAY, cmd: '/playtest hitchmap', text: 'A heat map of where Clink stutters, the worst spots with pictures, Jump there and Fix this for the Three Director.' },
    ] },
    { id: 'rewards', round: 63, icon: '🎁', name: 'Real rewards', why: 'treats that cost XP', steps: [
      { title: 'Set a reward', open: 'studio:rewards', target: ['text:+ Add a reward', '.surface.active [data-page="rewards"]'], cmd: '/reward add new record at Superfly 300', text: 'Rewards that cost XP (“new record at Superfly, 300 XP”, “concert fund +10 €, 500 XP”). A savings-jar note; Hearth never touches money.' },
      { title: 'Your next reward', target: CHIP, text: 'The ✦ tracker shows “120 XP to your next reward”; claim it there with a confirm. A small weekly streak bonus comes by itself.' },
    ] },
  ];
  const ROUNDS = [...new Set(PATHS.map((p) => p.round))];
  const byId = (id) => PATHS.find((p) => p.id === id) || null;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // find('walk') / find('park jam') / find('rewards') / find('✦ preset') → the path
  function find(q) {
    const n = norm(q);
    if (!n) return null;
    return byId(n) || PATHS.find((p) => norm(p.name) === n || norm(p.name).startsWith(n)) || PATHS.find((p) => n.length > 1 && norm(`${p.id} ${p.name} ${p.why}`).includes(n)) || null;
  }
  // the steps this copy can show (a step that needs a feature that isn't here yet is left out)
  const stepsFor = (p, has = {}) => p.steps.filter((s) => !s.need || has[s.need]);

  // ---------- progress ----------
  const STATES = ['tried', 'skipped', 'later'];
  // clean(raw) → only known paths and states (a store value from an older or newer copy never breaks anything)
  function clean(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const p of PATHS) { const v = raw[p.id]; if (v && STATES.includes(v.state)) out[p.id] = { state: v.state, at: Number(v.at) || 0 }; }
    return out;
  }
  // mark(prog, id, state, now) → a new progress object; 'tried' is never taken back by a later 'later' (it stays tried)
  function mark(prog, id, state, now = Date.now()) {
    const p = clean(prog);
    if (!byId(id) || !STATES.includes(state)) return p;
    if (state === 'later' && p[id]?.state === 'tried') return p;
    p[id] = { state, at: now };
    return p;
  }
  const isTried = (prog, id) => clean(prog)[id]?.state === 'tried';
  // count(prog, round?) → { tried, total, skipped }
  function count(prog, round = null) {
    const p = clean(prog); const list = PATHS.filter((x) => round == null || x.round === round);
    return { tried: list.filter((x) => p[x.id]?.state === 'tried').length, skipped: list.filter((x) => p[x.id]?.state === 'skipped').length, total: list.length };
  }
  const label = (prog, round = null) => { const c = count(prog, round); return `${c.tried} of ${c.total} tried`; };
  // queue(prog, round?) → the paths still to try, in order (paused ones first, then new ones; skipped and tried last out)
  function queue(prog, round = null) {
    const p = clean(prog);
    const list = PATHS.filter((x) => (round == null || x.round === round) && !['tried', 'skipped'].includes(p[x.id]?.state));
    return [...list.filter((x) => p[x.id]?.state === 'later'), ...list.filter((x) => !p[x.id])];
  }
  const next = (prog, round = null) => queue(prog, round)[0] || null;
  const allTried = (prog) => count(prog).tried === PATHS.length;
  // the list as chat text
  function listText(prog) {
    const p = clean(prog);
    return ROUNDS.map((r) => `**Round ${r}** · ${label(prog, r)}\n${PATHS.filter((x) => x.round === r).map((x) => `- ${x.icon} ${x.name} · \`/try ${x.id}\` · ${x.why}${p[x.id]?.state === 'tried' ? ' · ✓ tried' : p[x.id]?.state === 'skipped' ? ' · skipped' : p[x.id]?.state === 'later' ? ' · paused' : ''}`).join('\n')}`).join('\n');
  }
  return { PATHS, ROUNDS, byId, find, stepsFor, clean, mark, isTried, count, label, queue, next, allTried, listText, norm };
})();
if (typeof module !== 'undefined') module.exports = TryNewCore;
