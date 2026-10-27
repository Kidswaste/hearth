# photos69 (round 69): photos in My Paris

Every moment on your Paris map can now hold your own photos: a place you visited, a show, a walk, a park session or a
music session. Hearth keeps **resized copies** in its own data folder and never changes, moves or uploads your originals.
A folder of photos (a phone import) can be sorted for you: Hearth **suggests** which photos go with which moment, by when
(and where) they were taken. Nothing is added until you click Add. Your month's image card can carry up to 4 of them.

## What shipped

**On a moment** (Paris map › click a My Paris pin or a dot in the strip under the map)
1. **📷 Add photos**: pick several JPEG, HEIC or PNG photos at once.
2. **Drop photos on the moment**: drag them from Finder / Explorer onto the moment. It gets a pink outline while you
   drag.
3. **A small photo strip** on the moment, in the order the photos were taken. The tooltip shows when each was taken.
4. **A light viewer**: click a thumb to see the photo big, with "3 of 7 · taken 24 Oct · 21:40".
   - ‹ Previous / Next ›, or the ← → keys (listed in the keys sheet)
   - Show file
5. **Remove photo** in the viewer:
   - It asks for a second click first.
   - Then Hearth's two copies go to the Trash. Your original is never touched.
   - On a disk with no Trash it refuses and says why.
6. **Keep location** box (off by default). When it's off, the copies carry no GPS at all. When it's on, the copies keep
   where they were taken. Either way the copy keeps the date it was taken.
7. **HEIC**:
   - On a Mac it's converted with the system's own `sips`.
   - Windows uses its HEIF codec if Microsoft's free "HEIF Image Extensions" is installed.
   - Otherwise the photo is left out with a plain explanation: install the extension, or set the iPhone to "Most
     Compatible".
8. **Plain progress and results** under the button:
   - "Adding 3 of 12…"
   - "Added 11 photos (copies; your originals are untouched). 1 left out: …"
   - The same photo twice is kept once ("already here"). A moment holds up to 60 photos.
9. **The pin and the dot get your photo**: a moment that had no picture now shows your first photo in its map pin. Its
   dot in the strip fills in.

**📷 From a folder…** (in the strip under the map, next to My month in Paris)
10. **Pick a folder**, for example a phone import such as DCIM/100APPLE. Hearth reads the photos in it and in up to 4
    levels of subfolders, up to 3,000 files. It only reads them.
11. **Suggestions per moment**, newest first. Each photo shows a thumbnail, a tick box (ticked) and **why** it was
    suggested: "taken 24 Oct · 21:40 · 80 m from La Cigale" or "during the show".
12. **How photos are matched**:
    - **When it was taken.** A show counts from 1 h before it starts to 7 h after. A place visit counts from the 4 h
      before you ticked it done to 1 h after. A walk runs from its first stop to its last, a park session from its first
      take to its last, and a music session for its length, with a little slack on each.
    - **Where it was taken.** A photo with GPS more than 2 km from the place is never suggested for it.
    - **Same day, close by.** A photo taken that day right at the place (≤ 500 m) is a weaker match.
    - **Photo with no date.** One with only a file date counts less and says "(file date)".
13. **The photo's own time zone**:
    - If the camera wrote its UTC offset (phones do), that offset is used, so photos from a trip abroad land right.
    - Otherwise its GPS clock is used.
    - Otherwise this computer's time zone is used (Paris, summer and winter time, including the hour that happens twice
      in late October).
14. **Add N to this moment** adds only the ticked photos. Untick any you don't want. Photos you already added from that
    file are left out. The dialog says how many didn't match and how many have no date. Those stay where they are.
15. The same **Keep where they were taken (GPS)** box is in this dialog too.

**My month in Paris**
16. **Photos on the card (N of up to 4)**: a toggle (on by default, remembered on this computer) with a preview of the
    photos it will use. It takes one per moment first, your added photos before a moment's own photo.
17. **The saved card** draws those photos as four 180 px squares. With the toggle off, the card has no photos.

## How it works
- `tools/parisphotos-core.js` (UMD, no DOM, node-tested; also used by the main side):
  - **EXIF** read from the bytes: JPEG APP1, HEIC's Exif item, PNG eXIf. It reads the date, the UTC offset, GPS, the GPS
    clock, the orientation and the size.
  - `takenAt`: turns the camera's wall clock into a real time (its offset › its GPS clock › an IANA time zone through
    Intl, with daylight-saving handling).
  - `windowOf` / `fitOf` / `suggest`: the matching.
  - `fit` sizes the copies (long edge 2048 px and a 400 px thumb, never enlarged). `names` builds
    `paris-photos/<YYYY-MM>/ph-….jpg` and `.thumb.jpg`.
  - `makeExif` / `withExif`: the copy's own small EXIF (date, plus GPS only when you keep it). Every other EXIF / XMP
    block is dropped.
  - The kept list: `validate` / `add` / `remove` / `keptFor`. A walk also shows photos added to its stops before it was
    finished.
  - `cardPhotos`: which photos go on the card.
- `tools/parisphotos.js` (window):
  - **The copies**: Chromium decodes each photo (turned upright from its EXIF), an OffscreenCanvas resizes it, and it's
    saved as JPEG quality 0.86 (thumb 0.8).
  - **The kept list**: kv `paris-photos` through DataSafe (a failed read is never treated as "empty").
  - **On screen**: the strip, the drop target, the viewer and the folder dialog.
  - **Small preferences**: "Keep location" lives in localStorage `photos69`, the card toggle in `parisjournal64`'s
    preference.
- `parisphotosmain.js` (main, lazy: loaded on the first photo action) has five handlers:
  - `put` writes only names of the copy shape, and only JPEG, atomically.
  - `dir`
  - `trash` handles only Hearth's copies, after the Mac / Windows "has a Trash" check.
  - `heic`: sips › Electron › Windows WIC via PowerShell › a plain why.
  - `scan` (read-only) reads the first 256 KB of each JPEG / PNG, 1 MB of each HEIC.
- Hooks in `tools/parisjournal.js` (round 64, ours):
  - moments get `photos` / `cover`
  - the moment card gets the photo row
  - the strip gets 📷 From a folder…
  - the recap gets the toggle
  - the card draws up to 4 photos
  - a `hearth:paris-photos` event redraws the pins
- `tools/parisjournal-core.js`:
  - walks get `from` (first stop) and `parts` (their stops' ids)
  - park and music sessions get `until`
  - pins use `cover` when a moment has no photo of its own
- Files: the three `tools/parisphotos*` files are in the `questjournal` lazy group (first screen unchanged: 73 scripts,
  29 sheets). The main module is lazy too.
- Idle cost: none. There are no timers. Work happens only when you click or drop.

## Tests
- `node dev/photos69-test.js` (unit, in UNIT, 10 groups) uses photos made the way phones write them:
  - EXIF from a JPEG, a HEIC and a PNG. N/S/E/W GPS. A 0,0 fix is ignored. Short or damaged files don't throw.
  - **Time zones**:
    - the photo's own offset (+09:00) wins; the GPS clock is used for a New York photo with the computer in Paris; a
      stale GPS clock is ignored
    - Paris is UTC+2 in summer and UTC+1 in winter; UTC and New York give their own times
    - **25 Oct 2026 02:30** (happens twice) → the summer one; **29 Mar 2026 02:30** (doesn't exist) → moved forward
  - **Matching**:
    - show / place / walk / park / music windows
    - 80 m from La Cigale beats no GPS; 4 km away is never the show
    - same day near the place is weaker; no date is set aside; already added is left out
    - **the time zone deciding a borderline photo** (18:30 on the camera: before doors in Paris, during the show in
      UTC); a photo with its own offset matches the same in Paris, UTC and Tokyo
  - **Copies**: sizes (4032×3024 → 2048×1536, never enlarged, 5–8 turn), names, and path rules that refuse `../`.
  - **GPS** is stripped from a copy, the date kept, and GPS kept when asked.
  - **The kept list**: no double adds, a walk's stop photos, the card's round-robin.
  - **The main side**: writes only its copy names and only JPEG; scans a nested folder read-only (skips .txt and `._`
    files; originals unchanged); sends only its own copies to the Trash; a HEIC on Linux says why.
- `dev/checks/photos69.js` (app, isolated profile, offline tiles, 27 steps, everything by clicking) uses JPEGs drawn in
  the window with EXIF added (Paris wall clock, GPS, orientation 6), a PNG and a HEIC:
  - **Add photos**: the Cigale pin › 📷 Add photos with 4 files → 3 added, and the HEIC left out with the plain why.
  - **The copies**: a strip of 3 thumbs (≤ 400 px); the kept list's relative paths and Paris-time dates; 3000×2000
    turned upright → 1365×2048 + 267×400; the PNG not enlarged; the copy has the date and no GPS; the originals are
    byte-identical.
  - **The viewer**: 2048 px, "1 of 3 · taken…", Next ›, ←. Remove asks first, then the copies go to the Trash.
  - **The map**: the pin then shows the photo and the dot fills in.
  - **Drop**: a photo dropped on Le Bataclan's moment shows the outline and is added; dropped again → "already here".
  - **From a folder** (5 photos plus a .txt, nested):
    - 2 moments suggested, with why; the far one and the off day left out
    - nothing added before a click
    - Add on one group, and Add with one photo unticked on the other
  - **The card**: My month in Paris › "Photos on the card (4 of up to 4)" → the card has 4 photos; toggled off → 0, and
    the toggle is remembered.
  - Lazy, no timers while idle, nothing sent anywhere.
  - Screenshots: `photos-moment.png`, `photos-folder.png`, `photos-recap.png`, `card-with-photos.png`.
- Group: `node dev/run-checks.js photos69`.
- Results (under `flock /tmp/hearth-run.lock`): photos69, unit:photos69-test, parisjournal64, unit:parisjournal64-test,
  lazy, unit:boot-test, unit:datasafe-scan and unit:winmac-test all pass. errorcalm-scan passes. `node dev/lazy-manifest.js`
  was regenerated (it adds a keys line).

## Changes outside my files
- `main.js`: one `lazyIpc('parisphotosmain.js', …)` line. `preload.js`: one `hub.parisPhotos` line (5 channels).
- `tools/parisjournal.js` and `tools/parisjournal-core.js` (round 64, a Claude stream): the small hooks listed above.
  The 8 parisjournal64 unit groups and the 27-step app check still pass.
- `lazy-data.js` (+ META regenerated): three files and two globals join `questjournal`.
- `dev/run-checks.js`: `UNIT.push('photos69-test')` (the single UNIT list) and the `photos69` group.

## Risks / notes
- **HEIC on Windows** goes through PowerShell + WPF and needs Microsoft's HEIF extension. It couldn't be tried here
  (Linux). Without the extension it says what to do. The Windows path applies the photo's orientation by hand, because
  WIC's JPEG drops it. **HEIC on Mac** uses `sips`, which keeps the date and orientation. That couldn't be tried here
  either.
- From a folder shows thumbnails of the **originals** (file: images, lazy-loaded). A folder of hundreds of 12 MP photos
  takes a moment to scroll. HEIC tiles show a "HEIC" label: Chromium can't draw HEIC.
- Matching a **place visit** assumes you ticked it done within a few hours of being there. If you tick it days later,
  only photos with GPS near the place, taken that same day, match.
- Copies are resized on the window's thread (decoding happens off it). One 48 MP photo takes a moment. Nothing runs
  while idle.
- Photos are kept per moment id. If a moment disappears (a show removed from the log), its photos stay in
  `paris-photos/` but don't show.
- I didn't add a chat command. The owner doesn't use commands, and everything here is a click.

## For Codex
- No Codex file was touched. Photos live in their own kv store (`paris-photos`) and folder (`<data>/paris-photos/`).
  They attach to My Paris moment ids (`place-<campaign>`, `stop-<quest>`, `walk-<campaign>`, `show-<key>`,
  `park-…`, `music-…`), not to quest records. Your journal is still only read.

## For the patch notes
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
