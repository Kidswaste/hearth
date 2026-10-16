# commandonly (round 51): every command reachable without typing it

Your rule since round 26: "no feature reachable only by a command". This pass checked it for **every** command
Hearth has (925 commands and 327 other names for them, lazy groups included) and for what only the Three Director
could do through its tools. For each one: is there a way to reach it by pointing and clicking (a button, a menu or
right-click row, a Settings / AI setup row, a picker, a Lab search result or a Ctrl/⌘+K row that acts)? Where an
owner-facing thing had none, it got one in the place you'd look, folded into a menu that already exists. No new
buttons on screen.

## How it was counted
- **Ctrl/⌘+K runs it**: every command that isn't hidden, is there when the first screen is up, and needs no words is a
  row of Find anything that runs it straight away (said in plain words, never "/name"). Those count as reachable.
  A command that needs words (`/remind <time> <text>`) only puts "/remind " in the chat box from Ctrl/⌘+K: that's
  typing, so it doesn't count. The director's commands are registered just after the first screen (sometimes just
  before): they're not counted on Ctrl/⌘+K at all, each has its own place.
- **Everything else** got checked by hand against the app's menus and panels, and its visible way is written down in
  `dev/commandonly-ways.js` (the table below is made from it).

| | Count |
|---|---|
| Commands (other names: 327) | **925** |
| Reached by a Ctrl/⌘+K row that runs it | 665 |
| Reached by a button / menu / Settings / panel already | 216 |
| **Newly reachable** (this pass) | **10** (+ the board's right-click rows that went missing, fixed) |
| Developer / typed-language only (marked, stay typed) | 21 |
| No visible way, in Codex's Astra modules (reported, not changed) | 13 |
| Director-only tool capabilities checked | 50 (all have your own way, 3 are agent bookkeeping) |

## Upgrades

### Newly reachable
1. **Snippets** (was only `/snippet`, `/snippets`): right-click the chat box › More… › **Snippets** › click one to
   insert it, **Save this message as a snippet…**, **Delete a snippet ›**.
2. **Remind me…** (was only `/remind`): right-click the chat box › More… › **Remind me…** asks *when* (in 25m, 21:30,
   9pm) and *about what* (your draft is filled in); you get a note and a system notification then.
3. **Open a code file as nodes…** (was only `/code-nodes-file`): right-click the chat box › More… (a file picker, JS /
   TS / Python / GLSL).
4. **How messages look** (was only `/width`, `/spacing`, `/timestamps`, `/font`): chat ⋯ (right-click the header) ›
   View › **How messages look** › Width (narrow → full), Spacing (roomy / tight), Times (when you point, always,
   never), Font (default, sans, serif, mono, rounded). Each shows the one in use.
5. **Palette style** (was only `/board-palette-style`): right-click a palette card on the board › **Palette style** ›
   Stripes, Gradient, Dots, Blocks by share.
6. **Window at an exact size…** (was only `/window-size`): Capture › Settings › Recording… › 1920 × 1080, 1280 × 720,
   1080 × 1350, 1080 × 1080, and "Back to its size before" once you used one (clean 16:9 / 4:5 recordings).

### Fixed on the way
7. **The board's right-click lost rows whenever the Apps were loaded**: a website's Open in browser / Live preview /
   Snapshot at, a note's text options, a shape's / arrow's / sticker's kind and color, a frame's Rename / color /
   Presentation, a color or palette card's Copy hex / Harmonies / Change color… all vanished (an `else` after the
   Meshy row swallowed them). They show again.

### Kept honest
8. **The commandonly lint** (`dev/commandonly-scan.js`, in UNIT): fails when a command has no visible way, when a
   new command shows up that nobody judged, or when the list names a command that no longer exists.
9. **The table below**: every command → its visible way, or why it stays typed.

**9 upgrades.**

## How it's built
- `dev/commandonly-ways.js`: `WAYS` (name → its visible way in plain words), `DEV` (name → why it stays typed),
  `REPORTED` (Codex's, no way yet), `NEW` (this round's), `DIRECTOR` (the director's tools → your own way).
- `dev/commandonly-scan.js`: the commands come from `dev/commandonly-list.json` (Commands.list() of the running app,
  recorded by `node dev/commandonly-scan.js --record`) and the lazy manifest (`lazy-data.js` LazyData.META: a lazy
  command newer than the recording is judged by the manifest's own args / hidden); a name registered in the app's
  files that neither knows (`name: '…'` / `reg('…'` with a desc or args) must get a line. `--table` prints the table
  below, `--self-test` checks the rules.
- `declutter.js` (the chat box's right-click: Snippets ›, Remind me…, Open a code file as nodes…, all behind More…),
  `native.js` (chat ⋯ › View › How messages look: `messageLook()`), `board-menus.js` (Palette style; the right-click
  chain fix), `capture.js` (Recording… › Window at an exact size…). Every row runs the same code as the command (the
  reminder and the window size run the command itself; Ctrl/⌘+K finds the rows too, since it reads the menus).

## Edits outside my lane (small, additive)
`declutter.js`, `native.js`, `board-menus.js`, `capture.js` (the rows above), `dev/run-checks.js` (`commandonly` group,
`commandonly-scan` in UNIT). No new script tags, commands, Ctrl/⌘+K actions or keys: the lazy manifest is unchanged.

## Tests
- `node dev/commandonly-scan.js` (UNIT): PASS (925 commands, 0 without a way; self-test 8/8).
- `dev/checks/commandonly.js` (new, `sh dev/run-checks.sh commandonly`): right-clicks the chat box › More… › Snippets ›
  a saved snippet lands in the chat box, Save this message… is there; Remind me… asks when / what and sets a timer
  ≈ 10 min away; Open a code file as nodes… is there; chat ⋯ › View › How messages look › Width › Wide, Spacing ›
  Tight, Times › Always, Font › Serif each change the chat; a board palette card's right-click shows Copy hex /
  Harmonies with the Apps loaded and Palette style › Dots restyles it; Capture › Settings › Recording… › Window at an
  exact size… › 1280 × 720 sizes the window's content (then back). PASS.
- Targeted runs: see the final report (appsearch, appcalm, labcalm, menucalm, settingscalm, qa-commands, a11y, lazy,
  unit:boot-test).

## Risks
- A command registered after the first screen (the director's) isn't a Ctrl/⌘+K row on some starts and is on others
  (a race older than this pass): the lint doesn't count Ctrl/⌘+K for them, so each has its own place listed.
- `dev/commandonly-list.json` is a recording: a new eager command is caught by the file scan (it must get a line);
  re-record after big changes (`node dev/commandonly-scan.js --record`, ~20 s).
- The board fix makes the right-click of a selected website / note / shape / arrow / sticker / frame / color longer
  again (as it was before the Meshy row): the rows are the ones those items had.

## Reported to Codex (Astra modules, not changed)
No visible way yet: `/astra-steer` (guidance into a running Astra reply: a "Steer…" row in the running reply's ⋯ would
do), `/astra-preset`, `/astra-deep` and `/astra-quick` (once-only effort; AI setup › How hard it thinks covers the
chat), `/astra-web-once`, `/astra-clone`, `/astra-compare-models`, `/astra-feature`, `/astra-persona-save` /
`-delete`, `/collab-persona` (⚇'s right-click would be their home). `/astra-forget` and `/astra-memory-shared` are
covered by 🧠 Memory (Forget, Add for All agents) for any AI.

## The table: every command → its visible way
"Ctrl/⌘+K: “…”" means a Find anything row says those words and runs it. **new:** marks this round's ways.

### Adobe (7)

| Command | Visible way |
|---|---|
| `/adobe` | Ctrl/⌘+K: “Your Adobe apps from Hearth: which are installed, send pictures / boards / edits to them, ” |
| `/adobe-tools` | Ctrl/⌘+K: “Let this agent use your Adobe apps (adobe_do tool: open, export, send, bring back; it asks” |
| `/illustrator` | Ctrl/⌘+K: “Illustrator: the front document (or a file) as SVG for the Lab, PNG back into Hearth” |
| `/indesign` | Ctrl/⌘+K: “InDesign: the front document as PDF, a picture placed in it” |
| `/media-encoder` (/ame) | Ctrl/⌘+K: “Media Encoder: queue a render (your saved presets or its default) and start encoding” |
| `/photoshop` (/ps) | Ctrl/⌘+K: “Photoshop: the Lab preview or the board as layers, your actions, social sizes, the front d” |
| `/premiere` (/pr) | Ctrl/⌘+K: “Premiere Pro: the Lab sequence as FCP XML, a render into a new sequence, the active sequen” |

### Agents (21)

| Command | Visible way |
|---|---|
| `/agent` (/switch) | The rail: click an AI |
| `/agent-new` (/new-agent) | Ctrl/⌘+K: “Add an agent from a preset (42 personas, websites…): opens it ready to save” |
| `/agent-presets` (/personas) | Ctrl/⌘+K: “List the agent presets and personas” |
| `/agents` | Ctrl/⌘+K: “Your chat agents, what they run on, and which are busy” |
| `/all` (/ask-all) | Rail right-click › Panels › Ask-all bar · ◎ Missions › Ask everyone |
| `/ask` (/to) | Open that AI in the rail and write to it · ◎ Missions › Side by side |
| `/astra` (/gpt /chatgpt) | Astra in the rail · ⚇ Work with Astra (chat box) · ◎ Missions › Side by side |
| `/both` | ◎ Missions › Side by side |
| `/check-ai` | Ctrl/⌘+K: “Check this AI: found, signed in, can read / write its folder, can run a command, with a fi” |
| `/claude` | Claude in the rail · ◎ Missions › Side by side |
| `/connections` | Ctrl/⌘+K: “Your MCP servers for this AI: add ready-made ones, test, switch on / off” |
| `/continue-with` (/move-to-agent) | Chat ⋯ (right-click the header) › Organise › Continue with … |
| `/dock` | Ctrl/⌘+K: “Show or hide the director chat docked in this tool” |
| `/doctor` | Ctrl/⌘+K: “Check Claude Code and Codex in one card: every copy, versions, signed in, too old? with on” |
| `/effort` | ⋯ AI setup › How hard it thinks |
| `/engine-update` | Ctrl/⌘+K: “Update Claude Code (or Codex) in a visible Terminal / PowerShell window, then check it aga” |
| `/engines` (/engine) | Ctrl/⌘+K: “Every Claude Code / Codex copy on this computer with its version; "claude auto" uses the n” |
| `/login` (/sign-in) | Ctrl/⌘+K: “Sign this agent's engine in to your account (opens its own window)” |
| `/model` (/m) | Ctrl/⌘+K: “The model this chat uses (no name: shows it) · with a 3D verb (library, add, material, mov” |
| `/stop` | Ctrl/⌘+K: “Stop the reply in progress” |
| `/stop-all` (/stopall /halt) | Ctrl/⌘+K: “Stop every reply in progress, in every chat” |

### App (83)

| Command | Visible way |
|---|---|
| `/after` (/later-cmd) | developer / typed only: the typed-command language: run a command after a delay (🔁 Keep going and ⏰ Remind me are the visible ones) |
| `/alias` (/my-command) | developer / typed only: the typed-command language: your own command names |
| `/at` | developer / typed only: the typed-command language: run a command at a time |
| `/background` | Ctrl/⌘+K: “What Hearth does in the background now (sync pace, app windows, replies) and the memory / ” |
| `/calc` (/math) | developer / typed only: quick math typed in the chat box (the Kit has the calculators people use) |
| `/calm` | Ctrl/⌘+K: “Tuck secondary buttons away (on, the default) or show everything (off)” |
| `/chime` | Ctrl/⌘+K: “A soft chime when a reply lands in a chat you aren't looking at” |
| `/click` | developer / typed only: used by Again and learned shortcuts to press a button by its name |
| `/cmd-export` | Ctrl/⌘+K: “Save your aliases, macros, pinned commands and command history to a file” |
| `/cmd-history` (/hist /cmds-run) | Ctrl/⌘+K: “The commands you ran lately (click one to run it again)” |
| `/cmd-import` | Ctrl/⌘+K: “Bring back aliases, macros and pins from a /cmd-export file (merges, keeps yours)” |
| `/cmd-links` | Ctrl/⌘+K: “Commands written in agents' replies and your notes (like `/size 9:16`) run when clicked (o” |
| `/cmd-reset` | developer / typed only: resets the typed-command history / pins / counts (power users) |
| `/cmd-stats` (/my-commands /top-cmds) | Ctrl/⌘+K: “The commands you use most (and areas you never touched)” |
| `/cmdbar` (/bar-cmd /cmd) | Ctrl/⌘+K: “The command bar over any tool (Ctrl/⌘+;): commands run in what's on screen; top / bottom m” |
| `/commands` | Ctrl/⌘+K: “The Commands page: every command explained, with a preview, run one question at a time (/c” |
| `/customise` (/customize) | Ctrl/⌘+K: “What waits behind Alt or hover, and what you pinned back on screen” |
| `/deleted` | Ctrl/⌘+K: “Recently deleted chats” |
| `/discover` (/tip-cmd) | Ctrl/⌘+K: “Three commands you have never run (from what's on screen first), with examples” |
| `/do` (/action) | developer / typed only: runs a Ctrl/⌘+K action by name: Ctrl/⌘+K itself is the visible way |
| `/echo` | developer / typed only: prints a note: used by timers and chains |
| `/every` | developer / typed only: the typed-command language: a command on a timer (🔁 Keep going is the visible one) |
| `/feature-map` (/features-map) | Ctrl/⌘+K: “Every area with what you used and what you never tried (☰ Commands › Discover), with ✦ Sur” |
| `/freshen` | Ctrl/⌘+K: “Reload the window and keep everything (chats, drafts, scroll, the Lab): for a long session” |
| `/fullscreen` (/full-screen) | Rail ⋯ › Full screen (Ctrl/⌘+K "full screen") |
| `/graphics` (/gpu) | Ctrl/⌘+K: “The graphics card: is Hearth drawing with it, how often it restarted, the Lab picking up a” |
| `/habits` | Ctrl/⌘+K: “What you use most, what you never touch, your most frequent errors and their fixes; tidies” |
| `/hints` (/no-tips) | Ctrl/⌘+K: “Tips that show by themselves (the ✦ card, What's new, hints, suggestion lines): on, off (D” |
| `/how` (/which /find-cmd) | Ctrl/⌘+K Find anything (plain words) |
| `/ideas` (/tonight) | Ctrl/⌘+K: “Ideas for tonight from your boards, songs, scenes and apps; each starts the right command ” |
| `/keys` (/cmd-keys) | Ctrl/⌘+K: “Commands that also have a keyboard shortcut” |
| `/macro` (/macros) | Ctrl/⌘+K: “Macros: record the commands you run (rec … stop) into your own command, or write one with ” |
| `/makes` | Ctrl/⌘+K: “Everything Hearth makes, one name and mark each: plan a make (its rooms are made now, grou” |
| `/notes` | Ctrl/⌘+K: “Open Notes” |
| `/notify` (/notifications) | Ctrl/⌘+K: “Desktop notifications while you look elsewhere: replies, things that need you (stuck, a pl” |
| `/notify-when` (/tell-me-when) | Ctrl/⌘+K: “Tell me when…: which desktop notifications Hearth shows while you are in another app (no a” |
| `/ontop` (/pin-window) | Ctrl/⌘+K: “Keep Hearth above other windows (again: stop)” |
| `/palette` | Ctrl/⌘+K: “Open the command palette” |
| `/patch-notes` (/changelog) | Ctrl/⌘+K: “What changed, round by round, in plain words” |
| `/pin-control` | Right-click a tucked button › Customise this… › Keep it on screen |
| `/power` (/awake) | Ctrl/⌘+K: “What keeps the computer awake now, battery / saver, and the background pace; "sleep" lets ” |
| `/progress` (/loading) | Ctrl/⌘+K: “What is being made right now, with how far along it seems (the list at the bottom of the r” |
| `/prompts` | Ctrl/⌘+K: “Manage saved prompts” |
| `/recover` | Ctrl/⌘+K: “Find chats, memory lines, settings and tool data that aren't in your lists any more (autom” |
| `/redo` | Ctrl/⌘+K: “Redo on the board (Ctrl+Shift+Z)” |
| `/redo-change` | Ctrl/⌘+K: “Redo the change you just undid (Ctrl+Shift+Z)” |
| `/remind` (/reminder) | **new:** Right-click the chat box › More… › Remind me… |
| `/report` (/report-bug) | Ctrl/⌘+K: “Report a problem to the developer who builds Hearth (a GitHub issue; you review it first);” |
| `/restored` (/crash-restore) | Ctrl/⌘+K: “What came back the last time Hearth closed unexpectedly (the card again, with its Open but” |
| `/resume` | Ctrl/⌘+K: “Pick up where you left off: the last chat, Lab scene (and its sequence position), render o” |
| `/reveal` | Ctrl/⌘+K: “Show the buttons that wait behind Alt (like holding Alt) until Esc or /reveal off” |
| `/rightclick` (/context-menu) | Ctrl/⌘+K: “Open the right-click menu of a part of the screen (the same as right-clicking it)” |
| `/run` (/chain /then) | developer / typed only: the typed-command language: several commands in a row |
| `/settings` | Ctrl/⌘+K: “Open Settings (with words: only what matches, e.g. /settings tokens)” |
| `/shortcuts` | Ctrl/⌘+K: “Keyboard shortcuts” |
| `/since-away` (/catch-up) | Ctrl/⌘+K: “Since you were away: the top changes of every round you missed, in one page (Show me, the ” |
| `/smooth` (/jank) | Ctrl/⌘+K: “How smooth Hearth runs on this computer: input delay and long frames per area, the 5 worst” |
| `/spotlight` (/spotlights /guide-me) | Ctrl/⌘+K: “Guided spotlights: a 3–5 step tour of a big new thing, with a ring on the real controls (s” |
| `/star` (/pin-cmd /fav-cmd) | ☰ Commands page: right-click a command › ☆ Pin to the top |
| `/stars` (/pinned-cmds) | Ctrl/⌘+K: “Your pinned commands (first in the / menu)” |
| `/startup` (/boot-time) | Ctrl/⌘+K: “How long Hearth took to open, step by step (window, loading screen, chats, first screen, f” |
| `/surprise-me` (/surprise-feature) | Ctrl/⌘+K: “Picks something fun you have never tried and starts it (or puts it in the chat box)” |
| `/sync` | Ctrl/⌘+K: “Sync with your cloud drive (Mac ⇄ PC): is everything synced?, sync now, conflicts, deleted” |
| `/time` (/now /date) | Ctrl/⌘+K: “The date and time (nothing is sent)” |
| `/timer-cancel` (/untimer /stop-timer) | developer / typed only: stops a typed timer (Ctrl/⌘+K › Command timers has Stop buttons) |
| `/timers` (/schedules) | Ctrl/⌘+K: “Your command timers (/every, /at, /after), with buttons to stop them” |
| `/timers-pause` (/pause-timers) | Ctrl/⌘+K: “Pause every command timer (again: resume); repeating ones skip their turns while paused” |
| `/tip` (/did-you-know) | Ctrl/⌘+K: “A "Did you know?" for something you have never used (at most one a day by itself)” |
| `/titlebar` | Ctrl/⌘+K: “Mac: the traffic lights in the rail (inset) or the plain title bar (native), after a resta” |
| `/tucked` | Ctrl/⌘+K: “The buttons you tucked behind Alt yourself (right-click → Customise this… → Tuck); /tucked” |
| `/unalias` | developer / typed only: the typed-command language: removes your own command name |
| `/undo-change` (/undo-last) | Ctrl/⌘+K: “Undo the last change anywhere in Hearth (a setting, an AI's setup, a chat deleted / rename” |
| `/undo-report` (/undos /undo-coverage) | Ctrl/⌘+K: “What can be undone and how: every undo by area, coverage of the commands, and your last co” |
| `/unpin-control` | Right-click a button › Customise this… › Tuck it away |
| `/update` (/upgrade-hearth) | Ctrl/⌘+K: “Update Hearth from main (its git checkout): what's new, then pull and reload / restart” |
| `/usage-table` | Ctrl/⌘+K: “Token usage table” |
| `/wait` (/sleep /delay) | developer / typed only: the typed-command language: a pause inside a chain |
| `/watching` (/file-watch) | Ctrl/⌘+K: “Which files Hearth follows on disk (the Lab's media, your AIs' files and folders, attachme” |
| `/what` (/explain-cmd /whatis) | ☰ Commands page: click a command (its example, what it asks, its keys) |
| `/what-can-i-do` (/quickstart) | Ctrl/⌘+K: “What can I do here? 3–5 things worth trying in this window, picked from what you haven't u” |
| `/whats-new` (/whatsnew /news) | Ctrl/⌘+K: “What's new in Hearth: the changes that fit how you work (after an ⬆ Update, or a round), e” |
| `/whats-running` (/activity-all) | Ctrl/⌘+K: “Activity: what every chat and Hearth are doing now, what waits for you, the last 24 h (ope” |
| `/where` (/cmd-context) | Ctrl/⌘+K: “Where commands run right now: the tool on screen, the chat they talk to, and which shared ” |

### Apps (6)

| Command | Visible way |
|---|---|
| `/apps` | Ctrl/⌘+K: “The services you use, each in its own window (Meshy, Suno, Figma, Poly Haven…): /apps alon” |
| `/apps-tools` | Ctrl/⌘+K: “Let this chat's agent use the app tools (open an app, ask Meshy for a 3D model: it always ” |
| `/chrome` | Ctrl/⌘+K: “Google sign-in in your real Chrome: the Hearth Chrome (its own profile), what opens there,” |
| `/meshy` | Apps › Meshy (its own window) · board item right-click › 🧊 Make a 3D model of it (Meshy)… |
| `/polyhaven` (/hdri) | Ctrl/⌘+K: “Free HDRI skies (and textures) from Poly Haven, straight into the Lab: no account, CC0” |
| `/suno` | Ctrl/⌘+K: “Suno in its own window; /suno prompt writes style tags and lyrics from the scene's vibe an” |

### Assets (1)

| Command | Visible way |
|---|---|
| `/assets` (/asset) | Ctrl/⌘+K: “Your asset library: textures, HDRIs, 3D models, fonts, sounds, LUTs, shaders, presets from” |

### Assist (6)

| Command | Visible way |
|---|---|
| `/assist` | Ctrl/⌘+K: “What Hearth decided for you lately and what Astra's small questions cost; undo the last au” |
| `/astra-pick` | Ctrl/⌘+K: “In the variations picker: Astra picks the strongest one (one small question with a contact” |
| `/name` | Ctrl/⌘+K: “Name the sketch (or save the sliders as a look) from its colors and song, no tokens; "astr” |
| `/next-steps` (/whats-next) | Ctrl/⌘+K: “What to do next, from the Lab as it is now: a few one-click steps, no tokens” |
| `/shuffle-pick` (/pick-shuffle) | Ctrl/⌘+K: “Shuffle the sliders n times (4) into thumbnails; click one to keep, or ✦ lets Astra pick t” |
| `/usual` | Ctrl/⌘+K: “Your usual frame size in the Lab (learned from your clicks, per song too)” |

### Astra (41)

| Command | Visible way |
|---|---|
| `/astra-apps` | Ctrl/⌘+K: “Apps connected to your ChatGPT account (adds tokens per message)” |
| `/astra-clone` | **NONE** (reported to Codex): astra.js: an Astra variant with a persona |
| `/astra-color` | Ctrl/⌘+K: “Astra's accent color (stars, cards, chip)” |
| `/astra-compare-models` | **NONE** (reported to Codex): astra.js: one task on each Astra model side by side |
| `/astra-deep` (/deep) | **NONE** (reported to Codex): astra.js: one message with the most reasoning (AI setup › How hard it thinks sets it for the chat) |
| `/astra-doctor` | Ctrl/⌘+K: “The same card as /doctor (Codex and Claude, with fixes)” |
| `/astra-effort` | Ctrl/⌘+K: “Reasoning effort for this chat (minimal…max for Astra, low…max for Claude; model support v” |
| `/astra-feature` | **NONE** (reported to Codex): astra.js: switch one of Codex's disabled features back on |
| `/astra-files` | Ctrl/⌘+K: “Opt-in file access for Astra: a folder it can read (or edit) inside Codex's sandbox” |
| `/astra-flags` | Ctrl/⌘+K: “The exact command line Hearth runs for an agent (frugal flags, features, sandbox)” |
| `/astra-forget` | **NONE** (reported to Codex): astra.js: remove memory lines (🧠 Memory has Forget for every fact) |
| `/astra-help` | Ctrl/⌘+K: “What Astra can do, and how Claude and Astra work together” |
| `/astra-log` | Ctrl/⌘+K: “The last lines of the engine log (exit codes, errors), for troubleshooting” |
| `/astra-login` | Ctrl/⌘+K: “Sign Codex in with your ChatGPT account (opens its own window)” |
| `/astra-memory` | Ctrl/⌘+K: “Show Astra's memory, or add a fact to it” |
| `/astra-memory-shared` | **NONE** (reported to Codex): astra.js: a shared memory fact (🧠 Memory: Add for All agents does the same) |
| `/astra-model` | Ctrl/⌘+K: “Switch this chat's model (--default: the agent's default)” |
| `/astra-new` | Ctrl/⌘+K: “New chat with Astra” |
| `/astra-open` | Ctrl/⌘+K: “Open Astra (and send it a message)” |
| `/astra-persona` | Ctrl/⌘+K: “Give this chat a persona (coder, reviewer, writer, researcher, director…)” |
| `/astra-persona-delete` | **NONE** (reported to Codex): astra.js: delete a saved persona |
| `/astra-persona-save` | **NONE** (reported to Codex): astra.js: save your own persona |
| `/astra-personas` | Ctrl/⌘+K: “List the persona presets” |
| `/astra-preset` | **NONE** (reported to Codex): astra.js: effort + verbosity bundles for a chat |
| `/astra-prompt` | Ctrl/⌘+K: “Show the instructions + memory each agent sends with every message (and their size)” |
| `/astra-quick` (/quick) | **NONE** (reported to Codex): astra.js: one message with the least effort (AI setup › How hard it thinks sets it for the chat) |
| `/astra-reset` | Ctrl/⌘+K: “Start a fresh engine session for this chat (the next message carries the conversation)” |
| `/astra-session` | Ctrl/⌘+K: “This chat's engine session id, and how to continue it in a terminal” |
| `/astra-settings` | Ctrl/⌘+K: “Open Astra's agent settings” |
| `/astra-status` | Ctrl/⌘+K: “This chat's model, effort, persona, files, session and collab totals” |
| `/astra-suggest` | Ctrl/⌘+K: “Next-step suggestion buttons under Astra's replies (a few tokens)” |
| `/astra-talkback` | Ctrl/⌘+K: “Let Astra ask you questions, show plans and get Claude's opinion (adds tool descriptions)” |
| `/astra-thinking` | Ctrl/⌘+K: “Show Astra's thinking summaries (off saves tokens)” |
| `/astra-tokens` | Ctrl/⌘+K: “Tokens of this chat: replies, second opinions, collaborations” |
| `/astra-usage` | Ctrl/⌘+K: “Tokens used by Astra and Claude agents, today and over the last days” |
| `/astra-verbosity` | Ctrl/⌘+K: “How long Astra's answers are in this chat” |
| `/astra-web` | Ctrl/⌘+K: “Web search for Astra in this chat (adds tokens when used)” |
| `/astra-web-once` (/web) | **NONE** (reported to Codex): astra.js: one question with live web search |
| `/decide` | Ctrl/⌘+K: “Let Astra choose for you (one small question, applied with Undo): a Lab look / effect / pa” |
| `/director-engine` | Ctrl/⌘+K: “Run a docked director (Three / Video) on Claude or on Astra: same chat, same scene, the ta” |
| `/open-tool` | Ctrl/⌘+K: “Astra can open pages and files for you (chat_open, one small tool). On by default” |

### Board (104)

| Command | Visible way |
|---|---|
| `/board` | Ctrl/⌘+K: “Open the mood board (or switch to a board by name)” |
| `/board-add` | Board ＋ Add (website, files, note, colors…) · drop things on the board |
| `/board-align` | Board: right-click the selection › Align |
| `/board-alt` | Ctrl/⌘+K: “What the selected picture shows, in one line (chats read it instead of looking again); no ” |
| `/board-arrow` | Board ＋ Add › Arrow or line |
| `/board-ask` | Board item right-click › Ask a chat about it · board ⋯ › Ask a chat about the board |
| `/board-autotag` | Ctrl/⌘+K: “Tag the selection (or everything) from its vibe: #low-key #warm #muted #busy #fast-cuts #t” |
| `/board-backdrop` | Ctrl/⌘+K: “Use the selected picture as the board's background (off removes it)” |
| `/board-bg` | Board right-click › View › Background |
| `/board-blend` | Board item right-click › Look › Blend |
| `/board-brief` | Board ⋯ › Brief… |
| `/board-clean` | Ctrl/⌘+K: “Move media no board uses any more to the Recycle Bin” |
| `/board-clip` | Board clip right-click › Clip (in / out / speed / frame grab / poster…) |
| `/board-collection` (/board-collections) | Ctrl/⌘+K: “Smart collections on the board: show <name\\|words>, save <name> <words>, delete <name>, li” |
| `/board-color` | Board ＋ Add › Color / Palette library |
| `/board-compare` | Ctrl/⌘+K: “Compare two selected items (wipe, side by side, onion, difference + their vibes)” |
| `/board-connect` | Ctrl/⌘+K: “Connect the selected items with arrows, in the order you picked them (C): arrow, both, lin” |
| `/board-copy-image` | Ctrl/⌘+K: “Copy the selection (or the whole board) to the clipboard as a picture” |
| `/board-crop` | Board item right-click › Look › Crop |
| `/board-delete` | Ctrl/⌘+K: “Delete the current board (Undo in the notification)” |
| `/board-diff` | Board ⋯ › Compare with another board |
| `/board-distribute` | Board: right-click the selection › Distribute |
| `/board-duplicate` | Ctrl/⌘+K: “Copy the current board” |
| `/board-export` | Board ⋯ › Export |
| `/board-eyedropper` | Ctrl/⌘+K: “Pick a color anywhere on screen as a swatch (E on the board)” |
| `/board-find` | Board ⋯ › Search and filter… (/) |
| `/board-fit-text` | Ctrl/⌘+K: “Make the selected text fill its box” |
| `/board-focus` | Board ⋯ › Chats get… |
| `/board-footage` | Ctrl/⌘+K: “Allow (or stop) chats using the selected clip / picture itself as footage — off by default” |
| `/board-frame` | Ctrl/⌘+K: “A frame (around the selection, or a size)” |
| `/board-from-chat` | Ctrl/⌘+K: “Put the pictures attached in this chat on the board” |
| `/board-from-lab` | Ctrl/⌘+K: “Put the Lab's current picture on the board” |
| `/board-gather` | Ctrl/⌘+K: “Bring the selection together in the middle of the view” |
| `/board-grab` | Ctrl/⌘+K: “Frame grab: the selected clip at a time (seconds) as a still on the board” |
| `/board-grid` | Board right-click › View › Grid size · Settings › Advanced › Mood board |
| `/board-groups` (/board-group-vibe) | Ctrl/⌘+K: “Gather references that feel alike into frames named by their shared mood (the selection, o” |
| `/board-harmony` | Board ＋ Add › Color › Harmony from a color… · a color card right-click › Harmonies |
| `/board-hide` | Ctrl/⌘+K: “Hide the selection (it stays out of the vibe); "show" brings everything back” |
| `/board-import` | Ctrl/⌘+K: “Add a whole folder of pictures and clips, or open a board file (.json)” |
| `/board-info` | Ctrl/⌘+K: “Everything about the selected item (file, size, length, cuts, tags…)” |
| `/board-lab-look` (/board-to-look) | Ctrl/⌘+K: “The board's palette (or the selection's) → the Lab sketch's palette, its color sliders rec” |
| `/board-layout` (/board-arrange) | Board: right-click the selection › Auto-arrange · board right-click › Arrange everything |
| `/board-lens` | Board right-click › Lens |
| `/board-link` | Ctrl/⌘+K: “Link this chat to a board (the drawer and /board-use pick it here)” |
| `/board-list` | Ctrl/⌘+K: “The board as a sortable table: kind, light, contrast, saturation, warmth, motion, pacing, ” |
| `/board-lock` | Ctrl/⌘+K: “Lock / unlock the board (look and send vibes, nothing moves)” |
| `/board-look` | Board item right-click › Look › Filter |
| `/board-loop-shot` | Ctrl/⌘+K: “The selected clip loops the shot it is on (in / out at its cuts)” |
| `/board-minimap` | Board right-click › View › Minimap · Settings › Advanced › Mood board |
| `/board-move-to` | Board: right-click the selection › Move to board / Copy to board |
| `/board-new` | Board ⋯ › New board… / New from a template |
| `/board-note` | Board ＋ Add › Note (N) |
| `/board-note-on` | Board item right-click › Your note on it… |
| `/board-opacity` | Board item right-click › Look › Opacity |
| `/board-overview` | Ctrl/⌘+K: “All your boards with their covers (click one to open it)” |
| `/board-palette` | Ctrl/⌘+K: “A palette card from the selection (or the whole board)” |
| `/board-palette-style` | **new:** Board palette card right-click › Palette style |
| `/board-peek` (/board-drawer) | Ctrl/⌘+K: “The board drawer over this chat (Ctrl+Shift+M): drag a reference into the chat for its vib” |
| `/board-pinterest` | Ctrl/⌘+K: “Pinterest searches matching the board's vibe (or your words): click one, then ＋ Board on a” |
| `/board-play` | Ctrl/⌘+K: “Clips in view: play (four at most), pause, mute, sound” |
| `/board-present` | Ctrl/⌘+K: “Present: fly between the frames (→ next, ← back, Esc ends)” |
| `/board-present-auto` | Board ⋯ › Present › Advance |
| `/board-random` | Ctrl/⌘+K: “Jump to a random reference (R on the board)” |
| `/board-redo` | Ctrl/⌘+K: “Redo on the board” |
| `/board-rename` | Board ⋯ › Rename… |
| `/board-reread` | Ctrl/⌘+K: “Read the vibe of the selection again (or everything)” |
| `/board-rotate` | Board item right-click › Look › Rotate |
| `/board-save-palette` | Ctrl/⌘+K: “Save the selected palette (or the board's colors) to your palette library” |
| `/board-save-reply` | Ctrl/⌘+K: “Save the last reply of this chat as a note on the board” |
| `/board-save-template` | Ctrl/⌘+K: “Save this board's frames as a template of your own” |
| `/board-screenshot` | Ctrl/⌘+K: “Put a screenshot of Hearth (the whole window) on the board” |
| `/board-search` | Board ⋯ › Search and filter… (/) |
| `/board-select` | Board right-click › Select |
| `/board-shape` | Board ＋ Add › Shape |
| `/board-sheet` | Ctrl/⌘+K: “A contact sheet (6 frames) of the selected clip as a picture” |
| `/board-shots` | Ctrl/⌘+K: “One still per shot of the selected clip (from its cuts), in a row under it” |
| `/board-show` (/board-see) | Ctrl/⌘+K: “Show board pictures to this chat with your next message: the board, sel, a frame, items by” |
| `/board-similar` | Ctrl/⌘+K: “Select what feels like the selected item” |
| `/board-snap` | Board right-click › View › Snap to other items · Settings › Advanced › Mood board |
| `/board-snapshot` | Board website right-click › Snapshot at |
| `/board-stamp` | Board item right-click › Stamp |
| `/board-star` | Ctrl/⌘+K: “Star the board (starred boards come first)” |
| `/board-starter` | Board right-click › Add › Note starter |
| `/board-stats` | Ctrl/⌘+K: “What's on the board (kinds, clip time, vibes being read, links)” |
| `/board-sticker` | Board ＋ Add › Sticker |
| `/board-style` | Board ⋯ › Style everything |
| `/board-tag` | Board item right-click › Tags |
| `/board-template` | Board ＋ Add › Template |
| `/board-text` | Board ＋ Add › Text (T) |
| `/board-timeline` (/board-clips) | Ctrl/⌘+K: “The board's clips side by side on a timeline: their shots, pace and length (click a shot t” |
| `/board-to-lab` | Ctrl/⌘+K: “Give the Three Director the board's vibe (for a scene: colors, light, motion, texture; nev” |
| `/board-tools` | ⋯ AI setup › What it can use › Hearth's tools › Mood board |
| `/board-undo` | Ctrl/⌘+K: “Undo on the board (Ctrl+Z there)” |
| `/board-unlink` | Ctrl/⌘+K: “Unlink this chat from its board” |
| `/board-untangle` | Ctrl/⌘+K: “Push overlapping items apart (the selection, or everything)” |
| `/board-use` | Ctrl/⌘+K: “Attach the board's vibe (linked or current) to your next message; "send" sends it now” |
| `/board-version` | Ctrl/⌘+K: “Save a version of the board, list them, or go back to one” |
| `/board-view` | Board right-click › View › Views › Save this view… / Go to … |
| `/board-watch` | Ctrl/⌘+K: “Show a board clip or gif to this chat as frames with timestamps (n frames, or scenes = one” |
| `/board-zoom` | Board right-click › View › Zoom (fit, selection, 100 %…) |
| `/boards` | Ctrl/⌘+K: “List your boards (✓ = linked to this chat)” |
| `/find-images` (/images-like) | Ctrl/⌘+K: “Find images like the board's vibe (or your words) on Pinterest and more; pick the ones tha” |
| `/ref` (/at-ref) | Drag a board reference into a chat · board item right-click › Send vibe to a chat |
| `/vibe` | Ctrl/⌘+K: “Show a vibe here (free, nothing sent): the board's, the selection's, or of references matc” |

### Capture (25)

| Command | Visible way |
|---|---|
| `/annotate` | Ctrl/⌘+K: “Draw on a screenshot: arrows, boxes, text, numbered badges, blur / pixelate private bits, ” |
| `/beautify` | Ctrl/⌘+K: “Your screenshot on a gradient with padding, rounded corners, a shadow and a window bar, fo” |
| `/capture` (/cap) | Ctrl/⌘+K: “Screenshots and recordings of Hearth itself, and the frame reader: the capture menu, or on” |
| `/capture-folder` | Ctrl/⌘+K: “Where screenshots and recordings are saved (open it, or choose another folder)” |
| `/capture-help` | Ctrl/⌘+K: “Everything capture can do, with its keys and commands” |
| `/capture-last` | Ctrl/⌘+K: “Open your newest capture (screenshot or recording)” |
| `/capture-tools` | Ctrl/⌘+K: “Let this chat's AI take screenshots, record Hearth and read video frames (capture_* tools;” |
| `/captures` (/shots) | Ctrl/⌘+K: “Your screenshots and recordings (double-click opens, right-click for more, drag into a cha” |
| `/clean-ui` | Ctrl/⌘+K: “Hide toasts, menus, scrollbars and carets (for your own screenshots or screen recorders); ” |
| `/contact` (/contact-sheet-of) | Ctrl/⌘+K: “A contact sheet of any video with timecodes (15 layouts: 4x3, strip, storyboard, polaroid,” |
| `/copy-shot` | Ctrl/⌘+K: “Copy your newest screenshot to the clipboard” |
| `/crop-shot` | Capture menu › a screenshot in 9:16 / Screenshots in all four social sizes · Social crop… |
| `/cursor-fx` | Capture menu › Settings › Recording… › Cursor… / Clicks… |
| `/frame-at` | Capture menu › Read frames of a video › Exact frame at… |
| `/frame-palette` | Ctrl/⌘+K: “The main colors of a video (or of the frame at a time)” |
| `/frames` (/read-frames) | Ctrl/⌘+K: “Read frames of any video exactly: a frame at a time / frame / timecode, every N, scene cha” |
| `/keys-overlay` | Ctrl/⌘+K: “Show the keys you press at the bottom of the window (for tutorial recordings)” |
| `/make` | Capture › Your captures: right-click a recording (GIF, trim, timelapse, boomerang, PNG frames…) |
| `/motion-curve` | Ctrl/⌘+K: “Motion energy over a video as a chart (busy / calm moments, the busiest timecodes)” |
| `/pacing` | Ctrl/⌘+K: “How a video is cut: shots, average shot length, cuts per minute, in words (a reference's r” |
| `/rec` | Ctrl/⌘+K: “Record Hearth itself (the same as /record outside the Lab, anywhere)” |
| `/record-presets` | Ctrl/⌘+K: “Recording presets (Promo, Reel 9:16, Tutorial, YouTube…): pick the default, or record with” |
| `/scenes` | Ctrl/⌘+K: “Scene changes in a video: one exact frame per shot with its timecode and length” |
| `/tour` (/tours) | Ctrl/⌘+K: “Hands-free scripted recordings: open tools, run commands, type, click, zoom, captions, tit” |
| `/window-size` | **new:** Capture menu › Settings › Recording… › Window at an exact size… |

### Chat (60)

| Command | Visible way |
|---|---|
| `/access` | Ctrl/⌘+K: “What this chat may do with your files: a level, its folders, the activity log and Undo” |
| `/activity` | Ctrl/⌘+K: “What the running reply is doing: phase, last news, agents, last steps (or what the last re” |
| `/ai-undo` (/undo-ai) | Ctrl/⌘+K: “Undo what the AIs changed (Lab scenes, the board, files, settings): the last change, its l” |
| `/archive` | Ctrl/⌘+K: “Hide this chat from the list without deleting it (/filter archived shows them)” |
| `/astra-activity` | Ctrl/⌘+K: “Inspect Astra’s tool activity and file changes” |
| `/astra-branch` | Ctrl/⌘+K: “Branch Astra with its native tool history” |
| `/astra-connect` | Ctrl/⌘+K: “Find connected apps and mention them in your next message” |
| `/astra-connections` | Ctrl/⌘+K: “Inspect this Astra chat’s live tools and connection health” |
| `/astra-context` | Ctrl/⌘+K: “Inspect and compact Astra’s working context” |
| `/astra-models` | Ctrl/⌘+K: “Choose from available models and supported reasoning depths” |
| `/astra-resources` | Ctrl/⌘+K: “Preview connected resources and add them to a draft” |
| `/astra-skills` | Ctrl/⌘+K: “Choose skills for Astra’s next message” |
| `/astra-steer` | **NONE** (reported to Codex): astra-connect.js: guidance into a running Astra reply (no button while a reply runs) |
| `/astra-tools` | Ctrl/⌘+K: “Astra apps, live tools, models and follow-ups · on / off: Give an Astra (Codex) director t” |
| `/attach-lab` | Ctrl/⌘+K: “Attach the Three.js Lab preview to your next message” |
| `/attach-screen` | Ctrl/⌘+K: “Attach a screenshot of the Hearth window to your next message (both engines can see it)” |
| `/auto-title` | Ctrl/⌘+K: “Name new chats from their content after the first reply (free, no extra call)” |
| `/branch` (/fork) | Ctrl/⌘+K: “New chat from a message (default: the last), to try another direction · in the Lab: A new ” |
| `/chat-context` (/works-with) | Ctrl/⌘+K: “What this chat works with (board, scene, sequence, captures, renders) and how your words u” |
| `/decided` (/what-did-we-decide) | ◎ Missions › Remind me what we decided… |
| `/delete` (/del) | Ctrl/⌘+K: “Move this chat to Recently deleted (30 days; /undo or the toast brings it back)” |
| `/drop` | Ctrl/⌘+K: “As if you dropped these files here: attach them to this chat (a folder asks first), or wit” |
| `/duplicate` (/dup /copy-chat) | Ctrl/⌘+K: “Make a copy of this chat (the copy continues on its own)” |
| `/filter` | Chats list: ⏷ Filter (point at the list head) · right-click the chats list › Filter… |
| `/folder` (/move-to) | Chat ⋯ (right-click the header) › Organise › Tags and folder… |
| `/hearth-answer` | Shows by itself: 💡 Answered by Hearth under a question about the app |
| `/help` (/?) | Chat ⋯ (right-click the header) › View › Everything it can do… · ☰ Commands page |
| `/history` | Ctrl/⌘+K: “Your latest chats (click one to open it) · in the Lab: Time machine: every version of the ” |
| `/hooks` | Ctrl/⌘+K: “This AI's hooks (when… then…): list them, pause or resume all, try one (set them up in ⋯ A” |
| `/import` | Ctrl/⌘+K: “Import one chat from a JSON file (made with /export json) or a Markdown file” |
| `/keepgoing` (/routine) | Ctrl/⌘+K: “🔁 Keep going: this chat keeps improving its work by itself after each reply (the card, or” |
| `/mark-read` (/read-all) | Ctrl/⌘+K: “Clear every unread mark” |
| `/mark-unread` | Ctrl/⌘+K: “Mark this chat unread (a dot in the list until you open it again)” |
| `/new` (/n /new-chat) | Ctrl/⌘+K: “Start a new chat (and send the message, if you give one)” |
| `/next-chat` | Ctrl/⌘+K: “Open the next chat of this agent (older)” |
| `/next-unread` (/nu) | Ctrl/⌘+K: “Open the next chat with a reply you haven't seen” |
| `/offline` | Ctrl/⌘+K: “What waits to be sent (no internet, a busy AI, a usage limit) and when; send = try now, cl” |
| `/open` (/o /goto-chat) | The chats list (click a chat) · Ctrl/⌘+K finds a chat by its title |
| `/open-file` (/open-page) | Click a file path or link in a reply |
| `/paste-files` | Ctrl/⌘+K: “Attach the files you copied in Finder / Explorer (⌘C / Ctrl+C) to this chat, or with "lab"” |
| `/pin` | Ctrl/⌘+K: “Pin this chat to the top of the list (again: unpin)” |
| `/pins` (/pinned) | Ctrl/⌘+K: “Pinned chats, and the messages pinned in this chat” |
| `/prev-chat` | Ctrl/⌘+K: “Open the previous chat of this agent (newer)” |
| `/prompt` | Right-click the chat box › Prompt library… (click a prompt to insert it) |
| `/recent` (/chats /history) | Ctrl/⌘+K: “Your latest chats (click one to open it)” |
| `/rename` | Ctrl/⌘+K: “Rename this chat (no title: asks)” |
| `/restore` (/undelete) | Ctrl/⌘+K: “Bring back a deleted chat (no title: the list)” |
| `/route` | Ctrl/⌘+K: “Smart: which model and effort the last reply got and why; ask again thinking harder; or te” |
| `/sort` | Right-click the chats list › Sort |
| `/stats-all` (/overview) | Ctrl/⌘+K: “All your chats in numbers: per agent, this week, pinned, tagged” |
| `/subagents` | Ctrl/⌘+K: “Let this chat deploy agents for parts of a big task (Claude's Task tool / Codex agents). O” |
| `/tag` | Chat ⋯ (right-click the header) › Organise › Tags and folder… |
| `/tags` | Ctrl/⌘+K: “This chat's tags and folder, and every tag in use” |
| `/title` | Ctrl/⌘+K: “Name this chat from its content (ai: let the agent write the title, one short extra call)” |
| `/unarchive` | Ctrl/⌘+K: “Put this chat back in the list” |
| `/undo` | Ctrl/⌘+K: “Undo the last chat action (delete, rename, forget, clear draft…) · on the board: Undo on t” |
| `/unpin` | Chat ⋯ (right-click the header) › Organise › Pin to top (again unpins) · right-click a chat in the list |
| `/unread` | Ctrl/⌘+K: “Chats with replies you have not seen yet” |
| `/unstick` | Ctrl/⌘+K: “Stop the running reply and ask it to continue from where it was (what it wrote stays)” |
| `/untag` | Chat ⋯ (right-click the header) › Organise › Tags and folder… |

### Collab (31)

| Command | Visible way |
|---|---|
| `/ask-astra` | ⚇ Work with Astra (chat box) · ◎ Missions › Second opinion only |
| `/ask-claude` | ◎ Missions › Second opinion only (in Astra's chat) · message ⋯ › Reply › Second opinion |
| `/brainstorm` | ⚇ right-click › ✦ Ready-made collaborations… › Brainstorm |
| `/collab` | Ctrl/⌘+K: “Set the composer's collab mode (the ⚇ chip): your next messages go to both” |
| `/collab-again` | Ctrl/⌘+K: “Run the last collaboration again (optionally with a new task)” |
| `/collab-budget` | Ctrl/⌘+K: “Stop any collaboration once it has used this many tokens (e.g. 40k)” |
| `/collab-export` | Ctrl/⌘+K: “Copy the last collaboration (or all of this chat's) with every round as Markdown” |
| `/collab-partner` | Ctrl/⌘+K: “Who this chat collaborates with (e.g. Astra Coder instead of Astra)” |
| `/collab-persona` | **NONE** (reported to Codex): astra.js: personas for the collab seats |
| `/collab-preset` | ⚇ right-click › ✦ Ready-made collaborations… |
| `/collab-scoreboard` (/scoreboard) | Ctrl/⌘+K: “Whose answers you keep: picks and judge verdicts per agent and mode” |
| `/collab-stats` | Ctrl/⌘+K: “Token totals of every collaboration in this chat, per participant” |
| `/collab-stop` | Ctrl/⌘+K: “Stop the collaborations running in this chat” |
| `/collabs` | Ctrl/⌘+K: “List the collaborations in this chat; pick one to jump to it” |
| `/compare-agents` | ◎ Missions › Side by side |
| `/council` | Ctrl/⌘+K: “Several seats (agents and personas) answer, the chair writes the final answer” |
| `/critique` (/review-by) | Ctrl/⌘+K: “One drafts, the other reviews it, the first revises (stops early on LGTM)” |
| `/debate` | Ctrl/⌘+K: “They answer, read each other and reply for N rounds, then one merged final answer” |
| `/duo` | Ctrl/⌘+K: “Claude and Astra answer side by side; pick one or merge them” |
| `/duo-last` | Ctrl/⌘+K: “Run your last message again as a duo (both agents, side by side)” |
| `/factcheck` | ⚇ right-click › ✦ Ready-made collaborations… › Fact check |
| `/handoff` | Ctrl/⌘+K: “Continue this chat with the other agent from a short brief (--whole: send the whole chat)” |
| `/jam` | Ctrl/⌘+K: “Claude and Astra take turns making a music visual in the Lab (4 rounds; Esc stops)” |
| `/merge` | Ctrl/⌘+K: “Merge the last collaboration's answers into one (judge: claude or astra)” |
| `/opinion` (/second-opinion) | Ctrl/⌘+K: “Second opinion on the last reply from the other agent (works both ways)” |
| `/opinion-auto` | Ctrl/⌘+K: “After every reply in this chat, the other agent gives a second opinion (one lean turn per ” |
| `/pair` | ◎ Missions › Pair on code · ⚇ right-click › ✦ Ready-made collaborations… |
| `/pick` | A duo answer card: Pick this one |
| `/redo-with` | Ctrl/⌘+K: “Ask your last message again to the other agent, right here (one lean turn)” |
| `/redteam` | ⚇ right-click › ✦ Ready-made collaborations… › Red team |
| `/relay` | Ctrl/⌘+K: “One drafts, the other improves it (passes alternate)” |

### Compose (23)

| Command | Visible way |
|---|---|
| `/attach` (/file /add) | Ctrl/⌘+K: “Attach files (no path: the file picker)” |
| `/attach-board` | Ctrl/⌘+K: “Attach the board's vibe (or one reference's) to your message — never its media” |
| `/attach-capture` | Ctrl/⌘+K: “Attach a capture (a video as its contact sheet); no name: pick from the newest” |
| `/attach-costs` | Ctrl/⌘+K: “What the attachments in the chat box will cost, whole and as sent” |
| `/attach-frame` | Ctrl/⌘+K: “Attach the Lab's frame on screen as a picture” |
| `/attach-menu` | Ctrl/⌘+K: “The ＋ menu of the chat box: files, board, captures, Lab, screen, renders” |
| `/attach-region` | Ctrl/⌘+K: “Pick a region of the screen (or the window / this tool) and attach the picture” |
| `/attach-render` | Ctrl/⌘+K: “Attach a recent render (its contact sheet); no name: pick from the newest” |
| `/attach-scene` | Ctrl/⌘+K: “Attach a Lab scene as a short text (its name and layers, not its code)” |
| `/clear-draft` (/cd) | Ctrl/⌘+K: “Empty the message box and its attachments (/undo brings them back)” |
| `/draft` (/type) | developer / typed only: used by suggestion chips to put words in the chat box |
| `/drafts` (/sent /recall) | Ctrl/⌘+K: “What you sent lately: click one to put it back in the box” |
| `/enter-sends` (/enter) | Ctrl/⌘+K: “Enter sends (on, default) or makes a new line and Ctrl+Enter sends (off)” |
| `/queue` (/q /later) | Ctrl/⌘+K: “Queue a message to send when the current reply ends” |
| `/screenshot` (/shot) | Ctrl/⌘+K: “Put a picture of the window (or the Lab view) in your message · with a target, a frame or ” |
| `/send-preview` (/cost-preview) | Ctrl/⌘+K: “What a message would cost in this chat before you send it (fixed part, the chat re-read an” |
| `/send-whole` | Ctrl/⌘+K: “Send this message's attachments whole (full-size pictures, whole files) instead of trimmed” |
| `/smart-paste` | Ctrl/⌘+K: “Pasted code gets a ``` fence; huge pastes become a text file (on by default)” |
| `/snippet` (/snip) | **new:** Right-click the chat box › More… › Snippets › (insert one, save this message as one, delete one) |
| `/snippets` | **new:** Right-click the chat box › More… › Snippets › |
| `/spell` (/spellcheck) | Ctrl/⌘+K: “Spell checking in the message box” |
| `/template` (/tpl /starter) | Ctrl/⌘+K: “Fill the box from a ready-made brief or a saved prompt (no name: the list)” |
| `/wc` (/count) | Ctrl/⌘+K: “Words, characters and about how many tokens your draft is (empty box: the last reply)” |

### Data (6)

| Command | Visible way |
|---|---|
| `/backup` | Ctrl/⌘+K: “Back up Hearth now (checked), see your backups and the last one, check the newest, choose ” |
| `/backups` | Ctrl/⌘+K: “Your backups: list, restore, folder, automatic backups” |
| `/downloads` | Ctrl/⌘+K: “Files downloaded from website agents” |
| `/import-chats` | Ctrl/⌘+K: “Import past chats from claude.ai / ChatGPT (checks first, then imports)” |
| `/restore-backup` | Ctrl/⌘+K: “Restore from a backup (adds what's missing, never deletes)” |
| `/trash` | Ctrl/⌘+K: “Recently deleted chats (restore, peek, delete for good)” |

### Director (21)

| Command | Visible way |
|---|---|
| `/director` | Lab toolbar ⋯ › Director › · the dock's ✦ menu (or right-click the dock) |
| `/director-activity` | Lab toolbar ⋯ › Director › What it did lately · the dock's strip (click the calls) |
| `/director-ask` | The director dock beside the Lab (write in it) |
| `/director-autoshot` | developer / typed only: director tuning (on by default: a small picture after a visible change) |
| `/director-chips` | The dock's ✦ menu › Quick chips (show, add, remove) |
| `/director-clear` | The dock's strip › its call list › Clear |
| `/director-cost` | Lab toolbar ⋯ › Director › What it costs per message · the dock's ✦ menu |
| `/director-edits` | Lab: Time machine (Alt+H: every version of the scene) · the dock's ↶ |
| `/director-guide` | developer / typed only: shows what the Three Director reads (for checking the AI's guide) |
| `/director-mode` | developer / typed only: lean (the default) or full: a token experiment; lean stays the one good default |
| `/director-peek` | Lab toolbar ⋯ › Director › Its last picture, bigger · the dock's picture |
| `/director-setup` | Lab toolbar ⋯ › Director › Make the Three Director |
| `/director-shot-size` | developer / typed only: director tuning (the size of the director's pictures: one default) |
| `/director-stats` | Lab toolbar ⋯ › Director › What it did lately (the dock's call list: time, failures) |
| `/director-tools` | ⋯ AI setup › Spending › Where its tokens go |
| `/director-try` | developer / typed only: runs a director tool by hand for testing (no tokens) |
| `/dock-collapse` | The dock's fold button · ✦ menu › Dock › Collapse to a thin bar |
| `/dock-width` | Drag the edge of the docked chat · ✦ menu › Dock › Width |
| `/redo-edit` | The dock's ✦ menu › ↷ Redo the undone edit |
| `/task` | Ctrl/⌘+K: “What this director chat is making and how far it got (Hearth keeps it; the other engine ge” |
| `/undo-edit` | The dock's ↶ · ✦ menu › ↶ Undo the director's last edit · Lab toolbar ⋯ › Director › |

### Export (2)

| Command | Visible way |
|---|---|
| `/export` (/save-chat) | Ctrl/⌘+K: “Export this chat (default: Markdown to a file)” |
| `/note` (/to-notes) | Ctrl/⌘+K: “Save text, the last reply or a message to your Notes” |

### Flows (8)

| Command | Visible way |
|---|---|
| `/flow` | ☰ Commands page › Step lists (flows) › ▶ Start |
| `/flow-edit` | Ctrl/⌘+K: “Edit a flow as nodes (a copy of a built-in one; yours in place) and save it as yours” |
| `/flow-make` | Flows ⋯ › Ask Claude to make a flow… |
| `/flow-status` | Ctrl/⌘+K: “Where the flows of this chat are (one line each; chats and directors can run it)” |
| `/flow-step` | A flow's live card in the chat: its answer buttons, ↻ Pick up here, ↻ Again, ✎ Refine |
| `/flow-where` (/where-is) | developer / typed only: says where a command went (☰ Commands page shows it) |
| `/flows` (/journeys) | Ctrl/⌘+K: “Flows: step lists you walk through (Doctor, Make a video, Record, Lab scene…) on the Comma” |
| `/principal` | Ctrl/⌘+K: “The commands the "/" menu shows (the rest live in flows and still run by name)” |

### Forge (27)

| Command | Visible way |
|---|---|
| `/forge` | Ctrl/⌘+K: “Open the Forgeheart workspace (dashboard, builds, docs, tasks, devlog…)” |
| `/forge-boss` | Ctrl/⌘+K: “Debug game: spawn the boss” |
| `/forge-chat` | Ctrl/⌘+K: “New Forgeheart chat with the project brief” |
| `/forge-devlog` (/devlog) | Ctrl/⌘+K: “Devlog work timer” |
| `/forge-eval` | Forge Debug ⋯ › Run code… |
| `/forge-god` | Ctrl/⌘+K: “Debug game: invulnerable” |
| `/forge-gold` | Forge Debug ⋯ › 💰 Gold +1M |
| `/forge-heal` | Ctrl/⌘+K: “Debug game: heal to full” |
| `/forge-kill` | Ctrl/⌘+K: “Debug game: kill every enemy” |
| `/forge-next` | Ctrl/⌘+K: “Debug game: go to the next stage” |
| `/forge-oneshot` | Ctrl/⌘+K: “Debug game: enemies die in one hit” |
| `/forge-patch` | Forge Debug ⋯ › Patch sets… / Game patches (Apply now) |
| `/forge-patches` | Ctrl/⌘+K: “The saved debug-game patches” |
| `/forge-pause` | Ctrl/⌘+K: “Debug game: pause / resume” |
| `/forge-reload` | Ctrl/⌘+K: “Reload the debug game (patches re-apply)” |
| `/forge-restore` | Ctrl/⌘+K: “Restore a debug game snapshot (newest if no name)” |
| `/forge-set` | Ctrl/⌘+K: “Patch sets: save the enabled patches as a set, or switch sets” |
| `/forge-shot` | Ctrl/⌘+K: “Screenshot of the debug game into this chat's attachments” |
| `/forge-snap` | Ctrl/⌘+K: “Snapshot the debug game (its whole save) to come back to later” |
| `/forge-snaps` | Ctrl/⌘+K: “Debug game snapshots” |
| `/forge-spawn` | Ctrl/⌘+K: “Spawn enemies in the debug game” |
| `/forge-speed` | Forge Debug: Simulation speed buttons |
| `/forge-stage` | Forge Debug ⋯ › Go to stage… / ⏭ Next stage |
| `/forge-start` | Ctrl/⌘+K: “Debug game: start the game from the title screen” |
| `/forge-status` | Ctrl/⌘+K: “Live debug game: stage, gold, HP, enemies, gear” |
| `/forge-task` (/ftask) | Forge › Forgeheart tasks |
| `/forge-watch` | Ctrl/⌘+K: “Stat watch overlay on the game (add an expression to watch)” |

### Hearth (1)

| Command | Visible way |
|---|---|
| `/check-computer` (/setup-computer) | Ctrl/⌘+K: “Is this computer ready? Claude, Codex, ffmpeg, sync, folders, permissions, updates: one li” |

### Kit (11)

| Command | Visible way |
|---|---|
| `/aspect` | Kit › frame sizes & safe zones |
| `/color` (/colour) | Ctrl/⌘+K: “A color in every format (hex, three.js, GLSL, AE…)” |
| `/contrast` | Kit › color, palette, harmony, contrast, gradient |
| `/easing` | Ctrl/⌘+K: “An easing curve as CSS, GSAP, JS, GLSL and AE (or open the editor)” |
| `/gradient` | Kit › color, palette, harmony, contrast, gradient |
| `/harmony` | Kit › color, palette, harmony, contrast, gradient |
| `/kit` | Ctrl/⌘+K: “Open the Kit: color, palette, harmony, contrast, gradient, easing, BPM, frames, timecode” |
| `/kit-bpm` | Kit › BPM ↔ ms calculator |
| `/kit-palette` | Ctrl/⌘+K: “Make a palette: from a picture, the clipboard, the Lab frame or hex codes” |
| `/save-palette` | Kit › 🎨 Save to Lab palettes… / 🎨 To Lab |
| `/tc` (/timecode) | Kit › timecode calculator |

### Lab (2)

| Command | Visible way |
|---|---|
| `/lab-export` (/lx) | Ctrl/⌘+K: “Best-quality Lab output in a hidden page (the Lab stays usable): any size up to 8K, any fp” |
| `/recover-scenes` | Ctrl/⌘+K: “Find Lab scenes that aren't in your list (automatic copies, History, sync, backups) and br” |

### Look (17)

| Command | Visible way |
|---|---|
| `/accent` | Settings › Look & size › More looks and tweaks (accent) |
| `/appearance` (/appear /ui-look) | Ctrl/⌘+K: “Open the Appearance picker (presets, textures, glow, motion…)” |
| `/chatfont` | Ctrl/⌘+K: “Chat text in Oxanium (game) or a clean system font” |
| `/classic` | Ctrl/⌘+K: “Forgeheart Classic (the original look); /classic off → Forgeheart” |
| `/corners` | Ctrl/⌘+K: “Corner style: forge cut, rounded or square” |
| `/density` | Ctrl/⌘+K: “Spacing and text size” |
| `/glow` | Settings › Look & size › More looks and tweaks (glow) |
| `/lightdark` (/followos) | Ctrl/⌘+K: “The look follows your computer's light / dark mode (auto) or stays as it is (off)” |
| `/look` (/looks) | Ctrl/⌘+K: “Open the Appearance picker (presets, textures, glow, motion…) · in the Lab: Switch to a sa” |
| `/motion` | Ctrl/⌘+K: “Animation: full, calm (no ambient loops) or off” |
| `/sparkles` (/juice) | Ctrl/⌘+K: “Click sparks, glints and embers on or off” |
| `/texture` (/textures) | Ctrl/⌘+K: “Brushed metal, grain and glass on or off” |
| `/theme` (/skin) | Settings › Look & size (the looks) · More looks and tweaks › Every look |
| `/themes` | Ctrl/⌘+K: “List every look preset (▸ = current)” |
| `/tidy` | Ctrl/⌘+K: “What the board and its drawer tuck behind Alt or show where you point (pin any back: right” |
| `/tips` (/tooltips) | Ctrl/⌘+K: “Forged tooltips instead of the system ones” |
| `/ui-size` (/app-size) | Settings › Look & size › Size of everything |

### Memory (11)

| Command | Visible way |
|---|---|
| `/forget` | Rail right-click › Panels › 🧠 Memory (Forget on a fact) · ⋯ AI setup › Memory |
| `/memory` (/mem /memories) | Ctrl/⌘+K: “What this agent remembers about you (edit: the memory editor) · here, pin, project…: This ” |
| `/memory-cost` (/memcost) | Ctrl/⌘+K: “How many tokens memory adds to every message, per agent” |
| `/memory-expire` | Rail right-click › Panels › 🧠 Memory: a fact's expiry (Never, tomorrow, a week, a date…) |
| `/memory-export` | Ctrl/⌘+K: “Export memory (with categories, pins, expiry) to a file” |
| `/memory-import` | Ctrl/⌘+K: “Import memory from an export or a text list (merges)” |
| `/memory-list` | Ctrl/⌘+K: “List what your agents remember” |
| `/memory-pin` | Rail right-click › Panels › 🧠 Memory: 📍 Pin on a fact |
| `/remember` | Rail right-click › Panels › 🧠 Memory: Add a fact · or just tell the AI "remember that…" |
| `/remember-all` (/remember-shared) | Rail right-click › Panels › 🧠 Memory: Add a fact for All agents (shared) |
| `/tidy-memory` (/memory-tidy) | Ctrl/⌘+K: “Tidy memory: merge facts said twice, update old ones, shorten, keep Lab facts for the Lab ” |

### Messages (57)

| Command | Visible way |
|---|---|
| `/again` | Ctrl/⌘+K: “Write the last reply again (optionally with another model) · after a command or a click: R” |
| `/alternatives` | Ctrl/⌘+K: “Ask for alternatives” |
| `/answers` (/answer-length) | Ctrl/⌘+K: “How long this AI's answers are (also in ⋯ AI setup → How hard it thinks): short saves outp” |
| `/as-table` | Ctrl/⌘+K: “Turn the last reply into a table” |
| `/bookmark` (/bm) | Ctrl/⌘+K: “Bookmark a message (default: the last reply); /bookmarks lists them across chats” |
| `/bookmarks` (/bms) | Ctrl/⌘+K: “Your bookmarked messages in every chat” |
| `/bottom` (/latest) | Scroll down · the ↓ button over a chat that isn't at its end |
| `/bullets` | Ctrl/⌘+K: “Turn the last reply into bullets” |
| `/check` | Ctrl/⌘+K: “Ask it to double-check the last reply” |
| `/code` (/snippets-in-chat) | Ctrl/⌘+K: “List the code blocks in this chat, or act on one” |
| `/code-nodes` | Ctrl/⌘+K: “Open a code block of this chat as a flow of nodes (1 = the last one, 2 = the one before…)” |
| `/code-nodes-file` | **new:** Right-click the chat box › More… › Open a code file as nodes… |
| `/code-nodes-paste` | Ctrl/⌘+K: “Open the code on your clipboard as a flow of nodes” |
| `/code-outline` | Ctrl/⌘+K: “A code block of this chat as a text outline: functions, classes and what calls what” |
| `/compact` | Ctrl/⌘+K: “Compact the context into a summary (the chat keeps every message; later messages cost less” |
| `/continue` (/go-on /more) | Ctrl/⌘+K: “Ask it to continue where the reply stopped” |
| `/copy` (/cp) | Ctrl/⌘+K: “Copy the last reply, its code, a message, or the whole chat” |
| `/deeper` | Ctrl/⌘+K: “Ask for more detail” |
| `/edit` | Ctrl/⌘+K: “Edit one of your messages and resend it (default: your last)” |
| `/examples` | Ctrl/⌘+K: “Ask for concrete examples” |
| `/feedback` (/reactions) | Ctrl/⌘+K: “Your reactions and feedback notes in this chat” |
| `/files` (/attachments) | Ctrl/⌘+K: “Files and pictures attached in this chat” |
| `/find` (/f) | Ctrl/⌘+K: “Find in this chat: every match highlighted, Enter for the next” |
| `/fold` | Ctrl/⌘+K: “Fold long replies (all, or one)” |
| `/fold-code` | Ctrl/⌘+K: “Fold every long code block in this chat” |
| `/fresh` (/continue-fresh) | Ctrl/⌘+K: “Fresh start: a new chat that carries only a summary (goal, decisions, open tasks, key file” |
| `/history-lean` (/lighter-history) | Ctrl/⌘+K: “After a break, a long chat goes on with a lighter history (tool results and pictures not s” |
| `/jump` (/j /goto) | Scroll · message ⋯ › Copy & save › Copy a way back here · Ctrl/⌘+K finds a message by its words |
| `/lighter` (/continue-lighter) | Ctrl/⌘+K: “Continue this chat lighter: a short summary + the last exchanges replace the history for t” |
| `/links` | Ctrl/⌘+K: “Every link in this chat” |
| `/media` | Ctrl/⌘+K: “Pictures and videos a reply made show big in the chat (on) or as small cards (off)” |
| `/next` | Ctrl/⌘+K: “Ask for next steps” |
| `/open-last` | Ctrl/⌘+K: “Open the newest thing this chat made (a render, a capture, a scene…)” |
| `/opinion-chat` (/2nd) | Ctrl/⌘+K: “Astra judges the last reply (with a screenshot for docked tools)” |
| `/pin-msg` (/pinmsg /pin-message) | Ctrl/⌘+K: “Pin a message (default: the last reply); pinned ones show in a strip on top” |
| `/pros-cons` | Ctrl/⌘+K: “Ask for pros and cons” |
| `/quote` (/reply) | Ctrl/⌘+K: “Quote a message in your next one (default: the last reply)” |
| `/raw` (/source) | Ctrl/⌘+K: “Show a reply's Markdown source in place (again: formatted)” |
| `/react` (/feedback-on) | Message ⋯ › Mark › React |
| `/read` (/speak /say-it) | Ctrl/⌘+K: “Read a reply aloud with the system voice” |
| `/repeat` (/resend) | Ctrl/⌘+K: “Send your last message again (as a new message) · with a count, a /command, or in the comm” |
| `/retry` (/regenerate /again) | Ctrl/⌘+K: “Write the last reply again (optionally with another model)” |
| `/review` (/self-check) | Ctrl/⌘+K: “Ask it to check its own last result critically and fix what's wrong” |
| `/search` (/grep /search-all) | Ctrl/⌘+K: type words said in a chat (In a chat rows) |
| `/shorter` | Ctrl/⌘+K: “Ask for a shorter version of the last reply” |
| `/simpler` | Ctrl/⌘+K: “Ask for a simpler explanation” |
| `/stats` | Ctrl/⌘+K: “Messages, words, tokens and time in this chat” |
| `/steps` | Ctrl/⌘+K: “Turn the last reply into steps” |
| `/summarize` (/summary /sum) | Ctrl/⌘+K: “Ask for a compact summary of this chat so far” |
| `/things` (/made) | Ctrl/⌘+K: “What this chat made: captures, frames, renders, board items, scenes, sequences (click to o” |
| `/thinking` (/thoughts /think) | Ctrl/⌘+K: “Open or close every “Thought process” block; always: keep them open” |
| `/tldr` | Ctrl/⌘+K: “One-sentence version of the last reply” |
| `/top` | Chat ⋯ (right-click the header) › View › Jump to the first message |
| `/unfold` (/expand) | Ctrl/⌘+K: “Show long replies in full (all, or one)” |
| `/unfold-code` | Ctrl/⌘+K: “Show every code block in full” |
| `/unmark` | Ctrl/⌘+K: “Clear pins, bookmarks and reactions from a message (or all)” |
| `/why` | Ctrl/⌘+K: “Ask why” |

### Meter (56)

| Command | Visible way |
|---|---|
| `/alerts` | Ctrl/⌘+K: “Budget notifications on or off” |
| `/areas` | Ctrl/⌘+K: “Clicks per app area” |
| `/badges` | Ctrl/⌘+K: “How the token line under each reply looks” |
| `/budget` | Ctrl/⌘+K: “Set a daily token budget for an agent (e.g. /budget Claude 300k)” |
| `/budget-left` (/left) | Ctrl/⌘+K: “Tokens left today in each budget” |
| `/budget-warn` | Usage › Budgets & alerts (warning at %) |
| `/budgets` | Ctrl/⌘+K: “Every daily token budget and how much is used today” |
| `/by-agent` (/agents-usage) | Ctrl/⌘+K: “Tokens per agent” |
| `/by-tool` (/tools-usage) | Ctrl/⌘+K: “Tokens per tool (docked directors, chat, second opinions)” |
| `/cache` | Ctrl/⌘+K: “Prompt-cache hit ratio” |
| `/calibration` | Ctrl/⌘+K: “How live estimates turn characters into tokens (learned per engine)” |
| `/chat-tokens` | Ctrl/⌘+K: “This chat's token totals” |
| `/clicks` | Ctrl/⌘+K: “Feature clicks today (the meter's usability total)” |
| `/cold` | Ctrl/⌘+K: “Features you used before but not lately (default 21 days)” |
| `/compare` | Ctrl/⌘+K: “Today vs yesterday, this week vs last week” |
| `/context` (/ctx) | Ctrl/⌘+K: “ · what it is made of: What the last message sent (system prompt, tools, history, attachme” |
| `/cost-coach` (/coach) | Ctrl/⌘+K: “Where your tokens went in the last 7 days (by AI, kind of chat, cause) and the 3 changes t” |
| `/cost-free` (/free /api-value) | Ctrl/⌘+K: “What your replies would have cost at API prices (you pay $0 extra)” |
| `/daily` | Ctrl/⌘+K: “Tokens per day for the last N days (default 14)” |
| `/estimate` (/count-tokens) | Ctrl/⌘+K: “Estimate the tokens of some text (or of your draft)” |
| `/export-usage` (/tokens-export) | Ctrl/⌘+K: “Save your token history as CSV / JSON, or copy a Markdown table” |
| `/feature` | Usage › More ▾ › Features |
| `/features` (/your-usage) | Ctrl/⌘+K: “Open "Your usage": every feature, used and never used” |
| `/forecast` | Ctrl/⌘+K: “Where this month is heading at the current pace” |
| `/hidden` | Ctrl/⌘+K: “List the controls you hid” |
| `/hide-feature` | Right-click a button › Customise this… › Hide it everywhere · Usage › Features › Hide |
| `/hot` | Ctrl/⌘+K: “Your hot features (highlighted in the app)” |
| `/hourly` | Ctrl/⌘+K: “Today by hour as a sparkline” |
| `/last-reply` (/msg-tokens) | Ctrl/⌘+K: “Token breakdown of the last reply in this chat” |
| `/lifetime` (/all-time) | Ctrl/⌘+K: “All-time token totals” |
| `/long-warn` (/context-warn) | Usage › Budgets & alerts (long-context warning) · token pill right-click |
| `/meter` | Ctrl/⌘+K: “Show the meter as a strip, a rail pill or hide it; choose its fields” |
| `/meter-field` | Token pill right-click › Meter: choose fields |
| `/models` | Ctrl/⌘+K: “Tokens per model” |
| `/panel-totals` | Ctrl/⌘+K: “Show tokens per chat in the chats panel” |
| `/peak` | Ctrl/⌘+K: “Your busiest day and hour” |
| `/replies` | Ctrl/⌘+K: “Reply count, average tokens and tool calls per reply” |
| `/session` | Ctrl/⌘+K: “Tokens since Hearth started” |
| `/show-feature` (/unhide) | Customise this… › Bring back hidden buttons · Usage › Features › Show |
| `/speed` | Ctrl/⌘+K: “Average reply time and output tokens per second” |
| `/spending` | Ctrl/⌘+K: “This week's use per AI and its weekly limit; the week at a glance with fixes; set this AI'” |
| `/split` (/claude-vs-astra) | Ctrl/⌘+K: “Claude vs Astra token split” |
| `/stats-month` (/month) | Ctrl/⌘+K: “Last 30 days of tokens with a sparkline” |
| `/stats-today` (/today) | Ctrl/⌘+K: “Today: tokens, Claude vs Astra, by hour, feature clicks” |
| `/stats-week` (/week) | Ctrl/⌘+K: “Last 7 days of tokens with a sparkline” |
| `/streak` | Ctrl/⌘+K: “Days in a row you used Hearth” |
| `/streaming` (/live-tokens) | Ctrl/⌘+K: “Replies streaming right now with their estimated tokens” |
| `/token-audit` (/where-tokens-go) | Ctrl/⌘+K: “Where this AI's fixed tokens go with each message: its instructions and tools, how often e” |
| `/tokens` (/tok) | Ctrl/⌘+K: “” |
| `/top-chats` (/expensive) | Ctrl/⌘+K: “The chats that used the most tokens” |
| `/top-features` (/most-used) | Ctrl/⌘+K: “Your most used features (clicks, shortcuts, commands)” |
| `/unused` (/never-used) | Ctrl/⌘+K: “Controls you have seen but never used (hide them with /hide-feature)” |
| `/usage` (/dashboard /token-usage) | Ctrl/⌘+K: “Open the token & usage dashboard (overview, agents, models, tools, chats, features, budget” |
| `/usage-left` (/limits) | Ctrl/⌘+K: “How much of each AI's plan is left (session and week), when it resets, and when you'd run ” |
| `/usage-rebuild` | Ctrl/⌘+K: “Recount the token stats from every chat's recorded replies” |
| `/weekdays` | Ctrl/⌘+K: “Your average tokens per weekday” |

### Nodes (19)

| Command | Visible way |
|---|---|
| `/nodes` | Ctrl/⌘+K: “Show the selected Lab layer as nodes (/nodes code: back to the code)” |
| `/nodes-add` | Node editor: ＋ add a node (or right-click the canvas) |
| `/nodes-director` | Ctrl/⌘+K: “Three.js directors build in node graphs (on by default, ≈ 75 tokens per message); off: cod” |
| `/nodes-frame` | Node editor: select nodes, right-click › Frame |
| `/nodes-from-code` | Ctrl/⌘+K: “Outline of the selected layer's code as nodes (read-only)” |
| `/nodes-json` | Ctrl/⌘+K: “The graph as compact JSON” |
| `/nodes-layer` | Lab ✦ More › New layer from a node preset… |
| `/nodes-layout` | Ctrl/⌘+K: “Tidy the graph into columns (inputs → output)” |
| `/nodes-link` | Node editor: drag from an output dot to an input dot |
| `/nodes-list` | Ctrl/⌘+K: “The selected layer's graph: nodes, changed values and wires” |
| `/nodes-new` | Lab: Node presets… (Lab ✦ More, Ctrl/⌘+K) |
| `/nodes-preset` | Lab: Node presets… on the selected layer |
| `/nodes-presets` | Ctrl/⌘+K: “List the node presets for music visuals” |
| `/nodes-rebuild` | Ctrl/⌘+K: “Write the code from the nodes again (after code edits outside them)” |
| `/nodes-rm` | Node editor: select a node, Delete (or its right-click) |
| `/nodes-set` | Node editor: click a node, change its fields |
| `/nodes-types` | Ctrl/⌘+K: “List the node types (with a filter: their inputs and outputs)” |
| `/nodes-undo` | Ctrl/⌘+K: “Undo the last node edit” |
| `/nodes-unlink` | Node editor: drag a wire off its input |

### Notes (13)

| Command | Visible way |
|---|---|
| `/daily-note` (/today-note /dn) | Ctrl/⌘+K: “Open today's daily note (made from the Daily template)” |
| `/inbox` | Ctrl/⌘+K: “Quick capture into your Inbox note (no text: open Notes)” |
| `/note-chat` | Ctrl/⌘+K: “Save this whole chat as a new note (Markdown)” |
| `/note-export` | Ctrl/⌘+K: “Export every note to one Markdown file” |
| `/note-find` | Notes (Ctrl/⌘+J): the search box |
| `/note-import` | Ctrl/⌘+K: “Import Markdown / text files as notes” |
| `/note-link` | Ctrl/⌘+K: “Link this chat to a note (shown under the note; click to come back)” |
| `/note-new` | Ctrl/⌘+K: “New note from a template (daily, idea, track, shots, bug, devlog, meeting…)” |
| `/note-pin` | Ctrl/⌘+K: “Pin a note to the front (or unpin)” |
| `/note-reply` | Ctrl/⌘+K: “Save the last reply in this chat to your notes” |
| `/note-send` | Ctrl/⌘+K: “Put a note into this chat's message box” |
| `/notes-find` | Ctrl/⌘+K: “Open Notes, filtered” |
| `/todo` | Notes (Ctrl/⌘+J): the Inbox note |

### Projects (4)

| Command | Visible way |
|---|---|
| `/everything` | ⌂ Home: search · Ctrl/⌘+K › Search everything… |
| `/home` | Ctrl/⌘+K: “Home: your projects as cards, continue where you left off, search everything (/home <proje” |
| `/project` | Ctrl/⌘+K: “Projects: a home for a piece of work (its chats, Lab scenes, boards, renders, files). new ” |
| `/projects` | Ctrl/⌘+K: “Every project (Home shows them as cards with covers)” |

### Prompts (9)

| Command | Visible way |
|---|---|
| `/library` | Ctrl/⌘+K: “Open the prompt library (170 presets + yours), searched or on a category” |
| `/prompt-export` | Ctrl/⌘+K: “Export your prompts to a JSON file (all = presets too)” |
| `/prompt-fav` | Prompt library: ☆ on a prompt |
| `/prompt-import` | Ctrl/⌘+K: “Import prompts from JSON, Markdown or text files (duplicates skipped)” |
| `/prompt-list` | Ctrl/⌘+K: “List prompts in the chat (by category or search)” |
| `/prompt-new` | Ctrl/⌘+K: “Write a new prompt (blanks: {{topic}}, {{tone=friendly}}, {{tone\\|a,b,c}})” |
| `/prompt-random` | Ctrl/⌘+K: “A random prompt from a category, ready to fill in” |
| `/prompt-save-last` (/save-prompt) | Ctrl/⌘+K: “Save the last message you sent in this chat as a prompt” |
| `/prompt-show` | Prompt library: click a prompt |

### Publish (2)

| Command | Visible way |
|---|---|
| `/deploy` (/publish) | Ctrl/⌘+K: “Publish a Lab scene, a video or a site on Vercel, Netlify, Cloudflare Pages or GitHub Page” |
| `/deploy-tools` | Ctrl/⌘+K: “Let this agent publish for you (deploy_do: it builds and previews by itself, and asks you ” |

### Shader nodes (16)

| Command | Visible way |
|---|---|
| `/shader-nodes` | Ctrl/⌘+K: “Open the shader node editor (GLSL as nodes, live preview)” |
| `/shader-nodes-add` | Shader node editor: ＋ add a node |
| `/shader-nodes-apply` | Ctrl/⌘+K: “Write the shader to its target (playground or Lab layer)” |
| `/shader-nodes-bypass` | Shader node editor: a node's bypass toggle |
| `/shader-nodes-code` | Ctrl/⌘+K: “The GLSL (or Lab code) the shader graph makes, in the chat” |
| `/shader-nodes-layout` | Ctrl/⌘+K: “Tidy the shader graph into columns” |
| `/shader-nodes-link` | Shader node editor: drag a wire |
| `/shader-nodes-list` | Ctrl/⌘+K: “The open shader graph: nodes, changed values, wires” |
| `/shader-nodes-new` | Shader nodes: presets… (Lab ◇ Shader workbench) |
| `/shader-nodes-presets` | Ctrl/⌘+K: “List the shader presets” |
| `/shader-nodes-rm` | Shader node editor: select a node, Delete |
| `/shader-nodes-set` | Shader node editor: click a node, change its fields |
| `/shader-nodes-to` | Ctrl/⌘+K: “Send the shader graph to the playground, a new Lab filter layer / layer / sketch, or copy ” |
| `/shader-nodes-types` | Ctrl/⌘+K: “List the shader node types (with a filter: inputs and outputs)” |
| `/shader-nodes-undo` | Ctrl/⌘+K: “Undo the last shader node edit” |
| `/shader-nodes-unlink` | Shader node editor: drag a wire off its input |

### Studio (2)

| Command | Visible way |
|---|---|
| `/studio` (/recipes) | Ctrl/⌘+K: “One-click creative pipelines (Board → video, Song → visualizer, Idea → 3D hero, Scene → we” |
| `/studio-do` | developer / typed only: one step of a Studio run: the run calls it |

### Style (5)

| Command | Visible way |
|---|---|
| `/lang` (/language /translate-replies) | Just ask the AI ("reply in French") · ⋯ AI setup › Instructions keeps it for every message |
| `/persona` (/role /act-as) | Ctrl/⌘+K: “Have it answer as a role (sent once with your next message)” |
| `/style` | Ctrl/⌘+K: “Your own standing instruction for this chat (sent once with your next message)” |
| `/tone` | Ctrl/⌘+K: “Answer in this tone from now on (sent once with your next message)” |
| `/translate` | Just ask the AI ("translate that into Spanish") |

### Sync (1)

| Command | Visible way |
|---|---|
| `/this-computer` (/computers) | Ctrl/⌘+K: “Which computer this is (Mac / Windows PC) and what needs a click here: folders your AIs us” |

### Three.js Lab (207)

| Command | Visible way |
|---|---|
| `/3d` | Lab ✦ More › 3D model library / Add a 3D model file… (Ctrl/⌘+K "3D model") |
| `/add-scene` | Ctrl/⌘+K: “Put a scene (this one, or another sketch / chat scene) on the Lab sequence” |
| `/all-formats` | Ctrl/⌘+K: “The Lab scene (or sequence) exported to several shapes in one go, each reframed so the sub” |
| `/analyze` (/analyse /song-analysis) | Ctrl/⌘+K: “What the app found in the song: tempo, bar 1, sections (with how sure), drops, hits, the s” |
| `/animate` | Ctrl/⌘+K: “One-click keyframes for the selected layer (bounce in, heartbeat, punch zoom…)” |
| `/arrange` | Ctrl/⌘+K: “Make a Lab sequence from your scenes on the song: cuts on bars, sections set the pace, tra” |
| `/audio` (/hear /audio-now) | Ctrl/⌘+K: “What the Lab hears now: hits (kick / snare / hats / vocals), the 8 bands, loudness, bright” |
| `/audio-in` | Ctrl/⌘+K: “Live input: list the inputs, pick one (a mic, an audio interface, a loopback device for th” |
| `/auto-preset` | Ctrl/⌘+K: “Pick the trigger preset from the song's style and tempo (shows why)” |
| `/autobars` (/auto-bars) | Ctrl/⌘+K: “Fit the trigger bars to the sound playing now” |
| `/autopolish` | Ctrl/⌘+K: “Make the Lab scene look finished, locally (no tokens): measures exposure, blacks / whites,” |
| `/back` | Ctrl/⌘+K: “Back to before the director's last n turns on this scene (undoable)” |
| `/batch` (/make-batch) | Ctrl/⌘+K: “Make a batch (no tokens): one of My templates (or the scene on screen) → one video per row” |
| `/beat-grid` | Lab timeline ⋯ › the grid's look (lines, numbers, sections, drops, tall…) |
| `/before-after` | Ctrl/⌘+K: “Compare the Lab scene with how it was before the last change to its look (no tokens): a sp” |
| `/blackout` | Ctrl/⌘+K: “Fade the picture to black and back (B while presenting)” |
| `/blend` | Ctrl/⌘+K: “Blend preset for the selected layer (glow, screen, multiply, hue only…)” |
| `/bpm` (/tempo) | Lab timeline: the tempo field and Tap |
| `/brand-look` | Ctrl/⌘+K: “Forgeheart brand looks: animated backdrops (gradient, molten, aurora…) and overlays (grain” |
| `/camera-move` (/cam-move) | Lab ✦ More › 🎥 Camera moves |
| `/camera-moves` (/lab-camera) | Lab ✦ More › 🎥 Camera moves · Shot list (camera moves) |
| `/clear-markers` | Lab timeline: right-click a marker lane › Clear the kicks / snares / hits |
| `/click-track` (/metronome) | Ctrl/⌘+K: “A soft click on every beat while the song plays (to check the grid by ear)” |
| `/clip-speed` | Lab footage: the frames chip › This part › Speed |
| `/comp` (/precomp) | Ctrl/⌘+K: “Comp: other scenes (other chats') as layers of this scene, live (no args: what's in it; Al” |
| `/console` | Ctrl/⌘+K: “The Lab console: show, hide, clear, copy (nothing: toggle and print the last lines)” |
| `/contact-sheet` | Ctrl/⌘+K: “A contact sheet of the whole piece” |
| `/copy-sliders` | Ctrl/⌘+K: “Copy every slider value (paste them into another layer or sketch)” |
| `/crew` | Ctrl/⌘+K: “Deploy a crew: 2–6 helpers explore variations of this chat's scene in parallel (cost shown” |
| `/cue` (/section) | Ctrl/⌘+K: “A cue (named spot) at the playhead: Drop, Verse… (1–9 jump to them); next / prev jump betw” |
| `/cues` | Ctrl/⌘+K: “List the song's cues” |
| `/cursor-path` | Ctrl/⌘+K: “A cursor that glides along a path and clicks (points in 0..1 of the frame; no path: a tour” |
| `/cut-bars` | Ctrl/⌘+K: “Cut the footage on every bar (or beat / 2 bars) of its own sound” |
| `/cut-clear` | Ctrl/⌘+K: “The whole footage plays again (the cut goes; Ctrl+Z brings it back)” |
| `/cut-delete` | Ctrl/⌘+K: “Remove the footage part under the playhead (the sketch skips it)” |
| `/cut-here` (/footage-cut) | Ctrl/⌘+K: “Cut the Lab's footage at the playhead or a frame (S): the sketch plays the parts” |
| `/cut-keep` | Ctrl/⌘+K: “Keep only a range of the footage (the loop by default): everything else is skipped” |
| `/cut-loop` (/save-loop) | Ctrl/⌘+K: “Save the Lab's loop (or trim) of the song / video as a new file next to it (ffmpeg)” |
| `/cut-markers` | Ctrl/⌘+K: “Cut the Lab's footage at every kick, snare or hit marker (yours, the triggers' or pace hit” |
| `/cut-range` | Ctrl/⌘+K: “Remove a range of the footage (the loop by default)” |
| `/cut-restore` | Ctrl/⌘+K: “Put the removed part of the footage under the playhead (or a frame) back (Shift+Delete)” |
| `/cut-scenes` (/cut-shots) | Ctrl/⌘+K: “Cut the footage at every shot change (found exactly by the frame reader)” |
| `/describe` | Ctrl/⌘+K: “Describe it: a scene from your words with 0 tokens (matched on this computer: gallery, lib” |
| `/dispatch` | Ctrl/⌘+K › Lab: Dispatch parts to other chats (comp)… · right-click the picture › Comp |
| `/downbeat` (/bar-one) | Ctrl/⌘+K: “Bar 1: auto (as detected), here (at the playhead) or a time” |
| `/drops` | Ctrl/⌘+K: “The drops the analysis found; jump to the next (or the Nth)” |
| `/ease` | Ctrl/⌘+K: “Make every keyframe of the selected layer use an ease (bounce, elastic, expo out…)” |
| `/edit-points` | Ctrl/⌘+K: “The footage's edit points as timecodes: cuts, cues, loop edges (↑ / ↓ jump between them)” |
| `/edit-scene` | Ctrl/⌘+K: “Scene editor: move objects around in 3D (again to leave)” |
| `/end-card` (/endcard) | Ctrl/⌘+K: “An end card: the name, a line and a call to action (Try Hearth, Follow for more, Link in b” |
| `/exaggerate` | Ctrl/⌘+K: “Push every change further from the code (×1.5, or the factor you give)” |
| `/fav-slider` | Right-click a slider › ★ Add to Favorites |
| `/fill-markers` | Lab timeline: right-click a marker lane › Fill (kick on every beat, on 1 and 3, snare on 2 and 4…) |
| `/find-slider` | Sliders: the search box at the top |
| `/fit` | Ctrl/⌘+K: “Fit the picture to the preview (no exact size)” |
| `/fix-errors` | Ctrl/⌘+K: “Put the console's errors in the Three Director's chat box, asking it to fix them” |
| `/fix-scene` (/scene-doctor) | Ctrl/⌘+K: “Check the Lab scene here (no tokens): errors, a blank / too dark / blown-out frame, the su” |
| `/follow-music` | Right-click a slider › ♪ Follow the music / move by itself… |
| `/footage` (/frames-lab) | Ctrl/⌘+K: “The Lab's video footage, frame by frame: status, step / go to frames, cut (the sketch play” |
| `/footage-back` | Lab footage: the frames chip › Sequence › Take the cut back from… |
| `/footage-scenes` (/shot-cues) | Ctrl/⌘+K: “A cue at every shot of the footage (exact frames)” |
| `/footage-sequence` | Ctrl/⌘+K: “Copy the Lab footage's cut (and its cues as markers) into a new Lab sequence” |
| `/fps` | Lab toolbar: Preview fps |
| `/frame-check` | Ctrl/⌘+K: “Which footage frame the sketch's video shows (requestVideoFrameCallback)” |
| `/frame-display` (/time-display) | Lab footage: right-click the time › Time shows |
| `/frame-read` (/read-frame) | Ctrl/⌘+K: “The exact frame of the footage at the playhead as a picture (add "chat" to attach it here)” |
| `/frame-step` | Lab footage: the frames chip › Step (one frame, 10 frames, a second…) · ← / → |
| `/frame-to-director` | Ctrl/⌘+K: “Attach this frame (or the pinned one and now, with "compare") to the Three Director's chat” |
| `/freeze` | Ctrl/⌘+K: “Freeze the picture (the music goes on); again to unfreeze; beat / bar: exactly on the next” |
| `/fx` | Ctrl/⌘+K: “Add a filter layer above the selected layer (--top: above everything); alone: the FX picke” |
| `/fx-list` | Ctrl/⌘+K: “List the FX pack (by kind and category)” |
| `/fx-palette` | Ctrl/⌘+K: “Set the sketch palette and recolor the selected layer (--only: just the palette)” |
| `/fx-picker` (/effects) | Ctrl/⌘+K: “Open the searchable FX picker (also X in the Lab)” |
| `/gallery` | Ctrl/⌘+K: “Start from something like…: the Lab gallery of starting points (built-in scenes by mood, y” |
| `/goto-frame` | Lab footage: the frames chip › Go to a frame… |
| `/grade` | Ctrl/⌘+K: “Cinematic grade for the Lab and its sequence: presets, LUTs (.cube in and out), tone mappi” |
| `/group` | Ctrl/⌘+K: “Layer groups in the Lab (no tokens): group layers into a folder, hide / show a group, solo” |
| `/guides` | Ctrl/⌘+K: “Next composition guide: thirds, golden ratio, center, off” |
| `/hearth-on-screen` (/on-screen) | Ctrl/⌘+K: “Put Hearth on screen: a whole shot in a new sketch (your newest captures or Hearth drawn, ” |
| `/hearth-ui` | Ctrl/⌘+K: “One layer of Hearth's screens in 3D: floating card, laptop, phone, browser, glass panels, ” |
| `/hit` | Lab timeline: Hit |
| `/hold-frame` | Ctrl/⌘+K: “Hold the footage frame at the playhead for N seconds” |
| `/kick` | Lab timeline: Kick |
| `/kinetic` (/kinetic-type) | Lab ✦ More › 🅰 Kinetic type (presets)… |
| `/knob` | Drag the slider (or its knob) |
| `/lab` | Ctrl/⌘+K: “Open the Three.js Lab (or one of its tools: model, shader, textures, docs, color, easing);” |
| `/lab-cuts` (/footage-parts) | Ctrl/⌘+K: “The Lab footage's cut, part by part (frames, timecodes, speeds, held frames)” |
| `/lab-focus` | Ctrl/⌘+K: “Focus: almost fullscreen, everything else hidden (Esc leaves)” |
| `/lab-keys` | Ctrl/⌘+K: “Show every Lab key” |
| `/lab-note` | Ctrl/⌘+K: “A note at this moment, with a screenshot (for the director)” |
| `/lab-palette` | Ctrl/⌘+K: “Set the sketch palette from a coolors.co link or hex codes (nothing: show it)” |
| `/lab-search` (/lab-find) | Ctrl/⌘+K: “Search everything in the Lab (actions in its menus, effects, looks, layers, sliders, your ” |
| `/lab-state` (/lab-status) | Ctrl/⌘+K: “What the Lab shows now: sketch, layer, frame size, song, BPM, live sound” |
| `/lab-tools` | Ctrl/⌘+K: “The Lab's secondary tools (model viewer, shaders, textures, docs, color, easing)” |
| `/lab-view` | Ctrl/⌘+K: “The Lab preview’s view: frame the subject, reset it, keep it as the scene’s camera, or how” |
| `/layer` (/layers) | Lab Layers: click a layer · its eye / solo / right-click |
| `/layer-add` | Ctrl/⌘+K: “Add a ready-made layer (visualizer, background, text, 3D…); alone: browse them” |
| `/link` | Ctrl/⌘+K: “Ableton Link: the Lab follows the tempo of Live, Traktor, Resolume… on your network (liste” |
| `/live` | Ctrl/⌘+K: “Live sound: system (Spotify, YouTube…), mic or off; gain <×\\|auto>, latency <ms>, calibrat” |
| `/live-status` (/beat-lock) | Ctrl/⌘+K: “Live sound: the tempo it hears, whether the beat is locked, gain and latency” |
| `/lock-slider` | Right-click a slider › 🔒 Lock at this value · the slider's lock |
| `/logo-reveal` | Ctrl/⌘+K: “A logo reveal of the Hearth flame or the Forgeheart anvil (line draw, 3D spin, slam with s” |
| `/look-apply` | Ctrl/⌘+K: “Apply a look: palette + recolor the selected layer + its filter layers (--colors: colors o” |
| `/look-match` | Ctrl/⌘+K: “Make the Lab scene look like a reference: palette, light, contrast, saturation, warmth, gr” |
| `/loop` | Lab timeline: drag a loop on the ruler · timeline ⋯ › Loop this bar / Loop 4 bars from here |
| `/loop-frames` | Lab footage: the frames chip › Loop 12 / 24 frames from here |
| `/loopback` (/system-audio) | Ctrl/⌘+K: “The computer's own sound into the Lab: finds a loopback device (BlackHole, Loopback, VB-Ca” |
| `/lyrics` (/lyric /karaoke) | Ctrl/⌘+K: “🅰 Lyrics on the song: paste them or load an .lrc / .srt, lines (and words) aligned to the” |
| `/make-it-react` (/react-music /auto-react) | Ctrl/⌘+K: “One click: sensible sliders follow the kick, bass and loudness (by their names); "undo" ta” |
| `/make-loop` (/perfect-loop) | Ctrl/⌘+K: “Make the Lab scene loop perfectly: the timeline loops over N bars of the song (or N second” |
| `/mark-kicks` (/mark-hits) | Ctrl/⌘+K: “Mark the hits found in the audio as markers you can edit (kicks, snares, hats or all; the ” |
| `/marker` | Lab timeline: Kick / Snare / Hit |
| `/markers-at-cuts` | Ctrl/⌘+K: “A cue at every cut of the Lab's footage” |
| `/match-pacing` (/pace-like) | Ctrl/⌘+K: “Cues at a reference clip's rhythm (its cuts, fitted to the loop / footage / song, its own ” |
| `/material` (/look-3d) | Ctrl/⌘+K: “A material look for the selected 3D layer or model: chrome, brushed metal, gold, mirror, g” |
| `/midi-learn` | Right-click a slider › 🎛 Map to a MIDI knob… |
| `/midi-out` (/midiout) | Ctrl/⌘+K: “MIDI out from the Lab: clock on the stage's tempo, notes on beats / bars / kicks / scene c” |
| `/morph` | Sliders: the A / B / C slots › Morph between |
| `/motion-intro` | Ctrl/⌘+K: “A sample motion intro as a Lab sequence: logo reveal → Hearth on screen with a title and a” |
| `/motion-kit` | Ctrl/⌘+K: “The motion-design kit: Hearth on screen, kinetic type, camera moves, logo reveals, end car” |
| `/motion-list` | Ctrl/⌘+K: “Every motion preset, by family” |
| `/motion-seq` | Motion design kit (Alt+X): pick a preset with Shift+Enter while the sequence is open |
| `/motion-words` | The motion layer's text field in Sliders |
| `/move-slider` | Right-click a slider › ♪ Follow the music / move by itself… |
| `/move-with` (/beatlink /move-with-music) | Right-click a slider › ♪ Move with the music… |
| `/music-video` | Ctrl/⌘+K: “A whole music video from the loaded song: a plan per section (scene, length, transition on” |
| `/my-template` (/my-templates) | Ctrl/⌘+K: “Your own Lab templates (no tokens): list them, see a template's fields, make a new scene f” |
| `/next-frame` | Ctrl/⌘+K: “One frame forward (freezes first)” |
| `/nudge-grid` | Lab timeline: the grid row's nudge buttons (10 ms earlier / later) |
| `/obs` | Ctrl/⌘+K: “OBS Studio: the Lab as a transparent Browser Source (a page on this computer), and OBS fro” |
| `/onion` (/compare-frame) | Ctrl/⌘+K: “Pin this frame and compare it with the live picture: pin, onion, wipe or off” |
| `/osc` | Ctrl/⌘+K: “OSC in and out for the Lab: TouchDesigner, Ableton, Resolume, TouchOSC or phone apps move ” |
| `/pace-check` | Lab footage: a reference clip's menu › Compare my cut |
| `/pack` | Ctrl/⌘+K: “Share a scene as one file: save the Lab scene (or its sequence) with everything it uses as” |
| `/particles` (/gpu-particles) | Ctrl/⌘+K: “✦ GPU particles: a particle layer from a preset (galaxy, smoke, sparks on kick, text that ” |
| `/paste-sliders` | Ctrl/⌘+K: “Set sliders from copied values” |
| `/pause` | Ctrl/⌘+K: “Pause the song · on the board: Pause the clips on the board” |
| `/physics` (/phys) | Ctrl/⌘+K: “⚛ Light physics: a physics layer from a preset (bouncing balls on beat, falling letters, d” |
| `/play` | Ctrl/⌘+K: “Play the song · on the board: Play the clips in view (four at most)” |
| `/present` | Ctrl/⌘+K: “Present: the preview alone, fullscreen (Esc leaves)” |
| `/preset` | Lab timeline: Presets |
| `/quantize` | Ctrl/⌘+K: “Quantize taps: K / S / H markers land exactly on the grid” |
| `/react-curve` (/react-edit) | Right-click a slider › ♪ React to a sound (curve)… |
| `/react-off` | Right-click a slider › ♪ React to a sound (curve)… › off |
| `/react-preset` (/reaction) | Ctrl/⌘+K › Lab: Reaction presets (pump on kick, zoom on drops…) |
| `/react-to` (/sound-react /follow-sound) | Right-click a slider › ♪ React to a sound (curve)… |
| `/recipe` (/lab-recipe) | Ctrl/⌘+K: “Lab recipes (no tokens): your finishing steps recorded once on a scene, replayed on the sc” |
| `/recolor` | Ctrl/⌘+K: “Put the palette into the selected layer's color sliders” |
| `/record` | Ctrl/⌘+K: “Record a video: loop, song, here (until /record stop), N bars or N s from here, or stop; a” |
| `/ref-frames` (/ref-read) | Lab References: a clip's menu › Contact sheet / Scene list / Motion curve / Pacing / Vibe card |
| `/ref-motion` | Lab References: a clip's menu › Its motion on a slider… |
| `/refs` | Ctrl/⌘+K: “Open the sketch's references (pictures, clips, models…)” |
| `/remote` (/phone) | Ctrl/⌘+K: “Phone remote for the Lab and the live stage over your Wi-Fi: faders, XY pad, shuffle / fre” |
| `/render-again` (/rerender) | Ctrl/⌘+K: “Render this chat's Lab sequence again, locally” |
| `/reset-sliders` | Ctrl/⌘+K: “Put the selected layer's sliders back to the values in the code” |
| `/reshuffle` (/shuffle-forward) | Ctrl/⌘+K: “Forward to the next shuffle (or a new one)” |
| `/restart-sketch` | Ctrl/⌘+K: “Restart the simulation from scratch (fresh page, GPU and sound)” |
| `/safe` | Ctrl/⌘+K: “Safe zones on the frame: on, off, or for tiktok / reels / shorts” |
| `/save-look` | Ctrl/⌘+K: “Save the current slider values as a look (a quick name if you give none)” |
| `/save-one` | Right-click a slider › 💾 Save just this one |
| `/save-sliders` (/ss /save) | Ctrl/⌘+K: “Save the selected layer's slider values into its code (Ctrl+S)” |
| `/scene` | Ctrl/⌘+K: “This director chat's own scene: show which sketch it owns · link the open one · a fresh on” |
| `/scene-timeline` | Ctrl/⌘+K: “The scene's timeline (its song, else its own, no song needed): what is on it · its length ” |
| `/sections` | Ctrl/⌘+K: “Mark the song's parts (Intro, Build, Drop, Break, Outro) as cues that looks can follow; "l” |
| `/sequence` (/seq) | Ctrl/⌘+K: “The Lab sequence: a video timeline of your scenes, footage, titles and the song, played in” |
| `/sequence-render` | Ctrl/⌘+K: “Render the Lab sequence frame by frame (with its sound) into a video file” |
| `/shader` | Ctrl/⌘+K: “◇ Shader workbench: fragment-shader layers (GLSL, Shadertoy, ISF) with live compile, slide” |
| `/shadertoy` | Ctrl/⌘+K: “Import a Shadertoy (or ISF) shader as a ◇ layer: iChannels map to audio, feedback, buffers” |
| `/shot-list` | Ctrl/⌘+K: “The shot list: every camera move in the picker (Enter adds one as a layer)” |
| `/show-code` | Ctrl/⌘+K: “Show or hide the code” |
| `/shuffle` (/dice) | Ctrl/⌘+K: “Shuffle the sliders: a group or kind (colors, numbers, favs, changed), how far (subtle / n” |
| `/shuffle-mode` | Right-click Shuffle (amount and which sliders) |
| `/shuttle` | Lab footage: the frames chip › Step › Play backward / forward / Stop on a whole frame (J / K / L) |
| `/size` (/frame) | The picture's pill: 9:16 16:9 4:5 1:1 Fit · More… for every size |
| `/sketch` | Lab toolbar: ▦ Your sketches |
| `/sketches` | Ctrl/⌘+K: “List your sketches (most recent first); "browse" opens them as pictures” |
| `/slider` | Drag the slider · right-click › Type a value… |
| `/slider-group` | Sliders: the group chips (Colors, Formation, Particles…) |
| `/sliders` | Ctrl/⌘+K: “Show or hide the layers & sliders panel” |
| `/slot` | Sliders: the A / B / C slots |
| `/snap` | Lab timeline: the snap setting (Ctrl/⌘+K "Next snap setting") |
| `/snare` | Lab timeline: Snare |
| `/song` | Lab timeline: play / pause, click the wave to seek, 🎵 Load audio/video |
| `/song-features` (/song-key) | Ctrl/⌘+K: “The song's whole-song audio features: the key, the drops and the builds before them (compu” |
| `/song-trim` (/trim-song) | Lab timeline: right-click › Song starts here / Song ends here / Untrim the song |
| `/stage` (/vj) | Ctrl/⌘+K: “Live / VJ: show mode, GO (cut / fade / dip on the bar), set list, cue, tempo (tap, MIDI cl” |
| `/stage-window` | Ctrl/⌘+K: “Run the sketch in its own Stage window (again: back here)” |
| `/stems` (/song-parts) | Ctrl/⌘+K: “The song split into the drums, the bass, the voice and everything else (once per song, kep” |
| `/still` | Ctrl/⌘+K: “Save a still at the exact frame size (or one of 9:16, 16:9, 4:5, 1:1); "copy" puts it in t” |
| `/stills` | Right-click the picture › ⇪ Make & export › A folder of stills |
| `/surprise` (/random-fx) | Ctrl/⌘+K: “Apply a random filter (or layer, look, palette)” |
| `/tame` | Ctrl/⌘+K: “Halfway back to the code: every slider you changed moves half the way back (after a wild s” |
| `/tap` | Ctrl/⌘+K: “Tap tempo: with a number, set the BPM; "one" puts the downbeat at the playhead” |
| `/tap-latency` | Ctrl/⌘+K: “How late you tap (learned from your taps on a song); "forget" resets it” |
| `/text` (/text-layer /lettering) | Ctrl/⌘+K: “🅰 Kinetic type: crisp text (or 3D extruded letters) animated in and out by letter / word ” |
| `/text-moves` (/moving-text /words-on-beat) | Ctrl/⌘+K: “🅰 Text that moves with the music: 22 kinetic type presets (word by word pop, letter casca” |
| `/trigger-preset` (/triggers-preset) | Ctrl/⌘+K: “Set the ⚡ triggers for a style of music or a behavior (busy, calm, kick only…)” |
| `/triggers` | Ctrl/⌘+K: “Open or close the ⚡ Triggers panel” |
| `/try-first` | Ctrl/⌘+K: “Try it first: the Lab director's edits show in the preview but wait for you (Keep saves th” |
| `/tweak-code` | Ctrl/⌘+K: “Copy the sliders as tweak() code with their current values” |
| `/type-3d` | Motion design kit (Alt+X, Lab ✦ More) › Motion · 3D type |
| `/undo-sliders` | Ctrl/⌘+K: “Undo the last slider change” |
| `/unlock-slider` | Right-click a slider › 🔓 Unlock · the slider's lock |
| `/unshuffle` (/shuffle-back) | Ctrl/⌘+K: “Back to the shuffle before (Shift+R)” |
| `/variations` | Ctrl/⌘+K: “Variations of the Lab scene, made locally (no tokens): 6 takes nudging its colors, motion,” |
| `/visualizer` (/music-visualizer /visualiser) | Ctrl/⌘+K: “🎵 Music visualizer layers in one click: 17 looks (spectrum bars, circular spectrum, wavef” |
| `/webcam` (/camera-in /tracking) | Ctrl/⌘+K: “The camera (webcam, capture card, a video file) as a live Lab input: on / off, looks (part” |

### Video (3)

| Command | Visible way |
|---|---|
| `/ffmpeg` | Ctrl/⌘+K: “Is ffmpeg installed (sharp MP4 recordings, exact frames, renders)? /ffmpeg install opens a” |
| `/post` (/ready-to-post) | Ctrl/⌘+K: “Ready to post: checks a finished video for a platform (size, length, loudness, what the ap” |
| `/renders` (/rq /render-list) | Ctrl/⌘+K: “The render queue: everything Hearth renders, records or exports (progress, time left, paus” |

### View (15)

| Command | Visible way |
|---|---|
| `/autofold` | Ctrl/⌘+K: “Fold long replies automatically (on by default; “Show full reply” opens them)” |
| `/clear-notes` (/cls) | Ctrl/⌘+K: “Remove the hub's notes (command output) from this chat view” |
| `/focus` | Ctrl/⌘+K: “Just this chat: hides the chats panel and the rail (again: back)” |
| `/font` | **new:** Chat ⋯ (right-click the header) › View › How messages look › Font |
| `/grid` | Ctrl/⌘+K: “Agents side by side (again: one at a time)” |
| `/numbers` (/msg-numbers) | Ctrl/⌘+K: “Show message numbers (for /jump, /edit, /copy #)” |
| `/panel` (/sidebar) | Ctrl/⌘+K: “Show or hide the chats panel” |
| `/refresh` (/redraw) | Ctrl/⌘+K › Freshen the window (reload, keeps everything) |
| `/scroll-lock` (/lock) | Ctrl/⌘+K: “Stop following a reply as it streams (read from where you are)” |
| `/spacing` (/compact-view /msg-density) | **new:** Chat ⋯ (right-click the header) › View › How messages look › Spacing |
| `/timestamps` (/times) | **new:** Chat ⋯ (right-click the header) › View › How messages look › Times |
| `/width` | **new:** Chat ⋯ (right-click the header) › View › How messages look › Width |
| `/wrap` | Ctrl/⌘+K: “Wrap long lines in code blocks instead of scrolling sideways” |
| `/zen` | Ctrl/⌘+K: “Focus plus quiet chrome: message buttons show on hover only (again: back)” |
| `/zoom` (/text-size) | Ctrl/⌘+K: “Chat text size (only the chats; Ctrl +/- zooms the whole app)” |

### Voice (2)

| Command | Visible way |
|---|---|
| `/talk` (/dictate /listen) | Ctrl/⌘+K: “Listen to you: the words land in the chat box (again: stop). Hold Ctrl+Space does it too” |
| `/voice` | Ctrl/⌘+K: “Talk to chats and hear them: local speech-to-text (whisper), voice commands, push-to-talk ” |

### Only the Three Director could do it (its tools) → your own way

| Director tool | Your way |
|---|---|
| `three_eval` | ›_ Console (type code, Enter) |
| `three_edit_code` | </> Code (the editor) |
| `three_set_code` | </> Code (the editor) |
| `three_read_code` | </> Code |
| `three_get_code` | </> Code · Ctrl/⌘+K › Lab: Copy all the code |
| `three_search_code` | </> Code: Ctrl/⌘+F in the editor |
| `three_screenshot` | The picture's 📷 still · Ctrl/⌘+K › Lab: Save a screenshot |
| `three_sliders` | ⚡ Sliders |
| `three_console` | ›_ Console |
| `three_media_control` | The timeline: play / pause / seek, 🎵 Load audio/video |
| `three_media_info` | Ctrl/⌘+K › Lab: What the app found in the song |
| `three_load_media` | Lab timeline: 🎵 Load audio/video · drop a file on the picture |
| `three_input` | Click / press keys on the picture yourself |
| `three_contact_sheet` | Ctrl/⌘+K › Lab: Contact sheet · the frames chip › Contact sheet |
| `three_add_layer` | Lab: Effects & layers picker (X) · Layers ＋ |
| `three_remove_layer` | Layers: a layer's right-click › Delete |
| `three_update_layer` | Layers: a layer's sliders and right-click |
| `three_select_layer` | Layers: click a layer |
| `three_layers` | Layers |
| `three_animate` | Ctrl/⌘+K › Lab: Animate the selected layer… · a layer's When it plays › Animate ▾ |
| `three_keyframes` | Right-click a slider › ◆ Keyframe at the playhead |
| `three_looks` | Sliders: the looks bar · Ctrl/⌘+K › Lab: Looks… |
| `three_references` | Lab toolbar: References |
| `three_timeline` | The timeline (cues, markers, sections) |
| `three_timeline_edit` | The timeline (drag, right-click) |
| `three_triggers` | Lab timeline: ⚡ Triggers |
| `three_footage` | Lab footage: the frames chip |
| `three_sequence` | ▤ Sequence |
| `three_new_sketch` | ▦ Your sketches › New |
| `three_set_frame` | The picture's pill (frame sizes) |
| `three_model` | Lab ✦ More › 3D model library |
| `three_motion` | Motion design kit (Alt+X) |
| `three_nodes` | Ctrl/⌘+K › Lab: Nodes ⇄ Code |
| `three_notes` | Lab: the Notes list button (notes on moments of the song) |
| `three_comp` | Ctrl/⌘+K › Lab: Comp (another chat's scene as a layer, Alt+C) |
| `three_undo` | Ctrl/⌘+Z · Lab: Time machine (Alt+H) |
| `three_run` | Lab toolbar: ▶ Run |
| `three_do particles` | Lab ✦ More › ✦ GPU particles (presets)… |
| `three_do shader` | Lab ✦ More › ◇ Shader workbench / New shader layer |
| `three_do type` | Lab ✦ More › 🅰 Kinetic type / Lyrics |
| `three_do physics` | Lab ✦ More › ⚛ Light physics |
| `three_do asset` | Ctrl/⌘+K › Assets: the asset library |
| `three_do material` | Lab ✦ More › ◉ Material look for 3D |
| `three_do loop` | Ctrl/⌘+K › Lab: Make it loop (∞ perfect loop) |
| `three_do autoedit` | Lab timeline ⋯ › 🎬 Make a music video |
| `three_do crew` | Ctrl/⌘+K "crew": Deploy a crew (cost shown first, you pick one) · Ctrl/⌘+K › Lab: Variations of this scene |
| `three_do make` | Ctrl/⌘+K › Makes: plan a make (its rooms now)… |
| `three_do batch` | agent-only: several director calls in one (no owner use) |
| `three_task` | agent-only: the chat's task notes Hearth keeps for a handoff (Activity shows progress) |
| `three_help` | agent-only: the app map for the AI (Ctrl/⌘+K "how do I…" is the owner's) |


## For the patch notes
- Every command now has a way to reach it by clicking: we checked all 925 (and what only the Three Director could
  do) and wrote down where each one lives.
- Snippets: right-click the chat box › More… › Snippets: insert one in a click, save what you wrote as one.
- Remind me…: right-click the chat box › More… › Remind me… (in 25 minutes, at 9pm…), with a notification.
- How messages look: chat ⋯ (right-click the chat header) › View › How messages look: width, spacing, when times show,
  the font.
- On the board, a palette card's right-click has Palette style (stripes, gradient, dots, blocks).
- Capture › Settings › Recording… › Window at an exact size… for clean 1920×1080 or 4:5 recordings.
- Fixed: the board's right-click lost a website's, note's, shape's, frame's and color's own rows whenever the Apps
  had been opened. They're back.
- Nothing new on screen: every new row is inside a menu you already had, and Ctrl/⌘+K finds them.
