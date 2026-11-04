# Hearth: what it does

Hearth is an AI chat app (Claude and Astra, in projects, with cloud sync) that knows its own code and can edit itself,
plus the Three.js Lab, an editor the AIs fully control. This list is short on purpose. Each round's details are in
`docs/upgrades/` and the owner-facing notes are in `docs/patch-notes/`. How it is built: [HANDOFF.md](HANDOFF.md).

## Chats with Claude and Astra
- Native chats through the official **Claude Code** (Claude) and **Codex** (Astra, ChatGPT login) engines, on your own
  subscriptions with no API keys. Hearth finds the newest working copy of each engine. `/doctor` checks them and fixes
  install, update and sign-in problems in a visible terminal window.
- Streaming replies with folded thinking, tool steps as cards, and token usage per reply. Attach files, pictures and
  screenshots; edit, retry or branch a message; switch the model and effort per chat. Long chats stay light (only the
  newest part is held in memory).
- **Hand off** between the AIs: Continue with Astra or Claude, or `/handoff`. The other AI gets a short brief (goal,
  decisions, files, open tasks). Second opinions run in the background.
- **Memory**: AIs save facts with `<remember>` (with an Undo). Only the facts relevant to a message are sent once the
  memory grows.
- **⋯ AI setup**: personality, standing instructions, what each AI may use (tool sets, your MCP connections, web
  search), habits and hooks.
- **File access** per chat or per AI (`/access`): read, write or full on chosen folders. Hearth asks before risky
  actions, keeps a copy for Undo, sends deletes to the Trash and keeps secrets out of chats and logs.
- One **AI undo** (`/ai-undo`) for everything the AIs changed. Activity shows what runs and what waits for you.
  Desktop notifications arrive when you are in another app.
- Commands everywhere: `/` in a chat, **Ctrl/⌘+K** for every chat, command and setting, and the Commands page explains
  each command step by step.

## Projects and sync
- Every chat belongs to one **project**. A project groups chats (any AI), Lab scenes and sequences, boards, renders and
  files, with a name, a color, notes and a Desk. Projects home and search everything: Ctrl/⌘+Shift+K.
- Export, import or duplicate a whole project (`.hearthproject`), including its Lab work.
- **Cloud sync** between your Mac and PC through the cloud drive you already use (iCloud Drive, Google Drive, Dropbox,
  OneDrive). Merges happen per field, and a conflict keeps both versions side by side. Big files move one at a time.
  "What syncs" works per kind, and secrets never sync. The status chip at the bottom of the rail opens the sync panel.
- Each computer keeps its own folders, engines and sign-ins; paths from the other computer are translated.
- **Data safety**: a file that couldn't be read is never treated as empty or saved over. 🛟 Recover…, automatic daily
  backups (each checked), and work is kept after a crash.

## Hearth works on itself
- Give a chat access to Hearth's folder and both AIs get the same short map of the code, pointing to
  [HANDOFF.md](HANDOFF.md). In the Lab, `three_do help hearthcode` gives the same map.
- Updates come from Hearth's git repository (⬆ Update, `/update`). Your hand edits are kept in a named stash and put
  back afterwards.
- `/report` drafts a bug report you review before sending. `/smooth` and 🐢 That was slow produce numbers you can copy
  for a dev session.

## Three.js Lab (the AIs drive it)
- **The Three Director** (Claude or Astra, same tools) builds scenes from your words. Each chat owns its own scene, and
  a scene that isn't on screen keeps running backstage. Every tool call applies whole or not at all, and one reply is
  one undo step. Crew: several helpers try variations in parallel and you pick one.
- **Scenes in layers** (each a three.js module), with sliders for every number and color, keyframes, filter layers,
  looks and palettes, a cinematic grade and look match, and frame sizes (9:16, 1:1…).
- Layer kinds: code, nodes (visual graphs), shaders, GPU particles, kinetic type and lyrics, music visualizers,
  self-drawing shapes, light physics, 3D models with material looks, precomps (scenes as layers).
- **Music**: load a song for beats, sections and stems; make the scene react when you ask; live sound input.
- **Sequence and renders**: a video timeline of scenes, a perfect loop, all formats at once, a render queue, and
  exports to video and picture files.
- **Make it easy**: the gallery ("Start from something like…"), My templates, recipes, quick variations, Fix my scene,
  before / after (B), Lab search (/), Finish line and Ready to post.
- Live stage window, a phone remote, camera input, MIDI / OSC / OBS / Ableton Link, and publishing a scene as a website
  (asks first).

## Around the Lab
- **Mood board**: references the AIs can see and add to, plus Pinterest finds.
- **Capture**: Hearth screenshots and records itself, and reads any video's frames exactly.
- **Asset library**: textures, HDRIs, models, fonts, sounds and LUTs (Ctrl/⌘+Shift+A).
- **Apps**: your services in their own windows (Meshy 3D models, Suno, Figma…), Adobe apps and publishing, each tool
  set opt-in per AI. Paid calls show their cost first.
- **Studio**: one-click pipelines that chain these parts (`/studio`).
- **Forgeheart**: the owner's game workspace and a live debug instance the AI can drive.

## The app
- Looks and themes, full screen and size of everything per screen, keyboard-first (Ctrl/⌘+/ lists the shortcuts),
  accessible names and focus, voice input, and calm errors in one plain sentence with the fix.
- Starts fast (the first screen loads first and the rest on use) and stays light when idle or on battery.
