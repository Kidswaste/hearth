# directorswitch: switch AIs in the Three Director (round 114)

The owner asked: "add an option to switch AIs in the three director so i can go from one chat to the other".

## What already existed (and is reused, not rebuilt)
- **An in-place engine switch, hidden behind commands**: `/director-engine claude|astra` (astra.js's version; director-cmds.js
  has a twin that is skipped because the name is taken), the ⚇ menu's handoff for a director, and "Ask Astra instead" on
  a busy line (offline.js). All three flip the **whole director** to the other engine (`Astra.switchDirector`): same
  chat, the task state handed over. There was one chat, never two to go between, and no visible control.
- **A chat with its own engine** (`chat.engine`, round 10's comp parts): astra.js `beforeSend` sends that chat to that
  engine, so a Claude chat and an Astra chat of the same director can run side by side, each with its own session.
- **Chats linked to a scene** (chat-scenes.js): the first chat owns the scene, another chat can be linked as a guest
  (round 72). A director chat's Lab calls go to its linked scene, on screen or backstage.
- **The scene line** (labchat92, `LabChatLink.sceneLine`): `[Lab scene "…" · layers, bottom first (* = selected): …]`.
- **The hand-over brief** (handoff.js `startCopy` + `show`, the path of `/handoff` and "Ask Astra instead").
- **Sign-in** (round 111, `EngineHealth.signIn`): one answer with its plain text (a window opened / the link / not installed).
- **Busy / unread per chat** (`Native.isBusy`, `H.unreadChats`).

The switcher puts these together behind one visible button. The in-place switch is unchanged.

## Where to click
- **In the Three.js Lab, the director's chat on the right: the "◆ Claude ▾" pill at the left of its thin top strip.**
  It names the AI you are talking to in this chat. Its menu, under "Talk about "<scene>" with…":
  - **✳ Claude** and **✧ Astra**: one click goes to that AI's latest chat about this scene. When it has none yet, it asks
    once: **Continue this conversation** (the other AI gets a short brief of this chat with your next message) or
    **Fresh chat** (a new chat about this scene; nothing of this chat is sent).
  - Under each AI: its recent chats about this scene (up to 4), marked **● new reply** or **◌ working…**, and the two
    rows **↳ Continue this conversation with …** and **↳ Fresh chat with …**.
  - **Other AIs with the Lab's tools** (a Claude or Astra agent given the Lab's tools, not docked): their chat about
    this scene, or a new one linked to it (its draft starts with the scene line). It opens in their own chat view.
  - **Switch AI · Alt+Shift+A** at the bottom.
- The pill has a **dot**: purple and pulsing while another chat about this scene is still working, gold when one has a
  reply you haven't read. Its tooltip names which.
- **Alt+Shift+A** (⌥⇧A on a Mac) in the Lab: the next AI, the same way as a click on it. In the keys sheet under
  "Director dock". **Ctrl/⌘+K → "Director: switch AI"** opens the switcher. The dock's ✦ menu has **Switch AI…**.
- An AI that is **signed out** shows "signed out: sign in" in the menu; **not installed** shows "not installed". Picking
  it calls round 111's sign-in and says what happened in the director's chat ("Astra (Codex) isn't signed in, so the
  director stayed with Claude. A PowerShell window opened… Then pick Astra again"), with **Open the doctor**. Nothing
  else changes.

## What a switch does
- **Fresh chat**: a new chat of the Three Director, on that AI (`chat.engine` when it differs from the director's own),
  titled "<scene> · Astra", linked to this scene (as a guest when another chat owns it). Its Lab calls reach this scene.
  The scene line is put in the chat box; the owner sends it or not. Nothing goes to any AI until he sends. Picking
  Fresh again while that chat is still empty opens the same one (no pile of empty chats).
- **Continue this conversation**: the same, plus `Handoff.startCopy`: the chat starts with the brief shown to you, the
  line "Handed to Astra with a short brief (≈ … instead of ≈ …) · Send the whole chat instead", and the brief rides in
  the first message you send there, once (handoff.js / native.js `withContext`, as for /handoff).
- **Going back**: opens the other chat as it was. Both chats keep their messages, their sessions and their AI.

## Files
- New `director-switch.js` + `director-switch.css` (lazy group `directordock`, with director-dock.js: nothing new on the
  first screen except the lines below). `node dev/lazy-manifest.js` regenerated: the group now lists 1 action and 1 key.
- `director-dock.js`: mounts the pill in the strip, repaints its marks, **Switch AI…** in the ✦ menu. Also a fix: its
  Alt+Shift+Z / Y / D did nothing while the docked chat had the focus (H.activeId is then the director's id, not
  `tool:three`); they now read the surface.
- `chat-scenes.js` (2 lines): the scene tag's avatar follows a chat's own AI; the tag no longer says "other chat" for
  the director's second chat on the same scene.
- `keys-ui.js` (1 entry): the Hold-Ctrl key badge on the pill.
- `lazy-data.js` / `lazy-meta.js` (generated), `dev/run-checks.js` (group `directorswitch`), `dev/checks/directorswitch.js`.
- First screen: 1,694 of 1,696 KB (`unit:boot-test` passes).

## Checks
- `dev/checks/directorswitch.js` (fake engines with `seenLog`, real clicks): Claude → Astra Fresh (same scene, guest
  link, routed Lab call, draft with the scene line, nothing sent, no brief), back to Claude (messages intact), the busy
  dot and the "new reply" dot / row, Continue (brief once: first message yes, second no), Alt+Shift+A both ways, the
  keys sheet, Ctrl/⌘+K, the ✦ row, signed out and not installed (EngineHealth stubbed: no terminal opens).
- Ran: `directorswitch director-dock labchat92 labchat102 eyes112 labload94 lazy handoff unit:handoff-test
  unit:winmac-test unit:boot-test unit:lazymanifest-test`, then `release`.

## Left / notes
- The in-place paths (astra.js `/director-engine`, `Astra.switchDirector`, offline.js "Ask Astra instead") flip the
  director's own engine. A chat the switcher made for Astra keeps `chat.engine: 'codex'`, so it stays on Astra; Claude
  chats of the director (no `chat.engine`) follow the flip, as before. See "For Codex" for the one rough edge.
- Recent chats are per scene: a chat linked to another scene isn't listed (it is still in the chats list).

## For Codex
No Codex-owned file was edited. One rough edge in `astra.js` (Codex's) worth a minimal marked edit when convenient:
`/director-engine claude` typed in a switcher-made Astra chat (`chat.engine: 'codex'`, director on Claude) answers
"already runs on Claude" and the chat stays on Astra; `switchDirector` could clear or set `chat.engine` of the open
chat. offline.js's "Ask Astra instead" picks the other AI from the director's engine, not the chat's, for the same reason.

## For the creative-direction session
Nothing touched (`three-direction*`, `collab-eyes.js`, `credits*`, Swarm / manager / missions). Nothing needed.

## For the patch notes
- **Switch AIs in the Three Director.** The director's chat in the Lab now shows which AI you're talking to: "◆ Claude ▾"
  at the top. Click it to go to Astra (or back to Claude). Each AI keeps its own chat about the scene, so you can go
  back and forth and nothing is lost.
- The first time, it asks: **Continue this conversation** (the other AI gets a short summary of this chat with your next
  message) or **Fresh chat**. Both work on the same scene.
- A small dot on the button tells you when the other chat is still working or has a new reply.
- **Alt+Shift+A** switches AI from the keyboard; Ctrl/⌘+K → "Director: switch AI" works too.
- If the other AI is signed out or not installed, it says so in the chat and opens the sign-in.
