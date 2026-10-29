# Windows hourly passes

One small Windows fix an hour, each checked in a throwaway copy of Hearth and pushed. Newest last.

## Pass 1 (Oct 28): a quit or Restart that never finished
- **What you saw**: after Restart (or Quit), Hearth sometimes stayed running with no window, and the new copy never
  opened until the old one was ended in Task Manager.
- **Fix** (`main.js`, `armQuitWatchdog`): 10 s after the last before-quit, if Hearth is still running it saves once
  more, writes which windows were still open to `data/logs/quit-stuck.log`, and exits. The restart then goes ahead.
  Nothing in Hearth cancels a quit on purpose, so this only ends quits that were stuck anyway.
- **Checked**: a test copy whose page refused to unload, then Restart: the log line appeared at 10 s
  ("open windows: Projects · Hearth (hidden)"), the copy exited and the relaunched copy started.
- **Next time it happens**: open `data/logs/quit-stuck.log` to see which window held the quit up.

## Pass 2 (Oct 28): tool connections that use `npx` never started
- **What you saw**: a connection (Settings › Connections) whose command is `npx …` failed its Test with "It didn't
  start", and Claude / Codex never got its tools.
- **Why**: Hearth looked for the bare name first, and Node puts an extensionless sh script `npx` next to `npx.cmd`
  (`C:\Program Files\nodejs`); Windows can't run it (ENOENT). Also, a `.cmd` in a folder with a space plus an
  argument with a space was split by `cmd.exe /c`.
- **Fix** (`connectionsmain.js`): on Windows `.exe` / `.cmd` / `.bat` are tried first; npm's `.cmd` shims run their
  Node script directly (winpolish's plan, as the agents already do); other `.cmd` files go through `cmd /d /c call …`.
- **Checked**: `npx --version`, `vercel --version` (now straight through Node) and a `.cmd` in `a b\` given
  "hello world" all run; `dev/connections-test.js` 7/7. `dev/checks/connections.js` fails the same 6 UI steps with
  and without this change (the check is older than the current Connections screen): not fixed here.

## Pass 3 (Oct 29): a save at quit lost to a file OneDrive or antivirus was holding
- **What you saw**: rarely, the last change before closing Hearth wasn't there next time ("save failed … EPERM" in
  the log), more likely with the data folder synced or under a busy antivirus.
- **Why**: Windows refuses to replace a file another program has open for a moment (EPERM / EBUSY / EACCES). The
  store thread already retried; the main thread's save (the quit flush, and the fallback when a thread save fails),
  the usage stats and the sync writer did not.
- **Fix** (`store.js`, `storework.js`): the same short retry (5 tries, at most 0.6 s) in those three places.
- **Checked**: against a real lock (PowerShell holding the file with no sharing for 250 ms), a plain rename failed
  with EPERM and the retry saved; `dev/store-thread-test.js` 70/70; a save and read back in a test copy.

## Pass 4 (Oct 29): pass 3's retry could freeze Hearth for up to 0.6 s
- **Why**: pass 3's wait (up to 0.6 s) ran on the main thread, against round 65's rule (≤ 50 ms of waiting in all
  there, `scenesafe-core` `waitFor`): a held file during a normal save would have frozen the window.
- **Fix** (`store.js`): while Hearth runs the retry uses `SS.waitFor` (5 + 10 + 15 + 20 ms); only the quit flush, with
  no window left to keep smooth, waits up to 0.6 s.
- **Checked**: against a real 250 ms lock, the running case gave up after 87 ms (the save is held and tried again,
  as before) and the quit case saved after 383 ms; `dev/store-thread-test.js` 70/70; a save in a test copy.
