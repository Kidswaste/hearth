# checkfix90: two unreliable checks, two causes (round 90)

Two checks failed now and then. Each one was looked into before anything was changed.

- **projsearch81** had a real app bug behind it, in fact two. A chat opened from the Desk rewrote the Lab's whole
  scenes file for no reason. Find in this project then drew the same results twice, and the second drawing took the
  row under the mouse.
- **qa-keys** had a check bug. One Lab key was judged by counting changes on the page, and a busy computer adds its own.

All app runs were under `flock /tmp/hearth-run.lock`, with temp folders in this run's own scratch folder
(`TMPDIR=/tmp/cf90`). The Electron socket path has to stay short. With the long session scratch path, the app window
never came up. "Under load" means `node burn.js N` beside the check: N worker threads, each spinning the CPU and
allocating, the method checkfix88 used.

## 1. projsearch81: "a code row: … the node was redrawn"

### What redraws the node (shown step by step)
The check was copied, and the copy was set to log every `replaceChildren` of Find's results list (time, words in the
box, stack, the index's last catch-up). It also logged each Lab scene's `updatedAt` and the scenes file's mtime.

1. The check clicks a Messages row ("portal"). The chat `claude-long1` opens, and it has its own scene (`sk11`). The
   Lab switches from `sk0` to `sk11` through `ThreeLab.scenes.open()`.
2. `scenes.open()` called `persist()` on the scene it left, **whether or not anything changed**. `sk0` was stamped
   `updatedAt = now` (logged: `sk0 1793070594567 → 1793354418789`), and all 50 scenes were written again. The
   scenes file's mtime moved about 1.1 s after the click.
3. Back on the Desk, the check types "tint". The query sees that the scenes file changed and starts reading it again.
   That read goes over the query's 20 ms budget, so the reply has `left > 0`. `paint()` draws the rows with
   "Still reading this project…".
4. The background catch-up ends a moment later (logged: `why: "query", calls: 1, built: 0`, because no scene's words
   had changed) and `query()` runs again. Now `building` is false. `building` was part of the paint signature, so
   **the same rows were drawn again** (logged: two paints of "tint", 3 ms apart, the code row found between them).
5. The check had already picked the code row. Its node was gone, its box measured 0,0, and the click missed.

**For a real user**, the same two-step drawing replaced the row under the mouse while the person moved to click it, and
it reset the row chosen with the arrow keys (`S.sel = -1`). Each such chat open also rewrote the whole scenes file
(MBs on a big profile) and sent it to the other computer with sync. That scene also jumped to the top of "recent" with
no edit.

### When it started
- The unconditional `persist()` dates from round 73 (`fbfa1e4f`). Round 72 had already fixed the same thing in
  `close()`: "only what changed: an untouched scene isn't stamped".
- The "still reading" repaint dates from round 81 (`46035f4`).
- The two only meet when the "tint" query lands while the rewritten file is still being read. That is timing:

| tree | sk0 stamped on the chat open | redraw before the click | result |
|---|---|---|---|
| dfc7870 (before projopen86) | yes, 2/2 | no, 2/2 | pass |
| 7fb298b (projopen86 merged) | yes, 2/2 | 1/2, after the row was found → no miss | pass |
| eaa49bc (round 87) | yes, 2/2 | yes | fail 2/2 (code row, then a Boards row) |
| 8b50d03 (base of this round) | yes | yes | fail 3 of 5 |

So it is not desk89's change, and it is older than 8de32ea. projopen86 was the first tree where the redraw showed up,
probably because the Lab is already running when the Desk opens, but that is not proven.

### Fix (app)
- `tools/three.js` `scenes.open()`: the scene left is saved only if its code changed here. That is the same test
  `close()` uses (`sel().code` vs the editor, `current.code` vs layer 0). Unsaved sliders still get their usual toast
  in `openSketch`.
- `projfind.js` `paint()`: once there are rows, "still reading" is part of the status line only. A catch-up that ends
  with the same rows updates that line and leaves the rows as they are. The empty "Nothing yet…" text still changes.
  projfind.js is lazy, not on the first screen.

### Fix (check)
`projsearch81` now records the Lab's scenes before the message click. It fails if opening the chat stamped any of them:
"opening the chat stamped untouched scenes … the whole scenes file rewritten". This catches the cause on every run,
not only when the timing lines up.

### Proof
- With the base `tools/three.js` put back, the new step fails: `sk0`, 1 run.
- Find's fix alone, with the base Lab still stamping `sk0` on every run: 3 of 3 runs had the catch-up
  (`why: "query"`), and none drew the rows again before the click.
- Both fixes: `projsearch81` ✓ 3 of 3 (29–34 s), `lab: { before: "sk0", after: "sk11", stamped: [] }`.
  `unit:projsearch81-test` 49/49.

## 2. qa-keys: `"ok": false` once in the loaded full list

### Reproduced
- Under an 8-thread burn (load 9–11): ✓ 3 of 3.
- Under a 16-thread burn (load ≈ 10): ✖ `dead: ["Lab · ` · Show / hide the console (keys at IFRAME.three-frame)"]`.
  The failed run's own log was not kept, so this is the failure that was reproduced, not proven to be the same one.
  It fits what was reported: alone it passes, under load it fails, and the end of the log is the skipped list and
  `"ok": false`.

### Cause (the check)
A copy of the check logged each press as: judged / state changed / UI changed / DOM writes after the key / DOM writes
in 250 ms of idle.
- `` ` `` toggles `.three-console-wrap` hidden. That is neither in the Lab's state signature nor in the UI signature, so
  the key was judged only by "more than 3× the idle DOM writes".
- The key made 15 writes both times. On a calm box idle is 0, so 15 > 3 passes. Under load, the preview's own writes
  while idle were 6–7 per 250 ms, which put the bar at 18–21, so the key was dead on the first press and on the retry.
- No other real key relied on the count: the other count-only presses are keys the check already lists as doing
  nothing here, or keys whose sheet line is hidden.

**The app was fine**: the console showed and hid every time.

### Fix (check, deterministic)
The Lab's state signature now includes the console's shown state (`.three-console-wrap` hidden). `` ` `` is judged by
what it must change, like the other keys. No budget or wait was changed, and nothing is skipped.

### Proof
Under a 16-thread burn (load 10–10.7): ✓ 2 of 2, `` ` `` judged by state (`state changed: true`, 14–15 writes,
idle 0–3).

## 3. The default list (`node dev/run-checks.js`, no args = `qa`, twice under the lock)

| check | run 1 (load 8.4 at start) | run 2 (load 1.8) |
|---|---|---|
| qa-commands | ✓ 10 s | ✓ 11 s |
| qa-keys | ✓ 162 s | ✓ 160 s |
| qa-mac | ✓ 10 s | ✓ 11 s |
| polish | ✓ 18 s | ✓ 17 s |
| lazy | ✓ 21 s | ✓ 21 s |
| fastboot | ✓ 14 s | ✓ 14 s |

6/6 both times. qa-keys's only "skipped" line is the check's own skipped part (Board · Arrows (Shift = ×10)), as before.

Unit scans: datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan,
lazymanifest-test, boot-test: 8/8 ✓ (first screen 1741 / 1751 KB, 68 scripts: unchanged).

## What's left
- Other places that stamp a scene "updated now" without a change (`capture()` with no `save: false`, `restore`,
  `duplicate`) are calls that do change the scene or want a save. They were left as they are.
- qa-keys still judges a key with no state of its own by the DOM-write count. Today no real key relies on it. A new
  key that does should add its state to the area's signature.

## For Codex
No Codex-owned file was changed.

## For the patch notes
- **Fixed**: opening a project chat that has its own Lab scene no longer marks the scene you left as just edited.
  Before, it saved every Lab scene again and sent them all to your other computer.
- **Fixed**: Find in this project no longer redraws the same results a moment after they appear. A result you were
  about to click, or had picked with the arrow keys, stays put.
- **Behind the scenes**: the keyboard check judges the Lab's console key by whether the console shows, so a busy
  computer no longer fails it.
