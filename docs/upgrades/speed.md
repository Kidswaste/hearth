# Speed (round 13): your habits make Hearth faster, and what you never use steps aside

You asked: "help my workflow get faster and hide things I never use". This pass uses what Hearth already counts about
how you work (which commands, buttons and keys, on which screen, at what time of day, how lately) to put your usual
things first, repeat what you just did, take you back to where you were, turn routines you repeat into one key, offer
the fix when an error has one, and tuck away, reversibly, what you never touch.

Everything is local (data/kv/speed.json, data/kv/ui-usage.json, data/kv/error-log.json): no tokens, no engine calls,
nothing added to any prompt. Nothing polls and nothing runs per frame: things are counted when you act and lists are
ranked when they open. No new buttons on screen; it lives in the menus you already use, a few keys, and chat commands.
Tests: `sh dev/run-checks.sh speed` (dev/checks/speed.js and habits).

## Your usual things first
1. **Ranking by habit**: every command, button, key and tool you use is scored by how often, how lately (it fades over a couple of days), where you use it (the Lab, Video Review, a chat…) and at what time of day you usually do.
2. **The "/" menu**: in a tool, the "In <tool>" group becomes **Your usual in <tool>**: the commands you really run there come first (then the old guesses).
3. **The "/" menu in a chat**: "For this chat" adds your usual chat commands.
4. **Typed "/" matches**: after the exact name, your pinned and recent ones, the commands you use rank before the ones you never use (in the Lab, `/f` gives /freeze before /fps if you freeze more).
5. **Ctrl/⌘+K**: with nothing typed, the agents, tools and actions you pick most here, now, come first; typed, they win the ties.
6. **Ctrl/⌘+K: ↻ Again** is the first row when there is something to repeat (it shows what).
7. **Command bar (Ctrl/⌘+;)**: the empty bar shows **↻ Again**, your pinned commands, then your usual ones here (dashed chips).
8. **Commands page**: a **Your usual** section for the screen you came from.
9. **Commands page**: the principal commands in your order (most used first).
10. **Commands page**: inside every area, the commands you use come first; the never-used ones sink to the end.
11. **`/habits now`**: what ranks first here, this morning / afternoon / evening / night.

## Repeat and pick up
12. **Again: Ctrl/⌘+.** repeats your last action: the last command with the same arguments (`/size 9:16`, `/shuffle colors`…), or the last button you clicked (Shuffle, Save, a slider group…). It works while the Lab picture has the keyboard.
13. Again presses the button in the tool it was in, opening that tool if you moved away.
14. The button Again presses flashes once, so you see what happened.
15. **`/again`** (`/again 3`: three times). In a plain chat where you did nothing else, `/again` still writes the last reply again, like before (`/retry` is unchanged).
16. **Recent actions: Ctrl/⌘+Shift+.** opens your last ten actions; click one to do it again.
17. **`/again list`**: the same list in the chat, with ↻ buttons.
18. **Right-click the keys button** (bottom left): Recent actions › and Pick up where you left off….
19. **`/click <Area › Button>`** presses any button by its name (`/click Sliders › Shuffle`); it is what Again and your one-key macros use.
20. **Pick up where you left off**: when Hearth opens, one small card by the keys button offers your last chat…
21. …the last Lab scene, and where its sequence was (it reopens the sequence at that time)…
22. …the last render (sequence renders, recordings and videos a chat made)…
23. …and a flow waiting for you or hung.
24. The card is quiet: the place you were last comes first, it goes away by itself after 20 seconds (or ×), it doesn't show after a quick reload on the same screen, and right-click → "Don't show this card" turns it off.
25. **`/resume`** shows it any time; **`/resume chat | lab | render | flow`** goes straight there.
26. **`/resume off | on`**.
27. Ctrl/⌘+K: "Again: repeat your last action", "Recent actions…", "Pick up where you left off…".

## Learned shortcuts
28. **Routines are noticed**: 2 to 5 steps you repeat within a few minutes (commands, buttons, opening a tool), e.g. open the Lab → 9:16 → Shuffle → Save.
29. **Offered once**: the third time (fifth for two steps), one note: "You often do … Make it one key?" One click makes it your own command and gives it the next free key. Never more than one offer every 10 minutes; a part of a routine you already made is not offered again.
30. **Ctrl/⌘+Alt+1…9** run your one-key macros; a free one says how to fill it.
31. Safe with AltGr (Ctrl+Alt on Windows keyboards): typing a character in a text box is never taken as a macro key.
32. **`/macro learned`**: the routines you repeat, with how often, and "Make … one key" buttons.
33. **`/macro keys`**: your one-key macros.
34. **`/macro key <name> <1-9>`** gives any command (yours or Hearth's) a key; **`/macro unkey <1-9>`** frees it.
35. **`/macro forget-learned`** forgets the routines (your macros and keys stay).
36. **Your cheat sheet**: the keys button's sheet starts with **Yours**: the keys you press most, most used first, with how often.
37. Yours: the key that does something you keep doing with the mouse ("Freeze: you click it 16× · this key does it").
38. Yours: **＋ key** for something you click a lot that has no key: one click gives it Ctrl/⌘+Alt+N.
39. Yours: your one-key macros.
40. Yours: after doing the same thing three times in a row, "Again: Ctrl/⌘+." is suggested.
41. Ctrl/⌘+K: "Learned shortcuts: routines you repeat, as one key" and "Your one-key macros".

## Errors to fixes
42. An error with a known fix gets it as its button: **Update the engine** (too old, unknown option, version not supported).
43. **Sign in** (not signed in, expired, 401: Claude or Astra's own sign-in).
44. **Install ffmpeg** (a video that won't load or decode, ffmpeg / ffprobe missing).
45. **Check the engines** (MCP setup errors, tool calls cancelled or blocked): opens /doctor.
46. **Try again** (timed out, network, overloaded, rate limited).
47. **Open the Lab** (a Lab command run while the Lab isn't open).
48. **Reload the preview** (WebGL context lost, a sequence stuck or black).
49. **Find the engines** (Claude Code or Codex not found).
50. **"This keeps happening"**: the third time an error comes back within a day, one quiet note says so, with its fix (once a day per error).
51. **`/habits fix`**: your errors, most frequent first, with one-click fix buttons.
52. `/habits errors` marks the ones that have a one-click fix.
53. **`/habits hints off | on`**: one switch for the routine offers and the "keeps happening" notes.
54. Ctrl/⌘+K: "Your errors and their one-click fixes".

## Hiding what you never use, safely
55. **The weekly tidy covers every screen**: the first time a screen opens each day its buttons are noted, so a week later the ones you never touched there can be tucked behind Alt (before, only a few toolbars were watched).
56. **Never what you use**: nothing used in the last 30 days, no main (gold) button, nothing switched on, nothing in a dialog, the rail or the chat box; at most 12 at a time.
57. Controls used once or twice but not for 30+ days can be tucked too.
58. **One line**: "Tidied: tucked N controls you haven't used here (hold Alt to see them)", with **Undo**.
59. **`/habits restore`** brings back everything the tidy tucked (what you tucked yourself stays: `/tucked`).
60. **Customise… → Tucked by the weekly tidy**: bring them all back, or one by one.
61. Ctrl/⌘+K: "Bring back what the weekly tidy tucked".

**Count: 61 upgrades.**

For other streams (not counted): `Speed.score(key, place)`, `Speed.onAction(fn)`, `Speed.press(key)`, `Speed.again()`,
`SpeedRank.top(place, n)` / `sort(list)` / `palette(items)`, `Commands.setRanker(fn)`, `Habits.addFixes([{ re, label, run }])`,
`Habits.fixFor(text)`, `Habits.onRecord(fn)`, `Usage.see(root)`. The app map (`help commands`) has one line about
/again, /resume, /habits and /macro learned, read only on demand.
