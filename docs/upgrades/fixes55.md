# fixes55 (round 55): the restart-time update, a flaky check, lazy helpers, ▶ Play's hooks

## Shipped
### Updates on Windows (finished as Hearth restarts)
1. **The restart-time update puts your things back as safely as the live one.** When Windows held files open, the
   update finishes at the next start (`updatesafe-core.js` `swapSync`). It still had round 53's restore: one clash and
   your `config.json` (agents: the Lab's Three Director, so its chats) and `theme.css` stayed in the stash until the
   next start. Now both places use ONE restore (`restoreSteps`, driven sync at the start and async by `updatermain.js`).
2. **A write during the merge is kept apart and merged, your values winning**: it goes in its own named stash ("written
   while the update ran"), your edits come back, and `config.json` gains what that write added (`bringConfig`).
3. **On a clash your own files win**: `config.json` = the update's file + your agents and values (the update's new
   keys added around them, also inside a section: `layout.compact` stays), `theme.css` = your CSS. Other clashing
   files keep the update's version (no conflict marks). The stash stays, named, and the note says it in plain words.
4. **A stash is ours before it's used**: after `git stash push`, stash@{0} must carry our name (a "no local changes"
   would have left someone else's stash on top, later applied and dropped as yours). Never dropped unless back whole.
5. **A failed restart merge** (history moved) puts your edits back the same safe way (it used to leave conflict marks
   when the apply clashed).
6. **The restart never blocks Hearth's start**: `startSwap` catches everything; git not found (Windows' Program Files
   Git, the Mac's Homebrew are now looked for) → the staged update waits for the next start instead of being dropped.

### Checks
7. **gameready "no encoder → the install command shown"**: a check race, not an app bug. Measured (new `diag` info):
   the card shows the command with Install ≈ 21 s after Optimize (it first compresses the 4K picture without gltfpack;
   evals waited up to 9 s behind the page's own work); the check waited 20 s. It now waits as long as the card itself
   answers an Optimize (2 minutes).
8. **Lazy groups list their helper globals**: lab (LayerGroups, LabGroups, ThreeModelsCmds, ThreeCrew, TypeData,
   TypeLyrics, LabType, LabShapesHook, LabPacksHook, AutoEditCore, AutoEdit, LabTemplatesHook, LabBatchHook), capture
   (CaptureCmds), chrome (ChromeViewCore): touching one before its group loads now loads it. The 16th (`OUT` in
   tools/three-frames-templates.js) is a local of an IIFE, not a global: `dev/lazy-groups-test.js` no longer counts an
   IIFE file's column-0 consts (0 warnings now). The lazy manifest was regenerated (unchanged).

### ▶ Play's scripts in the game window never break the game
9. **gamelook-preload.js**: the add / attach hooks note what's added inside a try (the game's add always returns);
   render / compile / initTexture hooks and the devtools listeners can't throw into the game's constructors.
10. **tools/gamestream-page.js**: the render hook runs the game's render exactly once whatever Hearth's look meets (a
    throw lets held objects go, a sliced upload finished first: never shown half uploaded); fetch / XHR logs, img.src,
    the decoded-picture hand-off (a throw there used to leave the `<img>` never loading, as an unhandled rejection the
    game's error list showed), the WebGL upload hooks (the swap undone) and add / attach are all guarded.
11. **tools/gameaudio-page.js**: decodeAudioData falls back to the browser's own decode when Hearth's fingerprint /
    cache throws, or when a pre-decode of the same bytes failed (the game's decode says why, not Hearth's); the
    AudioContext constructor's notes, play(), suspend / resume and the hidden-window rest are guarded.
12. Swept labsmooth54's changes (chat-scenes / three.js thumbnails through `canvasDataUrl`, the folded editor, the
    one-timer scrub nap, keyed-only knob loop, after-frame visibility asks, the meter pill): no bug found; the
    after-frame asks just wait while the window is hidden (rAF resumes them).

## Tests
- `node dev/labchats54-test.js` gains section 5 (the restart path: a clash on config.json + theme.css, no clash, a
  write during the restart merge, a failed restart merge, git missing). With round 54's files (`--from`) 7 steps fail.
- New `node dev/gamehooks55-test.js` (`unit:gamehooks55-test`): the three page scripts in a vm, each hook meeting
  something that throws. With round 54's scripts 9 steps fail; all pass now.
- unit: boot-test, winmac-test, datasafe-scan, errorcalm-scan, labchats54-test, updatesafe-test, updater-test,
  lazy-groups-test all pass. Browser checks: gameready (290 s, every step incl. no-encoder: the answer came at 39 s
  this time), gamestream, gameaudio, lazy pass; gamelook passes alone (with three other checks at a load of 13 on 4
  CPUs its "frame time not worse than off" step read 83 vs 100 ms at ≈ 12 fps, a timing-under-load miss). In the
  first gameready run, "html: the game plays on the copy: 0 uploads" read 2 once; it passed in the next run.

## For the patch notes
- **Updates finished at a restart keep your settings.** On Windows, when files were busy, an update finishes as Hearth
  starts again. That path now brings your agents (the Lab's Three Director and its chats), your look and your theme
  back exactly like a normal update: your values win, the update's new parts are added around them, nothing is lost.
- **A restart can't get stuck on an update.** If git can't be found at that moment, Hearth starts as usual and finishes
  the update at the next start.
- **▶ Play is sturdier.** The helpers Hearth adds to a game (sharper textures, smooth loading, instant sound) can no
  longer stop the game drawing, loading a picture or playing a sound, even when a game does something unusual.
- **Lab features load when first touched**, a few helpers that were missed before included.
