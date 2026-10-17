# Round 57: faster second Play, lighter Lab editing, recordings that move
*October 2026*

## ⚡ ▶ Play gets ready faster the second time
- Hearth remembers the shadow size it picked for each game and only checks it in a few frames, instead of trying every size again. In tests the second Lab-scene ▶ Play went from 29.9 s to 17.7 s, an HTML build's from 8.3 s to 3.1 s (a slow test machine: much quicker on yours).
- If the graphics card hiccups while "Getting ready" shows, Hearth waits for it and gets ready again, so the first seconds of play stay smooth.

## 🎮 Less of Hearth inside your game
- The performance stats part no longer rides along in every game: it joins only when you open the performance doctor, and measures from then. Hearth's own work during play is now about 0.02 ms a frame on a fast computer.
- The "a sound slowed the picture" note names the file (for example music.wav).

## ✍️ Lighter Lab editing at 240 Hz
- Dragging the line between the Lab and the docked director chat touches about 14× fewer elements per move.
- Typing code, scrubbing numbers and dragging layers do less work per move. Nothing looks different.
- The Lab toolbar stays on one row with the director docked on a 1280-wide window.

## 🎥 Recordings of the moving Lab move again
- Recording the Lab while your scene plays keeps its frames again (a take could come out nearly frozen, even as one frame). Recordings start on their first real picture, never black.

## 🛠 Fixes from a full check-up
- **Let Smart decide sticks now** (it went back to Deep the next time Hearth read its settings). Any setting you clear stays cleared.
- The Doctor's quick check pre-picks "Yes" again when /doctor finds nothing wrong.
- Before / after names the director's edit ("Before: Claude's edit").
- A little less background work when idle (one timer for settings files instead of four).

## Also on main from Astra (Codex)
- Sidequest Studio: a quest mixtape with saved cards and a passport, Forgeheart workstation progression and rewards, map pins.
- Creative workbenches with VST3 sound design in a separate, safe process, and the Ember and Prism instruments.
