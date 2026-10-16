# Keys that feel native on the Mac and on Windows (round 49, winmac49)

The owner uses a Mac, a Windows PC and a big screen, and may type on AZERTY or QWERTZ. This stream audited every key
Hearth shows or takes on both computers (simulated platforms, the keys sheet, menus, tooltips, the Lab cards from
rounds 44–48), fixed what was wrong, and added scan rules + tests so new code can't bring it back. Nothing new on
screen, no new setting, nothing added to any message (0 tokens).

New files: `dev/keytables.js` (what each system keeps for itself, what AltGr types on 9 European keyboards),
`dev/winmac49-test.js` (UNIT, 346 checks), `dev/checks/winmac49.js` (smoke, real CDP keys). `sh dev/run-checks.sh winmac49`.

## What was found and fixed

| # | On | What was wrong | Fix |
|---|---|---|---|
| K1 | Windows | About 40 places wrote "Ctrl/⌘+K" for both computers; Windows showed the ⌘ (tooltips, hints, menus, the keys sheet's descriptions, toasts, chat notes, patch notes) | `WinMac.keyLabel`: one labeller for everything; Windows reads `Ctrl+K`, `Ctrl+Shift+K` (Windows' own Ctrl, Alt, Shift order) |
| K2 | Mac | ⌘ only replaced Ctrl in some places; Shift stayed a word ("⌘Shift+U"), order random (⌘⇧K), "⌘+Z" with a plus, the Lab's ✥ card said "Option + scroll" | Apple's way everywhere: `⇧⌘U`, `⌥⌘S`, `⌘-drag`, `⌥-scroll`, `⇧-click` (Ctrl+click stays: the Mac's right-click); tooltips, placeholders, every `<kbd>`, hints, menu keys, toasts, chat notes |
| K3 | Mac | Keys macOS takes with ⌘ before Hearth sees them: Ctrl+Tab (⌘Tab = app switcher), Ctrl+Space voice (⌘Space = Spotlight), Ctrl+Alt+D Duo (⌥⌘D hides the Dock) were shown with ⌘, so pressing what was shown never worked | shown with the real Control key, which Hearth's handlers already take: `⌃Tab`, `⌃Space`, `⌃⌥D` (with `⌃⌥H`, the show / hide hotkey); `WinMac.MAC_REAL_CTRL` |
| K4 | Windows, AZERTY / QWERTZ | AltGr is Ctrl+Alt on Windows: typing **@ # { [ \| \\** on AZERTY (or **@ € µ { [ ] }** on QWERTZ) in the chat box ran Ctrl+Alt shortcuts instead (one-key macros Ctrl+Alt+1…9 took AZERTY's `@ # { [ \|`; QWERTZ AltGr+M ran "next model" instead of µ); in the Lab, AltGr+6 `\|` (pin) and AltGr+8 `\\` (freeze) never fired | `ui.js` shim: a key typed with the right Alt (AltGr) is typing — its Ctrl+Alt is removed before any handler; the left Ctrl+Alt stays the shortcut |
| K5 | Mac, German / French | ⌥ types `@ [ ] { } \| \\ ~` there: ⌥5 in the Lab's code hid layer 5 instead of typing `[` | in a text field those characters type; ⌥ letters (⌥T…) and dead keys (⌥N: code ⇄ nodes) stay shortcuts |
| K6 | AZERTY / QWERTZ | Shortcuts read by key position: Ctrl+Alt+M on AZERTY was the `,` key, Alt+A / Ctrl+Shift+A the Q key, Ctrl+Z on QWERTZ the Y key | the shim gives handlers the code of the letter printed on the key (`navigator.keyboard` layout map, else the typed letter) |
| K7 | Windows, AZERTY / QWERTZ | In a website agent, AltGr+8 (`\\` on AZERTY, AltGr+ß on QWERTZ) toggled the chats panel (Ctrl+\\) | main.js' hub keys skip Ctrl+Alt |
| K8 | AZERTY | Capture's Ctrl+Alt+A (region) never worked: the letter check compared the key's place | capturemain.js reads the letter on the key (AltGr's ś / ą still type) |
| K9 | Mac | ⌘-click didn't add to a selection in the node editor (Ctrl-click is the right-click there); the Lab timeline's ⌘-drag (draw points) could start a scrub on the wave | `e.ctrlKey \|\| e.metaKey` |
| K10 | Mac | The FX picker's Alt+R (surprise me) never fired (⌥R types ®) | read from `e.code` |
| K11 | Mac trackpad | Pinch on the sequence timeline zoomed 1.25× per event (dozens per pinch: wild jumps) | gradual, like the Lab timeline; a mouse notch stays 1.25× |
| K12 | Windows at 150 % / Size of everything 150 % | The board took a mouse-wheel notch (66.67 px) for a trackpad and panned instead of zooming | a notch is recognised by `wheelDeltaY` (120 per notch at any scale; not on the Mac, where a trackpad step can be 120) |
| K13 | Windows | Projects › add "A file…": files + folders in one dialog only exists on the Mac; Windows showed a folder picker (no file could be picked) | files only off the Mac |
| K14 | Both | Four places set text past `el()` (the FX picker's footer, a chat-list tooltip, the director dock's tooltip) | through `macText` |

Reviewed and fine as they are (no change):

| Area | What was checked |
|---|---|
| The Mac menu | Hearth (About, Settings… ⌘,, Services, Hide ⌘H, Hide Others, Show All, Quit ⌘Q), the Edit role (⌘Z / ⌘X / ⌘C / ⌘V / ⌘A in every text field, Paste and Match Style), View, Window (⌘M, Zoom, Bring All to Front), Help: round 36's menus are complete |
| Windows' title bar | native frame kept (round 36): Snap layouts on the maximise button, Win+arrows, Alt shows the menu bar, Alt+F4, F11 |
| Every key line vs the systems | no key line names ⌘Q / ⌘H / ⌘M / ⌘` / ⇧⌘3–5 / ⌥⌘Esc, nor Alt+Tab / Alt+Space / Ctrl+Esc / Ctrl+Shift+Esc / F10 (scan rule `os-clash` at 0) |
| Scaled screens | the Lab preview, music wave and sequence follow `devicePixelRatio` changes (nativefeel / bigscreen); the Lab cards from rounds 44–48 draw no canvases of their own |
| Pinch / two fingers elsewhere | the board, the node editor and the Lab timeline already zoom on pinch (Ctrl+wheel on both systems) and pan with two fingers |
| Drag-drop paths | `webUtils.getPathForFile` on both (round 31) |

Left as they are (noted):
- Main-process keys read before the page (Ctrl/⌘+. Again) still use the key's place: on AZERTY that is the `:` key (`.` needs Shift there).
- The voice key on a Mac is ⌃Space: macOS uses it to switch keyboard layouts when two are installed (`/voice key` picks another).
- The Mac's French layout types `~` with ⌥N, which is also the Lab's code ⇄ nodes key in the code view.
- The Lab sandbox (the preview's own frame) gets keys before the shim only when it has the focus; its keys are single letters, unaffected.

## Upgrades
### Keys said each computer's way
1. Windows never shows ⌘: every "Ctrl/⌘+K" reads Ctrl+K (tooltips, hints, menus, toasts, the keys sheet, chat notes).
2. Windows names keys in its own order: Ctrl+Alt+Shift+K.
3. The Mac shows Shift as ⇧ everywhere (⇧⌘U, not ⌘Shift+U).
4. The Mac orders modifiers the Apple way (⌃⌥⇧⌘).
5. The Mac's mouse keys read ⌘-drag, ⌥-drag, ⇧-click (Ctrl+click stays: the right-click).
6. Placeholders and tooltips on Windows turn a "⌘K" written for the Mac into Ctrl+K.
7. Every `<kbd>` key in a dialog or card (the ✥ Direct card, Lab key lists) says this computer's keys.
8. Menu keys go through the same labeller (Ctrl+Shift+G / ⇧⌘G).
9. Chat notes from commands say ⌘ on the Mac (they said Ctrl).
10. Patch notes' "Ctrl/⌘+K" reads ⌘K on the Mac and Ctrl+K on Windows; keys named for one system stay as written.
11. The Lab's ✥ Direct card: "⌥-scroll" and "⌘Z" on the Mac.
12. The voice key reads ⌃Space on the Mac.
### Keys that work on the Mac
13. Ctrl+Tab (the agent before) is shown ⌃Tab on the Mac (⌘Tab is the app switcher).
14. Duo (Ctrl+Alt+D) is shown ⌃⌥D on the Mac (⌥⌘D hides the Dock).
15. Voice: ⌃Space (⌘Space is Spotlight).
16. ⌘-click adds to the selection in the node editor.
17. ⌘-drag draws points in the Lab timeline without scrubbing the wave.
18. The FX picker's Alt+R (surprise) works on the Mac.
19. German / French Mac: ⌥ types @ [ ] { } | \ ~ in text fields (the Lab's code too) instead of running a shortcut.
### AZERTY / QWERTZ on Windows
20. AltGr + a key types its character (@ # { [ | \ ~ € µ…) everywhere; it never runs a Ctrl+Alt shortcut.
21. The left Ctrl+Alt still runs the shortcut.
22. The Lab's | (pin) and \ (freeze) work when typed with AltGr.
23. Letter shortcuts follow the letter printed on the key (AZERTY A / Z / Q / W / M, QWERTZ Y / Z).
24. Capture's Ctrl+Alt+A (region shot) works on AZERTY.
25. A website agent's AltGr+8 types \ instead of toggling the chats panel.
### Trackpads, wheels, dialogs
26. A trackpad pinch on the sequence timeline zooms smoothly (no more jumps).
27. The board recognises a mouse wheel at Windows' 150 % (and Size of everything 150 / 175 %): it zooms again.
28. Projects › "A file…" lets you pick files on Windows (it was a folder picker).
### Kept fixed
29. Scan rules (dev/winmac-scan.js, all at 0): `key-text-raw` (keys set past el()), `mac-ctrl-click` (Ctrl-only mouse modifiers), `os-clash` (keys a system takes), `altgr-key` (Ctrl+Alt on e.key), `mac-alt-letter` (Alt+letter on e.key), `dialog-both` (files + folders dialogs).
30. `node dev/winmac49-test.js` (UNIT, 346 checks): the label table on both, every key line in the app on both, the OS clash tables, ui.js' own shim in a VM (Windows AZERTY / QWERTZ, the Mac), the AltGr-safe shortcut table, main's hub keys and capture keys under AltGr, patch notes, the scan's plants.
31. `dev/checks/winmac49.js`: the window's labels + real (CDP) AltGr / AZERTY keys through the shim.

31 upgrades.

## The AltGr-safe shortcut table (from `node dev/winmac49-test.js --table`)
Every Ctrl+Alt shortcut against what AltGr types on French / Belgian AZERTY, German / Swiss QWERTZ, Polish, Spanish,
Italian, UK and Nordic keyboards: 45 key / keyboard pairs where AltGr types something. In each, AltGr types the
character and the left Ctrl+Alt runs the shortcut. The owner's likely ones:

| Shortcut | AZERTY (fr) AltGr types | QWERTZ (de / ch) AltGr types |
|---|---|---|
| Ctrl+Alt+1…9 (one-key macros) | 2 `~` · 3 `#` · 4 `{` · 5 `[` · 6 `\|` · 7 `` ` `` · 8 `\\` · 9 `^` | de: 2 `²` · 3 `³` · 7 `{` · 8 `[` · 9 `]` — ch: 1 `¦` · 2 `@` · 3 `#` · 6 `¬` · 7 `\|` · 8 `¢` |
| Ctrl+Alt+M (next model) | — | `µ` (de) |
| Ctrl+Alt+C / O / X | — (Polish: ć ó ź) | — |
| Ctrl+Alt+H / D / G / S / A / R / P / V | — | — |

## Tested
- `node dev/winmac49-test.js`: 346 passed. `node dev/winmac-scan.js`: 0 hits (17 rules).
- `sh dev/run-checks.sh winmac49` (smoke + units): labels in the real window, real CDP keys: AltGr + à → `@` with no
  Ctrl / Alt left, the left Ctrl+Alt on AZERTY's M → KeyM, Ctrl on AZERTY's A → KeyA.
- Also: unit:winmac-test, unit:winpolish-test, unit:macpolish-test, unit:platform46-test, unit:nativefeel-test,
  unit:bigscreen-test, unit:voice-test, unit:labkeys-test, unit:labdirect-test, unit:boot-test (first screen 72 scripts,
  29 sheets), and the smoke checks qa-keys, labdirect, labkeys, lazy (pass); nativefeel and bigscreen failed once on
  the loaded machine (the Lab preview's scale / step-down timing) and passed alone; qa-mac's expectations moved to
  Apple's modifier order (⇧⌘S, ⌥⌘R) and it passes.
- Not testable here: a real Mac and a real Windows PC with AZERTY / QWERTZ (Chromium's exact AltGr events, the layout
  map). Each part falls back to what was there: no right Alt seen → the key is a shortcut as before; no layout map →
  the typed letter, else the key's place.

## Risks
- The key shim rewrites `e.code` for letters to the letter printed on the key. A handler that wanted the physical
  place of a letter (none found; the Lab sandbox is a separate frame) would now get the letter.
- AltGr is recognised by the right Alt key being down; a keyboard that sends AltGr some other way keeps the old
  behaviour (the shortcut runs).
- Chat notes now pass through the labeller: a note quoting text with "Ctrl+C" reads ⌘C on a Mac.

## For the patch notes
- Shortcuts are written your computer's way everywhere: ⇧⌘K on the Mac, Ctrl+Shift+K on Windows — tooltips, menus, the keys sheet, hints, chat notes and these patch notes (no more "Ctrl/⌘").
- On the Mac, the keys macOS keeps for itself are shown with the Control key that works: ⌃Tab (the agent before), ⌃⌥D (Duo), ⌃Space (voice).
- AZERTY / QWERTZ on Windows: AltGr types @ # { [ | \ € µ again — it never runs a Ctrl+Alt shortcut by accident (the left Ctrl+Alt still does). The Lab's | and \ keys work with AltGr.
- Letter shortcuts follow the letter on your key (AZERTY's A and M, QWERTZ's Z).
- German / French Mac: ⌥ types @ [ ] { } | in text fields (and the Lab's code) instead of hiding a layer.
- ⌘-click adds to a selection in the node editor; ⌘-drag draws points in the Lab timeline.
- Smoother trackpad pinch on the sequence timeline; the board's mouse wheel zooms again at Windows 150 %.
- Windows: Projects › "A file…" picks files (it opened a folder picker).

### What to try
**Mac**
1. Press ⌃Tab: the agent or tool before comes back (⌘Tab still switches apps).
2. In a chat, press ⌃⌥D: "⚇ Duo on" (⌥⌘D would hide the Dock).
3. Open the keys sheet (⌘/): keys read ⇧⌘U, ⌥⌘S, ⌃Tab — no "Ctrl".

**Windows (AZERTY / QWERTZ)**
1. In a chat box, type AltGr+à (AZERTY) or AltGr+Q (QWERTZ): `@` appears, nothing else happens.
2. Press the left Ctrl+Alt+M in a chat: the model changes (QWERTZ: AltGr+M still types µ).
3. Hover any button with a key: the tooltip says Ctrl+…, never ⌘.

**Big screen (Windows at 150 %)**
1. Open the board, roll the mouse wheel: it zooms (it panned before).
