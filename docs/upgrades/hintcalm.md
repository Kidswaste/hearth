# One hint at a time (round 38, hintcalm)

Rounds 26–37 each brought a small note that shows by itself: the ✦ What can I do here? card, the "Hearth updated" note,
What's new, the welcome on a new computer, the full-screen and look-around hints, 🩺 Fix my scene's hint, ◧ Before /
after's chip, the cache and Continue lighter lines, the ffmpeg note, the pick-up card… After an update several came at
once, sometimes over the chat box or the Lab preview. Now every optional one goes through **one small queue**
(`hints.js`, ≈ 9 KB, loaded with the first screen): one at a time, never while you work, what fits where you are first,
a few minutes apart, remembered on this computer, and one switch silences them all. Nothing was removed: every text and
every trigger is the same; only *when* they show changed. Token-free (nothing is sent, nothing is added to a prompt).

## How it decides
- **One on screen at a time**: a card, a chip or a toast that came by itself; a card you opened yourself (the ✦ card, a
  tour) counts too, so nothing lands next to it.
- **Never while you work**: not while you type (4 s after the last key in a text box), drag (a pointer held down, a
  drag and drop), while a reply streams, while a dialog, a menu, ⋯ AI setup, the keys sheet or a tour is open, while
  Hearth is in the background, nor in the first seconds after it opens.
- **What fits where you are first**: a Lab hint waits for the Lab, a chat's for a chat; "anywhere" hints show anywhere;
  then by importance (🩺 before the look-around hint before the ✦ card).
- **A few minutes apart**: at most one new tip every 3 minutes. A tip that waited too long (or no longer fits: the
  scene changed, the chat closed) is dropped and **not** remembered, so it can come again at a better moment.
- **Remembered on this computer** once shown (or dismissed), as before (each feature keeps its own memory too).
- **After an update: the patch notes first** ("Hearth updated … 📰 Patch notes"), then your fixed
  reports, the welcome on a new computer, the pick-up card, then the tips one by one.
- **Out of the way**: anything that would land on the chat box you're typing in or on the Lab preview's centre moves up
  just enough; errors too (`Hints.dodge`, called for every toast).
- **Essential notes don't wait**: errors and their fixes, refusals with their fix, offline / busy / usage-limit lines,
  sign-in and engine problems, crash and restore cards, first-run setup, your own hooks' notes.

Kinds: **tip** (the default: everything above), **notice** (about this copy: the update note, your fixed reports, the
welcome on a new computer, the pick-up card: queued and one at a time, not rate-limited, not silenced by Don't show tips;
the pick-up card keeps its own switch), **line** (a line in a chat or a panel: waits while you type or a reply streams,
silenced by Don't show tips; it covers nothing, so it can sit next to a card and an open dialog or AI setup doesn't
hold it), **chip** (◧ Before / after: one at a time and never while you work,
but it comes back after each change, so it's neither remembered nor rate-limited; B, the right-click menu and the keys
work meanwhile).

## Inventory: everything that shows by itself (41)
"Before" is how it behaved in round 37; "Now" is what changed. Dismissible = has its own × / button or goes by itself.

| # | What | Where (file) | When | How often | Dismissible | Blocking? | Now |
|---|---|---|---|---|---|---|---|
| 1 | "Hearth updated (a → b, N files)" + 📰 Patch notes + ↶ Go back | toast (updater.js) | right after an update's reload | once per update | × / 10–14 s | no | **notice, first** |
| 2 | "Back on the previous version" | toast (updater.js) | after ↶ Go back | once | × / 9 s | no | notice, first |
| 3 | ✦ What's new · N changes | card bottom left (discover.js) | 3.5 s after an update | once per update | × / 45 s | no | **tip**, after the patch notes |
| 4 | "Did you know?" daily tip | card (discover.js) | after opening a screen / a command (not since round 31 when the ✦ card exists) | ≤ 1 a day | Later · Stop tips / 25 s | no | tip (+ Don't show tips) |
| 5 | "Your report #N is fixed in this update" | toast (devreport.js) | after an update | once per update | × / 12 s | no | notice, after the patch notes |
| 6 | Welcome to this computer | card (twocomputers.js) | first sync on a new computer | once per computer | Got it | no | notice |
| 7 | Pick up where you left off | card (speed-resume.js) | 2.5 s after Hearth opens | each start (own switch) | × / 20 s | no | notice (waits for the update note) |
| 8 | ✦ What can I do here? (chat) | card top right (quickstart-hooks.js) | first time a chat opens in this version | once | × | no | **tip**, place chat |
| 9 | ✦ What can I do here? (Lab) | card (quickstart-hooks.js) | first Lab open | once | × | no | tip, place Lab |
| 10 | ✦ What can I do here? (board) | card (quickstart-hooks.js) | first board open | once | × | no | tip, place board |
| 11 | "Full screen. <its key> or ⛶ leaves it" | toast (bigscreen.js) | first time full screen | once | × / 5 s | no | tip (only while still full screen) |
| 12 | Look around: two fingers turn… | toast (tools/three-gestures.js) | first scene you can look around in | once | How / × / 6.5 s | no | tip, place Lab |
| 13 | 🩺 The frame is blank / a layer stopped | preview corner (tools/three-doctor-hook.js) | a layer error, a blank frame after a run | once per problem | ✕ / 14 s | no | tip, place Lab, first in the Lab |
| 14 | ◧ Before: Claude's edit · ⟲ · ✓ | chip top centre of the preview (tools/three-abcompare.js) | after each change to the look | every change | ✓ / 6 s | no | **chip** (never mid-drag / mid-reply: comes after it) |
| 15 | ↻ "… changed mid-chat: the next message re-reads…" | line in the chat (cachewise.js) | a change to the AI mid-chat | once per change | × | no | line (waits for the reply / typing) |
| 16 | "This chat re-reads ≈ 48k… Continue lighter?" | line under the reply (autocompact.js) | after a reply in a long chat | once per growth step | × | no | line |
| 17 | 💡 "This chat …: Fix" | toast (chat-cost.js) | an expensive message | once per chat and kind | Fix / × / 9 s | no | tip, place chat |
| 18 | "You often do A → B. Make it one key?" | toast (speed-learn.js) | a repeated routine | once per routine, ≤ 1 / 10 min | × / 12 s | no | tip |
| 19 | Install ffmpeg… | toast (engine-health.js) | startup + 20 s, ffmpeg missing | ≤ 1 a week | × / 15 s | no | tip |
| 20 | Spending's "trim what's suggested" nudge | AI setup fold summary (tokenaudit.js) | an unused tool costs > 500 tokens | once per tool | opening the fold | no | silenced by Don't show tips |
| 21 | Engine missing / not signed in / too old | toast (engine-health.js) | startup check | ≤ 1 a day | fix button / 14 s | no | essential (unchanged) |
| 22 | Set up this computer (first run) | dialog (firstrun.js) | first launch on a fresh computer | once | Skip for now | yes (a dialog) | essential (unchanged) |
| 23 | Hearth crashed last time | toast (devreport-hooks.js) | after a crash | once | Report / × | no | essential (unchanged) |
| 24 | What came back (restore card) | card (safetynet.js) | after an unexpected exit | once | × | no | essential (unchanged) |
| 25 | Offline / busy / usage limit / signed out lines | lines + bar (offline.js) | when it happens | each time | × | no | essential (unchanged) |
| 26 | "Files it can use" refusal + fix (Check this AI) | line (access.js) | a refused file action | each time | × | no | essential (unchanged) |
| 27 | "This keeps happening (3×)" + fix | toast (speed-fix.js) | the 3rd error in a day | ≤ 1 a day per error | fix / 7 s | no | essential (an error with its fix) |
| 28 | Tidied: tucked N controls (Undo) | toast (habits.js) | weekly tidy | ≤ 1 a week per screen | Undo / 7 s | no | unchanged (reports what Hearth did, with Undo) |
| 29 | ⚡ hook notes | line (hooks.js) | your own hooks run | each time | × | no | unchanged (your automation) |
| 30 | A reply finished in the background (Open) | toast + notification (native.js headsUp) | a reply ends off screen | each time | Open / 15 s | no | unchanged (what you asked for) |
| 31 | Remembered: … (Undo, This chat only) | chip under the reply (native.js / chat-memory.js) | the AI saved a fact | each time | Undo | no | unchanged (feedback on an AI action) |
| 32 | A fact waits for your OK (memory approve on) | card in the reply (chat-memory.js) | the AI wants to remember | each time | Keep / Drop | no | unchanged (a decision) |
| 33 | Long chat banner | above the chat box (native.js) | ≥ 80k tokens and Continue lighter off | once per chat | Keep going | no | unchanged (Continue lighter replaces it when on) |
| 34 | Director next steps (chips) | the dock's chip row (assist.js) | after a director turn | each turn (own switch) | click / next turn | no | unchanged (a row of its own, not over anything) |
| 35 | Empty chat line ✦ What can I do here? | empty chat (astra.js) | an empty chat | always | — | no | unchanged (empty state) |
| 36 | Lab starter chips (Start from something like…, Describe it) | preview (tools/three-*hook.js) | an empty scene | always | — | no | unchanged (empty state; step aside while a card is up) |
| 37 | Empty board line | board | an empty board | always | — | no | unchanged (empty state) |
| 38 | Key badges on hover / holding Ctrl | Lab toolbar (tools/three.js), everywhere (keys-ui.js) | you hover / hold Ctrl | each time | — | no | unchanged (you asked by hovering) |
| 39 | ⬆ Update button / Activity's "update ready" row | rail / Activity | main has something new | while it's true | — | no | unchanged (a button, not a note) |
| 40 | Lab search hint | — | — | — | — | — | none exists (🔎 and / are the way in; no hint shows by itself) |
| 41 | Forged tooltips, juice tips | hover (juice.js) | you hover | each time | — | no | unchanged (you asked by hovering) |

Migrated to the queue: 1–20 (20 kinds). Essential or not a hint (asked for, an empty state, a report with Undo): 21–41.

## Upgrades
1. **One hint at a time**: every hint that shows by itself waits for the one on screen (or a card you opened) to go.
2. **Never while you type**: a tip waits until 4 s after your last key in a text box.
3. **Never while you drag** (a slider, a layer, a file) **or while a reply streams**.
4. **Never over a dialog, a menu, ⋯ AI setup, the keys sheet or a tour**, nor while Hearth is in the background.
5. **Never in the first seconds** after Hearth opens.
6. **What fits where you are first**: a Lab hint waits for the Lab, a chat's waits for a chat.
7. **Most useful first**: 🩺 before the look-around hint before the ✦ card in the Lab; What's new before the ✦ card.
8. **A few minutes apart**: at most one new tip every 3 minutes.
9. **A hint that waited too long is dropped, not burned**: it can come again at a better moment.
10. **After an update, the patch notes first**: "Hearth updated … 📰 Patch notes", then the rest one by one.
11. **Out of the way**: a note that would cover the chat box you're typing in, or the Lab preview's centre, moves up.
12. **Errors too**: every toast (errors included) keeps off the chat box and the preview's centre.
13. **Essential notes never wait**: errors with fixes, refusals, offline, sign-in, usage limits.
14. **Settings › Hearth › Don't show tips**: one switch for every tip, card and suggestion line that shows by itself.
15. **It took the place of "A Did you know? now and then"** (that tip hadn't come by itself since round 31): the
    number of switches in Settings is the same.
16. **Turning it on closes the tip on screen** and drops the ones waiting.
17. **The ✦ card stays one click away** with tips off: each window's ⋯ › ✦ What can I do here?.
18. **Find anything** (Ctrl/⌘+K) finds it by "tips", "hints", "nudges", "popups", "suggestions".
19. **Ctrl/⌘+K › Tips that show by themselves: on / off**.
20. `/hints [on | off | status | reset]` (also `/no-tips`): the app's internal API; `status` says what waits and why,
    `reset` lets the tips you already saw come again.
21. **◧ Before / after's chip waits for the end of a reply or a drag**, then shows the newest change (B works meanwhile).
22. **The cache line and Continue lighter wait for calm** (after the reply, not while you type) and only in that chat.
23. **The 💡 expensive-chat tip shows in that chat**, in turn.
24. **The "make it one key" offer, the ffmpeg note, the full-screen and look-around hints** come in turn, each still once.
25. **Spending's nudge** stays quiet with Don't show tips (the breakdown inside still shows everything).

## For other files (the API)
`Hints.offer({ id, show, place?, rank?, kind?, once?, ttl?, still? }) → Promise<boolean>`; `show()` returns the node it
put on screen (or a promise of it; null = it didn't show after all). `Hints.essential(show)` shows at once (dodged).
`Hints.off() / setOff(v) / seen(id) / forget(id?) / busy() / flush() / state() / config(o) / dodge(node)`. Call it
guarded (`window.Hints ? Hints.offer(…) : show()`). A new feature's tip: give it an `id`, a `place` when it's about one
window, a `rank` (lower = sooner; 0 is the update note), `once: false` when the feature keeps its own memory.
Test copies (`window.SMOKE_SAVES`): the gap and the start quiet are 0 unless a check sets them (`Hints.config(o)`, or
`store hints.test` read when the page starts); one at a time and the busy rules still apply.

## Tests
- `node dev/hintcalm-test.js` (unit, in UNIT, 59 ✓): the start quiet; one at a time (its own and another card); the
  gap; forget; place first then rank; typing (only in a text box), dragging, streaming, a dialog, in the background;
  flush; notices (first, not rate-limited), lines (next to a card and an open dialog, still wait for a reply), chips (not remembered, no
  gap); Don't show tips (drops waiting tips, silences tips and lines, notices and chips still show, closes the tip on
  screen); waited too long / still() / same id / nothing shown; essential at once whatever the queue does; dodge off
  the chat box and the preview's centre (not a corner); 200 offers + 50 pumps < 50 ms. Mutation-checked: the real gap
  set to 0 fails 2 steps.
- `dev/checks/hintcalm.js` (`sh dev/run-checks.sh hintcalm`, 19 ✓): a simulated update then the first open of a chat
  and the Lab: "Hearth updated" + Patch notes first and not over the chat box, then What's new and the chat's ✦ card a
  few seconds apart; in the Lab 🩺, then the look-around hint; sampled every 50 ms: never more than one optional hint on
  screen; none while typing in the chat box (it showed 4.4 s after the last key); none while a reply streams (a tip
  and a chat line, both after it); Settings' Don't show tips: On silences a tip, a line and the ✦ card, an error still
  shows at once (typing, tips off), a notice still shows, Off brings them back.
- Updated without weakening (same assertions, they now wait for the queue): `devreport` (the "fixed in this update"
  note: up to 8 s instead of 150 ms), `cachewise` (the line said at a send now comes when the reply ends: waits up to
  8 s for it), `abcompare` (the chip after a director edit / a variation: waits up to 5 s; 🩺's own hint is switched
  off in that check with its existing switch, since one at a time would hold the chip behind it for 14 s).
- Passing: hintcalm, unit:hintcalm-test, quickstart (+ unit), scenedoctor, abcompare, cachewise, autocompact,
  twocomputers, devreport (+ unit), speed (+ habits), tour-discover, bigscreen, bigscreen-hidpi, labgestures (+ unit),
  updater, simplify3, appsearch (+ unit), qa-commands, lazy, unit:boot-test (990 ✓), and the unit tests cache,
  autocompact, tokenaudit, scenedoctor, abcompare, twocomputers, updater, budget, quickstart, bigscreen, nativefeel.
  `labpace` (in the labgestures group) fails "the sketch changes itself … within a frame or two" (a 167 ms lag on a
  busy machine) on the base commit too: not from this pass.

## Risks
- A tip offered while you work for a long time (a long director turn, typing for minutes) can be dropped after its wait
  (10 min by default, shorter for in-the-moment hints); it isn't remembered, so it comes again the next time its trigger
  fires. One that is only offered once per version (the ✦ card) re-offers on the next window switch.
- "A reply streams" means any native chat, also one in the background: a long background run holds tips back.
- ◧'s chip after a director edit now shows when the director's reply ends (or right away for your own changes).
- Settings' "A Did you know? now and then" row is gone (the tip hadn't shown by itself since round 31; `/tip on|off`
  still sets it); Don't show tips covers it.

## For the patch notes
- Hints calm down: notes that show by themselves now come **one at a time**, a few minutes apart, never while you type,
  drag or a reply is running, and never over a dialog.
- After an update you see **"Hearth updated" with 📰 Patch notes first**; What's new and the other notes follow one by one.
- What fits where you are comes first: Lab hints wait for the Lab, a chat's for that chat.
- Nothing lands on the chat box you're typing in or the middle of the Lab preview any more (error notes included).
- New in **Settings › Hearth: Don't show tips** — one switch that silences every tip, card and suggestion line that shows
  by itself. Errors, sign-in, offline and usage-limit notes still show.
- ✦ What can I do here? stays in each window's ⋯ when tips are off.
- ◧ Before / after's chip waits until the director's reply ends, then shows the newest change (B works any time).
- Caveat: a hint that waited too long is skipped for now and can come back later.
