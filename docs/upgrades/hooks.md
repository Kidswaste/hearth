# ⚡ Hooks (round 26, hooks): "When something happens, this AI does this"

You asked for hooks that give the AI more reach. They're a section of **⋯ AI setup** (⋯ in a chat's header, a
window's header, or ⚙ in the rail): **⚡ Hooks: when… then…**, a short list per AI. Click **＋ Add a hook**, pick
*When*, pick *Then*, write your words, **Add**. No commands to learn. When it fires, the AI gets your words exactly as
you wrote them, with **one line from Hearth above them saying what happened** (the render's path, the error, the new
file…). Both show in the chat, marked **⚡ hook**. Nothing is hidden in your words, and nothing is added to the AI's
system prompt.

Files: `hooks-core.js` (the plain logic, tested in Node), `hooks.js` (the live part and the panel section),
`hooks.css`, `hooksmain.js` (main process: the folder watcher). Lazy group `hooks` (loads shortly after the start).
Small additions elsewhere: one line each in `main.js`, `preload.js`, `tools/three.js` (the Lab tells
`hearth:lab-error`) and `options.js` (the section), plus the group in `lazy-data.js`.

## When… (what Hearth can really notice)
1. **A render or export finishes**: anything in the render queue (Lab sequence renders, Lab exports, recordings,
   cuts), done or failed. Hearth's line gives the title and the file path, or why it failed.
2. **The Lab scene shows an error**: the error and its line (and layer). Good on the Three Director: "Fix it".
3. **A file appears in a folder…**: pick the folder; Hearth watches only that folder (no subfolders, no polling) in
   the main process, and only while a hook asks for it.
4. A file still downloading or being written isn't announced until it stops growing.
5. Files that were already in the folder never count. Neither do hidden files, partial downloads (`.crdownload`,
   `.part`…), lock files or temp files.
6. **Every day at a time…**: e.g. 09:00, while Hearth is open. If Hearth opens hours later, it waits for the next
   day instead of firing late.
7. **Every few hours…**: every 1 / 2 / 3 / 4 / 6 / 8 / 12 / 24 hours while Hearth is open, counted from when you made it.
8. **Hearth updates**: after ⬆ Update pulls main, with the versions and the number of files that changed.
9. **Another AI finishes a reply**: any other AI, or one you pick ("when Astra replies, Claude adds one idea"), with
   the chat's title and the start of the reply.
10. **The mood board gets new things**: counted a few seconds after they land, with how many there are and what kind.

## Then…
11. **It gets your message**: your words plus Hearth's line, sent in that AI's open chat. A new chat is started if
    none is open.
12. **Or a mission, with your message**: Split it up, Swarm, Answer then review, Debate, Side by side, Jam, Pair on
    code, Ask everyone (missions.js).
13. If you had already picked a mission for your own next message, a hook's mission doesn't use it up: yours is kept.

## Guard rails
14. **Once a minute at most** per hook. News that comes sooner waits, and the newest one goes when the minute is up.
15. **Never while that AI is answering.** The hook waits its turn and goes after anything you typed in the meantime.
    The line then says how many like it came while the AI was busy.
16. **⚡ hook** on every message a hook sent (hover it to see which hook), and a small "⚡ hook · When…" note in the
    chat with a **Hooks…** button that opens the list.
17. **The same news twice within 10 minutes is told once** (the same error over and over, say).
18. **A hook that fires 10 times in an hour pauses itself** (a loop: say a fix that brings the error back). It tells
    you in the chat, and you can turn it back on in ⋯.
19. **No ping-pong**: a reply to a hook's message never sets off "another AI finished a reply" hooks.
20. **❚❚ Pause all**: one button stops every AI's hooks on this computer, and the folders stop being watched.
    **▶ resume** turns them back on.
21. Nothing new is allowed: a hook only sends a message. Anything risky still goes through that AI's normal
    permission asks, exactly as if you had typed it.

## The list
22. Each hook reads in plain words, e.g. "When a render finishes → it gets 'Look at the render…'" or "When a file
    lands in Downloads → 🔍 Answer, then review with '…'".
23. Untick a hook to pause just that one (it's struck through). × removes it.
24. Double-click a hook to change its words.
25. **▶ Try it now** fires a test with a made-up line. Once a minute still applies.
26. Hover a hook to see the full message and when it last fired.
27. Up to 12 hooks per AI. They're saved on the AI (`agent.hooks`, like its instructions), so they sync with your
    config. When they last fired is kept per computer.
28. `/hooks` (the internal API, never shown in the chat box) lists this AI's hooks; `/hooks pause`, `/hooks resume`
    and `/hooks test 2` do what they say.

## Tested
- `node dev/hooks-test.js`: 36/36. Covers making hooks safe, the words, every guard rail's arithmetic, the timers
  (daily not late, every N hours) and the real folder watcher on a temp folder (new files only, a growing file once it
  stops, no partial downloads, a rewrite isn't new, nothing after stopping).
- `node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/hooks.js`: all pass. It adds a hook
  in the ⋯ panel, then checks:
  - a render reaches it: Hearth's line on top, your words as written, ⚡ hook and the note;
  - a second render within the minute waits;
  - a Lab error while the AI answers waits, then goes once the reply ends;
  - a file written into a watched folder reaches Astra through the main process;
  - Claude's reply sets off Astra's reply hook, but a reply to a hook doesn't;
  - a mission runs with the message and your own mission pick is kept;
  - pause all, and `/hooks`.
- `node dev/lazy-manifest.js`: the lazy build matches (848 names, 0 duplicates).
- Groups: `sh dev/run-checks.sh hooks`.
