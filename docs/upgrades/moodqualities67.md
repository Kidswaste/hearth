# moodqualities67: moodboard qualities instead of copies (round 67, stream 3)

The problem: AI results made from the moodboard came out as near-copies of the inspiration, because a tile dragged into
a chat sent the picture itself (round 65, inspodrop65), and the old text "vibe" was too vague to act on. Now a tile
sends its **measured qualities** in plain words plus numbers, so the chat borrows the feel without seeing the image.

## Shipped
1. **Qualities, not the picture, by default.** Dragging a drawer tile into a chat (or its **Qualities →** button, or
   right-click › **Send its qualities**) attaches a `qualities · <name>.txt` chip with:
   - palette as hex values with their shares and colour names (`#e68c3c 56%, #281914 44% (orange, deep brown)`);
   - brightness (0–1 + low/mid/high-key, mostly dark/bright), contrast (0–1 + soft/medium/hard);
   - saturation (0–1 + muted/natural/saturated…), warmth (−1 cool … +1 warm);
   - texture: grain (0–1 + smooth/fine/heavy) and busy vs clean (edge detail 0–1);
   - composition: where the weight sits (centred / on a third / high-low-left-right), centre of interest in %, symmetry,
     negative space %, horizon height;
   - **shape language** (new): straight lines and right angles / strong diagonals / curves and organic shapes / soft flat
     shapes / scattered texture, from the edge directions (`BoardVibe.fromPixels` now keeps `shape: { straight,
     diagonal, spread }`);
   - clips: motion 0–1 + still/calm/lively/frantic, number of cuts, seconds per shot, cuts a minute, light over the clip;
   - mood words, your note and tags, and the explicit footage permission line when you gave one.
   It opens with "The pictures themselves were NOT sent; work from these qualities" and ends with the old vibe-only rule.
2. **"Send the actual picture" stays, clearly labelled.** Each picture/clip tile has a **Picture** button (on hover,
   next to **Qualities →**), right-click › **Send the actual picture / clip**, and **Shift while dropping**. These run
   round 65's `BoardDrop` unchanged (the file, or a clip's key frames + file). The board's top strip: click › **Send the
   actual pictures & clips**; Shift+drop it for the same. Alt+drop is still Board eyes.
3. **"What I like about this"** under every picture/clip/site tile in the drawer: click the line, type, Enter (Esc
   cancels). Stored on the item as `it.like` (one undo step on the open board). It goes first in what is sent, under
   "WHAT I LIKE (the strongest signal: follow this before anything else below)", and liked tiles weigh more in a mix.
   Also on the board itself: right-click a picture › **What I like about this…**; once written it shows as a ♥ caption
   under the picture (click it to edit).
4. **Distance slider "Close to it ↔ Only its spirit"** in the drawer under the board's colour strip, remembered per
   board (`board.qualityDistance`, default 50), read at every send:
   - **close to it** (0–33): every number, worded as targets ("match the palette hexes and their shares, brightness and
     contrast within about ±0.05 … Make a new image though: don't copy the reference picture itself"), with the title
     and what a chat once saw in it;
   - **in between** (34–66): palette numbers, light, colour, texture, shape, motion; composition in words only; "use
     these as a direction… pick your own subject and layout";
   - **only its spirit** (67–100): mood-level words only (key, contrast, warm/cool, muted…, colour families, texture,
     shape, energy), no hex values, no titles, and "Don't reproduce the subject, layout or recognisable elements of
     these references: take only their spirit."
5. **Mix 2–3 tiles.** Click tiles in the drawer to pick them (gold outline + ✓). With 2 or 3 picked, the **Mix of N**
   card shows the blended palette (`mergePalettes`, liked tiles weighted 1.4×), the averaged words and moods, and any
   tile still being measured; **Send the mix → <AI>** sends one `mix · …` block ("BLEND OF N REFERENCES"). The card's
   title can be dragged into a chat too. One tile picked: it asks for one or two more; more than 3: it says "mix 2 or 3
   at a time". On the board: select 2–3 and right-click › **Mix these N**.
6. **Never an empty block.** A tile the background reader hasn't reached is measured at send time ("Measuring … before
   sending…", 6 at most, 30 s each); one that runs out of time says "still being measured: … don't guess them". A file
   that can't be read says "couldn't be measured (<reason>). Leave it out rather than guess" (`it.vibeError`, kept), and
   a board that can't be loaded attaches nothing and says so. Drawer tiles show "· measuring…" / "· unreadable".
7. **The same block everywhere a vibe was sent**: `BoardDrawer.attach` now sends qualities unless a menu asked for one
   part ("Palette only", "Motion only"… under **Only one part (vibe text)**, the old `vibeText`). So `/board-use`,
   `/board-ask` and the board's "Ask a chat" questions, `/board-to-lab` (Lab director), a frame's vibe, the chat's
   attach menus and the rail ▦ right-click (**Send the board's qualities to this chat**) all send it. A whole board with
   more than 6 references is sent as one blend (with its brief, your notes and an AVOID list from ✕ / "Avoid" frames),
   so it stays short. Dropped into any other text field, a tile types its qualities.

## Where to click
- **▦ in the rail** (or Ctrl+Shift+M) opens the drawer over any chat.
- Drag a tile into the chat box → qualities. Hover a tile → **Qualities →** or **Picture**.
- The line under a tile → **What I like about this**.
- The slider under the colour strip → **Close to it … Only its spirit**.
- Click 2–3 tiles → **Mix of N** card → **Send the mix**.
- Right-click a tile → Send its qualities · Send the actual picture · What I like about this… · Pick it to mix · Only
  one part (vibe text).

## Files
- `board-qualities.js` (new, pure, Node-testable: `block`, `blend`, `card`, `status`, `band`, `shapeWord`), loaded in
  the board group in `lazy-data.js` before `board-drawer.js`.
- `board-vibe.js`: edge directions → `shape` in `fromPixels` (and a clip's middle look).
- `board-drawer.js`: `qualitiesText`, `measureNow`, `setLike`, `setDistance`, `distanceFor`; `attach` sends qualities by
  default; drop default / Shift swapped; tiles, like line, slider, mix card, right-click entries, the board's
  right-click (`Board._.itemExtras`) and `Board._.askLike`.
- `board.js`: the ♥ caption under a liked picture (`syncItem`, `it.like` in its key).
- `board.css`: the drawer pieces and the caption.
- Tests: `node dev/moodqualities-test.js` (pure), `dev/checks/moodqualities67.js` (window, smoke harness). Updated to
  the new defaults: `dev/checks/inspodrop65.js`, `board-chat.js`, `eyes-ui.js`, `journey-board.js`, and
  `dev/fake-common.js` (the fake director reads `qualities` / `mix` chips too).

## Not changed
- `board_look` (MCP, the director asking to see a reference) and `BoardPack.labLook()` are untouched: the first is an
  explicit "show me", the second is palette-only already.
- A board's "Chats get…" focus (`/board-focus`) still shapes `vibeText` (exports, `/board-vibe`) but no longer changes
  what a drop sends: the qualities block wins.
- Vibes measured before this round have no `shape` yet, so their block has no shape-language line until the item is
  re-read (right-click › Re-read the vibe) or measured again.

## Verified / not verified
- `node dev/moodqualities-test.js`: all pass (shape language on synthetic squares / rings / diagonals, every band's
  wording, like first, footage line, unmeasured and failed references, clips, blends, a 12-item board stays short).
  `dev/board-unit-test.js`, `dev/inspodrop-test.js`, `dev/eyes-test.js` still pass. Every changed file passes
  `electron --check`.
- `dev/checks/moodqualities67.js` passed on Windows in a throwaway app copy (`node dev/smoke.js --fake-engines --script
  dev/checks/moodqualities67.js`, with `ELECTRON` pointing at `electron\electron.exe`; empty data, its own profile), no
  page errors: like line typed and stored, plain drop → qualities with the like first, Shift+drop and the Picture
  button → the picture, an unmeasured picture measured at send time, a missing file → "couldn't be measured", the
  slider remembered on the board and the spirit wording, 2 tiles → mix card → "BLEND OF 2", right-click entries, and
  the board's "Ask a chat" question getting the qualities block.
- Not tried live in Quentin's own Hearth with a real Claude / Astra reply, so how much less a real model copies is
  not measured. The other updated smoke checks (inspodrop65, board-chat, eyes-ui, journey-board) were edited to the
  new defaults but not re-run here.
