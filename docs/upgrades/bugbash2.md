# bugbash2 (round 35): bugs in rounds 30–34, and the flaky self-checks, fixed at the root

Rounds 30–34 shipped fast and in parallel. This stream used the app the way the owner does (smoke runner, fake engines,
screenshots), looked hardest where features merged side by side meet (Continue lighter × missions × the meter, Lab
gestures × Fix my scene × Variations, AI setup's folds × Continue lighter, Check this AI × the offline lines), ran the
whole self-check suite, and fixed what failed. Each bug below: what you'd see → why → the fix. App bugs have a
regression in `dev/checks/bugbash2.js` (group `sh dev/run-checks.sh bugbash2`) or a unit test; every one of its
steps fails on the code before the fix.

## App bugs
1. **"Saved" meant "will be saved in a moment".** `hub.kvSet` answered before the file was on disk (the store thread
   wrote it a little later). Anything reading the file itself right after saw the old value: 12 of 12 big saves read
   back at once were stale. The fake engines read their switches from that file, which is why the offline, robust,
   aicheck, firstrun and access checks failed now and then. → `store.js` `writeOff` returns a promise that settles once
   the thread wrote (never rejects); `kv:set`, `chats:save`, `memory:save`, `history:save` answer then.
   `await hub.kvSet(…)` is now a reliable flush; the offline check's file-polling workaround is gone.
2. **Fix my scene's camera fix didn't show while you were looking around.** After a two-finger zoom-out, "Frame it" /
   "Point the camera at it" placed the camera, but the look-around view (an offset on the camera) stayed on top, so
   the subject stayed tiny or off-screen. → In the preview, a new camera placement arriving from the Lab (a fix, its
   undo) drops that layer's moved view (`setLayerProps`, tools/three-sandbox.html).
3. **Looking around into empty space, then Fix my scene → "Ask the director" (tokens) for nothing.** The doctor's
   picture showed the moved view while its scene probe read the scene's own camera, so a black frame caused by the
   view had no local fix. → The doctor reads the moved views; a black frame then says "from where you moved the view"
   and offers **Back to the scene's camera** (Shift+Z), one undo step that puts your view back (`__labGest.goTo`).
4. **A dead switch in ⋯ AI setup › Habits.** "Shrinks long chats by itself" (and "shrinks long chats" in the fold's
   summary, and the agent editor's twin box) did nothing since round 34: nothing compacts silently any more, Continue
   lighter offers instead. → Hidden when Continue lighter is there; its real setting is Spending › "Offer to continue
   lighter". Also: `/fresh auto` skipped every reply over 110k "for the auto-compact", which no longer runs; it works
   there again (chat-fresh.js).
5. **Right after Continue lighter, the numbers still said "long chat".** The ◎ mission estimates ("Answer, then review
   · about 13k tokens") and the meter's "each message sends about 12,099 tokens" kept the long chat's size — in fact
   the cheap summary run's own read — until the next reply, while the chat's pill said ≈ 6k. → Both use the light
   start until a reply comes (swarmlean.js `ctxOf`, meter.js `ctxNow`).
6. **🎲 Variations' "Another angle" showed the same picture six times** on a scene whose camera is placed (📷 Use
   this view, Keep this view, Fix my scene's framing): that placement is re-applied every frame, so camera sliders
   change nothing. → Their camera sliders are left out of the set (zoom kept); the other takes fill in.
7. **"At about 40k toke…"**: the Continue lighter size picker was cut off in AI setup › Spending. → "≈ 40k tokens",
   like the weekly limit beside it.
8. **A precomp's settings had no way in.** Right-clicking a layer showed the simpler menu from round 26, while the
   older menu holding ◫ Precomp › (time, size, crop & mask, effects, open its scene), ◇ Shader ›, ✦ Particles ›,
   🅰 Type › and ⚛ Physics › was built underneath and never seen (the comp check failed on it every run). → The
   layer menu carries the layer kind's own submenu; one menu, not two (tools/three-easy.js, tools/three.js).
9. **Check this AI while offline / busy / at the usage limit blamed your setup.** It said "Didn't answer: API Error:
   529 {…}" and then "Can't read its folder / Can't write / Can't run a command — Open AI setup". → The engine's error
   is read like the chat's calm lines (round 34): "Didn't answer: Claude Code's service is busy right now" (no
   internet, usage limit until 18:00, a VPN…), and the folder lines say "not checked (it didn't answer; check again
   in a moment)". Files Off still says so.
10. **"⇩ Export the grade as a .cube" failed, the effects picker's thumbnails came out empty, the shader workbench
    check couldn't start** ("Error creating WebGL context"). Since round 29 the preview refuses a new WebGL context to
    code from a layer that no longer runs (it judges by the blob URLs in the call stack); the preview's own helper
    renderers are made through the three.js module's blob too, so they always looked like a stale layer. → The guard
    leaves the page's helper renderers alone (the `untracked` mark `trackRenderer` already honoured). The grade,
    labshader and the bugbash2 check pass again.

## Self-checks that were wrong or racy
11. **qa-keys · "Lab · Shift+1 · Frame size: Fit"** (long-failing): the preview starts at Fit, so the key had nothing
    to change. The key works (9:16 → Shift+1 → Fit, probed). The check now presses it from another size.
12. **commands-page · "missing hooks"** (now and then): a lazy group loading at that moment reads its own stand-ins as
    free; the check now lists commands once no group is loading.
13. **comp · "nested: … shows B (blue)"** (now and then): read one shot right after the nested pages were listed (dark
    or still green from the previous step); now waits for the picture to settle. Its "right-click the precomp layer"
    step was real: app bug 8.
14. **declutter**: asserted the old, invisible panel menu's Opacity › / Blend ›; now asserts the one layer menu.
15. **simplify3**: asserts the dead switch is gone and "Offer to continue lighter" is there.
16. **Harness hangs**: a CDP call the page never answered (after a check's time limit) held the run for 30 minutes
    with no log (declutter-count, once). `dev/smoke.js` now ends itself after every part's limit + 5 minutes.
17. **flows · "/flow-make: Claude wrote a flow"** (every run): the fake engine's long-task words (dev/fake-liveness.js)
    matched "quiet" inside the command list Hearth sends with the request, so the fake answered "The contact sheet is
    ready." Hearth's own structured asks are left to the normal fake now. **flows-video · "the chat card ()"**: read
    the card's innerText while the chat sat behind the flow window (visibility: hidden → empty); textContent now.
    **eyes-pins**: swapped in a fake `window.Apps` after the Pinterest app had registered with the real one; it now
    checks the real registry. **labframes-mcp**: help footage's topic sits past the 220 characters a reply line keeps
    (as sequence-mcp in round 29); **labframes-more**: awaited a `done` the render queue hasn't returned since round
    13; now waits for the finished file (150 frames, as before).
18. **unit:eyes-test** (failing since round 31): read the board tool words tokensaver shortened. **unit:labpace-test**
    (now and then): timed the scene signature as one mean on a busy machine; now the best of 6 rounds.

## Found, not fixed (outside this round's features)
- **A screen recording of a still area often ends at its last change** (capture-pack failed 4 of 5 runs: a 7.4 s take
  saved as ≈ 1.2 s). The repaint meant to keep a constant frame rate doesn't reach the encoder, in the worker pump and the
  window pump alike; a standalone canvas with the same calls works, so it is something in capture.js's setup.
  Diagnosis and probes are in the suggested follow-up task ("Fix capture takes of a still screen ending early").
- A message sent with a helper mission (Swarm, Ask everyone…) that fails offline is re-sent as a normal message when
  the internet is back (the retry carries the text; NOTE-type missions like Plan first do carry over).

## The full suite
`sh dev/run-checks.sh all` (281 checks: every Electron check, the three Astra ones, 76 Node tests), each run split in
two because a background job stops after 2 hours; a loaded machine (other streams' runs alongside), software GL.
- **Before** (round 34's main, 687395f): **20 failed**. Real app bugs: grade and labshader (app bug 10), comp's precomp
  menu (app bug 8). Stale or racy checks: qa-keys (Shift+1), commands-page, flows, flows-video, eyes-pins,
  labframes-mcp, labframes-more, pinboard, progress, particles, qa-ui (its header eval never ran), unit:eyes-test,
  mission-tokens (a measurement listed as a check). Flakes, passed on a re-run: reach-open, declutter-count (the harness
  hung 26 min), comp's nested picture. Not fixed: capture-pack (below). Environment: unit:devreport-test needs a
  checkout with history (the suite ran from an exported copy; it passes in the worktree).
- **After** (this branch): the first half ran on 1d51011 and failed only on things fixed right after (bugbash2's own
  thumbnail probe, particles, pinboard, mission-tokens), each re-run green; the second half on 6ee84e3: 139/141, the two
  being seqguard-swap (passed on its re-run) and unit:devreport-test (no history in the exported copy). capture-pack
  passed in this run (5.8 s kept) but failed 4 of 5 other runs today: intermittent, see below.
- Also run on the worktree: qa (6/6, qa-keys included), unit (76/76), the bugbash2 group, comp, declutter, simplify3,
  scenedoctor and labgestures.

## For the patch notes
- Fix my scene and looking around now work together: a camera fix shows as made even after you zoomed or turned the
  view, and a black frame you caused by looking away is fixed with "Back to the scene's camera" (no tokens).
- Right-clicking a precomp layer shows ◫ Precomp › again (its time, size, crop & mask, effects); shader, particles,
  type and physics layers get their own submenu there too.
- ⇩ Export the grade as a .cube works again, and the effects picker shows its little previews again.
- 🎲 Variations no longer offers "Another angle" takes that look identical when your scene's camera is placed.
- Right after "Continue lighter", mission estimates and the token meter show the lighter size straight away.
- ⋯ AI setup › Habits lost a switch that did nothing ("Shrinks long chats by itself"); Spending's "Offer to continue
  lighter" is the real one (and now reads "≈ 40k tokens" in full).
- Check this AI says "no internet" / "busy right now" / "usage limit until …" in plain words instead of blaming your
  file setup.
- Behind the scenes: saves are confirmed on disk before Hearth moves on, and the self-checks that failed now and then
  were fixed (reasons in docs/upgrades/bugbash2.md).
- Caveat: tested on a headless Linux machine with simulated engines; a still-screen recording can still end early
  (being looked at separately).
