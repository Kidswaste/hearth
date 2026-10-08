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
14. …with a last row "➤ Send to <agent>" that sends the words as a message instead (chats stay one keystroke away from any tool).
15. **↑ / ↓ history** of the command lines you ran (150 kept, across restarts).
16. `!!` runs your last command again.
17. `!calc` runs the newest command in your history that starts with (or contains) "calc".
18. `=1080*16/9` is quick math (same as `/calc`).
19. `> make the bloom pulse on the kick` sends a message to the chat the bar talks to, from any tool.
20. `?` opens the help view; `?vertical` opens it searched.
21. Enter runs and keeps the bar open for the next command; **Ctrl+Enter** runs and closes it; **Alt+Enter** runs and keeps the text to tweak.
22. Esc steps back: clears the card, then the text, then closes.
23. Text you hadn't run is still there the next time you open the bar.
24. **Alt+1…9** run your pinned commands 1…9 (the "/" menu shows which key is which).
25. **Ctrl+Z in an empty bar takes back your last command** when there is a known way (e.g. `/theme next` → `/theme prev`, `/shuffle` → `/unshuffle`); otherwise it says how.
26. Tab in an empty bar brings back your last command to edit.
27. Ctrl+L clears the output card.
28. F1 or **Ctrl/⌘+Shift+;** opens the searchable help view.
29. A line that isn't a command gets "did you mean" with a Run button, plus "Send to <agent>" to send it as a message.
30. While a macro records, the chip shows ● REC and the number of steps.
31. A ⏱ button shows how many timers are running (click: the list).
32. The bar centers on the visible tool and follows the window size.
33. Forgeheart 2 look: glass and gold like the palette; cut corners with the forge skin; still under calm / off motion.
34. **Ctrl+K palette: type "/"** and it hands over to the command bar; the palette's hint says so.
35. Ctrl+K actions: "Command bar", "Every chat command (searchable help)", "Command timers".
36. The Ctrl+/ shortcut sheet lists Ctrl+;.
37. `/cmdbar /lab-state` runs one line through the bar from any chat.
38. An empty bar shows your pinned commands as one row of chips.
39. **Ctrl+R** in the bar: your history lines containing what you typed, click one to run it.
40. Card button ↶ when the command you just ran has a known way back.

## Finding commands without knowing their names
41. **Plain-language search** (local index over names, aliases, descriptions, areas and keywords): `make it 9 by 16` → `/size 9:16`, `dark theme` → `/theme midnight`, `turn off the click track` → `/click-track off`, `bpm 128` → `/bpm 128`, `red channel` → `/view r`.
42. Numbers read the way you say them: "9 by 16", "9x16", "1080 by 1920" → 9:16; "5 minutes" → 5m; "120 %" → 120%; "8 bars".
43. **Everyday words for arguments** on 26 commands (26 upgrades): `/size` and `/crop` and `/still` (vertical, portrait, reels, story, landscape, widescreen, square, feed…), `/shuffle` (colours, gentle, crazy…), `/bpm` (double, halve, detect), `/live` (spotify, microphone), `/song` (start, stop, silence), `/record` (whole, finish, quality), `/fps` (smooth, battery), `/snap` (quarter, eighth…), `/safe` (instagram, youtube), `/view` (red, green, blue, brightness, negative…), `/copy` (everything), `/export` (markdown, web), `/effort` (harder, quick, max), `/zoom` (bigger, smaller, reset), `/width` (wider, narrower, maximum), `/spacing` (tight, roomy), `/timestamps` (show, hide), `/guide` (third, diagonal, middle), `/theme` (dark, night, bright, white, original, chrome, neon, gold, violet, green, red, pink…), `/glow` (more, less, blazing), `/density` (tight, roomy), `/motion` (less, none), `/meter` (small, full), `/backup` (now, list).
44. **Sentences that combine commands**: "every 5 minutes shuffle colors" → `/every 5m /shuffle colors`.
45. "in 10 minutes freeze" → `/after 10m /freeze`.
46. "at 9pm backup now" → `/at 9pm /backup now`.
47. "shuffle 3 times" / "twice tap" → `/repeat 3 /shuffle`.
48. "freeze then still 9:16" → `/run /freeze ; /still 9:16`.
49. "do it again" → `/repeat`.
50. Results rank by where you are (the tool on screen first), what you pinned, what you ran lately and how often you use it.
51. Words that are a command's own values pick that value ("theme molten", "live system").
52. "turn off …" / "… on" become the on / off argument.
53. Small typos inside names are forgiven ("frezee" → `/freeze`).
54. In the "/" menu, a word that isn't a command shows "Did you mean" rows (`/vertical` → `/size 9:16`).
55. In any chat box, an unknown `/words` line now gets "Did you mean" with plain-language matches (click one to run it; Enter again still sends it as a message).
56. A message that starts with a path (`/Users/me/x.js is broken`) is never second-guessed.
57. **Argument hints**: while you type arguments the menu shows the command's arguments with the one you're typing lit up, plus an example (chat box, docked director chats, the bar), even when there are no suggestions.
58. Hints follow the version that runs here: `/look ` in the Lab shows the Lab's look arguments.
59. Hovering a row in the "/" menu shows the full description and examples.
60. **Help view** (`/help`, F1, Ctrl+Shift+;): a compact searchable dialog of every command.
61. Help view: pick an area (with counts) or a list; it remembers your choice.
62. Help view lists: ★ Pinned, Recent, In <the tool on screen>, With examples, With shortcuts, Yours (aliases and macros).
63. Help view: "Best matches" from plain language at the top ("make it vertical").
64. Help view: ▶ try (runs it in the command bar) or ✎ fill (for commands that need arguments); ↑ ↓ and Enter work from the search box.
65. Help view: example chips run with one click.
66. Help view: ☆ pins a command from the list.
67. Help view: each row shows how often you used it, where the same name does something else (⇄) and how to undo it (↶).
68. Help view right-click: run, put in the bar, pin, copy, `/what`, make your own `/alias` for it, run it on a timer.
69. `/help lab` (or any area's name) opens that area.
70. Help view footer: the key tricks, and "Copy list" (the rows on screen as Markdown).
71. `/help list [word]` keeps the classic text list in the chat; `/help <word>` typed in a chat still lists matches in place.
72. **Examples for 166 commands** (336 ready-to-run lines) across the Lab, Video Review, chats, the look and the app, shown in the help view, as hints and in `/what`.
73. Search keywords for 160 commands (e.g. `/freeze`: pause, still, hold; `/size`: aspect, ratio, format).
74. `/what <command>`: everything about one command (arguments, aliases, keys, where it changes meaning, examples, undo).
75. `/how <what you want>`: the commands for it, clickable (`/how make it vertical`).
76. `/discover [area]`: three commands you've never run (from the tool on screen first), with an example each.
77. `/keys`: every command that also has a keyboard shortcut.
78. `/where`: where commands run right now, which chat they talk to, and which shared names mean something else here.
79. `/cmd-stats`: the commands you use most and the areas you've never tried.

## Power features
80. `/cmd-history [filter | clear]`: the lines you ran, newest first, clickable.
81. **`/repeat [n] [/command]`**: the last command again, n times, or any command n times (`/repeat 4 /tap`). Typed in a chat with no arguments it still resends your last message as before.
82. **`/every <interval> /command`**: a local timer (`/every 5m /shuffle`, `/every 30s quiet /lab-state`).
83. **`/at <time> /command`**: once at 21:30, 9pm, noon, midnight, "tomorrow 9:00" or "in 10m".
84. `/after <delay> /command`: once after a delay.
85. `/timers`: the list with Stop buttons.
86. `/timer-cancel <n | all>`.
87. `/timers-pause [on | off]`: hold every timer (repeating ones skip their turns).
88. Timers survive a reload (Ctrl+Shift+R) and are off when Hearth quits.
89. `quiet` timers run without a notification.
90. Intervals in **bars and beats** at the Lab song's tempo (`/every 8 bars /shuffle colors subtle`).
91. A repeating timer stops itself after 3 errors in a row.
92. **`/remind <time> <text>`**: `/remind in 25m take a break`, `/remind 18:00 export the reels cut`.
93. One-time timers and reminders also show a system notification when Hearth is in the background.
94. **Macros**: `/macro rec <name>`, run commands as usual, `/macro stop` saves them as your own command (`/macro cancel` drops it).
95. `/macro <name> /a ; /b ; /c` writes one directly; `/macro show`, `/macro edit` (one step per line), `/macro delete`.
96. `/wait <time>` pauses inside a chain or macro (`/run /freeze ; /wait 2s ; /freeze off`).
97. `/a ; /b` typed straight runs as a chain (no `/run` needed).
98. Several command lines pasted or typed at once (Shift+Enter between them) run one after the other, in the bar and in any chat box.
99. `/alias` placeholders `{1}`, `{2}`: `/alias vs /run /size {1} ; /still {1}` then `/vs 9:16`.
100. Commands that a command runs (chains, aliases, macros, `/repeat`) print where you ran it: in the bar's card, not in a hidden chat.
101. **Pipes** `| draft`: put a command's text output in the chat box (`/calc 1080*16/9 | draft`).
102. `| copy` to the clipboard.
103. `| send` as a message to the chat's agent.
104. `| note` into Notes.
105. `| say` as a note here.
106. `| file` saves it as a file.
107. `| speak` reads it aloud with the system voice.
108. `| /command` passes it to another command as its arguments.
109. `| grep <word>` keeps only the lines with that word (`/help list | grep freeze`).
110. `| head [n]` keeps the first n lines.
111. **Pinned commands**: ☆ on any row of the "/" menu pins it; pinned ones head the menu (★ Pinned).
112. `/star <command>` pins / unpins.
113. `/stars` lists them.
114. **Recent per tool**: the "/" menu shows "Recent in Three.js Lab" (or Video Review…) before your other recent commands.
115. `/undo-report`: every way to take things back by area, which commands have one, and your last commands marked ↶ (with how).
116. Undo info for 51 commands (shuffle → `/unshuffle`, theme → `/theme prev`, slider changes → `/undo-sliders`, deleting a chat → `/undo` / `/restore`…).
117. `/cmd-export`: your aliases, macros, pins and command history to a file (to move them to the Mac).
118. `/cmd-import`: bring them back (merges, keeps yours).
119. `/cmd-reset <history | pins | counts | recent | all>`: forget that data (asks first; aliases stay).

## Agents offering commands
120. **A command in an agent's reply is clickable**: inline code that is exactly an existing command (`/size 9:16`) runs on click (▸ marks it). No prompt change, no tokens.
121. Alt+click puts it in the command bar instead.
122. A command with a placeholder (`/size <ratio>`) fills the command bar (✎).
123. Commands written in your Notes are clickable the same way.
124. A code block in a reply made only of commands gets **▶ Run these N commands** under it.
125. `/cmd-links on | off` turns the clickable commands off and on.

## Fixes and plumbing
126. Fixed: the "/" menu closed by itself when focus left and came back quickly (e.g. after a command filled the box).
127. Fixed: Esc closes the "/" menu even when it shows only the argument hint.
For other streams (not counted): `Commands.register` takes `examples`, `keywords` and `undo`; `Commands.addInfo()`, `suggest()`, `didYouMean()`, `argHint()`, `favs()`, `history()`, `onRun()`, `place()`; `tryRun()` takes output options. Everything that existed works as before.

**Count: 152 upgrades** (127 numbered lines; line 43 counts its 26 argument vocabularies, one per command).
