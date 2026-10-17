# Round 54 fixes: smooth ▶ Play again, your Lab chats back, Astra's quest journal
*October 2026*

## 🎮 ▶ Play is smooth again
- Round 54's "no freezes mid-game" helper treated every bullet, spark and particle a game adds each frame as something new to prepare, which cost about a quarter of every frame. It now prepares only genuinely new kinds of things and never touches a game's steady per-frame work.
- Best graphics no longer re-checks the whole scene once a second (a small regular hitch), and shadows are capped at a sharp 2048 (1024 for point lights).
- In our test game, Best now costs about 0.07 ms a frame instead of 0.7 ms.

## 🛟 Your Lab chats are back
- An update could set your Hearth settings aside, along with the Three Director docked in the Lab, so its chats (Clink's too) moved under Claude. Your chats were never touched.
- Hearth now brings back what an update set aside, by itself, a moment after it starts — the Three Director with its chats, your look and your theme — and updates can't set them aside like that any more.

## ✦ Quest journal (by Astra)
- Creative Playground opens on a quest journal: creative campaigns, small steps, XP, skill paths and rewards you choose. Your earlier daily prompts and notebook are kept underneath.
