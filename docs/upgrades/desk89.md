# desk89: Clink's Desk without a hitch (round 89)

Round 86 left two window tasks over 50 ms around projects (`projopen86.md`, "What's left"):
- arriving on the **Desk** of the owner's biggest project, Clink (1,069 things): one 50–70 ms task (`projects-home.js`
  `paintProject`), on every switch to it and on the first one after a restart;
- **Export…**: the window's prepare (a JSON copy of the body, then the secrets scrub) was 50–80 ms for a project whose
  chats are under 8 MB.

This round measures what those tasks are made of and takes out the big pieces. What you see is unchanged: the same
Desk, the same rows in the same order, the same shelves open, the same scroll place from the very first frame, the same
caret, the same export file with exactly the same secrets taken out.

## The check and its fixture
- **Fixture:** projopen86's (`dev/projopen86-fixture.js`): made up with a fixed seed, never real data. Clink holds 1,069
  things there (15 chats, 5 scenes, 3 boards, 700 files, 220 captures, 120 renders), the same size as the owner's, so no
  new project was needed. Ember Tide 1 and Glass Tide 2 (129 things each) are the other two the name ▾ switches between.
- **App check:** `dev/checks/desk89.js` (group `desk89` in run-checks).
  - **cold**: the first project opened (the Clink card); **switch**: name ▾ to Ember Tide 1 → Glass Tide 2 → Clink,
    3 rounds; **back**: Clink's Desk left with its files shelf open (60 rows), a filter typed and scrolled down, then
    back; **again**: the Desk drawn again in place with the caret in the filter; **export**: ⇪ Export… with its chats.
  - It times **the task that drew each Desk and the frame after it**, long or not. A MutationObserver on the Desk's
    body marks the draw (it runs inside the task that replaced the Desk), a `requestAnimationFrame` from there marks the
    frame, and the trace says which task each mark fell in (`dev/trace-stats.js` `marked`, new). The Export click is
    timed the same way.
  - It checks that nothing changed: every shelf, row and file name in order, the shelves open, the filter's words,
    `Show more`, the scroll place right after and **in the first frame drawn**, the caret and its selection; and that
    the export file is written and prepared in slices, and that the sliced prepare = the old one on Clink's own body
    (with a made-up key planted in a copy).
  - Load-aware as in checkfix88: a Desk task over 50 ms whose own CPU time fits is "can't tell" (the box was busy),
    not a failure. Over on its own CPU fails.
- **Unit:** `dev/desk89-test.js` (100 checks), see "Tested".

## Where the Desk's task went (profiled)
Clink's Desk on the switch, measured with marks inside `paintProject` (8 draws in one run) and a trace of the task.
The task was 38–58 ms here (with the rest of the switch's own step: the tab coming forward, its listeners):

| Piece | Time in the task | What it is |
|---|---|---|
| **Layout read** (the scroll place written) | **6–30 ms** (trace: style 11–16 ms on 460 elements + layout 4–6 ms) | `S.root.scrollTop = …` at the end of `paintProject` makes the browser lay out the whole window then and there: the Desk just built and everything the switch changed |
| Find in this project's first read | 0.5–18 ms | `ProjFind.box` starts reading the index: the project's spec (1,069 names) sent to the store thread, inside the paint |
| String work: the Desk's "same as before?" signature | 1.6–6.5 ms | `deskSigOf`: one line per item (name, time, picture, presence), after the paint |
| Building the DOM | 2–4 ms | head, chips, shelves, the 15 chat rows, the closed shelves |
| Sorting and grouping | 0.4 ms closed, 1.5–1.8 ms open | only the files shelf, and only when it's open: 1,069 sorted by time, 60 grouped by kind |
| Pictures | ≈ 0 | the cover decodes off the thread; row pictures load lazily |
| Others' work in the same task | ≈ 5 ms | usage.js's MutationObserver on the new buttons, the tab's own listeners |

So the Desk itself was cheap to build. The cost was the forced layout and the index read riding along in its task.

## What changed
1. **The scroll place in the coming frame** (`desk-paint-core.js`, `desk-paint.js`, new; 2 marked lines in
   `projects-home.js`). `DeskPaint.place(S, y)` replaces the `scrollTop` write:
   - The Desk already at y (S.top, kept by its scroll events since round 86): nothing is written. A write only caused a
     layout; it moved nothing. This is most switches (both Desks at the top).
   - Another place: S.top says y at once (so `keepDesk` keeps it if you leave before the frame), and the write happens
     in the next frame, just before that frame lays out the window anyway. One layout, not two, and the first frame
     drawn shows the Desk at y. A newer place or a scroll by the person meanwhile wins.
   - A hidden window (no frames): the write comes after 100 ms instead.
   - When the Desk puts the caret back in one of its fields, the write happens at once, as before. Putting the caret
     back lays out the window anyway, and where the browser keeps a caret in view depends on the layout it has then
     (the check caught a 53 px difference here).
   - The cards (‹ Projects) get their place the same way.
2. **Find in this project starts reading after the Desk has painted** (`projfind.js`, 1 line): the Desk's own index
   read waits for an idle moment (at most 200 ms). Typing a query doesn't wait for it (queries were never tied to it).
3. **Export… prepares in slices** (`prepslice-core.js`, new; `projbundle.js`; `projbundle-core.js`):
   - The copy: `copier()` takes the body apart where JSON would and copies the rest with JSON itself under the same
     key, in steps of ≤ 8 ms. The copy is JSON's to the last key (NaN, -0, undefined, dates, a `toJSON(key)`, holes,
     `__proto__`, a BigInt or a loop failing the same way). It is tested against `JSON.parse(JSON.stringify())`.
   - What's left out: `ProjBundleCore.shape()`, the very code `prepare()` ran (now split out of it, unchanged).
   - The secrets scrub: `scrubber()`, the same walk as `ProjBundleCore.scrub` as a loop that can stop and go on, with
     ProjBundleCore's own patterns. It drops the same keys, replaces the same strings, keeps the same depth rule and
     gives the same count.
   - Closing the card while it gets ready writes nothing.

Not done, and why:
- **Virtualising lists:** the Desk's lists are already short (the files shelf draws 60 rows at a time and past that its
  rows skip layout off screen, round 74; Clink has 15 chat rows). Building them was 2–4 ms.
- **Caching sorted and grouped results:** they cost under 2 ms, and only with the files shelf open.
- **`content-visibility: auto` on the sections:** a fresh Desk's sections below the screen would take a guessed height,
  so a kept scroll place would land somewhere else. That breaks "the same place".
- **The signature (`deskSigOf`, 2–6 ms):** it must describe the Desk as drawn. Taking it later could mark a newer state
  as drawn and keep an old Desk on screen.

## Measured before → after
Same check on both sides. "Before" is this round's starting commit, run with `node dev/smoke.js --app <a copy of it>`
(3 runs); "after" is this branch (5 passing runs). The box is a shared 4-CPU machine with software GL. The times are
each task's wall time, long or not.

| Step | Before | After |
|---|---|---|
| **Clink's Desk on a switch** (9 per side) | 25–63 ms; 4 of 9 over 50 | **6–29 ms** (one 55 ms task with 16 ms of its own CPU: the box, "can't tell") |
| Clink's Desk, first open in the session | 37–66 ms | **22–32 ms** |
| Clink's Desk with its files shelf open, scrolled | 28–55 ms | **7–24 ms** |
| The frame after the Desk (now does the Desk's layout) | 8–18 ms | 8–21 ms |
| Ember Tide 1 / Glass Tide 2's Desk | 10–50 ms | 4–22 ms |
| **Export… click** (prepare + send) | **70 ms** (59 ms CPU) | **10–14 ms** (4 ms CPU) |
| Export… prepare, its pieces | one piece of 35–50 ms | 5–7 pieces, the longest 8–14 ms (32–55 ms in all) |

In `projopen86` (this branch): export / import card / duplicate as before; its own switch numbers still show long
tasks from the scene's first run and the chat's first draw (below).

## What's left
- **Switching projects** still has other tasks over 50 ms now and then: the scene's own start in the Lab (its history
  and preview, `tools/three-history.js`, `three-media.js` `checkOnScreen`: labfps89's) and the chat's first draw of a long
  chat (`chat-rest.js` tick: a style recalc of 30–40 ms). Neither is the Desk.
- The Desk's signature (2–6 ms) and the tab's own listeners stay in the Desk's task (≈ 10–20 ms in all with the build).

## Safety
- No store read failure is taken as empty: nothing here reads a store. The export reads what it read before.
- Nothing is uploaded or deleted, and nothing new is written: the export writes the same file.
- **Secrets never go into bundles:** the sliced scrub is ProjBundleCore's own rule, run as a loop. The unit test
  compares it with `ProjBundleCore.scrub` / `prepare` on bodies full of every kind of key it knows: Anthropic, OpenAI,
  GitHub, Slack, Google, AWS, Meshy and JWT. It also covers every secret-named key holding a string, an object, a
  number, an array or null, values past 60 levels, holes, a `__proto__` key and 400 random bodies, stepped one node at a
  time too. The app check plants a made-up key in a copy of Clink's body and finds it gone.

## Tested
- `dev/desk89-test.js` (UNIT, 100 checks):
  - The placer: a place already shown writes nothing; another is written once, in the frame (or after the wait); a newer
    place or a scroll wins; the caret case writes at once.
  - The copy = `JSON.parse(JSON.stringify())` on odd values and 300 random bodies.
  - The scrub = `ProjBundleCore.scrub`.
  - `PrepSlice.prepare` = `ProjBundleCore.prepare` for every choice and on a Clink-sized body (4.4 MB), whose slices
    stay ≤ 20 ms (load-aware).
- App, under `flock /tmp/hearth-run.lock`, at most 5 per run: desk89 ✓ (5 runs), projopen86 ✓, projects ✓,
  projbundle ✓, lazy ✓, projbig85 (`PROJBIG85=1`) ✓, projects72 (`BIGPROFILE70=1`) ✓, project-continuity ✓,
  projects-lightweight ✓, project-desk ✓.
- **projsearch81** (`BIGPROFILE70=1`) fails at "a code row: something else is under the mouse (the node was redrawn)".
  It fails the same way on this round's starting commit (`dev/smoke.js --app <a copy of it>`, with `HEARTH_LOOPLAG=1`
  as run-checks gives it), and with this round's `projfind.js` line taken out. So it was already broken here and is
  not caused by this round. Left for its owner: the results list is drawn again between finding the code row and
  clicking it.
- Unit: desk89-test, projopen86-test, projbundle-test, projbig85-test, projects-test, datasafe-scan, winmac-test,
  errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan, boot-test (first screen unchanged: 68 scripts, 1741 /
  1751 KB), lazymanifest-test: **13 / 13 pass**.

## Files
- **New:** `desk-paint-core.js`, `desk-paint.js` (group `projects`, before `projects-home.js`), `prepslice-core.js`
  (group `projbundle`), `dev/desk89-test.js`, `dev/checks/desk89.js`, this file.
- **Changed:** `projects-home.js` (2 marked lines, Codex's), `projfind.js` (1 line), `projbundle.js` (the prepare
  call), `projbundle-core.js` (`shape()` split out of `prepare()`; `SECRET_KEY`, `SECRET_STR`, `isObj` exported),
  `lazy-data.js` (the new files), `dev/trace-stats.js` (`marked`), `dev/run-checks.js` (UNIT, group).
- `node dev/lazy-manifest.js` was run: nothing to change (the new files register nothing).

## For Codex
`projects-home.js`, two lines marked `(round 89, desk89)`:
- **`paintProject`**: `S.top=S.root.scrollTop=state.scroll||0` became
  `DeskPaint.place(S, state.scroll||0, { now: Boolean(state.focus) })`, falling back to the old line if DeskPaint isn't
  loaded. Why: writing `scrollTop` lays out the whole window inside the task that built the Desk, which was 15–30 ms of
  Clink's 50–70 ms task. `place` writes nothing when the Desk is already there, else writes in the coming frame (S.top
  says the place at once), or at once when the caret goes back in a field.
- **`show(null)`**: the cards' `S.top=S.root.scrollTop=0` goes through `DeskPaint.place(S, 0)` too, for the same reason.

If you write `S.root.scrollTop` elsewhere, use `DeskPaint.place(S, y)` (or `{ now: true }` when a caret is put back
right after). If you need the element's own `scrollTop` right after a paint, call `DeskPaint.flush()` first.

## For the patch notes
- **Switching to a big project is smoother.** Arriving on Clink's Desk (over a thousand things) used to freeze the window
  for 50–70 ms. That was most of the hitch left when you switched projects. It is now 6–30 ms. The Desk looks and
  behaves exactly as before: same rows, same order, same open shelves, and it comes back scrolled where you left it from
  its very first frame.
- **Export… no longer stutters** when you click it on a project with long chats. Getting the file ready now happens in
  small pieces instead of one 70 ms freeze. The file is the same, and passwords, API keys and sign-ins are still taken
  out exactly as strictly as before.
