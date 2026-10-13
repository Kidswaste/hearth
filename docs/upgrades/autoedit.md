# autoedit (round 27): drop a song, get a whole music video

You make music visualizers in the Lab, often as 9:16 Shorts. Until now a video from a song meant arranging scenes on
the sequence yourself (or ✦ Arrange with a template). Now the Lab reads the song (its sections, drops, beat grid,
loudness and key) and proposes the **whole video, section by section**, as one strip you can change. Nothing is made
or paid for until you press **Make it**; Render uses the usual render path.

Files: `tools/three-autoedit-core.js` (the plan and the build, plain math, runs in Node), `tools/three-autoedit.js`
(the strip, Make it, Render, the director's op, the mission, `/music-video`), `tools/three-autoedit.css`.
Hooks elsewhere (small, additive): `tools/three-media.js` (the 🎬 next to the song), `tools/three-easy.js` (one row in
✦ More › ⇪ Make), `tools/three-seq.js` (`ThreeSeq.applyEdit`: a whole edit as one undo step), `mcp/three-mcp.js`
(`autoedit` in three_do, its help line), `mcp/hearth-map.js` (one line), `lazy-data.js` (lab group + manifest).
Tests: `node dev/autoedit-test.js` (unit, 16) and `dev/checks/autoedit.js` (31 steps, in the `lab` group; fixture
`/tmp/hearth-autoedit-song.wav`, a whole track made by `dev/make-test-song.js --form`).

## The plan (one strip, a block per section)
1. **🎬 next to the song's name** in the Lab timeline (only while a song is loaded): opens the plan of the whole video.
2. The video planned **by section** of the song (intro / build / drop / break / outro, from the Lab's analysis), every
   boundary on a bar line; a flat or short song gets the usual shape (intro, build, drop, outro) on its bars.
3. **A scene per section**: the scene on screen carries the drops, your other scenes (latest first) take the builds and
   breaks; a scene that comes back in another section comes back as a variation.
4. **New scenes only when needed**: with just one scene, the build and the break are proposed as new scenes the
   director makes, each with its own brief ("rising tension…", "breathing room…"), your words first.
5. **Transitions on the beat** into each section: a light flash on the beat into a drop, a camera fly-through into a
   build, a dip to black into a break, a morph into the outro, a whip between two of the same; centred on the bar line.
6. **Intensity follows the energy**: each section's energy, tempered by how loud it really is next to the others; shown
   as the bar along the bottom of its block.
7. **The cuts follow the intensity**: a cut on every bar in a full drop, every 2 or 4 bars in between, held 8 bars in
   the quiet parts.
8. **Variations get bolder with the intensity**: each cut inside a section is a variation of its scene, wilder in the
   drops, subtle in the intro.
9. **A look per section** from a family that suits the song's key (a minor key: moody / blue hour / blockbuster / black
   & white; a major key: golden hour / teal & orange / slide film / portrait film); its strength follows the intensity.
10. The strip itself: a block per section, as wide as it is long, colored by kind (intro, build, drop, break, outro),
    with its bars, scene, look and transition mark; a new scene shows dashed.
11. Click (or right-click) a block › **Scene**: the one on screen, any of your scenes, or "✦ A new one, made by the
    director" (its cost in tokens shown).
12. › **Length**: −4 / −1 / +1 / +4 bars; the next section gives or takes them, the last one sets where the video ends.
13. › **Transition in**: cut, flash on the beat, fly through, morph, dissolve, dip to black, whip, glitch stutter, bloom.
14. › **Look**: 12 color looks, or none.
15. › More › **Cuts**: every 1, 2, 4 or 8 bars, or one shot for the whole section.
16. › More › **Lyrics here / No lyrics here** (per section, once lyrics are on).
17. **🅰 Lyrics**: paste the lyrics (plain lines, .lrc or .srt text); on Make it they land on the song's onsets and beats
    (the type layers' alignment) and become captions (the big Shorts style), only in the sections that have lyrics.
18. **Frame size chip** (9:16, 16:9, 1:1, 4:5), starting from the Lab's frame size.
19. **🎲 Another plan**: other scenes and looks per section.
20. The footer says what Make it will do: sections, clips, cuts on the bars, and either "nothing to pay" or the new
    scenes' estimated tokens ("the cost shows first").
21. The plan is kept for the song: close the strip, come back later, it's as you left it.

## Make it
22. **Make it**: sections that want a new scene ask the director's crew (one helper per section, on backstage copies);
    the crew grid shows the cost and waits for your Start (the strip moves up out of its way); "no" makes nothing and
    keeps the plan.
23. With one new scene, the crew's second helper makes a second take that is kept as a spare scene (no wasted tokens).
24. A new scene that came out broken or unchanged falls back to the scene on screen, in a variation.
25. The video is built as a Lab sequence "‹song› video" (it belongs to the scene on screen): one clip per cut, every cut
    on a bar, the song under it from the start, a named marker per section, the looks and transitions of the plan, the
    lyrics as captions; **one undo step** takes it all back.
26. **↻ Make it again** after changing the plan rebuilds the same sequence (your other tracks stay).
27. The strip steps aside once the sequence is on screen; the toast offers ⇪ Render.

## Render
28. **⇪ Render ▾**: 9:16 (Shorts, Reels, TikTok), 16:9 (YouTube), 1:1, or all three (one video each), through the
    sequence's usual render (the hidden export page, ffmpeg, the Renders list).

## Reached without commands
29. Right-click the preview › ✦ More › ⇪ Make › **🎬 A music video from this song**.
30. The director's ◎ mission **"Make a music video from this song"** (in the Lab's docked director only): your message
    becomes the brief for the new scenes and the plan opens; nothing is sent to the AI, nothing is made yet.
31. **Just ask the director**: `three_do autoedit` (plan, show, set a section's scene / bars / transition / look / cuts /
    lyrics, lyrics, format, make, render); its details come from `three_do help autoedit`, so the lean tool list grows
    by one word (≈ 2 tokens, 1,183 of 1,300).
32. The app map the AI reads on demand (`mcp/hearth-map.js`) knows the music video plan.
33. `/music-video [brief] | again | make | render 9:16|16:9|1:1|all | close` stays the internal API (the menus, the
    mission and the director run the same).

**33 upgrades.**
