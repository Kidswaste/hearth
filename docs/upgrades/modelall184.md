# modelall184: every Claude chat on one model (round 184)

The owner's ask (17 Nov 2026): "could you update all my current chats to fable 5.2 within the engine?"

## How a chat picks its model
`options.model || agent.model` (`engines.js`): a chat's own `chat.model` (the ⋯ menu, `/model`), else its agent's
`model` in the settings, else the engine's default. The owner's Claude agents were all on `claude-opus-5-5`.

## Shipped
- `ChatCmds.modelAll(model, { engine = 'claude' })` (`chat-cmds.js`): every native agent of the engine gets the model
  as its default (saved with the settings), and every chat of those agents that had its own model is set back to
  "the agent's default" (`Native.setModelOf(chatId, '')`, new in `native.js`: loaded, changed, remembered, like rename
  and pin). Chats without their own model already follow the agent. Other engines (Astra) are not touched.
- What they used before is kept in kv `model-sweep` (`{ at, model, engine, agents: { id: old }, chats: { id: old } }`);
  `ChatCmds.modelUndo()` puts it back. A second run with the same model changes nothing and keeps the undo.
- `/model-all <model | undo>` (area Agents).
- **Once, for the owner's ask**: `ChatCmds.modelOnce()` runs `modelAll('claude-fable-5-2')` the first time this version
  starts with a data folder (8 s after the chat commands load, once the chat list is in), marks the settings
  (`modelSweep: 'fable-5-2'`) and never runs again. It shows a note with Undo. It does not run under the checks.

## Smart routing kept the model from applying (found the same day)
The owner asked the Forge chat "are you claude fable?" after the switch and was told Sonnet. The engine's own
transcript confirmed `claude-sonnet-5-5` answered: `router.js` (Smart: on for an agent whose effort is unset or
medium) sends chat / quick messages to `haiku` / `sonnet` unless the chat pins its own model.
- `agent.keepModel` (new): `Router.pickFor` treats the agent's model as pinned, so Smart picks the effort only.
- `modelAll` sets it on the engine's agents (kept in the undo store as `keep`); `modelUndo` clears it.
- `modelOnce` marks `modelSweep: 'fable-5-2-keep'`. Where the first version already ran (`'fable-5-2'`), it only
  adds `keepModel` to Claude agents still on `claude-fable-5-2` and says so in a note.
- `/keep-model [on | off]` for one AI.

## Checks
- `node dev/smoke.js --fake-engines --script dev/checks/modelall184.js` (silent): the agents' default, a chat with its
  own model, a plain chat, Astra left alone, the undo store, a second run, undo, the one-time switch and its mark.

## Not done / not verified
- Not run on the owner's real chats: it happens when they next start Hearth. How many chats had their own model is
  not known here (the note says).
- No message was sent on Fable 5.2 through the real engine: that the owner's Claude Code accepts
  `claude-fable-5-2` is assumed from its accepting `claude-opus-5-5` the same way.
- On the owner's second computer the same one-time switch runs when that copy updates (its mark is in that
  computer's own settings).
- A chat whose engine differs from its agent's is not handled (the chat list doesn't carry that).
