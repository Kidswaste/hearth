# Lean handoffs (round 42, handoff): a short brief instead of the whole chat

When work moves from one AI to the other (you continue a chat with Astra, `/handoff`, "Ask Astra instead" on a busy
line or a usage limit, a second opinion), the receiving AI has no session of that chat, so it reads what Hearth sends
it at full price, with no prompt cache on its side. Before this round that was either the chat itself (the newest
24k characters: a long chat lost its goal and still cost ≈ 6k tokens) or a handful of clipped lines (the goal, the
decisions and most of the last reply lost). Now it is a **short brief made on this computer, for free**: the goal,
the decisions, the files and names, the open tasks, where you stopped, the open question, and the last exchange word
for word. The whole chat stays in Hearth, and goes along only when you ask.

## Measured (fake engines, what reached the receiving AI)
`dev/checks/handoff.js` builds a 15-exchange chat (≈ 38k tokens: a goal, decisions, four files, an open question) and
reads exactly what the fake engine was sent (the fakes' `seenLog` switch writes each run's message to
`data/kv/fake-seen.json`). Tokens ≈ characters / 4. "Before" is the same check run on the round-41 code.

| Handoff path | before | after | what it carried before → after |
|---|---:|---:|---|
| Continue with Astra (chat menu, chats list) | 6,049 | **1,225 (−80 %)** | the newest 24k characters (no goal, no early decisions) → the brief |
| `/handoff` (⚇ menu) | 854 (+ a summary turn on the chat's own model when the chat had a session) | **1,221, no extra turn** | 8 lines of 700 characters → the brief |
| Ask Astra instead (busy / usage limit) | 572 | **1,219** | 6 lines of 600 characters (goal and most of the last reply lost) → the brief |
| Second opinion (👁, Ctrl/⌘+Alt+O, `/opinion`) | 1,083 | **1,226** | the last exchange (2,000 + 4,000 characters) → the brief (goal, decisions, files + the last exchange) |
| Send the whole chat instead | — | 38,485 | every message (up to ≈ 50k tokens, the goal always kept) |

The big saving is on the path that used to send the chat itself (−80 % here, and it grows with the chat: the old path
always sent ≈ 6k, the brief stays ≈ 1–2k). The two excerpt paths (`/handoff`, Ask Astra instead) cost ≈ 0.4–0.6k more
than their old excerpts, on purpose: those excerpts dropped the goal, the decisions, the files and most of the last
reply, so the receiving AI asked again or redid work. `/handoff` also no longer spends a whole summary turn on the
chat's own (expensive) model. The second opinion grows by ≈ 140 tokens (the goal, decisions and files in front of the
same last exchange). Every brief is under ≈ 2.5k tokens even with a huge paste in the last exchange (clipped in the
middle, start and end kept). Fixed tokens per message are unchanged (`dev/tokens-test.js`); prompts stay byte-stable
(`dev/cache-test.js`): the brief rides in the message, never in the system prompt, and the same chat gives the same
brief byte for byte.

## Upgrades
### The brief
1. **Continue with… sends a brief, not the chat**: the other AI gets the goal, decisions, files, open tasks, where you
   stopped, the open question and the last exchange word for word (≈ 1.2k tokens for a 38k-token chat, was ≈ 6k and
   without the goal). Every message stays in the new chat, readable as before.
2. **`/handoff` (and ⚇ → handoff) uses the same brief**, made here: no extra summary turn on the chat's own model.
3. **"Ask Astra instead" / "Switch to Astra"** (busy, usage limit) hands the message over with the brief instead of six
   clipped lines; the new chat's first message shows the brief to you.
4. **Second opinions read the brief**: the judge knows the goal, the decisions and the files, then judges the last
   exchange (word for word, as before).
5. **A plain chat switching engine in place** (Claude ⇄ Astra in the same chat) starts the new engine from the brief.
6. **The last exchange goes word for word** (a huge paste is clipped in the middle, start and end kept).
7. **The open question** stands out: the last question the AI asked you, else your last question.
8. **Files touched** are listed by path (from the messages, what was sent and the attachments).
9. **Built for free, here** (autocompact's summary shape from the local summary); only when that one is weak (nothing
   but a goal) on a big chat does the cheapest model (Haiku · low / Luna · minimal) write the summary part, and the
   line says what it cost.
10. **Byte-stable**: the same chat gives the same brief (no dates, times or ids), in the message, never in the prompt.
11. **A lost session stays lean**: if the receiving engine loses its session later, the fallback re-sends the brief +
   what was said since, not the whole chat.
### What you see
12. **One line** in the chat: "Handed to Astra with a short brief (≈ 1.2k tokens instead of ≈ 38k)", with one button,
    **Send the whole chat instead** (× dismisses it; hover: what the brief holds).
13. **Send the whole chat instead** really does: the next message carries every message of the chat (up to ≈ 50k
    tokens, the goal always kept) in a fresh session; the line then says "Handed to Astra with the whole chat (≈ 38k
    tokens)".
14. Under a **second opinion**, the same button asks again with the whole chat, in place of the first opinion.
15. **`/handoff --whole`** sends the whole chat from the start.
### Asking for more
16. **The receiving AI can ask for an earlier detail**: an AI with the chat tools (Claude by default, Astra when given
    them) is told once, in the brief, that `chat_do {op: "earlier", query}` returns the matching earlier messages (or
    `last: N`); the tool list itself doesn't grow (the op is named only in the brief). Without the chat tools the brief
    says to ask you (and you can send the whole chat).

16 upgrades.

## Files
New: `handoff-core.js` (pure: brief, whole chat, last exchange, open question, files, the line, earlier; Node-testable),
`handoff.js` (lazy group `handoff`, tier use, after context + budget: make / attach / the line / Send the whole chat /
the cheap summary / `chat_earlier`), `dev/handoff-test.js` (unit, in UNIT), `dev/checks/handoff.js` (smoke, fake
engines; group `handoff`).
Small hooks: `native.js` (withContext reads `chat.handoff`; continueWith and secondOpinion call Handoff),
`offline.js` (switchOver), `astra.js` (`handoff()`: the brief, `--whole`), `director-task.js` (a plain chat's engine
switch), `mcp/chat-mcp.js` (`chat_do` op `earlier`, not listed), `lazy-data.js` (+ the group, manifest regenerated),
`index.html` (`handoff` added to an existing lazy-at tag: no new script), `dev/fake-common.js` / `dev/fake-codex.js`
(`seenLog` switch, `handoff_brief` read like the other context tags), `dev/run-checks.js` (UNIT + group).

## Tested
- `node dev/handoff-test.js`: 44 checks (brief contents and order, size ≤ 8 % of the chat, the last exchange word for
  word, a huge paste clipped, a one-exchange chat, files once each, byte-stable, the whole chat and its cap, when the
  cheapest model is worth it, the line, the opinion head, chat_do earlier).
- `dev/checks/handoff.js` (fake engines): Continue with, `/handoff` (no extra run), Ask Astra instead after a busy
  line, second opinion: what reached the engine is the brief (goal, files, last exchange, nothing else of the older
  replies), the line, and Send the whole chat instead overriding for the next message and for the opinion. 13/13.
- Also passing: offline, missions, missions2, swarmlean, autocompact, chatcore, astra-collab, lazy, unit: tokens-test,
  cache-test, boot-test, autocompact-test, offline-test, swarmlean-test.

## Risks / not done
- The local summary keeps the **newest six decisions** (context-core's own cap); an early decision can drop out of the
  brief. The receiving AI can ask for it (chat_do earlier) or you can send the whole chat.
- A docked director's engine switch keeps its own handover (task state + the last few messages, director-task.js): it
  was already lean and carries the scene's state, so it is unchanged.
- The cheapest-model summary only runs for a weak brief on a big chat (≥ 12k tokens of older history); its quality is
  not seen here (the fakes' summary is scripted). The Second opinion ◎ mission (missions.js) keeps its own short prompt.
- `chat_do earlier` needs the chat tools; Astra has them only when set up for them.
- `/handoff --raw` is now the same as the default (the brief is already the cheap path).

## For the patch notes
- Handing a chat to the other AI is much cheaper: Continue with, /handoff, "Ask Astra instead" and second opinions now
  send a short brief (the goal, decisions, files, the open question and your last exchange word for word) instead of
  the chat itself.
- In a long test chat (≈ 38k tokens), Continue with Astra went from about 6k tokens (and the goal was lost) to about 1.2k.
- You see one line: "Handed to Astra with a short brief (≈ 1.2k tokens instead of ≈ 38k)". Its button, "Send the whole
  chat instead", sends everything when you want it.
- /handoff no longer spends a summary turn on the expensive model; the brief is made on your computer for free.
- Under a second opinion, "Send the whole chat instead" asks again with the whole chat.
- The original chat stays exactly as it was; the receiving AI can ask for an earlier detail when it needs one.
- Caveat: the brief keeps the newest decisions; for a very long chat with an early decision that matters, send the
  whole chat.
