# Reach (round 19): what a chat makes can always be opened, on whichever computer you are

You hit this on the PC: Astra said "I can't open it for you here: the file isn't on this PC. The characters were saved
on your Mac, in Hearth's workspace: /Users/…/Hearth/data/workspace/stoop-ronin/index.html … I can't launch a browser.
You'd have to double-click it yourself." You said: "make sure this can't happen anymore". Three things caused it:
the chats' workspace never synced, a Mac path meant nothing on Windows, and the chats had no way to open anything.
All three are fixed. Then, for "the clash of what to sync from which computer isn't very clear on what I'm saving
over", the sync conflict choice was rebuilt so it says exactly what wins and what goes where.

## What chats make now syncs
1. **The chats' workspace syncs** (`data/workspace`, where Claude and Astra write what they make): its project folders go to the cloud drive and arrive on the other computer, both ways, with the usual conflict handling.
2. **What can be rebuilt stays on each computer**: `node_modules`, `.git`, `__pycache__` / `.pyc`, `venv` / `.venv`, `.cache`, `.next`, `.parcel-cache`, `.turbo`, `bower_components`, hidden files, and temp files (`.tmp`, `.part`, `.crdownload`, `~$…`).
3. **No huge files from the workspace** (a model checkpoint, a build archive): over 100 MB it stays where it is and is listed with the big files kept on each computer, even with "Sync big videos" on.
4. **A project's own JSON stays byte for byte** (package.json, a scene file a chat wrote): workspace files sync as whole files, never reformatted or merged as Hearth data.
5. **A chat's access folders inside the data folder** (`projects/<chat>`, round 14) sync too, and their paths stored on the chat open on the other computer.
6. **Cheap**: only what changed is read (size + time first), the same calm pacing; dependency folders aren't even watched.

## Paths from the other computer work here
7. **A Mac path on Windows (and the reverse) resolves to this computer's own data folder**: first with sync's own path forms (the other computer's folders from its machine record), then any `…/Hearth/data/…` (or the folder this Hearth lives in), then `…/data/workspace/…` and friends, then the other computer's home folder → yours. `file:///…` links too.
8. **Pictures and videos a reply names with the other computer's path** show big in the reply anyway (chat-media), at this computer's copy.
9. **Pages a reply names** (an `index.html`, a PDF, an SVG, full path or relative to the chat's folder) show as a card under the reply (below).
10. **Paths in a reply are clickable**: click a path in inline code (`/Users/…`, `C:\…`, `~/…`) for ▶ Open, Open in your browser, Preview in Hearth, Reveal in Finder / Show in Explorer, Copy path; a path from the other computer opens this computer's copy (the menu says so).
11. **Access folders stored on the other computer** (a chat's folders with a Mac path, on Windows) are translated before a run, so the chat keeps its folders.
12. **The engines are told once, only while a chat's file access is on**: one short clause ("paths from the user's other computer (…/Hearth/data/…) are the same files in <this data folder> here"). Nothing is added when access is off.
13. **A file still on its way says so**: "On its way from MacBook (sync): it opens here as soon as it arrives" (dashed card, buttons waiting).
14. **…and shows when it arrives**: when sync brings it, the card opens up in place and a toast says "index.html arrived from MacBook" with ▶ Open; a waiting picture appears in the reply.
15. **Made on the other computer while sync is off**: the card says so, with **Turn on sync** right on it.

## Open what a chat made
16. **A page / file card under the reply**: name, folder, **▶ Open** (your browser for a page, the file's app otherwise), **Preview**, **⌕ Reveal**; click the card to open; right-click for Open in your browser, Preview, Reveal, Copy path.
17. **Preview in Hearth**: a separate sandboxed window (no Node, no preload, its own storage, permissions refused, local files only); links to the web open in your browser; F5 / ⌘R reloads, ⌘W closes; opening the same page again reloads its window instead of opening a second.
18. **`chat_open`, a tool for both engines**: `chat_open { path | url, how: default | browser | reveal | preview }`; the chat opens a file, page, folder or web page for you instead of saying "double-click it yourself". Its one-line description tells both engines they can (nothing in the system prompt).
19. **Claude has it with its chat tools** (on by default).
20. **Astra has it too, alone** (one small tool, about 60 tokens a message), even when its other chat tools are off; Codex runs it pre-approved like Hearth's other tools.
21. **`/open-tool on | off`** (in an Astra chat): keep or drop Astra's chat_open.
22. **Low-risk asks**: files inside the chat's folders, its project folder or Hearth's data open at once; a web page or a file elsewhere asks once with the usual access card (Allow once · Allow for this chat · Deny), logged in the chat's activity log.
23. **What chat_open opened shows as a card** in the reply too (open it again later).
24. **chat_open with a file still on its way** answers the chat with "still on its way from MacBook" and leaves the waiting card, so the engine tells you instead of failing.
25. **`/open-file <path | url> [browser | preview | reveal]`** (alias `/open-page`): open anything from the composer, a path from the other computer included; with no path, the last page a reply made.
26. **The app map knows it** (topic `sync`): the workspace syncs, paths from the other computer are translated, and chat_open is how to show the owner something.

## Sync conflicts: clear about what you are saving over
27. **Each side named by computer and platform**: "This PC (Windows)" and "MacBook (Mac)".
28. **When each one was last changed there**: "edited 10:42, 8 min ago", and which one is **newer**.
29. **What it is, in words**: the chat "Stoop Ronin", the Lab scene "Neon Rose", the board "Refs", Settings, "index.html" in the project stoop-ronin; the file path only under **Details**.
30. **Chats: the real difference**: the title on each side, and the messages only on one side (the last three, quoted).
31. **Lab scenes**: this computer's thumbnail beside the other side (its picture lives on that computer), which layers exist on only one side, and whether the code differs (lines on each side).
32. **Settings and other data**: the changed options with both values, item ids turned into names.
33. **Pictures and media**: both thumbnails (or video frames) with size and date.
34. **Buttons that say what happens**: "Keep MacBook's version" (this PC's goes to Deleted files), "Keep this PC's version" (MacBook's goes to Deleted files), each with the details on hover.
35. **Keep both**: the other version is saved next to it as "… (from MacBook)" (a file: `notes (from MacBook).md`; a chat: a second chat titled "… (from MacBook)").
36. **Merge** (chats, scenes, settings, any Hearth data): everything from both, and where they differ the newer one wins.
37. **Every choice is undoable**: the version that loses goes to Deleted files under its real name (30 days), and the dialog says so.
38. **Put a version back over the current one**: restoring from Deleted files when the file is there now asks "Put this version back?" and moves the current one to Deleted files (so that can come back too).
39. **Pick, then Apply**: choices are marked first; a summary line says what will happen before anything changes ("3 from MacBook, 1 from this PC, 1 kept both").
40. **Done toast with a way back**: "Done: … Undo any of it from Deleted files" with a Deleted files button.
41. **The big-change guard names every file**: "Review the 42 deleted files by name…" (dot menu, `/sync review`) lists what would be removed from this computer (deleted on MacBook) and what from the cloud copy and your other computer (deleted here), in words, with sizes; then "Keep them (bring them back)" or "Delete those 42 (to the trash)".
42. **`/sync review`**: that list from the composer.

## Tested here
- `node dev/sync-test.js`: 22 new checks: the workspace both ways byte for byte, dependency / cache / temp / huge files kept local, an access folder syncing, a file on its way (and from which computer), Mac / Windows / file:// / home paths translated (with and without the other computer's machine record), conflict preview (computer, platform, both times, both versions), Keep both (chat and file), Merge, Keep this one → the other in Deleted files, "put this version back" over the current file, the big-change list by name. (4 older checks fail the same way on the untouched main here: late journal, crash resume, simultaneous passes, three computers; not from this work.)
- `dev/checks/reach-open.js` (smoke, fake engines, 18 steps): Mac and Windows paths resolve, a reply naming a Mac path gets a page card + a clickable path (its menu), a waiting card opens up when the file arrives, Preview opens, chat_open through the fake Claude CLI's real MCP calls (inside: no question; outside: Allow once), through the fake Codex (Astra, chat_open alone), `/open-tool`, `/open-file`.
- `dev/checks/sync.js` updated for the new conflict view (what it is, both sides with times and "newer", the choices, the summary, Apply).
- Also run: chat-media, access-chat, qa-commands, lazy, unit access-test, astra-engine-test (updated: a plain Astra has chat_open alone), robust-engine-test, director-cost.

Not verified here: a real cloud drive client, a real Windows / Mac pair, `shell.openPath` / "Reveal" on a real desktop (Linux test window only), the real Claude Code / Codex CLIs (faithful fakes).
