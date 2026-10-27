# whatsnew71: the 1-minute tours of rounds 66–70 (round 71)

The owner hasn't opened Hearth since rounds 66–70 shipped, and he doesn't use commands. A feature he can't find
doesn't exist for him. So every click-first thing from those rounds is now a step in a short themed tour. The
creative session's round-67 Lab tools and this round's 🍜 Eat nearby (eatnearby71) are in the tours too. Each
step is one plain sentence and a **Show me** button. Show me takes you to the place and puts a ring on the real
button. Nothing changes unless you click that button yourself.

## What shipped
### The tours (23 steps, about a minute each)
1. **🌙 Paris nights** (8 steps):
   - 🗓 Plan my weekend (✦ chip panel, Thursday evening to Sunday; on other days it rings the ✦ chip and says when it shows up)
   - 👋 Bring someone, 🎟 My ticket, ⏰ Remind me to leave, 🎒 Before I go, 🍜 Eat nearby and ★ Follow (each on a show's card)
   - 🚇 Paris Métro status key… (Settings › Advanced › Housekeeping)
2. **🗺 Sidequest** (4 steps, on the Paris map): 📍 I'm here · Layers · ＋ Errand · 📷 From a folder… (photos in My Paris).
3. **🎛 Music** (5 steps, in the Sound desk):
   - Sessions
   - 🎛 Put on a pad (in Sessions)
   - 🎧 Reference
   - 🎹 Map my controller (it rings the instrument cards until Serum 2 or Vital is open)
   - 📤 Send to my DAW
4. **🪲 Help when it breaks** (2 steps): ⋯ › That was slow · ⋯ › Something broke (the rail's ⋯ menu opens and the row is ringed).
5. **✦ In the Lab** (4 steps, the creative session's round 67; only the tour was added, their code is unchanged):
   ✦ Direction · ⚑ Finish line · Credits · the moodboard drawer's "Close to it ↔ Only its spirit" slider.

### How a step behaves
6. **Show me first, then the ring.** A step's card shows its sentence and a primary **Show me** button. Nothing moves
   until he clicks it. Then the place opens (a show's card, the map, the Sound desk, the ⋯ menu, Settings, the
   Lab, the board drawer), and the ring sits on the button. **Next ›** just reads on. Skip, Later and × work as in
   round 64. (`tour.js`: `step.showMe`.)
7. A step clears what the step before left open: the ⋯ menu, a show's card, the ✦ panel, Settings, the drawer and the
   Sessions list (which used to cover the desk's top row).
8. The ✦ panel no longer closes when you click the tour card that is talking about it.
9. The ring follows scrolling (for example a long Settings list) and waits for a sliding panel to settle.

### Where to find them (all clicks)
10. **The one card after an update**: "Since you were last here: 5 updates — take the 1-minute tours?". It has
    **Take the tours** (runs them in order; Skip moves to the next one, Later stops), a chip for each tour, **Later**,
    **What changed** (opens the full digest) and ↶ Go back after an in-app update. It shows **once**: Later or ×
    means it never comes back by itself. It takes the place of the "Since you were away" digest and the round-64
    offer, so you get one card, not a pile. The number is honest: it counts every round you missed, so with round 71
    out it says 6.
11. **✦ chip panel › "✦ New tours 0/5"** until all five are seen. After that, round 64's "✦ New N/13" comes back.
12. **What's new** (rounds 66–70) has a "✦ The 1-minute tours:" row with the five chips.
13. **Patch notes** of rounds 66–70 have "✦ Show me · 🌙 🎛 🪲" in the header. It runs the tours that cover that round.
14. Settings › What's new… › Try what's new and Ctrl/⌘+K list them under "Rounds 66–70: the tours".
15. `/try tours`, `/try nights`, `/try round 68` also work, but only as a secondary way in.

### Fixes along the way
16. Round 64's tours can open the Sound desk again. The Playground's station button had been renamed, so all four
    desk paths and the round chains in newtour64 failed, on the base commit too. They now use
    `CreativePlayground.openFeature('vst')`.
17. Round 64's Paris map step text was cut under the 260-character limit (`unit:trynew-test` failed on the base commit).

## Files
- New: `trynew71-core.js` (the tours as data, progress, `sinceDue`; tested in Node), `dev/trynew71-test.js`,
  `dev/checks/whatsnew71.js`. Both are in the lazy group `trynew`, so nothing new is on the first screen except a
  small hook in updater.js.
- Changed: `trynew.js` (Show me openers, the card, rows, menu, /try), `trynew.css`, `tour.js` (showMe step, ring
  follows scroll), `updater.js` (whatsnew.seen read at start; the card stands in for the digest when it's due),
  `whatsnew.js` (tryRow), `patchnotes.js` (head button), `questhud.js` (✦ New tours; a tour card click no longer
  closes the panel), `lazy-data.js` (group files and META regenerated), `docs/lazy-groups.md`, `dev/run-checks.js`
  (unit test and group `whatsnew71`), `dev/checks/newtour64.js` (two selectors adapted to the new row and tracker
  slot), `trynew-core.js` (one text).
- Store: `trynew.tours71` holds each tour's state (done, skipped or later). `trynew.since71` records the card
  (shown, later or started). Both are on this computer only.
- Merged `claude/intelligent-galileo-yaiqem` (eatnearby71) to verify the 🍜 Eat nearby step. The only conflict was
  lazy-data.js's generated META, which was regenerated.

## Tested
- `dev/checks/whatsnew71.js` (`--fake-vst`, offline, clicks only, 0 commands after the fixtures):
  - For **every one of the 23 steps**, the card shows its sentence and Show me with no ring. After Show me, the
    ring sits on the step's **own** button (never its fallback), and the button is visible, inside the window and
    on top at its centre. So a stale tour fails the check.
  - The weekday weekend fallback. Skip, Later and Done are kept.
  - The after-update card: its exact text, its count from index.txt, Later (never again), and Take the tours (in
    order, Skip moves on, Later stops).
  - ✦ New tours, the What's new row and the patch notes button.
  - It passed 3 runs in a row.
- Group `whatsnew71` passed: whatsnew71, unit:trynew71-test, newtour64, unit:trynew-test, whatsnew, tour-discover,
  lazy and unit:boot-test (first screen 2335 of 2345 KB). unit:datasafe-scan and unit:winmac-test passed too.

## For the patch notes
- **✦ Since you were last here.** The first time you open Hearth after updating, one small card says how many updates
  you missed and offers the **1-minute tours**. Click **Take the tours**, or pick one, or **Later**. Later means it
  won't come back by itself.
- **Five short tours**: 🌙 Paris nights · 🗺 Sidequest · 🎛 Music · 🪲 Help when it breaks · ✦ In the Lab. Each step
  is one sentence. Click **Show me** and Hearth takes you there and puts a ring on the actual button: Plan my
  weekend, Bring someone, My ticket, Remind me to leave, Before I go, Eat nearby, Follow, I'm here, Layers, Errands,
  your photos, Sessions, sketches on pads, Reference, Map my controller, Send to my DAW, That was slow, Something
  broke, Direction, Finish line, Credits and the moodboard.
- Just looking changes nothing. Nothing happens until you click the button itself.
- Any time: click the ✦ chip in the left rail, then **✦ New tours**. They are also in What's new, and in the
  patch notes of rounds 66–70 (✦ Show me).
