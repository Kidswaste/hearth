# Round 44: layer groups, notifications, send preview, a quiet Hearth, lots of fixes
*October 2026*

## 📁 Layer groups in the Lab
- Ctrl/⌘+click a few layers, then Ctrl/⌘+G (or right-click › 📁 Group layers). A group folds with ▾, has its own eye, and you drag layers in and out.
- **S** (or Alt+click an eye) shows only that layer or group. Solo is now saved with the scene and renders show what you see; a lit S tells you it's on.
- Ctrl/⌘+Shift+G ungroups; Ctrl/⌘+Z in the Layers list undoes the last group change.
- Right-click a group › ◫ **Make it a precomp**; right-click a precomp › 📁 **Back to a group**.
- Groups travel with the scene: recipes, templates, packs, the time machine, your other computer.

## 🔔 Hearth tells you when it matters
- While you're in another app: a long reply finished, a render done or failed, 🔁 Keep going stopped, an AI waiting for your OK, an update ready.
- Your computer's own notifications, with a button: **Open the chat**, **Show in Finder / Explorer**, **Allow…** (opens the card — you still decide there).
- No nagging: one per chat, a burst becomes one, nothing while you're looking at Hearth. Focus / Do Not Disturb still wins.
- Choose what notifies: Settings › Advanced › **Tell me when…**

## 💸 Send preview
- When a message is about to cost much more than usual, a small "≈ 52k" appears next to Send. Most of the time nothing shows.
- Point at it to see why in plain words, and take the one best cheaper way in one click ("Continue lighter first — ≈ 6k", "Send the picture at 1568 px"…).
- It never blocks: Send and Enter always send. 0 tokens; also `/send-preview`.

## 🌙 A quiet Hearth when you're not using it
- A still or paused Lab scene "dozes" (about 4 frames a second instead of every screen frame) and wakes the instant you touch anything. The window's wake-ups fell from 15 a second to about 1.
- After a minute without input, Forgeheart's little ambient touches pause; they carry on when you move the mouse.
- Fans stay down and the battery lasts longer. Nothing looks different.

## 🔧 Fixes
- Social-size screen recordings (9:16, 4:5, 1:1) come out at the exact size (1080×1920) even with MP4 off.
- Shader, particle, type, physics and model layers are found again right after they're added; `/model material` and friends answer again; saved slider presets keep their values.
- Cut footage never shows a removed frame while it plays.
- The board's `/ref` works again; wheel zoom no longer jerks the wrong way first; Alt+wheel opacity works the first time.
- Removing your last AI connection sticks. Delete sits right above "Customise this…" again.
- Closing the X effects picker no longer drops your cursor into the director's chat.
- The Mac keys sheet says ⌘Z and ⌘G.
- Behind the scenes: the test runner now catches every way a check reports a failure, so silent failures can't hide.

## Good to know
- Solo used to vanish on a scene switch; now it's saved and renders follow it.
- A scene that changes by itself after sitting still may show that change up to half a second late, once.
