# chatsafe55 (round 55): a chat never moves to another AI, and never disappears

The owner after round 54: "the Lab chats disappeared". The Three Director went missing from config.json during an update
(labchats54 fixed that cause). What made it worse was round 52's chatkeep rule: a chat whose AI was missing showed under
another AI (the Lab's chats under Claude) and **opening it there moved it to Claude for good** (`native.js` rewrote the
chat's `agentId`; 🛟 Recover… did the same for "hidden" chats). Both are gone. A chat keeps its agent id, always.

## What changed
1. **A chat whose AI is missing shows under its own AI's name** in the chats list: "Three Director — not set up"
   (removed, renamed, settings lost), "… — turned off" (switched off), "… — retired" (the old Video Director). Its name
   comes from the settings, else from the AIs Hearth has seen (remembered), else from its id. Only a chat that names no
   AI at all goes under Claude, as before. (`panel.js` homeOf / whoWas / missing)
2. **One plain button under that name: "Bring back Three Director"** ("Turn … back on" for one switched off). It looks,
   in order: is it only turned off (turned on again) → an update's stash (`updatermain.agentAside`, any Hearth update
   stash, read only) → everywhere 🛟 Recover… looks (automatic copies of the settings, sync, the cloud folder,
   backups) → nowhere: it is set up again **under the same id** (a director: the one /director-setup makes), so its chats
   are simply its own again. (`chatsafemain.js`, IPC `chatsafe:bring`; `chatsafe.js` bringBack)
3. **The Lab keeps its chat panel** when the Three Director is missing but its chats exist: the dock shows them
   read-only ("💬 Three Director — not set up" on the toolbar), with Bring back on top and Continue with Claude… at the
   bottom, instead of no panel. (`tools.js` syncDock → `ChatSafe.mountDock`)
4. **Opening such a chat never reassigns it**: from the chats list a Lab chat opens read-only in the Lab's panel, any
   other in a reader. The old way in (a view put back after a reload, a notification, `Native.open` under another AI)
   shows nothing in that AI's view and moves nothing; a click there opens the reader. (`native.js` render)
5. **Nothing is sent into it by another AI**: `Native.send` refuses with "This chat waits for Three Director: bring it
   back to go on (or Continue with Claude… in its menu)".
6. **"Continue with Claude…"** (right-click the chat, the reader, the Lab's panel) is the only way on with another AI:
   it asks first, then a copy goes on with Claude; the original stays with its own AI, untouched.
7. **🛟 Recover… no longer moves chats either**: a chat waiting for its AI is listed with its own AI ("waiting for its
   AI: it is turned off / it was removed, a copy of it is here"); bringing it back brings its AI back (turned on, or
   its definition from the copy) and doesn't write the chat file. One with no copy of its AI anywhere isn't offered
   (the chats list has Bring back for it).
8. The Lab's dock open / closed choice is no longer forgotten while no AI is docked (it was saved as "closed").
9. `/bring-back [AI]` does the same as the button (for chats and power use).
10. Datasafe rules hold: settings that can't be read change nothing ("try again in a moment"), never "no agents".

## Checks
- `dev/checks/chatsafe55.js` (smoke, fake engines, throwaway copy): two Three Director chats and a Claude chat; the
  director removed from the throwaway config.json; the chats list (its own name, both chats, the button, the Claude chat
  under Claude), the Lab (its read-only chat panel with both chats), a director chat opened from the list (read-only in
  the Lab), opened under Claude (nothing shown, nothing moved), a send from Claude refused, Continue with Claude… (asked,
  a copy), Bring back (the same id, docked again, its chats its own). After every step: every chat's agent id on disk
  unchanged and every chat in the list. 29/29 pass.
- `dev/chatkeep-test.js` (unit) now also checks Recover keeps a chat's AI and brings the AI back from a copy, and
  `chatsafemain.bring`: unreadable settings change nothing, turned off → on, already there, from a copy, nowhere, a
  bad id. `dev/checks/chatkeep.js` step 7 now expects the turned-off director's chat under its own name.
- `node dev/run-checks.js chatsafe55`: chatsafe55, chatkeep, unit:chatkeep-test, director-dock, scenes, lazy,
  unit:boot-test, unit:datasafe-scan.

## Files
New: `chatsafe.js`, `chatsafe.css` (lazy group `chatsafe`, tier use), `chatsafemain.js`, `dev/checks/chatsafe55.js`.
Edited: `panel.js`, `native.js` (render, send), `tools.js` (syncDock), `datasafemain.js` (hidden chats, agent ids on
rows), `updatermain.js` (agentAside, additive), `main.js` / `preload.js` (one line each), `lazy-data.js` (+ its `lazy-at.js#chatsafe` tag in `index.html`),
`dev/chatkeep-test.js`, `dev/checks/chatkeep.js`, `dev/run-checks.js`.

## For the patch notes
- **Your chats stay with their AI, whatever happens.** If an AI goes missing (an update, a settings mix-up) or you turn
  it off, its chats stay in your list under its own name, like "Three Director — not set up". They no longer slip under
  Claude, and opening one never moves it there.
- **One button brings it back**: "Bring back Three Director" under those chats. Hearth finds it where it was set aside
  (an update, an automatic copy, a backup) or sets it up again, and its chats are simply its own again.
- **The Lab keeps its chat panel** while the Three Director is away: its chats are there to read, with the same button.
- Want to go on right away? Right-click the chat → **Continue with Claude…**: Hearth asks first, then a copy goes on with
  Claude and the original stays with its own AI.
