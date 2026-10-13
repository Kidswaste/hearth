# simplify3 (round 33): AI setup reads top to bottom, everything else one level deeper

You said: "it's still way too complex… only give me options that give the AI more access (hooks, connections,
personalities, instructions)… it's difficult to use and unclear." Rounds 27–32 then added missions, Activity, Spending,
recall, pinboard, quickstart cards, the Files row, Check this AI… and most of it landed at the top level of ⋯ AI setup.
This pass puts the four things you asked for first, folds the rest with one line saying where it stands, and turns
the last command names and jargon on screen into plain words. Nothing was removed: every fold is one click, and every
moved control has its place listed below.

## Audit: what each always-visible surface shows (before → after)
Counted by `dev/checks/simplify3.js` (new): visible buttons, selects, inputs, summaries, links, the way
`simplify2.js` counts them (menus: their top-level rows). Screenshots looked at before and after.

| Surface | Before | After | Notes |
|---|---|---|---|
| **⋯ AI setup (first sight)** | **48** | **18** | 9 open sections → 4 open + 4 folded; 1871 px tall → 841 px (fits a laptop screen) |
| ⋯ AI setup, every fold open | 48 | 42 | the missions grid no longer runs off the drawer's side (it scrolled sideways) |
| Settings (open) | 22 | **20** | Updates: one **What's new…** (was Patch notes… + What's new for me…); Meshy key… → Advanced › Hearth |
| Rail (without your agents / tools) | 6 | 6 | already calm |
| Chat header | 1 | 1 | its ⋯ tooltip now says what opens (AI setup; right-click: this chat) |
| Chat box row | 4 | 4 | ◎ · ＋ · Send (+ the text box) |
| Empty chat | 0 | 0 | (plus the one-time ✦ card) |
| Chat ⋯ menu (right-click) | 6 | 6 | "Access" → **Files it can use**; "Chat commands… /help" → **Everything it can do…** |
| Message ⋯ menu | 6 | 6 | |
| Chat box right-click | 7 | 7 | "Commands · type /" → **Typed actions** (recent ones + Everything it can do…) |
| ◎ Missions picker | 16 | 16 | |
| Lab toolbar | 9 | 9 | every button is one you use (Your sketches, Console, Edit, Run, Present, Code…); tooltips shortened |
| Lab ⋯ menu | 10 | 10 | |
| "/command" shown in the chat's menus (chat ⋯ and its View / Organise / Files, chat box) | 6 | **0** | |
| Jargon on always-visible surfaces (MCP, effort…) | 2 | **0** | |

## Upgrades

### ⋯ AI setup: who → personality → instructions → what it can use → how hard it thinks → more
1. AI setup reads top to bottom: the AI chips (who), **Personality**, **Instructions**, **What it can use**, **How hard
   it thinks**, then the rest folded: **Memory**, **Habits**, **Spending**, **Your next message**.
2. **What it can use** holds everything that gives the AI more reach, in one place: **Files on this computer**, then
   **Hearth's tools**, **Connections** and **Hooks** (each folded), then **Check this AI**.
3. Every fold shows one line about where it stands, on the right: "Your chats and Hearth, Mood board", "Gmail (read
   only), 1 of yours" / "None on", "2 on, 1 paused" / "None yet", "Remembers what you tell it", "Checks its work,
   suggests next steps…", "No weekly limit" / "40% of this week's limit", "Just answer" / "🐝 Swarm, every message".
4. The line updates the moment you flip a switch inside (no jump, the switch stays under your mouse).
5. What you open stays open (this computer only), also after a change repaints the panel.
6. **Hooks** moved from between Instructions and the tools into What it can use (they give the AI a way to act).
7. **Connections** groups claude.ai's connected apps (Gmail, Drive, Notion…), your own connections and the Hearth
   Chrome for Google sign-in, with one line saying what a connection is.
8. **Your next message** (missions) moved from the top to the last fold: ◎ in the chat box is their place; the cards
   are still here, two per row, and no longer run off the side of the drawer.
9. The drawer's title is **AI setup** (it said "This AI: missions and what it can use").
10. Shorter hints: Personality "Who it is and how it talks, in every message"; What it can use "What it may reach by
    itself when it helps"; Smart "picks for each message: lighter for small asks, deeper for code and builds".
11. Tooltips say what happens in one sentence: Quick / Smart / Deep, every habit, memory.
12. Activity's hook lines, a hook's "open setup" and the connections action open AI setup **on that fold**, opened
    and scrolled to.

### Plain words
13. "Your connections (MCP servers)" → **Your own connections**; its ＋ Add a connection tooltip says what it gives
    the AI; the add dialog says "A tool server you already have (the kind called MCP)".
14. The chat ⋯ menu's "Access" is **Files it can use** (Off / Read / Read & write / Full); "Activity log" there is
    **What it did with files…**; the keys sheet line and the Discover tour step follow.
15. "Chat commands… /help" → **Everything it can do…** (chat ⋯ menu, also with no chat open); "Tags and folder…"
    no longer shows "/tag".
16. The chat box's right-click: "Commands · type /" became **Typed actions** (recent ones + Everything it can do…).
17. The chat header's ⋯ tooltip: "AI setup: who it is, its instructions and what it can use · right-click: this chat
    (model, rename, export…)" (it said "Chat options").

### Settings
18. Updates: one **What's new…** button with Patch notes · What's new for me (was two buttons).
19. **Meshy key…** moved from Keys to Advanced › Hearth (used once; Apps › Meshy › More has it too). Keys is now
    Keyboard keys… and the show / hide hotkey.

### The Lab
20. Toolbar tooltips in one sentence each (Run, Sliders, Code, Console, Edit, Present, Sketch ▾); the window ⋯ says
    it opens AI setup.

## Tests
- `dev/checks/simplify3.js` (new, chat group): the counts above; fails when AI setup isn't in the order who →
  Personality → Instructions → What it can use → How hard it thinks, when fewer than 3 parts fold or a fold has no
  summary, when What it can use lacks files / tools / connections / hooks, when a fold loses what it held (memory,
  habits, Check this AI, mood board, connected apps, missions, spending), or when an always-visible surface shows
  jargon, or when the chat ⋯ / chat box menus show a /command. Before: 3 failures; after: PASS.
- Updated for the new labels / selectors (not weaker): `access-chat` (the menu row is "Files it can use"), and the
  chat ⋯ selector `button[aria-label="Chat options"]` in access-chat, cachewise, clutter, declutter-count, hooks,
  missions, options, quickstart (its tooltip changed; the aria-label and usage name stay "Chat options").
- `connections`: the "on for Claude as Read only" step now waits for the save (up to 5 s) instead of reading it the
  instant the tools are saved (a race that lost every time with the new panel; the same value is still required).
- Passing: options, aicheck, access-chat, hooks, missions, quickstart, connections, budget, router, cachewise,
  simplify2, simplify3, tidy, labeasy, clutter, declutter-count, and the unit tests in their groups plus
  `unit:boot-test`. `missions2` fails "short list + More (8 + 8)" on the base commit too (the picker grew past 14 in
  earlier rounds), and `qa-keys` fails only "Lab · Shift+1 · Frame size: Fit" (a key pressed in the preview
  frame), also on the base commit: neither is from this pass.

## For the patch notes
- ⋯ AI setup reads top to bottom: who → Personality → Instructions → What it can use → How hard it thinks; Memory,
  Habits, Spending and Missions wait folded at the end.
- What it can use is the one place for giving an AI more reach: Files on this computer, Hearth's tools, Connections,
  Hooks, then Check this AI.
- Each folded part says where it stands in one line ("Mood board, Your chats and Hearth", "None yet", "No weekly
  limit"); what you open stays open.
- The panel went from 48 controls and two screens tall to 18 controls that fit one screen; nothing was removed.
- Missions moved to the bottom of AI setup (◎ in the chat box is their place) and no longer run off the side.
- Plain words: "Files it can use" instead of "Access", "Everything it can do…" instead of "Chat commands… /help",
  "Your own connections" instead of "MCP servers"; no command names left in the chat menus.
- Settings › Updates has one What's new… button; the Meshy key moved to Advanced.
- Activity's hook lines open AI setup right on Hooks.
