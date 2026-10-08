# Command bar stream (round 3): every command, everywhere, in your own words

The ≈590 chat commands now reach every tool through one slim command line, understand plain words, and
remember what you do with them. Everything here runs locally: **zero model tokens**, nothing added to any prompt.
Try it: **Ctrl+;** (⌘; on the Mac) anywhere, type `make it 9 by 16`, Enter, Enter.
Tests: `node dev/smoke.js --fake-engines --script dev/checks/cmdbar.js` (every feature below, plus the docked
director's composer).

## The command bar (Ctrl/⌘+;)
1. **Command bar over any tool**: Ctrl/⌘+; opens a slim command line at the top of whatever is on screen (Lab, Video Review, Forge, a chat). It works even while the Lab's preview frame or a website agent has the keyboard. `/cmdbar`.
2. Commands run **in the context of what's on screen**: in the Lab they talk to the docked Three Director's chat, so the Lab versions of shared names (`/look`, `/loop`, `/fps`, `/safe`…) run, just like typing them in the director's box.
3. A small chip at the left shows where commands run (e.g. "⌁ Three.js Lab").
4. Click the chip to send this tool's commands to another chat (Claude, Astra…) until you leave the tool, or back to the default.
5. The bar can sit at the top or the bottom (chip menu, or `/cmdbar top` / `/cmdbar bottom`).
6. **Output card** under the bar instead of chat notes: Markdown, and any buttons the command offers.
7. `/commands` shown in the card run when clicked (ones with `<placeholders>` go into the bar to fill in).
8. Card button ↻: run the same line again.
9. Card button ⧉: copy the output.
10. Card button 📝: save the output to Notes.
11. Card button → draft: put the output in the chat box of the agent the bar talks to.
12. The bar uses **the same "/" menu as the chat box** (pinned, recent here, argument hints, suggestions), opening downwards.
13. Type plain words without "/" and the menu lists the matching commands ("freeze", "dark theme").
14. **↑ / ↓ history** of the command lines you ran (150 kept, across restarts).
15. `!!` runs your last command again.
16. `!calc` runs the newest command in your history that starts with (or contains) "calc".
17. `=1080*16/9` is quick math (same as `/calc`).
18. `> make the bloom pulse on the kick` sends a message to the chat the bar talks to, from any tool.
19. `?` opens the help view; `?vertical` opens it searched.
20. Enter runs and keeps the bar open for the next command; **Ctrl+Enter** runs and closes it; **Alt+Enter** runs and keeps the text to tweak.
21. Esc steps back: clears the card, then the text, then closes.
22. Text you hadn't run is still there the next time you open the bar.
23. **Alt+1…9** run your pinned commands 1…9 (the "/" menu shows which key is which).
24. **Ctrl+Z in an empty bar takes back your last command** when there is a known way (e.g. `/theme next` → `/theme prev`, `/shuffle` → `/unshuffle`); otherwise it says how.
25. Tab in an empty bar brings back your last command to edit.
26. Ctrl+L clears the output card.
27. F1 or **Ctrl/⌘+Shift+;** opens the searchable help view.
28. A line that isn't a command gets "did you mean" with a Run button, plus "Send to <agent>" to send it as a message.
29. While a macro records, the chip shows ● REC and the number of steps.
30. A ⏱ button shows how many timers are running (click: the list).
31. The bar centers on the visible tool and follows the window size.
32. Forgeheart 2 look: glass and gold like the palette; cut corners with the forge skin; still under calm / off motion.
33. **Ctrl+K palette: type "/"** and it hands over to the command bar; the palette's hint says so.
34. Ctrl+K actions: "Command bar", "Every chat command (searchable help)", "Command timers".
35. The Ctrl+/ shortcut sheet lists Ctrl+;.
36. `/cmdbar /lab-state` runs one line through the bar from any chat.

## Finding commands without knowing their names
37. **Plain-language search** (local index over names, aliases, descriptions, areas and keywords): `make it 9 by 16` → `/size 9:16`, `dark theme` → `/theme midnight`, `turn off the click track` → `/click-track off`, `bpm 128` → `/bpm 128`, `red channel` → `/view r`.
38. Numbers read the way you say them: "9 by 16", "9x16", "1080 by 1920" → 9:16; "5 minutes" → 5m; "120 %" → 120%; "8 bars".
39. **Everyday words for arguments** on 26 commands (26 upgrades): `/size` and `/crop` and `/still` (vertical, portrait, reels, story, landscape, widescreen, square, feed…), `/shuffle` (colours, gentle, crazy…), `/bpm` (double, halve, detect), `/live` (spotify, microphone), `/song` (start, stop, silence), `/record` (whole, finish, quality), `/fps` (smooth, battery), `/snap` (quarter, eighth…), `/safe` (instagram, youtube), `/view` (red, green, blue, brightness, negative…), `/copy` (everything), `/export` (markdown, web), `/effort` (harder, quick, max), `/zoom` (bigger, smaller, reset), `/width` (wider, narrower, maximum), `/spacing` (tight, roomy), `/timestamps` (show, hide), `/guide` (third, diagonal, middle), `/theme` (dark, night, bright, white, original, chrome, neon, gold, violet, green, red, pink…), `/glow` (more, less, blazing), `/density` (tight, roomy), `/motion` (less, none), `/meter` (small, full), `/backup` (now, list).
40. **Sentences that combine commands**: "every 5 minutes shuffle colors" → `/every 5m /shuffle colors`.
41. "in 10 minutes freeze" → `/after 10m /freeze`.
42. "at 9pm backup now" → `/at 9pm /backup now`.
43. "shuffle 3 times" / "twice tap" → `/repeat 3 /shuffle`.
44. "freeze then still 9:16" → `/run /freeze ; /still 9:16`.
45. "do it again" → `/repeat`.
46. Results rank by where you are (the tool on screen first), what you pinned, what you ran lately and how often you use it.
47. Words that are a command's own values pick that value ("theme molten", "live system").
48. "turn off …" / "… on" become the on / off argument.
49. Small typos inside names are forgiven ("frezee" → `/freeze`).
50. In the "/" menu, a word that isn't a command shows "Did you mean" rows (`/vertical` → `/size 9:16`).
51. In any chat box, an unknown `/words` line now gets "Did you mean" with plain-language matches (click one to run it; Enter again still sends it as a message).
52. A message that starts with a path (`/Users/me/x.js is broken`) is never second-guessed.
53. **Argument hints**: while you type arguments the menu shows the command's arguments with the one you're typing lit up, plus an example (chat box, docked director chats, the bar), even when there are no suggestions.
54. Hints follow the version that runs here: `/look ` in the Lab shows the Lab's look arguments.
55. Hovering a row in the "/" menu shows the full description and examples.
56. **Help view** (`/help`, F1, Ctrl+Shift+;): a compact searchable dialog of every command.
57. Help view: pick an area (with counts) or a list; it remembers your choice.
58. Help view lists: ★ Pinned, Recent, In <the tool on screen>, With examples, With shortcuts, Yours (aliases and macros).
59. Help view: "Best matches" from plain language at the top ("make it vertical").
60. Help view: ▶ try (runs it in the command bar) or ✎ fill (for commands that need arguments); ↑ ↓ and Enter work from the search box.
61. Help view: example chips run with one click.
62. Help view: ☆ pins a command from the list.
63. Help view: each row shows how often you used it, where the same name does something else (⇄) and how to undo it (↶).
64. Help view right-click: run, put in the bar, pin, copy, `/what`, make your own `/alias` for it, run it on a timer.
65. `/help lab` (or any area's name) opens that area.
66. Help view footer: the key tricks, and "Copy list" (the rows on screen as Markdown).
67. `/help list [word]` keeps the classic text list in the chat; `/help <word>` typed in a chat still lists matches in place.
68. **Examples for 166 commands** (336 ready-to-run lines) across the Lab, Video Review, chats, the look and the app, shown in the help view, as hints and in `/what`.
69. Search keywords for 160 commands (e.g. `/freeze`: pause, still, hold; `/size`: aspect, ratio, format).
70. `/what <command>`: everything about one command (arguments, aliases, keys, where it changes meaning, examples, undo).
71. `/how <what you want>`: the commands for it, clickable (`/how make it vertical`).
72. `/discover [area]`: three commands you've never run (from the tool on screen first), with an example each.
73. `/keys`: every command that also has a keyboard shortcut.
74. `/where`: where commands run right now, which chat they talk to, and which shared names mean something else here.
75. `/cmd-stats`: the commands you use most and the areas you've never tried.

## Power features
76. `/cmd-history [filter | clear]`: the lines you ran, newest first, clickable.
77. **`/repeat [n] [/command]`**: the last command again, n times, or any command n times (`/repeat 4 /tap`). Typed in a chat with no arguments it still resends your last message as before.
78. **`/every <interval> /command`**: a local timer (`/every 5m /shuffle`, `/every 30s quiet /lab-state`).
79. **`/at <time> /command`**: once at 21:30, 9pm, noon, midnight, "tomorrow 9:00" or "in 10m".
80. `/after <delay> /command`: once after a delay.
81. `/timers`: the list with Stop buttons.
82. `/timer-cancel <n | all>`.
83. `/timers-pause [on | off]`: hold every timer (repeating ones skip their turns).
84. Timers survive a reload (Ctrl+Shift+R) and are off when Hearth quits.
85. `quiet` timers run without a notification.
86. Intervals in **bars and beats** at the Lab song's tempo (`/every 8 bars /shuffle colors subtle`).
87. A repeating timer stops itself after 3 errors in a row.
88. **Macros**: `/macro rec <name>`, run commands as usual, `/macro stop` saves them as your own command (`/macro cancel` drops it).
89. `/macro <name> /a ; /b ; /c` writes one directly; `/macro show`, `/macro edit` (one step per line), `/macro delete`.
90. `/wait <time>` pauses inside a chain or macro (`/run /freeze ; /wait 2s ; /freeze off`).
91. `/a ; /b` typed straight runs as a chain (no `/run` needed).
92. `/alias` placeholders `{1}`, `{2}`: `/alias vs /run /size {1} ; /still {1}` then `/vs 9:16`.
93. Commands that a command runs (chains, aliases, macros, `/repeat`) print where you ran it: in the bar's card, not in a hidden chat.
94. **Pipes** `| draft`: put a command's text output in the chat box (`/calc 1080*16/9 | draft`).
95. `| copy` to the clipboard.
96. `| send` as a message to the chat's agent.
97. `| note` into Notes.
98. `| say` as a note here.
99. `| file` saves it as a file.
100. `| speak` reads it aloud with the system voice.
101. `| /command` passes it to another command as its arguments.
102. **Pinned commands**: ☆ on any row of the "/" menu pins it; pinned ones head the menu (★ Pinned).
103. `/star <command>` pins / unpins.
104. `/stars` lists them.
105. **Recent per tool**: the "/" menu shows "Recent in Three.js Lab" (or Video Review…) before your other recent commands.
106. `/undo-report`: every way to take things back by area, which commands have one, and your last commands marked ↶ (with how).
107. Undo info for 51 commands (shuffle → `/unshuffle`, theme → `/theme prev`, slider changes → `/undo-sliders`, deleting a chat → `/undo` / `/restore`…).
108. `/cmd-export`: your aliases, macros, pins and command history to a file (to move them to the Mac).
109. `/cmd-import`: bring them back (merges, keeps yours).

## Agents offering commands
110. **A command in an agent's reply is clickable**: inline code that is exactly an existing command (`/size 9:16`) runs on click (▸ marks it). No prompt change, no tokens.
111. Alt+click puts it in the command bar instead.
112. A command with a placeholder (`/size <ratio>`) fills the command bar (✎).
113. Commands written in your Notes are clickable the same way.
114. `/cmd-links on | off` turns the clickable commands off and on.

## Fixes and plumbing
115. Fixed: the "/" menu closed by itself when focus left and came back quickly (e.g. after a command filled the box).
116. Fixed: Esc closes the "/" menu even when it shows only the argument hint.
117. For other streams: `Commands.register` takes `examples`, `keywords` and `undo`; `Commands.addInfo()`, `suggest()`, `didYouMean()`, `argHint()`, `favs()`, `history()`, `onRun()`, `place()`; `tryRun()` takes output options. Everything that existed works as before.

**Count: 142 upgrades** (117 lines; line 39 is 26 vocabularies).
