# chatfix124: a new chat's row stays put, and the chats search is back (round 124)

Round 123's check sweep (checksweep123.md) left two problems in the chats list open. This round fixes both in the app
and makes the two checks test the owner's real experience again.

## 1. chat-new-row: a new chat's row vanished for about 1.2 s after its first message

**Cause.** Since round 116 the chats list shows only the open project's chats (`ProjChats.inScope`). A chat is saved
for the first time when its first message is sent (`Native.send` makes it, `remember()` saves it and redraws the list).
But projchats.js put it in its project only in `place()`, which `watch()` ran **1.2 s after** it first saw the chat in
the list. Meanwhile the chat was in no project, so `inScope` hid it. The "New chat" row had already gone (the draft
became the real chat), so the row vanished and came back 1.2 s later. Round 123 only taught the check to wait for it.

**Fix (projchats.js).** A new `Native.hooks.send` handler, `onSend`, runs `place()` for the chat the moment it is first
saved. `Native.send` calls the send hooks after `remember()` and before the list's next draw (`Panel.soon`, 40 ms), so
the chat is already in its project when the row is drawn. Nothing about where it goes has changed:
- it is still `place()` with its rules: the project chosen for it (`pending`, from `onNewChat` / `newChatIn` / the
  "Which project?" question), a Lab director's scene project, the open project, else **Earlier chats** (with its note);
- only a chat this window made for the owner is placed (its AI had a project chosen, or it is the AI's open chat).
  Anything else (an arrival from the other computer, an import) still goes to the keeper after its grace;
- one project per chat: `Projects.add` of a chat is a move, so a workspace's or a jam's own chat, which their code adds
  to their project, still ends up there alone;
- the delayed `place()` in `watch()` stays as the fallback (for a chat made some other way, such as `ensureChat`);
- if the projects store hasn't been read carefully yet (`ok` false), nothing is placed (every chat shows meanwhile,
  as before): a read failure is still never "empty". The keeper's behaviour is unchanged.

## 2. journey-chat: the chats search no longer offered "Search inside messages"

**When and why.** `git log -S "Search inside messages"` shows the button was never removed: it is still in
panel.js `render()` (since the first feature pack, b558ef3), shown under the list once 2+ letters are typed in the
chats search. Neither listtidy121 nor slim116 touched it. The search box itself was lost **by accident in round 116**
(17e1f36, projchats116): the project bar (`.pc-bar`) is prepended into `.panel-head`, which is a flex row
(features.css, since round 42). The bar took the row and squeezed `#chat-search` (`flex: 1; min-width: 0`) to almost
zero width: only a sliver showed beside "＋ New chat". So the chats list couldn't be searched at all, and the
journey's typing went into the chat's composer instead (round 123's screenshot shows "haiku" in the composer).

**Fix.**
- projchats.css: `.panel-head:has(> .pc-bar)` wraps, and the bar takes its own line (`flex: 0 0 100%`). The search box is
  full width under it again.
- panel.js: the button now says what it searches: "Search inside messages for "…" (every project)". The list above it
  shows the open project's chat titles; the button hands off to Ctrl/⌘+K's `?` message search (round 113), which
  looks through the messages of every project's chats. Its tooltip says so.

## The checks

- **dev/checks/chat-new-row.js**: round 123's wait for the real row is gone. From the ＋ through the first message and
  its reply, every frame (`requestAnimationFrame`) must show either the "New chat" row or the real chat's row
  (`framesWithoutRow` must be 0). A send hook added after projchats.js's own reads the chat's project when it is first
  saved: it must already be the open project.
- **dev/checks/journey-chat.js**: a new step asserts the chats search box is visible and at least 120 px wide; the box
  is found by its id (`#chat-search`). The two deep-search steps are unchanged and pass again.

## Tests

`export HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, then
`flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact chat-new-row journey-chat projects chatcore appsearch unit:projchats116-test unit:projsync118-test unit:projperf120-test`
and `node dev/boot-test.js`. Results: see "Results" below. The first-screen budget holds: 62 scripts,
1574 KB of code (budget 1586 KB), 27 stylesheets, 415 KB (budget 420 KB). panel.js grew by a few lines and
projchats.css is not on the first screen.

### Results
| Test | Result | Notes |
|---|---|---|
| chat-new-row | pass (41 s) | `framesWithoutRow: 0`; the chat was in the open project when first saved |
| journey-chat | pass (84 s) | search box 199 px wide; "Search inside messages for "haiku" (every project)" found the relay chat. Before: fail (2 steps) |
| projects | pass (48 s) | |
| chatcore | pass (49 s) | |
| appsearch | pass (49 s) | |
| unit:projchats116-test | fail → pass | the tests' stand-in `Native` has no `hooks.send`: the hook is now added with `?.` |
| unit:projsync118-test | fail → pass | same |
| unit:projperf120-test | fail → pass | same |
| node dev/boot-test.js | pass | 2,822 checks; first-screen budget held |

The five app checks ran before the `?.` change (the only difference: `hooks.send.push` → `hooks.send?.push`).

## For the patch notes

- **The chats search is back.** Since round 116 the project's name bar at the top of the chats list squeezed the
  "Search chats" box down to a sliver. It now sits on its own line under the project bar. Type two letters or more
  and, under the matching chats, **Search inside messages for "…" (every project)** opens Ctrl/⌘+K's message search.
- **A new chat no longer blinks out of the list.** After the first message of a new chat, its row used to disappear for
  about a second and then come back. The chat now joins its project the moment it is saved (the open project, the one
  you picked, or Earlier chats if no project was open), so its row stays.

## For Codex

No Codex-owned files were changed this round (projects*, project-workspace*, sync-engine.js, cloud-files.js, astra*,
codex-*, workbench-* and engine-watch are untouched). Note: `ProjChats` now also listens on `Native.hooks.send`; a
chat a project's own code adds with `Projects.add` after its first send is moved there as before (the add is a move).
