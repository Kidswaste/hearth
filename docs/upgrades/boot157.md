# Round 157 · boot157: a first screen a quarter lighter

The owner wants Hearth lighter and faster to start. The first screen (what index.html parses before the first frame)
was at its budget exactly: 1,547 / 1,547 KB of code, 62 scripts, 27 stylesheets. This round measured what each eager
file does at startup, moved what the first frame doesn't draw behind it, and lowered the budget so it can't creep back.

## Result

| | Before (round 154) | After | |
|---|---:|---:|---:|
| First-screen code (boot-test: without whole-line comments) | 1,547 KB | **1,172 KB** | **−375 KB (−24.2 %)** |
| First-screen scripts | 62 | **49** | −13 |
| First-screen stylesheets | 27 (415 KB) | **23** (398 KB) | −4 |
| First screen up (`hearth:ready`, ms since the process started, median of 10 launches) | 521 ms | **470 ms** | −51 ms (−10 %) |
| Window on screen with its first frame (`ready-to-show`, median of 10) | 503 ms | **454 ms** | −49 ms |
| Script evaluation on the window's main thread before the first screen, no code cache (trace, 2 launches) | 99 · 113 ms | **93 · 75 ms** | ≈ −21 % |
| V8 parse + compile on the main thread before it (trace) | 1.3 · 1.6 ms | 1.4 · 1.6 ms | — (V8 compiles off the main thread / lazily here) |
| Window JS heap once settled (median of 10) | 12.8 MB | 13.4 MB | — (same code loaded a moment later: noise) |
| DOM nodes / listeners once settled | 2,191 / 1,245 | 2,220 / 1,294 | ≈ (the redraw's nodes) |
| Every 'soon' group in (calm gate opened at once) | 3.2 s | 3.5 s | — (noise across launches: 3.0–3.7 s both) |

Budget (`dev/boot-test.js`): scripts 62 → **51**, code 1,547 → **1,207 KB** (1,172 + 3 %: room for Lite's small eager
flag reader, ≈ 3 KB), sheets 27 → **24**, CSS 420 → **410 KB** (398 + 3 %).

## How it was measured

- **Coverage** (`node dev/smoke.js --fake-engines --coverage-ready r.json --coverage a.json --wait 9000`, then
  `node dev/firstscreen-coverage.js r.json a.json --blocks 90`): 1,115 of 1,839 KB of first-screen source had not run
  when the first screen was up, and 1,088 KB still hadn't 9 s later. As in rounds 83–96 it is thin (handlers and menus in
  every file; the biggest block is access-rules.js' command classifier, 11.9 KB), so again whole files moved, picked by
  "does the first frame draw anything from it, and does anything call it synchronously before then".
  smoke.js' `--coverage-ready` was fixed on the way: it read the page from *before* the reload (17 scripts), it now
  waits for the new document (`performance.timeOrigin`).
- **Start** (`flock /tmp/hearth-run.lock` around `node dev/coldstart-report.js [--app <round-154 copy>] --runs 5 --json …` and
  `--runs 1 --no-code-cache --trace …`, twice each, interleaved; `dev/coldstart-report.js`, this round adds the window's JS heap / DOM nodes / listeners once settled, and with
  `--trace` the window's V8 parse + compile and script evaluation before the first screen; `--no-code-cache` drops
  V8's code cache, as on the first start after an update). Before = a copy of round 154 (7d30db1) through `--app`,
  run interleaved with the after runs, two rounds each, under the shared check lock (no check ran meanwhile). This box:
  4 shared CPUs, software GL, an empty profile with the fake engines.

## What moved behind the first frame

Thirteen files and four stylesheets, in seven lazy groups, all `asap` (right after the first frame, first of all, in
their old order), all registered in HearthFeatures' core features (trim-data.js: `astra` → Astra and the AI programs,
the rest → Chats), so trim153's registry check holds:

| Group | Files | Code KB | What it is |
|---|---|---:|---|
| `chatlive` | chat-live.js | 19 | a running reply's live status (phases, agents tree) |
| `astra` | astra.js + astra.css | 132 | Astra, the collaborations, the ⚇ chip, Astra's commands (Codex's file, loaded from outside) |
| `smart` | router.js, routerlearn.js + router.css | 31 | Smart's model / effort pick and what it learned |
| `offline` | offline-core.js, offline.js + offline.css | 43 | calm network / limit / sign-in lines, the offline queue |
| `chatkit` | chat-things.js, chat-media.js, chat-reach.js, chat-context.js | 64 | a reply's cards, media, paths; the chat's context line |
| `chatattach` | chat-attach.js | 17 | the ＋ attach menu and /attach-* |
| `access` | access-rules.js, access.js + access.css | 77 | file access: checks, asks, badges, the activity line |

### Keeping behaviour identical (lazy.js, three new group flags)

- **`slots`**: these files plug into `Native.hooks` (message, render, send, compose, finish, options…), and the order of
  those hooks matters (a compose hook's line lands where it always did; cards under a reply come in the same order).
  At each group's `lazy-at.js` tag lazy.js puts a quiet placeholder into every hook list; when the group loads, its
  pushes land on the placeholder, which then goes. Checked: all 13 hook lists, the commands, the Ctrl/⌘+K lines and the
  keys sheet (per area) are in the same order as before (a probe compared both builds line by line).
- **`redraw`**: the first frame draws the chat without their decorations; once the last of these groups is in, the
  chats on screen are drawn once more (`Native.refresh`, scroll kept), so a reply's cards, 🔐 file-action line, calm
  error line, Smart's chip and Astra's collab cards appear ≈ 0.1 s after the first frame. `'mount'` (astra) first
  passes the mounted chats through `Native.mount` again, which astra.js wraps to add the ⚇ chip, and redraws the rail.
- **`send`**: `Native.send` waits for these groups (`Lazy.sendReady()`) before it does anything, so a message sent in
  the first moment carries exactly the same options, permissions, compose lines and Smart pick as before. (Checked with
  every group held back: the first send loads them, the reply comes.)
- `actionsNow` (astra: its Ctrl/⌘+K lines at its old place, as it added them while running) and `keysNow` (chatkit,
  chatattach, access) keep the palette's and the keys sheet's order. panel.js' "Drag a chat onto a 📁 folder" line is
  added at DOMContentLoaded (its timer used to run after keys-ui.js only because the first screen was slower).
- Other loads that read these globals at their own load: `accessui` now has `after: ['access']`, `usagelimits` `after: ['offline']` (it captures OfflineCore once), `jam` `after: ['astra']`
  (jam.css uses astra.css' colours). Everything else reaches them through `typeof X` guards, which also pull the group
  in (lazy.js' global guards). A `typeof Astra` peek while the first screen is drawn (native.js' empty-chat hints,
  missions.js' chip) isn't counted as a miss for a `redraw` group (fastboot): it loads first and the chat is drawn again.
- A send that finds every group in doesn't await anything (liveness-ui caught an extra await: a new chat used to be
  busy in the same task as `Native.send`).
- The manifest (`node dev/lazy-manifest.js`, `--check`) records the same names, aliases, actions, keys, apps and tools
  as the eager build (957 / 339 / 1414 / 505 / 51 / 8, no duplicates); trim weights regenerated (169 groups).

### What stays eager, and why

- The chat view itself (native.js, renderer.js, panel.js, md.js, commands.js, chat-ux.js, chat-slash.js, chat-calm.js,
  chatcore.css / chat-live.css: their rules lay out native messages), the rail, Settings' entry, the token meter strip.
- **progress-hooks.js** (14 KB) was moved, then put back: firstscreen96 proves what Hearth learned of how long things
  take is read from the start (the progress model is eager, and something can start before the hooks would load).
- **Safety nets and calm**: jank.js (the hiccup recorder runs from the start), habits.js (counts every error from the
  start), hints.js (the one-hint queue takes notes from the start), splash.js, devreport-hooks.js; the crash journal
  (safetynet) was already a lazy group that loads first.
- **Keys that must work at once**: keys-ui.js (Alt / Ctrl reveal, Ctrl+/; its registry feeds the stand-ins),
  speed-learn.js (Ctrl/⌘+Alt+1…9 is its own listener: lazy.js' early keys skip Alt), appui.js (Ctrl/⌘+K), look.js
  (applies the theme before the first frame), declutter.js (the generated tidy stylesheet must be there at the first
  frame or tucked controls flash).
- **Sign-in and update states**: the rail's sync chip (sync.js), makes.js (the chats list groups rooms under makes),
  notes.js (Notes' store registers with StoreAck from the start), chat-scenes.js (projects.js / project-workspace.js read
  it unguarded); updates are already a lazy group (`updater`).
- **The Lab window** loads none of the moved files (its 20 eager files are unchanged); missions.js, manager.js,
  swarmlean.js, collab-eyes.js: not touched (other streams' scope).

## Seen, not changed

- lazy-data.js is the biggest file left after native.js (141 KB with notes; its generated manifest is 87 KB). Most of it
  registers stand-ins before the first frame (commands, keys, palette lines, app windows); the keys sheet's lines (16 KB)
  and app windows (10 KB) could be read after the first frame like lazy-meta.js' words, but their order in the sheet
  and the palette would need the same care as this round's `slots`.
- chat-scenes.js (36 KB) could follow if projects' groups and project-workspace.js waited for it (`after`).

## For Codex

- No Codex-owned file was edited. **astra.js and astra.css now load as the lazy group `astra`** (lazy-data.js, index.html),
  right after the first frame and before every other lazy group. Consequences for future edits in astra.js: nothing in it
  runs before the first frame; its `Native.mount` wrapper reaches the already-mounted chats through lazy.js'
  redraw (Native.mount called again), its keydown listener and commands are live ≈ 0.1 s after the first frame (the
  commands have stand-ins until then); other files must keep reaching it through `typeof Astra` guards (they all do).
  A new eager dependency on Astra would need `after: ['astra']` on its group.

## Checks

No new check: boot-test's lowered budget holds the line (scripts 51, 1,207 KB of code, 24 sheets, 410 KB CSS).

- Final run (`flock /tmp/hearth-run.lock timeout 2900 node dev/run-checks.js --exact unit:boot-test unit:lazymanifest-test
  lazy trim153 labwin153 perf151 qa-keys cmdbar141 settingscalm appcalm fastboot firstscreen96 liveness-ui progress
  chat-stream calmstart`): **16 / 16 passed**. `node dev/whatsnew-test.js`: 49 passed.
- Feature checks for what moved (`access-chat access-astra astra-collab astra-ui offline chatcore chatcore-count
  chat-media chat-stream router routerlearn progress reach-open chatcalm calmstart storeack77 chat-menus attachlean` +
  `unit:access-test unit:offline-test unit:router-test unit:routerlearn-test unit:liveness-test unit:progress-test
  unit:lazy-groups-test`): all passed. That run also found the two things fixed above (liveness-ui: the extra await in
  send; fastboot / firstscreen96: the first-draw peeks and progress-hooks.js); both pass in the final run.
- `astra-quick-controls` fails under run-checks the same way on the untouched round-154 copy (its `__ASTRA_FIXTURE__`
  is only filled in by `node dev/astra-quick-controls-smoke.js`), which passes.
- Order probe (a smoke script, both builds): the 13 Native.hooks lists, 957 commands and 1,414 Ctrl/⌘+K lines in the
  same order; the keys sheet the same per area.
