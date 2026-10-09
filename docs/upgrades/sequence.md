# Lab sequence: a video timeline right in the Three.js Lab (round 8)

You asked: "is there no timeline construction for the three.js? I want to be able to build a video timeline directly
there too." Now there is. **▤ Sequence** on the Lab timeline's strip (or `/sequence`) turns the Lab timeline into a
small video editor: your sketches, chat scenes and saved looks become clips on a main track, with footage, titles,
overlays and the song on their own tracks. The preview plays it in place (scenes switch and cross-fade without
reloading the page), every frame can be reached exactly, and ⇪ renders it frame by frame into Video Review. It is the
same sequence the video editor uses, so you can finish it there and bring it back. Little new on screen: one tab,
then one row of five small controls; the rest is right-click, keys and chat.

## One open entry
1. **▤ Sequence** in the Lab timeline's strip: one click shows the sequence, again goes back to the scene.
2. **No questions to start**: the first sequence takes the frame size you're on, the scene on screen as its first clip and that scene's song.
3. **The preview takes the sequence's shape** (9:16 · 16:9 · 1:1 · 4:5), and gives your frame size back when you leave.
4. **The music timeline tucks itself away** while the sequence shows, and comes back with the scene.
5. **Leaving brings the scene back in place**, with its own song.
6. **Calm row**: ▶, timecode · frame, the sequence's name ▾, ＋, ⇪, ⋯ (no more on screen).
7. **The strip's own ▶ plays the sequence** while it shows.
8. **Several sequences**: the name chip lists them, ＋ New sequence, Rename…, Format, Delete (under More…).
9. **Stored with the editor's sequences** (one model: Video Review lists it as an ordinary sequence).

## Tracks
10. **Main track: scene clips** (a sketch or a chat scene, playing on its own clock from the clip's start).
11. **A scene clip with a saved look** (its slider values, per layer), chosen in its right-click menu.
12. **A scene clip with a board vibe**: the reference's palette on the scene's colors (never its footage).
13. **Footage clips** on the main track (the labframes / editor cut model: in–out, speed, muted with a song).
14. **Pictures** on the main track.
15. **Title cards** and gaps on the main track (from the editor).
16. **Titles track**: the editor's title items, with its title styles and animations.
17. **Overlays track**: a Lab layer or filter over a range of the program (its code travels with it).
18. **Overlays track: footage or pictures** over a range (the editor's overlays).
19. **Sound track: the song** (its analysis, grid and live triggers still drive whatever reacts to it).
20. **Sound track: more audio clips** at any time.
21. **Footage with its sound on** plays it (the music stays what reacts).
22. **Each lane says what it takes** while empty (Titles, Overlays, Sound).
23. **Scene clips show their thumbnail**, footage 🎞, sound ♪, overlays ◭, a ◐ for a board vibe.
24. **A bow tie over each transition** shows where it overlaps the cut.

## Building it easily
25. **＋ picker**: your chat scenes, sketches and saved looks as tiles with pictures, searchable; click adds at the end.
26. **Drag a tile onto the tracks** to place it where you drop (a gold line shows where).
27. **Drag files from your computer** (videos, pictures, sounds; a sound dropped on the Sound lane becomes the song).
28. **Drag a library card from Video Review** onto the tracks.
29. **Drag a mood-board reference** (the board drawer) onto a scene: it takes the vibe, not the footage.
30. **Right-click the preview → ▤ Add this scene to the sequence** (at the playhead while the sequence shows).
31. **Your sketches dialog → right-click → ▤ Add to the sequence**.
32. **Right-click an empty spot on a track**: ＋ Scene here, ＋ This scene here, ＋ Title here, ＋ Overlay here (this scene's layers or a filter), ＋ Marker here, Paste.
33. **＋ → 🎞 Footage / file…**, **T Title**, **◭ Overlay ›** in the picker's bottom row.
34. **Sensible lengths**: a scene lasts 4 bars with a song, 4 s without; footage up to two scene lengths.
35. **A cross dissolve between scenes by default** (a beat long with a song, half a second without).
36. **New scenes fit the bars** of the song by themselves.
37. **Dropped clips never split another clip**: they go to the nearest cut.
38. **"At bar 9"** (from a command or a director) keeps that time, with a gap before it if needed.
39. **A gap holds the time**: trimming the clip before it, or a transition into the clip after it, never moves what follows.

## Editing (the editor's keys)
40. **S** splits the clip under the playhead (a scene's second half carries on in the scene's own time).
41. **Delete** lifts (a gap keeps the timing).
42. **Shift+Delete** ripple deletes (the rest moves up).
43. **D** duplicates.
44. **Q / W**: the clip starts / ends at the playhead.
45. **Drag a clip** to move it between two others (the gold line shows where); items move freely.
46. **Drag an edge** to trim (a scene's content stays in place, like a video's in-point).
47. **Alt+drag** slips (the same place and length, another part of the scene or footage).
48. **Alt+← / →** slips the selected clip one frame.
49. **M** adds a marker; right-click the ruler for ＋ Marker here.
50. **⌘/Ctrl+C / V** copy and paste a clip.
51. **⌘/Ctrl+Z / Shift+Z** undo / redo (150 steps).
52. **Esc** deselects; Shift+click adds to the selection.
53. **Double-click a scene** to edit it (the sequence waits on the tab); a title to retype it.
54. **Snapping** to bars, beats, markers, clip edges and the playhead (edges win a tie), with a gold guide.
55. **Snapping on / off** in ⋯ (remembered).
56. **Right-click a scene**: Edit, Look ›, Replace with ›, Remove the board vibe, Transition in ›, Length ›, Split, Duplicate, Starts / Ends here, Delete, Ripple delete.
57. **Right-click a title**: Text…, Style › (the editor's styles), Animation › (the editor's animations).
58. **Right-click footage**: its sound on / off.
59. **Transition in ›**: ten common ones, More transitions › (every editor transition by group), 0.25 / 0.5 / 1 s.
60. **Length ›**: 1 / 2 / 4 / 8 bars (with a song), 1 / 2 / 4 / 8 s, or type one ("4 bars").
61. **⋯ → ▦ Every cut on a bar** (the whole sequence fitted to the song).
62. **⋯ → Transitions everywhere ›**.
63. **⋯ → Clear the sequence…** (undoable; the song stays).
64. **⌘/Ctrl+wheel** zooms the tracks; the wheel pans when zoomed; **\\** zooms to fit.

## Playing and frames
65. **Space** plays the sequence in the preview; scenes switch and cross-fade in the same page (no reload).
66. **Frame-exact seeks**: any frame of any scene (each scene's own clock: `performance.now`, frame timestamps, THREE.Clock, `layer.time` count from the clip's start).
67. **Keyframes move with the clip** (layer keyframes and slider keyframes are relative to the clip).
68. **Only the clips around the playhead run** in the page (the next one warms up hidden, so it has drawn when it shows).
69. **The editor's own transition drawing** in the Lab preview (what the editor shows is what the Lab shows).
70. **The editor's own title drawing** in the Lab preview (styles, animations, the Oxanium font).
71. **Footage at its exact frame** while paused; it plays along while playing.
72. **The song leads the clock** while it plays (the wall clock smooths it), so the music stays in sync.
73. **J / K / L**: backward · stop · forward; again: faster.
74. **← / →** one frame (Shift: ten); **Home / End**; **↑ / ↓** previous / next edit point.
75. **Click the timecode** to go to a time, `f120`, `00:00:04:12` or `bar 9`.
76. **⋯ → ⟲ Loop**.
77. **The playhead moves on the compositor** while playing (one animation, no per-frame DOM writes).
78. **A sketch edit (yours or a director's) reaches the clips using it** without leaving the sequence.

## One model with the editor
79. **⋯ → ✂ Finish in the video editor**: the same sequence opens in Video Review's editor.
80. **Scene clips show in the editor** with their thumbnail (◭ Lab scene · look), overlays as ◭ Lab layers.
81. **The editor's monitor shows a scene's picture** (its thumbnail) where it has no video.
82. **The editor renders Lab scenes** by having the Lab render each one to a video first (exact length, frame size).
83. **Changes made in the editor come back** to the Lab sequence (titles, transitions, trims…).
84. **Editor → Sequence › ◭ Back to the Lab sequence** (and right-click a scene clip there → ◭ Edit it in the Lab).
85. **The Video Director reads Lab scene and Lab layer clips by name** in the editor (`video_edit_read`), and its help mentions the sequence.
86. **A song longer than the pictures** ends the editor's range where the pictures end.

## Render
87. **⇪ Render** frame by frame: the preview's clock steps one frame at a time, each frame drawn at the exact frame size (1080×1920 for 9:16…), then ffmpeg muxes the sound.
88. **Every social format** from ⇪ (9:16 · 16:9 · 1:1 · 4:5), or **Render every format**.
89. **The sound mixed in**: the song from its in-point, audio clips, footage with its sound on.
90. **Music reactivity in the offline render**: the song's spectrum is computed per frame, so what reacts to it reacts the same.
91. **Into Video Review's library**, with an Open in Video Review button; cancel from the toast.
92. **Without ffmpeg**: it plays once in real time into the page's recorder (WebM / MP4 with the song).
93. **Your frame size and the sequence view come back** after a render.

## Chats and directors
94. **`/sequence`** (alias `/seq`): no args shows / hides it; sub-commands status, list, new, open, add, footage, title, overlay, song, transition, length, look, split, delete, move, duplicate, fit, format, play, pause, go, render, editor, back, undo, redo, keys (with completions).
95. **`/add-scene [scene] [at bar 9] [for 4 bars] [look name]`**.
96. **`/sequence-render [9:16|16:9|1:1|4:5|all]`**.
97. **Ctrl+K actions**: Lab: Sequence, Add this scene to the sequence, Render the sequence 9:16, Finish the sequence in the video editor.
98. **Directors (Claude and Astra)**: `three_do { cmd: "sequence", op }` builds, edits, seeks, looks at a frame (with its picture) and renders the sequence (full mode: `three_sequence`); clips by number, "Titles.2" or name.
99. **Help topic `sequence`** in the app map (also `seq`, `montage`, `storyboard`), read on demand (no extra prompt tokens).
100. **Video projects (`/intro`)**: each Lab beat is now rendered frame by frame at exactly its length through the sequence (the screen recording stays the fallback).
101. **Keys in the keys button** (area "Lab sequence"), and ⋯ → Keys lists them.
