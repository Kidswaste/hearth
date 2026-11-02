# checksgc104: GC-only tasks judged, a task's own CPU, export without loading whole, the reader's long text, typing load-aware (round 104)

Round 103 left four items open (`docs/upgrades/cw103.md`, "What's left"):
1. major garbage collections of 55–90 ms that no check judged;
2. trace-stats matching a long task to the wrong events;
3. a 44–100 ms layout task in chatwindow86's panels step;
4. chatwindow72's "slowest key ≤ 120 ms" judged on wall time.

This round fixes each one. Every number below is from this box: 4 CPUs, SwiftShader under Xvfb, shared with other
streams. Its load swung from 1 to 5 during the round, and a `du` over /tmp held the disk for part of it. App runs were
under `flock /tmp/hearth-run.lock`, on bigchat84's fixture (`/tmp/hearth-bigchat84`: 6,000 messages, 63 MB, made up).
**Before** is HEAD 258aff7 (`git archive` into a temp folder, run with `dev/smoke.js --app`). **After** is this branch.

## How it was measured
- **Per step, with the window's GC phases.** `chatwindow86` traced each step with the timeline and V8's GC categories
  (`window.CW86_TRACECATS`) and saved the traces (`window.CW86_DUMP`). Each top-level task was then split into its
  children (layout with its objects and the JS line that forced it, GC phases).
- **V8's own account of each GC.** One run used `--js-flags=--trace-gc-nvp` with the renderer's output captured. That
  gives each GC's pause, its phases and the heap before and after. The capture was a temporary hook in smoke.js,
  taken out again.
- **GCs after the app's own whole-chat work.** `dev/checks/gc104-measure.js` is a measurement, not a check (opt-in
  `GC104`). It opens the giant chat and runs three stretches: `/export json`, `Native.loadWhole` then back to its
  window, and a quiet one. Each is followed by 20 s of scrolling, under the check's light trace. It reports the GC-only
  tasks (wall / own CPU) and the heap's peak.

## 1. Major GCs that nothing judged
### Cause
- **The check couldn't see them.** The window's `PerformanceObserver('longtask')` never reports a task that is only a
  garbage collection. `trace-stats.js longTasks` judged only the tasks the observer reported, and smoke.js's light
  trace (`toplevel`, the page's marks) had no GC events to recognise one.
- **Where the GC came from.** The biggest one, in V8's own figures: a pause of 87 ms with the heap going from 153 MB to
  48 MB (90 MB of objects). Its phases were:
  - evacuation 19 ms;
  - Blink's heap epilogue 20 ms;
  - ≈ 40 ms not given to any phase. In the trace this is `V8.GC_HEAP_EPILOGUE_SAFEPOINT`, 38 ms with no children:
    releasing the pages of 100 MB that had just died.

  The 90 MB was a whole copy of the giant chat, made in two places:
  - **the app's `/export`**, which loaded the windowed chat whole before writing it;
  - **the check's own comparisons** (panels: "Made here" / @file against the chat loaded whole). The check let go of
    this copy and went on without collecting it, so its GC landed in a later measured step (react, edit).
### Fix
- **Visible.** smoke.js's light trace now also asks for `disabled-by-default-v8.gc`. Those events come only while a
  GC runs, so the trace stays light.
- **Judged.** `longTasks` marks a task that is mostly GC (`gc: true`): MajorGC, MinorGC, V8.GC_*, BlinkGC.*, CppGC.*,
  by the outermost GC events' wall time. With an observed list, it adds the GC-only tasks the observer didn't report
  (`unobserved: true`) and judges them like the others: over on its own CPU fails, the rest can be the box's. The
  verdict's text says "garbage collection (not reported by the page's long-task observer)".
  chatwindow86, bigchat84 and desk89 all judge through it. No budget changed.
- **Smaller (the app).** `/export` json, md and txt of a windowed giant chat now reads the chat a range at a time
  instead of loading it whole:
  - `ChatWin.ranges(chat)` yields 400 messages at a time. Loaded messages come as they are. The others are read from
    the store thread for that range and not kept;
  - `ChatExport.jsonFrom` / `mdFrom` / `txtFrom` make the same text as `json` / `md` / `txt`, from the same
    per-message pieces;
  - the chat stays windowed, and the file is the same byte for byte (the check compares SHA-256);
  - a range that can't be read, or comes back short, throws. Nothing is written as a whole that isn't one (the save
    stream ends with `false`);
  - the web page (`html`) still loads the chat whole: its replies are rendered as a batch.
- **The check's own comparison copies** are collected right after the check lets them go (`gc()`, as it already did
  after export). A step is then judged on its own work. The panels step itself never loads the chat whole.
### Proof
| | before (HEAD) | after |
|---|---|---|
| chatwindow86, HEAD's check with GC tasks judged (run b2) | **✖ react: a 74.3 ms GC, 70 ms of its own CPU**. Also GC-only tasks of 134.7 ms wall / 30.9 ms CPU (reply3), 43 / 18 (edit), 40 / 19 (find), all unreported until now | — |
| chatwindow86, first run (timeline, run "base") | edit: a GC-only task of **89.6 ms / 81.7 ms CPU**, not judged | — |
| chatwindow86, this branch: largest GC-only task in any step | — | **24.4 / 21.8** (light trace), **31.1 / 23.4** (timeline), 2 runs. Both ✓ |
| export step, window CPU | 1,741 ms, loads whole | **1,398 ms**, stays windowed, same file |
| gc104-measure, export stretch: heap peak · largest GC-only task | 240.9 MB · 40 / 16.5 ms | **159.7 MB · 19.5 / 12.2 ms** |
| gc104-measure, loadWhole stretch (unchanged path) | 138 MB · 24.1 / 9.7 | 131 MB · 36.7 / 10.9 |

The 55–90 ms GC doesn't come every run: HEAD's light run b1 had none. Two of HEAD's three runs had one, and none of
this branch's runs did. `Native.loadWhole` itself is unchanged: it is used by branch, stats, a second opinion and the
summary. In gc104-measure its garbage went in GCs of ≤ 11 ms CPU, but the check's comparisons show that letting go of
a whole copy can still cost one large GC. bigchat84's restore step (Earlier versions) now shows such a task:
"restore: a 70 ms garbage collection: 49.3 ms CPU", can't tell, under its 60 ms budget. Before this round it wasn't
seen at all.

## 2. trace-stats matched a task to the wrong events
### Cause
`longTasks` took an observed task's CPU from the outermost events **wholly inside** its span ± 1 ms. Round 102 added
"or, when there are none, the events overlapping it". The observer's span is rounded to whole ms and read on another
clock, so a task's own event can stick out of the window by a ms or two. The tiny tasks just before it are still
inside. They were taken as the task: cw103's 72 ms task judged on 0.3 ms of CPU.
### Fix
A task's events are now the outermost events with **at least half of their time inside its span**: all of each one's
CPU, never less than the task's own. Together they must cover ≥ 80 % of the span (as round 102 asked of its overlap).
Otherwise the task stays unknown, and the check judges its wall time. `cover: 0` is for a span that isn't one task
(chatwindow72's key → frame, below).
### Proof
`dev/tracestats104-test.js` (unit, 13 checks) on a **recorded** trace, `dev/fixtures/trace-gc104.json`. It holds the
window's main thread from chatwindow86's edit step on HEAD, cut to 145 ms: the light trace's categories, the step's
mark, and an 89.6 ms GC-only task (81.7 ms CPU) right after a run of tiny tasks. The test shows:
- with cw103's kind of span (it starts on the tiny task before and ends 2.7 ms before the GC's end), round 102's match
  reads **0.2 ms** of CPU, and the new one reads **81.7 ms**, over a 60 ms budget;
- the same 3 ms early: still the task's own;
- the GC-only task is found from the trace alone, added when the observer saw nothing, and not added twice when it did;
- a span its events cover only 70 % of stays unknown;
- load vs over against the thread's wait for a CPU.

The observer's actual record from cw103's run is gone, so the span in the test is the one that run describes, laid on
a real trace.

## 3. The panels step's layout task
### Cause
The traces placed it in **chatsafe's reader** (a chat whose AI is missing opens there; the step opens it and presses
"Show earlier"). Its first frame laid out the giant chat's last reply, shown up to 40,000 characters in one
`pre-wrap` text block. Only its end was in view:
- one frame, `Layout` **99.5 ms** (53 objects), 95.9 ms of the task's CPU;
- then `toEnd`'s scroll forced it again (190 ms wall).

HEAD's second traced run: `Layout` 82.3 ms in a 90.8 / 52.7 ms task.
### Fix
`chatsafe.js textEl`: a text over 4,000 characters is put in parts of ≈ 2,000 characters.
- Each part is cut right after a line break. A part ending in its line break draws exactly as the text did there, and
  a text with no line break to cut at stays whole.
- Each part has `content-visibility: auto` and a guessed height (`chatsafe.css .chatsafe-part`), so only the parts
  near the view are laid out.

Same text, same lines.
### Proof
Panels step, costliest window task (wall / CPU):
- before: **122.1 / 95.9** (run "base"), 90.8 / 52.7 (b2);
- after: **32.6 / 29.2**. What's left is the dialog's first style recalc, 534 elements.

The reader's page and "Show earlier" checks pass: rows, more rows after "Show earlier".

## 4. chatwindow72's slowest key on wall time
### Cause
"Slowest key ≤ 120 ms" was the wall time from `Input.insertText` to the next frame. On a busy box most of that is
waiting for a CPU. It failed once at 123 ms, when it was 65–71 ms alone.
### Fix (the check)
Done as checks102 did it:
- **The trace.** The 40 keys run under smoke.js's light trace. Each key's span (key → frame) is an observed span
  (`cover: 0`), so `longTasks` gives the window thread's own CPU in it and the thread's wait for a CPU over the
  stretch (Linux schedstat, as `dev/loadwait.js` reads it).
- **The probe.** labstartfast's probe (integers, small objects, a layout, memory reads) runs in its own task three
  times before the keys, and once right after any key over the budget.
- **The verdict.** A key over 120 ms fails if its own CPU is over 120 ms. Otherwise it is "can't tell"
  (`out.cantTell`) when the trace says the rest was waiting for a CPU, or when the probe right then ran that much
  slower (up to 2×). Otherwise it fails.
- **The report.** The worst key is reported once, with how many were over. The budget is still 120 ms.
### Proof
| run | slowest key | verdict |
|---|---|---|
| this branch, normal (2 runs) | 115 ms; ✓ in the final run | ✓ |
| this branch, under `--burn 6` | 166 ms, **5.1 ms** of its own CPU, 161 ms waiting (thread waited 324 ms) | ✓ can't tell (HEAD's check: ✖) |
| with a deliberately slow `input` handler (150 ms busy loop in native.js, **not committed**, `git checkout` after) | 159–187 ms, **140–157 ms** of its own CPU, probe up to 2× | **✖ "slowest key too slow"** |

## Tested
- App checks:
  - `chatwindow86` (`CHATWINDOW86=1`) twice: ✓ 120 s, ✓ 120 s. The first had one
    can't-tell line: open, 62 ms, 38.4 ms CPU;
  - `chatwindow72` twice: ✓ 191 s, and ✓ under `--burn 6` (can't tell, above);
  - `bigchat84` (`BIGCHAT84=1`) ✓ 96 s (can't tell: the restore GC, above);
  - `chatkeep` ✓ 241 s, `versions75` ✓ 49 s, `lazy` ✓ 111 s.
- Unit: tracestats104-test (new), chatwindow86-test, chatcalc87-test, bigchat84-test (+ export by ranges of 1 / 7 /
  400 = the whole-chat file for json, md, txt, and a short read throws), store-thread-test, datasafe-scan,
  winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan (chatwin.js 16 lines reading `.messages`,
  audited), boot-test, lazymanifest-test.
- First screen: 1,689 / 1,696 KB, unchanged. Nothing on the first screen changed: chat-cmds, chatwin, chatsafe and
  chatexport-core are lazy.
- Traces, the HEAD archive and the temp folders under `/tmp/gc104` were deleted afterwards. `/tmp/hearth-bigchat84`
  is the shared fixture: left in place.

## Safety
- A store read failure is never "empty": `ChatWin.ranges` throws on a read that fails or comes back short, and the
  export then ends its stream with `false`. The count of messages must equal the chat's, or it throws.
- Nothing is deleted, nothing is uploaded, no real data was used: the fixture is bigchat84's made-up chat in a smoke
  copy.

## Files
- `dev/trace-stats.js`: the observed match by a task's own events; GC-only tasks found, added, judged; `cover`.
- `dev/smoke.js`: the light trace with `disabled-by-default-v8.gc`.
- `dev/tracestats104-test.js` and `dev/fixtures/trace-gc104.json` (new). Registered in `dev/run-checks.js`, with a
  `checksgc104` group.
- `chatwin.js`: `readRange` (fetchInto's read, apart) and `ranges`.
- `chatexport-core.js`: `jsonFrom`, `mdFrom`, `txtFrom`; `pump` takes async pieces.
- `chat-cmds.js`: /export of a windowed chat by ranges (html still whole).
- `chatsafe.js` / `chatsafe.css`: the reader's long text in parts.
- `dev/checks/chatwindow86.js`: export must stay windowed; the check's own whole copies collected before the next
  step.
- `dev/checks/chatwindow72.js`: typing load-aware.
- `dev/checks/gc104-measure.js` (new, opt-in `GC104`).
- `dev/chatwin-scan.js` (16).
- `dev/bigchat84-test.js`.

## For Codex
No Codex-owned file changed, and none needs a change.

## For the patch notes
- **Exporting a very long chat no longer loads it all into memory.** Hearth reads it in pieces as it writes the file.
  The file is the same, and the app no longer pauses for a moment afterwards while it frees the memory.
- **Reading a chat whose AI is missing opens without a stall**, even when its last reply is very long.
- Behind the scenes, Hearth's own speed checks now also catch the pauses memory clean-up causes, and tell a slow
  computer from a slow app when they time your typing.
