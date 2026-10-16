# fixes54 (round 54): merge safety for lazy groups, a Mac / Windows sweep of the round 52–53 game features

## Shipped
### Merge safety
1. **Lazy groups stay whole** (`dev/lazy-groups-test.js`, run by `unit:boot-test`, ≈ 0.7 s, plain Node): every group's
   files exist; each renderer file is loaded by exactly one place (one group, or index.html, or the one script a
   module adds itself, like settings-find.js); every global a group lists is defined by one of that group's own files
   (also through a UMD `root.X = …` wrapper); every module global a lazy file uses is defined by a file that something
   loads. With round 53's merge drop put back (`tools/gametex-core.js` out of 'gameready') it fails with:
   "gameready: lists GameTexCore but none of its files defines it (defined in tools/gametex-core.js: add that file
   to the group)" and "tools/gameready.js uses GameTexCore, … which nothing loads". `--warnings` lists 16 helper
   globals older groups never listed (not failures).

### Mac and Windows (the round 52–53 game features)
2. **Ctrl/⌘+P on the Mac is ⌘P only.** A real Control+P (the text caret up a line, e.g. in the Lab's code) no longer
   starts ▶ Play (`playloop.js`); the lazy stand-in keys follow the same rule (`lazy.js`).
3. **Keys by the letter on the key, any layout.** ⌘/Ctrl+P (Lab and game window), ⌘Q / ⌘W / Ctrl+W (leave the game)
   work on Russian / Greek layouts (by the key's place when it types another letter: `playloopmain.letter`), and the
   lazy stand-ins (the keys that work before their group loads) match through `WinMac.layoutCode` (on AZERTY, Ctrl+M
   right after the start no longer opens the command bar meant for Ctrl+;).
4. **▶ Play keeps same-named pictures apart.** A Lab scene with pictures "Logo" and "logo" (or one called "song" next
   to the song) built one file on a Mac / Windows disk: the second picture replaced the first in the game. Each now
   gets its own name (`gamemodemain.js` buildScene).
5. **A rebuild on Windows retries** removing the old ▶ Play page for a moment (a virus scanner holding a file) instead
   of failing the launch.
6. **A second game waits for the first to end** (up to 1.8 s, past its forced close) so the old one's cleanup isn't
   skipped when a game started while another was stuck.
7. **Optimize for play never hangs on a dead encoder thread**: a thread that dies (a picture too big for it) answers
   with an error, the picture keeps its original, the others go on; an idle thread's error can't become an uncaught
   error in Hearth's main process (`gametexmain.js`).

### Checks robust against timing
8. **gameready "progress … textures n/m"** sampled a card line that shows for a moment between two stages, every
   150 ms (failed twice under load in round 53). The card now keeps the first line of each stage it showed
   (`shown` in `__gameReady.pub()`, ≤ 40 lines) and the check reads those.

Scans asked for (`unit:winmac-test unit:datasafe-scan unit:errorcalm-scan commandonly-scan`): all pass, nothing
flagged. Swept by hand: path joins (`path.join` / `WinMac` throughout; game cache keys case-folded on Mac / Windows by
`GameReadyCore.norm`), the Trash (game cache, disk calm: the no-bin check first, `shell.trashItem`), error toasts (error
toasts are calmed by ui.js / errorcalm.js), shortcut text (menus and the keys sheet go through `WinMac.keyLabel`).

## Tests
- `node dev/lazy-groups-test.js` (passes; fails as above with the round 53 drop simulated), `unit:boot-test`.
- `unit:gametex-test unit:gamemode-test unit:gameready-test unit:directorgame-test unit:gameinput-test
  unit:diskcalm-test unit:winmac-test`, the four scans, `gameready` (183 s), `lazy`, `playloop`: all pass.

## Edits outside my lane (small)
`lazy.js` (stand-in key match), `playloop.js` / `playloopmain.js` (P key), `gamemodemain.js` (build names, retries,
wait), `gametexmain.js` (dead threads), `tools/gameready-page.js` (`shown`), `dev/checks/gameready.js`, `dev/boot-test.js`.

## For the patch notes
- On the Mac, ▶ Play's shortcut is ⌘P only: Control+P in the Lab's code moves the cursor as it should again.
- ⌘/Ctrl+P and the keys that leave a game also work with a Russian or Greek keyboard.
- ▶ Play no longer mixes up two pictures whose names differ only by capital letters (or a picture called "song").
- Optimize for play finishes even when a picture is too big for the texture compressor: that picture keeps its
  original.
- Starting a game while another one is stuck now waits for the first to close properly.
