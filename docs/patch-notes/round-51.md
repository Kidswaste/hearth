# Round 51: shapes that draw themselves, lighter text, smoother menus, a thriftier Keep going, nothing hidden
*October 2026*

## ◆ Shapes that draw themselves
- Right-click the Lab preview › ＋ Add › **◆ Shape…**: 20 shapes with live previews (rectangle, circle, ring, star, line, arrow, underline swoosh, brackets, checkmark, wave, spiral, heart, burst…).
- **✎ Draw your own**: click points on the pad and a smooth line goes through them. Shift+click for a sharp corner; click the first point to close it.
- Pick **how it draws**: on, off, on then off, in a loop, or again on each beat, bar, kick or snare. Duration, easing, reverse.
- Line width, dashes (they can march), rounded corners, brush ends, fill, palette colours. Set Draws to Still and keyframe Start / End for exact control.
- Drag it on the picture to move, scale or turn it. Crisp at any size; renders match the preview. `/shape arrow`, `/shape draw kick`.

## 🅰 Lighter text, sharper 3D
- Text layers draw only the area around their words: three titles on a 4K screen went from 33 to 10 million pixels per frame. They look exactly the same.
- A title that has come in and holds still no longer redraws every frame.
- 🧊 3D models with bloom or depth of field are sharp on Retina / high-resolution screens from the first frame (they looked soft until you resized). Bloom halos look a little finer.

## 🪟 Smoother menus and Ctrl/⌘+K
- Right-click menus, Ctrl/⌘+K, tooltips and the Lab's menus no longer re-blur what's behind them every frame.
- Ctrl/⌘+K over a chat that's writing got 2–5× faster to type in; the Lab's menu no longer re-blurs the playing picture.
- They look almost the same: a touch more solid, the page behind Ctrl/⌘+K a shade darker instead of blurred.

## 🔁 A thriftier Keep going
- When a chat gets long, the next round starts fresh with a lighter history, so rounds stop re-reading everything: about 30–60 % fewer tokens per round in tests.
- It stops by itself when the work runs out (two rounds with no change, or the same answer twice) and says why.
- It pauses before a plan limit — "paused until 6 pm (limit)" — and goes on after the reset. The margin is in the Keep going card under More.
- Each round's notification is a one-line summary. The Usage window shows what Keep going spent and achieved.
- It still never answers a permission card for you.

## 👆 Nothing hidden behind a command
- All 925 commands checked: every one you'd use can be reached by clicking. New spots, all inside menus you already have:
  - **Snippets** and **Remind me…**: right-click the chat box › More….
  - **How messages look** (width, spacing, times, font): chat ⋯ › View.
  - **Palette style**: right-click a palette card on the board.
  - **Window at an exact size…**: Capture › Settings › Recording….
- Fixed: the board's right-click lost a website's, note's, shape's, frame's and colour's own rows once the Apps had been opened.

## ▣ Present gets everything ready
- Press ▣ Present (or P): a short "Getting ready…" card loads every picture, video and model, prepares every effect, and warms up the graphics card across your whole song — so the show starts without the first-time stutters.
- During the show the Lab holds 100 % quality and Hearth's background work (backups, sync, tips) waits until you press Esc.
- If your computer can't hold full quality live, Present offers to **bake** the show: a full-quality video of it, played in sync with the song, with zero lag. Baked shows are kept, so presenting an unchanged scene again starts at once. A bake isn't live: the mic, camera and slider moves won't react.

## ✺ Creative Playground (by Astra)
- In the rail, or `/playground`: 15 small creative activities that run on your computer with no AI tokens — palette posters, seamless tiles, motion loops, pixel sprites, sound to light, a beat sketcher, a melody garden, game sounds, a sample cutter, pocket effects, an arcade, mazes, a rhythm runner, daily quests and an idea mixer.
- Export SVG/PNG, WAV, MIDI and playable HTML; save recipes. "Prepare Astra draft" puts an idea in Astra's chat box without sending it.

## 🔧 Fixes
- A Lab preview that crashes is noticed at once (it used to be checked every 2 s even with the Lab closed) and comes back in under 2 s.
- If the graphics card reset twice in a session, the Lab preview stayed black; now it recovers or shows a calm message with Restart.
- Half-finished files after a crash go to the Trash only where there is one (a USB stick or network drive keeps the file).
- The first screen loads less (2,353 → 2,267 KB). `/tokens` shows its description again.

## Try it
- Add a ◆ Shape › underline swoosh with Draws on each kick, and play your song.
- Open Ctrl/⌘+K while a long reply is being written and type — it keeps up.
