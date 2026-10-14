# chatcalm (round 40): the chat itself, calmer

simplify3 calmed ⋯ AI setup and settingscalm calmed Settings; this pass calms the place you spend most of your time:
the chat. I counted every part of a chat (screenshots and control counts, at rest and while you point at a message),
then gave each part one obvious next step, put everything else one click deeper (the message's ⋯, the chat box's ＋),
made the line under every message read in one order, and folded the quiet notes that pile up under a reply into one
line. Nothing was removed: every action is still there, in ≤ 2 clicks (pointing at a submenu opens it), and Find
anything (Ctrl/⌘+K) finds the moved ones.

## Audit: what each part of a chat shows (before → after)
Counted by `dev/checks/chatcalm.js` (new) the way simplify2 / simplify3 count: visible buttons, selects, inputs,
summaries, links; a control faded to nothing counts only when you point at its message. "Before" is the same check
run on the base commit (a31bfd9). Screenshots looked at before and after (empty chat, replies pointed at, the ⋯ menu,
a stopped and a failed reply, the notes folded and open).

| Part | At rest, before | At rest, after | Pointed at, before | Pointed at, after |
|---|---|---|---|---|
| Chat header | 1 (⋯) | 1 | 1 | 1 |
| Chat box | 4 (text, ◎, ＋, Send) | 4 | 4 | 4 |
| Chat box right-click | 7 rows | **6** (one ＋ Attach… row) | | |
| Empty chat | 1 link, **2 lines** | 1 link, **1 line** | | |
| A reply's line | 1 (the "what it sent" bar) | **0** | 3 (bar, Copy, ⋯) | 3 |
| A reply's line with Smart on (from the CSS, not run here) | 2 (bar, Smart's pick) | **0** | 4 | 4 |
| Your message's line | 0 | 0 | 2 (Copy, ⋯) | 2 |
| A stopped reply (the last) | **0** (Continue hidden until pointed at) | **1** (Continue) | 3 | 3 |
| A failed reply | **4** (Retry, Copy error, Check engines, Report) | **2** (Retry, ⋯) | 4 | 2 |
| Message ⋯ menu | 6 rows (Copy twice: button + menu) | **5** | | |
| Quiet notes under a reply (3 apply) | **3 lines, 4 controls** | **1 line, 2 controls** | | |
| Tooltips missing (Send, Copy ×2) | 3 | **0** | | |

Unchanged on purpose: the chat header (already one ⋯), the chat box (◎ · ＋ · Send; the queue, offline, mission and
attachment chips only show while they mean something, each with its ×), the answer-length / Smart / cost parts (they
live in ⋯ AI setup and on the token hover, not in the chat box).

## Upgrades

### Under every message
1. **One order everywhere**: what it is (tokens, the bar of what it sent, Smart's pick, the time) → its one next step
   → Copy → ⋯, whatever added a button to the line (↶ Undo what it did used to land after Copy).
2. **A reply at rest shows only what it is**: the "what this message sent" bar and Smart's Quick / Deep pick appear when
   you point at the reply (or tab to them); the token line stays.
3. **A stopped reply shows ▶ Continue without pointing at it** (it was hidden until you hovered): its one next step.
4. **A failed reply: Retry in sight, the rest in its ⋯** (Copy error, Check engines, Report); 4 buttons → 2.
5. **The message ⋯ doesn't say Copy twice**: opened from its ⋯, the menu leaves out Copy (the button is right beside
   it); right-click a message and Copy is still the first row.
6. Copy says what it copies when you point at it ("Copy this reply" / "Copy this message").

### Under a reply: one quiet line
7. **Two or more quiet notes fold into one line**: the cache note (↻ … changed mid-chat), 🗜 Continue lighter and what
   Smart learned become "▸ 3 notes · their first words…" with their buttons still on the line (🗜 Continue lighter is
   still one click).
8. **▸ shows each note**, ▾ folds them again; dismissing down to one note brings it back as itself.
9. Errors, offline lines, your hooks' notes and the output of what you typed never fold.

### The chat box and the empty chat
10. **The empty chat says it in one line**: "Ask anything. ＋ attaches files…, ◎ turns your next message into a
    mission (a second opinion, side by side, a jam…), ⋯ at the top sets up the AI. ✦ What can I do here?" (it was two
    lines, the second one repeating ◎).
11. **Astra's empty chat no longer shows a command name**: "…· ⋯ AI setup for the rest" opens AI setup (it was a
    "/astra" link that typed a command).
12. **The chat box's right-click has one Attach row**: ＋ Attach… opens the ＋ menu (Files… is its first row); it had
    "＋ Attach from…" and "Attach files…".
13. **Send says its key from the start** ("Send (Enter)"; it only got a tooltip after the first reply), ＋ says what it
    attaches in one sentence and is named "Attach" for screen readers.

### Finding things
14. **Find anything finds every message action**: Ctrl/⌘+K "branch", "retry", "pin message", "read aloud"… find the
    row in a message's ⋯ (with its path "A message ⋯ › Reply") and run it.
15. Three new "How do I…" answers: retry / edit / branch / quote a message; where the notes under a reply went; what a
    reply cost and which model answered.

**15 upgrades.**

## How it's built
- `native.js`: `calmFoot(node)` runs after the message hooks (router, aiundo, devreport…) and puts the line in order;
  a failed reply's extra buttons get `.calm-tucked` and an `.err-more` ⋯ that clicks them. `messageMenu` leaves out
  Copy when its anchor is the ⋯ next to a Copy button. `note()` takes `quiet` (default: the ids in `QUIET_NOTES`:
  cachewise, autocompact, routerlearn); `restack(agentId)` (after a note, a dismissal, a redraw, clearNotes) puts one
  `.note-stack` row before the quiet notes when two or more apply (compared before written), with proxy buttons for
  their actions. `emptyState` merges a lone link from `Astra.emptyHints` into the hint.
- `features.css` (end): the reply line at rest, `.primary-act` visible, the folded line.
- Small edits elsewhere: `declutter.js` (one Attach row), `astra.js` (no repeated ◎ line for Claude; ⋯ AI setup
  instead of the "/astra" link), `appsearch.js` (a message's right-click menu is indexed), `appsearch-data.js` (three
  answers), `dev/run-checks.js` (chatcalm in the chat group).

## Tests
- `dev/checks/chatcalm.js` (new, chat group): budgets per part (header 1, chat box 4, empty chat 1 control and 1
  line, a reply's line 0 at rest and ≤ 5 pointed at, yours 0 / 2, a stopped reply 1, a failed reply 2, ⋯ menu ≤ 6,
  chat box right-click ≤ 7 with one Attach row, three quiet notes = 1 line with ≤ 2 controls); every action of a
  reply's and your message's ⋯ reachable in ≤ 2 clicks (13 + 5 named); Copy on the right-click menu; one order under
  every message; ◎ ＋ Send in that order; the empty chat says what ＋ ◎ ⋯ do and shows no command; the folded line's
  🗜 Continue lighter runs; ▸ opens; down to one note the line goes; a command's output never folds; one-sentence
  tooltips; Find anything finds branch / retry / pin message / read aloud / the notes / which model. Base commit:
  19 failures; after: PASS.
- Run (`sh dev/run-checks.sh …`): chatcalm, options, missions (+ missions2, swarmlean), dragdrop, offline (+ access-chat),
  autocompact, cachewise, routerlearn, router, concise, chat-stream, appsearch (+ unit appsearch-test 10/10), hintcalm,
  lazy, devreport, context, simplify3, declutter-count, clutter and the unit tests in their groups plus
  `unit:boot-test`: all pass. `streamrender` failed once ("jump to message #3: not in view") in a 470 s run while other
  streams loaded the machine, and passed when run again alone (356 s).
- No existing check needed a new selector or label: none looked up the moved rows ("Attach files…", the empty-chat
  line, Copy in the message ⋯ when opened from ⋯); the ones that read the bar / Smart's chip find them by selector.

## Risks
- A check elsewhere that reads the "what it sent" bar or Smart's chip with a visibility test at rest would now see
  them faded (the existing ones look them up by selector: context, router, routerlearn).
- Quiet notes that fold are hidden (display: none) until ▸: a check that waits for one of them *visible* while another
  quiet note is up would wait in vain (none does today).
- The folded line's buttons are copies that click the real ones; a note whose action replaces its own buttons shows
  the new ones at the next redraw / note.

## For the patch notes
- The chat is calmer: under a reply you see what it is (its tokens); Copy and ⋯ show when you point at it.
- Every message's line reads in one order: what it is → its next step → Copy → ⋯.
- A stopped reply shows ▶ Continue right away; a failed one shows Retry, with Copy error / Check engines / Report in
  its ⋯.
- When several quiet notes apply under a reply (the cache note, 🗜 Continue lighter, what Smart learned), they fold
  into one line; its buttons stay on it and ▸ shows each note.
- The empty chat says it in one line: what ＋, ◎ and ⋯ do.
- The chat box's right-click has one Attach row; the message ⋯ no longer repeats Copy.
- Ctrl/⌘+K finds every message action (branch, retry, pin, read aloud…) and runs it.
- Nothing was removed: every action is still at most two clicks away.
