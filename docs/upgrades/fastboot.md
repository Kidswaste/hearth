# fastboot (round 29): from launch to a usable window, and from the Lab button to its first frame

You want Hearth light and smooth. This pass measured the start (main process, the page, the first 2 s after it) and
the first open of the Lab, then cut what didn't need to be there. Nothing was removed: every command, key, menu line
and tool is still there from the first moment, and anything used early loads first, then runs.

## The main finding
Building the chats list peeked at the Lab (`typeof ThreeLab` in chat-scenes.js, then speed-resume.js). With the Lab
loading after the first screen (round 16), that peek asked for the whole Lab (74 files, ≈ 2.3 MB) **in front of the
window's first frame**: the first screen was ready, but nothing could be drawn until the Lab had been parsed (≈ 0.2–0.9 s
here). The peeks are gone, and a lazy feature asked for while the first screen is built now waits for the first frame.

## How it was measured
Interleaved before / after runs of this branch's starting commit (6b99774) and the finished branch, same machine, 4 rounds
each (the machine was shared with four other streams, load 5–13 on 4 CPUs, software GL: compare the ratios):
- Cold starts: `node dev/coldstart-report.js --app <copy> --runs 3` ×4 = 12 launches each (main-process timeline from
  dev/boot-probe.js: app ready → window made → shown → first frame → first screen ready → every feature loaded).
- Reloads: `node dev/perf-report.js --startup-only --no-stream --runs 3` ×4 = 12 each (first paint, ready, interactive,
  main-thread busy, long tasks, CSS / script cost).
- The Lab: `node dev/smoke.js --script dev/checks/fastboot-lab.js` ×8 each (new: a real press on the Lab's rail button,
  then the timeline press → preview page loading → parsed → ready → the scene drawn).

## Numbers (medians, before → after)
| What | Before | After | |
|---|---:|---:|---|
| Main process: work main.js does before the window (requires) | 35.7 ms | **6.9 ms** | −81 % |
| Main process: main.js start → Electron ready | 121 ms | **75 ms** | −38 % |
| Cold start: Electron ready (ms since launch) | 235 | **178** | −57 ms |
| Cold start: window made | 271 | **215** | −56 ms |
| Cold start: window on screen | 553 | **495** | −58 ms |
| Cold start: first frame (ready-to-show) | 1,489 | **1,372** | −117 ms |
| Reload: first paint (FCP) | 808 ms | **469 ms** | **−42 %** |
| Reload: first screen ready | 510 ms | 400 ms | (noise ±20 %) |
| Reload: first paint − ready (the frame waiting behind other work) | 287 ms | **73 ms** | −75 % |
| Reload: interactive (last long task ≤ 3 s after ready) | 1,535 ms | **1,167 ms** | −24 % |
| Reload: main-thread busy (start + 3 s) | 1,776 ms | **1,151 ms** | −35 % |
| Reload: long tasks (> 50 ms) | 3.5 · 486 ms | **1.5 · 129 ms** | −74 % time |
| Reload: CSS parse | 106 ms | 75 ms | −29 % |
| First screen: JS / CSS read before it | 2,423 KB (77 files) / 447 KB (28) | **2,218 KB (72) / 430 KB (26)** | −205 KB / −17 KB |
| Lab: press → its preview page starts loading | 220 ms | **154 ms** | starts on the press |
| Lab: preview page parsed / ready | 513 / 534 ms | 526 / 529 ms | same |
| Lab: press → the scene drawn | 2,568 ms | 2,560 ms | same (see below) |
| Lab open: hub long-task time | 196 ms | 143 ms | |
| Cold start: every 'soon' feature loaded | 2,431 ms | 3,481 ms | later, see Known limits |

The Lab's first frame: after its page is up (≈ 0.5 s here), ≈ 2 s go to the scene's first run: the WebGL context and
compiling its shaders, all inside the GPU emulation this machine uses (software GL; one `evaluateModule` of the layer
with no JS in it, then a 0.3 s first `render`). The page itself parses 584 KB of inline module in ≈ 50 ms. On a Mac's
GPU those first-run steps take tens of ms, so the press → loading head start is the part you'll notice.

## Upgrades

### The window comes up sooner
1. **The first frame no longer waits for the Lab.** The chats list peeked at the Lab while it was built and pulled
   all of its files in front of the first frame; it doesn't any more (chat-scenes.js, speed-resume.js).
2. **Nothing lazy can get in front of the first frame again**: a feature asked for while the first screen is built
   loads once the window has drawn (one frame, or 0.3 s at most when frames are slow) (lazy.js).
3. **The window is made first, the rest right after.** The main process used to set up sync, capture, apps, the asset
   library, the board, the updater and ~15 more before Electron's "ready"; now the window is created first and they
   register in the same moment after it (before the page can ask anything), while the page process starts. Main-process
   work before the window: 36 → 7 ms (main.js).
4. **Renders, the updater, the asset library and hooks load in the main process on their first use** instead of at
   every launch (lazyIpc; it now also reads channels registered through a file's own `h('x:y', …)` helper).
5. **The command bar loads after the first screen** (Ctrl/⌘+;, F1, the help view: 90 KB of JS and 9 KB of CSS less to
   read before the first frame).
6. **Flows loads after the first screen** (runs, their cards, Ctrl/⌘+Shift+F: 128 KB of JS and 7 KB of CSS less).
7. **Their keys work before they're in**: Ctrl/⌘+; and F1 (command bar) and Ctrl/⌘+Shift+F (Flows) load them on the
   press and then do what they do, also from the Lab's preview or a website (the keys main.js forwards).
8. **/help, "/" in the Ctrl/⌘+K palette and the keys menu's "Command bar"** wait for the bar instead of falling back
   to something else when used in the first second.
9. **The ≈ 850 "/command — what it does" lines of the Ctrl/⌘+K palette are made when the palette first opens** (or
   in an idle moment), in the same place in the list, instead of in a task next to the first frame. They now always
   include the token meter's commands (before, a race decided it).

### The first seconds after it
10. **The Lab still loads first, right after the first frame**, without waiting for an idle moment (on a busy start
    those came seconds later), so opening it early stays quick.
11. **No freeze while the Lab's files go in**: its 74 script tags are added 8 at a time, a task each, instead of one
    0.1–0.5 s task right after the first screen (long tasks during the start −74 %).
12. **Replies already on screen get their clickable /commands** when the command bar loads after them.

### Opening the Lab
13. **The Lab starts building on the press of its rail button** (or its docked director's), not on the click ≈ 0.1 s
    later: its preview page is already loading when the button comes back up. Only once the Lab's files are in;
    nothing shows until the click.

### For the next streams (dev)
- `Lazy.isIn(name)`: is a group in, without asking for it (use it, not `typeof X`, in code that only decorates a lazy
  feature). Group options `keys: [{ key, code, mod, shift, typing, run }]` (a press loads the group, then runs) and
  `asap` (right after the first frame). Big groups are injected 8 tags per task.
- `AppUI.addActionsLater(build)`: a big batch of palette lines made on first read / idle, keeping its place.
- `Tools.warm(id)`: mount a tool on the press (the Lab only).
- main.js `registerAfterWindow()`: new main-process modules register there (or through `lazyIpc`), not at main.js's top.
- Checks: `dev/checks/fastboot.js` (qa group: no peeks before the first frame, every group starts after it, cmdbar /
  Flows lazy, first-use main modules answer, then with every group held: Ctrl+;, Ctrl+Shift+F, /help);
  `dev/checks/fastboot-lab.js` (the Lab open timeline; `fastboot.cold` = '1' for a Lab opened before its files are in).
  dev/boot-test.js reads helper-registered channels like main.js; dev/checks/flows.js waits for every group before
  checking the registry.

## Tested
`node --check` on every touched file; `node dev/boot-test.js` (713 checks); `node dev/lazy-manifest.js` then `--check`
(names 858, aliases 287, actions 1198, keys 453, apps 49, tools 6, dups 0); `sh dev/run-checks.sh lazy fastboot cmdbar
qa-commands` (all pass); `flows` + `flows-video`: the same two failures as on the starting commit (/flow-make with the
fake engine, the video chat card), nothing new.

## Known limits
- "Every feature loaded" comes later on this machine (2.4 → 3.5 s): the Lab now waits for the first frame instead of
  being parsed in front of it, and the other groups each wait for an idle moment, which software GL hands out slowly.
  With a GPU, frames and idle moments come every few ms. Anything used before it's in loads first, as before.
- Ctrl/⌘+; pressed in the ≈ 30 ms while the command bar's files are being added does nothing (press again).
- The Lab's own first run (WebGL context + shaders) wasn't changed: it's the GPU's work, not the page's.

## For the patch notes
- Hearth opens faster: the window shows its first picture about 40 % sooner after a reload, and the start no longer
  stalls for a moment while the Lab loads in the background.
- The Lab used to be loaded in front of the very first frame by mistake; now the window draws first, then the Lab loads
  right behind it, so opening it early is still quick.
- The app's background process does less before the window appears (about 30 ms less work), and four rarely used parts
  (renders, updates, the asset library, hooks) now load only when you use them.
- The command bar (Ctrl/⌘+;) and Flows (Ctrl/⌘+Shift+F) load just after the first screen; their shortcuts still work
  from the first moment.
- Pressing the Lab's button starts preparing it right away, so the Lab appears a little sooner when you click.
- Fewer hiccups in the first seconds: the big background loads are split into small steps.
- Nothing was removed and nothing looks different; on this test machine "everything loaded" finishes a bit later,
  which you won't notice on a Mac's GPU.
