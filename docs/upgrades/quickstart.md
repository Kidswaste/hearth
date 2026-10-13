# What can I do here? (round 31, quickstart)

Hearth gained a lot lately (missions, AI setup, hooks, connections, the gallery, Describe it, look match, packs,
autopolish, song parts, Find images like this, recall, spending, Chrome views…), and each came with its own hint or
chip somewhere. Now there is **one calm card per window** — a chat, the Lab, the board — with **3–5 things worth
trying there right now**, each **one click that opens the feature**. It is picked on this computer from what the build
has, what you have **not used yet**, and **what's on screen**: a song loaded → "React to the drums", an empty scene →
"Describe it" and the gallery, a board with pictures → "Find images like this", a long chat → "What did we decide?".
It shows by itself only the first time a window opens; after that it's in the window's ⋯.

Files: `quickstart-core.js` (the catalog and the picking, pure, Node + page), `quickstart.js` + `quickstart.css` (the
card and what each row opens; lazy group `quickstartui`, loaded on first use), `quickstart-hooks.js` (the ways in and
"once by itself"; lazy group `quickstart`, loaded after the first screen, ≈ 5 KB). Token-free: nothing is sent and
nothing is added to any prompt; a feature that spends (variations, the director) still asks first, as before.

## Upgrades

### The card
1. **✦ What can I do here?**: one small card in the window it's about (top right, under the header): a chat, the Lab (its docked director included) or the board.
2. **3–5 things worth trying there now**, in plain words with one line each on what it does.
3. **One click opens the feature** (its window, its picker, its mission in the chat box): never a command to type.
4. **What's on screen comes first**: a song loaded, an empty scene, pictures on the board, a long chat, a reply running.
5. **What you already use drops off**: commands you ran, buttons in your click log (usage.js), missions in this chat.
6. **Tried from the card = off the card for good.**
7. **Right-click a row › Not for me**: it stays off.
8. **Only what this build has**: a feature that isn't in this version never shows.
9. **A thin gold edge** marks the rows that fit what's on screen right now.
10. **Everything tried**: the card says so ("You have tried everything worth trying in the Lab. ✓").
11. **Shown by itself once**, the first time you open a chat, the Lab or the board in this version, and never again (each window kind once).
12. **Never in the way**: not in the first seconds, not over a dialog, another card, AI setup or a tour, not while Hearth is in the background or busy.
13. **× = gone for good** on the card that came by itself (⋯ › What can I do here? still brings it back any time).
14. **Goes when you switch windows** (it was about the other one); Esc closes it.

### Where to find it
15. **The chat's ⋯ (AI setup)**: a small **?** in its header (AI setup steps aside, the card shows in the chat).
16. **The chat's right-click menu** (right-click ⋯ or the header): **✦ What can I do here?** (in the Lab's docked director chat: the Lab's card).
17. **The Lab toolbar's ⋯ › ✦ What can I do here?**
18. **The board's ⋯** (the board button, and right-click › Board) **› ✦ What can I do here?**
19. **Ctrl/⌘+K › What can I do here?**
20. **An empty chat** shows one link, **✦ What can I do here?**, instead of the "◎ in the chat box: jam, a second opinion…" line.
21. `/what-can-i-do [chat | lab | board | list | reset]` (also `/quickstart`), the app's internal API; `list` writes the picks as text, `reset` lets the card come by itself again.

### One place, less noise
22. **Discover's daily "Did you know?" no longer pops up by itself**: the card is the one place for things to try (a tip still shows when asked).
23. **The Lab's first-run chips** ("Start from something like…", "✦ Describe it") **step aside while the card is up**, and come back when it closes.

### In a chat
24. **🔎 What did we decide?** (a long chat, or many chats): the recall card, free.
25. **🧹 Carry on in a fresh chat** (30+ messages): the free summary, then a cheaper chat.
26. **⌕ Find something in this chat** (20+ messages).
27. **📝 Plan first, then do it**: sets the mission for your next message (nothing is sent).
28. **👥 Ask Claude and Astra side by side** (when both are there): the Side by side mission.
29. **◎ Give your next message a mission**: opens the ◎ picker.
30. **❖ Give it a personality and standing instructions**: opens AI setup.
31. **▦ Use your mood board here** (when a board has something): the board drawer.
32. **◉ See what is running**: Activity (first while a reply runs).
33. **🎙 Talk instead of typing**: voice into the chat box.
34. **◔ Your week of spending**: the week at a glance.

### In the Lab
35. **✦ Describe it** (an empty scene first): a scene from your words, 0 tokens.
36. **🖼 Start from something like…** (an empty scene): the gallery.
37. **♪ Load a song** (no song yet).
38. **🥁 React to the drums** (a song loaded, first): the director's "React to the drums, bass and voice" mission, set for your next message.
39. **〰 Make it react to the music** (a song loaded): kick, bass and loudness move the right sliders, with Undo.
40. **🎬 A music video from this song** (a song loaded).
41. **✨ Make it look finished**: the free local polish.
42. **🎨 Make it look like a picture** (first when the board has pictures).
43. **👥 4 variations of this scene**: the crew mission (its cost shows first).
44. **⟲ Go back to an earlier version**: the time machine.
45. **📱 A 9:16 version for socials**: the vertical mission.
46. **⇪ Share the scene as one file**: the pack menu.

### On the board
47. **＋ Add pictures, clips or links** (an empty board, first).
48. **▤ Start from a template** (an empty board).
49. **📌 Find images like this** (pictures on the board, first).
50. **◐ Read its vibe**: the palette, light and mood words a chat gets.
51. **✦ Give its vibe to the Lab** (with a Three Director).
52. **🔗 Link it to a chat** (a board linked to no chat yet).
53. **▶ Present it** (3+ items).

## Audit: first-run hints and empty states
| Where | Before | Now |
|---|---|---|
| Empty chat (native.js + astra.js) | "Ask anything · drop or paste files · ⋯ at the top" + "◎ in the chat box: jam, a second opinion or side by side with Astra" | the first line stays (it teaches attaching); the ◎ line becomes the one link ✦ What can I do here? (the card offers side by side when Astra is there) |
| Lab, new chat's starter / plain Shape | "🖼 Start from something like…" + "✦ Describe it" chips on the preview | kept (they are the action itself); hidden while the card is up, which offers both first |
| Board, empty | "Drop pictures, clips or links — or paste, or + Add / Right-click for everything else" | kept (it teaches drag and drop); the card adds Add / template / find images |
| Discover's daily tip | a "Did you know?" card at most once a day, by itself | no longer by itself (shown when asked); the quickstart card is the one place |
| Discover's What's new after an ⬆ Update | a card after an update | kept: it is about what changed, not what to try |

## Tests
- `node dev/quickstart-test.js` (unit, 46 ✓): the catalog (places, plain words, no /command on screen, ids), context
  first (a song → React to the drums; an empty scene → Describe it then the gallery; pictures → Find images like this;
  an empty board → Add then a template; a long chat → What did we decide? and a fresh chat; a new chat → plan first and
  a personality), nothing that needs a scene on an empty one, no Lab missions without a director, no side by side
  without Astra, used drops off (a command, a click-log button, a mission in this chat, tried from the card; a count of
  0 isn't "used"), Not for me, missing features never show, a throwing context, the cap, where the card belongs (the
  docked director's chat is the Lab; website agents and other tools have none), once by itself / gone for good, < 1 ms
  a pick with a 300-key click log.
- `node dev/smoke.js --fake-engines --check-timeout 180000 --script dev/checks/quickstart.js`
  (`sh dev/run-checks.sh quickstart`, 34 ✓): the card's group isn't loaded at the first screen; the first time a chat
  opens the card comes by itself in that chat (3–5 rows), × = gone for good, never again by itself; the chat's
  right-click menu and AI setup's ? open it; a 40-message chat → What did we decide? first → one click opens the recall
  card, then it's off the card; Plan first sets the mission and sends nothing; the Lab toolbar's ⋯ opens it in the Lab;
  an empty scene → Describe it, then the gallery, the Lab's chip steps aside and comes back; a song loaded → React to
  the drums first → one click sets the director's mission; the board's ⋯; an empty board → Add first; two pictures →
  Find images like this first; right-click › Not for me; Discover's daily tip stays away; nothing sent to any AI; no
  page errors.
- Also run: `dev/boot-test.js` (854 ✓), checks `lazy`, `tour-discover`, `qa-commands`, `labeasy`, `smooth26` (all ✓);
  `node dev/lazy-manifest.js` rewritten.

## Risks
- Existing installs see the card once per window kind after this update (it can't tell an old window from a new one);
  × on it is final.
- "Used" is read from the click log by button names: a feature reached by a way the log names differently stays on
  the card until it's clicked from the card (then it's off for good) or right-clicked › Not for me.
- In test runs (`window.SMOKE_SAVES`) the card never comes by itself unless a check sets `quickstart.testAuto`, so
  other checks' screens are unchanged.

## For the patch notes
- New: **✦ What can I do here?** — one small card in a chat, the Lab or the board with 3–5 things worth trying there now.
- Each row is one click: it opens the feature (a picker, a window, a mission in the chat box), never a command.
- It fits what's on screen: a song loaded suggests **React to the drums**, an empty scene **Describe it**, a board with
  pictures **Find images like this**, a long chat **What did we decide?**.
- Things you already use don't show; anything you try from the card leaves it for good; right-click a row › **Not for me**.
- It shows by itself only the first time you open each kind of window; × hides it for good.
- Any time after that: the window's **⋯** › **✦ What can I do here?** (in a chat: the **?** at the top of AI setup).
- Less noise: the daily "Did you know?" no longer pops up by itself, and the Lab's starter chips step aside while the card is up.
- Free: it's worked out on your computer; nothing is sent to an AI.
