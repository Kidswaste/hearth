# Round 166 · audit166: the next biggest wins outside the Lab

A fresh, ranked audit of what an owner's session costs outside the Lab (CPU, wakeups, memory, long tasks, disk writes,
data-folder growth, what ships on disk), then the top two safe fixes, with before / after numbers. The Lab, Scenes v2,
Codex's files and the off-limits areas were not touched.

## How it was measured

- **`dev/audit166-measure.js`** (new, not a check): a realistic session in the smoke run's own temp data folder and
  profile, the fake engines: `node dev/smoke.js --fake-engines --keep --check-timeout 1500000 --script
  dev/audit166-measure.js`. The start; 40 s settling; 30 s idle; 3 projects × 2 chats of 400 turns (Markdown, code
  blocks, tables, folded tool steps, Lab screenshot cards, pictures in replies and attached to questions); the 6 chats
  opened; 40 wheel turns up a long chat; a 40 K-character reply streamed into it; Settings opened and closed twice;
  Trim Hearth opened and closed; the command bar 3 × (open, type, close); 6 project switches; the Mood board opened and
  left; Hearth hidden 60 s; 30 s idle; then the Forgeheart look: idle, scroll, stream, Settings, switches, hidden.
  Per area: every process' CPU ms, the window's task / style / layout ms, its wakeups by the line that asked, the main
  process' timer wakeups, long tasks, changes under the data folder (by file), the window's JS heap after a GC, the
  renderer's and all processes' memory. `--keep` keeps the data folder and profile for `du`.
- CPU profiles of the window (CDP sampling, 200 µs) during a stream, project switches, Settings, scrolling.
- Web caches: a bare Electron 44.5.1 page in a persistent session fetching 400–1,300 cacheable 1 MB files from a local
  server (`getCacheSize()` + `du`), and the same inside Hearth through `dev/checks/audit166.js`.
- Package: `git ls-files` sizes by folder; the Windows zip recipe (`dev/make-windows-zip.sh`); the updater.
- This box: 4 shared CPUs, software GL (the GPU process is SwiftShader, so every paint is expensive there: GPU-process
  CPU numbers are relative), Xvfb 1480 × 940 at 1×.

## The session, area by area (before this round)

| Area | Seconds | Window CPU | Window main-thread tasks | GPU process CPU | Main CPU | Long tasks (longest) | Data-folder writes | Notes |
|---|---:|---:|---:|---:|---:|---|---:|---|
| Idle, chat open (30 s) | 30 | 10 ms | 2 ms | 10 ms | 110 ms | 0 | 0 | window 0.1 wakeups/s, main 2/min |
| Open 6 long chats | 3.8 | 510 ms | 450 ms | 10.6 s | 80 ms | 0 | 1 | |
| Scroll a 400-turn chat (40 wheel turns) | 12.4 | 1,330 ms | 1,207 ms | 34.9 s | 190 ms | 0 | 11 | composited since round 165 |
| Stream a 40 K reply | 12.7 | 1,510 ms | 1,174 ms | 31.7 s | 770 ms | 0 | 79 | main: the 60 ms batch timer (14/s), crashsafe's reply copy, safetynet journal |
| Settings open / close ×2 | 3.7 | 420 ms | 312 ms | 4.1 s | 90 ms | 0 | 0 | opens in 66 ms (again 27 ms) |
| Trim Hearth open / close | 2.2 | 200 ms | 193 ms | 1.5 s | 50 ms | 1 (61 ms) | 0 | opens in 69 ms (first load of its group) |
| Command bar ×3 | 5.0 | 240 ms | 156 ms | 2.4 s | 80 ms | 0 | 15 | |
| Switch projects ×6 | 6.1 | 460 ms | 374 ms | 15.2 s | 70 ms | 0 | 0 | |
| Mood board open / leave | 5.5 | 130 ms | 227 ms | 5.4 s | 60 ms | 1 (123 ms) | 25 | first load of the board group |
| Hidden 60 s | 62 | 590 ms | 284 ms | 2.6 s | 60 ms | 0 | 21 | ≈ 280 ms is mem154's one-off trim at 30 s; writes = 3 stores saved on hide |
| **Forgeheart: scroll (40 wheel turns)** | 17.1 | 1,520 ms | **2,694 ms** | **55.4 s** | 210 ms | **5 (194 ms)** | 7 | the list scrolled on the window's thread |
| Forgeheart: stream | 12.8 | 1,440 ms | 1,279 ms | 37.8 s | 640 ms | 0 | 56 | |
| Forgeheart: switches ×6 | 6.7 | 840 ms | 694 ms | 17.3 s | 90 ms | 1 (51 ms) | 0 | |

Memory over the session: the window's renderer 177 → 211 MB (the last chats kept ready out of sight), JS heap 11 →
17 MB, all processes 611 → 798 MB at the peak (4 processes at rest). The start: first paint at 200 ms in the page, 13.6
MB of heap. The window's own JavaScript is ≤ 1 % of every area's profile (stream: 83 ms of native.js in 13 s; switches:
46 ms; Settings: ≈ 20 ms): what's left is Chromium's style / layout / paint and the GPU process.

Disk after the session: the data folder 1.8 MB (the chats 1.46 MB); nothing in it grows without a cap (engine.log
rotates at 2 MB, each store keeps ≤ 10 automatic copies for ≤ 7 days, AI run files go after 10 minutes, asset pictures
≤ 1 GB, ▶ Play builds ≤ 8 / 2 GB, quit notes are one line per stuck quit). The Electron profile: 6.8 MB, of which
5.5 MB is Chromium's new `GPUPersistentCache`.

## Ranked: the biggest wins outside the Lab

| # | What | Owner-visible impact | Measured | Done? |
|---|---|---|---|---|
| 1 | **Every website session's HTTP cache could grow to ≈ 1 GB.** Each persistent session has its own: every web chat (`persist:<agent>`), every app window (`persist:app-<id>`: Meshy, Suno, Figma…), Adobe web, Pinterest pins, the docs and Miro panes, ▶ Play's session. Chromium sizes each from the free disk | disk: several GB over months for an owner who uses a few sites | one session filled with 1,300 MB kept **1,069 MB**; 160 MB fetched in Hearth kept 161.6 MB | **fixed** (80 MB each) |
| 2 | **Forgeheart chats scrolled on the window's main thread** (round 165 left it: Chromium won't composite a scroller over a gradient ground without losing subpixel text) | smoothness in the owner's own look: hitches up to 0.2–0.3 s while wheeling, the wheel waits for a busy window | 2,694 ms of main-thread tasks and 5 long tasks for 40 wheel turns (plain look: 1,207 ms, 0) | **fixed** |
| 3 | **`dev/` ships to every computer** (912 files, 11.3 MB of the 41 MB checkout; plus `docs/upgrades/` 6.4 MB) and every update rewrites what changed there; `.git` is 28.6 MB with 358 versions here (the Windows zip: 50) | disk, update time, Defender scans on Windows | 28 % of the checkout's bytes and 35 % of its files are dev-only | not done: self-edit (HANDOFF "Working on Hearth") runs `node dev/…` checks in Hearth's own folder; `docs/upgrades/` is read by Discover. Candidate: a sparse checkout without `dev/` for owners who never self-edit (an owner's choice) |
| 4 | GPU-process paint cost of dialogs and switches: opening Settings 4.1 s of GPU CPU here, the Mood board 5.4 s, 6 project switches 15 s | on a real graphics card small; on a laptop's integrated GPU, power | software GL makes it 10–50× bigger here | not done: next candidate (what paints the whole window when a dialog opens: its backdrop) |
| 5 | Streaming: the main process 60 ms/s (the 60 ms batch timer, 14 wakeups/s; crashsafe's reply copy 66/min; the safetynet journal), the window 120 ms/s, three app-wide mutation observers (a11y, usage, command bar) woken ≈ 25×/s | CPU while a reply runs | their JS ≤ 10 ms per reply | not worth it (≤ 1 % of the stream's CPU) |
| 6 | Disk calm counts Chromium's new `GPUPersistentCache` (5.5 MB after one session) as "Sign-ins and window settings" | the disk panel's words; it's never offered | 5.5 MB | candidate (needs Electron to empty it while it runs, like the other live caches) |
| 7 | Hidden: one memory trim 30 s after hiding (≈ 280 ms of the window, by design: mem154); 3 stores saved on hide (21 file events with their `.prev` copies) | none | | fine |
| 8 | Memory: renderer +34 MB over a session (the 3 chats kept ready out of sight, ≈ 2 K elements each in these chats), all processes 700–800 MB | memory | as mem154 | fine |

Startup (boot157 / boot160 / main162), the long chat itself (chat165), idle wakeups (perf151, idlecpu) and the main
process (main162) held: nothing new there.

## Fix 1: website caches at most 80 MB each

`main.js`: `app.commandLine.appendSwitch('disk-cache-size', 80 MB)` before the app is ready (unless the switch was
given). Electron applies it to every session's HTTP cache, persistent or not. Pages and code come back by themselves; a
cache that is already bigger is trimmed to the cap the next time that site is used (measured: a 402 MB cache came back
at 72 MB after one visit). Hearth's own window reads files from disk and has no HTTP cache; Lab and ▶ Play pages use
their own protocols (code cache only), untouched. 80 MB is Chromium's own base size, many times a web app's code
(claude.ai's bundles are a few MB).

| | Before | After |
|---|---:|---:|
| One persistent session, 1,300 MB fetched (bare Electron 44.5.1) | 1,069 MB kept | — |
| One persistent session, 400 MB fetched (bare Electron) | 503 MB | **76 MB** |
| An existing 402 MB cache, one more visit | stays | **72 MB** |
| In Hearth: a persistent session fetching 160 × 1 MB (`audit166` check, Disk calm's "Web caches") | +161.6 MB | **+76.6 MB** |

## Fix 2: Forgeheart chats scroll on the compositor

The Forgeheart looks paint their ground on the window: a deep black that darkens a few levels downwards, with faint
see-through lights on it (look.css: the warm light from above and the violet ember low right; forge-skin's grid).
`native.js` now recognises such a ground (`groundOf`): see-through gradient layers over a nearly plain base (a top-to-
bottom gradient ≤ 4 levels deep, or a plain colour), placed and sized as the window. The chat list then takes the base's
colour where the list sits (±1 level) — an opaque box Chromium scrolls on the compositor with subpixel text kept, like
the plain looks since round 165 — and the list's wrap draws the ground's lights over it (`.messages-wrap.tint-back
::before`, chatcore.css), fixed to the window as before (`background-attachment: fixed` on a layer that doesn't scroll).
Judged again on every look change, as round 165's plain colour; any other ground (a picture, an opaque gradient, a
ground not the window's size, a list outside a wrap) keeps the list transparent as before (`list.backWhy` says why).

What changes on screen: the lights now lie over the messages instead of under them. Measured on a 400-turn chat
(screenshots of the chat this way, the old way, this way again): **max 4 levels of 255; 167 of 835,744 pixels (0.02 %)
differ by more than 2 levels**; the rest differ by 1–2 levels (the gradients' dithering, drawn in another layer, and the
base's ±1).

| Forgeheart, a long chat | Before | After |
|---|---:|---:|
| The chat scrolls on the compositor (its own layer) | no | **yes** |
| 30 wheel turns: window main-thread task time (`audit166` check, back to back in one run) | 2,854 ms | **843 ms** (−70 %) |
| …tasks over 50 ms | 4 (wall clock, up to 286 ms) | **0** |
| 40 wheel turns in the session audit: main-thread tasks / long tasks / GPU-process CPU | 2,694 ms / 5 (194 ms) / 55.4 s | **1,598 ms / 0 / 42.6 s** |
| Idle in Forgeheart, 25 s: window / GPU CPU | 10 / 10 ms | 10 / 80 ms (noise level) |
| Plain looks | unchanged (round 165's plain colour, no lights drawn) | same |

The rest of the session audit after the fixes is the same within run-to-run noise (the plain-look scroll, stream,
Settings, switches, board, hidden, memory).

## Next candidates

1. **What ships**: a sparse checkout without `dev/` (11.3 MB, 912 files) for an owner who doesn't self-edit, offered as
   a choice (self-edit needs `dev/`); `docs/upgrades/` is read by Discover, so only its unread files could go.
2. **Dialogs painting the whole window**: Settings and the board cost seconds of GPU-process CPU here on software GL;
   find what repaints the full window when a dialog opens (its backdrop) and whether the same look can stay in one layer.
3. **Disk calm and `GPUPersistentCache`**: count it as a web cache and empty it through Electron while Hearth runs.
4. Per-session V8 code caches (each persistent session keeps one besides its HTTP cache): measure their growth on a
   real owner profile; the 80 MB HTTP cap doesn't cover them.

## Check

`dev/checks/audit166.js` (`node dev/run-checks.js --exact audit166`): a persistent website session fetching 160 MB
of cacheable files from a local server grows Disk calm's "Web caches" by ≤ 88 MB; in Forgeheart a 400-turn chat takes
the ground's base and lights, scrolls in its own layer, matches the old way's pixels (≤ 8 levels, ≤ 3 % of pixels over
2 levels), wheels with ≤ 60 % of the old way's main-thread task time and no task over 50 ms of its own CPU; back in
the plain look no lights are drawn. On round 165 (e122bd74) it fails the cache, base / lights, compositor and scroll
steps. `dev/checks/chat165.js`'s ground step now knows the wrap's lights (it takes them off with the list's colour for
its "the old way" picture, and judges a ground of gradients by the pixels over 2 levels). `dev/smoke.js --serve-dir`
answers `/__bytes/<KB>/<id>` (cacheable for a year) and `/__fill/<n>/<KB>`.

## For Codex

No Codex-owned file was edited. Nothing in them depends on the website caches' size; `.messages-wrap` gains a
`::before` and two inline properties (`--solid-tint`, class `tint-back`) in the Forgeheart looks.
