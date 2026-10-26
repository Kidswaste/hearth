# vstfix70: the three Sound desk checks that failed on main (round 70)

sweep69 listed three checks that also failed on its base: vstembed64, parkjam62 and playback-volume. One was a real bug in
the app. The other two were problems in the checks.

## What was wrong, and what changed

1. **vstembed64: switching from Vital to Serum 2 left Vital's editor open. This was a real bug.**
   - Cause (`tools/workbench-vst.js`, `openInstrument`): the desk closed the previous instrument's editor only if the
     last live-status readout said it was open. That readout comes once per second. The editor can open by itself:
     on Windows the owner's choice is "here", so it opens on the first open and again after Reset host or an ASIO
     switch. If the owner switched instrument before the next readout, `editor-close` was never sent. Each instrument
     has its own host, which stays alive, so Vital's editor stayed open in that host. On Windows it stayed as a child
     window inside Hearth's window: a frozen Vital editor stuck on the Sound desk, which no longer followed the layout
     or hid under menus. Serum 2's editor then opened on top of it or beside it. A debug run on main confirmed it:
     4 s after the switch, Vital's host still reported `editorOpen: true` with the editor `embedded`.
   - Fix: the desk now always asks the previous instrument's host to close its editor when the instrument changes. If
     the editor is already closed, the host does nothing.
   - Windows path (`creative-vst-embed.py`, `creative-vst-host.py`): before the host asks the plugin's loop to end,
     `Embedder.let_go()` gives an embedded editor back to the desktop, hidden. It hides the window first
     (SWP_HIDEWINDOW), then calls SetParent(NULL) and restores the saved styles, so nothing flashes on screen. As a
     result, Hearth's window never keeps a child window of a plugin that is closing. This holds even when the plugin
     takes longer than the host's 3 s close wait, and when Hearth's own window closes (`closeEditors`). It also covers
     Live set preset reloads (`reopen_editor`). On the Mac, the borderless editor goes transparent instead.
     `Win32.release` / `Mac.release` take `hidden=True` for this; Pop out is unchanged.
   - Test layer: `fakewin32.Backend.release(hidden=True)` marks the fake window hidden and logs `release-hidden`.
     `dev/vstembed64-test.js` adds one check: after `let_go()`, the window is no longer a child, is hidden, and its last
     call was `release-hidden`.

2. **parkjam62: "the week's review hears the loop became proof". The check was wrong; the app is fine.**
   The check waited for the take's `proof` mark and then read the week events at once. The app saves the mark, then
   awaits `persist()`, opens the quest and only then sends the `hearth:quest-week` event, so the check read too early.
   The debug run showed the second `park-jam` event (with `proof.quest`) arriving within the next few hundred ms. The
   check now waits up to 5 s for that event. The owner would have seen nothing wrong, because the week in review
   updates when the event arrives.

3. **playback-volume: timeout. The check was wrong; the 75% master volume works.**
   Codex's check is meant to run through `dev/playback-volume-smoke.js`, which fills in `__VOLUME_FRAME__` (a test
   frame built from `tools/three-sandbox.html`'s playback bootstrap). `dev/run-checks.js` runs the raw check, so the
   iframe loaded the literal `__VOLUME_FRAME__` and never answered. When the placeholder is still there, the check now
   builds the same frame itself in `SMOKE_TMP`. The wrapper still works (re-run: ok).

## Checks (base = main, all three failing; after = this branch)
`node dev/run-checks.js --exact vstfix70` (new group):
vstembed64 ✓ · parkjam62 ✓ · playback-volume ✓ · vst-live ✓ · midilearn69 ✓ · lazy ✓ · unit:boot-test ✓ ·
unit:vstembed64-test ✓ (61 checks, including the new hand-back check) · unit:vst-live-host-test ✓ ·
`node dev/playback-volume-smoke.js` ✓.

## For Codex
All changes are small, additive and marked "(vstfix70)":
- `creative-vst-embed.py`: `release(h, screen_xy=None, hidden=False)` on Win32 and Mac (hidden = hide first, hand back,
  leave hidden) and a new `Embedder.let_go()`.
- `creative-vst-host.py`: `close_editor()` calls `engine.embed.let_go()` first (one line).
- `tools/workbench-vst.js`: an instrument switch always sends `editor-close` to the previous instrument's host. Before,
  it did so only when the last 1 s readout showed the editor open.
- `dev/checks/playback-volume.js`: builds its test frame itself when run without `dev/playback-volume-smoke.js`.
- `dev/fixtures/fake-vst-py/fakewin32.py`: `release(hidden=True)`.

## For the patch notes
- Switching instrument in the Sound desk (for example Vital to Serum 2) now always closes the old instrument's editor.
  Before, if you switched soon after the editor opened by itself (first open, Reset host, or the ASIO switch), the old
  Vital editor could stay stuck on the desk, frozen, next to or under Serum 2's editor.
- On Windows, a plugin editor shown inside Hearth is now taken out of Hearth's window before it closes, so a slow or
  stuck plugin can no longer leave a dead editor window on the desk. This also applies when Hearth itself closes.
