# ▶ Play's edit → play → edit loop (round 53, playloop)

The owner works on Clink in the Lab with the Three Director, then plays it in ▶ Play. Going back and forth used to
mean closing the game, editing, and opening it again (a new window, "Getting ready" again, the game from the start).
Now the game window stays open while you edit. Your edits and the director's go into it as you make them, and one key
switches between the two. Nothing goes into any prompt (0 tokens) unless you send the director a draft yourself, and
your game files are never touched: Hearth only changes the page it built in `data/game/<scene>`.

New files: `playloop.js` (hub, in the lazy group `gamemode`, after `gamemode.js`), `playloopmain.js` (main),
`dev/checks/playloop.js`.

## How it works
1. **Live edits.** While a game window is open (playing or resting), any change to its scene is compared with what the
   window runs. The change can be yours (code, layers, the Layers list) or the director's (`three_edit_code`,
   `three_add_layer`…).
   - **Only code changed**: just that layer's code is swapped in the running page, a hot reload of that layer. The other
     layers, three.js, the compiled shaders, the pictures and the song carry on.
   - **Layers added, removed or reordered**, or a change in what shares the one canvas: the layers run again in the same
     page. Nothing is built again.
   - **New pictures, a new song, a new palette or three.js version**: the page is built again. This uses gamemode's
     build and gameready's prepared copies, and the window comes back with its "Getting ready" card (new assets need it).
   - Over the game, a small **"↻ Updated"** shows for a moment. There's no card and no reload.
2. **Keeping the game's state.** A layer can export two functions, `saveState()` and `restoreState(s)`:
   ```js
   export function saveState() { return { score, level, player: player.position.toArray() }; }
   export function restoreState(s) { score = s.score; level = s.level; player.position.fromArray(s.player); }
   ```
   When that layer is edited, the new code gets what the old code saved, right after it loads. The game goes on from
   where it was, and this works in the Lab preview too. If an edit breaks the layer, the saved state is held, and the
   fix gets it back. A layer without hooks starts again; the other layers aren't touched either way.
3. **Ctrl/⌘+P** (`WinMac.keyLabel`: ⌘P on the Mac, Ctrl+P on Windows; it was free everywhere).
   - **In the Lab**: ▶ Play the scene. If a game is resting, the key brings it back exactly as it was, with your edits
     already in it (62 ms here).
   - **In the game**: back to editing, with the game kept. The window hides (on the Mac it leaves its full-screen space
     first), its frames stop (the page is parked), its sound is muted, and Hearth's background work and the Lab preview
     come back. A game left resting for 10 minutes closes by itself, to free its memory.
   - The hint at the start of a game shows it: "Esc: menu · F: stats · ⌘P: back to editing".
4. **Play from here** (Ctrl/⌘+Shift+P, ▶ Play's right-click, Ctrl/⌘+K, `/play-here`) starts the game in the first of
   these that exists:
   - where you last left it to edit (the layers' saved states);
   - the scene's checkpoint (a layer's `export function checkpoint(name)`);
   - the start.
5. **Side by side** (▶ Play's right-click when there are two screens, `/play-side`): the game plays full screen on your
   other screen while the Lab stays on this one, and your edits go into it live. Ctrl/⌘+P then only moves the focus.
   The choice is remembered.
6. **Errors.** A runtime error in the game shows one calm line over it:
   "Clink stopped: ReferenceError: nope is not defined (line 9)" with **Fix with the director** and ✕. The Esc card
   offers the fix too, for when the mouse is captured.
   - Fix puts a draft in the docked director chat. The draft holds the error, the layer, the line and the code around it
     (±2 lines, the line marked). It is **never sent**: you press Enter.
   - On one screen the game rests, so the chat is in view. Your fix then goes into the resting game, and Ctrl/⌘+P plays on.
   - An HTML build's errors show the same line, with the file and line.

## Measured (dev/checks/playloop.js, SwiftShader under Xvfb, a shared machine)
| | Before | After |
|---|---|---|
| An edit while playing | close, edit, ▶ Play again: a new window, "Getting ready" (7–12 s here), the game from the start | the layer swapped in the same page: the post takes 2 ms; the new code is drawing ≈ 2 s after the edit here (the director's edit call, then the new renderer's first frame on a software GPU) |
| The game's state through the edit | lost | kept (score 42 → 42) for a layer with hooks; the other layer kept drawing (frames 26 → 114) |
| A new layer while playing | a new window | the layers run again in the same page (same window, same page), the score handed back |
| Back to the game after editing | ▶ Play again (a new window + the card) | Ctrl/⌘+P: 62 ms, as it was |
| A runtime error in the game | in the window's console, where you can't see it | one line over the game, a draft for the director in one click |

## Upgrades
### Live edits
1. **An edit while the game plays goes into it**: that layer's code swapped in place, nothing rebuilt.
2. The other layers, three.js, compiled shaders, pictures and the song go on through an edit.
3. Layers added / removed / reordered: the layers run again in the same page (no new window, no card).
4. New pictures or a new song: the page built again from gamemode's cache and gameready's prepared copies.
5. "↻ Updated" over the game after a live edit (no "Getting ready" unless new assets came).
6. Edits made while the game rests are in it when you come back ("Updated" then).
### The game's state
7. **`saveState()` / `restoreState(s)`** on a layer: an edit keeps the game where it was (Lab preview too).
8. A broken edit holds the saved state; the fix gets it back.
9. The states go through a layers-run-again and a page built again too.
10. **`checkpoint(name)`** on a layer: where "Play from here" starts.
### Back and forth
11. **Ctrl/⌘+P in the Lab**: ▶ Play the scene, or back to the resting game as it was.
12. **Ctrl/⌘+P in the game**: back to editing, the game kept (hidden, frames stopped, muted; the Lab preview and
    background work back).
13. A game resting 10 minutes closes by itself.
14. The game's start hint shows the key; ▶ Play's tooltip too.
15. **Play from here** (Ctrl/⌘+Shift+P): where you left it to edit, else the checkpoint, else the start.
16. ▶ Play's right-click: Back to <game>, Play from here, Side by side.
17. Ctrl/⌘+K: ▶ Play from here.
18. `/play-here`.
### Side by side
19. **Side by side**: the game full screen on your other screen, the Lab on this one, edits live (two screens only).
20. `/play-side [on | off]`, remembered.
### Errors
21. **A runtime error shows one calm line over the game** with its line ("Clink stopped: ReferenceError … (line 9)").
22. **Fix with the director**: the error, layer, line and code around it drafted in the docked director chat, never sent.
23. The Esc card offers Fix too (for when the mouse is captured).
24. On one screen the game rests while you fix it; the fix goes in live.
25. HTML builds: the same line with the file and line.

25 upgrades.

## Tests
- `sh dev/run-checks.sh playloop` (`dev/checks/playloop.js` + gamemode, gameready, labdirector, qa-keys, lazy,
  unit:boot-test).
  - The check scene has two layers: "Spin" (no hooks) and "Game" (a score with saveState / restoreState / checkpoint).
  - Covered: an edit while playing (same page and window, the score kept, Spin untouched, "Updated"); a new layer (run
    again in the page, the score handed back); a broken edit (the line, Fix → the draft in the director's box, not
    sent, the game resting); the fix while resting (the held score back); Ctrl/⌘+P in the Lab and in the game; Play
    from here; the menu rows; the change kinds.
- Ran: playloop (4 passes in a row after the fix below), gamemode, labdirector, qa-keys, lazy, unit:boot-test all pass.
  gameready fails one step on this machine, twice: "progress … textures n/m". That step samples a card line which
  shows for a moment between two stages, so it is timing. The base commit (04daee0) fails other gameready steps under
  the same load. ▶ Play's getting ready isn't touched by this stream.
- Found and fixed while testing:
  - "Updated" could clear the error line of the very edit that caused it, when the error came first. Now the blip
    clears old errors before the change goes in.
  - The `game:loop` / `game:fix` channels are registered in gamemodemain.js, so main.js finds them for its lazy load
    (boot-test).

## Edits outside the new files
- `tools/three-sandbox.html` (the Lab player): "live edits keep the game's state", i.e. the hooks, `window.__labHot`,
  the module's exports kept as `L.mod` in `runLayer`.
- `gamemodemain.js`: requires playloopmain (the `game:loop` / `game:fix` channels, the Ctrl/⌘+P line in `before-input-event`, `ended`).
- `gamemode.js`: `rest(on)`, `state().resting`, `leave({ quiet })`, PlayLoop's rows first in ▶ Play's menu, its
  side-by-side screen for `play`.
- `game-preload.js`: the blip, the error line, Fix on the Esc card, the key in the hint (no key listeners: Ctrl/⌘+P is read in main after gameinput's keys).
- `preload.js` (`hub.game.loop` / `onLoop`).
- `lazy-data.js` / `lazy-meta.js`: `playloop.js` in the gamemode group, and the Ctrl/⌘+P stand-in key that loads it.
- `tools/three.js` (▶ Play's tooltip), `tools/game-api.md` (the PlayLoop section).
- `dev/run-checks.js` (the group, HEARTH_THREE_DIR), `dev/checks/qa-keys.js` (Ctrl+P / Ctrl+Shift+P skipped in the
  Lab run: they open a game window; playloop presses them).

## Risks
- **Hot swap in the shared canvas.** Hot reload of a merged layer (one canvas) re-creates its renderer on the shared
  context. This was tested with two merged layers. A layer with raw GL calls is already kept off the merge.
- **Restored state is the layer's job.** `restoreState` gets plain data from the old run (cloned through the page when
  it crosses a rebuild). Objects from the old run (meshes, materials) must not be kept in it: their renderer is gone.
- **Global state survives.** Code that keeps state on `globalThis` keeps it through any edit, as in the Lab.
- **Saved points are only taken when you go back to editing** (Ctrl/⌘+P or Fix), not at Esc → Back to Hearth (the
  window is closed by then). They last until Hearth closes.
- **Side by side wasn't seen on two real screens here** (Xvfb has one). The window is moved to the other screen's
  bounds and made full screen there. On the Mac it leaves its space first.
- **An HTML build gets the key, resting, side by side and the error line, but no live edits**: its files are yours,
  and Hearth doesn't watch them.
- Resting keeps the game's page in memory (a hidden window, parked) until you come back, ▶ Play another game, or 10
  minutes pass.

## For the patch notes
- **Edit while you play.** Leave ▶ Play open and keep working on Clink with the director: each change goes straight
  into the running game, with a small "↻ Updated" over it, and no reload or "Getting ready" again (unless you added
  new pictures).
- **Your game keeps its state through edits** when a layer saves it (`saveState()` / `restoreState()`). The score,
  level and position stay as they were, even through an edit that broke something.
- **⌘P / Ctrl+P** goes from the Lab to the game and back, instantly. The game waits where you left it, paused and
  silent. **⌘⇧P / Ctrl+Shift+P** plays from where you left it, or from the scene's checkpoint.
- **Side by side**: with two screens, the game plays full screen on one while you edit in the Lab on the other
  (▶ Play's right-click).
- **Errors are easy to fix**: "Clink stopped: ReferenceError … (line 9) — Fix with the director" shows over the game.
  One click puts the error and the code around it in the director's chat, ready to send. Nothing is sent until you
  press Enter.
