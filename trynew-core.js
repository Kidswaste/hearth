// ✦ Try what's new (round 64, newtour64): the pure part, no DOM, Node-tested (dev/trynew-test.js). Rounds 61–63 brought
// 13 things the owner hasn't tried yet (quests in Paris, the ✦ tracker, live Serum 2 / Vital, park jams, shows, playtest
// notes…). Each gets one short hands-on path (30–60 s, 1–3 steps) that trynew.js runs on Hearth's own guided spotlight
// (tour.js: a ring on the real control + one small card). Here: the paths as data, and the progress rules.
// The owner doesn't use commands: every step teaches WHERE TO CLICK (no step suggests typing a command).
//   · a step: { title, text, open?, target, clickNext?, need? }
//       open: where it opens first — 'studio:home' | 'studio:rewards' | 'week' | 'review' | 'desk' | 'lab' | 'sounds'
//             (every one only shows a place: nothing is saved by opening it)
//       target: CSS selectors (the first one on screen wins) or 'text:<button label>' (a visible button whose words start so)
//       clickNext: clicking the ringed control is doing it; the path follows to its next step by itself
//       need: 'audiodoctor' = shown only when the audio check exists in this copy (audiodoctor64)
//   · progress (store trynew.progress, this computer): { [id]: { state: 'tried' | 'skipped' | 'later', at } }
//       tried = the path was finished or its ringed control clicked; skipped = "not for me" (one click away); later = paused
const TryNewCore = (() => {
  // (selectors are looked up in the window on screen first, then anywhere: a dialog, the rail)
  const CHIP = ['#rail .qh-chip'];
  const PLAY = ['[data-feature="Play"]'];
  const SHOWS = ['[aria-label^="Shows this week"]'];
  const GUIDE = ['.qj-paris-guide'];
  const MAPKEY = ['.qj-map-key']; // Sidequest Studio › Paris after hours (opening the map is the owner's click: mapfirst64 puts the guide on it then)
  const PANEL = (sel) => [`.qh-panel ${sel}`]; // (clickfirst64) the ✦ tracker panel's own buttons
  const LABMORE = ['[data-feature="Lab more"]'];
  const PATHS = [
    // ---------- round 61 ----------
    { id: 'tracker', round: 61, icon: '✦', name: 'Quest tracker', why: 'your quest and its next step, on every screen', steps: [
      { title: 'Open the Paris map', open: 'studio:home', target: MAPKEY, clickNext: true, text: 'In Sidequest Studio: click Paris after hours, your Paris map.' },
      { title: 'Open the Paris guide', target: GUIDE, clickNext: true, text: 'Under the map: click Paris guide.' },
      { title: 'Get my AirPods', target: ['[data-personal="airpods"]'], clickNext: true, text: 'Click Get my AirPods: the quest goes into your notebook (Apple Opéra, pickup booked first).' },
      { title: 'The ✦ chip', target: CHIP, clickNext: true, text: 'This chip in the rail now shows your quest and its next step, on every screen. Click it: check a step off, take today’s picks, plan your week.' },
    ] },
    { id: 'paris', round: 61, icon: '🗺', name: 'Paris map + guide', why: '36 places worth the trip, each a small quest', steps: [
      { title: 'Open the Paris map', open: 'studio:home', target: MAPKEY, clickNext: true, text: 'In Sidequest Studio: click Paris after hours. The guide’s places worth the trip (Philharmonie, Petit Bain, Superfly…) come onto the map.' },
      { title: 'Places, shows, walks', target: ['.qmf-strip', ...GUIDE], text: 'This row shows or hides each layer: Places · Shows · My walks · Visited (Paris guide, under the map, filters them: shows, records, night, free…).' },
      { title: 'A place quest', target: ['.qj-paris-start', 'text:Start this quest'], clickNext: true, text: 'Click a pin, then Start this quest: go → do one thing there → bring proof home.' },
    ] },
    { id: 'shows', round: 61, icon: '🎟', name: 'This week’s shows', why: 'Shotgun + DICE, on the map', steps: [
      { title: 'Open the Paris map', open: 'studio:home', target: MAPKEY, clickNext: true, text: 'In Sidequest Studio: click Paris after hours.' },
      { title: 'Shows this week', target: ['.qmf-chip[data-layer="shows"]', ...SHOWS], text: 'The Shows layer (and the Shows this week button over the map, or ✦ chip › ⋯ More › Shows this week…): Paris shows from Shotgun and DICE, venues as pins, a day-by-day list. A show’s card turns it into a quest in one click.' },
    ] },
    { id: 'livevst', round: 61, icon: '🎹', name: 'Live Serum 2 / Vital', why: 'play through your UA interface', steps: [
      { title: 'Pick your interface', open: 'desk', target: ['select[aria-label="Audio output"]', 'text:Set up live audio'], text: 'In the Sound desk: choose your UA interface in Audio output (ASIO first, WASAPI as the fallback), then Buffer 128 or 64. First time only: click Set up live audio (1–3 min, once).' },
      { title: 'Check the audio', need: 'audiodoctor', open: 'desk', target: ['.ad-desk-check', 'text:🎚 Check my audio setup', 'select[aria-label="Audio output"]', 'text:Set up live audio'], text: 'No sound, crackles or no ASIO? Click 🎚 Check my audio setup: the runtime, ASIO and your UA interface, MIDI, Serum 2 / Vital and a quiet 2-second test, with a fix button on anything that needs one.' },
    ] },
    { id: 'preset', round: 61, icon: '✦', name: '✦ Preset window', why: 'describe a sound, hear it live', steps: [
      { title: 'Describe a sound', open: 'desk', target: ['.ph-win .ph-input', '.ph-pill'], text: 'In this little window over the Sound desk, type a sound (“dark reese bass with slow movement”) and press Enter: Claude or Astra sets the plugin’s real controls, live. About 1.5k tokens a request.' },
      { title: 'Undo, redo, save', open: 'desk', target: ['.ph-win .ph-undo', '.ph-pill'], text: 'Type a follow-up (“brighter”), step back ↶ or forward ↷ through each AI change, and Save keeps it as a named preset.' },
    ] },
    // ---------- round 62 ----------
    { id: 'week', round: 62, icon: '🗓', name: 'Week plan + review', why: '3–5 quests on days, then how it went', steps: [
      { title: 'The ✦ chip', open: 'studio:home', target: CHIP, clickNext: true, text: 'Click the ✦ chip in the rail.' },
      { title: 'Plan your week', target: [...PANEL('.cf-plan'), ...CHIP], clickNext: true, text: 'Its This week part: click Plan your week (See the plan once you have one).' },
      { title: 'Your week', open: 'week', target: ['.wq-panel .wq-days', '.wq-panel'], text: '3–5 quests: shows, places near that night’s venue, a park session on the best dry day. Drag them onto days; Accept keeps them. On Sunday, the chip’s Week in review › shows how it went.' },
    ] },
    { id: 'park', round: 62, icon: '🌳', name: 'Park jam → song', why: 'park mode, a loop, then arrange', steps: [
      { title: 'Park mode', open: 'desk', target: ['.wb-park-toggle'], text: 'Click 🌳 Park mode: the laptop’s own output when the UA isn’t plugged in, a safe buffer, battery-friendly settings, remembered per park. Click again: everything back.' },
      { title: 'Capture the moment', open: 'desk', target: ['.wb-park > summary', '.wb-park-toggle'], text: 'Open Park jam · capture the moment, then Record loop: 4 / 8 / 16 bars of what you play (from your first note), with 10 s of park ambience underneath.' },
      { title: 'Arrange loops', open: 'desk', target: ['.cf-arrange', 'text:Arrange', '.wb-park-toggle'], text: 'Click Arrange loops: your takes on 4 lanes, snapped to bars; repeat, trim, fade; export a mix, stems and the MIDI.' },
    ] },
    { id: 'showprep', round: 62, icon: '🎫', name: 'Show night', why: 'get ready, then “how was it?”', steps: [
      { title: 'Get ready', open: 'studio:home', target: [...MAPKEY], clickNext: true, text: 'Click Paris after hours, then a show’s pin › Get ready: doors and start in Paris time, the nearest Métro, a listen link per artist, a reminder on the day.' },
      { title: 'The ✦ chip', target: CHIP, clickNext: true, text: 'A show you made a quest: its card in the ✦ chip has Get ready and, after the night, How was it? (a rating, one moment, a photo). Click the chip.' },
      { title: 'Shows I went to', target: [...PANEL('.cf-more'), ...CHIP], text: '⋯ More › Shows I went to…: every night you logged; venues you’ve been to get a ✓ on the map.' },
    ] },
    { id: 'playnotes', round: 62, icon: '🎮', name: 'Playtest notes (F8)', why: 'a note with a picture, mid-game', steps: [
      { title: 'Play, then F8', open: 'lab', target: PLAY, text: 'Click Play, then press F8 in the game (or F › ✎ Note): a picture of that moment, the time, the player position, the frame rate.' },
      { title: 'The playtest log', open: 'lab', target: [...LABMORE, ...PLAY], text: 'Back here: ⋯ › Capture & playtest › ✎ Playtest log. Click a note to return to that moment, or Fix this to hand it to the Three Director.' },
    ] },
    // ---------- round 63 ----------
    { id: 'walk', round: 63, icon: '🚶', name: 'Quest walk', why: 'an afternoon route, Métro to Métro', steps: [
      { title: 'The ✦ chip', open: 'studio:home', target: CHIP, clickNext: true, text: 'Click the ✦ chip in the rail.' },
      { title: 'Make a walk', target: [...PANEL('.cf-walk'), ...CHIP], text: 'Click Make a walk (or Plan a walk on the Paris map): 3–5 places you haven’t visited, Métro to Métro (about 2 h), on the Paris map. A preview first; Save makes it a quest the ✦ chip follows stop by stop.' },
    ] },
    { id: 'soundbank', round: 63, icon: '🎛', name: 'Sound bank', why: 'every Serum 2 / Vital preset, searchable', steps: [
      { title: 'Sound bank', open: 'desk', target: ['.cf-soundbank', '.wb-park-toggle'], clickNext: true, text: 'In the Sound desk’s top row: click Sound bank.' },
      { title: 'Find a sound', open: 'sounds', target: ['.sb-win input', '.sb-win'], text: 'Every Serum 2 / Vital preset you have: type to search, hover a row to hear 3 s, click it to play it live, ★ and ≈ similar.' },
      { title: 'Previews and folders', open: 'sounds', target: ['.sb-win [aria-label="Sound bank menu"]', '.sb-win'], text: 'Click ⋯: make previews (in the background, never touching your live sound) and include your plugins’ own folders, read-only.' },
    ] },
    { id: 'hitchmap', round: 63, icon: '📍', name: 'Hitch map', why: 'where Clink stutters', steps: [
      { title: 'Record the hitch map', open: 'lab', target: [...LABMORE, ...PLAY], text: 'Click ⋯ › Capture & playtest › ● Record the hitch map (or in the game: F › ● Record). It notes where you were and how long each frame took (about 0.02 ms a frame).' },
      { title: 'Play, then look', open: 'lab', target: PLAY, text: 'Click Play and play a while. Then ⋯ › Capture & playtest › ▦ Hitch map: where Clink stutters, the worst spots with pictures, Jump there and Fix this.' },
    ] },
    { id: 'rewards', round: 63, icon: '🎁', name: 'Real rewards', why: 'treats that cost XP', steps: [
      { title: 'The ✦ chip', open: 'studio:home', target: CHIP, clickNext: true, text: 'Click the ✦ chip in the rail.' },
      { title: 'Rewards', target: [...PANEL('[data-k="rw-all"]'), ...CHIP], clickNext: true, text: 'Its Rewards part: click All rewards › (Pick one when you have none yet). The chip shows the XP to your next reward; claim it there with a confirm.' },
      { title: 'Set a reward', open: 'studio:rewards', target: ['text:+ Add a reward', '[data-page="rewards"]'], text: 'Click + Add a reward: a treat that costs XP (“new record at Superfly, 300 XP”, “concert fund +10 €, 500 XP”). A savings-jar note; Hearth never touches money.' },
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
