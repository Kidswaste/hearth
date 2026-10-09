# Scenes 2 (round 5): every chat's scene, obvious and smooth; Jam you can watch and share

You asked for each chat to have its own scene, so switching chats changes the scene and it's clear which chat (and
which agent) works on what, and for Claude and Astra to bounce back and forth on a visual. Both shipped in round 4;
this round makes them obvious and delightful without adding a single setting or button row. Nothing to set up.

## Which scene is which, everywhere
1. **A still of each chat's scene on its row.** Every Three Director chat in the chat list shows a small picture of its own scene, with the chat's mark in the corner and a thin edge in its color (brighter on the open chat).
2. **The still stays current without costing anything per frame.** It's refreshed only when the scene changes: when you leave a chat (the picture is taken anyway for the fade), when the director finishes a reply on it, after a director edits it in the background, and at every jam round. One small JPEG (≈ 3 KB) per change, kept across restarts.
3. **Background chats update their still too.** A director working on its scene while you look at another chat refreshes that chat's picture after its edits (and from its own screenshots), so the row shows what changed behind your back.
4. **Smooth cross-fade between scenes.** Switching chats lays a picture of the scene you leave over the Lab preview and fades it into the new scene once it has drawn, instead of a dark flash. The fade is a compositor animation; calm / off motion is respected.
5. **The fade never sticks.** Switching again while a scene loads keeps the first picture and fades once to the last chat's scene; the picture is cleared as soon as it has faded, so a later Run never flashes an old scene.
6. **Claude's spark and Astra's star on the scene tag.** The "who is working" avatars on the Lab preview tag are Hearth's own Claude / Astra icons instead of letters.
7. **During a jam, the one at work glows.** The tag shows both agents; Claude's spark lights while it builds, Astra's star while it directs, both while they pick the best.
8. **"Your sketches" in the chat's color.** The sketch picker has an edge in the color of the chat that owns the open sketch, and each sketch in its list is written in its owner's color (with the mark, as before).
9. **Notifications carry the chat's mark.** "Three Director replied", questions and heads-ups about a director chat show its mark and a thin edge in its color; system notifications start with the mark and end with the chat's name.
10. **The tag and the jam badge sit clear of the stats line.** The scene tag moved just above the preview's stats line (it used to hide under it when the line was long), the jam badge just above the tag.
11. **No glass blur over the live preview.** The tag and the jam badge are solid now (a blur over a picture that redraws every frame costs every frame).
12. **The tag doesn't redraw while a director works.** It's rewritten only when what it shows changes.
13. **A jam shows on its chat's row while you're elsewhere.** A chat that's jamming in the background gets the small working dot in its color.
14. **Fixed: the scene tag shrank to a dot while its chat was working.** It shared a class name with the chat list's busy dot; the tag now stays readable (title + agents) while it glows.
15. **Fixed: "Copy a screenshot" and the copied still did nothing.** The Lab fetched the picture as a `data:` URL, which the app's security policy blocks; it's turned into an image directly now.

## Jam: watch it, scrub it, share it
16. **The jam timeline.** The jam card has a filmstrip: the start and every round as a small frame, each with Claude's or Astra's icon for who led it, ★ on the kept one, broken ones in red, and the rounds still to come as empty slots. The round being made has a soft breathing edge.
17. **Scrub through the rounds.** Move over the strip (or focus it and use ← / →) and the version under the pointer shows bigger above the strip with its line: "Round 3 · Astra led: …".
18. **Click to keep.** Once the jam is over, a click (or Enter) on a frame puts that version back in the Lab with its sliders saved and a look, like ↺ on its row.
19. **Rows say who led.** Each round's line starts with Claude's or Astra's icon instead of a repeated thumbnail, so the card stays compact.
20. **The recap.** When a jam ends, one line sums it up: "Astra pushed for one hot color on near-black, then snap rotation on every downbeat and cut the slow spin; Claude added …. Round 2 kept: …". It's built from the round lines, with no extra model call, and it's what the "replied" notification says.
21. **⤴ Share, one click.** On a finished jam card: a still of the result goes to your clipboard right away (paste it anywhere) and a 10-second clip is recorded (with your song when one is loaded), then saved where you choose. Also `/jam share`.
22. **`/jam` remembers the song's idea.** With no idea given and a song loaded, `/jam` reuses the idea of the last jam you kept on that song (the card's idea says where it came from on hover); otherwise the agents still pick one from the song. `/jam <idea>` always wins.
23. **Both avatars on the tag for the whole jam** (the scene tag knows the jam's chat).

## Robust
24. **The jam's copy keeps your song and frame size.** It used to start without the song (so Astra never saw frames over the music); now the copy carries the song link, frame size and looks like any duplicated scene.
25. **The jam's sketch is its chat's scene.** Starting a jam makes its copy the chat's scene, so leaving the chat and coming back brings the jam (your original sketch stays in Your sketches, untouched).
26. **Switch chats mid-jam: the jam goes on backstage.** Its builds, checks and pictures run in the hidden backstage Lab on the jam's sketch; the chat you switched to keeps its own scene on screen, untouched. Come back and the jam is on screen.
27. **A jam never edits the scene on screen by mistake.** Every jam turn's Lab calls carry the turn's own id and go to the jam's sketch, whatever you're looking at (before, a build could land on whatever sketch was open).
28. **Opening another sketch in the jam's chat** brings the jam's sketch back at the next turn (like a message brings a chat's scene back), and that turn's edits never touch the sketch you opened.
29. **Deleted the jam's sketch mid-jam?** It comes back from the last good round at the next turn, as the chat's scene.
30. **Sliders and the look are saved only on the jam's sketch** (when it's on screen at the end), never on another chat's.
31. **Rapid switching is safe.** Ten chat switches in two seconds end on the last chat's scene, drawing, with no cover left over the preview (tested).
32. **Switching mid-edit is safe.** A director editing its scene while you switch away finishes in its own scene (backstage); the scene you switched to stays untouched (tested).
33. **Nothing lingers.** The fade's picture is dropped once faded, stills of deleted chats are pruned, and the backstage still goes blank after a minute with nothing to do.

## Commands
34. **`/jam share`**: a still to the clipboard + a 10-second clip of the latest jam's result. (`/jam`, `/jam again`, `/jam keep`, `/jam stop` and `/scene` as before; no new command names, 0 duplicates.)

## For the lead (technical)
- `chat-scenes.js`: `setThumb(chatId, dataUrl)` / `thumbOf(chatId)` (kv `chat-scene-thumbs`), `openScene(sketchId)` (snapshot → `.scene-cover.snap` → open → cleared on `animationend`), `markToast(node, chatId)`, `noteTitle(chatId, text)`, `setWorkers(chatId, list, active)`, `workers(chatId)`; `routeThree` asks `Jam.routeFor(id)` first.
- `jam.js`: `jamLab(m)` (per call: the Lab's director when the jam's sketch is on screen, else the backstage through `HubBridge.call(…, { chatId: J.routeId })`), `Jam.routeFor`, `Jam.share`, `recapOf`, the song idea memory (`store` key `jam.songIdeas`, 40 songs), `filmEl`.
- `tools/three-backstage.js`: a row still after backstage edits (at most every 4 s per chat) and from backstage screenshots.
- Small hooks outside the lane: `appui.js` replyFinished and `native.js` headsUp call `ChatScenes.markToast` / `noteTitle` (guarded by `typeof ChatScenes`).
- Tests: `node dev/smoke.js --fake-engines --script dev/checks/scenes.js --wait 6000 --check-timeout 300000` (new part 7b) and `node dev/smoke.js --fake-engines --script dev/checks/jam.js --wait 6000 --check-timeout 700000` (tag during a jam, timeline scrub / click to keep, recap, mid-jam chat switch, share, the song's idea).
