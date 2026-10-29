# Round 67, stream 1: Astra and Swarm repair, After Effects beside Hearth

Plan: `docs/upgrades/round67-plan.md`. Tests: `node dev/round67-test.js`, `node dev/codex-server-test.js`,
`node dev/astra-smoke.js collab` (now also runs on Windows: set `ELECTRON` to `electron\electron.exe`).

## What changed, in plain words

1. **Council actually uses its review round.** With 2 rounds, each seat reviews the others; the chair used to
   be handed only the first answers. Now it reads the reviews too.
2. **Collaborations can see the scene.** A duo, debate, council, relay or critique started from a chat that
   owns a Lab scene gives every seat a fresh picture of *that chat's* scene and its layer list (the selected
   layer is marked). The card shows "👁 saw the scene". `/ask-astra` and `/ask-claude` do the same.
   (`collab-eyes.js`, read-only Lab calls: nothing is recorded in the time machine.)
3. **Second opinions picture the right scene.** The 👁 second opinion from a director chat shoots that chat's
   own scene, even when another one is on screen (`native.js` `screenshotFor`).
4. **Blocked Astra tools are said out loud.** When Codex refuses one of Hearth's tools, the reply now ends
   with an orange line: "Astra couldn't use the Lab tools in this reply (…), so it may not have seen or changed
   what it describes", with a **Run this director on Claude** button in director chats (`codex-server.js`
   names them on the final event as `blocked`; `native.js` shows them).
5. **Astra can be given the Lab by clicking.** Agent settings (✎ on an agent) have a new box: **Can see and
   change the Lab scene**. `/astra-tools on` on a plain Astra now gives the Lab tools too (and `off` takes
   back only what `on` gave).
6. **Astra on Windows isn't sent files it can't open.** At "Read" access, Codex's sandbox blocks every
   command on Windows, so big attachments are no longer trimmed to "the whole file is at <path>" for it
   (`attachlean.js` `canRead`).
7. **No more idle Codex helpers piling up.** Council seats, jam turns and crew helpers close their Codex
   process when their turn ends instead of idling 5 minutes each (`codex-server.js`).
8. **Swarm starts in the Lab without a partner.** ◎ → 🐝 Swarm in a Three Director chat no longer asks for an
   Astra/Claude partner; the crew panel shows the cost and a **Start 4 helpers** button (`missions.js`).
9. **After Effects works beside Hearth.** Before, a script was only "sent": Hearth never heard back, and a
   failing script left an alert in AE that held AE until someone clicked it. Now every AE script (an agent's
   `adobe_do { app: "aftereffects", action: "script" }` and **Run in After Effects** under chat code) is a
   *job*: it returns at once, a progress chip says "working in After Effects (Hearth stays free)", and a toast
   says when it finished or why it failed (errors come back as text, no AE dialog). Agents get a job id and keep
   working; `action: "job"` (with `wait: true` for up to 60 s) gives the answer. Short scripts answer within
   2.5 s in the same call. (`aemain.js` `runJob`, IPC `ae:job` / `ae:jobs` / `ae:job-done`, `adobe.js` `aeJob`,
   `jobResult`, `waitJob`, event `hearth:ae-job`.) The check for the answer runs only while a job is out
   (backing off to every 3 s, at most 30 minutes).

## Where to click

- A collaboration from a director chat: ◎ in the chat box → ⚔ Debate / 👥 Side by side / 🐝 Swarm (outside the
  Lab: council). The card's header shows **👁 saw the scene**.
- Agent settings → **Can see and change the Lab scene**.
- Chat code block in ExtendScript → **Run in After Effects**: watch the progress chip, keep working in the Lab.

## Not verified live

- A real Codex app-server refusing a Hearth tool (the fake server's `blocked` event is tested; real Codex
  versions may use other request names, which are caught by the `mcp|tool/call|elicitation` match).
- A real After Effects run of a job (the result file and wrapping are unit-tested; AE itself wasn't run).
- `canRead` on Windows with a real Astra at Read & write without its sandbox.
- The 3D gizmo's picked object is still not part of the eyes packet (only the selected layer): no API exposes it yet.

## For Codex

Minimal, additive edits to `astra.js`:
- `council()` keeps the round-2 critiques (`notes`) and passes them to `synthesize(L, latest, lead, { notes })`,
  which adds them to the chair's prompt ("Their reviews of each other"), leaving out the chair's own critique when
  its session is resumed.
- `start()` asks `CollabEyes.packet(chat.id)` before running the mode: its text joins the task, its picture joins
  `images`, `m.eyes` holds the scene name (shown as "👁 saw the scene" in `collabEl`).
- The `/ask-astra` / `/ask-claude` commands add the same packet (`picture: false` when `--shot` already attaches one).
- (Oct 29 fix) `call()` ends a seat's turn only on `done` / `error` / `stopped`. Since the app-server transport sends
  `codexTurn` at `turn/started` (Oct 15, steering), every Astra seat ended there, about 0.6 s in, as "No answer", and
  her real reply was dropped (Claude never got a relay's draft either). `jam.js` had the same check. The test copy's
  `--fake-engines` Astra uses the exec transport, which never sends it; `node dev/collab-appserver-smoke.js` runs a
  relay over the app-server fake (`dev/fake-codex-server.js`).
