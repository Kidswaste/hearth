# Astra workspace upgrades

Five additions to **Astra tools**, loaded only when used:

1. **Skills for next message** (`/astra-skills`): search the installed runtime's skills and select up to five. Disabled skills stay disabled. Selection is visible beside Astra tools, can be cleared, and is consumed by the next message. Retry retains the explicit selection. The backend checks name/path against the current skill catalog before sending native skill inputs. No catalog is added to ordinary prompts.
2. **Native conversation branch** (`/astra-branch`): a new Codex session retaining the original tool history, with a new Hearth chat and a link to its source. Model, reasoning and chat settings follow the branch. Existing message-level branching remains available. Files on disk are shared, not copied or reverted.
3. **Context and compaction** (`/astra-context`): shows the latest reported context input and capacity separately from account usage. Native compaction waits for its actual completion notifications, preserves the session and visible messages, and excludes competing turns. It consumes model capacity and may lose detail; nothing runs automatically.
4. **Activity and changes** (`/astra-activity`): the latest reply's command/tool steps, statuses, durations, changed paths and reported unified diff. Raw tool results, question answers and general tool arguments are not retained. Command labels may include command text. Up to 150 steps, 200k diff characters and 40 chats are kept in memory. No additional model calls; polling exists only while the panel is open.
5. **Connected resource browser** (`/astra-resources`): lists resources from the chat's own MCP connections, reads only a currently listed server/URI, and previews text safely. Adding a preview to the draft is explicit; no content is automatically sent to Astra. Text previews are capped at 64k characters; binary content is omitted. Parameterized templates are listed but require the connection's tools to resolve them.

Operations work after the idle connection expires: the saved session is resumed with Hearth's current model and permission settings. Missing sessions fail plainly rather than silently creating replacement history. Native approvals remain denied. No shell execution or additional file permissions are enabled by opening these panels. The existing max reasoning / low verbosity settings remain unchanged.

## Verification

- `node dev/codex-workspace-test.js`: live fixture protocol; native skill inputs, inventory validation, non-model catalog calls, fork isolation, permission inheritance, compaction completion/concurrency and bounded activity.
- `node dev/astra-workspace-smoke.js` with `ELECTRON` set: 16 checks in a throwaway Hearth copy through real IPC and app-server fixture; skill selection, diff, escaped resource preview, draft insertion, compaction and branching.
- Streaming suite: 12 groups. Existing capability/usage tests and prompt budgets unchanged.
- Generated lazy manifest: 921 commands, no duplicates. Boot: 1285 checks, 72 scripts / 29 stylesheets, unchanged counts and within byte budgets.
- Installed Codex 0.162.0-alpha.17.2: 7 skills (6 enabled); 51 resources from 10 connections; real native fork; real compaction of that disposable fork completed in 13.4 s, preserving its session. The original conversation was untouched.

Protocol references: [OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server), checked against the installed binary's generated schemas, including `mcpServer/resource/read`, `skills/list`, `thread/fork`, and `thread/compact/start`.

Coordination with Claude: [repository handoff issue #2](https://github.com/Kidswaste/hearth/issues/2). This batch uses `codex/astra-workspace`; Claude's unpublished Lab branch is not rewritten. Normal pushes and a final upstream fetch protect concurrent main changes. A GitHub post alone does not establish that Claude has read it.

Final integration caught Claude publishing `576d4cd` to main. That complete release was merged, preserving Lab keyframes, direct manipulation and smooth46. The generated feature index was the only conflict. Combined checks: 16 Astra UI assertions, 1295 boot checks, 10 Lab keyframe tests, 20 Lab direct-manipulation tests, and updater tests passed. Existing Astra integration UI (12), engine (27), connection (7), and Windows platform (32) checks passed too. Nine live local edits were backed up and preflighted with clean three-way merges; 137 chat/Lab/data JSON files were snapshotted separately.
