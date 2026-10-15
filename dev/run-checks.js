#!/usr/bin/env node
// One runner for the dev checks: prepares the throwaway fixtures a check needs (test song, test videos, editor
// clips with burned-in frame numbers, board pictures / clips / page, capture test videos), then runs each check
// through dev/smoke.js with the flags its own header asks for (--fake-engines, --check-timeout, --wait, --data,
// --eval …) plus the shared helpers it uses (journey-lib / smooth-lib / editor-frames are added by smoke.js
// itself when a check uses J, M or decodeFrameCode). Prints one line per check and keeps every log.
//   sh dev/run-checks.sh                      # the quick group (qa)
//   sh dev/run-checks.sh board capture        # groups, or check names (journey-board…)
//   sh dev/run-checks.sh unit                 # the Node-only tests (no Electron)
//   sh dev/run-checks.sh --list               # groups and checks
//   options: --out <dir> (logs and pictures, default <tmp>/hearth-checks) · --shots (journeys keep a picture per step) · --names (list) / --exact (run names as checks, not groups)
//   · --fixtures-only · --stop (first failure)
// Groups: qa, board, capture, journeys, chat, lab, nodes, smooth, astra, sequence, robust, motion, orb, flows, commands, sync, comp, progress, speed, renders, access, adobe, deploy, apps, eyes, pinboard, chromeview, quickstart, aicheck, offline, unit, all.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const DEV = __dirname;
const ROOT = path.join(DEV, '..');
const CHECKS = path.join(DEV, 'checks');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'hearth-checks')));
const names = argv.filter((a, i) => !a.startsWith('--') && !['--out'].includes(argv[i - 1]));

const LIBS = new Set(['journey-lib', 'smooth-lib', 'journey-olddata-make', 'sequence-lib', 'mission-tokens', 'bigscreen-lib']); // helpers / made to run in the old app · (round 35) mission-tokens: a measurement dev/mission-tokens.js runs (fake engines, its token log, > 10 min), not a check: alone it waited 10 min for engines
const all = fs.readdirSync(CHECKS).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((n) => !LIBS.has(n)).sort();
const UNIT = ['board-unit-test', 'store-thread-test', 'board-mcp-test', 'capture-mcp-test', 'director-mcp-test', 'cut-test', 'capture-test', 'music-test', 'code-flow-test', 'importer-test', 'director-cost', 'astra-engine-test', 'robust-engine-test', 'test-aemain-mac', 'sequence-test', 'flows-test', 'sync-test', 'cmdpage-test', 'progress-test', 'makes-test', 'renders-test', 'updater-test', 'access-test', 'adobe-test', 'adobe-mcp-test', 'deploy-test', 'apps-unit-test', 'eyes-test', 'boot-test', 'liveness-test', 'devreport-test', 'labexport-test', 'voice-test', 'projects-test', 'timemachine-test', 'audio-test', 'remote-qr-test', 'interop-test', 'context-test', 'assets-test', 'type-test', 'motion-in-test', 'physics-test', 'connections-test', 'hooks-test', 'autoedit-test', 'publishkit-test', 'router-test', 'firstrun-test', 'lookmatch-test', 'aiundo-test', 'packs-test', 'safetynet-test', 'instantscene-test', 'chrome-test', 'budget-test', 'recall-test', 'autopolish-test', 'stems-test', 'pinboard-test', 'chromeview-test', 'tokens-test', 'cache-test', 'winmac-test', 'quickstart-test', 'perfectloop-test', 'labadapt-test', 'labvariations-test', 'winpolish-test', 'macpolish-test', 'multiformat-test', 'labpace-test', 'scenedoctor-test', 'autocompact-test', 'offline-test', 'labgestures-test', 'concise-test', 'twocomputers-test', 'labtemplates-test', 'streamrender-test', 'tokenaudit-test', 'nativefeel-test', 'labsearch-test', 'updatesafe-test', 'appsearch-test', 'directorlean-test', 'abcompare-test', 'bigscreen-test', 'memorytidy-test', 'dragdrop-test', 'beatlink-test', 'hintcalm-test', 'routerlearn-test', 'labrecipes-test', 'powerwise-test', 'attachlean-test', 'labcamera-test', 'toolslim-test', 'routines-test', 'undoall-test', 'renderfast-test', 'whatsnew-test', 'handoff-test', 'filewatch-test', 'labbatch-test', 'scenesafe-test', 'directorpreview-test', 'datasafe-test', 'datasafe-scan', 'costcoach-test', 'glrecover-test', 'localanswers-test', 'notify-test', 'backupauto-test', 'sendpreview-test', 'errorcalm-test', 'errorcalm-scan', 'kinetictype-test', 'layergroups-test', 'promptdiet-test', 'platform46-test', 'labkeys-test', 'labdirect-test'];
const by = (re) => all.filter((n) => re.test(n));
const GROUPS = {
  qa: ['qa-commands', 'qa-keys', 'qa-mac', 'polish', 'lazy', 'fastboot'], // (round 29) fastboot: first frame before any lazy group, keys of lazy groups, first-use main modules
  board: by(/^board/),
  capture: by(/^capture/),
  journeys: by(/^journey-/),
  lab: ['labbatch', 'labcamera', 'labrecipes', 'labsearch', 'labtemplates', 'scenedoctor', 'labeasy', 'labadapt', 'labvariations', 'multiformat', 'seqsolid', 'autoedit', 'gallery', 'lookmatch', 'instantscene', 'autopolish', 'perfectloop', 'music', 'labaudio', 'stems', 'live', 'scenes', 'labstage', 'remote', 'interop', 'labshader', 'particles', 'physics', 'grade', 'type', 'motion-in', 'jam', 'assist', 'decide', 'brain', 'director-dock', 'director-tools', 'labdirector', 'crew', 'timemachine', 'perf', 'labpace', 'labgestures', 'abcompare', 'labboot', 'beatlink', 'labmemory', 'scenesafe', 'directorpreview', 'glrecover', 'menucalm', 'kinetictype', 'layergroups', 'labkeys', 'labdirect'],
  chat: by(/^chat-|^chatcore|^chatcalm$|^cmdbar$|^clutter$|^declutter|^simplify[]$|^grid-resize$|^appsearch$|^localanswers$/), // (round 45) localanswers: Answered by Hearth · (round 40) chatcalm: budgets per part of a chat, ≤ 2 clicks, one order, folded notes · // (round 27) simplify2: calm Settings, no /commands on screen · (round 33) simplify3: AI setup order + folds, counts · (round 37) appsearch: Find anything (Ctrl/⌘+K)
  nodes: by(/^nodes-/),
  smooth: ['hz240', 'smooth26', 'smooth32', 'motionpolish', 'streamrender', 'unit:streamrender-test', 'inputlatency', 'smooth41', 'chatlistfast', 'idlecpu', 'chatswitch', 'smooth46'], // (round 46) smooth46: presses / menus / switches / the list search / long-frame notes / a 🅰 layer's frames, counted · (round 44) idlecpu: CPU / wakeups per process over 10 s idle in six setups · (round 42) chatlistfast: the chats list with 3,000 chats // (round 41) smooth41: a11y / chatcalm / attachlean / hints / powerwise in the everyday stretches, // (round 38) inputlatency: input → handled → painted per interaction, Lab slider → preview frame · (round 17) hz240: the 240 Hz interaction check · (round 26) smooth26: ⋯ / ◎ / the Lab hidden · (round 32) smooth32: streaming, grid drag, the Lab beside a streaming chat · (round 36) motionpolish: every opening on the compositor, one tempo, reduced motion
  astra: ['astra-collab', 'astra-ui', 'astra-manager'],
  sequence: by(/^sequence/),
  robust: by(/^robust/),
  motion: by(/^motion/),
  orb: by(/^orb/),
  flows: [...by(/^flows/), 'unit:flows-test'],
  commands: [...by(/^commands-page/), 'unit:cmdpage-test'],
  sync: [...by(/^sync/), 'unit:sync-test'],
  reach: by(/^reach/), // (round 19) paths from the other computer, page cards, chat_open
  comp: by(/^comp/),
  makes: [...by(/^makes/), 'unit:makes-test'],
  projects: [...by(/^projects/), 'unit:projects-test'],
  progress: [...by(/^progress/), 'unit:progress-test'],
  speed: [...by(/^speed/), 'habits'],
  renders: [...by(/^renders/), 'unit:renders-test'],
  access: [...by(/^access-/), 'unit:access-test'],
  adobe: [...by(/^adobe-/), 'unit:adobe-test', 'unit:adobe-mcp-test'],
  deploy: [...by(/^deploy-/), 'unit:deploy-test'],
  apps: [...by(/^apps-/), 'unit:apps-unit-test'],
  eyes: [...by(/^eyes-/), 'unit:eyes-test'],
  liveness: [...by(/^liveness-/), 'unit:liveness-test'], // (round 21) long tasks: subagents, steps, stalls, dead engines
  devreport: ['devreport', 'unit:devreport-test'],
  context: ['context', 'unit:context-test'], // (round 24) @ references, relevant memory, what each message sent, fresh start
  voice: ['voice', 'unit:voice-test'], // (round 23) talk to chats: push to talk, local whisper (dev/fake-whisper.js), voice commands, read aloud
  labexport: ['labexport', 'unit:labexport-test', 'renderfast', 'unit:renderfast-test'], // (round 41) renderfast: streamed encodes, the same files as the reference path, timing budget // (round 22) best-quality Lab exports in a hidden page // (round 21) Report to the developer: masking, gh (fake), the browser link, fixed in an update
  assets: ['assets', 'unit:assets-test'], // (round 24) the asset library: fixtures folder, thumbnails, drops, fake Poly Haven / ambientCG (smoke --fake-assets)
  connections: ['connections', 'unit:connections-test'], // (round 26) the owner's MCP servers: ＋ Add a connection, Test (dev/fake-mcp-server.js), both engines' configs
  hooks: ['hooks', 'unit:hooks-test'], // (round 26) ⚡ hooks: when something happens, an AI gets your words (⋯ AI setup)
  missions: ['missions', 'missions2', 'swarmlean', 'unit:swarmlean-test'], // (round 33: + swarmlean, lean missions) (round 26) ◎ Missions: the picker, result cards, chips + ↻, plan first, ask everyone, helper rows
  activity: ['activity'], // (round 27) ◉ Activity: what runs, what waits for you, the last 24 h, stuck replies, desktop notifications
  publishkit: ['publishkit', 'unit:publishkit-test'], // (round 27) 📮 Ready to post: platform checks, safe areas, cover, words, post folder, fixes through the queue
  router: ['router', 'unit:router-test', 'routerlearn', 'unit:routerlearn-test'], // (round 39) routerlearn: Smart learns from you (think harder 3× → that kind steps up, the line in AI setup, ✕ forgets; the rules + a 6-week simulation) · (round 28) Smart: model + effort per message, the pick on the reply, think harder (fake engines say what they got)
  firstrun: ['firstrun', 'unit:firstrun-test'], // (round 28) Check this computer: one list, one button each, live re-checks, the first launch
  aiundo: ['aiundo', 'unit:aiundo-test'], // (round 28) one undo for what the AIs did: Lab, board, files, settings; replies' ↶; Activity's part
  packs: ['packs', 'unit:packs-test'], // (round 28) ⇪ packs: a scene + everything it uses as one .hearthpack (round trip, preview card, zip-slip guard)
  safetynet: ['safetynet', 'unit:safetynet-test'], // (round 29) Hearth never loses work: a real page crash, then the Lab code / slider / draft / board / dialog come back; the session marker
  winpolish: ['unit:winpolish-test', 'unit:winmac-test', 'unit:chrome-test', 'unit:access-test'], // (round 32) Windows simulated: npm claude.cmd / codex.cmd found + started (Node script, cmd.exe quoting), Recycle Bin guard, plain errors, path forms
  winmac: ['winmac', 'unit:winmac-test'], // (round 31) Mac + Windows: file URLs with # % accents, one slash kind in exports, ⌘ in toasts / menus / hints, the Mac PATH fix, the static scan at zero
  budget: ['budget', 'unit:budget-test', 'cachewise', 'unit:cache-test', 'autocompact', 'unit:autocompact-test', 'concise', 'unit:concise-test', 'tokenaudit', 'unit:tokenaudit-test', 'costcoach', 'unit:costcoach-test'], // (round 43) costcoach: the week's fixes · (round 36) tokenaudit: where each AI's fixed tokens go, trims that shrink the next prompt by what they show · // (round 35) concise: how long its answers are (the prompt's end only), the output split on the token hover · // (round 34) autocompact: continue lighter, measured on a 30-message chat · // (round 30) Spending: weekly limit per AI, 80 / 100 % warnings, cheaper answers near it (runinfo), ask first, the week at a glance
  directorlean: ['directorlean', 'director-tools', 'labdirector', 'director-dock', 'unit:directorlean-test', 'unit:director-mcp-test', 'unit:tokens-test', 'unit:cache-test'], // (round 37) the Three Director's per-turn input: what its session has isn't re-sent, scene outline + the layer, small pictures, trimmed Lab results
  routerlearn: ['routerlearn', 'unit:routerlearn-test', 'unit:router-test'], // (round 39) Smart learns from you, per AI and kind of message
  memorytidy: ['memorytidy', 'unit:memorytidy-test', 'unit:cache-test', 'unit:tokens-test', 'unit:tokenaudit-test', 'options'], // (round 38) Tidy memory: before / after list, confirm, Undo, smarter tidy's cost, the Lab scope only in the Director's prompt, <remember> replaces instead of piling up
  concise: ['concise', 'unit:concise-test', 'unit:tokens-test', 'unit:cache-test'], // (round 35) how long its answers are: saved on the AI, the prompt's end only, byte-stable; edits as diffs
  kinetictype: ['kinetictype', 'unit:kinetictype-test', 'type', 'beatlink', 'labtemplates', 'labrecipes', 'renderfast', 'menucalm', 'lazy', 'unit:boot-test'], // (round 45) 🅰 Text that moves: presets on the beat / bar / kick, renders the same twice, steps on the kicks, lyric lines on markers, undo, saved, template words
  labkeys: ['labkeys', 'unit:labkeys-test', 'labeasy', 'motionpolish', 'kinetictype', 'labrecipes', 'lazy', 'unit:boot-test'], // (round 46) ◆ keyframes you can see and shape: diamonds per slider, a click picks the ease (drawn), a two-handle curve, several moved / Alt-copied / pasted, one undo each, the preview and export frames match
  beatlink: ['beatlink', 'unit:beatlink-test'], // (round 38) ♪ Move with the music: a slider pulses on the kick / steps each bar, renders the same, badge, undo, saved
  stems: ['stems', 'unit:stems-test'], // (round 30) the song's parts: audio.stems.drums / bass / vocals, split once per song (HPSS), sliders follow "the drums"
  chrome: ['chrome', 'unit:chrome-test', 'unit:apps-unit-test'], // (round 30) Hearth's Chrome: Playwright's Chromium as Chrome (smoke --pw-chrome), the DevTools client against dev/fake-cdp.js
  recall: ['recall', 'unit:recall-test'], // (round 30) "what did we decide about X?": the local index + ranking, the panel's "Find the answer", the card, Jump to it, the mission, the sum-up's cost
  chromeview: ['chromeview', 'chrome', 'unit:chromeview-test', 'unit:chrome-test'], // (round 31) Chrome views: Chrome out of sight, its pages shown and used in Hearth (Playwright's Chromium as Chrome: frames, clicks, keys, wheel, popups, file picker, downloads, hidden = no frames, sign-in on screen then off)
  pinboard: ['pinboard', 'unit:pinboard-test'], // (round 30) Find images like this: a Pinterest-like page in Playwright's Chromium as Chrome (smoke --pw-chrome) and in the board's Pinterest window, an Unsplash-like app window; the page reading against saved pages
  quickstart: ['quickstart', 'unit:quickstart-test'], // (round 31) "What can I do here?": the card per window (once by itself, the ⋯ ways in, context first, used drops off) + the picking
  aicheck: ['aicheck', 'options'], // (round 32) Check this AI: the checklist through the fake engines (Read / Windows Astra / signed out), its fixes, the refusal note's button
  inputlatency: ['inputlatency', 'chat-stream', 'streamrender', 'labpace', 'labgestures', 'motionpolish', 'smooth32', 'appsearch', 'lazy', 'unit:boot-test'], // (round 38) input → paint latency: typing, Enter, menus, Ctrl/⌘+K, chats, wheel, Lab slider → frame, orbit, scrub, grid gap; and what it touched
  smooth46: ['smooth46', 'inputlatency', 'chatlistfast', 'chatswitch', 'streamrender', 'idlecpu', 'labpace', 'kinetictype', 'unit:kinetictype-test', 'layergroups', 'lazy', 'unit:boot-test'], // (round 46) the 240 Hz pass over rounds 44–45 and what it touched
  smooth41: ['smooth41', 'smooth32', 'inputlatency', 'streamrender', 'motionpolish', 'labpace', 'a11y', 'chatcalm', 'attachlean', 'hintcalm', 'unit:hintcalm-test', 'lazy', 'unit:boot-test', 'fastboot'], // (round 41) smoothness after rounds 33–40 and what it touched
  labpace: ['labpace', 'unit:labpace-test', 'unit:labadapt-test'], // (round 33) frame pacing: f60 (same speed at 60–240 Hz), still pictures stop drawing, a parked Lab sleeps, battery, Frame pace
  labmemory: ['labmemory', 'labboot', 'labpace', 'labvariations', 'abcompare', 'beatlink'], // (round 39) a long Lab session (40 switches, templates, edits, 🎲) stays light: what gone scenes' code made is let go, GL / heap / arrays / URLs level off; the guard cleans up and notes once
  labboot: ['labboot', 'fastboot-lab', 'labpace', 'lazy'], // (round 37) the Lab opening and switching scenes: a warm preview page taken over on open, switch → drawn, the preview's longest task, no black frame between scenes
  labgestures: ['labgestures', 'unit:labgestures-test', 'labpace'],
  labcamera: ['labcamera', 'unit:labcamera-test', 'labgestures', 'beatlink', 'labrecipes', 'labpace', 'abcompare'], // (round 40) 🎥 camera moves on the timeline: push in renders the same twice, punch-in on the kicks, drag, undo, saved, recipe // (round 34) trackpad / mouse navigation of the Lab preview: wheel / pinch / drags, inertia, Z / Shift+Z, still after
  labadapt: ['labadapt', 'unit:labadapt-test'], // (round 31) the Lab preview lightens itself in steps (resolution, filters, shadows, particles), covered layers skip drawing, renders unchanged
  lightweight: ['lightweight', 'unit:recall-test', 'unit:store-thread-test', 'unit:chrome-test'], // (round 34) an hour-like session (Lab, ⋯ AI setup, chats, a long reply, Astra, Activity) three times: heap budget, nothing left per session; recall index packed, chat texts held only while searching, Chrome quits when idle
  bugbash2: ['bugbash2', 'unit:store-thread-test', 'qa-keys', 'simplify3'], // (round 35) regressions of the second bug bash: kvSet on disk when it answers, the look-around view vs a camera fix, no dead auto-compact switch
  bugbash: ['bugbash', 'unit:sync-test'], // (round 29) regressions of the bug bash's app fixes: one Lab however it opens; sync's same-millisecond file
  bigscreen: ['bigscreen', 'bigscreen-hidpi', 'unit:bigscreen-test', 'unit:nativefeel-test'], // (round 38) a 4K screen at 100 % and at 200 %, an ultrawide window: Auto size of everything per screen, ⛶ full screen remembered, layouts without sideways scrolling, the Lab smooth and crisp
  nativefeel: ['nativefeel', 'unit:nativefeel-test', 'unit:winmac-test', 'unit:winpolish-test', 'unit:macpolish-test'], // (round 36) the window as each computer expects it: window memory per computer + screens (off-screen guard), the Mac's inset title bar, light / dark following the computer, menus, the badge, crisp canvases on a new screen scale
  updatesafe: ['updater', 'unit:updater-test', 'unit:updatesafe-test'], // (round 37) safe updates on real git in temp folders: no git, not a checkout, named stashes, detached / diverged, network / proxy, Windows files held open (staged, swapped at start), long paths, permissions, half-finished, Go back; the window's one-fix dialog
  datasafe: ['datasafe', 'unit:datasafe-test', 'unit:datasafe-scan', 'unit:store-thread-test', 'unit:sync-test'], // (round 43) every store: a failed read never "empty", a held file never written over (config, memory, chats, notes…), the calm card, Recover… (a chat from a backup)
  glrecover: ['glrecover', 'unit:glrecover-test'], // (round 43) the graphics card going away: the preview rebuilt in place (sliders, song, view, undo, nothing written), a new page when it doesn't come back, a render picking up mid-way, the main-side note with Restart
  scenesafe: ['scenesafe', 'unit:scenesafe-test', 'unit:store-thread-test', 'unit:sync-test'], // (round 43) the Lab never saves over scenes it couldn't read (a locked file at start → the calm card, nothing written, Retry), a starter list never replaces scenes, Delete still deletes, 🛟 Recover lost scenes finds .prev / copies / History / a backup and merges with one Undo
  directorpreview: ['directorpreview', 'unit:directorpreview-test', 'abcompare', 'directorlean', 'labdirector', 'director-tools', 'scenesafe', 'labrecipes', 'lazy', 'unit:boot-test', 'unit:director-mcp-test', 'unit:cache-test'], // (round 43) ◧ Try it first: the director's edit waits in the preview (scenes file untouched) for Keep (one version, one Undo) / Undo (nothing changed) / Try another way (one short message), ◎ Show me first, Astra too
  costcoach: ['costcoach', 'unit:costcoach-test', 'budget', 'tokenaudit', 'autocompact', 'options', 'undoall', 'unit:undoall-test'], // (round 43) 🧭 Cost coach: fake usage → the card's 3 fixes, a click changes the setting, Undo; attribution, savings, top 3, nothing already applied
  sendpreview: ['sendpreview', 'unit:sendpreview-test', 'chatcalm', 'attachlean', 'autocompact', 'budget', 'a11y', 'inputlatency', 'lazy', 'unit:boot-test'], // (round 44) send preview: a long chat with a cold cache + a big attachment → "≈ 52k" next to Send with its breakdown and the one cheaper way (it sends lighter); a small message → nothing; calibration moves the estimate toward what the engine reported
  handoff: ['handoff', 'unit:handoff-test'], // (round 42) lean handoffs: Continue with, /handoff, Ask Astra instead, second opinions send a short brief (what the fake engine gets), Send the whole chat instead
  offline: ['offline', 'unit:offline-test'], // (round 34) calm when things go wrong outside Hearth: no internet (the queue sends once when back), busy (retry / cancel / switch), usage limit, signed out, a reply cut off (continue + stitch), restart survival
  attachlean: ['attachlean', 'unit:attachlean-test', 'dragdrop', 'access-chat', 'chat-stream', 'unit:tokens-test', 'unit:cache-test'], // (round 40) lean attachments: pictures at 1568 px, big texts as outline + asked parts, the same file referenced / diffed, the cost on each chip (click: send whole)
  dragdrop: ['dragdrop', 'unit:dragdrop-test', 'access-chat'], // (round 38) files with Finder / Explorer: drops on chats / the Lab preview with an overlay per spot, pasted screenshots and copied files, folders asked first, native drags out
  hintcalm: ['hintcalm', 'unit:hintcalm-test'], // (round 38) one hint at a time: after an update the patch notes first, never two optional hints on screen, none while typing / streaming, Don't show tips, essential notes at once
  settingscalm: ['settingscalm', 'appsearch', 'tidy', 'simplify2', 'firstrun', 'unit:appsearch-test'], // (round 39) Settings in four plain sections + folds that say where they stand: control budget, every row Find anything knows found in its place, fold lines follow a switch, nothing gone
  toolslim: ['unit:toolslim-test', 'unit:tokens-test', 'unit:cache-test', 'unit:tokenaudit-test', 'unit:board-mcp-test', 'unit:capture-mcp-test', 'unit:adobe-mcp-test', 'unit:director-mcp-test'], // (round 41) slimmer tool definitions: merged tools reach the hub by their old names, help answers locally, opt-in sets sleep until needed, budgets down
  notify: ['notify', 'unit:notify-test'], // (round 44) Tell me when…: desktop notifications while away (a long reply → one with Open the chat, render → Show the file, a permission's Allow… opens the card and never approves, one per chat, bursts summed up, each switch silences its events; recorder in place of the OS)
  routines: ['routines', 'unit:routines-test'], // (round 41) 🔁 Keep going: a chat keeps improving by itself (rounds / time / forever with a cap, pauses, owner writing, errors, permission asks, restart, chip costs; fake engines)
  backupauto: ['backupauto', 'unit:backupauto-test', 'unit:datasafe-test', 'unit:scenesafe-test'], // (round 45) automatic, checked backups: an idle backup (never while rendering / on a low battery), Settings › Backups with counts, the rotation, a damaged zip reported, Retry, Restore missing things merges a deleted scene back, the calm note
  idlecpu: ['idlecpu', 'unit:labpace-test', 'unit:hintcalm-test', 'labpace', 'powerwise', 'smooth41', 'motionpolish', 'hintcalm', 'a11y', 'filewatch', 'lazy', 'unit:boot-test'], // (round 44) Hearth on screen and idle: the window, the main process and the Lab preview's page budgeted per setup (a chat, the Lab still / paused, the board, the grid, Activity); the still preview dozes, the hush
  powerwise: ['powerwise', 'unit:powerwise-test', 'unit:hintcalm-test'], // (round 39) awake only while it matters (a stub blocker: renders, recordings, long AI turns, downloads, updates, always released), battery / saver policies, background wakeups per minute, sleep / resume
  filewatch: ['filewatch', 'unit:filewatch-test', 'unit:twocomputers-test', 'unit:sync-test'], // (round 42) files changed outside Hearth: a Lab picture / song saved again → swapped in place, swap files ignored, 200 writes → one update, deleted → Find this file, AI changes marked, attachments read again, idle cost; the service on real folders (simulated Mac / Windows plans)
  undoall: ['undoall', 'unit:undoall-test'], // (round 41) one "Undo last change": a Settings switch / an AI setup row / a deleted / renamed / moved chat back with Ctrl+Z, redo, the Lab and text boxes keep their own undo, Recent changes in Activity
  chatlistfast: ['chatlistfast', 'a11y', 'undoall', 'unit:undoall-test', 'chatcalm', 'recall', 'unit:recall-test', 'lightweight', 'inputlatency', 'lazy', 'unit:boot-test', 'fastboot'], // (round 42) the chats list with 3,000 made-up chats (dev/make-chatlist-fixture.js): open / Show more / wheel / search / one chat changing / switching budgets, no gap in a long group, ↑ ↓ Home End Enter past the drawn rows, right-click, F2, Delete + Ctrl+Z, pins, drag onto a folder; and what it touches
  a11y: ['a11y', 'options', 'settingscalm', 'appsearch', 'missions', 'labeasy', 'labsearch', 'motionpolish', 'qa-keys', 'lazy', 'unit:boot-test'], // (round 40) keyboard + screen readers + contrast: names on every control, roles and states, focus rings in every look, the Tab order and skip link, Esc closes the top-most thing and focus returns, contrast per look, Windows High Contrast (forced colors), replies / tips read out once
  chatswitch: ['chatswitch', 'chatlistfast', 'streamrender', 'unit:streamrender-test', 'lightweight', 'chatcalm', 'a11y', 'inputlatency', 'recall', 'unit:recall-test', 'lazy', 'unit:boot-test'], // (round 45) switching chats feels instant: kept lists for recent chats, the end first, ready on pointing; and what it touches
  menucalm: ['menucalm', 'labeasy', 'labsearch', 'appsearch', 'chatcalm', 'a11y', 'labrecipes', 'labcamera', 'labtemplates', 'labbatch', 'multiformat', 'qa-keys', 'lazy', 'unit:boot-test'], // (round 43) calm menus: budgets per menu, every action ≤ 2 clicks (pointing opens two levels), one name per action, nothing gone; and the checks that read the moved rows
  localanswers: ['localanswers', 'unit:localanswers-test', 'appsearch', 'unit:appsearch-test', 'labsearch', 'unit:whatsnew-test', 'whatsnew', 'chatcalm', 'options', 'lazy', 'unit:boot-test'], // (round 45) 💡 Answered by Hearth: questions about Hearth answered here for free; and what it reuses / touches
  errorcalm: ['errorcalm', 'unit:errorcalm-test', 'unit:errorcalm-scan', 'unit:offline-test', 'unit:winpolish-test', 'unit:macpolish-test', 'unit:renders-test'], // (round 45) errors in plain words: real errors provoked (a missing file / song, ffmpeg on a damaged video, the sync folder gone / replaced, the engine missing, a scene error, a raw note) → one sentence + one action, the raw text behind Details; the mapper; the lint
  promptdiet: ['unit:promptdiet-test', 'unit:tokens-test', 'unit:cache-test', 'unit:director-mcp-test', 'unit:toolslim-test', 'unit:tokenaudit-test', 'unit:concise-test', 'unit:directorlean-test', 'tokenaudit', 'cachewise', 'directorlean', 'concise', 'access-chat', 'lazy', 'unit:boot-test'], // (round 46) the fixed cost of every message per case (budgets), byte-stable prompts, nothing lost (help, three_do, forge globals), runaway results cut + {more: true}, only the owner's words wake a tool set
  labdirect: ['labdirect', 'unit:labdirect-test', 'labeasy', 'layergroups', 'labpace', 'labgestures', 'inputlatency', 'lazy', 'unit:boot-test'], // (round 46) ✥ work on the picture: real mouse drags pick / move / snap / scale / turn layers, one undo per drag, arrows, Alt+wheel, Esc, double-click → sliders; no reads while idle; and what it touches
  unit: UNIT.map((u) => `unit:${u}`),
};
GROUPS.all = [...new Set([...all.filter((n) => !/^astra-/.test(n)), ...GROUPS.astra, ...GROUPS.unit])];

if (argv.includes('--list')) {
  for (const [g, list] of Object.entries(GROUPS)) if (g !== 'all') console.log(`${g}: ${list.join(' ')}`);
  console.log(`all: every check above (${GROUPS.all.length})`);
  process.exit(0);
}
// (round 44) --names <group…>: the checks one per line (to split "all" into parts that fit a time limit)
if (argv.includes('--names')) { console.log([...new Set((names.length ? names : ['qa']).flatMap((n) => GROUPS[n] || [n]))].join('\n')); process.exit(0); } // run them with --exact
// (round 44) --exact: the names are checks, never groups ("a11y" is both: a part of "all" ran its whole group again)
const wanted = [...new Set((names.length ? names : ['qa']).flatMap((n) => (!argv.includes('--exact') && GROUPS[n]) || [UNIT.includes(n) ? `unit:${n}` : n]))];
for (const n of wanted) if (!n.startsWith('unit:') && !all.includes(n)) { console.error(`No check "${n}" (sh dev/run-checks.sh --list)`); process.exit(2); }

// ---------- fixtures (made once, reused; all in the temp folder, never in the app) ----------
const T = '/tmp'; // the checks name these paths themselves
const sh = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const FIX = [
  { re: /hearth-test-song|make-test-song|\.wav\b/, path: `${T}/hearth-test-song.wav`, make: () => sh('node', ['dev/make-test-song.js', `${T}/hearth-test-song.wav`]) },
  { re: /hearth-test-videos|VIDS\b/, path: `${T}/hearth-test-videos`, make: () => sh('sh', ['dev/make-test-videos.sh', `${T}/hearth-test-videos`]) },
  { re: /hearth-editor-videos|EDITOR_VIDS/, path: `${T}/hearth-editor-videos`, make: () => sh('node', ['dev/make-editor-videos.js', `${T}/hearth-editor-videos`]) },
  { re: /hearth-board-fixtures|BOARD_FIXTURES/, path: `${T}/hearth-board-fixtures`, make: () => sh('sh', ['dev/board-fixtures.sh', `${T}/hearth-board-fixtures`]) },
  { re: /labframes-media|make-lab-footage|\bLF\./, path: `${T}/labframes-media`, make: () => sh('node', ['dev/make-lab-footage.js', `${T}/labframes-media`]) },
  { re: /hearth-autoedit-song/, path: `${T}/hearth-autoedit-song.wav`, make: () => sh('node', ['dev/make-test-song.js', `${T}/hearth-autoedit-song.wav`, '128', '0', '--form']) }, // (round 27) a whole track: intro, build, drops, break, outro
  { re: /hearth-intro-song/, path: `${T}/hearth-intro-song.wav`, make: () => sh('node', ['dev/make-test-song.js', `${T}/hearth-intro-song.wav`, '120', '30']) },
  { re: /hearth-capture-test/, path: `${T}/hearth-capture-test`, make: () => sh('node', ['dev/capture-test.js', '--make', `${T}/hearth-capture-test`]) },
  // (round 14) a local Pinterest-like search page for the Pinterest window check (dev/checks/eyes-pins.js)
  // (round 42, chatlistfast) 3,000 made-up chats with folders, tags, pins and archived ones (never real data)
  { re: /hearth-chatlist-fixture/, path: `${T}/hearth-chatlist-fixture/chats`, make: () => sh('node', ['dev/make-chatlist-fixture.js', `${T}/hearth-chatlist-fixture`, '3000']) },
  // (round 43, datasafe) settings, memory, a chat and notes held for the first 20 s of the start, a settings copy, a backup zip
  { re: /hearth-datasafe-fixture/, path: `${T}/hearth-datasafe-fixture/config.json`, make: () => sh('node', ['dev/datasafe-test.js', '--make-fixture', `${T}/hearth-datasafe-fixture`]) },
  { re: /hearth-pins-fixture/, path: `${T}/hearth-pins-fixture/pinterest-like.html`, make: () => { fs.mkdirSync(`${T}/hearth-pins-fixture`, { recursive: true }); fs.copyFileSync(path.join(DEV, 'fixtures', 'pinterest-like.html'), `${T}/hearth-pins-fixture/pinterest-like.html`); } },
];
const srcOf = (n) => (n.startsWith('unit:') ? fs.readFileSync(path.join(DEV, `${n.slice(5)}.js`), 'utf8') : fs.readFileSync(path.join(CHECKS, `${n}.js`), 'utf8'));
const exists = (p) => { try { return fs.statSync(p).isFile() || fs.readdirSync(p).length > 0; } catch { return false; } };
const needed = FIX.filter((f) => wanted.some((n) => f.re.test(srcOf(n)) || /^journey-/.test(n.replace('unit:', ''))));
for (const f of needed) {
  if (exists(f.path)) continue;
  process.stdout.write(`fixtures: ${f.path} … `);
  try { f.make(); console.log('made'); } catch (e) { console.log(`failed (${e.message.split('\n')[0]}): checks that need it will fail`); }
}
if (argv.includes('--fixtures-only')) process.exit(0);

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
// The flags a check's header asks for: the first "node dev/smoke.js …" line in its comments.
function flagsOf(src) {
  const line = (src.match(/node dev\/smoke\.js([^\n`]*)/) || [])[1] || '';
  const toks = line.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const keep = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (['--script', '--shot', '--lib'].includes(t)) { i++; continue; } // set here (libs: by smoke.js)
    // (round 44) --coverage takes its file too: without it smoke.js wrote trim-drive's coverage to a file named "--script"
    if (['--check-timeout', '--wait', '--data', '--eval', '--open', '--save-dir', '--screen', '--dpr', '--coverage'].includes(t)) { keep.push(t, toks[++i].replace(/^["']|["']$/g, '')); continue; }
    if (t.startsWith('--')) keep.push(t);
  }
  if (!keep.includes('--check-timeout')) keep.push('--check-timeout', '600000');
  return keep;
}
// (round 44) What a check returned, judged by its top-level fields, whatever shape it reports in: an explicit
// "ok" / "pass" boolean is the check's own verdict (report modes keep their lists but say true); otherwise a non-empty
// errors / problems / fail(s) / failures / failed / bad / dups list, a "missing…" / "bad…" list or map (nodes-shader's
// badTypes, missingCommands) or a bad / failed count over 0 fails it. Each value smoke.js prints after its "▶ <code>"
// line is read as JSON, or the {…} inside a text result (declutter's "DECLUTTER FAIL … {json}", fastboot's
// "[FASTBOOT]{json} FAIL"). Returns the first failing field ("errors: a 9:16 take…"), or ''.
const FAIL_KEY = /^(?:errors|problems|fails?|failures|failed|bad|dups|missing\w*|bad[A-Z]\w*)$/;
function verdictOf(text) {
  // (the "▶" line shows the start of the check's code, which can run over several lines: the value is the JSON that
  // runs to the section's last "}", tried from each "{" on)
  const sections = text.split(/\n▶ /).slice(1).map((s) => s.split(/\n(?:screenshot: |coverage: |kept: |OK: no page errors\.|\d+ problem\(s\):)/)[0].trim());
  for (const s of sections) {
    let v = null;
    const b = s.lastIndexOf('}');
    for (let a = s.indexOf('{'), tries = 0; a >= 0 && a < b && !v && tries < 400; a = s.indexOf('{', a + 1), tries += 1) { try { v = JSON.parse(s.slice(a, b + 1)); } catch { /* not there yet */ } }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    if (v.ok === false || v.pass === false) return `${v.ok === false ? 'ok' : 'pass'}: false`;
    if (v.ok === true || v.pass === true) continue;
    for (const [k, x] of Object.entries(v)) {
      if (!FAIL_KEY.test(k)) continue;
      const n = Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : /^(?:bad|failed|failures|fails?)$/.test(k) && typeof x === 'number' ? x : 0;
      if (n > 0) return `${k}: ${Array.isArray(x) ? String(x[0]) : x && typeof x === 'object' ? Object.keys(x)[0] : x}${n > 1 ? ` (+${n - 1})` : ''}`;
    }
  }
  return '';
}
const results = [];
const t0 = Date.now();
for (const n of wanted) {
  const started = Date.now();
  const log = path.join(OUT, `${n.replace('unit:', 'unit-')}.log`);
  let r;
  if (n.startsWith('unit:')) {
    const u = n.slice(5);
    const extra = u === 'cut-test' ? [`${T}/hearth-test-videos`] : [];
    r = spawnSync('node', [path.join(DEV, `${u}.js`), ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
  } else if (n.startsWith('astra-')) {
    r = spawnSync('node', [path.join(DEV, 'astra-smoke.js'), n.slice(6), '--shot', path.join(OUT, `${n}.png`)], { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
  } else {
    const shots = path.join(OUT, n);
    // step pictures only when asked (--shots): a 1080×1080 screenshot mid-journey can starve a recording on a busy machine
    const a = [path.join(DEV, 'smoke.js'), ...flagsOf(srcOf(n)), ...(argv.includes('--shots') ? ['--eval', `window.JOURNEY_SHOTS=${JSON.stringify(shots)}`] : []), '--script', path.join(CHECKS, `${n}.js`), '--shot', path.join(OUT, `${n}.png`)];
    // (round 23) voice checks hear through dev/fake-whisper.js (whisper-cli's stand-in: canned text by the tone it hears)
    const env = /^voice/.test(n) ? { ...process.env, HEARTH_WHISPER: path.join(DEV, 'fake-whisper.js'), HEARTH_WHISPER_MODEL: path.join(DEV, 'fake-whisper.js') } : process.env;
    r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20, env });
  }
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  fs.writeFileSync(log, text);
  // failed: a non-zero exit, a result with a top-level "ok": false or "pass": false (round 39: appsearch reports "pass"; round 43: a non-empty top-level "errors" list, as the capture checks report) (not one nested in what a check reports), a ✖ step,
  // or a FAIL line from a Node test; (round 44) any failing top-level field of a check's result, in whatever shape (verdictOf)
  const verdict = n.startsWith('unit:') || n.startsWith('astra-') ? '' : verdictOf(text);
  const bad = r.status !== 0 || Boolean(verdict) || /^(?:\{ ?| )"(?:ok|pass)":\s*false/m.test(text) || /^ "errors": \[\s*"/m.test(text) || /^\s*"?✖/m.test(text) || /^(FAIL|✖)/m.test(text);
  const why = bad ? (text.match(/\d+ problem\(s\):\n([^\n]*)/)?.[1] || text.match(/^\s*"?✖[^\n]*/m)?.[0] || verdict || text.match(/^FAIL[^\n]*/m)?.[0] || text.match(/"problems":\s*\[[^\]]*\]/)?.[0] || (r.error ? r.error.message : `exit ${r.status}`)).trim().slice(0, 200) : '';
  results.push({ n, ok: !bad, s: Math.round((Date.now() - started) / 1000), why });
  console.log(`${bad ? '✖' : '✓'} ${n.padEnd(22)} ${String(results.at(-1).s).padStart(4)} s${bad ? `  ${why}` : ''}`);
  if (bad && argv.includes('--stop')) break;
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 60000)} min · logs: ${OUT}`);
process.exit(failed.length ? 1 : 0);
