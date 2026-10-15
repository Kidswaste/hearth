# 💡 Answered by Hearth (round 45, localanswers): questions about Hearth answered here, for free

The owner often asks the AI about Hearth itself: "how do I export 9:16?", "where's the spending limit?", "how do I
make it move with the beat?", "what changed today?". Each was a full AI turn (≈ 760+ input tokens for a plain Claude
reply, more in a director chat with its tools). Now Hearth answers those itself, before anything is sent: a small
card above the chat box with the answer in one or two plain lines, **Show me**, and **Ask the AI anyway**. Nothing is
added to any prompt; nothing new on screen until a question comes.

## What shipped
**The card**
1. **Answered by Hearth**: a question about Hearth typed in a chat (Enter / Send) is not sent; a small card shows above the chat box instead, as wide as the box: "💡 Answered by Hearth · free · not sent" and the answer in one or two plain lines.
2. **Show me** jumps there: a Settings row (Settings opens on it, lit), an ⋯ AI setup row (its fold opened, lit: "where's the spending limit?" → Spending › Weekly limit), the Lab's own menu row run ("9:16 version" → ▦ All formats), the chat menu opened (pin, rename, export, model, delete), the board, Find anything, a mission, or the patch notes on that round. The question leaves the box: it was answered.
3. **Ask the AI anyway**: one click sends it exactly as usual. **Enter again** on the same words does the same.
4. **×** closes the card; your words stay in the box. Typing something else closes it too.
5. Not sure → no card: the message is sent as always, with no delay you'd notice (most messages are ruled out by a cheap check before anything loads).

**What it knows (0 tokens, all local)**
6. Find anything's 28 "How do I…?" answers, every ⋯ AI setup row (36) and every Settings row (33), said as "where it is: what it does".
7. Lab search's 19 Lab answers (react to the music, move a slider with the beat, camera moves, frame size, effects, save sliders, variations, render, templates, batch, fix my scene, freeze, present, tap tempo, loop, share, keys…).
8. 19 more answers written for the questions the others didn't cover in one place: a 9:16 / TikTok / Reels version (▦ All formats), render a video, many videos at once, the spending limit, pin / rename / export / delete a chat, a chat's model, attach a file, undo, search everything, the mood board, since you were away, updating, the size of everything, Claude and Astra together, shuffle sliders, before / after.
9. **"What changed today?"**, "what's new?", "patch notes?": the newest round's parts from the patch notes ("Round 43, the newest: Your work is safe everywhere, Try it first, Cost coach, Graphics card resets and 1 more"); Show me opens the notes. **"What's new in the Lab?"** (or chats, tokens, Mac / Windows): the last rounds' parts of that kind (whatsnew-core's groups).
10. Plain words, synonyms and typos, as in Find anything and Lab search ("spending limt", "chnage the personality", "vertical video for tiktok").

**Never in the way of your work**
11. **Only questions about Hearth.** It must be a short question (≤ 20 words, one line), and **every word that says what it's about must be explained by that one answer**: a work question always has words of its own ("spiral", "logo", "chapter 3", "at 1:20", "the torus") and goes straight through.
12. Never for code, file names, links, quotes, programming words (python, css, javascript, glsl, three.js…), writing / debugging verbs (write, explain, translate, debug, refactor…), "my / this code, story, chapter, essay, function, bug…", "why…" questions, or requests to the AI ("can you…", "please…").
13. A question made only of vague words ("how do I fix it?", "how do I make it better?") is never answered here.
14. **In a Lab director chat: only questions about the Lab's UI** (a slider, button, menu, key, toolbar, setting, "where is…"), and only Lab answers: "how do I make it move with the beat?" goes to the director (it's a request to build), "how do I make a slider move with the beat?" gets the card.
15. Messages with attachments, a mission (◎) or a /command are never looked at; a message typed while the AI answers waits in line as before.

**Learns from misses**
16. Pressing **Ask the AI anyway** (or Enter again) remembers that question's words: they stop triggering, on this computer, for that phrase only.
17. Kept in kv `local-answers` (≤ 300), read with its status and never saved over a file that couldn't be read (datasafe rules).
18. `/hearth-answer forget` lets them be answered again.

**Setting and ways in**
19. ⋯ AI setup › Habits › **Answer questions about Hearth itself, for free** (on by default, per AI; `agent.localAnswers = false` when off). Ctrl/⌘+K finds it ("answered by hearth", "free questions").
20. `/hearth-answer <question>`: what Hearth would answer, without sending anything (power users; the card is the main way).

**20 upgrades.**

## How it's built
- `localanswers-core.js` (`LocalAnswersCore`, pure, Node-tested): `shape(text)` (the cheap gate: length, one line, code / files / links / quotes, requests to the AI, work verbs and nouns, programming words, "why", question form or "what changed"), `build({ C, D })` (the answers indexed with the shared search core, tools/three-search-core.js, with the app's words on top of the Lab's), `answer(built, text, { director, misses })` (search on the question's content words, then `covers()`: every term explained by the answer — its own words, a phrase's meaning, a prefix or a typo; a synonym-only match counts for "all" but not for "solid", so "spending limit" can't land on "save my sliders" through save ↔ spend ↔ limit; at least one solid non-generic term; score ≥ 1.2), `news(notes, text)` (whatsnew-core's parse for "what's new in the Lab"), `keyOf(text)` (the learned-miss key).
- `localanswers.js` (`LocalAnswers`) + `localanswers.css`: `gate(agentId, text, { form, input })` (null → send; a promise → true: the card shows, false: send), the card, Show me (`AppSearch.toSettings / toAiSetup`, the Lab row run through `LabSearch`'s index or `LabSearchHook.open`, a right-click on the chat header, `WhatsNew.fullNotes` / `Updater.patchNotes`), the misses (kv with status), `/hearth-answer`, `LocalAnswers.stats`.
- Lazy group **localanswers** (after the first frame, at `offline.js`: ≈ 34 KB); the catalogs it asks (groups **searchcore** + **appsearch**, and **whatsnew** for "what changed") load the first time a question-shaped message is sent (≈ 90 ms once; then ≈ 1 ms a question). The first screen is unchanged.

## Edits outside the new files (small, additive)
- `native.js`: the composer's submit — the last "send it" lines became `go()`, and one call `LocalAnswers.gate(...)` before it (plain text, no attachments; missions and commands were already handled above).
- `options.js`: one switch in Habits (it saves the agent without the cache note: it changes no prompt).
- `appsearch-data.js`: the AI setup row for Find anything (and its check, which jumps to every row).
- `lazy-data.js` (the group + regenerated manifest), `index.html` (the group's name on the existing `lazy-at.js#…` tag after offline.js), `dev/run-checks.js` (unit test in UNIT, the check in the chat group, a `localanswers` group).

## Tests
- `node dev/localanswers-test.js` (unit, 11 tests): **40 / 40** Hearth questions answered (≥ 36 required), **0 / 40** work questions intercepted (code, writing, general knowledge, scene-specific asks like "make the orb pulse red on the snare", "the glitch stronger at 1:20", "how do I fix it?"), the owner's four examples land on the right answer (9:16 → ▦ All formats, spending limit → Weekly limit, move with the beat → Move with the music, dark mode → Match my computer), answers ≤ 2 plain lines, the gate's refusals, the director rule, learned misses, typos, "what changed" on the real patch notes, every Show me target exists, ≈ 0.6–1 ms a question.
- `dev/checks/localanswers.js` (chat group, fake engines), **20 steps**: "how do I make a 9:16 version?" → the card above the box with Show me and Ask the AI anyway, **the fake engine saw nothing** (no send hook, no message); Ask the AI anyway sends it and the fake engine answers; that question then goes straight through; a work question goes straight through; "where's the spending limit?" → Show me opens ⋯ AI setup on Weekly limit (found, lit) and empties the box; "what changed today?" → Round 43 from the notes; × keeps the words; the Habits switch is there, on, and **off → nothing intercepted**; `/hearth-answer`; forget.
- Also run: see the final report (appsearch, unit:appsearch-test, labsearch, unit:whatsnew-test, whatsnew, chatcalm, options, lazy, unit:boot-test; `node dev/datasafe-scan.js` pass).
- Screenshot looked at: the card above a new Claude chat's box with the 9:16 answer, Show me and Ask the AI anyway.

## Caveats
- It answers from catalogs: a feature that has no Settings / AI setup row, help answer or Lab answer isn't known (Find anything's and Lab search's own catalogs grow with each round; one line in `EXTRA` adds an answer).
- The Lab's Show me runs the Lab row by its exact name (e.g. "▦ All formats"); when a menu renames it, Show me opens Lab search with those words instead.
- A miss is remembered by the question's words, not its meaning: "how do I make a 9:16 version?" and "9:16 version how?" are the same; "vertical video for tiktok" is another question.
- "What changed today" means the newest patch-notes round (the notes have no per-day dates).

## For the patch notes
- **💡 Answered by Hearth**: ask a chat a question about Hearth itself ("how do I make a 9:16 version?", "where's the spending limit?", "what changed today?") and Hearth answers it right away, for free — a small card above the chat box, nothing sent.
- **Show me** takes you there: the setting lights up, the Lab opens its All formats, the chat menu opens, the patch notes open.
- **Ask the AI anyway** sends it as usual in one click (or press Enter again) — and Hearth won't answer that question again.
- It stays out of your work: code, scenes, writing, "can you…" requests and anything it isn't sure about go straight to the AI.
- In a Lab director chat it only answers questions about the Lab's buttons and menus; "make it move with the beat" still goes to the director.
- Turn it off per AI: ⋯ AI setup › Habits › Answer questions about Hearth itself, for free.
- 0 tokens: it all happens on your computer.
