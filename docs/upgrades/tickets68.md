# tickets68 (round 68): 🎟 My ticket

The owner buys Paris show tickets on Shotgun and DICE (showsync61 lists them; showprep62 handles the night before and
after; invite67 helps bring a friend). This stream keeps the ticket with the show, so the owner can show it at the door
without searching the mail or Downloads. Hearth keeps its own copy in its data folder. The owner's file is never moved,
renamed or changed. Nothing is uploaded, no AI is used, and nothing runs while idle.

## Upgrades

Where it is (by clicking)
1. **🎟 Add my ticket** on every upcoming show's card (Sidequest Studio › Map › ✦ Shows this week → a show, and a venue
   pin's next show). Click it to open the computer's own file picker. It takes a PDF, a PNG / JPEG / screenshot, or an
   Apple Wallet pass (.pkpass), and you can pick several files at once.
2. **Drag the file onto the show's card**. A dashed outline shows where it will land. A picture dragged straight from a
   browser (a file with no path) is kept by its bytes.
3. Once a show has a ticket, the button reads **🎟 Open my ticket**. All open cards change at once.
4. The same button sits in a **show quest's detail** in Sidequest Studio (a "YOUR TICKET" aside), on the **✦ tracker's
   show quest card**, and on the **weekend plan's night out** (✦ tracker › 🗓 Plan my weekend), next to 👋 Bring
   someone.

The view at the door
5. The view covers the whole window in white, whatever the theme. The ticket is as big as it fits: an image, or the PDF
   in Chromium's own viewer, fitted to the page.
6. A **☀ Turn your screen brightness all the way up** hint sits in the top bar. A web page can't set the screen's
   brightness, so Hearth asks you to.
7. **⛶ Full screen** hides even the top bar. Esc comes back.
8. **The screen stays awake** while a ticket is shown, so it doesn't go dark in the queue. It goes back to normal when
   the view closes.
9. **Several tickets** for one show (yours and a friend's, or a second page): ‹ › and "1 / 2". ← → also work and are
   listed in the keys sheet.
10. **⋯ More**: ＋ Add another ticket… · Show in Finder / File Explorer · Open in another app (or **Open in Wallet** for a
    pass on a Mac) · Remove this ticket.
11. **Wallet passes (.pkpass)**: the view shows the pass's own words (event, doors, seat…). When the pass's code is a QR
    code, Hearth draws it big for the scanner. Other code types (Aztec, PDF417) show "open it in Wallet", because Hearth
    won't draw a code type it can't make exactly.

On the day and after
12. On the show's day, **"🎟 Ticket ready · <show>"** appears at the top of the ✦ quest tracker. One click opens the
    view. Paris time is used: a 1 am club start counts as the night before, and the row stays until the night is over.
13. **After the show**, the ticket is kept with the night. The view says "The night is over: your ticket is kept with it
    in Shows I went to", and a **Remove (Trash)** button sits in the top bar.
14. **Shows I went to** (showprep62's log) has a **🎟 My ticket** button on each night that kept one. After **How was
    it?**, the card says the ticket is kept with that night and shows the same button.
15. **Remove** always asks for a second click. The file goes to the **Trash** (Recycle Bin on Windows), never deleted
    for good. A drive with no Trash (a network share, some USB sticks) uses Hearth's own `data/trash/tickets`.

Downloads (a suggestion only)
16. When a file in **Downloads** is named like the show, the show's card asks **"🎟 Is this your ticket for X?
    “file.pdf” in Downloads"** with **Add it** and **Not this one**. Add it keeps a copy, and the file stays in
    Downloads untouched. Not this one is remembered, so that file is never asked about again.
17. The ✦ tracker asks the same for **this week's show quests** that have no ticket yet.
18. **Matching is by name only**: an artist ("arlo-parks-e-ticket.pdf"), the title's words or its named parts
    ("Sherelle ticket.pdf" for "Rinse Paris: Sherelle + Nia Archives"), or the venue plus the show's date. A date in the
    name that points to another day rules a show out. Generic names ("ticket.pdf", "IMG_4432.PNG", "order-123456.pdf")
    never match. Two shows that tie get nothing, so Hearth never guesses. Files older than 120 days are skipped. Hearth
    never opens a file to match it.

Chat (secondary)
19. `/shows ticket <show>` opens the view, or offers 🎟 Add my ticket when the show has none. `/shows ticket` alone lists
    the tickets you have.

## How it's built
- `tickets-core.js` (pure, Node + window, UMD; uses showprep62's Paris time). It covers:
  - `kindOf` / `refuse` (PDF, images, .pkpass; HEIC and files over 25 MB get a plain reason)
  - `phase(show, now)`: before / day / after, by the show's night in Paris time. The day runs until the listing's end
    (or 3 h after a concert's start, 6 h after a club night's) plus 2 h. A date-only listing covers its whole day.
  - the index (`validate` throws on damage, so it's never read as empty; duplicates are folded by SHA-256; up to 6
    files per show)
  - `datesIn` / `score` / `suggest`: file name → show
- `ticketsmain.js` (main side, `lazyIpc`: loads on the first `tickets:op`):
  - **Files**: `data/tickets/index.json`, read carefully with datasafe-core and written atomically with crashsafe-core.
    The copies live in `data/tickets/<show key>/<id>-<name>.<ext>`.
  - **Ops**: `list` · `pick` (the native picker) · `add` (from a path or from bytes) · `remove` (Trash via the
    platform's trash check) · `suggest` / `hud` (Downloads listing) · `dismiss` · `pass` (zipkit reads `pass.json`;
    RemoteQR draws the QR) · `reveal` / `open` · `awake` (powerSaveBlocker 'prevent-display-sleep') · `test` (tests
    only).
  - **Downloads**: only names, sizes and dates are read, only when asked. A listing is kept for 20 s while the folder's
    date doesn't change. Tests never see the real Downloads: they use `<saves>/Downloads` or the check's own folder.
- `tickets-hook.js` (in the `questjournal` lazy group, after invite-hook). It does five things:
  - one `ShowSync.extend({ card, subs: ['ticket'], run, complete })`, which adds the button, the drop target and the
    Downloads line to every show card
  - one `QuestJournal.addDetailHook` for show quests
  - `logButtons` for showprep62's log
  - one small `list` read when the Studio loads
  - follows the `hearth:tickets` event
- `tickets.js` + `tickets.css`: lazy group **`tickets`** (tier `use`), loaded on the first click. It holds the adding
  (picker, drop, Downloads), the view, and Remove. Every change is announced on `document` as `hearth:tickets` { list }.
- Small additive edits outside my files:
  - `questhud.js`: "🎟 Ticket ready" and "Is this your ticket" rows, plus the show quest card's button. They're asked
    for once when the panel opens, and again after a ticket change if the panel had already asked.
  - `weekendplan.js`: the night slot's button. The weekend card also ignores clicks and Esc that belong to the ticket
    view.
  - `showprep.js`: the log's 🎟 My ticket and the How was it? line.
  - `main.js`: one `lazyIpc` line.
  - `preload.js`: `hub.tickets.op`.
  - `lazy-data.js`: the group, the hook in `questjournal`, and the regenerated META (the keys line).
  - `index.html`: `tickets` added to the `lazy-at.js#…` tag.
  - `dev/run-checks.js`: the unit test and a `tickets68` group.
- No idle cost: no timer, no watcher, no polling. The tracker asks only when its panel opens.

## For Codex
- No Codex file was edited. This stream uses only your public hooks: `QuestJournal.addDetailHook(fn)` (an aside on
  `c-show-*` quests, class `tk-aside`) and the kit's `button` / `E` / `label` / `p`.
- It reads `campaign.show` { key, title, start, venue, address, dateOnly } as showsync61 writes it, and never writes the
  journal.
- If you add a lineup to `campaign.show`, the tracker's Downloads match gets better. Until then it uses the show list's
  lineup when that list is loaded, and the title's named parts otherwise.

## Tests
- `node dev/tickets68-test.js` (unit, in UNIT): 27 checks. It also passes under TZ=America/Los_Angeles and Asia/Tokyo.
  - **File kinds and safe copy names.**
  - **The night's phase**: a concert, a 1 am club start, a 23:30 club night ending at 2 am, a date-only listing, both
    summer-time changes, and no date at all.
  - **The index**: damaged forms are refused; duplicates fold; a show holds up to 6 files; removal works; the summary
    lists only today's tickets as ready.
  - **Dates in names**: 8 ways of writing them.
  - **Matching**: artist, title, a title's named parts with no lineup, venue + date, venue alone (no), another date
    (no), the next calendar day of a club night (yes), generic names (no), two tied shows (no), old / dismissed /
    already-ticketed / past / non-ticket files (no), and the best of two files.
  - **The main side on a throwaway folder**:
    - the copy is made and the owner's file is untouched (same bytes and date, still in place)
    - the same file twice is one ticket; bytes from a browser drop work; HEIC and missing files get plain reasons
    - list; the Downloads suggestion (the folder unchanged afterwards), hud, and dismiss
    - "ready" on the day
    - a generated .pkpass: its words and an `<svg>` QR code
    - remove → the trash folder
    - an unreadable index is never written over: add and dismiss are refused, the files are kept
- `dev/checks/tickets68.js` (app, throwaway profile). It uses showsync61's sample shows through `shows:test`, a
  **generated PNG** (canvas) and a **generated one-page PDF** (written by hand), the check's own Downloads folder, and
  the picker answered by the check. By clicking:
  - **A show card**: 🎟 Add my ticket (the code not loaded before the click), the Downloads suggestion (the holiday
    picture is not offered), Add it, the copy under the show, the Downloads file untouched, then 🎟 Open my ticket.
  - **The PNG view**: covers the window corner to corner, white, the image over half the height, the hint, ⛶ and ×.
  - **Another show**: the picker → the **PDF in the view**; a picture dropped on the card → 1 / 2 with ‹ ›; ⋯ More ›
    Remove → the trash folder, the owner's PDF still in place.
  - **The ✦ tracker**: "🎟 Ticket ready · …" opens the view; "Is this your ticket for …?" → Add it; the show quest card
    says 🎟 Open my ticket.
  - **The weekend plan** (offline): its night slot's 🎟 Add my ticket → the picker → 🎟 Open my ticket.
  - **After the night**: Shows I went to → 🎟 My ticket → the "kept with it" view → Remove asks twice.
  - **Chat**: `/shows ticket` opens the view.
  - Zero AI calls throughout.
  - Screenshots were checked by eye: the PNG view, the PDF view (it renders in Chromium's viewer), the after view, the
    card with its suggestion, the tracker and the weekend plan.
- **Results**: tickets68, showsync61, invite67, lazy, unit:boot-test, weekendplan66, unit:tickets68-test,
  unit:weekendplan-test, unit:questhud-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan and
  unit:commandonly-scan pass. Two checks fail, and neither failure comes from this stream:
  - showprep62 fails at "timed out: visited pins", the failure invite67 already reported on its base.
  - questhud61 fails at "timed out: Studio repainted". It fails the same way on the untouched base commit (run on a
    clean copy), and round 67 lists it as one of Codex's stale checks.

## Risks
- **PDF look**: a PDF shows in Chromium's own viewer, which draws a dark grey border around the page. The page itself
  is white and fitted.
- **Brightness**: Hearth can't change the screen's brightness. It shows the hint and keeps the screen awake.
- **Wallet passes**: only QR codes are drawn. Aztec and PDF417 passes need Wallet (Mac) or the phone.
- **Two computers**: tickets live in the data folder. If the owner syncs Hearth's data through a cloud folder, they go
  wherever the rest of the data goes.

## For the patch notes
- **Keep your ticket with the show.** Open a show's card (Sidequest Studio › Map › ✦ Shows this week → a show) and
  click **🎟 Add my ticket**. Pick the PDF, screenshot or Wallet pass, or drag the file onto the card. Hearth keeps its
  own copy, and your file stays where it was.
- **At the door**, click **🎟 Open my ticket**. The ticket fills the whole window on white, ready to scan. Turn your
  screen brightness all the way up; **⛶ Full screen** makes it even bigger, and the screen won't go to sleep while it's
  open.
- On the day, the **✦ quest tracker** shows **🎟 Ticket ready · the show** at the top. Click it to open the ticket.
- The same button is on the **show quest** and on the night out in **🗓 Plan my weekend**.
- Already downloaded the ticket? When a file in **Downloads** is named like the show, the card asks **"Is this your
  ticket for …?"**. Click **Add it**, or **Not this one**. Hearth never moves or opens your Downloads files.
- After the show, the ticket stays with the night in **Shows I went to** (🎟 My ticket). Click **Remove (Trash)** in the
  ticket view when you don't need it any more. It goes to the Trash, not deleted for good.
