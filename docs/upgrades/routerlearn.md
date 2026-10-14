# Smart learns from you (round 39, routerlearn)

**Smart** (router.js, round 28) picks a model and effort for each message from fixed rules: chit-chat → the lightest
model, code fixes → the chat's own model thinking hard, and so on. The rules are the same for everyone. Now Smart also
watches how its replies go for you, on your computer and for free, and moves one *kind* of message up or down a rung
when the evidence keeps saying the same thing. It learns separately for each AI. Nothing reaches the engines: the prompt
stays byte-for-byte the same (`dev/cache-test.js`), and a learned step only changes the model and effort a message
asks for.

Files: new `routerlearn.js` (the rules, the signals, the AI setup line, `/route learned | forget`), small hooks in
`router.js` (each pick gets a `kind`; `decide()` takes `learned` shifts and a top rung `max` = the chat's own model at
xhigh; `reread` flags a learned step up in a big chat; `/route` passes the new words on), one line in `options.js`
(the learned line under Quick / Smart / Deep), a few CSS lines in `router.css`, one `<script>` in `index.html`, one
row in `appsearch-data.js`, `dev/routerlearn-test.js` (UNIT), `dev/checks/routerlearn.js`, `dev/run-checks.js`
(`routerlearn` group, also in `router`).

## What it listens to (all local, no tokens)
For each reply Smart picked, the next thing you do says how it went, for that AI and that kind of message:

| You… | It means | weight |
|---|---|---:|
| ask again with a stronger model or more thinking (the pick's click, Retry with another model, `/route harder`) | wanted more | 1.5 |
| switch the chat to a stronger model right after (within 10 min) | wanted more | 1 |
| say "that's wrong", "try again", "think harder", "doesn't work", "still broken"… | wanted more | 1 |
| ask for a fix in a Lab director chat right after its turn ("fix it", "black screen", "error"…) | wanted more | 1 |
| ask again with the same pick (Retry, or edit your message) | wanted a bit more | 0.5 |
| stop the reply in its first 90 seconds | wanted a bit more | 0.5 |
| type in the Lab's code editor within 3 min of a director turn | wanted a bit more | 0.5 |
| the Lab shows an error within 3 min of a director turn (the director idle) | wanted a bit more | 0.5 |
| keep going (a new message within 30 min, no complaint) | it was fine | 0 |
| ask again with, or switch to, a lighter model | it was more than needed | −1 |

Explicit asks ("think carefully", "quick"), go-aheads ("yes do it"), "think harder" replies themselves, compactions and
replies you picked the model and effort for are never learned from.

## The rules (prefer staying put)
- **Up one rung** when a change test (CUSUM, p₀ = 8 %, p₁ = 25 %, h = 4.5) is sure the rung falls short too often: about
  three "ask again with more", or a complaint every fourth reply for ~30 replies. One complaint in twelve replies
  (a rung that fits) never moves it (tested over 400 replies).
- **Down one rung** when you chose a lighter model twice for that kind with at most one complaint.
- **Back to the usual pick** after a learned step up only after 40 clean replies in a row and two weeks.
- **A probe one rung below the rule** only after 50 clean replies and a week at that rung; a lighter rung is **on
  trial** for 30 replies and goes straight back up after a complaint and a retry. A rung that proved too weak is
  **locked for 45 days**.
- **Bounds**: at most one rung from the rule either way; the top rung is the chat's own model at xhigh; pictures and Lab
  chats never go to the lightest model, Lab builds never below the chat's own model at medium; chit-chat never below the
  lightest. A model you picked for the chat is never routed away (as before).
- **Cache** (cachewise): a big chat (context ≥ 20k tokens) still never steps down; a learned step **up** in a big chat
  puts cachewise's calm line in the chat with the message that pays for it, once per chat and kind: "↻ Smart thinks
  harder on code fixes now (it learned that from you): this message re-reads the whole chat (≈ 24k tokens) once
  without the prompt cache. That's fine; a new chat starts light."

## Measured: a simulation of six weeks
`node dev/routerlearn-test.js` scripts three owners over 6 weeks × 45 messages a day (20 seeds, averaged). Each kind
of message falls short with a set probability per rung; after a reply that fell short the owner asks again harder
(45 %), complains (25 %), stops it (15 %) or lets it go (15 %). The second try is counted as a reply (tokens and cost
included). Prices and thinking multipliers are router-test's (list prices; low ×0.5, medium ×1, high ×1.7, xhigh ×2.4:
assumptions, not measured). "Bad" = an answer that fell short, second tries included.

| Owner | bad answers before → after | weeks 5–6: bad per message | tokens | cost | changes made |
|---|---:|---:|---:|---:|---:|
| Lab-heavy, picky on code and quick questions | 344 → 169 (**−51 %**) | 18.2 % → 8.4 % | 24.3M → 23.6M (−3 %) | $136 → $147 (+8 %) | 8.9 |
| Easy-going (the rules already fit) | 119 → 123 (+3 %) | 6.3 % → 6.5 % | 17.1M → 17.2M (+1 %) | $74.4 → $76.3 (+2 %) | 7.4 |
| Mostly small talk and makes (the rules aim high) | 68 → 73 (+7 %) | 3.6 % → 3.9 % | 14.9M → 14.8M (−1 %) | $52.5 → $41.7 (**−21 %**) | 5.0 |

What it learned at the end, most often: the picky owner: *quick questions → Normal · code fixes → Deepest · Lab builds
→ Deepest* (13 of 20 runs); the easy-going owner: *nothing* (7/20), else one or two kinds; the small-talk owner: *small
asks → Lightest · everyday makes → Quick* (8/20).

Reading it: where the rules are too weak for you, bad answers halve, and the extra thinking is mostly paid for by the
second tries you no longer need (fewer tokens overall; dollars +8 % because the stronger picks are the pricier model).
Where the rules aim too high, it finds the lighter rungs and saves a fifth, for a few more misses (5 in six weeks).
Where the rules already fit, it mostly stays put; its occasional probes and false steps cost about 4 answers and 2 % in
six weeks. Tuning got there: a fixed "3 of the last 12" rule made 12.6 changes and +10 % bad answers for the easy-going
owner; the CUSUM test, the trial and the locks cut that.

## Upgrades
### Smart learns from you
1. **Smart learns per AI and per kind of message** (chit-chat, quick questions, small asks, everyday makes, code fixes,
   Lab builds, analyses and plans, pictures): ⋯ AI setup → How hard it thinks → Smart (the default). Nothing to turn on.
2. **"Think harder" teaches it**: asking again with more thinking or a stronger model (the pick on a reply, Retry with
   another model) is the strongest signal.
3. **Switching to a stronger model right after a reply** counts too.
4. **Plain words count**: "that's wrong", "try again", "think harder", "doesn't work", "still broken"…
5. **Stopping a reply early** (first 90 s) counts a little.
6. **The Lab counts**: typing in the Lab's code right after a director turn, a Lab error right after it, or asking the
   director to fix it.
7. **Keeping going counts as fine**: a new message without a complaint.
8. **Choosing a lighter model** for a kind of message teaches it to go lighter there.
9. **A new top rung, "Deepest"**: the chat's own model at xhigh, for kinds that keep needing more.
10. **Careful by design**: it moves a kind only on consistent evidence, at most one rung from the rule, tries a lighter
    rung only after a long clean run and takes it back quickly, and locks a rung that fell short for 45 days.
11. **Cache-aware**: a big chat never steps down; a learned step up in a big chat says in one line that this message
    re-reads the chat once without the cache.
12. **One calm line the first time it changes something** (through Hints: waits until you aren't typing, silenced by
    Don't show tips): "🧭 Smart learned from you: code fixes now get Deepest (Opus · xhigh), after you asked again with
    a stronger model or more thinking (3 times)…"
### Seeing and undoing it
13. **⋯ AI setup → How hard it thinks: "Smart has learned: code fixes → Deepest · quick questions → Normal"**, one quiet
    line under Quick / Smart / Deep, always there ("Smart has learned: nothing yet" until it has; "it learns while Smart
    is on" on Quick / Deep); hover: the model and effort it means and why.
14. **✕ on each forgets it**: back to Smart's usual pick for that kind.
15. **The pick on a reply says so**: hover "Opus · xhigh": "code to write, fix or explain; more than the rule says:
    Smart learned it from you".
16. **`/route learned`** lists it, **`/route forget <kind | all>`** forgets, **`/route learn off | on`** pauses it
    (power users; everything is reachable without them).
17. **Ctrl/⌘ K finds it**: "What Smart has learned" opens ⋯ AI setup at How hard it thinks.
18. **It follows you**: kept per AI in `data/kv/router-learn.json`, synced with the rest of Hearth's data.

## Tested
- `node dev/routerlearn-test.js` (UNIT): 45 checks: router.js's kinds, a step up after three "think harder", the top
  rung's model and effort, hysteresis (a fitting rung never moves over 400 replies; a too-weak one moves within ~30),
  half-weight signals, relax after 40 + two weeks, the probe, the trial, the 45-day lock, choosing lighter, bounds
  (chit-chat, pictures, Lab builds, Lab floors), the cache rules (no step down in a big chat; the re-read flag once),
  go-aheads, "think harder" ignoring what was learned, engines.js never reading it; plus the simulation above.
- `dev/checks/routerlearn.js` (fake engines; `sh dev/run-checks.sh routerlearn`, also in `router`): a code fix runs on
  the chat's own model at high (the fake engine reports what it got); a new message marks it fine; three "think harder"
  (one by clicking the pick) step code fixes up; the next code fix runs at xhigh with "Smart learned it from you" in its
  why; chit-chat unchanged; the one-time line in the chat; `/route learned`; ⋯ AI setup shows "code fixes → Deepest"
  under How hard it thinks; ✕ forgets it (the line says "nothing yet") and the next code fix is back on high; stored in
  kv router-learn. `appsearch` finds the row on a fresh copy (Ctrl/⌘ K → What Smart has learned).
- Also run: `unit:router-test` (39/39, unchanged), `unit:tokens-test`, `unit:cache-test`, `unit:appsearch-test`,
  `router`, `options`, `budget`.

## Risks / not done
- The signals are heuristics: "try again" after a good answer you simply want varied counts as "wanted more", and a
  plain Retry counts half. The CUSUM test needs several of them before anything moves.
- The simulation's owners and their miss rates are invented; real rates are unknown here. The thresholds were tuned on
  it (numbers above), not on real chats.
- A learned step up costs more tokens per message on that kind (the picky owner: +8 % in dollars, fewer tokens overall).
- Learning is per AI, not per chat: a director's code fixes and a plain chat's are learned separately only because they
  are different AIs.
- Astra uses the same rules; its top rung is its own model at xhigh, like "think harder" already asks.
- Find anything: "What's new" rows now lean back a little (kind weight −0.04 → −0.2) so a plain-words search
  ("cheaper") finds the place itself (Spending) before the patch note about it; "what's new: …" still finds the note first.
- Budget's "cheaper near the weekly limit" still steps down after Smart (it runs later and wins), as before.

## For the patch notes
- Smart now learns from you. When you keep asking it to think harder on one kind of message (code fixes, quick
  questions, Lab builds…), it starts picking higher for that kind by itself; when you keep choosing a lighter model, it
  goes lighter.
- It watches what you already do: "think harder" on a reply, switching to a stronger model, "that's wrong / try
  again", stopping a reply early, fixing the Lab right after the director. All on your computer, no tokens.
- It's careful: it changes a kind of message only after it sees the same thing several times, by one step at most, and
  it tries lighter picks only after a long run of good replies, taking them back quickly if they fall short.
- See what it learned in ⋯ AI setup → How hard it thinks ("Smart has learned: code fixes → Deepest"); ✕ forgets it.
- The first time it changes something, one calm line in the chat says what and why.
- In a long chat, a learned step up tells you once that the next message re-reads the chat without the prompt cache.
- In a six-week simulation, a picky owner got half as many answers that fell short; an owner the rules aimed too high
  for spent about a fifth less.
