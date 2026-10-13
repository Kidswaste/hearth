// "What can I do here?" (round 31, quickstart): the things worth trying in each window, and how they are picked. Plain
// data and pure functions (no DOM), so dev/quickstart-test.js loads it in Node too; quickstart.js draws the card and
// runs the picks. Nothing here costs tokens: an entry only opens a feature (some features then ask before they spend).
//   place: 'chat' (any chat with an AI) · 'lab' (the Three.js Lab, its docked director included) · 'board' (the mood board)
//   need: the globals the feature lives in (all must be in this build) · only(ctx): shown only then
//   ctx(ctx): how much what's on screen asks for it (a song loaded → "React to the drums") · w: its weight otherwise
//   used: { cmds: commands that count as tried, usage: what the click log calls its button, missions: ◎ mission ids }
//   run: the action key quickstart.js knows (most entries: their id)
const QuickstartCore = (() => {
  const PLACES = ['chat', 'lab', 'board'];
  const NAMES = { chat: 'this chat', lab: 'the Lab', board: 'the board' };
  const CATALOG = [
    // ---------- a chat ----------
    { id: 'chat-recall', place: 'chat', icon: '🔎', label: 'What did we decide?', why: 'Finds decisions and open questions in all your chats, here, for free',
      need: ['RecallHooks'], only: (c) => c.messages >= 24 || c.chats >= 6, ctx: (c) => (c.messages >= 24 ? 4 : c.chats >= 6 ? 0.6 : 0), w: 0.8, used: { cmds: ['decided'], usage: /Find the answer|Remind me what we decided/, missions: ['recall'] } },
    { id: 'chat-fresh', place: 'chat', icon: '🧹', label: 'Carry on in a fresh chat', why: 'A free summary moves over; every next message costs less',
      need: ['ChatFresh'], only: (c) => c.messages >= 30, ctx: () => 3, w: 0.5, used: { cmds: ['fresh'], usage: /from a summary|Fresh start/i } },
    { id: 'chat-find', place: 'chat', icon: '⌕', label: 'Find something in this chat', why: 'Every match, one after the other',
      need: ['Commands'], only: (c) => c.messages >= 20, ctx: () => 1.6, w: 0.3, used: { cmds: ['find'], usage: /Find in this chat/ } },
    { id: 'chat-plan', place: 'chat', icon: '📝', label: 'Plan first, then do it', why: 'It writes a short plan and waits for your go-ahead',
      need: ['Missions'], ctx: (c) => (c.messages === 0 ? 1.4 : 0), w: 1.2, used: { usage: /› Plan first$/, missions: ['plan'] } },
    { id: 'chat-duo', place: 'chat', icon: '👥', label: 'Ask Claude and Astra side by side', why: 'Both answer; keep one or merge them',
      need: ['Missions'], only: (c) => c.partner, ctx: (c) => (c.messages >= 2 ? 1 : 0.4), w: 1.3, used: { usage: /› (Side by side|Debate|Answer then review|Second opinion only)$/, missions: ['duo', 'debate', 'review', 'other', 'swarm'] } },
    { id: 'chat-missions', place: 'chat', icon: '◎', label: 'Give your next message a mission', why: 'Split it up, research, ask everyone…',
      need: ['Missions'], ctx: () => 0, w: 1, used: { usage: /Mission for your next message/, missions: ['split', 'research', 'teach', 'everyone', 'jam', 'pair'] } },
    { id: 'chat-setup', place: 'chat', icon: '❖', label: 'Give it a personality and standing instructions', why: 'How it talks and what it always keeps in mind',
      need: ['Options'], ctx: (c) => (c.messages === 0 ? 1 : 0), w: 1.1, used: { cmds: ['persona', 'instructions'], usage: /Chat header › Chat options|AI setup/ } },
    { id: 'chat-board', place: 'chat', icon: '▦', label: 'Use your mood board here', why: 'The chat gets its vibe (palette, light, mood), not the files',
      need: ['BoardDrawer'], only: (c) => c.boards > 0, ctx: () => 0.8, w: 0.6, used: { cmds: ['board-use', 'board-drawer'], usage: /board drawer|Board drawer/i } },
    { id: 'chat-activity', place: 'chat', icon: '◉', label: 'See what is running', why: 'Replies, renders and helpers in one place, and what waits for you',
      need: ['Activity'], ctx: (c) => (c.busy ? 1.2 : 0), w: 0.5, used: { usage: /› Activity$/ } },
    { id: 'chat-voice', place: 'chat', icon: '🎙', label: 'Talk instead of typing', why: 'Your words go into the chat box, on this computer',
      need: ['Voice'], ctx: () => 0, w: 0.45, used: { cmds: ['voice'], usage: /Voice|Push to talk/i } },
    { id: 'chat-spending', place: 'chat', icon: '◔', label: 'Your week of spending', why: 'What each AI cost this week, and a limit if you want one',
      need: ['Budget'], ctx: () => 0, w: 0.35, used: { cmds: ['spending', 'week'], usage: /Spending|weekly limit/i } },

    // ---------- the Lab ----------
    { id: 'lab-describe', place: 'lab', icon: '✦', label: 'Describe it', why: 'A scene from your words, made here (0 tokens)',
      need: ['LabInstantHook'], ctx: (c) => (c.empty ? 5 : 0), w: 1.2, used: { cmds: ['describe'], usage: /Describe it/, missions: ['lab-describe'] } },
    { id: 'lab-gallery', place: 'lab', icon: '🖼', label: 'Start from something like…', why: 'Tunnels, chrome blobs, retro grids, your own scenes',
      need: ['LabGalleryHook'], ctx: (c) => (c.empty ? 4.5 : 0), w: 0.9, used: { cmds: ['gallery'], usage: /Start from something/, missions: ['lab-start'] } },
    { id: 'lab-song', place: 'lab', icon: '♪', label: 'Load a song', why: 'Then everything can move with the music',
      need: ['ThreeLab'], only: (c) => !c.song, ctx: (c) => (c.empty ? 0.5 : 2), w: 0.8, used: { usage: /Load audio|Load music|Load a song/i } },
    { id: 'lab-drums', place: 'lab', icon: '🥁', label: 'React to the drums', why: 'The drums, the bass and the voice each drive their own part',
      need: ['Missions'], only: (c) => c.song && c.director, ctx: () => 5, w: 1, used: { cmds: ['stems'], usage: /React to the drums/, missions: ['lab-stems'] } },
    { id: 'lab-react', place: 'lab', icon: '〰', label: 'Make it react to the music', why: 'Kick, bass and loudness move the right sliders (with Undo)',
      need: ['LabEasy'], only: (c) => c.song && !c.empty, ctx: () => 3.2, w: 0.8, used: { cmds: ['make-it-react', 'react-to'], usage: /react to the music/i, missions: ['lab-react'] } },
    { id: 'lab-musicvideo', place: 'lab', icon: '🎬', label: 'A music video from this song', why: 'A plan per section first; nothing renders until you say',
      need: ['AutoEdit'], only: (c) => c.song, ctx: () => 2, w: 0.6, used: { cmds: ['music-video'], usage: /music video/i } },
    { id: 'lab-polish', place: 'lab', icon: '✨', label: 'Make it look finished', why: 'Light, color, glow and motion fixed from the picture (0 tokens)',
      need: ['AutoPolish'], only: (c) => !c.empty, ctx: () => 2, w: 0.9, used: { cmds: ['autopolish'], usage: /look finished/i, missions: ['lab-polish'] } },
    { id: 'lab-lookmatch', place: 'lab', icon: '🎨', label: 'Make it look like a picture', why: 'Its colors, light and grain onto your scene',
      need: ['LookMatch'], only: (c) => !c.empty, ctx: (c) => (c.boardPictures > 0 ? 2 : 0.6), w: 0.8, used: { cmds: ['look-match'], usage: /look like this/i } },
    { id: 'lab-variations', place: 'lab', icon: '👥', label: '4 variations of this scene', why: 'A crew tries them side by side; the cost shows first',
      need: ['Missions'], only: (c) => c.director && !c.empty, ctx: () => 0.6, w: 0.6, used: { cmds: ['crew'], usage: /variations/i, missions: ['lab-variations'] } },
    { id: 'lab-history', place: 'lab', icon: '⟲', label: 'Go back to an earlier version', why: 'Every version as pictures: scrub, compare, restore',
      need: ['ThreeHistoryUI'], only: (c) => !c.empty && c.layers > 0, ctx: () => 0, w: 0.55, used: { cmds: ['history', 'back'], usage: /Time machine|History|earlier version/i } },
    { id: 'lab-vertical', place: 'lab', icon: '📱', label: 'A 9:16 version for socials', why: 'The frame goes vertical and the director recomposes it',
      need: ['Missions'], only: (c) => c.director && !c.empty, ctx: () => 0, w: 0.5, used: { cmds: ['size', 'usual'], usage: /1080×1920|9:16|Frame sizes/, missions: ['lab-vertical'] } },
    { id: 'lab-share', place: 'lab', icon: '⇪', label: 'Share the scene as one file', why: 'Everything it uses in one .hearthpack',
      need: ['LabPacksHook'], only: (c) => !c.empty, ctx: () => 0, w: 0.3, used: { cmds: ['pack'], usage: /hearthpack|› Share$/i } },

    // ---------- the board ----------
    { id: 'board-add', place: 'board', icon: '＋', label: 'Add pictures, clips or links', why: 'Or drop them here, or paste',
      need: ['Board'], only: (c) => c.items === 0, ctx: () => 5, w: 1, used: {} },
    { id: 'board-template', place: 'board', icon: '▤', label: 'Start from a template', why: 'Moodboard grids, storyboards, shot lists…',
      need: ['Board'], only: (c) => c.items === 0, ctx: () => 3, w: 0.8, used: { usage: /New from a template/ } },
    { id: 'board-pins', place: 'board', icon: '📌', label: 'Find images like this', why: 'Pinterest and more, matched to this board\'s vibe',
      need: ['PinboardHook'], ctx: (c) => (c.pictures > 0 ? 4.5 : 0.8), w: 1, used: { cmds: ['find-images'], usage: /Find images|Images like this/i, missions: ['find-images'] } },
    { id: 'board-vibe', place: 'board', icon: '◐', label: 'Read its vibe', why: 'The palette, light and mood words a chat gets from it',
      need: ['BoardDrawer'], only: (c) => c.pictures > 0, ctx: (c) => (c.pictures >= 3 ? 2 : 1), w: 0.8, used: { cmds: ['vibe'], usage: /vibe/i } },
    { id: 'board-tolab', place: 'board', icon: '✦', label: 'Give its vibe to the Lab', why: 'The Three Director gets it in its message box (never the footage)',
      need: ['Board'], only: (c) => c.pictures > 0 && c.director, ctx: () => 1.5, w: 0.8, used: { cmds: ['board-to-lab'], usage: /Give the vibe/ } },
    { id: 'board-link', place: 'board', icon: '🔗', label: 'Link it to a chat', why: 'That chat works with this board from then on',
      need: ['Board'], only: (c) => c.items > 0 && !c.linked, ctx: () => 1, w: 0.6, used: { usage: /Link to a chat/ } },
    { id: 'board-present', place: 'board', icon: '▶', label: 'Present it', why: 'Fly from frame to frame, full screen',
      need: ['Board'], only: (c) => c.items >= 3, ctx: () => 0, w: 0.4, used: { cmds: ['board-present'], usage: /› Present$|Start {2}P/ } },
  ];
  const byId = new Map(CATALOG.map((e) => [e.id, e]));

  // sig: { counts: { cmd: n }, usage: [keys used at least once], missions: [ids seen in this chat], tried: [entry ids] }
  function isUsed(e, sig = {}) {
    const u = e.used || {};
    if ((sig.tried || []).includes(e.id)) return true;
    if ((u.cmds || []).some((n) => (sig.counts || {})[n] > 0)) return true;
    if (u.usage && (sig.usage || []).some((k) => u.usage.test(k))) return true;
    if ((u.missions || []).some((m) => (sig.missions || []).includes(m))) return true;
    return false;
  }
  const safe = (fn, c, d) => { try { return fn ? fn(c) : d; } catch { return d; } };
  // what's worth trying here now: in this build (has), right for what's on screen (only), not tried yet; what the
  // screen asks for first (ctx), then the entry's own weight; the catalog's order breaks ties. n: 3–5 on the card.
  function pick(place, c = {}, { has = () => true, sig = {}, hide = [], n = 5 } = {}) {
    const out = [];
    CATALOG.forEach((e, i) => {
      if (e.place !== place || hide.includes(e.id)) return;
      if (!(e.need || []).every((g) => has(g))) return;
      if (e.only && !safe(e.only, c, false)) return;
      if (isUsed(e, sig)) return;
      const fit = Number(safe(e.ctx, c, 0)) || 0;
      out.push({ e, s: fit + (e.w || 0), fit, i });
    });
    out.sort((a, b) => b.s - a.s || a.i - b.i);
    return out.slice(0, Math.max(0, n)).map((x) => ({ ...x.e, fit: x.fit > 0.9 }));
  }
  // the window on screen, from the app's active id: an AI's chat (native), the Lab, the board; null elsewhere
  function placeOf(activeId, agent) {
    if (activeId === 'tool:three' || agent?.dock === 'three') return 'lab';
    if (activeId === 'tool:board') return 'board';
    if (agent && agent.mode === 'native') return 'chat';
    return null;
  }
  // first time a window is opened: the card once, by itself, then never again unless asked (st: { seen, gone })
  function shouldAuto(place, st = {}) {
    if (!PLACES.includes(place)) return false;
    return !(st.seen || {})[place] && !(st.gone || {})[place];
  }
  return { PLACES, NAMES, CATALOG, byId, isUsed, pick, placeOf, shouldAuto };
})();
if (typeof module !== 'undefined') module.exports = QuickstartCore;
