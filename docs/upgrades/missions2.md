# Missions, finished (round 26, missions2)

◎ by the chat box (and the top of ⋯) picks what your next message becomes. This round makes the result of a mission
look the same whoever answers, adds four missions Hearth can really do, and keeps the mission on your message.
Files: `missions.js`, new `missions.css`; small hooks in `astra.js` (collabEl hands a mission's card to missions.js)
and `chat-live.js` (helper rows); one `<link>` in `index.html`. Check: `dev/checks/missions2.js`
(`sh dev/run-checks.sh missions`).

## One calm result card for multi-AI missions
1. 🐝 Swarm shows as one calm card: who took part, the chair's final answer, the rest folded.
2. ⚔ Debate uses the same card; its rounds sit folded under "How they got there · N answers · N rounds".
3. 👥 Side by side uses the same card: both answers to choose from, each with **Use this one**.
4. ⌨ Pair on code uses the same card: the last improved version up front, the drafts folded.
5. 📢 Ask everyone now gathers the answers in one card in the chat you asked from (each AI still answers in its own chat).
6. Small avatars of everyone who took part (agent icon, persona initial for persona seats), overlapping in the card's head.
7. Live status on each avatar: thinking (pulsing amber), writing the final answer, done (green), failed (red), waiting, didn't answer.
8. While it runs, one quiet line under the head: "Claude thinking… · Astra done · Astra Skeptic waiting".
9. The final answer is up front, plain and roomy (no tinted box, no colored bars).
10. Everything else is folded ("How they got there" / "Watch them work" / "The other answer"); the fold remembers being opened.
11. "Use this one" keeps an answer: it moves up front, the other folds away, your next message continues from it.
12. Merge (and Judge / Differences) stay one click away under side-by-side answers.
13. The tokens everyone used, small in the head (with the time when it took over a second).
14. Ask everyone: the first to answer is up front; the others are rows (avatar, name, first line), open one for its full answer.
15. Ask everyone: **Use this one** on any answer (your next message here continues from it) and **Open its chat**.
16. Ask everyone: an AI that couldn't be sent to (still answering) shows as failed with the reason.
17. The calm look drops the collaboration card's flowing color bar: the live state is in the avatars.

## New missions (only what Hearth can do)
18. 📝 **Plan first**: it writes a short numbered plan and stops.
19. Under the plan: **▶ Go ahead** (it does the work), **✎ Change it** (puts "Change the plan: " in the box), **Not now**; the bar leaves once answered.
20. 🌐 **Research** in an Astra chat: live web search for this one message, answer with numbered sources.
21. 🌐 **Research** from a Claude chat: Astra answers that message with web search on, as a researcher, in the result card.
22. 🎓 **Explain like a teacher**: step by step, simple examples, plain words, one check question at the end.
23. 👁 **Second opinion only**: only the other AI answers (it sees this chat's last reply); this chat's AI stays quiet, and its next message knows the answer.
24. The picker shows the eight usual missions; Jam, Pair on code, Explain like a teacher, Second opinion only and Ask everyone sit under **More** (open by itself when one of them is picked).
25. A mission that can't run here (no Astra / no Claude agent) is greyed with the reason instead of failing later.
26. A 📌 mission that can no longer run sends your message normally and says why.

## Your message remembers its mission
27. A small chip on your bubble: "🐝 Swarm", "📝 Plan first"…, so you can see later how it was asked.
28. **↻** on the chip runs the same message again with the same mission.
29. The chip's tooltip says exactly what the mission added to the words the AI received (Plan first, Teacher, Research only; nothing is added silently, your text stays as written).
30. Ask everyone: the message in each AI's own chat carries the 📢 chip too.

## Helper agents under the reply (Split it up)
31. Each helper agent is one tidy row: a status pip, what it does, what it's on now (or its result), its time and steps.
32. The live list sits under the reply text, next to the status line, instead of above it.
33. A finished reply keeps "🤖 Deployed N agents · …" under its text; open it for the same rows with each helper's result (failed ones in red).
34. Pips pulse only while a helper runs, and stay still with reduced motion / calm motion.
