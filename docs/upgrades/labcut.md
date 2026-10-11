# Labcut: the Lab sequence as your whole video editor (round 18)

Video Review is gone (round 17), so the Lab sequence (▤ Sequence on the Lab timeline, `/sequence`) is now your only
video timeline. It already cut scenes, footage, titles and the song on the beat; it now also frames footage for each
social format, mixes several sound tracks with the music ducking under a voice-over, puts captions and lower thirds on
their own text tracks, gives any clip a color look, chops clips on the song's bars, and renders one sequence into
several formats in one go. Nothing new on screen: it all sits in the clip's right-click menu, the lane's right-click
menu, ⋯ (four new entries: Sound, Text & captions, Color look, Outputs), two keys and `/sequence …`.

The timeline stays light: one canvas, only the clips in view are drawn, footage thumbnails cached as before, the
playhead on the compositor; the preview page does the framing, gains and looks itself (no DOM writes per frame, a
gain is touched only when its target moves). New code: `tools/three-seq-cut.js` (pure, also sent to the preview page),
in the Lab's lazy group.

## Footage and pictures
1. **Frame › Fit**: Fill the frame (crop), Fit inside (bars) or **Fit on a blurred fill** (the picture behind itself, softly).
2. **Frame › Position**: center, left, right, top, bottom, left third, right third (where the crop sits).
3. **Frame › Zoom**: 100, 110, 125, 150, 200 %.
4. **Framing per format**: what you set in 9:16 belongs to 9:16; 16:9 stays centered until you frame it too (swap the frame size to frame each one).
5. **Frame › Same framing in every format**.
6. **Frame › Back to auto (centered)**.
7. **Frame › Pan across…**: a keyframed move typed in words ("from left to right", "from top to bottom zoom 130%"), across the clip.
8. Move (Ken Burns) **Slow push in**.
9. Move **Slow pull out**.
10. Move **Pan left → right**.
11. Move **Pan right → left**.
12. Move **Tilt top → bottom**.
13. Move **Tilt bottom → top**.
14. Move **Push in, drifting left**.
15. Move **Push in, drifting right**.
16. Move **Punch in (fast)**.
17. Move **✦ Auto**: one gentle move that suits the clip (the same one every time).
18. **Pictures move by default** (a slow push in), so a still never reads as a freeze; Move › Still turns it off.
19. **Renders and recordings in the ＋ picker** (your latest, searchable): click or drag them onto the tracks.
20. **Right-click a finished render → ▤ Add to the Lab sequence** (the render queue's menu).
21. **Right-click a board clip → ▤ Add to the Lab sequence**, with the in / out points you set on the board.
22. Footage clips show **⛶** when framed, their volume and their color look; pictures show **▣**.
23. Footage on the Overlays track with its sound on is now in the render's mix too.

## Sound
24. **Volume per clip** (footage, sound clips, the song): Mute to 200 %, or type one ("50%", "0.5", "-6 dB").
25. **Fade in per clip** (0.25 … 4 s).
26. **Fade out per clip**.
27. Fades drawn as **ramps** on the sound clips.
28. **A Voice track**: ⋯ → Sound › ＋ Voice-over… (or right-click the Sound lane).
29. **An SFX track**: ＋ Sound effect… at the playhead.
30. **One row per sound track** on the Sound lane (Song · Voice · SFX…); the timeline grows to fit them, and a click hits the clip on its own row.
31. **Drop a sound on the Voice or SFX row** and it lands there (on the song's row it still becomes the song).
32. **The music ducks under the voice**: the song, other sounds and footage sound dip while a voice clip plays (in the preview and in the render, the same curve). On by default once there is a voice.
33. **How much it ducks**: −6, −12 or −18 dB.
34. **The song's own volume and fades** (⋯ → Sound › The song).
35. **Mute a sound track** (right-click its row, or ⋯ → Sound › Mute a track); a text track can be hidden the same way.
36. Text rows say what they are: captions 💬, lower thirds ▁, titles; a muted / hidden track says so.

## Titles, captions, lower thirds
37. **Captions from an .srt / .vtt file** (⋯ → Text & captions, right-click the Titles lane, drop the file on the timeline, or the ＋ picker's file button): a **Captions** track with every cue at its time.
38. **Type captions**: one line each; over the In–Out range when there is one, else one line a bar of the song (every 2 s without).
39. Caption look **Clean**.
40. Caption look **On a box**.
41. Caption look **Social** (big, stroked, word by word).
42. Caption look **Forgeheart gold**.
43. Caption look **Subtitle** (small).
44. **Save the captions as .srt** (⋯ → Text & captions).
45. **Every render writes the captions as an .srt next to the video** (just the range's captions for a range render), so platforms get real captions.
46. **＋ Lower third…**: "Name — Role" becomes a two-line lower third (Forgeheart look by default, two bars long with a song).
47. **Lower third look**: the app’s 36 lower-third presets, for the new ones and the selected (or all) lower thirds.
48. **Right-click a caption → Caption look**, **a lower third → Lower third look**.
49. Overlapping captions or titles get a row of their own instead of hiding each other.

## Transitions and color
50. **One transition library** (right-click a clip → Transition in): the most used first (cut, dissolve, dips, flash, wipes, push, zoom, whip, spin, glitch, RGB split, pixelate, iris, blur, light leak, film burn), then the Lab moves and every other group as submenus; type to find any of the 142.
51. **2 s** and **one beat** transition lengths.
52. **⋯ → Transitions everywhere** uses the same library.
53. **Color look per clip** (right-click → Color look): the app's 197 looks (a few favorites first, then every group, searchable).
54. **Look strength**: 25, 50, 75, 100 %.
55. **A color look for the whole sequence** (⋯ → Color look); a clip's own look wins.
56. **The look is the same in the preview and in the frame-by-frame render** (one color matrix the preview applies to the clip).
57. Clips show **◑ their look**.

## Cuts on the music
58. **✂ Chop on every bar** (right-click a clip, or **B**): the clip cut on the song's bar lines.
59. **Chop on every beat** (**Shift+B**).
60. **Chop on every 2 bars**.

## One sequence, several outputs
61. **⋯ → Outputs**: tick the formats this sequence goes out in (9:16 · 4:5 · 1:1 · 16:9).
62. **Socials** (9:16 · 1:1 · 16:9) and **All four** in one click.
63. **⇪ Render the outputs**: one video per format, one after the other in the render queue, each with its own framing.
64. **The ⇪ Render panel starts on the sequence's outputs** when it has some.

## Speed
65. **The timeline draws only what's in view** (main clips and track clips off screen are skipped before anything is measured).

## Chat and directors
66. `/sequence volume [clip n…] <50% | -6 dB | mute>`.
67. `/sequence fade [clip n…] <in | out | both> <secs>`.
68. `/sequence frame [clip n…] <from left to right | right third | zoom 120% | fit | blur | fill | reset> [all formats]`.
69. `/sequence move-cam [clip n…] <push-in | pull-out | pan-left | pan-right | pan-up | pan-down | punch | auto | none>`.
70. `/sequence grade [clip n… | all] <look | none> [50%]`.
71. `/sequence chop [clip n] [bar | beat | 2 bars]`.
72. `/sequence voice <path> [at …]`.
73. `/sequence sfx <path> [at …]`.
74. `/sequence duck [on | off | 6 | 12 | 18 dB]`.
75. `/sequence captions <file.srt | line one | line two…> [look …]`.
76. `/sequence caption-look <clean | box | social | gold | subtitle>`.
77. `/sequence lower <Name — Role> [look <preset>] [at …]`.
78. `/sequence outputs <9:16 1:1 16:9 | socials | all | render>`.
79. `/sequence mute <track>`.
80. `/sequence srt` (save the captions).
81. Ctrl/⌘+K **Lab: Render every output of the sequence**.
82. Ctrl/⌘+K **Lab: Captions for the sequence from a file (.srt)**.
83. Ctrl/⌘+K **Lab: Add a voice-over to the sequence**.
84. **Directors (Claude and Astra)**: `three_sequence` / `three_do sequence` ops reframe, motion, volume, fade, grade, chop, duck, mute_track, captions, caption_look, lower, outputs, render_outputs, and add { voice | sfx | captions | footage with in / out }; clip descriptions mention volume, fades, framing, moves and looks (help: op "help").
85. **The app map's sequence topic** explains them (read on demand, no prompt tokens).
86. **B / Shift+B** in the keys sheet (area "Lab sequence") and ⋯ → Keys.

## Tested
- `dev/checks/labcut-edit.js` (new, 36 steps): the pure lib (.srt, framing words, ducking curve, chop times); a
  picture's framing read back as pixels (left / right / fit inside), framing per format, the pan, a move; volume, fades,
  a voice track and the ducking plan the preview gets, rows per sound track and hitting the right one, mute; a black &
  white look read back as pixels, a sequence look; chop on bars; captions from an .srt, caption looks, typed captions,
  saved as .srt and read back; a lower third; the clip menu and the transition library's filter; outputs 9:16 + 1:1
  rendered (ffprobe: 1080×1080 with sound) with an .srt next to each. Passes.
- `sequence`, `sequence-render`, `sequence-smooth`, `seqguard-edit`, `qa-commands` pass; `node dev/lazy-manifest.js
  --check` passes (no duplicate commands).
- `sequence-mcp` fails at "Astra: render 1:1" with and without this stream's changes (checked by running it against the
  round 17 versions of the Lab sequence files): a pre-existing failure of the fake-Astra render step.

## Risks
- Ducking and song volume in the real-time recording (no ffmpeg) use the preview's own gains, except the song, whose
  recording tap sits before its gain: the song isn't ducked in a real-time take (the ffmpeg render is).
- Per-format framing applies to footage and pictures; 3D scene clips reframe themselves (their camera follows the
  frame size) as before.
- Captions typed over existing ones go on a second Captions row and both show at once.
