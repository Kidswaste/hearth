# aiundo (round 28): one undo for what the AIs did

The AIs change a lot by themselves now: the director edits Lab scenes, chats add to the mood board, chats with file
access write and delete files, a command an AI runs can change a setting, hooks and missions start replies while you
look elsewhere. Each place had its own undo, so "put back what Claude just did" meant knowing where to look. Now there
is **one timeline of every change an AI made**, with one ↶ on the reply that made them. It reuses each place's own
undo (the Lab's time machine, the board's edit history, chat access's copies, the old setting value): nothing is
stored twice.

## Where you see it
1. **"↶ Undo what it did"** in the actions of a reply that changed something (next to Copy / ⋯). It lists what it
   changed on hover and undoes all of it in one step, after a short confirm.
2. After that the reply says **"↶ undone"** instead.
3. **Activity › Changes by AIs**: every change by an AI, newest first, with the AI's color mark, what it did in plain
   words, the chat, how long ago. Open it with Ctrl/⌘+K **"Changes by AIs: undo what an AI did"** (it opens the
   Activity panel at that part) or the ◉ when it shows.
4. **↶ on each row**: undo this change.
5. **⋯ on each row (or right-click it)**: Undo everything that AI did since then · Undo what that reply did · Show it
   · Open the chat.
6. **Show it** opens the scene in the Lab, the board, reveals the file in Finder / Explorer, or opens Settings.
7. **Show more** lists up to 60; the newest 6 show first. Undone changes stay, struck through.
8. Just ask: **`/ai-undo`** (also `/undo-ai`): `last` (the last change in this chat), `reply` (what its last reply
   did), `chat` (everything AIs did in this chat), `list` (the timeline; `text` writes it in the chat).

## What goes in the timeline
9. **Lab scenes**: every version Claude or Astra made of a scene (the time machine's own record of the director's
   edits), e.g. "Edited the code of Orb (+3 −1 lines)" or "Layer added · Glow".
10. **The mood board**: what an agent's board call changed, exactly (items added, moved, changed, removed), e.g.
    "Added a note · board “Night drive”", "Arranged 12 items (by-hue)".
11. **Files**: a chat's new files, edits and deletes through chat access ("Created intro.txt", "Edited a.txt",
    "Moved old.png to the Trash").
12. **Settings**: a command an AI ran that changed a setting or an AI's option, with the old and new values
    ("Ran /nodes-director off: Three Director's nodesTool unset → off").
13. **Who, where, when**: the AI's name and color, the chat, the reply it belongs to, the time.
14. **Started by a hook or a mission**: the row says "⚡ when …" or "◎ Research" when the reply came from one.
15. A change that lands a moment after its reply ended (a picture-heavy Lab edit) still belongs to that reply.
16. Kept for two weeks (at most 400 changes; undone ones go first).

## Undo safely
17. **Newest first**: undoing a change also undoes the later changes to the same thing (by any AI), so nothing is
    left half done; the confirm says how many come along.
18. **A scene or a file goes back in one step** to how it was before the oldest of those changes.
19. **Board and settings changes are undone one by one**, newest first; only the items the AI touched change.
20. **"You changed it after"**: when you edited the scene, a board item, the file or the setting after the AI did,
    the confirm warns in ember and the button reads "Undo anyway".
21. **Not while it works**: undoing waits until that AI's reply in that chat is done (stop it or wait).
22. **Plainly skipped**: a change nothing can undo (a huge file with no copy, Astra's own edits outside the
    permission check) is listed as "can't be undone here", never faked.
23. **The Lab undo is a time-machine version** ("Undid Claude's change: …"): scrub back to the AI's version if you
    change your mind.
24. **The board undo is a board edit**: Ctrl+Z on the board brings the AI's change back.
25. **The file undo goes through chat access**: the copy taken before the AI wrote comes back, a file the AI created
    goes to the Trash, and the newer version is kept as a copy too. It shows in that chat's access log.
26. **A file a chat deleted can come back now**: Hearth keeps a copy (up to 25 MB) before moving it to the Trash, so
    its Undo (here or in the access log) puts it back where it was.
27. Your own undo is never counted as an AI change.
28. One plain toast after: "↶ Undid 3 changes by Claude" (or where it stopped and why).

## For the AIs (no per-message tokens)
29. The app map the chats read on demand says every change is in this timeline: asked to undo what it did, an AI
    points you to ↶ on its reply instead of reverting by hand.

## Light
30. Its own small lazy group (`aiundo`, ≈ 30 KB with its CSS) right after the first screen. Nothing runs while idle:
    it listens to signals that already exist (the time machine's version event, chat access's log event, Commands'
    before / after, the replies' start / end) plus one wrapper around the board's agent calls.
31. Recording a change costs a few comparisons (board: the items of one board before / after the call; settings: one
    snapshot only while an AI's command runs).
32. One kv file (`aiundo`), saved half a second after a change.

Count: **32** upgrades.

## Tested
- `node dev/aiundo-test.js` (unit, 33 checks): the asked change plus later ones to the same thing, newest first;
  one step back for a scene / a file, change by change for the board / settings; since… / a reply / a chat; a change
  with no copy skipped; board item diffs, their inverse and the owner's later touches; settings diffs and old values
  back; pruning.
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/aiundo.js` (also
  `sh dev/run-checks.sh aiundo`, 34 s): the fake director's real MCP calls edit its Lab scene and add two board notes,
  a second reply writes a new file and edits another through chat access, a third runs `/nodes-director off`; all four
  kinds land in the timeline with who / chat / reply; the reply shows "↶ Undo what it did"; undo the new file (gone);
  the owner edits a.txt → a warning first, then undo anyway (as before); the owner edits one of the AI's notes → the
  reply's ↶ asks with the list and the warning → the scene is back (as a time-machine version) and both notes are
  gone; the reply says "↶ undone"; the setting is undone from the Activity part's ↶; the row's right-click menu;
  undo since; "nothing left"; `/ai-undo text`; kv saved.
- Re-ran the checks of the files touched outside this stream: `access-chat`, `activity`, `unit:boot-test`; and
  `node dev/lazy-manifest.js` (the lazy build matches).

## Notes / risks
- A Lab undo restores the scene to the version before the AI's change: owner edits made after it go back too (the
  confirm warns; they stay in the time machine).
- The board recorder compares the board the call targets and the one on screen; a board call that changes a third,
  unloaded board is not recorded.
- Settings changes are recorded only when an AI runs a command (three_run) during its reply; there is no AI tool that
  writes settings directly today.
- Changes made before the `aiundo` group loads (the first second after start) aren't in the timeline.
- Outside this lane (small, additive): `board-cmds.js` and `board-pack.js` (their HubBridge registration goes through
  `AiUndo.board`), `access.js` (a copy before a chat's delete; the log's Undo for such deletes; the log event also on
  the permission check's update of an engine-reported line), `activity.js` (mounts the part; "All quiet" counts it),
  `lazy-data.js` (the group + manifest), `index.html` (the lazy-at tag), `mcp/hearth-map.js` (one sentence),
  `dev/run-checks.js` (group + unit), `FEATURES.md`, `docs/upgrades/README.md`.
