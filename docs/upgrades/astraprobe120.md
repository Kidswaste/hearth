# Round 120 · astraprobe120: one click proves Astra works like Claude on the owner's computer

Rounds 116 (astraparity116: Hearth's prompt as `developerInstructions`, with fallbacks) and 119 (datalock119: approval
policy `untrusted` on a chat over Hearth's source, answered by `datalock.js` `codexDecider`) could only be checked
against simulations: no real Codex runs here. This round gives the owner one self-check that runs them against his
real, signed-in Codex, says what happened in plain words, and hands back a report Claude can act on.

## Where
- The doctor card (`/doctor`, `/astra-doctor`, Ctrl/⌘+K → doctor): a button **Check Astra works like Claude**
  (`engine-health.js` `actionsFor`).
- Ctrl/⌘+K: **Check Astra works like Claude (asks first; a few short messages)**, and the chat command `/check-astra`.
- It runs only on click. It asks first: a few short messages to Astra, a few cents of usage at most.

## What it does (`parityprobe.js`, main process)
Each step runs in its own throwaway folder in the system temp folder (`hearth-astracheck-*`), never the owner's
projects and never Hearth's data. It uses Hearth's real plan for an Astra chat (`engines.js` `codexServerPlan`, exposed
as `engines.codexProbe`), the real `codex-server.js` `Pool` (its own instance: no chat of the owner's is touched) and the
owner's Codex with its own sign-in. Each step times out after 2 minutes.

0. **Codex found and signed in**: `engines.checkEngine('codex')` (`codex login status`). Not installed / not signed
   in / not answering → one line and the Install / Sign in (`EngineHealth.signIn`) / doctor button; nothing is sent.
   Installs open a visible window, never silently.
1. **Instructions arrive**: the agent's personality line carries a random check phrase; Astra must repeat it. The
   report names the channel used, read from what really went over the pipe: developer instructions, or legacy (with
   why: the server refused the field and Hearth retried with `threadLegacy`, Codex older than 0.60.0, or
   `HEARTH_CODEX_PROMPT=base`), and the Codex version.
2. **Its own edit tool works**: "create `<tmp>/hello.txt` with exactly this content …" with apply_patch; Hearth reads
   the file on disk.
3. **The data lock answers**: a temp folder laid out like Hearth's source (`engines.js` and `mcp/hearth-map.js` stubs,
   `data/`, `src/`). The plan must be `untrusted` with Hearth's `decide`. Astra writes `data/x.txt`, then `src/ok.txt`.
   Pass: `data/x.txt` refused and `src/ok.txt` written. Plain-word failures: the lock did not hold (data written);
   Codex never asked; or **src/ refused too**, which means Codex asks in a shape Hearth doesn't read, so edits on
   Hearth's folder would stop.
4. **Cleanup**: only folders this check made, only in the temp folder. A folder that holds anything goes to the Trash
   (`shell.trashItem`), an empty one is removed.

The pipes to the app-server are tapped (in `parityprobe.js`; `codex-server.js` is unchanged) to record:
- each `thread/start` (which instructions field, the approval policy, ok / the server's error);
- every request Codex sent to Hearth, with Hearth's answer, as a **shape**. Ids and free text become `<text N>`. The
  test folders' paths are kept relative to `<test>`, and anything that looks like a token becomes `<hidden>`;
- the `item/started` fileChange / commandExecution items (the decider reads the paths from them).

**Copy report for Claude** copies all of this as plain text: no passwords, no tokens, no file contents beyond the test
files.

## Files
- `parityprobe.js` (new, main process, loaded on first use through `main.js` `lazyIpc`), `parityprobe-ui.js` (new,
  lazy group `parityprobe`, tier `use`: the confirmation, the card, the Ctrl/⌘+K action and `/check-astra`).
- `engines.js` (shared): exports `codexProbe: { plan, devOk, min, useBin }`.
- `engine-health.js`: the doctor's button. `main.js`, `preload.js`: one line each (`parityprobe:run`, `parityprobe:step`).
- `dev/fake-codex-server.js`: `codex login status` (`FAKE_CODEX_LOGGED_OUT`), `FAKE_SERVER_VERSION`,
  `FAKE_SERVER_NO_DEV` (refuses `developerInstructions`), answers from Hearth to its own requests, and a model-like
  answer to the check's three messages (asks before each patch when the thread is `untrusted`;
  `FAKE_SERVER_APPROVAL=bare` sends approvals without the `item/started` item).
- First screen: 1,578 KB of 1,586 (the group is lazy; `index.html` names it in a `lazy-at.js` tag). The manifest lines in `lazy-data.js` / `lazy-meta.js` add a few
  hundred bytes.

## Tests
- `dev/astraprobe120-test.js` (new, in UNIT): the self-check end to end against the fake app-server, in a temp copy
  of Hearth: all pass (developer instructions, Codex 0.162.0, the request shapes in the report, the folders in a fake
  Trash); the legacy fallback (server refuses the field → retried, reported legacy); a lock that refuses src/ too
  (✗, the raw shape in the report); not signed in (one line, nothing sent). Nothing is left in the temp folder.
- Run (all passed): `unit:astraprobe120-test`, `unit:datalock119-test`, `unit:astraparity116-test`, `unit:codex-server-test`,
  `node dev/boot-test.js`, `node dev/lazy-manifest.js --check`.

Not run: a real Codex (none here). What a real app-server sends is exactly what this check is for: if step 3 fails
with "src/ refused too", the report's shapes show the fields the decider needs.

## For the patch notes
- New: **Check Astra works like Claude.** Open the doctor (Ctrl/⌘+K → doctor) and press **Check Astra works like
  Claude**, or find it in Ctrl/⌘+K. Hearth asks first, then sends Astra a few short messages (a few cents at most) and
  shows a ✓ or ✗ for each thing: Astra gets Hearth's instructions, its own edit tool works, and Hearth's lock on your
  data folder answers. It works in throwaway folders that go to the Trash afterwards, never your projects or chats.
- If something shows ✗, press **Copy report for Claude** and paste it to Claude: it says exactly what Codex sent,
  with no passwords or tokens.
- If Codex isn't installed or signed in, the check says so in one line with the button to fix it.

## For Codex
No Codex-owned file was edited. The self-check reads the app-server conversation from the pipes in `parityprobe.js`,
so `codex-server.js` is unchanged. What it relies on from Codex's side:
- `codex-server.js` `Pool.run({ …plan, decide, threadLegacy })`, `stop`, `stopAll`; chat ids starting `once-` close
  their server at the end of the turn.
- `engines.js` `codexServerPlan` returns `thread` / `threadLegacy` / `turn` with a `cwd` the check replaces with its
  temp folder, and `decide` + `approvalPolicy: 'untrusted'` for a folder that holds Hearth's source.
- If a real report shows approval requests whose files `codexDecider` can't see (src/ refused too), the fix goes in
  `datalock.js` `codexDecider` (where it reads paths) or in `Connection.items` (`item/started` kept by id), not here.
