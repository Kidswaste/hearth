# Report to the developer (round 21): Hearth tells me when something breaks

You asked: "could you allow the chat to prompt you when there is a problem so you can resolve it?" Now, when
something goes wrong in Hearth, one click sends it to me (the developer agent that builds Hearth from
`kidswaste/hearth`) as a GitHub issue labelled **hearth-report**. A scheduled developer session reads those issues,
fixes them on main and closes them. ⬆ Update brings the fix, and Hearth tells you "Your report #12 is fixed in this
update". Nothing is ever sent without you seeing the whole report first, except crash reports if you turn on
`/report auto on`.

## Where you can report a problem
1. **Error notifications** have a small ⚑ next to ×. Right-click a notification for "Report to the developer…" or Copy.
2. **A failed reply** has a **Report** button in its footer, next to Retry / Copy error.
3. **A stalled reply** (the "No news for 2 min" line) has a ⚑ next to Wait / Stop / Stop & retry. Its live status goes into the report.
4. **Something broke inside Hearth** (an uncaught page error): one quiet notification with "Report to the developer". It shows once per error per day, and never while you're dragging or typing.
5. **Hearth crashed last time** (the window's page or the graphics process went down): at the next start, a notification offers the report.
6. **`/smooth`** (the jank watch) has "⚑ Report to the developer". It sends the worst scripts (file:line) to me.
7. **Sync errors, engine failures, tool errors**: they all show as error notifications, so they all get the ⚑.
8. **`/report <what went wrong>`** describes a problem in your own words. If Hearth saw an error in the last 15 minutes, that error goes in too.
9. **`/report last`** reports the last error Hearth saw.
10. **A chat can suggest a report.** When Claude or Astra finds that Hearth itself is misbehaving (an app bug, a broken hub tool, not their own code), it calls `chat_report_problem { title, details }`. That only puts a card in the chat ("⚑ Claude suggests a report…") with **Review & send…** and **Not now**. You decide.
11. The palette (Ctrl/⌘+K) has two actions: "Report a problem to the developer…" and "Your reports to the developer".

## What a report contains (always shown in full, editable, before sending)
12. A short title, editable (made from the error, or from your words).
13. What went wrong (your words) and what you were doing: the screen you were on, the chat and engine, your last few commands.
14. The error and its stack, cut down to Hearth's own lines (`native.js:1387 send`, `tools/three.js:20 run`). For an error notification, this is the code that raised it.
15. About 50 lines of the logs that matter: your most frequent errors (the `/habits` error log), the jank watch's top culprits, and the end of the engine log. The engine log gives way first when space runs short.
16. Hearth's version (the app checkout's git HEAD and branch, plus how many files were edited by hand), the OS, and the Electron / Chrome / Node versions.
17. The Claude Code and Codex versions that Hearth found.
18. The chat's last steps, as tool names only (`three_eval, three_screenshot…`).
19. **Privacy:** no chat text unless you tick "Include the chat's last messages" (masked too).
20. **Privacy:** API keys, tokens, passwords, bearer headers, `sk-` / `ghp_` / `github_pat_` / JWT / cloud keys, private-key blocks, `?token=` URL parts and passwords inside URLs are all replaced with •••. This reuses the chat-access masking and adds a few more patterns.
21. **Privacy:** your home folder shows as `~`, and any other `/Users/<name>` / `C:\Users\<name>` path loses the user name. E-mail addresses keep only their first letter and domain. File names are kept.
22. Everything is masked once more when you press Send, so anything you typed or pasted into the report gets masked too.
23. Copy puts the whole report on the clipboard to paste anywhere.

## Sending
24. **With the GitHub CLI** (`gh` installed and signed in): Hearth runs `gh issue create --repo kidswaste/hearth --label hearth-report --title … --body-file …`. It creates the label the first time the repo lacks it. gh holds the sign-in: Hearth never sees or stores a token.
25. **Without gh** (or if it fails): GitHub's new-issue page opens in your browser with the title, label and report already filled in. You press **Submit**. If the report is too long for a link, it is cut to fit and the full text goes to the clipboard, with a note telling you to paste it over.
26. The dialog tells you which of the two will happen before you press Send. If gh is installed but not signed in, it suggests `gh auth login`.

## After sending
27. Sent reports are kept on this computer only (`kv/dev-reports.json`, never synced).
28. **No double reports:** the same error reported again within a day asks first ("Already reported today (#12)…").
29. **`/report list`** shows your reports with their issue links and state: ○ open, ✓ fixed (and in which version), – closed. States are checked live through gh when it's available.
30. **"Your report #12 is fixed in this update"**: after ⬆ Update, Hearth reads the new commits. A commit that says `Fixes #12` (or names the report's id, `hr-xxxxxx`) marks that report fixed and tells you once.
31. **`/report link hr-xxxxxx 12`** connects a report you sent through the browser to its issue number, so its state and the "fixed" note work for it too. (Reports sent through the browser are also matched by their id when my fix names it.)

## Options (off or on as you'd expect; nothing new to choose on screen)
32. **`/report auto on`**: crash reports are sent by themselves. They need gh, are still masked, never include chat text, are never sent twice for the same crash, and are capped at 3 a day. Off by default. `/report auto off` turns it off again.
33. **`/report tool off|on`**: chats lose or regain `chat_report_problem`. It costs about 45 tokens per message. You asked for this ability, so it's on; turning it off saves those tokens. `/report` itself always works.

## For the developer session (how the loop closes)
- Each issue starts with `<!-- hearth-report hr-xxxxxx -->` and ends with a note: put `Fixes #<issue>` in the fix commit. GitHub then closes the issue when it lands on main, and the owner's Hearth says it's fixed after ⬆ Update.
- `mcp/hearth-map.js` tells both engines about `chat_report_problem` and `/report` (read on demand, no per-message cost).

## Files
`devreport-hooks.js` (always loaded, small): the ⚑ / Report buttons, the last 20 problems with stacks, crash and
"fixed" checks at start. `devreport-core.js` + `devreport.js` + `devreport.css` (lazy group `devreport`, loaded on
first use): masking, gathering, the review dialog, sending, `/report`, the chat tool. `devreportmain.js` (main side):
version info, gh, issue states, the update's commit messages, the crash file. Small hooks in other files:
`main.js` / `preload.js` (one line each), `mcp/chat-mcp.js` (the tool), `engines.js` (its off switch),
`chat-live.js` (⚑ on a stall), `jank-report.js` (⚑ in `/smooth`), `sync-merge.js` (the two files stay local),
`mcp/hearth-map.js` (one sentence), `index.html` (one script tag), `lazy-data.js`.

## Tested
- `node dev/devreport-test.js` (43 checks). Masking of 15 kinds of secret and path. App stacks on Mac and Windows paths. The dedupe key. The new-issue link trimmed to ≤ 7000 characters. `Fixes #N` / report-id matching (a bare `#13` doesn't count). The main side against `dev/fake-gh.js`, which captures the args and the `--body-file` text: repo, label and title; the label made when missing; not signed in; gh failing; no gh at all; issue states; commit messages between two versions; a crash handed over once.
- `dev/checks/devreport.js` in the app with fake engines. The group stays unloaded until used. Error notifications get ⚑. `chat_report_problem` loads the group and only drafts a card. `/report …` shows the masked report: token gone, no home path, no chat text, versions in. The browser link opens prefilled (openExternal stubbed). The report is remembered and listed. The same report the same day asks first. Sending through gh (stubbed) gives #42, listed as open. An update saying `Fixes #42` shows "Your report #42 is fixed in this update", and the list says ✓ fixed. A failed reply has Report. Auto crash reports are off by default; when on, they send once with no chat text and the same crash is not sent twice.
- `qa-commands` (814 commands, 0 duplicates) and `lazy` (the manifest regenerated with `node dev/lazy-manifest.js`) pass.

Not verified here: the real `gh` against github.com (no network) and a real window crash.
