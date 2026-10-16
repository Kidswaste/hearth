# Round 52: ▶ Play your game, why it stutters, the best graphics card — and your chat stays put
*October 2026*

## 🛟 Your chat and scene stay put
- If Hearth's window ever reloads or crashes, it now comes back where you were: the Lab, the scene and the chat you were in, with your last-second Lab edits put back. One line says what happened.
- **Ctrl/⌘+Shift+R** (reload all of Hearth) does nothing while the Lab is open — it was one key away from the Lab's Shift+R. Ctrl/⌘+K › Restart Hearth still works.
- A chat never drops out of your list, even if its AI was removed or turned off.
- 🛟 **Recover…** now also finds chats that are hidden, saves that didn't go through, and Claude Code's / Codex's own record of every conversation — so a lost chat comes back and can continue.
- Crash reasons are recorded in `data/devreport-crashes.json`, so if it happens again we'll know why.

## ▶ Play: your game in its own window
- One **▶ Play** button (Lab toolbar, a scene's right-click, Ctrl/⌘+K "Play the last game", `/play Clink`) opens the game full screen in its own window — no Hearth around it, no stack of layers.
- A Lab scene's layers run on **one canvas** where possible; an HTML game build loads as it is, from its own folder.
- Max fidelity: your screen's resolution, smooth edges (MSAA), the fast graphics card, no frame cap, pointer lock on click. Hearth's background work waits while you play.
- Esc → Back to Hearth. F shows a small stats chip.

## ⏳ Play gets your game ready first
- Press ▶ Play and a short "Getting Clink ready…" card counts up — loading, textures, effects, warming up — while the game draws behind it. When it fades, nothing stutters the first time it appears: in our test, 0 effects prepared and 0 textures uploaded in the first 5 s of play (it was 16–28 and up to 7).
- It holds 100 % quality while you play, and tells you what it found ("1 texture is 4K — it costs 43 MB of video memory").
- **Optimize for play** (on the card) makes compressed copies of your 3D models in Hearth's own folder for the next Play — your files are never changed. If the compressor isn't installed, it shows the command and installs only when you click.
- The second launch gets ready sooner: compiled effects are kept.
- Fixed: 3D models in a Lab scene now load in the ▶ Play window.

## 📈 Why did it stutter?
- In a game window, **F** shows fps, frame time and a 2-second graph; every slow frame says why (memory clean-up, an effect being prepared, a big texture, slow game code, or the graphics card).
- The **performance doctor** lists fixes in plain words, biggest first. On a Lab scene the safe ones are one click with Undo; for an HTML build you get the change to copy. Nothing changes without your click.
- Ask the Three Director "make Clink smoother" — it reads the doctor's findings for about 250 tokens.

## 🎮 The best graphics card
- Hearth now draws on your fast graphics card (laptops with two cards used the small one).
- Settings › Advanced › **Graphics** shows what Hearth is using, e.g. "RTX 4090 · 240 Hz · hardware video ✓".
- If Hearth ever starts without the graphics card, it says so once, with Restart.

## 🔧 Fixes
- The Lab opens a bit lighter (no needless layout passes while it's being built).
- The Lab director's commands always show in Ctrl/⌘+K.

## Try it
- Open Clink in the Lab and press **▶ Play**. Press F for the stats, Esc to come back.
- Open Settings › Advanced › Graphics: it should name your real card and your monitor's refresh rate.
