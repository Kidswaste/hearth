# 🔎 Find anything (round 37, appsearch): Ctrl/⌘+K finds every setting, menu row, chat and answer in plain words

You want things easy to find without commands. Ctrl/⌘+K was a list of ~1 250 lines, most of them "/command — what it
does", matched letter by letter. It is now **Find anything**: the same box (nothing new on screen), ranked by the Lab
search's engine (plain words, synonyms, typos), over everything the app has, and **Enter takes you there**.

## What it finds, and what Enter does
1. **Every Settings row** (≈ 50: Look, Sync, Updates, Keys, every switch, everything under Advanced): Settings opens on it, Advanced unfolds when it's in there, the row lights up gold in the middle of the screen.
2. **Every look** ("Look: Obsidian", "dark" / "light" in its line): Settings opens on that look (More looks unfolded).
3. **Every ⋯ AI setup row** (≈ 30: Personality, Instructions, Files on this computer, each of Hearth's tools, Connected apps, Add a connection, Hooks, Check this AI, How hard it thinks, How long its answers are, Memory, Habits, Weekly limit, Continue lighter, Where its tokens go…): AI setup opens for the chat you're in, **the fold it sits in opens** (also a fold inside a fold, like Spending › Where its tokens go), the row lights up.
4. **The menus you'd right-click, as they are right now**: the chat header (the chat ⋯ menu: New chat, Compact, Model ›, Files it can use ›, View ›, Organise ›, Copy & export ›…), around the chat box, a chat in the list, a chat group, an AI and a tool in the rail, the rail itself, the token pill, a tool's header, the director dock. Each row says where it lives ("Chat ⋯ (right-click) › Organise"). Enter runs the menu's own row; a submenu row opens that submenu.
5. **The palette's own rows**: your AIs, tools, chats by title, and every action of every module.
6. **Every chat command, said in plain words**: "Compact this chat's context", never "/compact". No "/name" shows anywhere in the list.
7. **◎ Missions** (Swarm, Plan first, Research, Debate, Side by side, Remind me what we decided…, and the place-specific ones): Enter makes the next message of the chat you're in that mission.
8. **Chats by what was said in them**: a short pause after you type and the messages that match join the list ("In a chat", the sentence that matched, its chat and AI). Enter opens the chat **on that message**. It asks recall's index (built in idle moments on the store thread, free), then the plain text search when recall has nothing yet.
9. **The Lab's things when the Lab is open**: its menu rows, effects, layers, sliders, templates, starting points and help come from Lab search's own index ("vertical video" → ▦ All formats, in a Ctrl/⌘+K list). Plus one row **Search the Lab for "…"** that opens Lab search with your words.
10. **Patch notes**: every part of the last 8 rounds' notes ("What's new: Lab search", "What's new: Continue lighter"): Enter opens the notes on that round, scrolled to that part, lit.
11. **21 short "How do I…?" answers** (dark mode, spend fewer tokens, let an AI use my files, rules it always follows, personality, connect Gmail, hooks, check an AI works here, shorter answers, long chats, memory, several AIs at once, old decisions, two computers, what's new, keys, backups, new chat, the rail, the Lab, the next message). Most have **Show me**, which jumps to the row they talk about.
12. **Nothing fits?** The last row is **Ask <your AI>: <your words>**: they go into its chat box, not sent.

## How it understands you
13. **Plain words**: "dark mode" / "light mode" / "night mode" → ◐ Match my computer first, then the looks. "cheaper" / "save tokens" → Spending, How long its answers are (Short), Continue lighter. "permissions" / "file access" → Files on this computer and the chat menu's Files it can use. "computer" → Check this computer… and Check this AI. "think harder", "shorter answers", "two computers", "keyboard shortcuts", "what did we decide", "second opinion"… (≈ 35 groups of words that mean the same here, ≈ 35 phrases).
14. **Typos and half-typed words**: "persnality", "instrcutions", "notif" all land.
15. **Ranking**: a place where you set something up leans ahead of an action, which leans ahead of a command said in words; a name that matches beats a description; what you picked lately rises among equals; a Delete row sinks; the same thing found twice (a menu row and its action) is listed once.
16. The empty box is unchanged: ↻ Again, your AIs and tools, what you pick most here, your latest chats. "/" still hands over to the command bar and "?" still searches inside messages (neither is shown on screen).

## Instant and light
17. **Per keystroke**: ≈ 0.5–1.6 ms on average for the search and the list (≈ 1 570 rows: ≈ 1 260 actions and commands, 50 Settings rows, 33 looks, 32 AI setup rows, 21 answers, ≈ 40 patch-notes parts, ≈ 100 menu rows, missions, chats). The check times every keystroke it types; the few that landed on a pause of a busy machine were typed again with the word memo emptied: all under 3 ms. In Node, 2 500 rows: max ≈ 3–10 ms on this busy machine.
18. **Built lazily**: nothing loads before the first Ctrl/⌘+K (lazy groups **searchcore** and **appsearch**, tier "use"). The fixed part (actions, Settings, AI setup, answers, patch notes) is indexed once and again only when something joined; the live part (menus, chats, missions) on each opening, in the task after the box shows (≈ 12 ms). The Settings switches and the patch notes join a moment after the first opening; Lab search's index only when the Lab is open.
19. Nothing new on screen except the palette itself: the gold highlight is the keys sheet's own flash (`.ks-flash`).

**19 upgrades.**

## How it's built
- `tools/three-search-core.js` is now the **shared search core** (`LabSearchCore`, also `SearchCore`): each search brings a **vocabulary** (`C.vocab({ syn, phrases, kind, base })`: synonym groups, phrases, how much each kind leans), stored on the index (`C.build(items, { vocab })`); the Lab's words are the default, so Lab search is unchanged. The menu walker Lab search had is in the core too (`C.menuRows`) and both use it. Phrases' meanings are de-duplicated.
- `appsearch-data.js` (`AppSearchData`, no DOM, Node-tested): the app's words (SYN, PHRASES, KIND), the Settings rows (section, words on screen, a selector where needed), the AI setup rows (fold, words on screen), the help answers.
- `appsearch.js` (`AppSearch`): sources, two indexes, `find(q)` (the palette's rows), what each row does (`toSettings`, `toAiSetup`, `toNews`, `jumpChat`, missions, ask), the menus read by sending a right-click to each control (the Keys sheet's "Right-click" selectors) while `showMenu` / `popMenu` only note what they're handed, the messages' rows (recall, then text search, after 180 ms), the Lab delegation (`LabSearch.find`), timing in `AppSearch.last`.
- `appui.js` (the palette): loads the group on the first opening, `paletteItems()` hands its rows to `AppSearch.prepare` (rows said in words), `paletteRender()` asks `AppSearch.find(q)` when it's in (the old letter match until then), `AppUI.paletteRefresh()` for rows that join later, a row never shows a "/name" (even before the group is in), the placeholder says Find anything.

## Edits outside the new files (small, additive)
- `tools/three-search-core.js` (vocabularies, `menuRows`, `SearchCore`), `tools/three-search.js` (its walk is the core's `menuRows`; same behaviour).
- `appui.js`: the palette hooks above, its Ctrl+K line in the shortcuts help.
- `polish.css`: one rule: a palette row with a second line keeps its kind on the first line (it fell to a third).
- `keys-ui.js`: the Ctrl+K line says Find anything and what it finds.
- `lazy-data.js` (groups **searchcore**, **appsearch**; **labsearch** now `after: ['lab', 'searchcore']`; listed after the groups that need it, because `dev/lazy-manifest.js` puts each group's files right after its `at` file, so later groups come first in the recording), the regenerated manifest, `index.html` (two names on the existing lazy-at.js tag).
- `dev/run-checks.js`: the check in the chat group, the unit test in UNIT.

## Tests
- `node dev/appsearch-test.js` (unit, **10 tests**): vocabularies stay apart (the app's words don't change the Lab's ranking and back; `base` combines them), dark / light / night mode, cheaper, permissions, computer, typos and prefixes into Settings and AI setup rows, menus / missions / chats / patch notes by their words, the shared menu walker (paths, submenus, More… see-through, back / Customise skipped, checks, danger, wrapped runs, de-duplication), every catalog row well formed and every Show me target existing, **< 16 ms per keystroke on 2 500 rows** (best of 3).
- `node dev/labsearch-test.js` still **13/13**.
- `dev/checks/appsearch.js` (chat group, fake engines, ≈ 3 min), **20 steps**: not loaded before use; a real Ctrl+K press opens it and loads it; no "/command" text in the rows; "dark mode", "cheaper", "permissions", "computer", a typo, "how do i back up" each put the right rows first; **Enter on a Settings switch** opens Settings with Advanced unfolded and the row lit in view; **Enter on an AI setup row in a closed fold** (Where its tokens go, inside Spending) opens both folds and lights it; **every one of the 50 Settings rows and 32 AI setup rows is jumped to and found**; **a chat is found by a word said in it and opens**; **a menu row runs** (the chat header's Organise › Pin to top pins the chat); a mission is set; a patch-notes part opens lit; **in the Lab, Lab search's rows come in** ("vertical video" → ▦ All formats) and "Search the Lab for…" opens Lab search with the words; every keystroke timed.
- Also run: see the final report (labsearch, unit:labsearch-test, options, simplify3, qa-keys, lazy, unit:boot-test).
- Screenshot looked at: the palette over a chat with "dark mode": ◐ Match my computer (Settings › Look) first, the Match-my-computer action, then the dark looks, each with where it lives on its second line.

## Caveats
- The menus are read as they are when the box opens (the chat you're in, the AI selected in the rail); a menu of something not on screen (a message, a code block, a toast) isn't listed. Menus built later from a promise aren't listed.
- Settings and AI setup rows come from a catalog (`appsearch-data.js`) plus the live switches; a row added to Settings later needs a line there (the check fails when a catalog row is no longer found, not when a new row is missing).
- Messages are found once recall has read the chat (idle moments, or the first question) or by the plain text search; a very new chat may take a second.
- Commands that need words still put their name in the chat box when picked (the old behaviour of those rows).

## For the patch notes
- **Ctrl/⌘+K is now Find anything.** Type what you want in plain words, Enter takes you there.
- It finds every Settings row and every ⋯ AI setup row: Settings or AI setup opens right on it, the fold it's in opens, the row lights up.
- It finds the menus you'd right-click (the chat ⋯ menu, the chat box, the chats list, the rail) and runs the row for you.
- Missions, your chats, and **what was said in them**: Enter opens the chat on that message.
- In the Lab, Lab search's things show here too; one row opens Lab search with your words.
- "What's new: lab search" finds that part of the patch notes; "how do I…" questions get a short answer with **Show me**.
- Plain words and typos work: "dark mode" → Match my computer, "cheaper" → Spending / Short answers / Continue lighter, "permissions" → Files it can use, "computer" → Check this AI / Check this computer.
- No command names on screen any more: each line says what it does. Instant: about a millisecond a key.
