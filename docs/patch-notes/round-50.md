# Round 50: materials, music visualizers, cheaper long chats, a lighter Lab, nothing lost in a crash
*October 2026*

## ◉ A look for 3D things in one click
- Pick something 3D on the Lab preview, then **◉ Look ›**: 16 looks as little balls — chrome, brushed metal, gold, mirror, glass, frosted glass, plastic, ceramic, clay, rubber, velvet, holographic, neon, toon, wireframe, x-ray.
- Point at one to try it, click to keep it. Pick a palette colour and the Shine; Original takes it off. Each change is one undo.
- Works on one part, a whole 3D layer or a whole 🧊 model. Metal and glass get a soft built-in studio light to reflect.
- Saved with the scene; also in right-click › ✨ Look & motion, Lab search ("chrome", "glass"), Ctrl/⌘+K and `/material`.

## 🎵 Music visualizers in one click
- ＋ Add › **🎵 Music visualizer…**: 17 looks with live previews — spectrum bars, circular spectrum, waveform line and ring, oscilloscope, burst on the kick, pulsing rings, bass fountain, starfield, tunnel, terrain, breathing blob, VU meters, spectrogram, beat flash, logo bounce (drop your picture on the picker).
- Pick what it listens to (whole song, bass, mids, highs, kick, snare, voice / drums when split), sensitivity, smoothing, glow and palette colours. Move and scale it on the picture.
- Renders match the preview frame for frame. Search "visualizer" or `/visualizer rings`.

## 🪶 Long chats cost much less after a break
- Once the AI's prompt cache has expired, a long chat goes on with a lighter history instead of re-reading everything at full price: every word kept, old tool results and pictures sent as one-line notes.
- In test chats: about 20–55 % fewer tokens per message on Claude, 65–75 % on Astra.
- Nothing in the chat changes; the AI can look up any earlier message. It never breaks a warm cache.
- One quiet line says when it happened, with "Keep the full history here". The Usage window shows the saving.

## ⚡ A lighter Lab on the big screen
- Less GPU work per frame: layers covered by a filter are no longer blended twice, and shadows aren't redrawn when only the camera moves. Nothing looks different (compared pixel by pixel).

## 🛟 Nothing lost in a crash
- **An AI reply survives a crash**: it lands when done, or comes back "cut off" with **Continue** if Hearth itself stopped.
- **The Lab preview recovers by itself** in a few seconds, with your scene, sliders and song.
- **A render cut off** no longer leaves a half video that looks finished: it goes to the Trash and the queue offers to render it again.
- **Every save survives a power cut**, and Windows update restarts write everything first.

## 🔧 Fixes
- **Exported videos move with the song's sound again.** Scenes driven by the live sound (level, bass, spectrum, waveform) stood still in exports while the preview moved.
- The access badge follows the level at once, and settings can no longer briefly jump back to an older copy while saving.

## Try it
- Start a long reply and force-quit Hearth halfway; reopen it — the reply is back with **Continue**.
- Add a 🎵 Music visualizer, then render a few seconds: it pulses exactly like the preview.
