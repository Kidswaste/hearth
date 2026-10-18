# Round 62: fixes62 (a steadier shadow choice under Getting ready, gcchurn60's last three rewrites, Codex's checks)

## 1. shadowready's flaky "Lab scene, warm" step

### What was wrong
shadowready's warm Lab-scene step ("the chosen size and the one below it made and sealed") failed now and then on main,
and every time with gcchurn60's three held-back rewrites in. The warm ▶ Play's A/B under the card read the remembered
1024² at 22–33 ms a frame (cold, the same size: ≈ 8 ms), so it walked down to 512², the game's own size, and made no
smaller fallback.

### The cause (measured, not guessed)
Each of the A/B's counted frames was split into "draw" (CPU) and "wait for the GPU" (readPixels), with timestamps:
- The draw stays under 1 ms. **All the extra time is the wait**: the GPU process was busy with other work and each
  synced frame queued behind it.
- It happens in **the first ~0.5 s of every A/B** (cold too: its first frames at 2048² read 55–68 ms instead of ≈ 46),
  plus a lone 25–40 ms spike about once a second after that. An empty sync (nothing drawn) took 5–28 ms in that
  window and < 3 ms after it.
- The A/B starts the moment Getting ready's card steps its bar to 99 % (a 0.3 s transition over the whole 3200×2000
  window), right after the warm-up's frames. A cold run spends that window on the helpers' on/off blocks, so its
  shadow walk is timed later, when it's calm. A **warm run** reuses the helpers' verdict, so the very first frames
  it draws are the remembered size's check: in exactly that window.
- Not a compile, upload, GC or context loss (0 compiles / uploads, no loss, draws < 1 ms). gcchurn60's rewrites only
  shifted the timing of the page's own code by a few ms, which is why they tipped it into failing 6 of 6.
- Then the rules made one noisy reading final: the quick check failed (median of 3 frames, all in the burst), the walk
  measured 1024² again inside the burst (16 ms, just over 15), 512² fitted, and 512 was chosen with no second look,
  even though readywalk's own rule (shadowHolds: a size that fitted before holds up to 1.25 × the refresh's 90 %)
  would have kept it.

### The fix (tools/playbudget-page.js; nothing changes while playing)
1. **Settle before timing.** Before the A/B's first timed frame: the page's finite animations end (≤ 600 ms; a game's
   endless ones don't count), two frames are shown, and the graphics card answers an empty sync in < 3 ms three
   times in a row (≤ 1.5 s). Here that takes 0.2–0.5 s; a real card answers at once (~50 ms). `ab.settleMs`, `ab.probes`.
2. **A size is read by the calmer half of its frames** (`Rules.calm`: the median of the faster half) for the walk's
   sizes and the remembered size's quick check. Outside work only ever adds time, and its bursts outlast a 3-frame
   block; a size's own draw is the same work every frame, so a real cost can't hide (2048² still reads ≈ 46 ms).
3. **No stepping down on one noisy reading** (`Rules.shadowRecheck`): before the walk settles below a size that only
   just missed (≤ 1.25 × the fit) or below the remembered size that still holds by shadowHolds, that size is drawn
   once more after a settle, keeping its calmer time. After the walk, the remembered size whose calmest reading holds
   by shadowHolds is kept ("confirmed"). A warm run no longer drops from 1024 to 512 (no fallback) on one reading.
4. `ab.shadowLog` keeps the walk's counted frames ([phase, ms since start, ms], ≤ 64, under the card only), so a slow
   reading can be told from a slow size afterwards.

### Measured (Lab scene, 60 Hz, 1600×1000 at 200 %; all under the run lock)
| | before (base 0b67d54 + the three rewrites) | after |
|---|---|---|
| warm A/B, 1024² frames in the first 0.5 s | 25–33 ms (draw < 1 ms, the rest waiting on the GPU) | timed after the settle: 7–19 ms |
| warm quick check of the remembered 1024 | 28–31 ms → not held → walk → 512 (fails) | 9.2 / 9.3 / 18.5 / 11.0 ms → held, "confirmed", not walked |
| warm chosen size / fallback | 512 / none in 1 of 2 runs with the rewrites (the other walked back to 1024 by luck); base 1 run: walked, 1024 | 1024 / 512 sealed, 8 of 8 runs |
| shadowready runs | base 1 / 1; with the rewrites 1 / 2 (gcchurn60 saw 0 / 6) | 4 / 4 (fix without the settle probe, rewrites in) + **4 / 4 (final code)** |

## 2. gcchurn60's three rewrites put back
`gamelook-preload.js` (render(scene, camera) passed on with `call`), `tools/three-sandbox.html` (the merged-layer frame
queue by index; the shadow gate's kept signature function): commit dae73f6 reverted. With them: shadowready 4 / 4,
**gcchurn60 pass twice: ▶ Play 174 / 171 B a frame of Hearth's own (budget 256), Lab 914 / 687 B (budget 1,024)**,
self-tests caught (1,006–1,010 B / 1,553–1,721 B). The Lab figure moves within this machine's noise band (gcchurn60
itself read 670–1,136 B); the three rewrites are the ≈ 100 B a frame gcchurn60 measured.

## 3. Also fixed (coordinator's requests)
- **weekquest.js** read `WeekQuestCore` / `QuestHudCore` when the file ran. In the app it can't run first: its lazy
  group has `after: ['questhud']` and `Lazy.load` waits for that group. Only `dev/lazy-manifest.js`'s old-order
  recording put it ahead (later groups at the same `at: 'offline.js'` are inserted first), so it threw there. It now
  reads both cores when used (a small proxy). `node dev/lazy-manifest.js`: no error, every list unchanged.
- **creative-vstmain.js:229** (parkjam62's park save): the file-name check accepts `.WAV` / `.MID` / `.JSON` too
  (`/i`); `unit:winmac-test` 609 / 609.

## Tests (app checks under `flock /tmp/hearth-run.lock`, ≤ 5 a hold)
- shadowready ×4 (final code + rewrites): 4 / 4 pass; ×4 earlier variant: 4 / 4.
- gcchurn60, readyspeed, ctxloss (`--burn 3`), gamelook: pass. playbudget: one timing step failed once ("the next ▶
  Play … at off speed": 0.55 vs 0.38 ms, the look off — the same step ctxloss58 saw fail once); passed on its re-run.
- After merging claude/intelligent-galileo-yaiqem (372e11a): gcchurn60, playbudget, shadowready, lazy, unit:boot-test
  5 / 5 pass.
- labplay55, lazy, unit:boot-test, unit:shadowready-test (+ a new group: calm / recheck), unit:playbudget-test,
  unit:winmac-test, unit:parkjam62-test, unit:weekquest-test: pass. `node dev/lazy-manifest.js`: clean.

## Risks
- The settle adds 0.2–0.5 s to the A/B on this software GPU (≈ 50 ms on a real card), under the card only.
- `Rules.calm` reads a size a little more optimistically than a median. If a size is chosen that is a bit slow in play,
  the guard swaps in the fallback made under the card (a pointer swap, no hitch) — the cheap direction to be wrong in.
- The shadow gate's kept signature function keeps the last scene it looked at in `shScene` (the renderer's gate keeps
  it too, so nothing extra lives on).

## For the patch notes
- **▶ Play picks your shadow size more reliably.** On the second play of a Lab scene, a busy first half-second of the
  graphics card could make Hearth think the sharper shadows didn't fit, and it dropped to the game's own, blurrier
  ones. It now waits for the card to calm down before measuring, and gives a near miss a second look.
- Shadows chosen once stay chosen: a remembered size is only lowered when it's clearly too slow, not on one noisy frame.
- Hearth's own memory churn while you play is a little lower again (the last three small savings from round 60 are back).

## For Codex
Five check failures in Codex's areas, run on 0b67d54 (dev/checks/quest-*.js, appcalm). Nothing of Codex's was edited.

1. **quest-field "favorite keeps keyboard focus after saving" — the app is wrong.** `tools/quest-journal.js:126`:
   `button()`'s click handler sets `b.disabled = true` before awaiting the action. Chromium (Electron's Chrome 152 here)
   moves focus to `<body>` when a focused button becomes disabled (probed: focused → disabled → 50 ms later
   `activeElement` is BODY). So at `render()` (`:222`) `root.contains(document.activeElement)` is false, `focused` is null
   and the new "Remove favorite" button (`:425`, focus key `map-favorite-place`) never gets focus back. Keyboard users
   lose their place after every icon action. Suggested fix: remember the key before disabling, e.g. in `button()`
   `const key = b.dataset.focus; if (b.contains(document.activeElement) || document.activeElement === b) pendingFocus = key;`
   and in `render()` `const focused = (root.contains(document.activeElement) ? document.activeElement?.dataset.focus : null) || pendingFocus; pendingFocus = null;`
   (or use `aria-disabled="true"` + an in-flight guard instead of `disabled`).
2. **quest-journal "Button available: Open quest journal →" — the check is stale.** The button left the Creative
   Playground's quests card in 358f63b ("Focus creative tools…"); `quests` is no longer a Playground feature
   (`tools/creative-core.js:7`, `openFeature('quests')` falls back to the worktable). The way in now is the header's
   "✦ Quest journal" (`tools/creative-playground.js:38`). Fix `dev/checks/quest-journal.js:44`:
   `await press('✦ Quest journal', document.querySelector('.cp-heading'));` (drop the `openFeature('quests')` call).
3. **quest-proof "Button: Save toward this" — the check is stale.** d482222 turned the reward goal into an icon button
   (`tools/quest-journal.js:637`, `mapIcon('star', 'Save toward this', …)`: the name is only in `aria-label`).
   `dev/checks/quest-proof.js:8`'s `press` matches `textContent` only. Fix: match the label too, as quest-workstation does:
   `.find(b => b.textContent === text || b.getAttribute('aria-label') === text)`.
4. **errorcalm-scan — the app is wrong (raw `err.message` on screen).** `node dev/errorcalm-scan.js`: 7 new places:
   `tools/quest-journal.js:694, 711, 712, 918, 926, 927` (`pre.textContent = e.message`, `feedback.textContent = e.message`)
   and `tools/outing-desk.js:65` (`warnings.textContent = err.message`). Fix each with `calmError(e)` (ui.js), e.g.
   `feedback.textContent = calmError(e)`. **tools/workbench-vst.js** does the same through `say(err.message)` at
   `:49, 113, 127, 133, 134, 135, 148, 154` (`say` = `tools/workbench-ui.js:7`: the status line's `textContent` and a
   notice): the scan doesn't see `say(` as a sink, but the owner sees the raw text. Fix: `say(calmError(err))`. Also
   `tools/quest-journal.js:126` `notice(err.message || …)` → `notice(calmError(err))`.
5. **appcalm, one control over budget everywhere — the check is stale by Codex's own choice.** `tools.js:15–20`
   (7dd75aa) promotes Sidequest Studio into the rail once, on purpose (the owner uses it daily), so the rail has 13
   controls (budget 12) and every counted state is +1 (start 25 / 24, reply 23 / 22, …). Either raise the budgets by
   one in `dev/checks/appcalm.js:24–25` with a note ("round 61: Sidequest Studio in the rail, 7dd75aa"), or, if the rail
   must stay at 12, move another rarely used tool to the rail's ⋯. Our recommendation: raise the budgets.
