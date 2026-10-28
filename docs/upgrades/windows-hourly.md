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
