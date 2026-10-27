# coldopen73: the first project of the day opens fast, and a long project chat opens at its end (round 73)

Round 72 (projects72) left two things: the **first project opened after Hearth starts** took ≈ 1.1–1.7 s of Hearth's
own time (budget 800 ms), mostly the Lab's first mount and its first slider scan; and **a long project chat's first
open** drew at its top, woke 20 older messages there and stayed in the middle of its history. Both are fixed. Project
switches got lighter on the way.

## How it is measured
`BIGPROFILE70=1 node dev/run-checks.js --exact projects72` (fixture `dev/bigprofile.js --projects 40`; by hand:
`node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 600000 --eval 'window.PJ_REPORT=1' --script dev/checks/projects72.js`).
Same budgets as round 72: Hearth's part of opening < 800 ms (cold and warm), of switching < 600 ms (the slowest of the
3 projects, best of 3), Desk < 150 ms, the files shelf < 150 ms. "Hearth's part" is the wall minus the new scene's own
drawing and warm-up in its page (software GL here).

What changed in the check (`dev/checks/projects72.js`):
- **It now has a session before the measured one.** Part 1 opens Clink once and goes back to Projects; then Hearth
  starts again (`//@@ reload`: everything read back from disk) and part 2 is the old check. Its "cold open" is now the
  first project opened **after a restart**, like the owner's, who always has a project they were in. The very first
  open of a fresh profile is still reported (`open.firstEver`), without a budget.
- Before the cold-open click it waits (≤ 20 s) for the Lab to have mounted out of sight (see 1) and reports it.
- **The long chat's first open is checked:** while Clink opens, its chat may not wake any resting block of older
  messages, and once open it has to be at its end (`open.chat`).
- Each open reports where Hearth's part lies: before the scene's code starts in its page, after it drew, and when each
  loading stage showed (`split`).

## Numbers
This machine: Xvfb, software GL, a shared 4-CPU box with other agents' checks running (load 3–5 the whole time), so
single numbers swing a lot. **Before** = round 72's main (3790ef2) measured with this round's check (3 runs);
**after** = this branch (7 runs, 3e53053, the same check).

| | before (3 runs) | after (7 runs) |
|---|---|---|
| **first project opened after a restart**, Hearth's part | 1,465 · 1,483 · 1,340 ms (0/3 under 800) | **218–303 ms, median 277** (7/7) |
| the same, whole wall (scene drawing in software GL included) | 3.5–5.4 s | 1.7–3.4 s |
| the same without the out-of-sight mount (2 runs, `labboot.mount = 0`) | | 1,325 · 1,078 ms |
| **long chat's first open** (Clink, 700 messages) | 40 drawn at its top, then 20 older woken (33 → 32 resting blocks), 60 drawn | **40 drawn once, at its end** (7/7) |
| switch with the name ▾, slowest project (best of 3) | 772 · 807 · 759 ms (0/3 under 600) | 380 · 491 · 500 · 397 · 645 · 555 · 588 (6/7) |
| switch, before the new scene's code starts (best runs) | 221–658 ms | 131–418 ms |
| warm open from Projects (best of 2) | 512 · 487 · 621 ms | 560 · 879 · 479 · 452 · 528 · 529 · 1,985 (5/7) |
| Desk paint | 47–82 ms | 50–66 ms |
| Desk › Project files opened | 130 · 189 · 134 ms | 217 · 218 · 102 · 115 · 254 · 259 · 121 (3/7) |

**Budgets, honestly.** The two things this round was for pass every run: the cold open (from ≈ 1.4 s to ≈ 0.28 s of
Hearth's time) and the chat landing at its end. Switching passes 6 of 7 (it failed every run before). But "all budgets
in one run" passed in only 2 of the 7 runs, because of two measures this round didn't touch:
- **Desk › Project files** (budget 150 ms) is a 3–17 ms script (round 72's profile, and again here); the rest of the
  wall is waiting for the next frame while the whole Desk (≈ 1.4 M pixels) is rasterized in software on a busy box.
  It swings between 100 and 300 ms on both sides (before 130–189, without this round's idle mount 123 · 263).
- **The warm open** (budget 800 ms) reloads the preview page on purpose (Codex's rule: nothing stays loaded behind
  the Projects page); the page load in software GL is most of its "before" part (310–750 ms). Its two misses were a
  879 ms run and one 1,985 ms run where the page's own warm-up stalled behind other checks on the box.
Without the files shelf, 4 of the 7 runs (5 of 9 counting two more runs of the same code) passed everything.

## What was changed
1. **The Lab mounts out of sight after the start when a project is likely** (`tools/three-boot.js`, `mountSoon`). After
   the start, the Lab's preview page is already warmed for the scene it will open (round 37, LabBoot). Now, when the
   last thing the Lab showed was a project's scene (the newest project return point, from the last 14 days, names the
   Lab's current scene), the Lab itself mounts in an idle moment once that page has drawn: its UI, the scene's sliders,
   the page taken over. It opens the scene it would open anyway, nothing on screen changes, and the page sleeps while
   the Lab is hidden. The project's moodboard and desk code load then too. Opening the project then finds its scene in
   the Lab, drawn: the first open after a restart costs what a switch costs. Not done on battery or when the Lab wasn't
   used lately (LabBoot's rules); never shown in 15 minutes (no project opened, the Lab never visited), its page is let
   go as LabBoot's would have been. Tests: `localStorage['labboot.mount']` = '0' never, '1' always.
2. **A first mount opens the project's own scene** (`ThreeLab.cmd({ sketch })`, from `ProjectWorkspace.open`). Without
   the idle mount (a fresh profile, another scene last open), opening a project mounted the Lab with the scene last
   open in the Lab, ran it and scanned its sliders, then switched to the project's scene: two runs, two scans, and the
   page loaded twice. Now the first mount opens the project's scene directly.
3. **Slider scans are kept per scene version** (`tools/three-tweaks.js` `scan`): the sliders found in a layer's code are
   remembered by the code itself (the newest 40, up to ≈ 2 M characters), so a project switched back to, a layer run
   again with the same code, or the idle mount's scan of the project's scene, read the code once. Each caller gets its
   own copy.
4. **A long project chat's first open lands at its end, in one pass** (`native.js`). Two draws met there: the chat was
   drawn (at the start, or a moment before), then moved into the project's tool and drawn again "keeping its place".
   The move puts a list's scroll back at its top, and the second draw kept that top: it also read the whole list's
   size to do so (a forced layout of the long chat, ≈ 250 ms in the cold-open profile), and older messages then woke
   there. Now a draw whose place is still due (a fresh draw whose frame hasn't come yet, a list that was out of sight
   when it was placed, a following list just moved) places it at the end, reads nothing, and stays a redraw.
5. **A project opening asks for no cross-fade pictures.** Its loading card covers the Lab, but the scene swap still
   took a picture of the old scene to fade from (every layer read back from the GPU), and the chat switch asked the
   preview for a picture too, plus a compositor capture (`chat-scenes.js` `snapNow`): the preview page was busy encoding
   them in front of the new scene. Both are skipped while a project opens (`tools/three.js` `plainSwap`).
6. **A scene closed by a project isn't saved again when the next project's chat opens its scene**
   (`ThreeLab.scenes.open`): round 72 made closing save only what changed; the chat's scene switch right after still
   stamped the closed scene "updated now" and rewrote every scene (all scenes, MBs, to disk and sync) on each switch.

## Files
- Changed: `tools/three-boot.js` (mountSoon), `tools/three.js` (`cmd({ sketch })` / first-mount hint, `plainSwap`,
  `scenes.open` without a second save), `tools/three-tweaks.js` (scan kept per code), `native.js` (`render` place due,
  `mount` marks a moved following list), `chat-scenes.js` (no picture while a project opens),
  `project-workspace.js` (Codex's: one argument), `dev/checks/projects72.js` (restart part, chat probe, splits).
- Tested (app checks under `flock /tmp/hearth-run.lock`, a throwaway copy, fake engines): projects72 (opt-in, 7 runs
  plus 2, numbers above; base 3 runs; an ablation without the idle mount, 2 runs), projects, project-workspaces,
  project-continuity, chatwindow72, lazy, unit:boot-test (first screen 2,043 / 2,050 KB).

## For Codex
One small edit in your file, marked `(round 73)`:
- `project-workspace.js` `open()`: `ThreeLab.cmd({ show: false, sketch: options.sceneId || returnPoint(id).sceneId ||
  p.workspace.sceneId })`. `sketch` only matters when the Lab isn't mounted yet: its first mount opens that scene
  instead of the one last open in the Lab (a scene that isn't there is ignored, the Lab opens as before). Your
  `prepare()` then finds its scene current and only waits for its first frame.
Things you may notice:
- `ProjectWorkspace.state().phase === 'opening'` is now read by `chat-scenes.js` (no picture) and `tools/three.js`
  (the swap without a cross-fade). If you rename the phase, those two fall back to the old behaviour (pictures taken).
- The Lab may already be mounted (out of sight) when the first project opens, and its page already running that
  project's scene. Your rule (nothing loaded behind the Projects page) is unchanged after a project closes: leaving
  still releases the page. At the start, the warm page that LabBoot already kept is what the Lab takes over; if no
  project is opened and the Lab is never shown, it is let go after 15 minutes, as LabBoot's was.
- Not done (your call): a preview page warmed while the pointer rests on a project card would take most of the warm
  open's page load off (310–750 ms here), but it would keep a page behind the Projects page for a moment.
- For the chat stream (chatsteady73): `usage.js`'s debounced save (≈ 70–100 ms with the fixture's 900 KB store) still
  lands inside project switches here.

## For the patch notes
- **The first project you open after starting Hearth opens much faster.** Hearth now gets your last project's scene
  ready in the background while you're doing something else, so clicking the project only has to show it.
- **A long project chat now opens at its latest message**, in one go, instead of opening in the middle of older
  messages.
- **Switching projects is a bit quicker**: Hearth no longer takes pictures for a fade nobody sees behind the loading
  card, and no longer re-saves the scene you just left when nothing changed in it.
