# Lab sequence 2: fewer decisions, Lab-only moves, each scene owns its sequence (round 9)

You asked for "timeline construction in the three.js… build a video timeline directly there", and then "also tie the
sequences to each scene in the lab". The ▤ Sequence from round 8 now builds itself from your scenes on the song
(✦ Arrange), has ten transitions only a live 3D Lab can do, edits like a real NLE (roll, slide, slip, nesting,
markers, a clipboard across sequences), and every scene (every director chat's scene) has its own sequence that comes
and goes with it. Nothing new on screen but tiles in the ＋ picker: the rest is in ⋯, right-click, keys and chat.

## Each scene owns its sequence
1. **▤ Sequence opens the scene's own sequence**: every sketch / chat scene has one; the first time, it is made without asking (that scene as one clip on its song, or empty when it has no song).
2. **Switching chats or scenes switches the sequence** while ▤ shows: the next scene's sequence takes the view in the same page (no reload), the old picture fading out.
3. **The sequence keeps its shape and song while you switch** (scenes' own frame sizes and songs come back when you leave the view).
4. **Duplicating a scene duplicates its sequence** (its clips of that scene point at the copy), from Your sketches and when a chat starts from another chat's scene.
5. **Rename, jam rounds and Claude ⇄ Astra handoffs keep it** (it belongs to the scene, not to a name or an engine).
6. **Old sequences move in by themselves**: one that belonged to no scene goes to the scene it starts with; the others stay under the name chip's **Other sequences ›**.
7. **The name chip lists this scene's sequences first**, then Other sequences ›, ＋ New sequence (for this scene), Give this one to the scene on screen (under More…).
8. **The chat row's still shows a small ▤** when its scene has a sequence, and its tooltip says how long.
9. **Your sketches → right-click → ▤ Its own sequence** (with its clips and length) opens the scene and its sequence.
10. **Directors act on their own chat's sequence**: `three_sequence` / `three_do sequence` works on the director chat's scene (even backstage); `of: "<scene>"` reaches another scene's.
11. **A sequence you opened on purpose stays the one commands act on** until another scene comes on screen.

## ✦ Building with fewer decisions
12. **✦ Arrange my scenes on the song** (⋯, the ＋ picker's first tile, `/arrange`, `/sequence make`): the scene on screen, your other chat scenes and latest sketches, laid on the song with no questions.
13. **The song's sections set the pace**: long clips in the intro, two-bar cuts in the build, a cut on every bar in the drop, slow ones in the outro.
14. **Every cut lands on a bar line** (the cut is the middle of its transition).
15. **Transitions matched to section changes**: a camera fly-through into the build, a light flash on the beat into the drop, a dip into the break, a morph into the outro; hard cuts inside the drop.
16. **A scene that comes back in another section comes back in another look**: one of its saved looks, else a variation of its sliders.
17. **Never the same scene twice in a row**; each section starts on its own scene.
18. **A marker at each section** (named Intro, Build, Drop…), replaced when you arrange again; your own markers stay.
19. **A short or flat song still gets a shape** (intro, build, drop, outro on its bars) when the analysis finds one section.
20. **✦ Again** (⋯ or `/sequence again`): the same template, another arrangement, like 🎲 Shuffle; ⌘/Ctrl+Z goes back.
21. **Re-arranging replaces only what the arrangement made** (its titles and markers); your titles, overlays and sound stay.
22. **Arrange as ›**: the ten templates in one submenu.
23. Template **Music video**: the whole song, a calm intro, cuts every bar on the drop, a slow outro, ending on the first scene.
24. Template **Product intro**: 30 s, a title, the build, the drop with the product name, an end card.
25. Template **Teaser (15 s)**: around the first drop, fast cuts, a hard stop with the name.
26. Template **Bumper (6 s)**: one hit, two or three scenes, the name.
27. Template **Seamless loop**: a few bars that end on the scene they start with (⟲ Loop on), morphs between scenes.
28. Template **Lyric video**: slow scenes, one line of your text per two bars (asks for the lines; empty = placeholders).
29. Template **Changelog**: one scene per item, each item as a lower third (asks for the items).
30. Template **Reel (30 s, fast)**: fast cuts on the beat, every section change a Lab move.
31. Template **Slow mood**: long scenes melting into each other, no hard cuts.
32. Template **Drop showcase**: just the drop, every scene once, a cut on every bar, glitch stutters.
33. **✦ Let Astra pick one** (Arrange as › bottom, `/sequence decide`, `/decide arrangement`): one small question with a picture and a few words about the scenes and the song; applied with Undo; a local default without tokens when no engine answers.
34. **Shorter versions ›** 15 s, 6 s, 15 + 6, 30 s (`/sequence versions 15 6`): new sequences of the same scenes, looks and song, cut around the drop, owned by the same scene; a toast opens them.
35. **`/sequence versions 15 6 render`** renders them too.
36. **✦ Fill this gap** (right-click a gap, **G** at the playhead, `/sequence fill`): a scene that isn't on either side, the least used, in a look of its own, with a dissolve in; the time after the gap doesn't move.
37. **Fill with ›** a scene of your choice (right-click a gap).
38. **✦ A variation per section** (⋯, `/sequence sections`): scenes that come back in another section look different.
39. **Re-time to a song…** (⋯ More…, `/sequence retime <song>`): the clips keep their order and looks, the cuts move to the new song's bars and sections.
40. **Song and analysis wait for themselves**: arranging loads the sequence's (or the scene's) song and waits for its beat grid and sections.

## Variations and looks per clip
41. **V: a new variation of the scene clip** (its sliders nudged, colors turned together, like Shuffle for one clip); the same clip always looks the same.
42. **Shift+V: back to the scene as saved**.
43. **Look › Variation strength** 15 / 30 / 50 / 80 %.
44. **Look › Copy this look / Paste the look** (saved look, variation and board vibe; paste onto several selected clips).
45. **Look › Swap looks with the next scene**.
46. **A ✦ on clips that play a variation**; `/sequence vary <clip> [30%|reset]`.

## Lab transitions (moves only a live 3D Lab can do; also in the video editor)
47. **Camera fly-through**: each scene's own 3D camera flies forward, out of one and into the next (the Lab moves the real camera for those frames).
48. **Camera pull-back**: the reverse move.
49. **Morph (shared layers stay)**: layers both scenes share (same name, or same code) stay on screen at full strength while the rest changes.
50. **Depth wipe (near first)**: the nearest, brightest parts switch first.
51. **Depth wipe (far first)**: the dark, far parts first.
52. **Datamosh between scenes**: blocks of the new scene smear in with the old one's motion, torn rows.
53. **Glitch stutter**: frames of both sides stutter before it lands.
54. **Match cut on the shape**: the old scene pushes in on its bright shape; the new scene's shape lands at the same place and size, then settles.
55. **Light flash on the beat**: a white bloom right on the cut (arranged cuts sit on bars).
56. **Bloom through**: everything glows up and swaps inside the glow.
57. **✦ Lab moves ›** in a clip's Transition in › and in ⋯ → Transitions everywhere ›, with a line about each.
58. **In the video editor too** (group "Lab" in its transitions), each with a canvas preview and an ffmpeg version for its render.
59. **The editor bakes Lab-only moves exactly**: scenes joined by a morph or a fly-through are rendered together through the Lab, transition included.
60. **`/sequence transition lab-fly`** etc. complete the Lab moves.

## Editing comfort
61. **Shift+drag an edge: roll** the cut (one clip longer, the next shorter, the length stays; a scene's content stays in place).
62. **Shift+drag a clip: slide** it (its neighbours trim).
63. **⌘/Ctrl+drag: slip** (as Alt+drag).
64. **Right-click → Edit points ›** (More…): roll the cut before to the playhead, slide to the playhead, slip ± 1 frame / + 1 beat.
65. **Nested sequences**: a sequence as a clip (＋ picker tiles, name chip → Other sequences › ＋ Nest one here, `/sequence nest <name>`); it plays that sequence's pictures and titles, cut to its window.
66. **Right-click a nested clip → Open it**, or **Unnest** (its clips here, editable).
67. **A sequence can't hold itself** (a missing or circular one shows as a card that says so).
68. **Copy several clips** (⌘/Ctrl+C on a selection, right-click → Copy) **and paste them into another sequence** (another scene's too): main clips in order, titles and overlays at their offsets; the clipboard survives switching and restarts.
69. **`/sequence copy 2 3` / `/sequence paste [at …] [into <name>]`**.
70. **Markers show their names** on the ruler.
71. **Right-click a marker**: Go to, Rename…, Split there, Delete.
72. **Markers at the song's sections** (ruler right-click, ⋯ → Markers ›, `/sequence markers`); Clear the markers.
73. **`/sequence marker <label>`**.
74. **Clip pictures**: each clip shows itself as it plays in the sequence (its look, its variation), taken when the playhead rests in it.
75. **Footage clips show their first frame.**
76. **The song's waveform on the Sound lane** (from the Lab's analysis, drawn only when the lane redraws).
77. **Zoom presets** (⋯ → Zoom ›, ruler right-click): the whole sequence, 8 / 4 / 1 bars, 10 / 5 / 1 s.
78. **+ / − zoom** at the playhead; `/sequence zoom 4 bars`.
79. **Playing while zoomed in, the view turns the page** when the playhead nears the edge (one redraw a page, never a scroll every frame).
80. **The playhead still moves on the compositor** (one animation while playing; measured: about 5 DOM changes a second while an arranged sequence plays).

## Closing the known gaps
81. **A scene's own hit markers move with its clip** (like its keyframes): its song's kick / snare / hit markers fire at the clip's time, not the sequence song's; `audio.since` / `next` / `hits` follow.
82. **A scene's cue looks move with its clip too** (✦ a look per section: held at the cues' times, shifted with the clip).
83. **Footage sound in the real-time recording** (no ffmpeg): footage with its sound on (and sound clips) go through the sequence's own sound bus into the take.
84. **Sound clips play in the preview** (and the real-time take), not only in the ffmpeg render.
85. **The editor's export of a Lab sequence is tested end to end** (scenes baked, Lab-only moves baked together, frames read back).
86. **The editor's Record / no-ffmpeg export of a Lab sequence** goes through the Lab's real-time take (the editor's own recorder only had the scenes' pictures).
87. **A Lab-only sequence exported from the editor lands next to the Lab's renders** (it used to aim at "/exports" at the root of the disk).

## Chats and directors
88. **`/arrange [template] [for 15 s]`**: the shortest way to "make a sequence from my scenes on this song".
89. **`/sequence make | again | templates | decide | versions | fill | vary | sections | swap | retime | nest | unnest | copy | paste | marker | markers | zoom | scene <name>`** with completions.
90. **Directors** (`three_do sequence` / `three_sequence`, both engines): arrange { template, scenes, secs, lines }, again, templates, decide, versions { secs, render }, fill, vary, vary_sections, swap_looks, retime { song }, nest / unnest, copy / paste { into }, roll, slide, marker, section_markers, zoom, render { format: "all" }; `of` for another scene's sequence (help: op "help"; the tool's description grew by a few words).
91. **The app map's sequence topic** explains arranging, the Lab moves and scene ownership (read on demand, no prompt tokens).
92. **Ctrl+K**: Arrange my scenes on the song, The 15 s and 6 s versions, Let Astra pick the arrangement.
93. **Keys in the keys button** (area "Lab sequence"): V, Shift+V, G, + / −, Shift+drag edge / clip, ⌘/Ctrl+drag.
