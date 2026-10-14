# 🔁 Keep going (round 41, routines): a chat keeps improving its work by itself

You asked: "make a routine option: if I choose for an AI to keep prompting itself to improve work for a period of time,
or a set amount of extra work (like 5 more 'do 5 more' prompts every time an upgrade ends), or set it forever."
This is how you drive Hearth's own development ("keep pushing another 5"), now built into any chat: Claude, Astra and
the Lab director alike.

Nothing is added to any prompt: each round sends your routine words exactly as written, as a new turn (0 extra tokens
beyond the rounds themselves). Nothing new shows on screen until a routine runs.

New files:
- `routines-core.js`: the plain rules (Node-tested): what a routine is, when the next round may go, how a round's end
  is read, pauses, stops, restarts, the words on the chip.
- `routines.js`: the live part: the card, the header chip, sending the rounds, notes, ◉ Activity, ⋯ AI setup,
  ◎ Missions, Find anything, `/keepgoing`.
- `routines.css`: the chip, the card, the 🔁 mark on messages.
- `dev/routines-test.js` (UNIT, 69 checks) and `dev/checks/routines.js` (`sh dev/run-checks.sh routines`).
- Lazy group `routines` (right after the first screen, at `offline.js`; no new script on the first screen).

## What shipped
Ways in
1. **◎ Missions › More › 🔁 Keep going…**: pick it, write your message, send: the card opens; your message goes first,
   then the routine follows its reply ("Send and keep going"). Cancel puts your words back in the box.
2. **A reply's ⋯ › Reply › 🔁 Keep going from here…** on the latest reply: the card, then the first round goes at once.
   While one runs, the same row shows "🔁 Keep going: running…" with its details.
3. **Ctrl/⌘+K (Find anything)**: "🔁 Keep going: this chat keeps improving its work by itself (a routine)…"; the
   mission is listed there too.
4. **`/keepgoing`** (also `/routine`): the card; or straight away with your last choices: `/keepgoing 5`,
   `/keepgoing 30m`, `/keepgoing 2h`, `/keepgoing forever`; `pause`, `resume`, `stop`, `status`.

The card (one small dialog)
5. **What to ask each time**: prefilled with "Keep improving: do the next 5 improvements, then summarise what changed.
   If nothing is left worth doing, say so plainly."; editable; **remembered per chat**.
6. **How long**: 30 min · 1 h · 3 h · Until… (a time of day) · Extra rounds (a number, 5 by default) · Until I stop it.
7. **Pause between rounds**: no pause · 1 min · until I'm idle 10 min · when I haven't written for an hour.
8. **Spending cap**: defaults from your weekly Spending limit (a quarter of it, never more than what's left this week;
   ≈ 300k with no limit). **Required** for "until I stop it", 3 h or more, and more than 10 rounds ("No cap" only
   shows for short ones).
9. Under **More**: when I write here (pause until ▶ · continue after 10 min quiet · after 1 h quiet), continue lighter
   when the chat gets long (on), wait for a usage limit to reset (on), keep going after Hearth restarts (off).
10. The card remembers your last choices; "Start again with these" on a running routine replaces it.

While it runs
11. Each time a reply finishes, and nothing waits or streams there (the chat's own queue, the offline queue, your
    typing, a hook's turn), Hearth sends the routine words as a new turn after a short settle moment.
12. **Marked 🔁 on the message, never as if you typed it**: "🔁 round 3 of 5 · ≈ 14k tokens" under each round's
    message, with **what that round cost**.
13. **The header chip**: "🔁 3 of 5 · ≈ 42k tokens so far · ❚❚ ■" (time routines: "· 41 min left"; forever: "of 300k").
    Hover: the words each round sends and what it's doing now. Click / right-click: each round's cost, ✎ Change it…,
    ❚❚ / ▶, ■ Stop. Docked director chats get a compact one.
14. **You writing pauses it** ("paused: you wrote in this chat", ▶ Resume in the note and the chip), or, if you chose,
    it goes on after 10 min / 1 h of quiet (each message you write pushes that further).
15. **Continue lighter** runs between rounds when the chat is long and it clearly pays (the same decision as its
    offer), so long routines keep re-reading less.
16. **◉ Activity** lists every start, round ("round 2 of 5 done · ≈ 12k tokens (≈ 30k so far)"), pause and stop, each
    one opening its chat.
17. **⋯ AI setup › 🔁 Keep going** (shown only while that AI has one): each routine with ❚❚ / ▶ and **■ Stop**.

Safety and cost
18. **Stops at the cap, politely**: before a round that would pass it (going by the rounds so far), with a note.
19. **Stops on repeat failures**: the same failure twice in a row ends it; an answered round in between resets that.
20. **No internet / a busy service**: not counted as a failure: the offline queue sends it again; 6 in a row pause it.
21. **Usage limits**: waits for the reset time and goes on (if allowed), else stops. **Signed out**: stops.
22. **"Done" / "stuck" twice**: when the end of its reply says nothing is left worth doing (or that it's stuck / needs
    you) twice in a row, it stops ("it said it's done twice in a row").
23. **Never answers for you**: a permission card (or a question) during a round pauses the routine after that round;
    a plan waiting for ▶ Go ahead pauses it; Spending's "ask before each message" near the limit pauses it and asks
    (▶ = yes for the rest of this routine).
24. **You stopping a reply** pauses the routine.
25. **Awake only while a round runs**: the computer is held awake (powerwise, "an AI is working") from a round's send
    to its end, never during pauses.
26. **Survives a restart**: a routine that was running comes back paused with a resume prompt ("Keep going was running
    in “…” when Hearth closed. Resume?"), unless you chose "keep going after a restart" (then it goes on after 20 s,
    with an Activity line). A round cut by the restart isn't counted twice.
27. Hard ceiling of 200 rounds per routine; one routine per chat; a deleted chat ends its routine.
28. Per computer only (localStorage): a routine never runs on two computers at once through sync.

## How it decides (routines-core.js)
`nextStep(r, ctx)` before each round: not while a reply runs; rounds done → finished; time up → finished; the cap
reached or the next round (the average so far) would pass it → stopped; a usage limit's reset → wait; Spending asks →
pause; your quiet time → wait; a message waiting → wait; you typing there (in the last 5 min) → wait; the settle
moment; then the pause you chose (the first round after Start or ▶ skips it). `roundEnded(r, ev)` after each round:
counted and costed; stopped by you → pause; offline / busy → wait for the queue; limit → wait or stop; signed out →
stop; other errors twice in a row → stop; "done" / "stuck" twice in a row → finished; a permission ask or a waiting
plan → pause.

## Tested
- `node dev/routines-test.js`: 69/69 (defaults, clamps, caps from the weekly limit, until-a-time, every pause kind,
  time limits, the cap, errors / transient / limits / sign-in, done / stuck words incl. false positives, asks, the
  owner writing, quiet resume, restart, chip words).
- `dev/checks/routines.js` with the fake engines: the ◎ card (prefill, the six "how long" choices, the four pauses, cap
  required for forever), your message first then 2 rounds then it stops (marked 🔁, costed per round, the note, the
  chip goes); ⋯ Reply › Keep going from here…; owner writing pauses (no round after your reply; ⋯ AI setup lists it
  with ■ Stop; ▶ resumes; ■ in the chip stops); a time limit; forever with a cap stops at the cap; "error" twice stops;
  a permission ask during a slow round pauses after it; a restart pauses with the resume prompt; Astra (Codex) runs a
  round and is costed; Activity lists the rounds; no command on screen.
- Also run: missions, offline, budget (autocompact, cachewise, concise, tokenaudit), hintcalm, a11y, chatcalm, lazy,
  unit:boot-test (results in the final report).

## Not covered / caveats
- "Idle" means no key / pointer in Hearth's window (Hearth can't see input in other apps).
- The permission-ask pause is tested with the same event access.js sends (`hearth:needs-you`), not a real file card.
- Continue lighter between rounds runs only when the routine's chat is the one on screen for that AI.
- Done / stuck detection reads the end of the reply in plain English; another language won't trip it (the cap and the
  rounds still stop it).

## For the patch notes
- New: **🔁 Keep going**. A chat can now keep improving its own work after each reply, for a time (30 min, 1 h, 3 h,
  until a time), a number of extra rounds, or until you stop it.
- Start it from ◎ › More › 🔁 Keep going… (your message goes first), from a reply's ⋯ › Reply › Keep going from here…,
  or Ctrl/⌘+K "Keep going". It works with Claude, Astra and the Lab director.
- You choose what it asks each time (prefilled with "do the next 5 improvements, then summarise", remembered per chat)
  and the pause between rounds: none, 1 min, until you're idle 10 min, or when you haven't written for an hour.
- Each round is marked 🔁 with what it cost, and the chat's header shows "🔁 3 of 5 · ≈ 42k tokens so far" with
  ❚❚ and ■. ◉ Activity lists every round; ⋯ AI setup lists running routines with Stop.
- Long and "until I stop it" routines need a spending cap (from your weekly limit by default) and stop politely before
  passing it. They also stop on the same error twice, at usage limits (or wait for the reset), and when the AI says
  it's done or stuck twice.
- Writing yourself pauses it (or it goes on after a quiet time, if you prefer). It never answers a permission card for
  you: it pauses and waits.
- After a restart it asks before going on, unless you chose otherwise. The computer stays awake only while a round runs.
- Caveat: tested with the fake engines; try a short "3 extra rounds" on a real chat first to see the costs.
