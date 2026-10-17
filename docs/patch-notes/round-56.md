# Round 56: Clink starts sooner, answers faster, and never rebuilds its shadows mid-game
*October 2026*

## 🌗 No shadow hitch a few seconds in
- The Best look picks the shadow size while "Getting ready" shows (the biggest that keeps your screen's refresh), prepares it there and remembers it for the game. Nothing is rebuilt while you play.
- The F chip and doctor say "Shadows: 2048 (chosen while getting ready)". `/game look shadows` shows it; `/game look shadows reset` chooses again next ▶ Play.

## ⚡ Ready sooner, the second time especially
- Hearth remembers what it learnt getting each game ready and skips what still holds: in the final test the second and third ▶ Play were about 15–40 % quicker than the first (more on a quiet machine).
- Shaders compile side by side while textures upload, and a Lab scene's files load from the first moment, so the first ▶ Play waits less too.
- Once per game, when it's clearly quicker: "Ready in 7.5 s (was 25.4 s)". `/game ready` shows each step's time.
- Still true every time: nothing left to compile or upload in the first seconds of play, and your game files are only read.

## 🎯 Your keys and mouse reach the game sooner
- ▶ Play hands Clink's frame straight to the screen instead of copying it first (one full-screen copy less every frame).
- Nothing of Hearth's listens to an HTML game's keys any more.
- Press F: the chip shows "Input: x ms", how long your key or mouse takes to reach the game's next frame (only measured while the stats show). `/game latency` measures it for 2 s and says it in plain words (it taps F24 and nudges the mouse 1 pixel and back).

## 🧊 The Lab preview is lighter on the graphics card
- Each layer no longer copies its whole picture every frame. Stills, thumbnails, clicking a layer, recordings and exports look exactly as before (a new check compares them byte for byte).
- Filters over a scene you just edited use its current frame, not the one before. Games' timers cost the Lab nothing extra.

## 🛡 Safer
- A built-in AI you removed stays removed on both computers after they sync.
- Chats never change AI by accident: an old chat that names no AI stays under Claude wherever it's opened, and a new safety check guards every place that could move a chat.
- ▶ Play's helper check now also works on Lab scenes, so a helper that would slow your scene is switched off before you start playing.
- After an update, anything put back in Hearth's own settings files goes straight into your settings folder.

## Try it
- ▶ Play Clink twice: the second time, watch for "Ready in … (was …)".
- In the game, press F for "Input: … ms" and "Shadows: …", or type `/game latency`.
