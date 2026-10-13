# simplify2 (round 27): calmer, plainer, the way ⋯ AI setup is

You said the app was "way too complex… difficult to use and unclear", and you liked how calm ⋯ AI setup became.
This pass carries that across the rest of the app: Settings now reads like AI setup (a few sections in plain words,
everything rarer folded, every row explained when you point at it), no "/command" is left on screen outside the
Lab (labeasy did the Lab), and one button that did the same as ◎ waits behind Alt. Nothing was removed: everything
folded is one click away (Advanced, a right-click, Alt, ⋯ AI setup), and every command still runs when typed.

## Audit: what each main surface shows at first sight (before → after)
Counted by `dev/checks/simplify2.js` (new) and `dev/checks/clutter.js`: visible buttons, selects, inputs, summaries,
links; a control that only shows while you point at its area doesn't count, a faded one does.

| Surface | Before | After | Notes |
|---|---|---|---|
| Rail (without your agents / tools) | 6 | 6 | Board drawer, chats, ⋯, meter, ⚙ Settings, keys. AI setup's rail icon is ❖ now (it was a second ⚙ beside Settings) |
| Chat header | 1 | 1 | just ⋯ (round 26 already folded the model and New chat) |
| Chat box row | 5 | **4** | ◎ · ＋ · Send (+ the text box); ⚇ Work with Astra waits behind Alt |
| Chat list panel | 5 | 5 | search + New chat per group |
| **Settings (open)** | **34** | **21** | sections 7 → 4 (Look, Sync, Updates, Keys) + Advanced folded |
| Settings with Advanced open | 110 | **89** | the AI tool switches moved to ⋯ AI setup, the look switches Look already had are listed once |
| "/command" visible in Settings | 36 | **0** | |
| Command bar (Ctrl/⌘+;) | 3 | 3 | its words are plain now (no "Type / for commands") |
| Keys sheet: "/command" mentions | 11 | **0** | outside the Lab's own lines |
| Discover daily tips with a "/command" | 17 of 23 | **0** | |
| Lab toolbar | 9 | 9 | labeasy's area (not touched) |
| Board bars | 3 | 3 | already calm |
| Chat ⋯ (right-click) / message ⋯ menus | 9 / 6 | 9 / 6 | top level unchanged |
| clutter.js total (every surface) | 207 | **193** | |
| declutter-count total | 82 | 82 | (its surfaces were already tidy; composer and Settings aren't in it) |

## Upgrades

### Settings, as calm as AI setup
1. Settings has four sections in plain words — **Look, Sync, Updates, Keys** — and one folded **Advanced** for the rest
   (Chats, Hearth, Mood board, spell check, tools in the rail, the Claude / Codex programs, folders, backup and files).
2. Every row explains itself when you point at it (what it does, and what it costs: tokens, a little GPU, or nothing).
3. No command names anywhere in Settings: the switches still run their command out of sight, so menus, commands and
   Settings never disagree, and the little note under a switch no longer shows "(/…)" hints.
4. Only a token cost shows on a row (the one cost that matters); "free" / "a little GPU" moved into the hover text.
5. One line on top, **Your AIs → ⋯ AI setup**: personality, instructions, what each AI can use, memory are there,
   not duplicated here.
6. The AI tool switches (mood board, capture, app windows, Adobe, publishing) left Settings: they live in ⋯ AI setup →
   What it can use (they were in both places).
7. ⋯ AI setup, for a Lab director, gained three "In the Lab" rows that used to be Settings switches: builds in node
   graphs, shows a progress bar while it builds, looks at a picture after each edit.
8. Animation, Textures, Tooltips and Spacing are listed once, in Look's own Advanced fold (Settings listed them twice);
   **Sparkles when you click** joined Look.
9. **Updates** section: what's going on ("Hearth is up to date" / "3 new changes ready"), **Look now**, **What's new…**,
   and Install updates by themselves.
10. **Keys** section: **Keyboard keys…** (the keys sheet), **Meshy key…** (paste the API key once, stored encrypted),
    and the show / hide hotkey.
11. The search still finds everything (Advanced opens when a match is inside), now also by the words in the hover
    text; "nothing matches" says "try other words, or just ask a chat" instead of pointing at /commands.
12. Plain names: "Engines" → Claude and Codex programs, "App" → Backup and files, "Commands written in replies are
    clickable" → Actions named in replies are clickable, "Pause every command timer" → Pause every timer, the tray
    row says Hearth (not "the hub"); right-click Settings → Open / Fold Advanced.

### Fewer things in your face
13. ⚇ Work with Astra waits behind Alt in the chat box: ◎ Missions already has jam, second opinion, side by side and
    debate. It still shows by itself while a mode is on, and right-click the chat box → ⚇ Work with Astra… opens it.
14. The new-chat hint says "◎ in the chat box: jam, a second opinion or side by side with Astra".
15. AI setup's rail icon is ❖ (it was a second ⚙ next to Settings' ⚙); Settings' tooltip says what's inside (look,
    sync, updates, keys).

### No "/command" on screen outside the Lab
16. The keys sheet: its footer says "every line is also in a menu, or just ask a chat"; **Actions** replaces the
    "/help" link; "Show everything, always" is a right-click on the keys button (not "/calm off"); the "/ chat
    commands" line is gone (typing "/" opens no menu since round 26); Ctrl+K reads "Find anything".
17. Keys sheet lines from other places in plain words: the board drawer, guided tours, files access, one-key
    routines, push to talk, the Flows node view (Ctrl+K: Flows).
18. The command bar: "Say what you want (“make it 9 by 16”) · ↑ what you did before · ? everything it can do", and
    "Everything it can do…" in its menu.
19. The Ctrl+K palette's placeholder: "Find chats, tools, actions… (? first: search inside messages)".
20. All 17 Discover daily tips that started with a /command now say what to do in plain words (where the button or
    mission is, or "just ask"); "Try it" still does it for you.
21. Discover tours: the step button says **Try it** (not "Try /x"); pausing and finishing a tour say "it picks up
    there next time" / "Discover has the other tours"; tour steps about render, access, routines and what's new point
    at buttons, not commands; "Surprise me" shows what it did, not its command.
22. Tooltips without commands: the look picker (every tile, textures, glow, motion, density, corners, font, tooltips,
    accent, Save as…, Let Astra pick), Lab assist chips, ✎ Edit the summary, the context line ⌖, board drawer Link,
    New project, Exit focus, shader ◇ Nodes, Astra's duo ↻, Forgeheart stat watch, command-bar timers.
23. Toasts and hints without commands: report sent, flow saved, meter tucked, "No more tips", the meter's context
    window hint, Flows results, the kit's footer ("just ask a chat"), saving a look, remote pairing.

## Tests
- `dev/checks/simplify2.js` (new, in the `chat` group): the counts above; fails when Settings shows a /command, has
  more than 5 open sections or a row with no hover explanation, when the keys sheet / command bar / Discover tips show
  a /command, or when ⋯ AI setup lacks what moved there (mood board, capture, publishing, the three "In the Lab" rows).
  Before: 5 failures; after: PASS.
- `dev/checks/tidy.js` updated for the new Settings (switches explained on hover, no command names; "tokens" finds the
  switch that costs tokens; "hotkey" finds Keys); passes. `sync`, `clutter`, `declutter-count` pass.
- No thresholds changed in clutter.js / declutter-count.js (they report, they don't gate).
