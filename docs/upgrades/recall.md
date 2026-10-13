# recall (round 30): "what did we decide about X?" across every chat, free

The goal: find a past decision in plain words without scrolling through chats and without spending a token. Hearth
already had word search (the chats panel filter, "Search inside messages", Home's search everything); none of them
ranked answers or told a decision from a passing mention. Recall reads every chat's messages into a small index on
the store thread and answers a question with short quotes, grouped, each one a click from the message it came from.

## How it works (and what it costs)
- The index lives on the store thread (storework.js op `recall`, recall-core.js), next to the chat files it already
  parses. One entry per message (yours, the AIs', second opinions, collab); fenced code is left out; light stemming;
  common words and question scaffolding ("what did we decide about…") are ignored.
- Ranking: BM25 × how many of the question's words a message has × recency (≈ +40 % today, fading over a month) ×
  📌 pinned chat (×1.2) × pinned / bookmarked message (×1.6) × decision phrasing ("let's go with", "we decided",
  "use X instead", "from now on", "stick with"… ×1.5) × your own message (×1.1) × the chat's title naming it.
- Never at startup: the first idle build starts ≈ 45 s after launch, one ≈ 12 ms slice per idle moment, never while
  you type / drag / scroll or while the window is hidden; when it has caught up nothing runs at all (0 ms idle cost).
  A chat saved through the store thread goes straight into the index (no re-read); a question first catches up any
  chat that changed. Nothing is written to disk (0 bytes); the index is rebuilt in idle moments after a restart.
- Measured (dev/recall-test.js, 400 chats × 60 messages = 24,000 messages, a deliberately dense vocabulary):
  built in ≈ 0.6 s of store-thread time in total (spread over idle slices), a question answered in ≈ 0.1 s, off the
  window's thread. The smoke check: 2 slices for its chats, an answer in 1 ms.

## Upgrades
### Finding it
1. **Recall**: ask "what did we decide about X?" and get answers from every chat on this computer, free, offline.
2. Answers are **short quotes** (the best sentence of the message, centred on your words), not whole messages.
3. **✓ Decisions** are grouped first, recognised by how they are phrased ("let's go with", "we decided", "use X instead"…).
4. **? Open questions** are grouped apart (questions, "not sure", "TBD", "should we…", "still need to…").
5. **Also mentioned**: the rest that fits, so nothing relevant is hidden.
6. Each quote shows its **chat, who said it (you or the AI) and the date** (hover for "3 days ago").
7. **Jump to it ↗**: opens that chat on that exact message and flashes it (double-click a quote does the same; Enter
   in the question box jumps to the best answer).
8. Ranking favours **recent** decisions, **📌 pinned chats** and **pinned / bookmarked messages**.
9. Plain-words questions: "what did we decide about…", "remind me…", "did we pick…" are understood; only the words
   that matter are searched.
10. The question box stays editable: refine the question and the answers update as you type.
11. A status line says what was searched ("4 chats (11 messages) here on this computer · free"), or that it is still
    reading your chats (it answers on what it has meanwhile).
12. At most two quotes per chat per group, so one long chat can't drown the others.

### Ways in (no command needed)
13. **The chats panel's search box**: type a question and a **🔎 Find the answer** row appears above "Search inside
    messages" (plain words keep filtering chats as before).
14. **◎ Missions › More › 🔎 Remind me what we decided**: what you type becomes the question; nothing is sent.
15. `/decided <question>` (alias `/what-did-we-decide`) for the command bar and chains (`/recall` stays /drafts').

### The optional AI sum-up
16. **✦ Ask the AI to sum these up · ≈ N tokens**: the cost is on the button before you click.
17. It sends **only the quotes shown** (with their chat and date), never whole chats, to this chat's AI as your own
    visible message, asking for what was decided, what is open, and which quote each point comes from.

### Lightweight
18. The index is built only in idle moments on the store thread, never at startup, and stops when caught up.
19. Incremental: a saved chat is swapped in on its own; deleted chats drop out.
20. The card (recall.js) loads on first use; what loads after the first screen is one small file (recall-hooks.js).

## Files
New: `recall-core.js` (index + ranking, Node and the store thread), `recall-hooks.js` (lazy group `recall`, 'soon':
the panel row, the mission, /decided, the idle build), `recall.js` (lazy group `recallui`, 'use': the card),
`recall.css`, `dev/recall-test.js` (unit), `dev/checks/recall.js` (smoke, fake engines).
Small additive edits: `storework.js` (the `recall` op + one line in `write`), `store.js` (`recall()`), `main.js` /
`preload.js` (one IPC: `chats:recall` → `hub.recall`), `lazy-data.js` (two groups + manifest), `index.html` (the
lazy-at tag), `dev/run-checks.js` (group `recall`, unit test).

Tests: `sh dev/run-checks.sh recall` (smoke + unit).

## For the patch notes
- New: ask "what did we decide about…?" and Hearth finds it in all your chats, on your computer, for free.
- Type a question in the chats panel's search box and click **🔎 Find the answer** (or pick ◎ Missions › More ›
  **Remind me what we decided**).
- Answers come as short quotes: decisions first, then open questions, then other mentions, each with its chat and date.
- **Jump to it** opens the chat right on that message.
- Pinned chats, bookmarked messages and recent decisions rank higher.
- Want a summary? **Ask the AI to sum these up** shows its token cost first and sends only the quotes, never whole chats.
- It costs nothing while you work: the search index is built quietly in idle moments, never at startup.
- Caveat: decisions are recognised by their wording ("let's go with", "we decided", "use X instead"); an unusual
  phrasing lands under "Also mentioned" instead.
