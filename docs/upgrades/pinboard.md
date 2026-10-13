# pinboard (round 30): Find images like this — Pinterest and more, straight onto the mood board

The owner asked (round 14) for chats to "suggest images from Pinterest that match a vibe or an aesthetic". Until now
Hearth could only suggest *searches* (buttons that opened Pinterest in a window, where the owner added pins one by one).
Now that Hearth drives its own Chrome profile (round 30, chrome: chrome-cdp.js / chromemain.js), where the owner signs
in to Pinterest with their Google account, Hearth can open the search there, **read the pins on screen** and show them
in a picker inside Hearth. Picked ones land on the board as references with their link.

How it fits together:
- `pinboard-core.js` (pure, Node + page): the sites (Pinterest, Unsplash, Are.na, Cosmos), their search addresses, the
  page script that reads the pictures on screen (read only: no clicks, no typing, no requests), and the clean-up:
  the site's own results only, the biggest picture, a clean title, one per picture and per link, what the board has.
- `pinboard-hook.js` (loaded with the board): the ways in (board menus, the ◎ mission, `/find-images`, `board_do pins`),
  the picker card in replies, Are.na and Cosmos as app windows.
- `pinboard.js` + `pinboard.css` (lazy group `pinboard`, loaded on first use): the search (Chrome / the board's Pinterest
  window / an app window), the picker, adding the picks.
- Main side, small additive ops: `boardpinsmain.js` (`board:pins` read / scroll in the board's Pinterest window),
  `appsmain.js` (`apps:page` pins / scroll in any app window, in Hearth or in Chrome). Chrome is read through the existing
  `chrome:page` eval.

## Upgrades

### Find images like this (the board)
1. **Board ⋯ › 📌 Find images like this…** (also the board's right-click › Board): the board's vibe (palette, light, styles, moods, its brief) becomes the search words.
2. **Right-click on references › 📌 Find images like this…**: images like the selected ones (their vibe only).
3. **Add › 📌 Images like this board…** in the board's Add menu.
4. **◎ Mission "Find images for this vibe"** (under More in the missions picker): your message is the vibe or the aesthetic, with this chat's board; 0 tokens.
5. **Pinterest opens in the Hearth Chrome** (your Pinterest sign-in lives there) when Chrome is on this computer, as the Pinterest app window.
6. **Or inside Hearth**: the board's own Pinterest window; the picker's site menu says **Pinterest opens in Chrome / inside Hearth** (the same remembered choice as the app window's ⋯ › Open in Chrome). No Chrome → inside Hearth by itself.
7. **Reads only what's on screen**: the pictures shown now (and a quarter screen around), their links and titles; it never clicks, types, logs in or requests anything on the site.
8. **A sign-in page is noticed, not touched**: "Pinterest asks you to sign in: do it in Chrome (Hearth never sees your password), then Search again".

### The picker
9. **One search box** with the words Hearth chose (edit them, Enter searches), and up to 4 **other searches** from the vibe as chips.
10. **Tiles**: click (or Space / Enter) to pick, the title on hover, **↗** opens it on the site in your browser.
11. **Only the site's own results**: logos, avatars, icons, ads ("Promoted by" / "Sponsored") and shopping links are left out.
12. **Each picture once** (whatever size the page asks for: Pinterest's 236x / 474x / 736x, Unsplash's ?w=) and **each pin once** (any Pinterest country site).
13. **"N already on your board"**: pictures and pins the board has (same picture, same pin link, an earlier pick) aren't offered again.
14. **More ↓**: one more screen, a modest scroll at a person's pace; at most 6 per search; hidden at the end of the page.
15. **One more screen by itself** when the first shows fewer than 12.
16. **Add N to <board>**: only the picks are downloaded, now; the biggest version (Pinterest's 736x, Unsplash 1600 wide), else the one the page showed.
17. **Saved like a dropped picture** (the board's media folder), with **the link as the source**, the site as **credit**, the title, and a #pinterest / #unsplash … tag.
18. **Placed beside the board's content** when the board isn't on screen; a toast with **Show** selects and frames them.
19. Picker **⋯**: Show the page, Pick all, Pick none.
20. **The site menu**: 📌 Pinterest, 📷 Unsplash, ◼ Are.na, ✳ Cosmos; the last one is remembered.
21. **Unsplash** through its app window (in Hearth, or in Chrome if you set it so).
22. **Are.na** as an app window (Apps › Assets) and a source in the picker.
23. **Cosmos** as an app window (Apps › Assets) and a source in the picker.

### The AIs
24. **`board_do pins {query?}`** for agents with the board tools: Hearth searches (the board's vibe, or the query) and returns a short numbered list of titles (8 at most, ≈ 350 characters); nothing is added. The tool list grows by ≈ 20 tokens, only for agents with board tools (4,085 of 4,200 characters).
25. **The owner confirms**: a picker card under the reply (thumbnails, tick → **Add N to <board>**, **Open the picker…**); with no reply running, the picker opens instead.
26. **Saved replies draw the card again**; what's on the board shows ✓.
27. **The app map** (three_do help board / hearth-map) tells the AIs about pins and the owner's own ways in.

### Commands (the app's internal API; the menus and the mission are the way in)
28. **`/find-images [pinterest|unsplash|arena|cosmos] [vibe | aesthetic]`** (also `/images-like`), with completions for the sites and the known aesthetics.

## Tests
- `node dev/pinboard-test.js` (unit, 28 ✓): the page script runs on a tiny DOM built from saved pages
  (`dev/fixtures/pinboard-pinterest.html`: header logo and avatar, 24 pins with 236x/474x/736x srcsets and "This may
  contain:" alt text, the same picture as another pin, an ad, a shopping link, the same pin twice;
  `dev/fixtures/pinboard-unsplash.html`: w-descriptor srcsets, a banner, a sponsored photo, an avatar, the same photo
  twice): on-screen only, the traps left out, the biggest picture, titles, stable order, merging the next screen,
  what's already on the board, country sites, Unsplash sizes, search addresses, test bases, the sign-in page, and that the
  page script only reads.
- `node dev/smoke.js --pw-chrome --script dev/checks/pinboard.js` (`sh dev/run-checks.sh pinboard`, 34 ✓): Playwright's
  Chromium as "Chrome" and the fixture pages served by `dev/fake-cdp.js` (with generated PNG pictures): the ways in;
  board ⋯ › Find images like this… → the search in the Hearth Chrome (as the Pinterest app window), 12 clean pins, three
  picked → on the board saved locally with link / credit / title, only those; searching again leaves them out; More ↓;
  Pinterest inside Hearth (the board's Pinterest window); Unsplash in its app window; a sign-in page; the mission;
  `board_do pins` (list, size, the picker to confirm); the card adds what's ticked and shows ✓ later; the right-click item.
- Also run: `dev/board-mcp-test.js`, `dev/director-mcp-test.js`, `dev/boot-test.js`, `dev/apps-unit-test.js`,
  `dev/eyes-test.js`, `dev/chrome-test.js`; `node dev/lazy-manifest.js` (rewritten, the lazy build matches).

## Risks and what couldn't be tried here
- **No network, no Pinterest account here**: the reading was tried on local pages built like Pinterest's / Unsplash's
  results, not on the real sites. Pinterest changes its markup often; the reader keys on what has stayed for years (a
  picture inside a link to /pin/<id>/, srcset sizes, "This may contain:" alt text, data-test-id="pin" cards) and falls
  back to the alt text. If a site changes, the picker shows "showed no pictures" rather than wrong ones.
- **Are.na's and Cosmos's search addresses** (`are.na/search/<words>`, `cosmos.so/search/elements/<words>`) and their
  result links (`/block/<id>`, `/e/<id>`) are from memory, not verified; if they moved, those two sources show nothing.
- Pinterest may lazy-load pictures as you scroll; Hearth waits for two identical reads (≈ 1 s) and scrolls at most 6
  times per search, by design (respect the site). Big pictures (736x) are fetched without Pinterest's cookies; if one is
  refused, the one the page showed is saved instead.
- The picker's thumbnails are the sites' own https pictures; Hearth's page refuses plain-http pictures (the local test
  pages), so tests check tiles, not their pixels (the screenshot uses data: stand-ins).
- Opening Pinterest in Chrome brings its window forward (Chrome's own behavior); the AI's `board_do pins` does that too.

## Edits outside this stream's files (small, additive)
- `boardpinsmain.js` (+ `read` / `scroll` ops), `appsmain.js` (+ `pins` / `scroll` page ops), `board-pack.js` (merges
  PinboardHook.OPS, the op list), `mcp/board-mcp.js` (`pins` in board_do), `mcp/hearth-map.js` (one sentence),
  `lazy-data.js` (board group + the `pinboard` group, manifest regenerated), `index.html` (`pinboard` in a lazy-at tag),
  `dev/fake-cdp.js` (the /pinboard/ pages and pictures), `dev/run-checks.js` (group + unit), `FEATURES.md`.

## For the patch notes
- **📌 Find images like this**: on the mood board, ⋯ (or right-click) › Find images like this… finds pictures that match your board's vibe.
- Pinterest opens in your Hearth Chrome, where you're signed in; Hearth reads the pins on screen and shows them in a picker inside Hearth.
- Tick the ones you like → Add to your board: they're saved like a dropped picture, with their Pinterest link kept.
- Logos, ads and shopping pins are left out, nothing shows twice, and what's already on your board isn't offered again. More ↓ reads one more screen.
- Prefer Pinterest inside Hearth? The picker's site menu switches it. Unsplash, Are.na and Cosmos work too.
- In a chat: the ◎ mission "Find images for this vibe" takes your message as the vibe.
- AIs with board tools can suggest pins; you confirm in a small picker under their reply.
- Hearth never sees your password and only downloads the pictures you pick.
- Caveat: tried on local stand-ins of Pinterest and Unsplash; the real sites (and Are.na / Cosmos addresses) weren't reachable here.
