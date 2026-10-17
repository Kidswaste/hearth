# Round 54: your game at its best — sharper look, instant sound, no freezes mid-game, a smoother Lab
*October 2026*

*Updated: fixes since the first release*

## 🎮 ▶ Play is smooth again
- Round 54's "no freezes mid-game" helper treated every bullet, spark and particle a game adds each frame as something new to prepare, which cost about a quarter of every frame. It now prepares only genuinely new kinds of things and never touches a game's steady per-frame work.
- Best graphics no longer re-checks the whole scene once a second (a small regular hitch), and shadows are capped at a sharp 2048 (1024 for point lights).
- In our test game, Best now costs about 0.07 ms a frame instead of 0.7 ms.

## 🛟 Your Lab chats are back
- An update could set your Hearth settings aside, along with the Three Director docked in the Lab, so its chats (Clink's too) moved under Claude. Your chats were never touched.
- Hearth now brings back what an update set aside, by itself, a moment after it starts — the Three Director with its chats, your look and your theme — and updates can't set them aside like that any more.

## ✦ Quest journal (by Astra)
- Creative Playground opens on a quest journal: creative campaigns, small steps, XP, skill paths and rewards you choose. Your earlier daily prompts and notebook are kept underneath.

## ✨ Your game looks its best
- ▶ Play makes your game look its best on your screen, with nothing to set: textures stay sharp far away (also ones loaded later), pictures left without a colour space show their real colours instead of washed-out ones, and shadows get a map sized for your screen (2048 on 1440p, 4096 on 4K or Retina).
- Anything your game chose itself is kept exactly as it is.
- It never costs smoothness: if bigger shadows would make the game miss your screen's refresh, Hearth steps them back down by itself.
- Press **F** while playing to see what it did, in one line. One choice if you want it: right-click ▶ Play › **Graphics: Best / Balanced** (Best is the default).

## 🔊 Game sound is instant
- Hearth starts the sound system and decodes your game's sounds behind "Getting ready", so the first sound plays at once and doesn't freeze the picture (60–240 ms late before, 6–10 ms now in our test).
- An HTML game's sounds are ready from its second play on; a Lab scene's the first time.
- **Ctrl/⌘+P pauses the game's sound with the game**, and it comes back where it was. A minimized game goes quiet; a game on another screen keeps its sound.
- The F chip shows the sound's latency; the performance doctor names a sound that slowed the picture.

## 🌊 Loading during play no longer freezes your game
- When your game loads a level, a model or a big picture while you play, Hearth decodes it in the background, prepares its effects out of sight and sends big textures to the graphics card a slice per frame. New things appear a moment later instead of the whole game stopping.
- On the test game (a 4K picture and a model loaded 5 s in), the longest freeze went from about 1 s to about 0.14 s, and the picture looks exactly the same.
- The F chip and the performance doctor say which file caused a slow frame, with how to load it without one.

## 🧊 A smoother Lab while the director works
- A chat's small scene picture used to freeze the window for a moment after a director edit or at the end of a reply; it's now made in the background (a director edit's longest pause: about 700 ms → under 60 ms in our test).
- Clicking between layers, director edits with the code hidden, scrubbing the timeline and the usage meter during a reply all do less work.
- Nothing looks different.

## 🔧 Fixes
- On the Mac, ▶ Play's shortcut is ⌘P only: Control+P in the Lab's code moves the cursor again.
- ⌘/Ctrl+P and the keys that leave a game also work with a Russian or Greek keyboard.
- ▶ Play no longer mixes up two pictures whose names differ only by capital letters.
- Optimize for play finishes even when a picture is too big for the texture compressor: that picture keeps its original.
- Starting a game while another one is stuck now waits for the first to close properly.

## Try it
- Press ▶ Play on Clink, then F: the second line shows what the best look did.
- Ctrl/⌘+P back to the Lab while music plays, then again: the sound picks up where it was.
