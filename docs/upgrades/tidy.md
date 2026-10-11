# tidy (round 18): one app, fewer visible choices

You keep asking for fewer choices on screen, things one click deeper, and a slick app. This pass goes over the
surfaces you touch every day (the rail, the chats list, menus, Settings, Ctrl/⌘+K, the Commands page, empty screens)
so they read the same everywhere, and takes out what still pointed at the video side removed in round 17. Nothing was
removed that works; every change is reachable from chat.

## The Commands page (☰ in the rail, Ctrl/⌘+Shift+F, `/commands`)
1. **Your principal commands come first**, then ★ Pinned, Your usual, Recent and Going now.
2. **Studio and Discover share one compact row of chips** (icon + name, the pitch in the tooltip) instead of two
   long sections; a click opens them as before.
3. The empty right side says one line and offers one action (Search in plain words).

## Settings (⚙, Ctrl/⌘+, or `/settings`)
4. **A search field on top**: plain words filter every row of every section ("hotkey", "tokens", "rail", "spell"…);
   the folded More settings opens by itself when the match is inside; one line says when nothing matches.
5. **`/settings <words>`** opens Settings already filtered (e.g. `/settings tokens`).
6. **Every on / off that lived only in a chat command or a ⋯ menu is in Settings now**, grouped by area: Chat, Agent
   tools, Look and speed, App, Board (32 switches: Enter sends, fold long replies, chat titles, smart paste, chime,
   read aloud, "use the board" words, clickable commands, wrap, numbers, spell check, board / capture / apps / Adobe /
   publish tools, node graphs, progress bars, director screenshots, animation, sparkles, textures, tooltips, spacing,
   the pick-up card, daily tips, weekly tidy, auto updates, timers, board snapping, grid, minimap).
7. **Each switch says what it costs**: "≈ 1,000 tokens a message" (gold), "a little GPU" (blue) or "free", plus its
   command. The costs come from the real tool definitions (`mcp/cost.js`).
8. A switch runs its own command and reads the state back from where that command keeps it, so Settings, the
   command and the menus never disagree; the command's answer shows under the row.
9. Agent tool switches act on the agent you came from (a docked director when you were in its tool); the heading
   names it ("Agent tools · Three Director").
10. Only the common switches show; the rare ones wait under More settings (its summary says so).

## Menus (everywhere)
11. **Deletes are always last and red**, after a line, in every menu of the app (a "Delete…" / "Move to the Trash"
    row is marked red even where a menu forgot), and More… sits above it.
12. **One name to show a file**: "Reveal in Finder" on the Mac, "Show in Explorer" on Windows, in the board, captures,
    chat cards, a chat's "Works with" list, make outputs, Adobe and renders (it read "Show in folder", "Show the file",
    "Show in Finder" depending on where you were).
13. **"Copy path"** is the one wording, next to Reveal, everywhere a file has a menu (board items, captures, chat cards,
    a chat's captures, make outputs).
14. **One order**: Open · Reveal · Copy path · Send to… · the tool's own rows · Move to the Trash (captures, chat cards,
    a chat's captures).
15. A capture's "Move to the Trash" is the visible last row (it hid under More…).
16. A chat's right-click menu in the chats list says it like the chat's ⋯ menu: "Duplicate this chat" (in
    Organise) and "Export as Markdown file…".
17. The chat ⋯ menu ends with Delete chat (Customise this… used to come after it).

## The rail
18. **Ctrl/⌘+1…9 walk the whole rail top to bottom**: your agents, then the tools (Forgeheart, the Lab, the board,
    Commands). Before, only the agents had keys.
19. Every rail tooltip names its key ("Three.js Lab · ⌘4 · right-click: more"); the "(native)" jargon is gone.
20. Right-click a tool in the rail: "Open …" shows its key too.
21. Holding Ctrl/⌘ shows the key badges on the rail's tools as well.
22. **The rail's ⋯ flyout uses the app's icon set** (no more mixed emoji), keys on the right like every menu.
23. **Tools you hid from the rail are one click away** in that ⋯ flyout, with "Put tools back in the rail…" (Settings
    filtered on "rail").

## Ctrl/⌘+K
24. **With nothing typed it's a short list** (↻ Again, your agents and tools, what you pick most here, your five
    latest chats) instead of a thousand rows; typing still searches everything.
25. Agents and tools in it show their key (Ctrl/⌘+1…9).
26. A shorter placeholder that fits: "Search agents, chats, tools, actions… (? messages · / commands)".

## Empty screens and first run
27. An agent with no chats in the chats list offers its one action: **New chat**.
28. A chat whose engine isn't found says so in one line with one button: **Show me where to set it** (Settings,
    filtered to the program paths). It said "on this PC" on the Mac too.

## Gone: what pointed at the removed video side
29. The board's clip timeline: "✂ Pace the Lab like this" now runs `/match-pacing` (cues at the clips' rhythm);
    it ran `/cut-to-vibe`, a command that no longer exists, so the button did nothing.
30. The Commands page's `/sequence` questions offer "Play it" instead of "Finish it in the editor" (no such step).
31. `/undo`'s description no longer mentions the video editor.
32. `/after`'s example is `/after 2m /freeze off` (there's no `/unfreeze`).
33. Chat cards: "drag to the board, the Lab, a chat" (they said "the editor"), in the tooltip and the keys sheet.
34. The keys sheet's "Video Review" place name is gone.
35. The command bar's examples for a `/guide` command that doesn't exist are gone (`/guides` stays).
36. The agents' Lab sequence and footage tool descriptions no longer mention the video editor (a few tokens less
    for directors).
37. The old Video tool's place mapping in commands is gone.

## Words, help and discovery
38. One word per thing, written down in the app map the agents read: a **sketch** is a Lab piece you save (Your
    sketches); a **scene** is the sketch a chat or a sequence clip shows; **render** = a video or picture made from the
    Lab; **export** = data saved as a file (a chat, notes, usage). The map also tells agents that every switch is in
    Settings (`/settings <words>`).
39. A Discover tip: Settings has a search and every switch says its cost (`/settings tokens`).
40. A Discover tip: Ctrl/⌘+1…9 walk the rail (shown until you've used one of them).
41. The keys sheet and the shortcuts list describe Ctrl/⌘+1…9 the new way.

Tested: `dev/checks/tidy.js` (new: Settings search / switches / `/settings words`, menus, file rows, rail keys and
tooltips, the ⋯ flyout, Ctrl/⌘+K, the Commands page order), `commands-page`, `qa-commands`, `qa-keys`, `qa-mac`,
`polish`, `chatcore`, a smoke run.
