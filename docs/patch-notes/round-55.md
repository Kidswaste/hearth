# Round 55: nothing of Hearth's can slow your game, and your chats and settings always stay put
*October 2026*

## 🛡 Hearth can't slow your game down
- While a game plays in ▶ Play, Hearth measures how much of each frame its own helpers take (the look, loads during play, the sound part, the stats) and keeps it under 2 % of a frame.
- If one ever costs your game frames, on any computer, Hearth switches it off by itself for that game, keeps it off next time, and tells you once: "Hearth's helpers were slowing Clink a little; turned off: loads during play".
- While "Getting ready" shows, Hearth quietly compares a few frames with its helpers on and off, and starts without any that would make it slower.
- The F chip shows Hearth's own cost ("Hearth: 0.03 ms"); the performance doctor lists each helper's cost with **Turn them back on**. Also `/game helpers`.
- The helpers can no longer stop a game drawing, loading a picture or playing a sound, even when a game does something unusual.

## 💬 Your chats stay with their AI, whatever happens
- If an AI goes missing or you turn it off, its chats stay in your list under its own name ("Three Director — not set up"). They never slip under Claude, and opening one never moves it.
- One button, **Bring back Three Director**, finds it where it was set aside (an update, an automatic copy, a backup) or sets it up again.
- The Lab keeps its chat panel meanwhile, to read, with the same button. Right-click › **Continue with Claude…** asks first, then a copy goes on with Claude and the original stays.

## 🗂 Your settings live in your data folder
- Your agents (the Three Director included), settings, look and your own CSS moved by themselves into Hearth's data folder, which updates never touch — so what happened to the Lab's chats in round 54 can't happen again.
- The move happens once, at the first start, with an exact copy kept in `data/.configsafe`. Anything an earlier update had set aside comes back by itself.
- New defaults from updates still show up; an agent you removed stays removed. Backups, sync, Export, Recover and Go back all use your copies.
- On Windows, an update finished at a restart keeps your settings the same way, and a restart can't get stuck on an update.

## 🧊 A game in the Lab preview is lighter
- The Lab's own work around a playing game dropped to about a third. Moving the mouse over the preview no longer re-checks the whole scene every frame (about 0.5 ms of a 240 Hz frame on a big scene).
- Nothing looks different, and quality stays at full when your frames fit.

## Try it
- Press ▶ Play on Clink, then F: the chip shows "Hearth: … ms".
- Settings › Backup and files › Edit config.json now opens your own copy in the data folder.
