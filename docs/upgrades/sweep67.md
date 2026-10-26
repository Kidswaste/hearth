# sweep67 — Codex's failing scans, questperf65 on today's map, project checks (round 67)

On main ffa46a9 three Node scans failed on code that came in with Codex's recent work, questperf65 couldn't run (its
"Outing desk" button is gone) and two project checks failed. This stream fixed the real problems and brought the stale
checks up to the current UI. Every touch of a Codex file is small, additive and marked `(sweep67)`.

## What shipped
### Data safety (unit:datasafe-scan)
1. **Visual feedback's review history can't be wiped by a bad read (a real risk, fixed).** `visual-feedback.js`
   `saveReview()` read `visual-feedback` with an empty fallback and saved `[new review, …fallback]`. If the read failed
   (a file held for a moment on Windows, an iCloud placeholder), the last 19 reviews were saved over with only the new
   one. It now goes through `DataSafe.load` (one retry) and `DataSafe.save`, and builds the list only on a read that
   worked. Otherwise the review is still shown, the history is left as it was, and a calm note says so.
2. **Sidequest's "Take a quest from my project chat" cache reads safely.** `tools/quest-chat.js` caches the planned
   tasks per project under `quest-chat-<id>`. This is a cache the app can rebuild, so there was no data at risk. It now
   uses a status read anyway: a cache that couldn't be read is neither used nor written over. Only an `ok` or `missing`
   read may save.
### Windows and Mac (unit:winmac-test)
3. **Cloud-file check on Windows uses Windows' own PowerShell by its full path**
   (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`). A PATH without that folder no longer turns every
   OneDrive/iCloud file into "unknown / still downloading". The multi-line script now goes as `-EncodedCommand`
   (UTF-16LE base64), so cmd-style quoting can't change it. File paths still go through stdin as JSON (UTF-8, spaces,
   quotes, `$`, backticks).
4. **Sync's rename queue folds case on the Mac too.** Two spellings of one destination (case, or the decomposed accents
   the Mac's disks hand out) now share one queue, as on Windows. `nfc(path).toLowerCase()` on win32 and darwin.
### Calm errors (unit:errorcalm-scan, 11 places)
5. **11 places that put a raw error on screen now use the plain-words layer** (`calmError(err)`). The places:
   - offline.js: the offline check's status line
   - questguide.js: the quest helper's error line
   - Outing desk: the visit-time warning
   - Sidequest Studio proof and evidence pickers: the text-file preview, the chat list, the message list, the
     "gather proof" progress line and the proof feedback line (7 lines in quest-journal.js)
   - Visual feedback: the cost line

   Messages that were already plain stay as they were.
### Checks
6. **questperf65 measures again.** The Outing desk is opened from **Sidequest Studio › Map › Events**, the Map tab's row,
   instead of the removed map button.
7. **questperf65 also reports what round 66's map layers cost** (`out.layers66`). It re-renders the map page with Park
   jams and Paris place quests on, then with them off, at the city zoom and at zoom 14. It also times the layer's own pin
   work and counts herepin pins. These numbers are reported only; they have no budget.
8. **project-workspaces and projects checks follow Codex's current project desk.** Both failures were stale checks, not
   app bugs (details under For Codex).
9. **outing-desk check** opens the desk from Map › Events too. It was failing the same way, and it covers the Outing
   desk line touched above.
10. **cloud-files-test** joined the single `UNIT` list (it wasn't run before). Group **`sweep67`** in `dev/run-checks.js`
    runs everything this stream touched.

## questperf65 numbers (this shared 4-CPU Linux box, offline tiles, the big fixture: 100 places, 128 pins, 160 events)
Script ms per click, best of 3. Budget 16 ms. "Before 66" is the same updated check run on cc8c65b, just before the
round-66 map merges, back-to-back with "now" in one lock hold.

| interaction | before 66 | now (run A / B / C) |
|---|---|---|
| pin click | 11.2 | 13.4 / 14.4 / 12.6 |
| ★ favorite | 0 | 2.2 / 9.8 / 4.7 |
| visit stamp | 3.0 | 3.6 / 1.8 / 0 |
| **place details dialog open** | **14.0** (runs 34 / 42 / 14) | **22.8 / 23.0 / 20.6** (over budget) |
| dialog × close | 2.9 | 3.9 / 7.0 / 7.9 |
| Outing desk open (Map › Events) | 6.7 | 3.9 / 7.2 / 3.4 |
| Outing desk close | 4.9 | 4.3 / 4.1 / 5.2 |
| Shows chip off / on | 7.6 / 16.0 | 11.5 / 10.0 · 10.1 / 15.6 · 10.8 / 14.9 |
| rail away / back | 4.2 / 0 | 4.3 / 0 · 5.1 / 7.7 · 5.5 / 0 |
| Map tab on the map | 7.9 | 9.7 / 13.0 / 11.8 |

**Round 66 map layer cost** (Park jams + Paris place quests; herepin draws nothing until you set a pin):
- **Building the layer's pins costs 0.11–0.16 ms** per map render.
- **At the city zoom it adds 1 pin** (128 vs 127).
- **At zoom 14 it adds 14 pins** (83 vs 69).
- **A whole map re-render (median of 15) shows no measurable difference.** With the layers on vs off:
  - city zoom: 28.2 vs 28.6, 31.7 vs 29.0 and 26.6 vs 42.4 ms
  - zoom 14: 31.4 vs 31.5, 25.8 vs 27.6 and 31.3 vs 33.3 ms

  The gaps are within this machine's noise, so the round-66 layers are not where the lag is.

**The one clear finding: the place details dialog is about 7–9 ms slower than before round 66.** Its script went from
14 to 21–23 ms in every run, and it now fails the 16 ms budget. Forced style is about the same (10.1 vs 10.5 ms), so
the extra time is script inside the click (`quest-journal.js:140 click`). The noise is large here (the "before" run's
other two tries were 34 and 42 ms), so this is worth a CPU profile (`window.QP_PROFILE = 1`) before anyone changes code.
Everything else is within noise of round 65's numbers.

## Tests
- `unit:datasafe-scan` ✓, `unit:winmac-test` ✓ (609/0), `unit:errorcalm-scan` ✓, `unit:cloud-files-test` ✓ (now checks
  the full path and the encoded script), `unit:sync-test` ✓ (180), `unit:adaptive-feedback-test` ✓,
  `unit:quest-life-test` ✓, `unit:quest-paris-test` ✓, `unit:boot-test` ✓.
- App checks, under `flock /tmp/hearth-run.lock`, ≤ 5 per hold:
  - passed: `lazy`, `project-workspaces`, `projects`, `outing-desk` (with its reload part), `quest-chat-context`,
    `mapfirst64`, `offline`
  - `questperf65` runs fully and reports. It fails only the details-dialog budget (above).
- A throwaway smoke script tested the visual-feedback history:
  - two reviews save as [r2, r1]
  - an unreadable history: `saved: false`, the history is still [r2, r1], and the calm note shows
  - before the retry fix, the same test lost r1 and r2 (see the DataSafe note below)
- These fail the same way on untouched main ffa46a9. They are not from this stream, so they are left for Codex:
  - `quest-studio`: the rail button is now the "Life" space, not a "Sidequest Studio" tool button
  - `questhud61`: "Studio repainted" timeout
  - `quest-proof`: a button it looks for is gone
  - `routine-feedback`, `visual-feedback`: they need `--fake-engines` / a `FEEDBACK_FIXTURE` MP4 that the runner
    doesn't pass. With `--fake-engines`, routine-feedback fails earlier at "Recording did not restore paused playback".

## Note for the lead: a gap in `DataSafe.save`
When the first read failed and a re-read inside `save()` succeeds, `save()` writes a value the caller built on the
fallback. That can replace good data. visual-feedback.js steps around this by building only on a good read. Other
callers that follow the "load → change → save" pattern with a `null` / empty fallback may want the same guard. Another
option is for `DataSafe.save` to refuse unless the caller passes a value built on a good read. This was not changed
here, because it's shared code.

## For Codex
All edits are tiny and marked `(sweep67)`; behaviour is the same except where noted.
- `tools/quest-chat.js` (`prepare`): the cache read is `hub.kvGet(key, null, { status: true })`. The cached tasks are used
  only on `ok`, and saved only when the read was `ok` or `missing`.
- `visual-feedback.js`:
  - `saveReview()` uses `DataSafe.load` (one retry) and `DataSafe.save`. On an unreadable history it returns
    `{ entry, reviews, saved: false }` and shows a note. The return value gained `saved`.
  - The cost line uses `calmError(e)`.
- `cloud-files.js`:
  - `PS_EXE()` is the full Windows PowerShell path and `ENCODED` is `SCRIPT` as UTF-16LE base64.
  - It runs with `-EncodedCommand` instead of `-Command`. The stdin JSON contract is unchanged.
  - `dev/cloud-files-test.js` checks both.
- `sync-engine.js` (`renameRetry`): the queue key is `nfc(resolve(to)).toLowerCase()` on win32 and darwin.
- `tools/quest-journal.js` (7 lines), `tools/outing-desk.js` (1), `questguide.js` (1), `offline.js` (1): `e.message` →
  `calmError(e)` on screen.
- Stale checks updated to your current UI:
  - `dev/checks/project-workspaces.js` waits for the project desk (`.pj-home .pj-p-head`). The `.pw-project-tools`
    toolbar hasn't been drawn since 02895c4, and `ProjectWorkspace.toolbar` is still exported but unused.
  - `dev/checks/projects.js`: "its page lists chats and scenes, with notes" now checks:
    - the desk's shelf sections, including Conversations
    - the lazy "Project files · N" shelf
    - `.pj-notes`
  - `dev/checks/outing-desk.js` opens the desk from Map › Events.
- Still stale on your side (same on main): `quest-studio`, `questhud61`, `quest-proof`, and the runner flags for
  `routine-feedback` / `visual-feedback` (see Tests).

## For the patch notes
- **Visual feedback no longer risks wiping your review history.** If the history file can't be read for a moment, your
  new review is still shown, the old ones are left alone, and a short note tells you.
- **On Windows, Hearth now finds PowerShell by its full path.** This makes the check for OneDrive and iCloud files that
  are still downloading more dependable.
- **On the Mac, sync handles file names that differ only by capital letters or accents** as the same file, as Windows
  already did.
- **Eleven more places show errors in plain words** instead of the computer's raw message: the offline check, the quest
  helper, the Outing desk's visit time, Sidequest's proof and evidence pickers, and Visual feedback's cost line.
- **The Sidequest map speed test works again.** It now opens the Outing desk from Map › Events.
- **The new map layers from round 66 (Park jams, Paris place quests) don't slow the map down.** The test measured no
  difference.
- **Opening a place's details on the map is a little slower than in round 65** (about 21–23 ms of work against a 16 ms
  target). It's flagged for a closer look.
