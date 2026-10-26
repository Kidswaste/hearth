# Round 67: errands, invites, loops and a slow button
*October 2026*

## 🐢 That was slow
- **New: 🐢 That was slow.** When Hearth stutters or freezes, click the **⋯** at the bottom of the left rail, then
  **That was slow**. A small card says what the last hiccup was in plain words, for example "The last hiccup: 1.4 s,
  while you were in the Lab (main process busy with your settings)".
- After a freeze of a second or more, the **⋯ turns amber** for two minutes so you know where to click.
- On the card, **📋 Copy report for Claude** copies the details. Paste them into a Claude chat so the next update can
  fix exactly that. Nothing is sent anywhere by itself.
- The card also counts **hiccups over 500 ms today, next to yesterday's**, with a small bar for each of the last 7
  days. It's an easy way to see whether an update made Hearth smoother.
- It's also in the **Help** menu (on Windows, press Alt to show the menu bar).
- It costs nothing while you don't click it: it only reads what Hearth's smoothness watch already notes, and it never
  starts a recording that could freeze Hearth itself.

## 🛍 Errands
- **Errands with opening hours.** For things like "get AirPods at Apple Opéra": click **＋ Errand** in the ✦ quest
  tracker or at the end of the Paris map's chip row, type what you need, and pick a shop.
- **Shops are suggested as you type.** "AirPods" puts Apple Opéra first. The list holds 13 well-known Paris shops
  (Apple, Fnac, BHV, Galeries Lafayette, Printemps, Gibert, Monoprix, two 24 h pharmacies) with their usual hours.
  Always check before going: Hearth doesn't look anything up online.
- **Anywhere else**: click **📍 Click a spot on the map…** in the card, click the map, name the spot, and type its
  hours (for example "Mon–Sat 10:00–20:00 · Sun closed").
- **Every errand has a badge**: Open now · closes at 20:00, Opens at 10:00, Closed today… It's on the map pin, in the
  tracker and in "Close to you" when your 📍 pin is near. It handles Sundays, lunch breaks and late nights.
- **Done ✓** next to an errand completes it as a quest (+15 XP). No proof is needed.
- **The map's Layers panel has an "Errands" switch**, on by default.
- **Fix:** the switches in the map's Layers panel now respond to a real mouse click. Before, clicking one moved the
  map instead.

## 👋 Bring someone
- **Bring someone to a show**: open a show's card (Sidequest Studio › Map › ✦ Shows this week → a show, or click a
  venue on the map) and click **👋 Bring someone**. It's also on the night out in **🗓 Plan my weekend**.
- Pick a tone (**Casual**, **Hyped** or **Low-pressure**) and **Français** or **English**. Hearth writes a short invite
  with the show, the date, the venue and the ticket link. It always gives your friend an easy out ("no worries if
  not"). You can edit the text.
- Click **Copy**, or **Open in WhatsApp / Messages / Instagram**. These only open the app with your text ready.
  Hearth never sends anything: you choose who and press send.
- Want it worded differently? **✨ Rewrite with Claude** asks Claude once, only when you click it.
- After sending, click **✓ I sent it** to log "Invited someone" on a matching social quest, like "Before the show".
  The card shows which quest first. Only your own invite is saved, never who it went to or their answer.

## 🎛 Sketches on pads
- **Your sketches are playable now.** Go to the Sound desk and click **Sessions**. Every 30-second sketch has two new
  buttons.
- **🎛 Put on a pad**: pick an empty pad in your Live set (the next free one shows as **＋**). The sketch goes there, ready
  for your open mic or park jam. Click **🎤 Open the Live set** to play it.
- **✂ Trim loop**: a small waveform with **Start** and **End** handles. They snap to bars at your session's tempo, or a
  tempo Hearth hears in the sketch. Type your own BPM if it's off.
  - **▶ Preview loop** plays the loop over and over while you adjust it.
  - **💾 Save loop** saves it as a new WAV next to the sketch. Your original sketch is never changed.
- Saved loops show under their sketch, with ▶, 🎛 Put on a pad and Remove loop (to the Trash). They also show up in
  **Arrange loops** and in the Live set's "Park takes" list.

## 🧹 Fixes
- **Visual feedback no longer risks wiping your review history.** If the history file can't be read for a moment, your
  new review is still shown, the old ones are left alone, and a short note tells you.
- **On Windows, Hearth now finds PowerShell by its full path.** This makes the check for OneDrive and iCloud files that
  are still downloading more dependable.
- **On the Mac, sync handles file names that differ only by capital letters or accents** as the same file, as Windows
  already did.
- **Eleven more places show errors in plain words** instead of the computer's raw message: the offline check, the quest
  helper, the Outing desk's visit time, Sidequest's proof and evidence pickers, and Visual feedback's cost line.
- **The Sidequest map speed test works again.** It now opens the Outing desk from Map › Events.
- **The new map layers from round 66 (Park jams, Paris place quests) don't slow the map down.** The test measured no
  difference.
- **Opening a place's details on the map is a little slower than in round 65** (about 21–23 ms of work against a 16 ms
  target). It's flagged for a closer look.

