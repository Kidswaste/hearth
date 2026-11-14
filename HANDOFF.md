# Hearth: handoff for an AI working on Hearth itself

Hearth is the owner's desktop app: **an AI chat wrapper (Claude and Astra, in projects, with cloud sync) that knows its
own code and can edit itself, plus a Three.js editor (the Lab) that the AIs fully control.** It runs on Windows and
macOS. The owner doesn't write code: they describe what they want, and you read, edit and say what to check.

You reach this file because a chat has file access to Hearth's folder (see "Working on Hearth" below). Read the code
around a change before you edit it. `docs/upgrades/` holds one note per past round; `docs/patch-notes/` holds the
owner-facing notes.

## Stack
- Electron (unpacked in `electron/`, gitignored), plain JavaScript, **no build step and no npm packages**.
  `package.json` names the app `agent-hub` on purpose: the name decides the profile folder.
- Start: `Agent Hub.cmd` on Windows, `mac/install-mac.sh` and `mac/setup-mac.sh` on a Mac.
- The folder is its own git repository. `updatermain.js` updates it from origin/main. Hand edits go into a named stash
  and are put back afterwards, and `data/` is never touched.
- The usual shape of a feature: `name.js` (the window), `namemain.js` (the main process: IPC), `name-core.js` (pure
  logic that loads in Node and is unit-tested) and `name.css`. Comments carry `(round N, stream)` tags; keep them.

## Processes
- **Main process**: `main.js`. It loads the first-screen modules, defers others with `later()` (required on first use)
  and with `lazyIpc('xmain.js', …)` (the IPC channels are read from the file's source and the module loads on its
  first call; `dev/boot-test.js` checks this). The big pieces:
  `store.js` (data), `engines.js` (the AIs), `syncmain.js` (sync), `gamebridge.js` (the local bridge for tool
  servers), `fsapi.js` (files, the Trash), `appshell.js` (tray, icon, shortcuts, restart), `updatermain.js`.
- **Store thread**: `storework.js` is a worker thread that `store.js` starts. It handles JSON writes (to a temp file,
  then a rename) and chat search.
- **Window** (one renderer process): `index.html` loads plain scripts that share globals. `renderer.js` holds the
  core (`H`: config, rail, surfaces), `start.js` wires it up, and `preload.js` exposes `window.hub` (every IPC call
  the page may make). Feature modules are IIFE globals (`Native`, `Tools`, `HubBridge`, `Lazy`…).
- **Engines**: each reply spawns the official Claude Code CLI, or talks to a Codex app-server (`codex-server.js`, one
  private stdio server per chat; `codex exec` is the fallback). See Engines.
- **Tool servers**: `mcp/*-mcp.js` are stdio MCP servers that each engine run starts with Electron as Node. They
  reach the app through `gamebridge.js` (HTTP on 127.0.0.1, with a random token in `data/game-bridge.json`), and
  `bridge.js` in the window routes each call by tool-name prefix (`three_`, `chat_`, `board_`, `forge_`…).
- **Workers**: `chatparse-worker.js`, `assets-thumb-worker.js`, `capture-worker.js`, `tools/three-music-core.js`
  (music analysis) and a few more under `tools/`.

## Windows and pages
- The main window (`main.js`): the rail (agents and tools), one "surface" per agent or tool, and directors docked
  beside their tool (`tools.js` `syncDock`).
- The Lab's sandbox `tools/three-sandbox.html`: an iframe with `allow-scripts` and no same-origin, so scene code (which
  chats write) can never reach `window.hub`. The same page opens as the Stage window (`stage:open` in `main.js`) and
  as the backstage that runs a chat's scene off screen (`tools/three-backstage.js`).
  (Nov 11, labplayer3) On Windows the Lab's live preview runs that page in the **Lab player**: a child Electron app
  (`labplayer/`, started by `labplayermain.js`) with its own graphics process, its window laid over the preview's
  frame; the Lab drives it through `sandboxFrame`'s target `'player'` (`tools/three.js`), falls back to the iframe by
  itself and says so. Setting: the dock's PLAYER. `docs/upgrades/labplayer2.md`, `docs/upgrades/labplayer3.md`.
  (round 180, gamekit) A v2 layer of a game also gets `input`, `onStep` and `save` from that page; a game's saves
  live under `<data>/game-saves/<game>/` (`gamesavesmain.js`, asked through `game:save` / `game:saves`); a project
  is a game when `workspace.kind === 'game'`. `docs/upgrades/gamekit180.md`.
- App windows (`appsmain.js`, `apps-window.html`), ▶ Play's game window (`gamemodemain.js`), the board's offscreen
  snapshots (`boardmain.js`), the capture indicator (`capturemain.js`), the phone remote page served over the LAN
  (`remotemain.js`, `remote-page.html`), a render or the live preview on the owner's phone (`phoneviewmain.js`,
  `phoneview-page.html`, round 136), the second-copy card (`twocopies.html`).

## The store and sync
- Everything the owner makes lives in `data/` inside Hearth's folder (gitignored, never touched by updates):
  `data/chats/<id>.json`, `data/kv/<name>.json` (tool stores; `hub.kvGet` / `hub.kvSet`, each save keeps
  `<name>.prev.json`), `data/memory.json`, `data/config.json` and `data/theme.css` (`configsafe-core.js` moved them
  there; the repo's `config.json` and `theme.css` are only defaults), `data/attachments/`, `data/workspace/`.
- **A read that failed is never "empty"** (`datasafe-core.js`, `scenesafe-core.js`, `store.js`). An unreadable file is
  reported, a store read with a fallback is merged with the disk before it is saved, and nothing unreadable is saved
  over. `storeack-core.js` handles stores that the other computer's version replaces while the app holds them.
- **Projects** (`projects-core.js`, `projects.js`, `projects-home.js`, kv `projects`): every chat belongs to exactly
  one project (`projchats-core.js`). A project groups chats, Lab scenes, boards, renders and files.
- **Sync** (`sync-engine.js`, `syncmain.js`, `sync-merge.js`, `sync-kinds.js`, `sync-own.js`, `cloud-files.js`): the
  data folder is mirrored to `<cloud drive>/Hearth/` (iCloud Drive, Google Drive, Dropbox, OneDrive) with three-way
  merges. A field changed on both sides becomes a conflict with both versions kept. Secrets never sync
  (`sync-hard.js`), and paths are stored in a portable form. Turning a kind off never deletes anything. The window side
  is `sync.js` and `sync-panel.js`.
- Backups: `backupautomain.js` (daily zips, each checked). Crash safety: `safetynet-core.js`, `crashsafe-core.js`.

## Lazy groups
- The first screen loads only what it needs. `lazy-data.js` lists the groups (files, css, `after`, tier `soon` / `use`)
  and, below a marker, what each group registers (commands, Ctrl/⌘+K lines, keys, tool prefixes, rail tools). That
  part is written by `node dev/lazy-manifest.js`. `lazy.js` registers stand-ins at once and loads a group on first use.
  `lazy-at.js` marks where a group's files used to sit in `index.html`. `docs/lazy-groups.md` explains why each group
  exists. The Lab's code is the `lab` group; `lab-intent.js` decides when it loads.
- If you add a window file, put it in a group (or in `index.html` if the first screen needs it) and rerun the manifest.

## Engines (Claude and Astra)
- `engines.js` finds the engines (`installs.js`, `winpolish.js`, `macpolish.js`), builds each run, parses the stream
  into delta / tool / done / error events, and logs to `data/engine.log`. `engine-health.js` and `engine-watch.js`
  handle install, sign-in and update checks.
- **Claude** = Claude Code: `claudeArgs()` (`-p`, stream-json, `--setting-sources project`, `--disable-slash-commands`,
  `--system-prompt` = Hearth's prompt, only the tools the chat's access allows).
- **Astra** = Codex: `codexServerPlan()` / `codexArgs()`. Codex keeps its own base instructions and gets Hearth's
  prompt as developer instructions; no AGENTS.md is read. Astra's chat side: `astra.js` and `astra-workspace.js`.
- **The prompt**: `promptParts()` builds named parts, with stable ones first so they stay cached: role, tool-set guides,
  `access`, `hearthCode`, `folder`, memory and answer length. Both engines get the same parts except the deliberate
  differences in `dev/astraparity116-test.js`. `hearthCode` (the text is `CODE` in `mcp/hearth-map.js`) is added only
  when a chat's folder holds Hearth's source (`isHearthSource()`: `engines.js` and `mcp/hearth-map.js` exist there).
- **File access** per chat or per AI (`access.js`, `access-rules.js`, `mcp/access-mcp.js`): levels are read, write and
  full. Claude asks Hearth through the permission tool; Astra runs in Codex's sandbox (writes only in the folders, no
  network). Hearth's data folder is locked for any chat whose folders cover it (`datalock.js`, round 119): refused,
  no card, on both engines (Astra's app-server asks Hearth before its edits and commands on such chats).
  The doctor's **Check Astra works like Claude** (`parityprobe.js` + `parityprobe-ui.js`, round 120) proves both on the
  owner's real Codex in temp folders and copies a report with the raw approval shapes Codex sent.
- Moving work between AIs: `handoff-core.js` (a short brief, for free). One undo for AI changes: `aiundo-core.js`.

## Tool servers (`mcp/`)
- Tool sets are `HUB_TOOLSETS` in `engines.js`: `three-mcp.js` (the Lab), `chat-mcp.js` (ask the owner, second
  opinion, `chat_open`), `board-mcp.js` (mood board), `capture-mcp.js` (screenshots and the frame reader),
  `adobe-mcp.js`, `deploy-mcp.js`, `apps-mcp.js` (app windows, Meshy), `forge-game-mcp.js` (the Forgeheart debug
  game). `access-mcp.js` is Claude's permission prompt. They share `mcp/common.js`, and `mcp/cost.js` measures what
  each set costs per message.
- Servers send no instructions of their own (an engine may drop them). Guides live in the prompt: `mcp/three-guide.js`
  (CORE every message, topics on demand with `three_do help`) and `mcp/hearth-map.js` (the app map, on demand).
  Opt-in sets wake when needed (`toolwake.js`).

## The Lab (Three.js editor the AIs control)
- `tools/three.js` (the Lab surface), `tools/three-data.js`, `tools/three-layers.js`, `tools/three-tweaks.js`
  (sliders), `tools/three-sandbox.html` (runs scenes), `tools/three-cmds.js` (the /commands), `tools/three-seq.js`
  (the sequence), `tools/three-export.js` (renders).
- A scene (a "sketch") is a stack of layers, each a complete ES module, with sliders (`tweak()`), keyframes, filters,
  a look, a song and a frame size. Scenes live in kv `three-sketches`, guarded by `tools/three-scenesafe.js`.
- The AI side: the Three Director (and any chat with `threeTools`) calls `three_*` tools. `bridge.js` sends them through
  `tools/three-txn.js` (one call applies whole or not at all; one reply is one undo step) to `tools/three-director.js`
  (fast paths, short results) or the Lab's own handlers. Each director chat owns its scene (`chat-scenes.js`). A scene
  that isn't on screen runs backstage. Crew helpers: `tools/three-crew.js`. Claude and Astra take turns with `jam.js`.
- (round 137) A reply that changed a scene gets "Changed 3 layers · Review" under it (`tools/three-replydiff*.js`, LabTxn's
  before / after per reply in kv `labtxn-replies`): plain words per layer, ↶ Undo this layer (one undo step), Undo all, Keep some.
- (round 138) The Lab's Ctrl/⌘+Z takes the newest change, an AI reply included (`LabTxn.labKey`); a step still settling is
  waited for, never skipped (`LabTxn.reserve`). Sections ▾ › 🎭 gives each section its mood (dial keys + looks, `tools/three-sectionmood*.js`).
- Other rail tools: Projects (`projects-home.js`), the mood board (`board.js`), Commands (`cmdpage.js`), ⋯ AI setup
  (`options.js`), the Creative board (`tools/creative-playground.js`), Forgeheart (`tools/forge.js`,
  `tools/forge-game.js`).

## Checks
- `dev/run-checks.js` is the runner. `node dev/run-checks.js --exact <name>` runs single checks; `unit:<name>` is a
  Node test `dev/<name>.js`, and the `UNIT` list holds them all. Groups (`qa`, `release`, …) are listed by `--list`.
- `dev/smoke.js` starts a throwaway copy of the app (empty data, its own profile) for `dev/checks/*.js`; with
  `--fake-engines`, chats are answered by `dev/fake-*.js`. `node dev/boot-test.js` checks lazy IPC and the lazy groups.
- Prompt budgets: `dev/promptdiet-test.js`, `dev/tokens-test.js`, `dev/astraparity116-test.js`. File references and
  leftovers: `dev/slim116-test.js`. This map: `dev/selfmap118-test.js`.
- The owner wants few, targeted checks: run the ones that cover your change, not a whole release.

## Rules (keep these)
- **Deletes go to the Trash**, never permanent: `shell.trashItem` (`fsapi.js`), deleted chats wait in `data/trash/`
  for 30 days, a chat's `rm` is done by Hearth with the Trash, and Astra's deletes go through `.hearth-trash/`.
- **A store read failure is never "empty"** (above). Never save over something that couldn't be read.
- **Secrets are never in prompts, code, logs or sync**: `AccessRules.redact`, secret file names ask first, and Hearth
  never handles passwords (sign-ins run in the engine's own window or a terminal).
- **The owner's data is not code**: never edit `data/`, and never delete or migrate old stores. Removed features leave
  their data in place.
- **Token frugality**: everything in the prompt is paid on every message. Guides are read on demand, and opt-in tool
  sets stay off until needed.
- **No automatic upload or silent install**: publishing, installs and paid calls are shown first and wait for the
  owner's click.
- **Codex-owned files** get only minimal, marked edits from other streams: `projects*`, `project-workspace*`,
  `sync-engine.js`, `cloud-files.js`, `astra*`, `codex-*`, `workbench-*`, `engine-watch.js`.
- Scope: round 116 removed two areas (`docs/upgrades/slim116.md`). Don't bring them back, and keep `dev/slim116-test.js`
  passing.

## Working on Hearth (self-edit)
- There is no special mode. The owner gives a chat file access to Hearth's folder (⋯ AI setup › Files, or `/access`).
  `engines.js` sees that the folder is Hearth's source and adds the `hearthCode` part, the same text for Claude and
  Astra. Directors can also read it with `three_do help hearthcode`.
- At the read and write levels Claude can't run commands, so tell the owner what to run. A changed window file shows
  after a restart (Restart in the tray menu or Ctrl/⌘+K), and so does a main-process file.
- List the files you changed. A big change: suggest a git commit first.
