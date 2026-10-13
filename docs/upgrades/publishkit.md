# publishkit (round 27): from a finished render to ready-to-post

You make music visuals, often 9:16 for YouTube Shorts, TikTok and Reels. After a render, **📮 Ready to post** checks
the video for the app you're posting to, helps pick the cover, drafts the words, and puts everything in one tidy
folder. **Hearth never uploads and never signs in anywhere**: it makes the files, you post them yourself.

How to get there (no command needed): the **📮 Post** button on a finished render's note, **📮** on a finished video in
the renders list (⇪ at the bottom of the rail), its right-click menu, or the ◎ mission **Get it ready to post**.

## Ways in
1. **📮 Post** on the note that says a render finished (next to Open, Finder, Copy path).
2. **📮** on every finished video in the renders list and its History tab.
3. **📮 Ready to post…** in a render's right-click / ⋯ menu.
4. ◎ mission **Get it ready to post**: takes your newest render (or a video path in your message), picks the platform from your words ("for TikTok", "reels", "youtube"), opens the kit and has this chat's AI write the title, description and hashtags at once.
5. Ctrl/⌘+K: **Get a render ready to post (Shorts, TikTok, Reels…)** (asks for a file when nothing was rendered yet).
6. `/post [last | <video path>] [shorts|tiktok|reels|youtube|square]` opens it and answers in the chat with the verdict, what to fix and the cover ideas (for you and for the AIs).

## Platforms (one row of chips)
7. **YouTube Shorts**: 1080×1920, up to 3 min, loops, `#shorts` added to the hashtags.
8. **TikTok**: 1080×1920, up to 10 min, short loops (under 45 s) noted as the sweet spot.
9. **Instagram Reels**: 1080×1920, up to 3 min, the profile grid's 3:4 crop shown on the video.
10. **YouTube 16:9**: 1920×1080, the thumbnail at 1280×720 under 2 MB, "over 15 min needs a verified account".
11. **Instagram square**: 1080×1080.
12. The platform is guessed from the video's shape (or your words) and the last one you used is remembered.

## The preview
13. The video is framed the way that app frames it: vertical apps crop it to fill, YouTube / square letterbox it.
14. **▦ Safe areas**: each app's own buttons and texts drawn over the video, labelled (search bar, like / comment / share, caption and sound, progress bar, the length stamp…).
15. A zone turns **red** when detail (text, the subject) sits under it.
16. Reels: a dotted 3:4 frame shows what the profile grid keeps.
17. ▶ / ❚❚ and a scrub bar (Space plays and pauses).

## The checks (plain words, worst first)
18. **Shape**: the right aspect for the app, or what the app would do with it (crop, bars, "not a Short").
19. **Pixels**: too small → soft once scaled up; bigger than shown → just a heavier upload.
20. **Length limit** per app (Shorts / Reels 3 min, TikTok 10 min, square 15 min…).
21. **Length tips**: very short (< 3 s) warned; outside the app's sweet spot noted; long YouTube videos need a verified account.
22. **Frame rate**: over 60 or under 23 fps warned.
23. **Bitrate**: too thin for the app's re-encode (scaled to the frame size), or more than the app keeps.
24. **Codec / pixels**: not H.264 / HEVC, or not 4:2:0 (wrong colors on phones).
25. **Sound**: no sound at all is flagged (a music visual needs its song).
26. **Loudness** (EBU R128): too loud (the app turns it down and squashes it), too quiet (weak next to other posts), peaks over -1 dB (crackle after re-encoding), or "right where the app plays it" near -14 LUFS.
27. **Detail under the app's buttons**: where the edges and the subject sit, summed over ~40 frames, compared with the safe area; worked out in the video's own picture even when the app crops or letterboxes it.
28. **Seamless loop** (Shorts, TikTok, Reels): the last frame against the first, measured against the video's usual motion: "loops seamlessly" or "it jumps when it replays".
29. **One verdict line**: ✓ Ready to post / ! Almost: n things worth fixing / ✕ n things to fix, with the app's name.
30. One fix button per fix (a 9:16 render that solves shape, pixels and bitrate shows once).

## Fixes (a better copy through the render queue ⇪, the original stays)
31. **Make a 9:16 / 16:9 / square copy** (also "Render at 1080×1920", "Make an H.264 MP4"): the matching render-queue preset, cut to the app's limit if it's longer.
32. **Even it out to -14 LUFS / Tame the peaks**: the sound evened out (ffmpeg loudnorm, true peak -1 dB), the picture copied untouched: "<name> (-14 LUFS).mp4".
33. **Make it loop**: the end blends into the start (picture crossfade + sound crossfade, about 12 % of the length, at most 1 s): "<name> (loop).mp4".
34. **Cut to 3:00** (or the app's limit), exact: "<name> (3m00).mp4".
35. When a fix is done, the kit switches to the new copy and checks it again by itself; the platform, your words and cover words stay.

## The cover
36. **Cover ideas**: up to 6 frames that are sharp, well lit, on a strong moment, contrasty and colorful, spread over the video, never the first / last 3 % (black frames are skipped); hover says why.
37. **The cover is the frame you're on**: click an idea or scrub to any frame.
38. **Words on the cover** (optional): big, white, outlined, fitted to up to 3 lines, kept in the safe area (above the caption zone on vertical apps, in the middle of the grid crop on Reels).
39. A live preview of the cover next to the ideas.
40. Saved at the app's cover size: 1080×1920 (Shorts, TikTok, Reels), 1280×720 under 2 MB (YouTube thumbnail, quality lowered until it fits), 1080×1080 (square).

## The words (you edit them)
41. **Plain words at first, no tokens**: a title from the song and the scene, a short description, hashtags.
42. **✍ Write it with <this chat's AI>**: one lean question (the song, the scene, the tempo, the length, your note, the app) answered as TITLE / DESCRIPTION / HASHTAGS; its tokens shown under the words and counted on the meter. Nothing goes to the AI before that click (or the mission).
43. Hashtags cleaned: no doubles, no accents or punctuation, the app's own tag (`#shorts`) added once.
44. Live counters against the app's limits (title 100, caption 2,200, description 5,000) turn red when over.
45. **Copy all**: everything to paste, in the app's order (YouTube: title, then description + hashtags; TikTok / Reels / square: one caption).
46. Your words and cover words are remembered per video (the last 30).

## The post folder
47. **📁 Make the post folder**: `posts/<date> <title> (<app>)/` next to the video, with the video, `cover.jpg` (`thumbnail.jpg` for YouTube) and `post.txt`.
48. `post.txt`: what to paste where, the checks, the cover note and "post it yourself; Hearth never uploads".
49. **Show in Finder / Show in Explorer** (Show in folder on Linux) once it's made, also on the note.
50. Never overwrites: a second folder for the same post gets "(2)".

## Robustness
51. Without ffmpeg the kit still works: the video itself is measured (size, length, frames, the loop, cover ideas); loudness and exact numbers say they need ffmpeg (`brew install ffmpeg` / `winget install Gyan.FFmpeg`).
52. The AI's map of the app knows the kit (and that Hearth doesn't upload), so a chat points you to 📮 instead of offering to post.

**52 upgrades.**

## How it's built
- `publishkit-core.js`: the platforms, the checks, cover picking, the words, the fixes' ffmpeg arguments (no DOM; Node tests).
- `publishmain.js` (main process, loaded on its first call): ffprobe, one small decoding pass (motion, brightness, color), the loudness, ~40 tiny gray frames (sharpness, "where the detail is"), the last frame (loop seam), the cover ideas as small JPEGs. ffmpeg is found the way the frame reader and the render queue find it (Homebrew folders on a Mac, winget / scoop / C:\ffmpeg on Windows, Settings → ffmpeg path first).
- `publishkit.js` + `publishkit.css`: the panel; lazy group `publishkit` (tier `use`: nothing loads until you open it).
- `publish-hooks.js` (with the render queue): the mission and the 📮 buttons' way in.
- Small hooks elsewhere: `renders.js` (📮 on the note, the list and the menu), `main.js` (one lazyIpc line), `preload.js` (`hub.publish.analyze`), `lazy-data.js`, `index.html` (the lazy-at tag), `mcp/hearth-map.js` (one sentence), `dev/fake-common.js` (the fake AI's post words).

## Tested
- `node dev/publishkit-test.js` (19 tests: the platforms, the guess, every check, zones in the video's picture, the picture measures, cover picks, the words, the post file and folder names; with ffmpeg: a generated video measured by publishmain, and the loudness / loop / cut fixes run for real).
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/publishkit.js` (a tiny 9:16 video made through the render queue → 📮 Post on its note → checks, red zone, cover ideas, TikTok, the scrub and cover words, ✍ with the fake Claude, Copy all, the post folder with a 1080×1920 cover, the loudness fix through the queue and the re-check, the list's 📮, `/post`, the mission). `sh dev/run-checks.sh publishkit` runs both.
- Not verified here: the apps' real button positions change over time (the zones are approximate and say so), and the real Claude / Astra wording.
