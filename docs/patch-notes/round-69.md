# Round 69: photos, your controller, stems and an honest Métro
*October 2026*

## 📷 Photos in My Paris
- **Your photos in My Paris**: open any moment on your Paris map (a place, a show, a walk, a park session) and click
  **📷 Add photos**, or drag photos onto it. JPEG, PNG and iPhone HEIC all work.
- Hearth keeps **resized copies** in its own folder. Your original photos are never changed, moved or uploaded.
- The moment shows a **strip of your photos**. Click one to see it big, use ‹ › to flip through, and **Remove photo**
  sends Hearth's copy to the Trash.
- The copies don't keep **where** a photo was taken unless you tick **Keep location**.
- **📷 From a folder…** (under the map): pick a folder, like your phone import. Hearth suggests which photos go with
  which night, walk or place, by when and where they were taken. Untick what you don't want, then click **Add**. Nothing
  is added before that.
- Your map pin shows your photo once a moment has one.
- **My month in Paris** can now put up to **4 of your photos** on the image card. A tick box there turns it off.
- On Windows, iPhone HEIC photos need Microsoft's free "HEIF Image Extensions". Without it, Hearth tells you what to do.

## 🎹 Map my controller
- **🎹 Map my controller**: in the Sound desk, next to *MIDI in*. Click **Learn**, turn a knob or move a fader on your
  controller, then pick what it should move — type to search Vital's or Serum 2's controls, or turn the control in the
  plugin's own window and click "The last one you touched".
- Each mapping is a row (**CC 21 → Filter cutoff**) with **From / To** (how much of the control the knob covers),
  **Invert** and **Remove**. Under it you see where the control is now.
- **Knob pickup**: *Take over* (default) waits until your knob reaches the control before moving it, so nothing jumps;
  *Jump* follows your knob at once.
- Moves are smoothed (no zipper noise) and you see the knob turn in Serum 2 / Vital's own window.
- Pitch bend, the mod wheel and the sustain pedal always go straight to the instrument, untouched.
- Mappings are saved separately for Serum 2 and Vital on this computer and come back next time.
- Needs testing with your real controller and the real plugins (it was tested here with a pretend controller and a
  pretend Vital): tell us if a knob feels laggy or steppy, or if the plugin window doesn't follow.

## 📤 Send to my DAW
- **📤 Send to my DAW: finish your tracks in Ableton, FL Studio or Logic.** In the Sound desk (Creative Playground →
  Serum 2 / Vital), press **📤 Send to my DAW** in the top row. It's also in **Arrange** (next to Export) and on each
  **Live set** song (✎ Edit).
- Pick the song, tick what you want: **Stems** (one file per pad or lane), the **Mix**, the **MIDI** of what you played,
  and copies of your **Presets**.
- You get a new folder, "<song> — stems <date>", wherever you choose (Hearth remembers the place). Every WAV is 48 kHz
  24-bit, starts at bar 1 and is exactly the same length, so they line up when you drop them in at bar 1.
- The tempo and key are in every file name, and a README.txt says what each file is. Hearth guesses the key from the
  notes you played; type your own if it's wrong.
- A progress bar shows how far it is, **Cancel** leaves nothing behind, and **Show folder** opens it when it's done.
- Caveat: a Serum 2 sound saved only inside Hearth can't be copied as a preset file (the README says how to save it
  from Serum 2). Vital presets are included.

## 🚇 Honest Métro on leave reminders
- **Leave reminders know the Métro closes at night.** After the last train (about 00:40, or 01:40 on Friday and
  Saturday nights) and before about 05:30, the trip says "walk (Métro closed)" or "Noctilien / taxi — check", and
  your reminder comes earlier to match.
- **Sometimes it says "the last one".** When leaving a few minutes earlier still catches the last Métro, it tells
  you that instead of the night bus.
- **Trouble on your line? You'll hear about it.** About 30 minutes before a Métro reminder, Hearth checks the lines
  on your way once. If one is disrupted you get "⚠ Line 9: disrupted — leave 10 min earlier?". Click **Leave
  earlier** in the notification, or in the ✦ quest tracker, and the reminder moves.
- **The ✦ quest tracker shows the line status** under each Métro reminder ("Line 8: OK", "⚠ Line 9: disrupted…",
  or "Line status unknown"). Opening the tracker checks the trips coming up.
- **For live line status, add a free key**: Settings › Housekeeping › **Paris Métro status key…** (from IDFM's
  PRIM site). You can also click **Add key…** on a tracker row. The key is stored encrypted on this computer and
  only goes to PRIM.
- **Nothing about you is sent.** Hearth downloads the whole public status list. Your Home, your pin and your route
  never leave the computer.
- **Offline is fine.** The status shows as unknown and the reminder still rings on time.

## 🧹 Fixes

- Venues you went to now keep their ✓ on the Life › Map at the normal zoom. Before, a venue that also had a show this
  week only showed once you zoomed far in.
- ✦ Feedback and ↻ Auto-improve rounds no longer fail now and then with a raw "Invalid pts" ffmpeg message while
  reading frames from a scene recording.

