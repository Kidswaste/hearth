// The app map: what Hearth is and how its pieces fit, for both engines (Claude and Astra) when they direct a tool.
// Read on demand only (three_do { cmd: "help", topic } in the Lab, hearth_help { topic } elsewhere); the system
// prompt carries one short line pointing here (LINE, ≈ 60 tokens), so nothing grows on every message.
// Keep each topic short and factual: it is what a fresh engine reads before picking up the owner's work.

const TOPICS = {
  app: `HEARTH is the owner's desktop app: one window for their AI agents. Native chats run Claude (Claude Code) and Astra (Codex / ChatGPT) on the owner's own subscriptions. Directors are chats docked next to a tool: the Three Director beside the Three.js Lab, the Video Director beside Video Review, Forge Debug beside their game.
  Each director chat owns its own Lab scene: your tool calls reach your chat's scene (on screen, or backstage while the owner looks at another chat).
  Claude and Astra are interchangeable directors: same tools, same guide, same chat, same scene. Hearth keeps the chat's task state for whoever runs next (topic handoff).
  Everything is drivable by chat commands (/name args); suggest them to the owner, run Lab ones yourself (topic commands).
  The owner doesn't write code; they describe, then shape results with sliders, looks, frame sizes and the timeline. They want few choices: decide small things yourself.
  Topics: lab, nodes, react, commands, handoff, habits, video, capture, then the Lab's own (layers, sliders, keyframes, timeline, filters, looks, audio, refs, notes, scene, live, games, frame, bigcode).`,
  lab: `THE LAB'S MODEL (After Effects with code), bottom up:
  sketch (one per director chat; the owner's other sketches stay untouched)
  → layers, stacked bottom first; each is its own three.js module (renderer, scene, camera), with opacity, blend, x / y / scale / rotate and an in / out time on the song with fades. Filter layers (ascii, vhs, glitch, crt, glow…) restyle every layer below them.
  → per layer: tweak() sliders (the owner's knobs: Save, Shuffle, undo, ♪ links to the music), keyframes on slider values and layer settings, looks (saved slider sets, morphed by cues).
  → node graphs: the Nodes view (Alt+N) shows a layer as nodes + wires; the graph compiles to the layer's code and its knobs are the layer's sliders (topic nodes).
  → the timeline: the song (or a demo clock), beat grid, kick / snare / hit markers, named cues (Intro, Drop…), the loop; layer tracks with keyframe lanes.
  The owner's habits: Save and Shuffle sliders constantly, switch social frame sizes (9:16, 1:1, 4:5, 16:9), Freeze frames, Present, record to Video Review.`,
  nodes: `NODES (three_nodes { command }): build visual layers as node graphs so the owner sees what you made in the Nodes view.
  "layer <preset>" adds a NEW layer from a preset (presets [word] lists them: ⏱ = timeline-driven, ♪ = reacts to music) · "preset <preset>" replaces the selected layer · "add <type> k=v… to=node.input" · "link a.out b.in" · "unlink b.in" · "set <node> k=v…" · "rm <node…>" · "list" (the graph, changed values, wires) · "types [word]" (types with their ports) · "layout" · "rebuild".
  Categories: Objects (mesh, particles, tunnel, gridCopies, ringCopies, blob, wavePlane, imagePlane, spectrumBars…), Shapes, Materials, Lights, Motion (spin, move, orbit, bounce, wobble, pulse…), Camera, Time (keys = keyframes on the song time, time, lfo, noiseWave, ramp), Layer (layerTime), Music + Triggers (only when asked to react), Math, Colors (palette, mixColors, rainbow…), Post (bloom, trails, rgbShift, film, kaleido…), Output.
  Change a node layer with three_nodes: a code edit makes its graph read-only. What nodes can't express goes in a code layer of its own (three_add_layer).`,
  react: `MUSIC REACTIVITY (only when the owner asks: "make it react", "hit on the kick", "sync it to the beat"):
  Fast way: three_do { cmd: "run", command: "/make-it-react" } links sensible sliders to the kick, bass and loudness by their names ("/make-it-react undo" takes it back).
  Nodes: wire Music nodes into what should move (hits.kick → peak → pulse.amount, levels.bass → smooth → remap → mesh.scale).
  Code: the audio globals (help audio); build hits on the owner's markers (audio.kick / snare / hit) when the song has them.
  Until then, scenes move on the timeline: time, keyframes, easing, cues and sections (help keyframes, help timeline).`,
  commands: `CHAT COMMANDS: the owner types /name args. Offer them as <suggest>/name …</suggest>; run Lab, music, nodes and video ones yourself with three_do { cmd: "run", command: "/name args" } (results come back as text).
  Lab: /save-look, /shuffle [colors], /fix-errors, /size 9:16, /freeze, /present, /record, /layer.
  Music: /make-it-react [undo], /analyze, /drops next, /downbeat, /auto-preset.
  Nodes: /nodes, /nodes-layer <preset>, /nodes-presets.
  Director: /undo-edit, /redo-edit, /director-engine claude|astra, /handoff, /task, /director-cost, /director-mode lean|full, /nodes-director on|off.
  Together: /jam (Claude ⇄ Astra build a visual in turns), /opinion (second opinion).
  Video: /help video. Everything else: /help <area>.`,
  handoff: `HANDOFF: Hearth (not the model) keeps each director chat's task state: the goal, recent asks, what was done (layers added, edits, nodes, keyframes…), the scene's layers, open todos and the last screenshot. Whichever engine runs next in the chat gets it once as "[Task state…]" (after /director-engine, /handoff or the ⚇ menu's switch), so Claude can pick up Astra's work and the other way round, in the same chat and scene. Read it any time: three_do { cmd: "task" }. Keep todos current with chat_progress (or three_do { cmd: "task", todo: [...] }) so the next one knows what's left.`,
  habits: `HABITS the owner asked for:
  1. Every new effect or element = a NEW layer (three_add_layer, three_nodes "layer …"), never piled into one big layer. Rewrite an existing layer (three_set_code / update_layer code) only when the owner asks to; small changes: three_edit_code.
  2. Visual layers as node graphs (three_nodes) so the Nodes view always shows what you made.
  3. Time first, like After Effects: motion from time, keyframes, easing, cues and sections; music reactivity only when asked (topic react).
  4. Knobs, not code: tweak() sliders with plain labels and groups; keep the owner's unsaved slider values.
  5. Look before claiming it works (three_screenshot small, or shot: true on an edit); fix errors first.
  6. Decide small things yourself; ask (chat_ask) only for real choices. Don't paste code: say what you made and what to ask next.`,
  capture: `CAPTURE (Hearth screenshots / records itself; reads any video's frames exactly). For the owner: one menu (Ctrl/⌘+Alt+S, or ⋯ in the rail → Capture), files in the captures folder (data/captures: shots, recordings, frames, sheets).
  Screenshots: window, tool (the screen on show), chat, transcript (the whole chat as one tall picture), dock, lab (the Lab preview at its exact frame size), a region / thing the owner drags or clicks; social frames (9:16 1080×1920, 4:5, 1:1, 16:9 and 19 more), clean (no toasts / menus / scrollbars), beautified (gradient, window bar, shadow), annotation (arrows, boxes, text, badges, blur).
  Recording: the hub page's own frame (no OS cursor, no other windows) + Hearth's own sound (mic optional; the whole computer's sound only on Windows), any fps, a tool / region / social frame, pause, markers, countdown, clicks / keys shown; the REC light is a separate window, never in the picture; WebM + MP4 (ffmpeg); opens in Video Review, the editor timeline, or the Lab as media.
  Tours: scripted hands-free recordings, one step per line (record, open, cmd /x, type, click, zoom, caption, title, highlight, wait, stop); /tour steps lists them, /tour intro is a 30 s app intro.
  Frame reader: exact frames by time / frame / timecode (ffprobe's true fps and packet times; VFR safe), every N, scenes, contact sheets, motion curve, pacing, palette. Reference footage is for the VIBE (pacing, motion, palette, light), never to reuse unless the owner says so.
  Commands: /shot, /record, /tour, /frames, /captures, /scenes, /contact, /pacing (see /capture-help). Tools (only when the chat opted in with /capture-tools on): capture_shot, capture_record, capture_frames, capture_list.`,
  video: `VIDEO REVIEW (the Video Director's tool): the owner's renders (newest first), a player with A/B compare (wipe, side, onion, difference), timecoded notes with categories, safe zones and crops for socials, contact sheets, ffmpeg export presets (tiktok, reels, shorts, feed45, yt1080…), After Effects renders (aerender) and ExtendScript. Lab recordings land there too. Tools: video_* and ae_*; the owner's notes are in video_status.`,
};

const LINE = (helpCall) => `HEARTH (the owner's app: Claude and Astra chats, the Lab, Video Review, chat commands): Claude and Astra share this chat, its scene and the task state Hearth keeps. Map: ${helpCall} app|lab|nodes|react|commands|handoff|habits.`;

const ALIAS = { hearth: 'app', overview: 'app', program: 'app', map: 'app', model: 'lab', graph: 'nodes', node: 'nodes', reactive: 'react', reactivity: 'react', command: 'commands', cmds: 'commands', slash: 'commands', task: 'handoff', switch: 'handoff', engines: 'handoff', astra: 'handoff', claude: 'handoff', rules: 'habits', conventions: 'habits', review: 'video', renders: 'video', screenshot: 'capture', screenshots: 'capture', record: 'capture', recording: 'capture', frames: 'capture', tour: 'capture', tours: 'capture', footage: 'capture' };

// topic → text, or null when it isn't a map topic
function topic(name) {
  const t = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  const key = TOPICS[t] ? t : ALIAS[t];
  return key ? TOPICS[key] : null;
}

module.exports = { TOPICS, LINE, topic, ALIAS };
