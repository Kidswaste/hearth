# projopen86: project handling that feels instant (round 86)

Round 85 left three costs around projects. Opening a project right after an import or ⧉ Duplicate, and the Lab's first
start, were 50–150 ms window tasks. The export card mapped files from the other computer one by one. A giant chat was
parsed twice for a copy. This round measures those, plus **switching projects with the name ▾** and **the first
project opened after a restart**, and splits or removes the biggest pieces. What you get is unchanged: the same scene,
chat, Desk, card and file. The check compares the imported and duplicated project with the original.

## The check and its fixture
- **Fixture:** `node dev/projopen86-fixture.js /tmp/hearth-projopen86`. It is made up with a fixed seed and is never
  real data. `run-checks.js` makes it on first use. It is bigprofile's small profile with 10 projects, 3 of them
  active. **Clink** has a big scene (6 drawing layers of ≈ 450 lines each, 109 K characters) and a long chat (1,600
  messages with code blocks and tables). It holds 1,069 things, including 300 files written the Windows way
  (`C:\Users\me\AppData\Roaming\Hearth\data\…`), half of them present here.
- **App check:** `dev/checks/projopen86.js`, in run-checks with `HEARTH_LOOPLAG=prof` and in group `projopen86`.
  - It first starts the Lab backstage (**lab_first**), opens Clink once and restarts Hearth (`//@@ reload`).
  - Then it measures the start (**restart**) and the first project opened (**cold**, the Clink card), then 3 rounds of
    name ▾ switches between the 3 projects (**switch**).
  - Then ⇪ Export (**export_card**, **export**), ⇩ Import (**import_card**, **import**), opening the imported project
    (**open_import**), ⧉ Duplicate (**duplicate**) and opening the copy (**open_dup**).
  - Each step reports the time until the project says ready, the time until its chat shows messages, the window's long
    tasks, long animation frames and the main process's busy stretches.
  - `window.PO_PROF = 1` adds each long task's heaviest functions from a CPU profile. `window.PO_REPORT = 1` reports
    without failing.
- **Unit:** `dev/projopen86-test.js` (24 checks) tests the same answers as before. Details are under "Tested".

## Measured before → after
These numbers come from the same check on both sides. "Before" is this round's starting commit, run with
`node dev/smoke.js --app <a copy of it>`. The box is a shared 4-CPU machine running software GL, so a task varies by
±10–20 ms between runs. The table shows each step's longest window task. "Before" covers 3 runs and "after" covers 2:
the final pair run and the run-checks run.

| Step | Before: longest window task | After |
|---|---|---|
| The Lab's first start (backstage) | one task of 91–129 ms | **61–73 ms** (now 2–4 pieces of 60–73 ms) |
| Hearth's start, until the first click (the Lab mounts behind) | 99–121 ms | 52–54 ms |
| First project after the restart (Clink card) | 64–71 ms in 2 of 3 runs | none ≥ 50 ms |
| **Switching** with the name ▾ (9 switches per run) | 4–8 of 9 switches had a task > 50 ms, up to 64–82 ms | 1–3 of 9, up to 62 ms |
| ⇪ Export card: the main process | 112–130 ms busy (one 33–78 ms block in `hereAsync`) | max 19–26 ms, no block |
| Export… (the window prepares the body) | 0–82 ms | 0–69 ms (unchanged: see "What's left") |
| **⇩ Import as a new project** | 102–147 ms | **none ≥ 50 ms** |
| Opening the imported project | 51–62 ms | 0–57 ms |
| **⧉ Duplicate project** | 134–155 ms | **none ≥ 50 ms** |
| Opening the copy | 55–78 ms | none ≥ 50 ms |

The time until usable is mostly unchanged. The project says ready after 1.5–4.6 s, before and after. Almost all of
that is the scene's own first frames and shader warm-up in software GL. projects72 measures this as "the scene's
part", and on the owner's GPU it is a few frames. The project's **chat now shows sooner while switching: 78–123 ms
after the click instead of 120–223 ms**, because it no longer waits behind the scene's start in the same task.

## What changed
### Switching and opening a project (`project-workspace.js`, Codex's, 4 marked lines)
1. `painted()` waits for one painted frame (at most 50 ms when the window is hidden). Opening a project now awaits it
   at four places:
   - after the loading card is shown, before the project being left is saved;
   - after the chat is selected, which makes its scene switch, before the Lab is brought forward;
   - before the chat is drawn, so the chat comes after the scene's start;
   - after the tab (the Desk) is drawn, before the card goes.

   Each piece is now its own window task instead of one 80–150 ms task. The order of the work and what it does are
   unchanged. A switch cancelled meanwhile stops at the next check, as before.
2. **The chat is drawn after first paint** at this call site only (`Native.refresh` after `painted()`). How messages
   are held and drawn wasn't touched (that's chatwindow86's).

### The scene switch itself
3. `chat-scenes.js` `snapNow`: a project opening is checked first. It already took no "before" picture while the
   loading card covers the Lab, but it measured the preview first. That was a forced layout of the window (12–16 ms
   with a long chat drawn) for nothing. The result is the same.
4. `tools/three-media.js` `sizeId`: the frame size's id without the preview's size. `openSketch` stored
   `stage.size.id`, which read `clientWidth` / `clientHeight`. That laid out the window inside every scene switch
   (12–40 ms).
5. `tools/three.js` `renderNotes({ soon })` → `setNotes(…, { soon })`: the timeline's note pins are drawn in the
   coming frame on a scene switch, as `setTracks` already does for the tracks. Drawing them at once styled and laid
   out the Lab inside the switch.

### The Lab's first start (`tools/three.js`)
6. After the Lab's stores are read, the toolbar and lists are built. Then comes one painted frame. Then each layer's
   sliders are read (`ThreeTweaks.scan`, kept by code) **one layer per task**. Then the scene is opened. The run finds
   every layer already read. This used to be one 100–350 ms task (6 × 450-line layers scanned, then the run). If
   something opens a scene in that frame (a project opening asks for its own), that scene stays, and it is the one
   that would have been shown anyway.

### Import and Duplicate: scenes added in slices
7. `projbundle.js` `apply`: after the body is copied, and after each scene is added, the import waits one task
   (`nextTask`).
8. `tools/three.js` `adoptScene`: the Lab's scene picker is drawn once after the scenes are added (`pickerSoon`). It
   used to be drawn once per scene, ≈ 15–20 ms each.
9. `projects.js` `sketchGroups` (Codex's, 1 marked line): a project's item ids are put in a set once. `C.has` per
   scene scanned all of a project's items. For a project of 1,069 things and 55 scenes, that was ≈ 15 ms on **every**
   picker draw: each scene shown and each scene an import adds.

### The Desk (`projects-home.js`, Codex's, 4 marked lines)
10. Leaving the Desk keeps its place from its scroll events (`S.top`) instead of reading `scrollTop` while the window
    has just changed. That read laid out the whole window (30–50 ms) in the switch's first task. A place set by the
    Desk itself is kept too. A place that gets clamped comes back through its scroll event.

### The export card's sizes (main process)
11. `reachmain.localizeMany(paths, o)` maps many paths in one call. The disk is asked without blocking (64 paths at a
    time). The sync context and folder map are read once. The mapping runs in slices of ≤ 4 ms with the main loop free
    between them. The answers are the same as `localize()` for each path, in order (tested on every form).
12. `projbundlemain.sizes()` now finds every path in one batch (`hereMany`). Each path is first looked up as it is,
    then the missing ones are mapped in one `localizeMany` call and looked up again. The answers are round 85's. With
    740 such files the main process held ≈ 35–78 ms. Now it holds no block (max 16–26 ms, the lag probe's own work
    included). Round 85's `hereAsync` is gone.

### A giant chat parsed once fewer (Duplicate)
13. `projbundle-work.js` `chatInfo({ lite })`: a copy (Duplicate project, `gather(p, { files: false })`) needs only a
    big chat's own fields and count, not its paths. They are now **cut from the file's bytes** (bigchat-core `scanBuf`
    + `headOf`, ≈ 15 ms per 60 MB of native search) instead of parsing the whole chat (≈ 0.7 s of that thread). The
    store thread still parses it once to write the copy, as before.
    - The head and count are identical to the parse's, keys in order. A chat that can't be cut is parsed as before.
    - One that isn't a chat, or is cut short, is "unreadable": the copy stops and nothing is written. It is never
      taken as "no chat".
14. **Export:** the card's parse already serves the export when it follows within the thread's minute (round 85's
    cache on the worker, unchanged). So an export parses a giant chat once.

## Safety
- No store read failure is taken as empty. `chatInfo` lite returns "unreadable" for a file it can't cut or parse,
  exactly as the parse did. `sizes()` / `localizeMany` only look files up.
- Nothing is uploaded, nothing is deleted, and nothing is written that wasn't before.
- No Windows-only call was added. `localizeMany` maps Windows-form paths on any computer, as `localize` does.

## Tested
- `dev/projopen86-test.js` (UNIT, 24 checks):
  - `localizeMany` = `localize` for each of 70 paths: this computer's, missing ones, the other computer's Windows / Mac
    data paths, file URLs, a folder matched by hand, home folders, relative and empty / odd input. It also maps 6,000
    paths in order with the loop running between slices.
  - `sizes()` = round 85's way, kept in the test as the reference (files, walked folders, `.env` left out, secret
    files, missing and mapped ones).
  - `chatInfo` lite = the parse for the head (key order too) and the count, on pretty, compact and BOM files.
    "Unreadable" for a non-chat or a cut file. Small and missing as before. A parse kept from the card is used as
    before.
- App, under `flock /tmp/hearth-run.lock`: projopen86, projects, projbundle, labboot, lazy, sync72 and projbig85
  (`PROJBIG85=1`): **7 / 7 pass**.
- Unit: projopen86-test, projbundle-test, projbig85-test, projects-test, datasafe-scan, winmac-test,
  errorcalm-scan, storeack-scan, chatsafe-scan, boot-test (first screen unchanged: 71 scripts, 1805 KB), sync-test,
  firstrun-test: all pass.

## Files
- **New:** `dev/projopen86-fixture.js`, `dev/checks/projopen86.js`, `dev/projopen86-test.js`, this file.
- **Changed (marked `(round 86, projopen86)`):** `reachmain.js` (localizeMany), `projbundlemain.js` (hereMany, sizes,
  chatsInfo lite), `projbundle-work.js` (chatInfo lite, readBytes), `projbundle.js` (lite for a copy, nextTask in
  apply), `tools/three.js` (first start in pieces, pickerSoon, renderNotes soon, sizeId), `tools/three-media.js`
  (sizeId, setNotes soon), `chat-scenes.js` (snapNow's order), `dev/run-checks.js` (UNIT, group, fixture, lag env).
- No lazy group gained a file, so `node dev/lazy-manifest.js` wasn't needed.

## For Codex
Three of your files changed, each by a few marked lines (`(round 86, projopen86)`):
- **`project-workspace.js`**: a `painted()` helper (one painted frame, at most 50 ms) and four `await painted()` in
  `open()`. They come after `loading()`, after `Native.selectChat` / `await desk`, before `Native.refresh`, and after
  `go(tab)`. Nothing else in the opening changed. If you add work to `open()`, putting a heavy piece after one of these
  keeps it in its own task.
- **`projects.js`** `sketchGroups`: a `Set` of the project's item ids instead of `C.has` per scene (same groups).
- **`projects-home.js`** `keepDesk`: `state.scroll` comes from `S.top`, kept by a passive scroll listener on `S.root`.
  The two places that set `S.root.scrollTop` set `S.top` too.

## What's left
- **Clink's Desk**: arriving on the Desk of a project of 1,069 things is one 50–70 ms task (`projects-home.js`
  `paintProject`: its rows and shelves built at once), and the Desk's first draw after a restart is the same. This is
  the rest of the switching tasks over 50 ms. A fix is to build the shelves below the first screen in slices, as the
  Projects cards already are (`CHUNK`). That is Codex's file, so it is left.
- **Export…** (the window's `prepare`: a JSON copy of the body, then the secrets scrub) is 50–80 ms for a project whose
  chats are under 8 MB (Clink's 1,600-message chat). `gather` already copied each part, so the second copy could go,
  or the scrub could run in slices.
- **The scene's first run** in a switch (its sliders panel for the selected layer, ≈ 15–25 ms) and **the chat's first
  draw** (`native.js` `planOf` / `restBit` for a long chat, ≈ 20–35 ms) are each under 50 ms now but still the biggest
  pieces. The chat part is chatwindow86's.
- **Time until usable** is the scene's own start in software GL (1.3–4 s here), which is projects72's "scene part". On
  the owner's GPU it is a few frames. Nothing in Hearth's part waits on it any more except the "ready" mark.
- **A giant chat on export**: if the export card stays open for more than a minute, the card's parse is let go with its
  thread, and the export parses again (off the window and the main process). Keeping it longer would hold ≈ 200 MB on
  that thread while a card is open, so it was left as is.

## For the patch notes
- **Switching projects** with the name ▾ is smoother. The loading card appears at once, and the project's chat shows
  about twice as fast (in about a tenth of a second) while its scene is still starting.
- **Importing a project file** and **⧉ Duplicate project** no longer make Hearth stutter for a moment while they add
  the project's scenes.
- **The Lab's first start** and **Hearth's start** are smoother: the Lab now gets ready in several small steps instead
  of one long one.
- The export window's sizes for projects with many files from your other computer are now worked out without pausing
  the app.
- Duplicating a project that holds a very long chat does less work in the background.
- Nothing changes in what you get: the same scenes, chats, Desk and project files.
