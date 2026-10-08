# Scenes stream (round 4): one scene per chat

You asked: "make the scene unique per chat, so that changing chats also changes the scene and makes it distinct
which is working for which." Now every Three Director chat owns its own sketch, and you can always tell which chat
(and which agent) a scene belongs to. There's nothing to set up and no new setting: it just follows the chat you
open. Four `/scene` commands exist for the rare times you want to steer it by hand.

## How it behaves
1. **Each director chat owns a scene.** A chat's scene is a normal Lab sketch: its layers, sliders, looks, song link and frame size all come with it.
2. **Switching chats switches the scene.** Click a chat in the panel, or switch in the dock, and the Lab opens that chat's sketch. The one you leave is saved first. Unsaved slider moves get the usual "Save them" toast.
3. **A new chat starts fresh.** "＋ New chat" opens a calm starter scene: a slow wireframe shape in dust on a soft gradient, with Tint / Drift / Music breath sliders. It keeps your current frame size.
4. **The starter is named after the chat.** It takes the chat's title when you send the first message and turns to the chat's color.
5. **The scene's name follows the chat's name.** When the chat is renamed (by you or by `/auto-title`), its sketch is renamed too, unless you renamed the sketch yourself.
6. **No pile of empty sketches.** Clicking "New chat" again and again reuses the same untouched starter.
7. **Your existing chats and sketches are linked as you use them.** Nothing is migrated and nothing is lost. An older chat takes the sketch on screen the first time you send a message in it. If that sketch already belongs to another chat, the older chat gets its own copy (with its song, frame size and looks).
8. **A sketch you open yourself becomes this chat's when you talk about it.** Pick a sketch from "Your sketches" (or make one from a template) and send a message: the chat adopts it. A toast says so and offers Undo, and the chat's previous sketch stays in Your sketches.
9. **Opening another chat's sketch offers to take you there.** If you pick a sketch that belongs to another chat, it opens with a toast: "… is the scene of the chat …" and a **Go to that chat** button. A sketch that belongs to no chat just opens.
10. **Talking in a chat brings its own scene back.** If another chat's scene is on screen when you send a message, the Lab goes back to this chat's scene first.
11. **The app starts on the right chat.** The dock opens the chat that owns the sketch on screen, instead of an empty "New chat".

## Telling them apart
12. **Each chat has a color and a mark.** The color comes from the Forgeheart palette (gold, ember, violet, rose, sky, mint, lime, ice) and the mark is a glyph (◆ ▲ ● ■ ★ ✦ ⬢ ✚ ❖ ✿ ♥ ♣). Both are picked from the chat's id and then kept. A new chat never takes the color or mark of that director's recent chats.
13. **Chat rows** show the chat's mark in its color, with a thin edge in that color (stronger on the open chat).
14. **The dock header** shows the chat's mark next to its title, with a thin line in its color across the top.
15. **The Lab preview** has a thin frame in the color of the chat that owns the scene.
16. **The preview tag** sits in the bottom-left corner of the preview. It shows the chat's mark and title and the agent working on the scene: ✳ Claude or A Astra, or both during a jam.
17. **The agent glows while it works.** The avatar on the tag and the mark in the dock header pulse while that chat's director is working on the scene. Calm motion (`/motion calm`) turns the pulse off.
18. **Another chat's scene is marked "other chat".** If the scene on screen isn't the dock chat's, the tag has a dashed border and says "other chat". Click it to go to that chat. On your own chat's scene, a click shows `/scene`.
19. **Background work shows on the chat list.** A director chat that's working while you look at another chat has a small dot in its own color on its row.
20. **"Your sketches" shows the marks too.** The sketch picker and the sketch browser show the owning chat's mark next to each sketch name.
21. **The dock's activity strip follows the chat.** The director's tool calls show under the chat that made them, so another chat's work doesn't show up under yours.

## Directors work on their own scene
22. **Calls go to the right scene.** Every director tool call now carries the chat it came from: the engine run passes the chat to the hub's tool servers, which pass it back with each call. The Lab sends the call to that chat's sketch.
23. **Background chats work backstage.** If a chat's scene isn't on screen (you switched to another chat while it works), its calls run in a hidden second Lab sandbox. Edits, set_code, layer changes, add or remove layer, screenshots, eval, console / errors / fps and frame size all work there. The edits are saved into that chat's sketch, and you see them when you open the chat. The director is told it's working backstage: no music (the demo beat plays) and no references.
24. **Tools that need the scene on screen** (sliders, looks, the timeline, notes, music control, input…) answer a background director with a short note: what still works backstage, and that it can ask you to open the chat. Nothing is queued, nothing waits for a timeout, and nothing touches the scene you're looking at.
25. **A director never edits another chat's scene.** Switching chats waits until a running edit on the scene on screen has finished. A multi-layer edit stops if the scene on screen changes halfway through.
26. **Undo (↶, Alt+Shift+Z, `/undo-edit`) works on background edits too.** It fixes that chat's own sketch without switching the Lab away from what you're looking at.
27. **A new sketch made by a director becomes its chat's scene.** That's the `three_new_sketch` tool. From a background chat, the new sketch isn't opened over yours.
28. **Two background chats take turns.** If two chats work at once, the backstage handles one call at a time. It blanks itself after a minute with nothing to do, so an idle app still runs nothing.

## Video Director
29. **Each Video Director chat comes back to its video.** A chat remembers the render that was open when you used it, and opening the chat opens that video again. Video Director chats get the same colors and marks on their rows and in the dock header.

## Commands (power use only)
30. **`/scene`** shows which sketch this chat owns: its color, layers, frame size, song, and whether it's on screen or backstage.
31. **`/scene link`** makes the sketch on screen this chat's scene. If it belonged to another chat, that chat gets its own scene the next time you use it.
32. **`/scene new`** gives this chat a fresh starter scene in its color.
33. **`/scene unlink`** makes this chat let go of its scene. The sketch stays in Your sketches.

## For the lead (technical)
- `engines.js` sets `HUB_CHAT_ID` for director runs and writes their MCP config to `data/mcp-runs/<agent>-<chat>.json`, removed when the run ends. `mcp/common.js` adds `hubChatId` to every hub call. `bridge.js` strips it, logs it as `entry.chatId` and passes `{ chatId }` as a third argument to handlers. `HubBridge.call(tool, args, { chatId })` does the same for tests.
- `tools/three.js`: `api.scenes` (the sketches as data), the `hearth:sketch` and `hearth:lab-ready` events, routing in `handleTool`, `ThreeLab.idle()`. `ThreeLab._sandbox` / `_util` are for the backstage. `tools/three-backstage.js` is the hidden sandbox plus a director API with the shape `tools/three-director.js` expects.
- `chat-scenes.js` holds the links, identities, following the chat, the tag / rows / dock marks and `/scene`. Its data is in `data/kv/chat-scenes.json`. `chat-scenes.css` holds the styles.
- Small hooks in other streams' files: `Native.hooks.newChat` (native.js), `Panel.hooks.row` / `.render` (panel.js), the chat filter on the dock strip (director-dock.js), a `sketchId` guard in batch edits and background-aware undo (three-director.js).
- For the jam stream: call `ChatScenes.setWorkers(chatId, ['claude', 'codex'])` while a jam works on a chat's scene, and `null` when it ends. The tag also checks `window.Jam.activeFor(chatId)` if that exists.
- Test: `node dev/smoke.js --fake-engines --script dev/checks/scenes.js --check-timeout 300000`.
