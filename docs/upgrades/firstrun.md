# firstrun (round 28): a new computer ready in two minutes

You use Hearth on a Mac and a Windows PC. Setting up a new computer meant finding out, one error at a time, that Claude
wasn't signed in, Codex wasn't there for Astra, ffmpeg was missing, sync wasn't joined and a chat's folder only existed
on the other computer. Now one calm list says all of it at once, in plain words, each line with its state and one
button. It uses the checks Hearth already had (the doctor's install check, ffmpeg status, sync, reach, the updater):
nothing new to keep in mind, nothing installs by itself.

## Opening it
1. **The first launch on a fresh computer** (no chats yet) opens **Set up this computer** once, instead of the separate
   "isn't installed" and ffmpeg notices.
2. **Settings › Advanced › Claude and Codex programs › Check this computer…** opens it any time.
3. **Ctrl/⌘+K › Check this computer…**
4. Asked in a chat as `/check-computer` (or `/setup-computer`).
5. **Skip for now**: it doesn't come back by itself (the list says where to find it). A computer already in use never
   sees it by itself.
6. One summary line on top: "3 things to set up · 2 optional", then "This computer is ready ✓".

## The lines
7. **Claude**: its version and "signed in", or what's wrong (not installed, too old for the model, not answering, signed
   out, a newer copy is installed) with its one fix: Install, Update, Sign in, or Use the newer copy.
8. **Codex (for Astra)**: the same; only "optional" when no chat uses Codex; the npm install says it needs Node.js first.
9. When one program has several problems, the line names them all ("Then: …"), the worst one gets the button.
10. **ffmpeg**: found (renders, exports, Ready to post work) or **Install ffmpeg** (Homebrew on the Mac, winget on
    Windows).
11. **Sync folder**: when your other computer's Hearth is in this computer's cloud drive, **Use this Hearth** joins it
    (it names the computer it came from; merged, nothing overwritten).
12. Sync off with a drive but no Hearth in it: **Turn on sync…**; no drive app: **Choose a folder…**; Hearth running
    from inside a cloud drive or the synced folder gone: said plainly, with the way out.
13. **Folders chats use**: every chat's own folders (⋯ › Access) and the agents' project folders, each looked up the
    way a chat would (paths the other computer wrote become this computer's).
14. A folder that isn't here: **Show where it is…** and pick the same folder on this computer.
15. That match is used everywhere chats reach files (their file access, opening and previewing what they made), and
    paths inside it follow ("…/Projects/site/index.html").
16. The matches stay on each computer (your Mac's and your PC's folders are different).
17. **Mac › Screen recording** (Hearth recording and screenshotting itself): **Allow…** shows macOS's own question, or
    **Open System Settings** at Privacy & Security › Screen Recording.
18. **Mac › Camera** (body, hand and face tracking in the Lab): the same, at Privacy & Security › Camera.
19. **Mac › Microphone** (talking to chats, live sound): the same, at Privacy & Security › Microphone. These three are
    optional: only the features that use them need them.
20. **Windows paths**: where Hearth runs from and whether long file paths are on.
21. **Allow long paths** turns them on (Windows asks for administrator once), for files deep inside projects.
22. **SmartScreen**: what to do when "Windows protected your PC" shows for a Hearth shortcut or an installer (More info ›
    Run anyway), with **Got it**.
23. **Updates**: from main, how many new changes wait (⬆ in the rail), another branch, not a git checkout, or GitHub
    out of reach with **Look again**.
24. Git missing (Hearth can't update itself): **Install Git** on the Mac (Apple's command line tools), the official
    page on Windows.

## Never silent
25. Every button that installs, updates or signs in shows **its exact command on the line before you click**; click
    the command to copy it.
26. **Official page ↗** next to installs (Claude Code, Codex, ffmpeg, Git) when you'd rather do it yourself.
27. Commands run only after your click, in a Terminal / PowerShell window you can see (Hearth never sees a password);
    the app accepts just its two documented commands by name, nothing else.

## Live
28. After you press a line's button, that line checks itself again every few seconds and turns **Ready** on its own
    (up to 10 minutes).
29. Coming back to Hearth (from Terminal, System Settings, the cloud drive app) checks everything again.
30. **Check again** looks at everything now.
31. A calm look: a colored state word per line (Ready, To do, Optional, Good to know), an ember edge on what to do.

Tested: `node dev/firstrun-test.js` (18 tests: every line's states on Mac / Windows / Linux, the summary, the first
launch, the folder match, folders read from chats, the commands shown, only two commands accepted) and
`node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/firstrun.js` (Codex missing, Claude signed
out → signed in by its button, a folder from the other computer matched by hand, first launch / skip, the command and
the Ctrl/⌘+K action); `sh dev/run-checks.sh firstrun`. The Mac permission panes and Windows' long-path switch weren't
seen on a real Mac / PC here.
