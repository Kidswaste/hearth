# Simplify stream (round 4): less choice, more decided

You said the night build gave you too many options. This pass makes Hearth show one obvious way to do each thing
and hands some of the choosing to Astra. **Nothing was deleted.** Every control that left the screen still works
through a menu, its keyboard shortcut, the palette (Ctrl/⌘+K) or a `/command`. The table at the end lists where
each one went. One new command, `/decide`, replaces several pickers.

## Fewer controls on screen
1. **Menus are short.** Rare actions now sit behind one **More…** at the end of a menu, above Delete. This applies to the message ⋯ menu (16 items down to 7), the chat ⋯ menu (20 down to 8) and Video Review's ⋯ (15 down to 8). Other menus can use the same thing: an item with `more: true`.
2. **Chat messages:** pointing at a message shows **Copy** and **⋯** only. Read aloud, Retry, Edit, Quote, Branch and Second opinion are the first items in ⋯. A stopped reply still shows **Continue**.
3. **Chat header:** only ⋯ is left. **New chat** (Ctrl/⌘+N) and the **model** are the first items in ⋯, and `/model` still works. The model dropdown and the big New chat button were never used.
4. **New chat screen:** one short line ("Type / for commands · drop or paste files"). The four command chips and the five Astra links are gone. Astra's own empty chat shows its status line and `/astra…` instead of three rows of chips.
5. **Composer:** the placeholder is just "Message Claude…". The Enter / Shift+Enter hint is gone (it still shows "Ctrl+Enter sends" if you changed the send key).
6. **The ⚇ collab chip** has two choices: **Jam** (Claude ⇄ Astra build a visual together, shown once `jam.js` is in the app) and **Second opinion**. When a duo or relay mode is on, a third item turns it off. Right-click the chip, or type `/collab`, for every mode (duo, relay, critique, debate, council, rounds, order, presets, handoff). `/duo`, `/relay`, `/debate`, `/council` and `/collab-preset` haven't changed.
7. **Rail:** Notes, Memory, Side by side, the Ask-all bar toggle and Import past chats are now one **⋯** button above ⚙. Their shortcuts still work: Ctrl+J, Ctrl+G, Ctrl+B.
8. **The ask-all bar starts hidden.** It took a full row under every view and was never used. Ctrl+B or Ctrl+Shift+Space shows it. To keep it showing, set `layout.askAllBar: true` in config.json. Existing installs get this change once.
9. **Token meter:** the default is now the small **pill in the rail**, showing one number (today's tokens). Click it for the dashboard. Right-click it and choose "Show the meter strip" to get the strip back, or use `/meter strip`. Existing installs move to the pill once.
10. **Chats panel:** the "Import past chats…" footer moved into the rail's ⋯.
11. **Settings** shows General (Open on start, notifications) and Appearance. Everything else is under **More settings**: startup and tray, hotkey, spell check, rail tools, engines, folders, backups, Pack for Mac. This cut the dialog from 81 visible controls to 11.
12. **Appearance** (Settings, Ctrl/⌘+Shift+L, `/appearance`) shows **three looks**: Forgeheart, Forgeheart Classic and Forge Light, plus the look you're on and any looks you saved. The other 28 are under **More looks**, with the search box. Textures, glow, motion, density, corners, chat font, accent, tooltips and "Save as…" are under **Advanced**. `/theme`, `/texture`, `/glow`, `/motion`, `/density` and `/corners` still work.
13. **FX picker (X in the Lab)** opens on a short list: your favorites, recent picks and **Suggested** (Glow, Glitch, Film, ASCII, CRT, Kaleidoscope, Pulse rings, Particle field). Type to search all 257 items, or click **Browse all** (or press Tab) to get the tabs back. Opening it for looks, palettes or triggers (from the palette or commands) still shows the full lists.
14. **Lab toolbar:** **New**, **▦ All sketches** and **⟲ Restart** moved into **Sketch ▾**. Ctrl+Shift+Enter still restarts, O still shows all sketches, and `/sketch new` still works.
15. **Lab preview:** the four frame sizes, Fit, More…, Freeze, 📷 and ⋯ stay. **◐ Compare** only shows while a frame is pinned (pin one with `|` or ⋯ → Pin this frame). The preview ⋯ lost its duplicates (Still and Present have their own buttons). It lost the three platform lines too: use `/safe tiktok`, `/safe reels` or `/safe shorts`.
16. **Lab ⋯** no longer repeats Copy code, Export HTML (both in Sketch ▾) or the frame rate (in the preview's ⋯).
17. **Lab sliders:** a slider's 🔒, L-number and ♪ buttons show when you point at the row. A lock that's on stays visible. **A/B** shows only once a value differs from the code. **+ Save look** shows once you have saved looks; until then use Save ▾ → as a look. The legend line at the bottom is gone (each icon has a tooltip). The raw-values tip is shorter: "Raw values from the code. [Ask for named sliders]".
18. **Director dock quick chips:** three instead of six (Hit harder on the kick, 3 variations, Change on the drop). Shuffle colors and Save this look are the Lab's own buttons. `/shuffle colors`, `/save-look` and `/fix-errors` still work, and your own chips still show.
19. **Video Review:** the Review · Director · Toolkit · Flow tabs are hidden until one of them is open (you never used them). **⋯** opens them: 💬 Director chat, 🧰 After Effects toolkit, ⧉ Flow. `/toolkit` still works.

## Let Astra decide
20. **`/decide [look | effect | palette | template | size | theme] [goal…]`** asks Astra one small question and applies its pick, with **Undo** on the toast and in the chat. It covers a Lab look, an effect, a palette, a layer to add, the frame size for the current picture, or the app's look. Example: `/decide look dreamy and calm`. With no argument it decides a Lab look when you're in the Lab and the app look anywhere else.
21. **One button where the choice is:** **✦ Let Astra pick** in Appearance, **✦** in the FX picker's header (it decides an effect, or a look or palette on those tabs), and preview ⋯ → **✦ Let Astra pick the frame size**. The palette (Ctrl+K) has "Let Astra decide: …" too.
22. **Small by design.** Each decision is one lean question: no tools, a one-line persona instead of the agent's instructions, at most 8 option names, the goal, and a 320 px JPEG of the picture when it's about the picture. The prompt is about 200–250 characters. Your favorites go first in the options, then strong suggestions, then a random few, so repeated decisions vary. It runs only when you ask, never in the background.
23. **Fallbacks:** if Astra isn't set up or doesn't answer, Claude decides. If neither answers, Hearth picks a local default at no token cost: your favorite, your usual 9:16, or a light look by day and Forgeheart in the evening.
24. **Costs are visible:** each decision's tokens go to the meter, and **`/decide log`** lists the last ones: what was decided, who picked it, and the tokens in and out. **`/decide undo`** takes back the last one: layers it added or replaced, the palette, recolored sliders, the frame size, or the look.

## For testing
25. `dev/checks/clutter.js` counts the visible controls and menu items on 26 surfaces (it needs `--fake-engines`). Set `window.CLUTTER_SHOTS` to keep a picture of each.
26. `dev/checks/decide.js` runs app look, effect, look and frame size decisions through the fake Astra, then undoes each one. The fake engines now answer decide questions with the second option.
27. `journey-lab.js` clicks **Browse all** before the picker's Looks tab.

## Before / after: visible controls per surface
Counted by `node dev/smoke.js --fake-engines --script dev/checks/clutter.js` on a fresh install. Content items
(chats, slider rows, effect rows, look tiles) are in brackets.

| Surface | Before | After |
|---|---:|---:|
| Rail (besides agents / tools) | 8 | 6 |
| Chats panel | 3 | 2 |
| Chat header (empty / with a chat) | 3 / 4 | 1 / 2 |
| New chat screen | 9 | 0 |
| Composer + ask-all bar | 6 | 4 |
| Token meter | 10 | 1 |
| Reply actions | 3 | 2 |
| Message ⋯ menu | 16 | 7 |
| Chat ⋯ menu | 20 | 8 |
| ⚇ collab chip menu | 13 | 1 (2 with Jam) |
| Settings | 81 | 11 |
| Appearance | 21 (+31 looks) | 7 (+3 looks) |
| Lab toolbar | 15 | 12 |
| Lab preview pill | 10 | 9 |
| Lab sliders panel / one slider row | 12 / 4 | 10 / 2 |
| Lab ⋯ menu / preview ⋯ menu | 14 / 12 | 9 / 8 |
| FX picker first view | 14 (+257 rows) | 6 (+8 rows) |
| Video Review | 41 | 37 |
| Director dock | 15 | 12 |
| Timeline, layers, nodes | 9, 5, 7 | 9, 5, 7 (unchanged) |
| **Total** | **357** | **180** |

## Where things went
| Was on screen | Now |
|---|---|
| Message 🔊 / Retry / Edit | message ⋯ (first items) · Alt+R reads aloud · ↑ edits your last message |
| Pin / bookmark / react / save / source on a message | message ⋯ → More… · `/pin-msg`, `/bookmark`, `/react` |
| Chat header model dropdown, ＋ New chat | chat ⋯ · `/model` · Ctrl/⌘+N |
| Empty-chat chips (/template /recent /bookmarks /help, /duo /relay…) | type `/` |
| Collab modes, order, rounds, judge, partner, presets, handoff | right-click ⚇ · `/collab` · `/duo` `/relay` `/debate` `/council` `/collab-preset` `/handoff` |
| Rail 🗒 🧠 ▦ ⌨, Import past chats | rail ⋯ · Ctrl+J, Ctrl+G, Ctrl+B · `/import-chats` |
| Ask-all bar | Ctrl+B · Ctrl+Shift+Space |
| Meter strip | right-click the pill → Show the meter strip · `/meter strip` |
| Settings: tray, startup, hotkey, spell check, rail tools, engines, folders, App buttons | Settings → More settings |
| 28 looks, appearance toggles, Save as… | Appearance → More looks / Advanced · `/theme`, `/texture`, `/glow`, `/motion`, `/density`, `/corners`, `/appearance save` |
| FX catalog and tabs | type in the picker · Browse all · Tab |
| Lab New, ▦, ⟲ | Sketch ▾ · `/sketch new` · O · Ctrl+Shift+Enter |
| ◐ Compare (until a frame is pinned) | `|` · preview ⋯ → Pin this frame |
| Slider 🔒 / L / ♪, A/B, + Save look, legend | on hover / when it applies · Save ▾ |
| Dock chips Shuffle colors, Save this look, Fix the errors | `/shuffle colors`, `/save-look`, `/fix-errors` |
| Video Review Director / Toolkit / Flow tabs | Video Review ⋯ · `/toolkit` |
