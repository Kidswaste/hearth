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

## Pass 5 (Oct 29): deleting or restoring a chat failed while OneDrive held its file
- **What you saw**: now and then a chat wouldn't delete (or come back from Recently deleted) with an EPERM / EBUSY
  error, more likely with the data folder in a cloud drive.
- **Fix** (`store.js`, `renameSoon`): the move to / from the Trash tries again for up to 1 s, asynchronously (the
  window keeps running while it waits).
- **Checked**: against a real 400 ms lock, a plain move threw EBUSY and the new one moved the chat after 639 ms with
  the event loop running the whole time; delete → gone → restore → back in a test copy; `dev/store-thread-test.js` 70/70.
- **Noticed, not changed** (not Windows-only): Recently deleted ages a chat by its file's modified time, which a move
  keeps, so a chat last changed over 30 days ago is purged on the next look at the Trash right after it's deleted.

## Pass 6 (Oct 29): read-aloud mangled every accent on Windows
- **What you heard**: Windows' own voice reading a reply in French said "caf├⌐" for "café" (any é, è, à, ù, ç, œ).
- **Why**: the text goes to PowerShell on stdin (never on the command line), and Windows PowerShell 5.1 reads stdin
  in the console's OEM code page, not UTF-8.
- **Fix** (`voicemain.js`): the speech script sets `[Console]::InputEncoding` to UTF-8 first.
- **Checked**: PowerShell read "café élan où" as "caf├⌐ ├⌐lan o├╣" before and "café élan où" after; Hearth's own
  `say()` (sound sent nowhere) read "Bonjour, café élan où Noël" exactly; a test copy starts with no page errors.
  Also checked, fine as they are: cloud-files' PowerShell helper with accented paths (both ways).
  `dev/voice-test.js` stops at its first step on Windows with and without this change (its fake whisper is a .js
  file, which Windows can't start: EFTYPE): not fixed here.

## Pass 7 (Oct 29): Now Playing lost accents in titles and artists
- **What you saw**: the Now Playing card showed "Beyonc�" or "Caf� ouvre" for a song with é, è, à, œ… in its
  title, artist or album.
- **Why**: pass 6's problem the other way round: Windows PowerShell 5.1 writes a pipe in the OEM code page.
- **Fix** (`nowplaying.js`): the loop script sets `[Console]::OutputEncoding` to UTF-8, and Hearth reads its output
  as UTF-8 text (a character split across two chunks stays whole).
- **Checked**: PowerShell's JSON for "Beyoncé" / "Café œuvre" came through as "Beyonc�" / "Caf� ouvre" before and
  exactly after; the real Now Playing script, run from a scratch folder, read Spotify's current track; a test copy
  starts with no page errors.
