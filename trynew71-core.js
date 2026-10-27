// ✦ Try what's new, rounds 66–70 (round 71, whatsnew71): the pure part, no DOM, Node-tested (dev/trynew71-test.js).
// The owner hasn't opened Hearth since rounds 66–70 shipped, and he doesn't use commands: a feature he can't find
// doesn't exist for him. So every click-first thing of those rounds (and the creative session's round-67 Lab tools)
// gets one step in a short themed tour (Paris nights · Sidequest · Music · Help when it breaks · In the Lab), run by
// trynew.js on Hearth's own guided spotlight (tour.js). A step is one plain sentence and a "Show me" click: Show me
// opens the place and rings the real button. Nothing changes unless he clicks the button itself.
//   · a step: { id, round, title, text, open, target, fallback? }
//       id: the feature (dev/checks/whatsnew71.js verifies EVERY step: its place opens and its target is a visible
//           button there, so a stale tour fails the check)
//       open: where Show me goes — 'hud' (the ✦ panel) | 'show' (a show's card) | 'settings' (Housekeeping) | 'map'
//             (Sidequest Studio › Map) | 'desk' (the Sound desk) | 'sessions' (its Sessions list) | 'railmore' (the rail's
//             ⋯ menu) | 'lab' (the three.js Lab's toolbar) | 'drawer' (the board drawer). Each one only shows a place.
//       target: the real button: CSS selectors (the first on screen wins), 'text:<label>' (a visible button whose words
//               start so) or 'menu:<label>' (a row of the open ⋯ menu)
//       fallback: what to ring when the button can't show right now (the ✦ chip on a weekday for Plan my weekend, the
//                 instrument cards before one is open…); the sentence already says when it shows
//   · progress (store trynew.tours71, this computer): { [tourId]: { state: 'done' | 'skipped' | 'later', at } }
//   · the one card after an update: "Since you were last here: N updates — take the 1-minute tours?" (sinceDue below)
const TryNew71Core = (() => {
  const SHOW = (sel) => [`dialog[open] ${sel}`]; // a show's card is a Studio dialog
  const PANEL = (sel) => [`.qh-panel ${sel}`];
  const DESK = (sel) => [`.surface.active ${sel}`];
  const CHIP = ['#rail .qh-chip'];
  const TOURS = [
    { id: 'nights', icon: '🌙', name: 'Paris nights', why: 'plan the weekend, bring a friend, the ticket, leave on time', steps: [
      { id: 'weekend', round: 66, title: '🗓 Plan my weekend', open: 'hud', target: PANEL('.wp-hud'), fallback: CHIP, text: 'From Thursday evening to Sunday, the ✦ chip has 🗓 Plan my weekend: a show, a park jam, a new place and a studio session, ready to accept.' },
      { id: 'invite', round: 67, title: '👋 Bring someone', open: 'show', target: SHOW('.iv-bring'), text: 'On a show’s card, 👋 Bring someone writes a short invite you copy or open in WhatsApp; Hearth never sends it.' },
      { id: 'ticket', round: 68, title: '🎟 My ticket', open: 'show', target: SHOW('.tk-btn'), text: '🎟 Add my ticket keeps your ticket with the show; at the door, Open my ticket shows it big and bright.' },
      { id: 'leave', round: 68, title: '⏰ Remind me to leave', open: 'show', target: SHOW('.ls-toggle'), text: '⏰ Remind me to leave rings 10 minutes before it’s time to go, with the Métro trip from your pin or Home.' },
      { id: 'beforego', round: 70, title: '🎒 Before I go', open: 'show', target: SHOW('.bg-open'), text: '🎒 Before I go is a short list to tick before you head out: ticket, phone charged, earplugs, ID.' },
      { id: 'follow', round: 70, title: '★ Follow', open: 'show', target: SHOW('.fw-btn'), text: '★ Follow an artist or a venue: when they announce a new show, the ✦ chip tells you.' },
      { id: 'metro', round: 69, title: '🚇 Métro status key', open: 'settings', target: ['text:Paris Métro status key…'], text: 'Optional: a free Métro key here lets leave reminders warn you when your line is disrupted.' },
    ] },
    { id: 'sidequest', icon: '🗺', name: 'Sidequest', why: 'your pin, the layers, errands, your photos', steps: [
      { id: 'herepin', round: 66, title: '📍 I’m here', open: 'map', target: ['.hp-btn'], text: 'Click 📍 I’m here, then your spot on the map: what’s close opens, in minutes on foot (no GPS, nothing sent).' },
      { id: 'layers', round: 66, title: 'Layers', open: 'map', target: ['.qml-open'], text: 'Layers shows every kind of pin by name, with a switch each: shows, park jams, place quests, errands, reminders.' },
      { id: 'errand', round: 67, title: '＋ Errand', open: 'map', target: ['.er-add'], text: '＋ Errand: what you need (AirPods…) and a shop; its pin says when it’s open or closes.' },
      { id: 'photos', round: 69, title: '📷 Photos in My Paris', open: 'map', target: ['.pp-folder-btn'], text: 'Your photos go with your nights and walks: 📷 From a folder… suggests which go where, or 📷 Add photos on a moment.' },
    ] },
    { id: 'music', icon: '🎛', name: 'Music', why: 'sessions, sketches on pads, a reference, your controller, your DAW', steps: [
      { id: 'sessions', round: 66, title: 'Sessions', open: 'desk', target: DESK('.bl-open'), text: 'Sessions keeps every music session of 10 minutes or more, with its 30-second sketches.' },
      { id: 'pads', round: 67, title: '🎛 Sketches on pads', open: 'sessions', target: ['.bl-panel .sp-pad-btn'], fallback: ['.bl-panel'], text: 'Each sketch has 🎛 Put on a pad (play it in your Live set) and ✂ Trim loop.' },
      { id: 'reference', round: 68, title: '🎧 Reference', open: 'desk', target: DESK('.ra-open'), text: '🎧 Reference: drop a track you love, then A ⇄ B against your sound at the same loudness.' },
      { id: 'controller', round: 69, title: '🎹 Map my controller', open: 'desk', target: DESK('.ml-open'), fallback: DESK('.wb-instrument-card'), text: 'With Serum 2 or Vital open: 🎹 Map my controller, Learn, turn a knob, pick what it moves.' },
      { id: 'daw', round: 69, title: '📤 Send to my DAW', open: 'desk', target: DESK('.dw-open'), text: '📤 Send to my DAW puts a song’s stems, mix and MIDI in a folder, lined up at bar 1 for Ableton, FL or Logic.' },
    ] },
    { id: 'help', icon: '🪲', name: 'Help when it breaks', why: 'say what was slow or broken, in one click', steps: [
      { id: 'slow', round: 67, title: '🐢 That was slow', open: 'railmore', target: ['menu:That was slow'], text: 'When Hearth stutters, ⋯ › That was slow says what the last hiccup was, with 📋 Copy report for Claude.' },
      { id: 'broke', round: 68, title: '🪲 Something broke', open: 'railmore', target: ['menu:Something broke'], text: 'When something acts up, ⋯ › Something broke says what went wrong, with Copy report and ↻ Restart Hearth.' },
    ] },
    { id: 'lab', icon: '✦', name: 'In the Lab', why: 'direction, finish lines, honest credits, the moodboard', steps: [
      { id: 'direction', round: 67, title: '✦ Direction', open: 'lab', target: DESK('.dir-chip'), text: '✦ Direction: Try 4 ways, circle what you like or not, and plain sliders like Calmer ↔ Busier.' },
      { id: 'finish', round: 67, title: '⚑ Finish line', open: 'lab', target: DESK('.fl-chip'), text: '⚑ Finish line: pick 10 s, 30 s or Full and tick a short “done when” list; ✦ Polish this gives three small steps.' },
      { id: 'credits', round: 67, title: 'Credits', open: 'lab', target: DESK('.cr-open'), text: 'Credits says who did what on this scene, AI or your hand, ready to copy under a post.' },
      { id: 'moodboard', round: 67, title: '🖼 Moodboard', open: 'drawer', target: ['.bdd .bdd-dist input'], fallback: ['.bdd'], text: 'A tile dragged into a chat now sends what it feels like, not the picture; this slider goes from Close to it to Only its spirit.' },
    ] },
  ];
  const ROUNDS = [66, 67, 68, 69, 70];
  const STEPS = TOURS.flatMap((t) => t.steps.map((s) => ({ ...s, tour: t.id })));
  const byId = (id) => TOURS.find((t) => t.id === id) || null;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // find('nights') / find('paris nights') / find('help') / find('ticket') (a step's feature → its tour)
  function find(q) {
    const n = norm(q);
    if (!n) return null;
    return byId(n) || TOURS.find((t) => norm(t.name) === n || norm(t.name).startsWith(n)) || byId(STEPS.find((s) => s.id === n || norm(s.title) === n)?.tour) || null;
  }
  const forRound = (r) => TOURS.filter((t) => t.steps.some((s) => s.round === Number(r)));

  // ---------- progress ----------
  const STATES = ['done', 'skipped', 'later'];
  function clean(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const t of TOURS) { const v = raw[t.id]; if (v && STATES.includes(v.state)) out[t.id] = { state: v.state, at: Number(v.at) || 0 }; }
    return out;
  }
  // a later 'later' never takes back 'done'
  function mark(prog, id, state, now = Date.now()) {
    const p = clean(prog);
    if (!byId(id) || !STATES.includes(state)) return p;
    if (state === 'later' && p[id]?.state === 'done') return p;
    p[id] = { state, at: now };
    return p;
  }
  const count = (prog) => { const p = clean(prog); return { done: TOURS.filter((t) => p[t.id]?.state === 'done').length, total: TOURS.length }; };
  const label = (prog) => { const c = count(prog); return `${c.done} of ${c.total} tours seen`; };
  // the tours still to take, paused ones first (done and skipped left out)
  function queue(prog, ids = null) {
    const p = clean(prog);
    const list = TOURS.filter((t) => (!ids || ids.includes(t.id)) && !['done', 'skipped'].includes(p[t.id]?.state));
    return [...list.filter((t) => p[t.id]?.state === 'later'), ...list.filter((t) => !p[t.id])];
  }
  const allDone = (prog) => count(prog).done === TOURS.length;
  // about a minute each: ~10 s a step
  const minutes = (t) => Math.max(1, Math.round(t.steps.length * 10 / 60));

  // ---------- the one card after an update ----------
  // sinceDue({ seen, rounds, offered, prog }) → null, or { updates: N } when this start comes after an update that brought
  // rounds 66–70 (or any of them) since this computer last saw What's new, the card wasn't offered yet, and a tour is left
  //   seen: the newest round this computer had seen when Hearth started (store whatsnew.seen, read before anything marks it)
  //   rounds: the rounds whose patch notes this copy has (docs/patch-notes/index.txt)
  function sinceDue({ seen, rounds = [], offered = null, prog = {} } = {}) {
    if (offered || seen == null || !Number.isFinite(Number(seen))) return null;
    const s = Number(seen);
    const fresh = [...new Set(rounds.map(Number).filter((r) => Number.isFinite(r) && r > s))];
    if (!fresh.some((r) => ROUNDS.includes(r)) || !queue(prog).length) return null;
    return { updates: fresh.length, from: Math.min(...fresh), to: Math.max(...fresh) };
  }
  const sinceText = (n) => `Since you were last here: ${n} update${n === 1 ? '' : 's'} — take the 1-minute tours?`;

  function listText(prog) {
    const p = clean(prog);
    return TOURS.map((t) => `- ${t.icon} **${t.name}** · ${t.steps.length} steps · ${t.why}${p[t.id]?.state === 'done' ? ' · ✓ seen' : p[t.id]?.state === 'skipped' ? ' · skipped' : p[t.id]?.state === 'later' ? ' · paused' : ''}`).join('\n');
  }
  return { TOURS, ROUNDS, STEPS, byId, find, forRound, clean, mark, count, label, queue, allDone, minutes, sinceDue, sinceText, listText, norm };
})();
if (typeof module !== 'undefined') module.exports = TryNew71Core;
