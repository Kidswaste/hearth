# chatjump76: jumps and find land and stay; a real mouse click works like .click()

Round 76. The three checks checkhealth74 left red (streamrender, smooth26, clickfirst64) were each traced to a real app
bug and fixed where it lived; a new check presses every visible button of the main views with the real mouse.

## What was wrong, and the fix

1. **Find in chat landed on an old message, then threw you back to the end** (streamrender). Measured frame by frame:
   find put the hit in view, then ≈ 0.4 s later a picture loading in the chat pulled the scroll back to the bottom: find
   never stopped "following the end" (jumps did, since round 45), and the blocks of the long chat waking around the
   hit moved it too.
2. **Jump to message #3 took ≈ 0.7 s to land** in a long chat: waking the resting block waited for its Markdown
   (≤ 0.3 s) and for the sizes of its pictures (≤ 0.6 s) before drawing anything.
   - Fix (chat-rest.js `hold`): a jump or a find lands its message and **holds it exactly where it landed** while the
     chat settles: every size change around it (blocks next to it waking, messages laid out at the 180 px guess until
     drawn, pictures arriving) is answered by a ResizeObserver in the same frame, after layout and before paint, so
     nothing is seen moving. Following the end stops for that read. The hold ends at your own wheel / press / key /
     touch, after 1 s of calm once every picture in the chat has loaded (or failed), or after 6 s. It reuses
     chatsteady73's size reservations (pictures measured and remembered before a block wakes).
   - A block woken for a jump / find is in a hurry: Markdown waits ≤ 120 ms and picture sizes ≤ 150 ms (they keep being
     measured and remembered in the background; the hold covers what arrives later). Measured: jump lands in 164–171 ms
     (was ≈ 685 ms), find in 19–26 ms; then 0 frames out of view and 0 px of movement over the next 1.5 s.
   - native.js `jumpTo` and chat-ux.js find both use it (also for messages already drawn). `ChatRest.settle` stays as
     a name for `hold`.
3. **⋯ AI setup couldn't be closed with the mouse, and ◎ under it opened nothing** (smooth26). Since the AIs moved to
   the bar above the chat, the chat's header sits lower than the drawer's fixed top (44 px): the drawer covered the ⋯
   that opened it, so a real click on ⋯ landed in the drawer and it stayed open over the composer's ◎ (a script's
   `.click()` on ⋯ still toggled it, which is why it looked fine to code). The drawer now starts just under the ⋯ that
   opened it (chat header and tool header ⋯ pass themselves as its anchor), so the same ⋯ closes it.
4. **"✎ Note (F8)" on the game's F chip made no note when clicked** (clickfirst64). The chip's words are laid out
   right-aligned and "Quality: auto" appears a moment after the chip opens (its first 2 s read): it slid in between and
   pushed ✎ Note to the left, so the mouse landed on Quality (switching it) instead. Quality now comes first in the
   row (it grows to the left and moves nothing) and ● Record / ■ Stop hitch map keep one width, so the words under your
   mouse never move.
   - Also (game-preload.js): a press on any of Hearth's own words over a game (the chip, the leave card, the error line,
     the note box) is stopped at the window before the game's scripts see it. A Lab scene's page (and many games) asks
     for the pointer lock on any mousedown, after which the click goes to the locked element instead of the button, and
     the game would also act on a press meant for Hearth. Registered before the game's scripts; one cheap check per press.

## New check: realclick76

`dev/checks/realclick76.js` presses every visible button of the main views with real CDP mouse input: the rail, a chat
(header, composer, the last messages' buttons), ⋯ AI setup open (all folds open), ◎ Missions open (More open), the
Lab, the board, the Projects home and Life. Per button it checks the point at its middle is the button (not an
overlay, a drawer or a tooltip) and that a click event reached it (not lost to a mousedown handler that re-drew or
moved it, a focus change, or a pointer lock). Clicks are swallowed at the window before any handler, so nothing is
opened, sent or deleted; buttons inside closed folds are skipped (the browser still measures them when asked).
It also checks ⋯ opens AI setup, the same ⋯ closes it, and ◎ opens Missions with real clicks.
Result: **151 buttons in 8 views, all reached** (before the drawer fix: ⋯ under the drawer; the first version of
the check also flagged 28 buttons in closed folds, a check mistake fixed with `checkVisibility`).

## Files
- `chat-rest.js`: `hold()`, hurried wakes for jumps / find, `settle` kept as its name.
- `native.js`: `jumpTo` lands with `ChatRest.hold`; the chat header ⋯ passes itself to AI setup.
- `chat-ux.js`: find lands with `ChatRest.hold` (follow off for an old message without it).
- `options.js`: AI setup's drawer starts under its anchor. `tools.js`: the tool header ⋯ passes itself.
- `game-preload.js`: Quality first in the chip's row, one width for the hitch word, presses on Hearth's words kept from
  the game.
- `dev/checks/streamrender.js`: jump / find wait until the message lands (time reported) and must then stay in view
  for 1.5 s (frames out of view, px moved); find is opened from the end of the chat, where it is usually used.
- `dev/checks/realclick76.js` (new), `dev/run-checks.js` group `chatjump76`.

## Tested
All green on the final run (under flock, two holds): streamrender (jump lands in 164 ms, find in 26 ms, then 0 frames
out of view, 0 px moved), smooth26, clickfirst64 (✎ Note clicked → note 1, by chip), realclick76 (151 buttons),
gameinput (the new press guard inside the listener budget), chatwindow72, chatsteady73 (BIGPROFILE70=1), lazy,
unit:boot-test (first screen 1867 / 1872 KB).

## For the patch notes
- **Find in chat and "jump to message" now land on the message and stay there.** In a long chat, finding a word in
  an old message no longer throws you back to the end a moment later, and jumping to an early message shows it at
  once (about four times faster) and keeps it still while pictures around it load.
- **The ⋯ button closes AI setup again.** The AI setup panel no longer covers the ⋯ that opened it, so clicking ⋯ a
  second time closes it, and the ◎ button underneath works again.
- **"✎ Note (F8)" on the game's stats chip works with the mouse.** The chip's buttons no longer shift when
  "Quality" appears, so clicking ✎ Note makes a note (it used to switch Quality instead). Clicks on Hearth's own
  buttons over a game are never passed to the game.
