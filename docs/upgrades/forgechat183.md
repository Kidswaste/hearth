# forgechat183: the chat back in the Forgeheart window (round 183)

The owner's ask: "add back the chat to the Forgeheart window and make sure it's fully integrated to the game and has a
good understanding of what forgeheart is when prompted."

## What had happened
Nothing was deleted. The live game with a chat beside it was the "Forge Debug" agent's own screen (game left, chat
right). When the rail became Projects + shortcuts + Chats (commit 131c11ae), the Forgeheart shortcut opened the
Forgeheart *tool* (dashboard, builds, docs…), which never had a chat; Forge Debug was only reachable from the Chats
bar. The tool's "💬 Forgeheart chat" button opened a new chat with the main Claude, in another screen, with the brief
pasted in: no game tools, no game.

## Shipped
1. **The chat is docked in the Forgeheart window.** The agent that drives the live game (`companion: 'forge-game'`,
   native) gets `dock: 'forgeheart'` when settings are applied (`renderer.js` `apply`; saved a few seconds later), so
   the existing tool dock shows its chat on the right, with the 👾 Spawn 20 / 🛡 God mode chips, the activity strip
   and the 💬 show / hide button. It is no longer a separate chat in the Chats bar; its past chats are in the dock.
   No such agent: "💬 Forgeheart chat" makes a Forge Director (`Forge.ensureAgent`). The Manager's "Forge Debug"
   preset is docked from the start.
2. **▶ Live game is a tab of the window** (`tools/forge.js` `liveTab` → `ForgeGame.mount`): the debug game the
   `forge_*` tools drive, with its toolbar, beside the chat.
3. **A tool call brings the game up.** A `forge_*` call while the game isn't mounted or still loading opens ▶ Live
   game and waits for it (`tools/forge-game.js` `handleTool`), instead of answering "still loading".
4. **The chat knows the game.** `Forge.knowledge()` builds (≤ 2600 characters): what Forgeheart is to this chat, the
   owner's brief (kv `forge-brief`, ✎ on the Dashboard), the project folder and main build, and the names of the
   design notes in it. It rides along with every message of an agent that has the game's tools (`options.gameBrief` →
   the `gamebrief` prompt part in `engines.js`, right after the game guide; never lean / crew runs). Rebuilt when the
   brief is saved, else every five minutes.
5. **`forge_docs`**: the design notes themselves. No args: the list (name, date, size) with the brief; `name` reads
   one (part of the name is enough; 12,000 characters at a time, `offset` for the next part); `find` searches every
   note. The guide tells the AI to read the notes before answering a design or history question.
6. **What the game is doing right now, with each message.** A compose hook (`tools/forge.js` `nowLine`) adds one line
   to what the docked Forge chat is sent (not to the bubble): stage, gold, HP, DPS, enemies by type, boss, the debug
   switches, and the tab (and note) the owner is on. Only while the game is up; at most 0.7 s is waited.
7. **✦ Digest my notes** (Dashboard › What the chat knows): one AI call reads the notes (newest first, up to 90,000
   characters in all) and writes a digest of the game (≤ 1,800 characters: what it is, its systems with their real
   names and numbers, where it stands, the owner's vocabulary). Kept in kv `forge-digest`, carried by `knowledge()`
   after the brief (`KNOW_MAX` 4200, `GAME_BRIEF_MAX` 4300), readable and editable ("Read it"). Never by itself.
8. Three more quick chips in the dock: 📊 Status, 📸 Look at it, 📚 My notes (`director-dock.js`).
9. "Ask Claude about this" on a doc, a task or the balance table now lands in the docked chat's box.

## Where it lives
- `renderer.js` (`apply`), `manager.js` (preset), `tools/forge.js` (`forgeAgent`, `ensureAgent`, `forgeChat`,
  `knowledge`, `docsTool`, `liveTab`, `showLive`), `tools/forge-game.js` (`handleTool`), `mcp/forge-game-mcp.js`
  (`forge_docs`, the guide line), `engines.js` (`gamebrief`, `GAME_BRIEF_MAX`), `features.css` (`.forge-live`).

## Checks
- `node dev/forgechat-test.js` (unit): the prompt part and the tool.
- `node dev/smoke.js --fake-engines --eval "window.__fakeGame='<abs>/dev/fake-forgeheart.html'" --script
  dev/checks/forgechat183.js` (silent): docked, ▶ Live game, a tool call opens the game, forge_docs, the knowledge.
- `dev/forge-checks.js` (the /forge-* commands) still passes.
- Budgets raised for the owner-asked tool: promptdiet `forge` 1195 → 1275, tokens `forge` 1295 → 1375, `gameTools`
  515 → 580.

## Not done / not verified
- Tried once against the real build and the real notes folder, in a throwaway copy of the app (read-only): the game
  loaded in ▶ Live game (3 s), `forge_status`, `forge_debug {start}` and `forge_spawn` (20 foes) worked, `forge_docs`
  listed the 34 notes, read one and searched them, and the knowledge came to 1,841 characters with every note's name.
  Not tried in the owner's own running app.
- No digest was made of the real notes (it is the owner's click: one larger AI call). The check used the stand-in AI.
- No real AI conversation was run: whether the answers read as "knowing Forgeheart" is unjudged.
- Astra also has the game's tools in the owner's settings: it gets the game brief too once the Forgeheart window has
  been opened in the session (the brief is built by that window's code).
- The old game-beside-chat screen's code is still in `renderer.js` (unused while the agent is docked).
- macOS not checked.
