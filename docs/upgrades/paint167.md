# Round 167 · paint167: dialogs and switches draw less

Round 166's audit (#4) found that opening Settings cost 4.1 s of the graphics process' CPU on this box, the Mood board
5.4 s and 6 project switches 15 s. This round found why, cut what could be cut without changing a pixel, made Disk calm
offer Chromium's graphics cache (#6), and fixed the idle-CPU check that had failed since round 165. The Lab, Scenes v2
and Codex's files were not touched.

## Why the graphics process was busy

Measured with Chromium's traces (the graphics process' own events, paint and layer invalidations), the layer tree and
the window's CPU, on this box: 4 shared CPUs, software GL (SwiftShader), Xvfb 1480 × 940.

- **Every frame redraws the whole window here.** With software GL there is no "redraw only what changed": a frame
  that changes one 3 px dot cost the graphics process ≈ 60 ms of CPU, a frame with Settings open ≈ 105 ms. An action
  costs its frames × what each frame draws, plus drawing (rasterising) the new content once.
- **It was not big repaints, blur or layout.** Dialogs and menus already had no backdrop blur (round 51); the window's
  own paint was 1–7 ms per action; style and layout ≤ 30 ms; the window's JavaScript ≤ 1 %. The DOM of a switched-to
  chat is already kept (round 45: the last chats wait out of sight), so a switch re-uses it.
- **What made each frame dearer than it had to be: layers kept for entrances that had ended.** The open surface (the
  chat, the board…), every dialog and its backdrop, the board's empty card, open menus and their items, Ctrl/⌘+K's card
  and a few others ease in with a short CSS animation that filled `both`. Their keyframes are a `from` only, so the end
  is the element's own style either way; but a forwards fill that changes nothing never invalidated the element's
  style, so Chromium never dropped the GPU layer it had made for the animation. The open surface (1148 × 884) stayed a
  layer of its own for good and was drawn again in every frame afterwards, Settings' dialog and backdrop the same.
  Measured: one frame in a chat 62 → 45 ms of graphics-process CPU with those layers gone, with Settings open 105 → 72,
  on the board 85 → 70.

What stays: on software GL an entrance keeps the graphics process busy for as long as it moves (it draws frames as
fast as it can), and a newly shown chat or dialog must be rasterised once. Those are the look itself (the entrances'
motion) and Chromium's own work; they'd need visible changes (shorter or no entrances), which this round didn't make.

## The fix: entrances fill backwards

`animation-fill-mode` `both` → `backwards` on the entrances of things that stay on screen: polish.css (the open
surface, dialogs and their backdrop, menus and their items, the slash menu, Ctrl/⌘+K's card, the flyouts, key hints,
the keys sheet), polish8.css (the board's empty card, its search, its compare bar), polish8-board.css (the quick bar),
polish8-capture.css (the capture tip), forge-skin.css (the last message while it streams), swirl-skin.css (the last
message), quickstart.css, speed.css, localanswers.css, look-juice.css (their cards and tip). `backwards` still holds
the `from` frame during a delay (the staggered menu items), and at the end the element is back to its own style, as
before; now its style changes at the end, so the layer goes. The exits (`hx-reveal`, `*-out`) keep `both`: their end
is not the element's own style. Scroll-driven fades keep theirs.

Same pixels, measured (`dev/checks/paint167.js`): the chat and Settings open this way and the old way (the old fill put
back, the entrance played again) differ by at most 1 level of 255 (Settings' dialog: its shading rounds 1 level
differently once it's no longer a layer of its own); the chat's scrollbar thumb, which the old way drew on its own
layer by another path, came out 1–3 px longer there (34 pixels).

## Before / after

One frame's graphics-process CPU (`paint167` check, this way and the old way in turn, twice, same run):

| One frame (a 3 px change) | Before | After |
|---|---:|---:|
| A chat | 62 ms | **45 ms** (−27 %) |
| Settings open | 104 ms | **72 ms** (−31 %) |
| The Mood board | 85 ms | 70 ms (−18 %, `exp` runs) |
| 17 letters typed in the chat box (one every 250 ms) | 1,080 ms | **860 ms** (−20 %; −29 % in another run) |

The actions, as round 166's audit does them (`paint167` check, same run, in turn, average of 2 each; the window's
main-thread task ms after the arrow):

| Action | GPU-process CPU before → after | Window main thread before → after |
|---|---:|---:|
| Settings open / close ×2 | 3,190 → **2,860 ms** (−11 %) | 213 → 212 ms |
| Settings opened once (6 runs, 1.2 s) | 1,540 → 1,400 ms (−9 %) | |
| 6 project switches | 7,030 → **6,310 ms** (−10 %) | 387 → 373 ms |
| Mood board open / leave | 2,300 → 2,700 ms (**+17 %**) | 64 → 68 ms |
| All three | | **−6 %** |

The board got dearer: when its surface's entrance ends, the surface's layer now goes, so its content is drawn once
more into the window's own layer (one rasterise of the board after each surface switch). Opening the board is rare and
that cost is once per switch; the saving is on every frame while you're in a chat, a dialog or the board.

The session audit's own fixture (`dev/audit166-measure.js` without its scroll / stream / hidden parts; 400-turn chats
with pictures; a copy of round 166 vs this branch, two runs each): Settings 8.3 → 8.2 s, switches 17.3 → 17.0 s, board
5.6 → 5.4 s; window main thread 248 → 242 / 432 → 368 / 188 → 165 ms. Within run-to-run noise: there the graphics
process is saturated for the whole of each action (≈ 2.5 CPUs), so cheaper frames can't show as less CPU; it shows
where frames come one at a time (typing, a hover, a blinking caret, a streamed piece on a less busy box). On a real
graphics card nothing saturates and every frame simply draws one full-window layer less.

## Disk calm: Chromium's graphics cache

`GPUPersistentCache` (5.5 MB after one session here; Chromium's graphics process keeps what it compiled to draw) was
counted under "Sign-ins and window settings" and never offered. It's now its own part, **Graphics cache** (group
"caches", rebuilt by itself), with Free up. The graphics process holds it open while Hearth runs, so Free up leaves a
note in the profile (`.hearth-empty-gpu-cache`) and the next start empties it in main.js before the graphics process
starts (`DiskCalmCore.emptyGpuCacheAtStart`): only that folder and the note. The row then says "At next start";
the toast and `/disk free gpucache` say so in words. Nothing is ever freed by itself (the calm tidy doesn't touch it);
sign-ins, cookies and local storage stay in "Sign-ins and window settings", untouched.

## idlecpu: the check, not the app

`dev/checks/idlecpu.js` failed since round 165 on its chat step: it measured idle 7.5 s after the test's own reply, while
that reply's after-effects were still happening (the progress bar's ✓ fading, juice's sparks, "This chat is in Earlier
chats" leaving at 7 s: 3.3 wake-ups a second counted, over the 1.5 budget). The chat step now waits for them to settle
(`settle`: no notification, progress bar or ✓ dot on screen, then 3 s without a DOM change; at most 30 s, and it says so
when it doesn't settle) before counting. The budgets are unchanged. Every notification the run shows is listed with when
(`toastLog`), and each setup with its time span. Codex's app catalog (`codex-capabilities.js` `Catalog.fetch`, its
5-minute close timer) is reported on its own line ("For Codex: …") and not counted against the main process' timer
budget; in this run it didn't fire.

## Check

`dev/checks/paint167.js` (`node dev/run-checks.js --exact paint167`; group `paint167`): no layer kept for an ended
animation (chat, Settings, board); the same pixels either way; one frame ≤ 85 % of the old way in a chat and ≤ 90 % with
Settings open; typing ≤ 90 %; the three actions reported, failing only on a regression (> 115 % of the old way
altogether). `dev/checks/diskcalm.js` and `dev/diskcalm-test.js` cover the graphics cache.

CHECK-RESULTS

## For Codex

No Codex-owned file was edited. `codex-capabilities.js:50` (`Catalog.fetch`'s `finally` sets a 5-minute close timer each
fetch; the catalog is re-read on demand when older than 60 s) wakes the main process 3.5–5.5× a minute while Codex reads
its catalog: worth one timer per connection instead of one per fetch. idlecpu now reports it on its own line.

## Next candidates

1. The Forgeheart lights layer (round 166: the ground's lights over a compositor-scrolled chat) costs ≈ 25 % of each
   frame in a Forgeheart chat (59 → 44 ms without it, here). Drawing them into the list's own layer would keep the
   compositor scroll without the extra layer, if Chromium can be made to keep LCD text there.
2. Settings in the Forgeheart look: a frame costs ≈ 115 ms (plain: 72); its dialog is a scroller on its own layer with
   two more layers over it (an `::after` and a section, "Overlap").
3. Raster of a newly shown chat (the bulk of a project switch on software GL): measure the tiles Chromium rasterises
   beyond the screen and whether the kept chats could keep theirs.
