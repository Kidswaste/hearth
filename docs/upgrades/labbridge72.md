# labbridge72: chats ↔ the Three.js Lab, end to end (round 72)

The owner said collaborations with Astra "can't see the scene in three js, or can't interact with stuff they're being
given". Round 67 (the creative session's collab-eyes.js) gave collaboration seats a look at the scene. This stream
audited the other half: a **plain** Claude chat and a **plain** Astra chat (not the docked Three Director) using the
Lab's tools on a scene, with fake engines making real MCP tool calls (dev/checks/labbridge72.js).

## What the audit found
1. **Wrong scene.** A plain chat with the Lab's tools (Claude with "Three.js Lab" on, Astra after `/astra-tools on`, a
   project's chat) had no scene of its own: `ChatScenes.routeThree` only routed docked director chats. Its calls went
   to whatever scene was open, or, when one director chat was busy, to **that director's scene**. A project's chat
   edited the scene of whichever project was on screen.
2. **Lost attachments.** Astra gets attached pictures as image input with no path, so it could never put a picture the
   owner gave into the scene (`three_do references add` needs the path). A GLB / video dropped in a plain chat went
   into the references of the scene *on screen*, not the chat's scene.
3. **Backstage gaps.** A chat whose scene isn't on screen couldn't move a slider ("Sliders need the scene on screen")
   or add a reference: both failed.
4. **Slow / silent errors.** The preview reloading during a call (Run, a restart, a lost GPU) left the call waiting 6 s
   for a page that was gone, then "The sketch did not answer". A call while the Lab took over 10 s to start fell
   through to the visible scene. Links weren't awaited at startup (a call routed before they were read went to the
   scene on screen).

## Fixed
1. **Every chat works on its own scene.** chat-scenes.js `linkGuest` / `guestRoute`: a plain chat (or a project's
   chat) has a *guest* link to a scene. Its calls reach that scene, on screen or backstage, never the open one by
   accident. A guest takes the scene from nobody: two chats (e.g. the director and Astra) can work on one scene, and
   the owner chat keeps its scene, color and tag.
2. **How a chat gets its scene:** its link; else its project's scene; else, when the owner is looking at the Lab, the
   scene on screen (said in the 🔗 chip); else the call stops with a sentence ("This chat isn't linked to a Lab scene
   yet, so nothing was changed. It takes one click: 🔗 Link this chat to a scene…") and the chat shows a note with the
   **🔗 Link this chat to a scene** button.
3. **🔗 Scene chip** (new chat-scenelink.js + .css, lazy group `scenelink`, right after the first frame): over the chat
   box of every chat linked to a scene, "🔗 Scene: <name>"; on a Lab chat without one, "🔗 Link this chat to a scene".
   Click (or right-click): Open it in the Lab · Link to another scene › (the scene open in the Lab, the latest 10, a
   fresh scene) · Unlink. Redrawn only when what it shows changes.
4. **`/scene` in a plain chat**: `/scene`, `/scene link` (the scene open in the Lab), `/scene new`, `/scene unlink` work
   on the chat's guest link (they were director-only).
5. **Dropped files land in the chat's scene.** A GLB / video / sound dropped in a linked chat goes into *that* scene's
   references (on screen or not: `ThreeLab.addReference(path, { sketchId })`); in an unlinked plain chat it stays an
   attachment, and the message tells the AI `three_do references {action: "add", path}` puts it in its scene.
6. **Astra gets the paths of attached pictures** when it has the Lab's tools (one short line under the message, only
   when pictures are attached), so it can put them in the scene like Claude.
7. **Backstage sliders**: `three_sliders` on a scene that isn't on screen reads the layer's named `tweak()` controls
   from its code and writes a move into the code (saved), then runs the layer again.
8. **Backstage references**: `three_do references add / list` work on a scene that isn't on screen.
9. **Preview reload mid-call**: a call waiting on the preview page (eval, play-test input) ends at once with "The Lab
   preview reloaded while this ran… nothing was changed by it. Call it again." (≈ 0.9 s instead of 6 s).
10. **Lab still starting**: a call that waited 10 s for the Lab now says so instead of falling through; calls wait
    (≤ 5 s) for the chats' scene links to be read before routing.
11. **Model layers backstage**: the error now says what to do (open the scene from the 🔗 chip, or add the file with
    `three_do references add`).

Upgrades: 11.

## Checks
- `dev/checks/labbridge72.js` (group `labbridge72` in dev/run-checks.js): plain Claude + plain Astra, real MCP calls
  (layers, read code, sliders, add layer, edit + undo, references add of a dropped picture, screenshot) across: Lab not
  loaded yet, backstage, on screen, no scene (error in words, note, Link by click from the menu), a project's chat, a
  scene from another project linked by hand, two chats on one scene at once, the preview restarted mid-call; dropped
  GLB / video go into the chat's scene; the chip and its menu; every error the AI got is a sentence.
- dev/fake-common.js: `@@ATTACHED@@` / `@@ATTACHED2@@` in an `mcp:` line stand for the file paths the prompt lists under
  an "[Attached …]" line (what a model copies), so the fakes test that attachments reach the AI.

## Files
chat-scenes.js (guest links, routing, /scene for plain chats, ready()), chat-scenelink.js / .css (new), tools/three.js
(handleTool errors, addRef to another scene, refsOf, preview-reload drop), tools/three-backstage.js (sliders,
references), tools/three-models.js (one message), native.js (drops → the chat's scene, attachment hint), engines.js
(Astra picture paths with Lab tools), lazy-data.js (+ manifest), dev/fake-common.js, dev/run-checks.js. Not touched:
three-direction*, collab-eyes.js, credits*, Swarm / manager / missions, astra.js. collab-eyes.js benefits by itself:
a plain chat's guest link counts as "the chat's scene" for its collaboration seats.

## Left / risks
- `three_model add` and other "made in the scene shown" helpers (materials, physics) still need the scene on screen;
  references + code work backstage.
- Auto-linking to the scene on screen happens only when the Lab surface is the one shown; a grid layout counts if the
  Lab's surface is the active one.

## For the patch notes
- **Claude and Astra chats now always work on the right Lab scene.** A chat that isn't the Three Director used to change
  whatever scene happened to be open (or the Director's scene). Now each chat works on its own linked scene, even when
  you're looking at another one, and two chats can work on the same scene together.
- **See which scene a chat works on.** Chats linked to a scene show "🔗 Scene: name" just above the message box. Click
  it to open the scene, switch to another scene, start a fresh one, or unlink.
- **Link a chat in one click.** If a chat with Lab tools has no scene yet, it shows "🔗 Link this chat to a scene", and
  if its AI tries to use the Lab, a note with the same button appears instead of changes landing somewhere random.
- **Files you give a chat reach its scene.** Pictures, 3D models and videos you drop in a chat go into that chat's
  scene, and Astra can now use the pictures you attach in the Lab too.
- **Fewer stuck moments.** If the Lab preview restarts while an AI is using it, the AI is told right away and tries
  again, instead of waiting.
