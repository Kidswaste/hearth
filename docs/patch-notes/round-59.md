# Round 59: Lab scenes start faster and draw every shadow
*October 2026*

## 🧊 Lab scenes start faster the second time
- Getting ready now prepares what your game hides for later (a pickup that appears after a few seconds, for example) behind the card, so a second ▶ Play of a Lab scene no longer warms up longer than the first. On the test machine the third ▶ Play went from 16.6 s to about 8–10 s.

## 🌗 Lab scenes draw every shadow
- On a Lab scene, ▶ Play now prepares the smaller backup shadow behind the card too, like HTML builds, so the Best look can step down mid-game without building anything new.
- A frame drawn while shadows were being swapped could drop everything that receives a shadow (on a real graphics card: a flicker or a black frame). Fixed: no graphics errors in any test run.

## 🎬 Exact frames come out right
- Sequence frames, renders and exports could come out black or carry the previous frame's sound. Each exact frame now draws and hears its own moment.

## Small fixes
- Creative Playground, Commands and "Put tools back in the rail…" have their icons in the rail's ⋯ menu.
- What's new shows plain words instead of /command names.

## Also on main from Astra (Codex)
- A quieter Paris field kit with personal quests and rewards, Paris tile fixes, and colored icons with accessible hints across Sidequest.
