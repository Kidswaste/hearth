# Native feel (round 36, nativefeel)

The owner uses Hearth on a Mac and a Windows PC. This stream makes the window behave like a desktop app on each one:
where it opens, how it looks in the system's light / dark mode, its title bar, its menus and keys, its icons and canvases
on scaled screens, and how it tells you a reply finished while you were in another app. No new setting on screen, nothing
added to any message (0 tokens).

New files: `nativefeel-core.js` (pure: window memory and the off-screen guard, menu templates, the badge picture, the light /
dark pairs, the screen-scale rule; UMD: the main process requires it, the window loads it after the first screen),
`nativefeelmain.js` (main: restore / track the window, the Mac frame, nativeTheme, the badge, menus, IPC `native:*`),
`nativefeel.js` + `nativefeel.css` (the window: `data-os`, the Mac's drag regions, scrollbars per system, following the
computer's light / dark, the menu bar's actions, `hearth:dpr`), `dev/nativefeel-test.js` (UNIT), `dev/checks/nativefeel.js`
(smoke; `sh dev/run-checks.sh nativefeel`).

## What changed, and why this way

| Area | Before | Now | Where |
|---|---|---|---|
| Window memory | one `data/window.json` place, restored as is: a window last on an unplugged monitor opened off-screen; maximised kept the pre-maximise size by re-reading the file; full screen forgotten | per computer (`platform:host`) **and** per screen layout (ids, places, sizes, scales): the Mac alone, the Mac + studio monitor, the PC with two screens each keep their own place; a layout not seen yet uses the newest place that shows on these screens. Restored only where it can be grabbed (32 px title strip ≥ 120 px wide on a screen, its top not above the work area / under the Mac's menu bar); else centred on the screen it was on if still there, else the nearest, at its own size when that fits; a window bigger than its screen now is fitted. Maximised and full screen come back. A screen unplugged (or rearranged) while Hearth runs brings the window back. A minimised window (Windows parks it at −32000) is never remembered. The round-35 file is read as this computer's place | `nativefeel-core.js` `place` / `pick` / `remember`, `nativefeelmain.js` `restore` / `track`, `main.js` createWindow |
| The Mac's frame | the standard title bar above the app (28 px lost, the app's own headers under it) | `titleBarStyle: 'hiddenInset'`: the traffic lights sit at the top of the rail (8…60 px of its 64 px), level with the 52 px headers; the rail's top and the headers move the window; their buttons, the chat title (double-click rename), menus, dialogs and toasts stay clickable; full screen gives the rail its usual top back. A double-click on a header does what System Settings → Desktop & Dock says (zoom / minimise / nothing), also when macOS doesn't take it itself. `/titlebar native` brings the plain title bar back (after a restart) | `nativefeelmain.js` `frameOptions`, `nativefeel.css`, `nativefeel.js` |
| Windows' frame | system title bar, always light / dark by the OS | **kept native** (chosen over `titleBarOverlay`: website agents and the chats' right-hand docks reach the window's top right, where an overlay's min / max / close would cover their controls); it is now dark or light with the look (nativeTheme), and the window's background under the page is the look's own colour (no off-colour flash while resizing) | `nativefeelmain.js` `setLook` |
| Light / dark | the look never changed by itself; menus, dialogs and form controls were always the system's mode | ◐ **Match my computer** (Appearance, next to "Let Astra pick"; `/lightdark auto | off`; Ctrl+K "Light / dark: match my computer"): the look and its partner follow the system's mode live (Forgeheart ↔ Forge Light, Chrome Forge ↔ Chrome Light, Frost Steel ↔ Frost Light, Classic ↔ Parchment, Midnight ↔ Light…; any other dark look pairs with Forge Light). The switch itself is never saved (two computers in different modes never send the look back and forth through sync); picking a look yourself stops following. A config that never picked a look follows on the Mac / Windows. Native menus, dialogs, the title bar, select lists, checkboxes follow the look's kind (`color-scheme`; frames keep theirs so the Lab stays transparent) | `nativefeel.js`, `look.js` (applyPreset `auto`, one button) |
| Scrollbars | the Forge looks' 9–10 px bars everywhere; plain looks got Chromium's classic bars on Windows | Windows: a slim 4 px bar that widens under the pointer (Windows 11's own), on every look; the Mac: thin and shown only while the pointer is over what scrolls on the Forge looks, the system's own overlay scrollbars on plain looks | `nativefeel.css` |
| High DPI | canvases sized once by `devicePixelRatio`: moving to a 150 % monitor (or Windows' scaling changing) left the Lab preview, the music wave and the sequence timeline blurry (or 4× too heavy the other way) until the next run / resize | a new scale fires `hearth:dpr` + a resize in the window; the Lab's wave and sequence timeline redraw crisp; the preview's sandbox re-ratios every renderer at once (a sketch at the full ratio follows, a capped `Math.min(devicePixelRatio, 2)` or fixed one keeps its cap, `?dpr=` export sizes never move) and redraws a still picture | `nativefeel.js`, `tools/three-sandbox.html` (`<dpr-core>`), `tools/three-media.js`, `tools/three-seq.js` (one listener each) |
| Icons | tray: the 256 px icon shrunk to 16 (soft at 125 / 150 %); taskbar: the PNG; .ico 16–256 without 20 / 40 | tray / menu-bar icon drawn at 16 / 20 / 24 / 32 px for each scale; the Windows window uses the .ico (every size); the .ico gains 20 and 40 px (re-drawn once) | `appshell.js` `trayIcon`, `ICO_SIZES`; `main.js` |
| Menus | the Mac: Hearth (About, Hide, Quit), Edit, View (full screen), Window; Windows: **Electron's default menu** (hidden): Ctrl+W closed the window and Ctrl+R reloaded when a page didn't take the key | the Mac: **Hearth** (About Hearth, Settings… ⌘,, Services, Hide Hearth ⌘H, Hide Others ⌥⌘H, Show All, Quit Hearth ⌘Q), Edit (⌘C / ⌘V / ⌘Z in every text field), View (full screen ⌃⌘F, text size, Developer tools ⌥⌘I), Window (Minimise ⌘M, Zoom, Bring All to Front), Help (Keyboard shortcuts, Report a problem…). Windows: a clean menu bar Alt shows (File: Settings Ctrl+, · Close window Alt+F4 · Exit; Edit; View: full screen F11, text size, Developer tools; Window: Minimise, Keep on top; Help). Keys the page already handles are shown, not taken (no double undo, nothing handled twice); About says Hearth | `nativefeel-core.js` `menuTemplate`, `nativefeelmain.js` `setupMenu` |
| Keys | — | the keys sheet's new **Window** lines (⌘Q, ⌘H, ⌘M, ⌃⌘F on the Mac; Alt, Alt+F4, F11 on Windows); the unit test checks every key line in the app against what the menus take (no conflict) | `nativefeel.js`, `dev/nativefeel-test.js` |
| A reply finished while away | Mac: a Dock bounce per event, nothing left behind; Windows: a taskbar flash | the Mac: the Dock shows how many finished (1…9+) and bounces **once** per time away; Windows: the taskbar flashes and Hearth's icon carries the number (an overlay drawn in code, named for screen readers); both cleared when you come back to the window. Also counts a hidden (tray) window as away. The notifications themselves are the system's and follow Do Not Disturb / Focus; the badge never makes a sound | `nativefeelmain.js` `attention` / `clearAttention`, `main.js` `window:flash` |

Reviewed and left as they are: ⌘W (no Close item on the Mac: a single-window app where ⌘W quitting would surprise; the app
windows keep their own ⌘W), Ctrl+Q on Windows (not a Windows convention; Exit is in the File menu), the global hotkey
(⌃⌥H on the Mac is the real Control key, so it doesn't collide with Hide Others ⌥⌘H), notifications' own text and click
(appui.js / native.js / activity.js, unchanged).

## Upgrades
### Window memory
1. The window opens where you left it on this computer and this set of screens (the Mac alone, the Mac + monitor, the PC's two screens each keep their own place).
2. A window whose monitor is gone opens centred on a screen that is there, at its own size when it fits.
3. Plugging a monitor in or out while Hearth runs brings a window that ended up off-screen back.
4. A title bar left under the Mac's menu bar or above a screen's top edge is brought down where you can grab it.
5. A window bigger than its screen now (another scale, a smaller screen) is fitted inside it.
6. Maximised comes back maximised, full screen comes back full screen.
7. Monitors left of the main one (negative positions on Windows) are real places, kept.
8. The same data folder on the other computer never puts the window where the first computer's screens were.
### The Mac
9. No title bar: the traffic lights sit at the top of the rail, level with the headers.
10. The headers and the rail's top move the window; buttons, the chat title, menus and dialogs on them stay clickable.
11. Double-click a header: zoom, minimise or nothing, as System Settings → Desktop & Dock says.
12. Full screen gives the rail its usual top back.
13. `/titlebar native | inset`: the plain title bar back (or not), after a restart.
14. The Hearth menu: About Hearth, Settings… ⌘,, Services, Hide Hearth, Hide Others, Show All, Quit Hearth.
15. View: full screen, text size, Developer tools ⌥⌘I; Help: Keyboard shortcuts, Report a problem….
16. The Dock shows how many replies finished while you were in another app, and bounces once (not per reply).
### Windows
17. A clean menu bar Alt shows (File, Edit, View, Window, Help) instead of Electron's default.
18. Ctrl+W / Ctrl+R in a page that didn't take them no longer close or reload the window (Electron's default menu did).
19. File → Settings (Ctrl+,), Close window (Alt+F4: the tray setting decides), Exit.
20. View → full screen (F11), text size, Developer tools (Ctrl+Shift+I as before).
21. Window → Minimise, Keep on top.
22. The title bar is dark or light with the look.
23. The taskbar button flashes and Hearth's icon shows how many replies finished while you were away; both clear when you come back.
24. Scrollbars: slim, widening under the pointer, on every look.
### Light / dark
25. ◐ Match my computer (Appearance): the look follows the system's light / dark mode, live.
26. Pairs: Forgeheart ↔ Forge Light, Chrome Forge ↔ Chrome Light, Frost Steel ↔ Frost Light, Classic ↔ Parchment, Midnight / Graphite ↔ Light; any other dark look ↔ Forge Light.
27. The followed switch is never saved: two computers in different modes don't fight through sync.
28. Picking a look yourself stops following (the button shows it).
29. `/lightdark auto | off | status` and Ctrl+K "Light / dark: match my computer".
30. A config that never picked a look follows the computer on the Mac and Windows.
31. Menus, dialogs, select lists and checkboxes follow the look's kind (the Lab's preview stays transparent).
32. The window's colour behind the page is the look's (no off-colour edge while resizing).
### Crisp on every screen
33. Moving to a monitor with another scale (or Windows' 125 / 150 % changing) redraws the Lab preview at the new ratio at once, without a re-run.
34. A sketch that caps its ratio (`Math.min(devicePixelRatio, 2)`) or fixes it keeps its cap; exact export sizes never move.
35. The music wave and the sequence timeline redraw crisp on a new scale.
36. `hearth:dpr` { from, to } for any other canvas that wants to follow.
37. The tray / menu-bar icon is drawn for each scale (16 / 20 / 24 / 32 px), not shrunk.
38. Windows' taskbar and title bar use the multi-size .ico, which now has 20 and 40 px too.
### Keys
39. The keys sheet lists the window keys of each system (⌘Q, ⌘H, ⌘M, ⌃⌘F · Alt, Alt+F4, F11).
40. Keys the page handles are shown in the menus but never taken from it; a unit test checks the menus against every key line in the app.

40 upgrades.

## Tested
- `node dev/nativefeel-test.js` (in UNIT, 184 checks, injected platform / screens / window / Electron stand-ins): layout keys;
  the off-screen guard (monitor gone, under the menu bar, 50 px vs 130 px showing, a left monitor at negative x and
  unplugged, across two screens, taller than its screen, first start, a small screen, no screen info, junk, three
  far-away places always grabbable after); the file (round-35 migration, per computer + layout, a new layout, another
  computer's places never used, 8 layouts / 4 computers kept); main side through a temp data folder (old file restores,
  saved maximised on the monitor, back on the laptop's own place without it, the other computer's default, a minimised
  window not saved, full screen told + restored, a screen unplugged while running, listeners removed); the frame per
  platform and `/titlebar native`; AppleActionOnDoubleClick; nativeTheme per look / following; the badge (Mac count +
  one bounce per time away, Windows flash + overlay + clear, a tray-hidden window counts as away); the badge picture at
  16 / 32 px; both menu templates (roles, labels, Settings, Exit, Close window, clicks, the keys each takes) and
  `setupMenu`; every `keys: '…'` line in the app and main.js HUB_KEYS against the menus' keys; the light / dark pairs
  against appui.js' looks (each pair a dark + a light look, every look gets one); the screen-scale rule and the
  sandbox's own copy of it.
- `sh dev/run-checks.sh nativefeel` (smoke + the four unit tests): data-os / frame from main, color-scheme (frames keep
  theirs), nativeTheme following the look, the Mac's inset frame drawn by setting data-frame (rail room, drag / no-drag
  on the strip, headers, buttons, title, a menu over a header, full screen, nothing off the Mac), scrollbar widths on
  "Windows" / "Mac", `/lightdark auto` (pair, the system's mode applied, nativeTheme 'system', the switch not saved, ◐
  on in Appearance), a pick of your own stops it, `/lightdark` status, the menu bar's actions (keys sheet, Settings,
  text size), the Window key lines, `/titlebar` off the Mac, a device scale factor change → `hearth:dpr`, and the Lab
  preview's canvas at twice the pixels after a scale change inside its sandbox, without a re-run. No page errors.
- `unit:winmac-test`, `unit:winpolish-test`, `unit:macpolish-test`, `unit:boot-test`, `lazy`, `fastboot`, `qa-keys`
  (see the final report for the outcomes); `node dev/winmac-scan.js` 0 hits; `node --check` on every touched file.
- Not testable here: a real Mac (the traffic lights' exact place, macOS taking the double-click itself, the Dock badge)
  and a real Windows PC (the overlay icon at 125 / 150 %, the dark title bar, F11, Alt), real monitors being unplugged.

## Risks
- The Mac frame changes the top of the window: anything new placed over a header must be clickable (the CSS makes body
  overlays, dialogs, menus, toasts and popovers no-drag; an absolutely placed control inside a header that isn't a
  button / input / link would move the window instead). `/titlebar native` is the way back.
- Following the computer is decided on the window side from nativeTheme; on Linux (and the tests) a config that never
  picked a look doesn't follow (its dark setting is unreliable there).
- fastboot's "first-screen scripts ≤ 72" was already over before this round (77 on main); this stream adds one script
  (`nativefeel.js`; its core loads after the first screen).

## For the patch notes
- Hearth remembers where its window was on each computer and each set of screens, and never opens off-screen: unplug the monitor and it comes back on the laptop's screen.
- On the Mac the title bar is gone: the traffic lights sit at the top of the left rail, the headers move the window, and a double-click on a header zooms it (or minimises, as your Desktop & Dock setting says). `/titlebar native` brings the old title bar back.
- New in Appearance: ◐ **Match my computer** — the look follows your Mac's or PC's light / dark mode (Forgeheart by night, Forge Light by day, or your look and its partner). Picking a look yourself turns it off.
- Full menus on the Mac (About, Settings… ⌘,, Hide, Quit, Edit, Window, Help); on Windows a clean menu bar that Alt shows, and Ctrl+W / Ctrl+R no longer close or reload the window by accident.
- A reply that finishes while you're in another app puts a number on Hearth's Dock icon (one bounce) or on its taskbar icon (Windows flashes it); it clears when you come back. Notifications still follow Do Not Disturb.
- Crisp on scaled screens: moving the window to a monitor with another scale (or Windows at 125 / 150 %) redraws the Lab preview, the music wave and the sequence sharp at once; the tray icon is drawn for each scale.
- Windows: slim scrollbars that widen under the pointer; the title bar is dark or light with your look.
- What to try on the **Mac**: open Hearth (the traffic lights now sit in the rail), drag the window by a header, double-click a header, press ⌘, (Settings) and ⌘Q; plug or unplug a monitor and restart; switch System Settings → Appearance with ◐ Match my computer on.
- What to try on **Windows**: press Alt (the menu bar), F11, Ctrl+, ; send a long message, switch to another app until it finishes (the taskbar flashes with a number), come back; move the window to a screen with another scale while the Lab plays.
