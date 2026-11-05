# askwhen125: "Which project?" only when you asked for the new chat (round 125)

Since round 116 every chat belongs to one project. When a new chat starts and no project is known, projchats.js
`onNewChat` can open the "Which project is this chat for?" window (`ask`). Since round 117 it asked only when
`navigator.userActivation.isActive`. That flag stays on for a few seconds after **any** click or key, so it was a poor
guess:
- a chat started by code a moment after an unrelated click (a tray card's Deny, a Lab button, Delete on the open chat)
  opened the window, which took the keyboard and covered what the owner was doing;
- an owner's New chat that reached `Native.newChat` after an await could have lost the flag and not ask.

## The change

`Native.newChat(agentId, opts)` now takes `{ byOwner: true }` from every place where the owner asks for a new chat,
and passes `opts` to its `newChat` hooks. `onNewChat(agentId, opts)` in projchats.js:
1. a project is known (chosen a moment ago, the Lab scene's project, the open project) → that one, no question;
2. else, projects not read carefully yet → nothing now (the chat goes to Earlier chats when it is made, as before);
3. else `byOwner` → asks;
4. else → no window; `place()` puts the chat in **Earlier chats** with its note when it is first saved.

The `navigator.userActivation` check is gone. Every rule from rounds 116, 118 and 124 stands: one project per chat,
Earlier chats as the fallback, a read failure is never "empty", and chatfix124's placement on first save
(`Native.hooks.send` → `place()`) is unchanged.

## Entry points

**The owner asked (pass `{ byOwner: true }`):**

| Where | File |
|---|---|
| The project bar's ＋ New chat (no project open) | projchats.js `newChatMenu` |
| An AI's ＋ in the chats list | panel.js (group ＋) |
| An empty AI's "New chat" button in the list | panel.js |
| The chat's own ＋ New chat and its menu's ＋ New chat | native.js |
| Ctrl/⌘+N (also Keys page rows that run it) | renderer.js `handleShortcut` |
| Right-click an AI on the rail › New chat | renderer.js |
| Middle-click an AI on the rail | juice.js |
| A list group head's right-click › ＋ New chat | declutter.js |
| Home's ⋯ "New chat (in a project)…" | projects-home.js (Codex) |
| The tray's New chat with Claude | appui.js `onTray` |
| Ctrl/⌘+K "New chat with Claude" | appui.js `addAction` |
| `/new` with no first message, typed or picked by the owner (sources chat, bar, palette, key, owner, commands-page) | chat-cmds.js |
| `/astra-new` | astra.js (Codex) |
| Voice "new chat" | voice.js |

`/new <message>` sends its message at once, so no window waits on it: the open project, else Earlier chats with the
note. A `/new` run by a timer, a flow or an agent never asks.

**Code started it (never asks):**
- Lab "Ask Claude about this layer" and linked chats (tools/three-chatlink.js): the scene's project;
- the director switcher's Fresh chat (director-switch.js, through LabChatLink or its fallback): the scene's project;
- `askClaude` / `draftToClaude` (renderer.js: tools, the context menu's Ask): the open project, else Earlier chats;
- the send preview's "move to a new chat" (sendpreview.js): it carries the draft, so no window clears it;
- the blank chat after deleting the open chat (native.js `remove`) or dismissing a make (makes.js);
- jams, crews, handoffs, imports and fresh-from-summary chats don't go through `Native.newChat` (imports are placed by
  `ProjChats.imported`); the project's own question (`ask`'s pick) and `newChatIn` set the project first.

## Tests

dev/projchats116-test.js gains four cases (its fake window now records opened windows and notes, and has
`navigator.userActivation.isActive` on to stand for a click a moment ago):
- the owner's New chat with no project → asks;
- a code-started chat right after a click → no window, Earlier chats, with the note;
- a Lab-started chat (Claude, the scene of pjA on screen, no project open) → pjA, no window;
- the owner's New chat with a project open → that project, no window.

Run: `node dev/projchats116-test.js` (11 passed), `node dev/projsync118-test.js`, `node dev/projperf120-test.js`,
`node dev/boot-test.js`, and the checks access-chat, chat-new-row, aicheck, connections, projects. No dev/checks file
was changed.

## For the patch notes

- The "Which project is this chat for?" window now opens only when you start a new chat yourself (＋ New chat,
  Ctrl/⌘+N, the tray, Ctrl/⌘+K, /new) and no project is open. A chat Hearth starts on its own, even right after you
  clicked something, never pops it up: it goes to the open project, the Lab scene's project, or "Earlier chats" with
  a note.

## For Codex

Two one-line edits in Codex-owned files, both marked `// (round 125, askwhen125)`:
- projects-home.js: Home's ⋯ "New chat (in a project)…" calls `Native.newChat(a.id, { byOwner: true })`;
- astra.js: `/astra-new` calls `Native.newChat(a.id, { byOwner: true })`.

Any new "New chat" button or menu row you add should pass `{ byOwner: true }`; code that opens a chat on its own
should pass nothing.
