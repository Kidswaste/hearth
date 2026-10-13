# chromeview (round 31): Chrome out of sight, its pages inside Hearth

The owner: *"open the chrome browser in the background or like don't necessarily show it to me, you can have your own
client and use it that's fine but I should only interact with it to login then I wanna do everything within the app"*.

Since round 30, pages that need Google sign-in (Gemini, AI Studio, YouTube Studio…, any app or website chat set to
"Open in Chrome", Pinterest for the board's finder) ran in **the Hearth Chrome**: the owner's real Google Chrome with a
profile of Hearth's own, driven over the DevTools protocol. Its windows were real Chrome windows on screen. Now that
Chrome **runs out of sight** and Hearth shows its pages **in Hearth's own windows**, in a **Chrome view**: you see the
page and use it right there (mouse, wheel, keyboard, typing in any language, pastes, right-click, popups, downloads,
file pickers). Chrome's own window only comes up **to sign in**, and goes away again by itself.

How it fits together:
- `chromemain.js`: the Hearth Chrome starts with no window (`--no-startup-window`) and every page gets a window of its
  own **far off-screen** (−24000, −24000), placed there from its first frame (`Target.createTarget` with bounds); pages
  keep drawing there (`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling`). Never `--enable-automation`, the normal user agent. Popups a page opens are
  moved off-screen and become another Chrome view; a link that opened as a tab gets a window of its own (a background
  tab stops drawing). Sign-in: `signIn({ key })` moves that page's window on screen (normal size, centred, in front),
  watches for the page leaving the sign-in page (or "I'm signed in"), then moves it back. "Show Chrome" (AI setup) puts
  every window on screen for debugging. A Chrome nobody can see closes when Hearth quits.
- `chrome-cdp.js`: `Screencast` (the page's viewport = the view's size via `Emulation.setDeviceMetricsOverride`, JPEG
  frames via `Page.startScreencast`, acks paced), `Browser.open(url, { bounds })`, `windowOf` / `place`.
- `chromeviewmain.js` (main, loaded on first use): the views: frames to the right Hearth window, input (an allow-list of
  `Input.*` methods), navigation state, the page's cursor, right-click, downloads (`Browser.setDownloadBehavior` →
  staged, then moved into Downloads/Hearth/<App>), file pickers (`Page.setInterceptFileChooserDialog` → Hearth's own
  dialog → `DOM.setFileInputFiles`), popups, pausing while the page's window is on screen for a sign-in.
- `chromeview-core.js` (plain JS, shared by the hub, app windows and Node tests): coordinates (letterboxing, pixel ratio,
  frame metadata), mouse / wheel / key mapping, the keys Hearth keeps, the frame size cap, the frame pacer, sign-in pages,
  cursors, the address in plain words.
- `chromeview.js` + `chromeview.css` (renderer: the hub's lazy group `chrome`, and `apps-window.html`): the view itself.
- `appsmain.js` / `apps-window.js`: an app "in Chrome" opens in its usual Hearth app window with a Chrome view inside.
- `chrome-ui.js`: a website chat in Chrome shows a Chrome view in its place; AI setup's Chrome row.

**Off-screen, not headless (decided by testing).** Headless Chrome (`--headless=new`) renders and screencasts fine, but it
says `HeadlessChrome` in its user agent (Google and others treat that as a robot), and a headless Chrome can't show a
window for signing in: it would have to quit and start again visible on the same profile, losing every open page. A
normal Chrome whose windows sit far off-screen keeps the real user agent, the same sign-in state, and one process:
signing in is just moving one window on screen and back. Measured with Playwright's Chromium under Xvfb: frames keep
coming from off-screen windows (≈ 20–24 a second for an animated page), `document.visibilityState` stays "visible",
`navigator.webdriver` stays false.

## Upgrades

### Chrome out of sight
1. **The Hearth Chrome works out of sight**: it starts with no window, and each page lives in a window far off every screen; you never see Chrome while you use its pages.
2. **Its pages keep drawing while nobody sees Chrome** (Chrome's background throttling is off for this profile only), so the view is live and timers keep running.
3. **No flash on screen when a page opens**: each window is placed off-screen from its first frame (and moved there right after on an older Chrome).
4. **A popup a page opens is put out of sight too**, and shows in Hearth instead (16).
5. **A link that opened as a tab gets a window of its own**, so the page behind it keeps drawing.
6. **Chrome never pulls itself in front of Hearth**: pages are opened in the background, and "show this page" brings up its Hearth window, not Chrome.
7. **A Chrome nobody can see closes when Hearth quits** (one on screen, or one you're signing in with, stays yours).
8. Still your real Chrome with its normal user agent; Hearth never adds `--enable-automation` (no "controlled by automated software" bar, `navigator.webdriver` stays false).

### Hearth's own client: the Chrome view
9. **An app set to Chrome opens in its usual Hearth app window**, with its page shown and usable right there (Suno, Pinterest, Gemini, YouTube Studio…): the app window's bar, ⤓ downloads, 💬 send to chat and ⋯ work the same.
10. **A website chat in Chrome shows its page in its place in Hearth** (no more "opens in Chrome" card), with a slim bar: **‹ Back**, **Forward ›**, **↻**, the address in plain words (click it to type an address or a search), **⋯**.
11. **Live frames sized to the view**, sharp on Retina / high-DPI screens (the page renders at the screen's pixel ratio; very large views get slightly softer frames instead of huge ones).
12. **At most 30 frames a second, fewer when your computer is busy** (each frame is acked once it's drawn; slow drawing lowers the rate, quick drawing brings it back); a still page sends no frames at all.
13. **No frames while you can't see it** (another chat in front, the app window hidden or minimized, a popup over it): the screencast stops, so a page in the background costs no CPU in Hearth.
14. **Mouse**: moves, clicks, double and triple clicks (select a word / a line), drags, middle click; **the wheel and trackpad scroll** (lines and pages converted to pixels, fast turns added up per frame).
15. **Keyboard**: every key with its text, shortcuts (Ctrl+A / C / X / Z… and ⌘ on a Mac as Chrome's own editing commands), typing in any language (input methods / dead keys arrive as compositions), emoji pickers and dictation; Hearth keeps its own keys (reload, back / forward, hide, the palette, switching chats).
16. **Popups open as another Chrome view over the page** (a window a page opens, a "Sign in with…" popup): use it there, **✕ Close** when done (it also closes by itself when the page closes it); the page under it pauses meanwhile.
17. **Pastes**: your clipboard's text goes in as typed text; a picture or a file is pasted by Chrome from the same clipboard.
18. **The page's own cursor** shows on the view (a hand over links, an I-beam over boxes, the page's own cursors).
19. **Right-click**: the page's own menu when it has one (Docs, Figma…), else Hearth's: Back, Forward, Reload, Copy, Paste, Select all, **Open the link in a new view**, Copy the link, Copy the picture's address, Copy the address.
20. **Downloads land in Downloads/Hearth/<App>** like Hearth's own app windows, show in the app window's ⤓ list and get the same "→ Lab / board / Open" offer (a website chat's downloads: a toast with Show).
21. **A page's file picker opens Hearth's own file dialog** (Chrome's would open on a window nobody can see); the files you pick go to the page.
22. **Resizing follows the view** (the page reflows to its new size; frames letterbox for a moment instead of stretching), and moving the window to a screen with another pixel ratio re-sharpens it.
23. "Open in my everyday Chrome" stays in the view's ⋯ / right-click (and the app window's ⋯): your own Chrome and logins, for anything Hearth can't do.

### Signing in: the only time you see Chrome
24. **Sign in (opens Chrome once)** (the view's ⋯, the app window's ⋯): that page's own Chrome window comes on screen, normal size, in front, on the sign-in page (Google's sign-in for a Google site, then back to the page; another site's page as it is, for its own "Log in").
25. **It goes back out of sight by itself** when the page leaves the sign-in page, and the page carries on in the Hearth view; or click **I'm signed in**.
26. **While you sign in, the view says so** ("Signing in, in Chrome's own window…") and stops drawing; a sign-in popup (e.g. "Continue with Google") stays on screen with it.
27. **A page that needs a sign-in is noticed inside the view** (Google's sign-in page, its "Couldn't sign you in", a site's /login page): a slim strip offers **Sign in (opens Chrome once)**.
28. **AI setup › Chrome › Sign in…** opens Google's sign-in in a Chrome window just for that; it closes by itself once you're signed in (or with "I'm signed in" on the toast).
29. AI setup › Chrome ⋯ › **Open the Hearth Chrome on screen** (until you click Done), for the rare thing only Chrome's own window can do.

### Settings, the AIs, the board
30. **AI setup › What it can use › Chrome › Show Chrome** (off by default, "for fixing things"): every Chrome window on screen too; off puts them back out of sight at once.
31. The Chrome row says **"open out of sight"** while Hearth uses it; its hint says how it works in plain words.
32. **The AI's tools work unchanged on these pages** (apps_page read / click / type / key / shot / wait / go, apps_open paste, "ask everyone" typing into a website chat): they drive the same page, and you see what they do in the view.
33. **"Show the page"** (the board's finder, an AI) brings up the page's Hearth window, not Chrome; the board's **Find images like this** reads Pinterest in the out-of-sight Chrome.
34. An app window hidden for a few minutes closes its Chrome page too (like Hearth's own app windows: it costs as much as a window); its media pauses when you hide the window.
35. `mcp/hearth-map.js` tells the AIs that Chrome is out of sight and its pages show in Hearth.

## Tests
- `node dev/chromeview-test.js` (unit, 22 ok): `fit` / `toPage` at pixel ratios 1, 2, 1.25, through letterbox bars and
  with offsetTop; modifiers, double / triple clicks (time, distance, button), mouse params, the wheel (pixels, lines,
  pages, clamped, added up); keys (typed text, Enter's `\r`, raw keys, shortcuts without text, ⌘ editing commands on a
  Mac only, AltGr, dead keys / IME); the keys Hearth keeps (Windows vs Mac); the frame size cap; the pacer (≤ 30 fps,
  slower when drawing is slow, recovering); sign-in pages and leaving them; cursors; the address. Against
  `dev/fake-cdp.js` (extended: windows and bounds, the viewport override, a screencast with acks, the wheel, IME, file
  pickers, downloads, process CPU): windows opened off-screen and moved, the screencast's viewport / frame size / pacing
  / acks, a resize restarting only when the frame size changes, stop = no more frames, a never-acked frame acked after a
  second, a click / wheel / IME through the page session.
- `node dev/smoke.js --pw-chrome --script dev/checks/chromeview.js` (`sh dev/run-checks.sh chromeview`, 39 ✓):
  Playwright's Chromium launched as "Chrome": an app set to Chrome opens as a Chrome view in its Hearth window, frames
  arrive at the view's size, **every Chrome window is off-screen**; through DOM events on the view: a click (the page's
  title changes), typing, Backspace, a paste, the wheel scrolls, the cursor (hand / I-beam); a popup → another view
  (its Chrome window off-screen, the page under it paused, clicks in it work, ✕ closes it and its page); a download →
  Downloads/Hearth/View Test + the ⤓ list; the file picker answered through Hearth's path; **window hidden → 0 frames**,
  "show this page" → its Hearth window and frames again; **Sign in (opens Chrome once)** → that window on screen (only
  that one), the view waits, the page leaves the sign-in page → back off-screen by itself, frames again, the AI's
  tools still click; AI setup's Sign in… window closed by "I'm signed in"; a website chat in Chrome shows a Chrome view
  in the hub, asking it types there, **another chat in front → it stops drawing**, a sign-in page inside it offers
  "Sign in (opens Chrome once)"; the Show Chrome row (off); back inside Hearth.
- **CPU, measured in that check** (3 s each, an animated test page in a 1280×810 view, Xvfb + SwiftShader software GL):
  visible ≈ 14–24 frames a second, Hearth's processes: main ≈ 7 %, the app window ≈ 13–16 %, the GPU process ≈ 130–170 %
  (software compositing: on a real Mac / PC GPU this is a texture upload per frame), Chrome ≈ 55–65 %; **hidden: 0
  frames, Hearth ≈ 0.3–1 %** (Chrome ≈ 12 %: the page's own animation keeps running out of sight).
- `dev/checks/chrome.js` (round 30, updated: a website chat in Chrome is a Chrome view, not a card) 30 ✓;
  `dev/checks/pinboard.js` unchanged and passing; `node dev/chrome-test.js` 16 ok; `node dev/boot-test.js` (the
  chromeviewmain.js channels) ok.

## Risks and what couldn't be checked here
- **No real Google account / network here**: whether Google accepts the sign-in in a Chrome window that was moved on
  screen (with its debugging port) is the same open question as round 30; "Sign in without Hearth's hand on Chrome"
  stays the fallback.
- **Real Chrome on a Mac / Windows wasn't run.** On a Mac, Chrome keeps its **Dock icon** while it runs (any app does;
  hiding it would mean changing Chrome's own bundle, which we won't), and a second Chrome icon shows when your everyday
  Chrome is open too (a separate profile = a separate Chrome). macOS normally allows windows off-screen when placed by
  the app; if a macOS version pulls them back, "Show Chrome" style windows would appear: report it. On Windows the
  Hearth Chrome shows **one Chrome button on the taskbar** (grouped with your Chrome's); clicking it can bring an
  off-screen window "forward" without showing it; nothing breaks. −24000 was chosen to stay inside Windows' coordinate
  range and away from its −32000 "minimized" marker.
- A popup that opens on screen can be visible for a split second before it's moved off-screen (Chrome places a popup
  near its opener before Hearth can move it).
- A link opened as a tab is re-opened in its own window: the new page loses `window.opener` (rarely used by sites
  outside sign-in popups, which keep theirs).
- Right-click asks the page with a synthetic `contextmenu` event; a page that only reacts to trusted events shows
  Hearth's menu instead of its own.
- The GPU numbers above are SwiftShader's (software): real-GPU numbers need a real machine.

## For the patch notes
- Chrome now works out of sight: pages that need Google sign-in (Gemini, YouTube Studio, apps you set to "Open in Chrome", Pinterest for Find images) show **inside Hearth** and you use them there.
- An app in Chrome opens in its usual Hearth window; a website chat in Chrome shows its page right in its place, with Back, Forward, Reload and its address.
- Click, scroll, type (any language), paste, right-click, drag: it all goes to the page. Downloads land in Downloads/Hearth/<App>, file pickers use Hearth's own dialog, popups open over the page.
- The only time you see Chrome is to sign in: **Sign in (opens Chrome once)** brings its window up, and it goes away by itself when you're done.
- A page that needs a sign-in tells you so inside the view, with that same button.
- A page you can't see doesn't draw: no CPU spent on it.
- ⋯ AI setup › What it can use › Chrome › **Show Chrome** (off) shows Chrome's own windows, for fixing things.
- The AI still reads, clicks and types on those pages, and you see it happen in the view.
- Caveat: on a Mac, Chrome keeps its Dock icon while Hearth uses it; we couldn't try a real Google sign-in here.
