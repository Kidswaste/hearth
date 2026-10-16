# Round 53: edit while you play, lighter textures, faster keys, the director plays your game, disk space
*October 2026*

## 🔁 Edit while you play
- Leave ▶ Play open and keep working with the director: each change goes straight into the running game with a small "↻ Updated" — no reload, no "Getting ready" again (unless you added new pictures).
- A game that saves its state (`saveState()` / `restoreState()`) keeps its score, level and position through edits, even one that broke something.
- **Ctrl/⌘+P** goes from the Lab to the game and back, instantly; the game waits paused and silent. **Ctrl/⌘+Shift+P** plays from where you left it, or from the scene's checkpoint.
- With two screens, the game can play full screen on one while you edit on the other (▶ Play's right-click).
- When the game stops on an error, one click puts the error and its code in the director's chat, ready to send. Nothing is sent until you press Enter.

## 🎮 Faster keys and mouse in ▶ Play
- Hearth no longer runs any of the Lab's own code on your input while you play (30 listeners down to 6, none on keys).
- Clicking in the game no longer stalls the graphics card, and the arrow keys always reach the game (they could move a Lab layer instead).
- **Raw mouse**: a game that captures the mouse gets its real movement, without the system's acceleration — your aim may feel a little different at first.
- The game gets the keyboard as soon as it opens, on Mac and Windows. Esc always works; Esc twice leaves even a frozen game.
- Windows / ⌘ / Alt+Tab still switch apps while you play — the system keeps those.

## 🗜 Optimize for play shrinks your textures
- Pictures in your scene and inside your 3D models become GPU-compressed textures: about a quarter of the video memory, same look ("Textures: 51 MB → 14 MB" on the test scene).
- Every one is checked against the original; if it would look different, the original is kept and you're told why.
- Nothing to install: the encoder comes with Hearth. Your files are never changed.

## 🎬 The Three Director can play your game
- Ask "play Clink for 30 seconds and tell me what feels off": it plays with real key presses and mouse moves, then reports frame rate, stutters, where the player went, inputs that did nothing, the game's state before and after, and any error with its fix.
- One step, a few hundred tokens. Its keys only go to the game window, never to Hearth, and never to a game you're playing yourself.
- `/playtest Clink hold W 2 s, jump` does the same for you, free.

## 💾 Space Hearth uses
- Settings › This computer & sync › **Space Hearth uses** shows what Hearth keeps on your disk, in plain words.
- **Free up** anything Hearth rebuilds by itself (Play builds, shader cache, bakes, caches, logs) in one click, to the Trash. Your chats, scenes, settings, captures, renders and backups are never offered.
- Hearth tidies leftovers of deleted scenes and finished renders by itself. A calm note only if your disk has under 5 GB free. Ctrl/⌘+K "Disk space" or `/disk`.

## 🔧 Fixes
- ✺ Creative Playground now starts under the rail's ⋯ (one click puts it back in the rail; Ctrl/⌘+K finds it).
- A tool moved off the rail opens again.
- Getting a game ready works with Windows folder paths.
- Settings › Advanced › Graphics wording is clearer.

## Try it
- Press ▶ Play on Clink, then Ctrl/⌘+P back to the Lab, ask the director for a change, and Ctrl/⌘+P again — it's already in.
- Ask the director: "play Clink for 20 seconds and tell me what feels off".
