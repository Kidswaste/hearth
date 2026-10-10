# Adobe + publishing (round 14): your Adobe suite and "agentic deployment", from Hearth and from chat

You asked for app integrations that help, naming the Adobe suite (you have all of it) and agentic deployment. Hearth
now drives **Photoshop, Illustrator, Premiere Pro, Media Encoder and InDesign** (After Effects already had its own
bridge; it joins the same menu) through each app's own scripting, on the Mac and on Windows, and **publishes** a Lab
scene, a video or a site on **Vercel, Netlify, Cloudflare Pages or GitHub Pages** with their official command-line
tools. Both work from menus you already have and from any chat, and Claude / Astra can do both when you let them.

Where it is (no new row of buttons): **Apps → Adobe apps / Publish on the web** (when the Apps window is in),
**⌘/Ctrl+K** ("Adobe apps…", "Publish the Lab scene on the web…"), the Lab's **Sketch ▾ → This sketch → Publish &
Adobe**, Video Review's **⋯ → Send to**, the editor's **⋯ → Sequence → Send to Premiere Pro**, the board's
**right-click → Adobe**, and the chat commands `/adobe`, `/photoshop`, `/illustrator`, `/premiere`,
`/media-encoder`, `/indesign`, `/deploy` (`/publish`).

Safety: publishing, rolling back and deleting always ask you first (Hearth's permission prompt, or a confirm), and so
does any script Claude or Astra writes for an Adobe app. Sign-ins happen in the service's own page, opened by its own
tool in a terminal window you see: Hearth never sees a password or a token.

Counted honestly: one line per thing you can see or use.

## Your Adobe apps
1. **Finds your Adobe apps and their versions** on the Mac (/Applications and ~/Applications) and on Windows (Program Files\Adobe): Photoshop, Illustrator, Premiere Pro, Media Encoder, InDesign, After Effects · `/adobe status`.
2. **The right copy when several are installed**: the newest year, release before Beta.
3. **Installed somewhere else?** `/adobe where photoshop <path>` (the .app, the .exe or its folder).
4. **Photoshop and Illustrator scripted on the Mac** through AppleScript (`do javascript`), the app's own door.
5. **InDesign scripted too** (`do script … language javascript`).
6. **On Windows** the same scripts go through each app's COM door (Photoshop, Illustrator, InDesign).
7. **Answers that survive accents and emoji in file names**: every script writes its answer to a UTF-8 file Hearth reads.
8. **macOS permission in plain words**: when the Mac blocks Hearth from controlling an app, the note says exactly where to allow it (Privacy & Security → Automation).
9. **The Hearth bridge for Premiere Pro and Media Encoder** (they have no AppleScript door): a tiny invisible panel installed once with your OK · `/adobe bridge install` (`remove`, `status`: "connected now").
10. **A missing app is one clear sentence** (what's missing and how to fix it), never an error dump; when Photoshop's scripting is blocked, the file still opens in it the plain way.
11. **A progress bar** while an app works on something (the round 11 bars).

## Photoshop
12. **The Lab preview as a picture in Photoshop** (every layer): Sketch ▾ → Publish & Adobe, `/photoshop lab`.
13. **The whole mood board as a layered PSD**: every picture a layer at its place on the board, named, in board order · `/photoshop board`.
14. **Only the selected pictures** as a layered PSD (board right-click → Adobe, `/photoshop board selected`).
15. **Open any picture** (a board picture, a render's frame, a file) · board right-click → Adobe → Open in Photoshop, `/photoshop open <path>`.
16. **A Video Review frame in Photoshop** (⋯ → Send to → Photoshop: this frame).
17. **Place a picture as a new layer** of the front document · `/photoshop place <path>`.
18. **Your actions, listed** · `/photoshop actions`.
19. **Run one of your actions** from a picker (Adobe apps → Photoshop → Run one of your actions…) or `/photoshop action <set> / <action>`.
20. **Social sizes in one go**: 9:16, 4:5, 1:1, 16:9 (or any `1080x1920`), each cropped to cover its frame, PNG or JPG · `/photoshop sizes 9:16 4:5`.
21. **Bring the front document back** into this chat, onto the board or as a Lab reference · `/photoshop back board`.

## Illustrator, InDesign, After Effects
22. **Illustrator → SVG for the Lab**: the front document (or a file) as an SVG, added as a reference of the open sketch · `/illustrator svg [path]`.
23. **Saved again in Illustrator → a fresh SVG** by itself (the file is watched).
24. **Illustrator → PNG back into Hearth** · `/illustrator png`.
25. **A picture placed in Illustrator** (board right-click → Adobe → Place in Illustrator).
26. **InDesign → PDF** of the front document (or a file) · `/indesign pdf`.
27. **A picture placed in InDesign** · `/indesign place <path|lab>`.
28. **After Effects: a file imported as a comp of its own** (Video Review ⋯ → Send to, board right-click, `/adobe ae <file>`), through the After Effects bridge you already had.

## Premiere Pro and Media Encoder
29. **The editor's timeline as Final Cut Pro XML** (cuts, both tracks of sound, other video / audio tracks, the frame size and rate) · `/premiere xml`.
30. **What stays in Hearth is listed** (transitions, titles, looks, speed changes), so nothing silently disappears.
31. **Send the timeline straight into Premiere Pro** (a new project when none is open) · the editor's ⋯ → Sequence → Send to Premiere Pro, `/premiere timeline`; without the bridge it says how to import the file by hand.
32. **A render into Premiere as a new sequence** · Video Review ⋯ → Send to, `/premiere import last`.
33. **Premiere's active sequence to Media Encoder** · `/premiere render`.
34. **What's open in Premiere** · `/premiere info`.
35. **Queue a video in Media Encoder** and start encoding · Video Review ⋯ → Send to, `/media-encoder last`.
36. **Your own Media Encoder presets** · `/media-encoder presets`, `/media-encoder last preset Reels`.

## The trip back
37. **Files that went out are watched**: save them in Photoshop / Illustrator and a note offers **Use it…** (into this chat, onto the board, as a Lab reference).
38. **The watched files** listed in Adobe apps → More (stop watching any of them) · `/adobe watched`.

## Adobe on the web
39. **Adobe Express** in a window of its own (you stay signed in) · `/adobe express`.
40. **Adobe Firefly** in a window of its own · `/adobe firefly`.
41. **In the Apps window** (when the apps stream's registry is in): Adobe apps, Adobe Express, Adobe Firefly.

## Where Adobe lives
42. **Adobe apps menu**: each app with its version (or why it's missing), its actions one level down.
43. **Video Review ⋯ → Send to** (Premiere, Media Encoder, After Effects, Photoshop, the web).
44. **Board right-click → Adobe**.
45. **⌘/Ctrl+K → Adobe apps…**

## Claude and Astra with your Adobe apps
46. **The `adobe_do` tool** for both engines: open, board as PSD, actions, sizes, back (the agent sees the picture), SVG, timeline, queue, PDF… · on per agent with **`/adobe-tools on`** (off by default: it costs nothing until you turn it on).
47. **An agent's own ExtendScript asks you first** (with the code shown).
48. **The app map knows it** (topic adobe), so a fresh agent understands it without you explaining.

## Publish on the web
49. **Four services, their own tools**: Vercel (`vercel`), Netlify (`netlify`), Cloudflare Pages (`wrangler`), GitHub Pages (`gh` + `git`).
50. **Finds them even though Mac apps don't get your terminal's PATH** (Homebrew, npm, nvm, Volta, pnpm, Windows npm / winget folders), and runs them with Node next to them.
51. **Not installed? The exact install line**, copied for you (`npm install -g vercel`, `brew install gh`, `winget install GitHub.cli`…).
52. **Sign in through the service's own page**: a terminal window opens with its sign-in, which opens your browser · `/deploy login netlify`.
53. **Who you're signed in as**, per service · `/deploy status`.
54. **A Lab scene becomes a real web page**: the Lab's own player, three.js copied next to it, every layer with its blend, opacity, position and timing, the references, the palette and the frame size · `/deploy scene`.
55. **It plays anywhere, with no internet dependency on a CDN**: three.js (and the addons the scene imports) is downloaded once and kept.
56. **A video as a page** (a render, a sequence, a recording) · `/deploy video last` (or Video Review ⋯ → Send to → Publish as a web page).
57. **A folder** (a static site) as it is · `/deploy folder <path>`.
58. **A web project** that Vercel / Netlify build themselves · `/deploy project <path>`.
59. **Preview first, on this computer**: a local address and a preview window · `/deploy preview`, Sketch ▾ → Preview the web page here.
60. **A check before it goes out**: the page is loaded in a hidden window and must draw; if it doesn't, the question says so.
61. **The question before publishing** shows the service, the local preview, the size and anything to know (a missing reference, no song).
62. **A progress bar** with what the service is doing.
63. **The address when it's live**, with Open / Copy / History.
64. **Draft deploys** (a preview address, the live site untouched) · `/deploy scene to netlify draft`.
65. **Your service remembered** after the first publish · `/deploy to vercel`.
66. **The same site every time**: a scene published again updates its site (Netlify's site, GitHub's repository, Cloudflare's project are reused; a taken name gets a suffix).
67. **GitHub Pages done for you**: the repository, the gh-pages branch from a clean copy of the page, Pages turned on.
68. **History** of everything published (live, replaced, rolled back, removed) · `/deploy history`, Publish → History.
69. **Roll back**: Vercel and Netlify switch to the earlier deploy; the others publish the earlier build again (kept on this computer) · `/deploy rollback`.
70. **Remove a deploy or delete the whole site** (asks first) · `/deploy remove [n] [site]`.
71. **Open, copy, preview or publish again** any build from the history.
72. **The builds folder** (the 60 newest kept) · Publish → More → Builds folder.
73. **Search-engine and link-preview friendly**: title, description and Open Graph tags; **F** goes fullscreen on the published scene.
74. **Publish menu** (Apps → Publish on the web), Sketch ▾ → Publish & Adobe, ⌘/Ctrl+K → Publish the Lab scene on the web…
75. **`/publish`** works as well as `/deploy`.

## Claude and Astra publishing
76. **The `deploy_do` tool** for both engines: status, build / preview (a local address, whether it draws, and a picture of it), publish, history, rollback, remove, sign-in · on per agent with **`/deploy-tools on`**.
77. **Every publish, rollback and delete an agent starts asks you first**, exactly like yours.
78. **The app map knows it** (topic publish).

Total: **78 upgrades**.

## Tested here
- `node dev/adobe-test.js` (15 steps): fake Mac apps + a fake osascript that captures the AppleScript and the ExtendScript it runs and answers with canned results; the answer file; the Automation error; InDesign's door; missing apps; the bridge install (fake `defaults` / `reg`) and a Premiere round trip through the bridge's folder with a stand-in panel; Media Encoder scripts; every generated script parses; the board layout; the FCP XML (also from the real editor's layout); Windows (fake Program Files + a fake cscript capturing the VBScript).
- `node dev/deploy-test.js` (12 steps): fake `vercel` / `netlify` / `wrangler` / `gh` in `dev/fake-deploy/` log their arguments; the scene page built for real; the preview server; deploys on the four services (a real git push into a bare repository for GitHub Pages); signed-out and failing deploys in plain words; rollback and remove.
- `node dev/adobe-mcp-test.js`: both MCP servers (one tool each, ≈ 295 / 232 tokens, off by default), Astra's long tool timeout, the app map.
- In the app (`sh dev/run-checks.sh adobe deploy`): **the published Lab page is loaded in a hidden window and draws** (a two-layer scene: hundreds of colors, no errors); the publish flow with the confirm (Cancel publishes nothing), Vercel and Netlify, history, rollback, the agents' tool; on this Linux box every Adobe path degrades in a sentence, the editor's real cut becomes FCP XML, the menus and the watched-file note.
- Not run here (no Mac / Windows / Adobe apps / real services in this container): the real AppleScript / COM calls, the CEP panel inside Premiere / Media Encoder, real sign-ins and uploads. The generated scripts and arguments are checked instead.
