# lifechecks70: quest checks on the Life space (round 70)

Twelve checks were red on main after Codex's redesign of Sidequest Studio into the **Life** space (sweep69 list):
quest-deck, quest-session, quest-journal, quest-life, quest-workstation, quest-world, quest-icons, quest-focus,
quest-field, quest-paris, mapfirst64 and city-integration. I ran each one on the current main and decided, step by step,
whether the app or the check was wrong. Three were real app problems, and I fixed them. The rest were stale checks. I
updated them to the current UI and kept what each one verifies. Every changed line is marked "(lifechecks70)".

## Real app problems (fixed)

1. **Any single quest in Find a quest can be taken now.** (quest-deck) The fix is in `tools/quest-journal.js` `deckBrief()`.
   The old mixtape dealt three cards at a time, and `QuestCore.takeCard` only accepts a card from that dealt hand. The
   redesign dropped the deal from the screen and lists all ~30 mixtape cards as "Single quest" cards in Find a quest.
   **What the owner saw:** after opening most of those cards, "Take this quest →" failed with "Deal or open this card
   before taking it." Only the three cards still in the hidden hand worked. Now opening a card's brief counts as the
   "open" step: the card joins the hand, and the old hidden mixtape filters are reset first. A hidden ("Not my thing")
   card still can't be taken. The three-slot limit and `takeCard`'s own rule are unchanged, so `dev/quest-deck-test.js`
   still passes.
2. **"Add a place" is back on Life › Map.** (quest-field, quest-focus) The redesign removed the Map row's "Add a place"
   link. After that, the only way to pin your own place was to double-click the map, and nothing on screen says so. The
   link is back in the Map panel, next to Places. It opens the same form, centered on the map.
3. **My plans shows a plan's quest progress again.** (quest-world) The old Saved plans notebook showed "1/3" for a trip
   made into a quest, and "Resting" for a plan you let rest. The new combined **My plans** list showed only the date.
   Now it shows the progress or the resting state, as before.

## Stale checks (updated to the current UI)

- **quest-session**: the session desk shows on Today only when there's a bookmark. The picker is Today › **Find a small
  step**. "Begin quest →" is now **Quest details**.
- **quest-journal**: the illustrated desk (five SVG objects, bench captions, a lift on hover) is now three tabs, Today /
  Map / Progress, each with an SVG icon. The check now covers each destination through the tabs and their links, arrow
  keys between tabs, and Enter keeping focus. "Make this smaller" is now the quest dialog's **2-minute start**. Starting
  a campaign moved to Find a quest › **+ Your own**. A daily quest is started from Find a quest, since Today no longer
  lists invitations. Journal options moved to Settings › **Journal & backups**. Leaving the creative tool now uses the
  rail's Life button, because the Playground heading is hidden.
- **quest-life**: life routes are Find a quest cards with the Everyday-life interest. Open gives the preview / Accept /
  Continue / Resume / Let this rest. The check now verifies "1 / 3 finished" and Resting on the card. Motion is in Settings.
- **quest-workstation**: lamp and Personalize are in Settings. The equipped title shows next to the callsign.
  Personalize opens on top of Settings, so the check uses the newest dialog.
- **quest-deck**: the mixtape is the "Single quest" cards in Find a quest. Save, Not my thing, Restore, the creative
  constraint, proof, park, resume (from Today's Parked fold), narrow layout, motion and the three-slot limit are all still
  checked. The deal / Room to play / passport UI no longer exists, so those steps are gone.
- **quest-world / quest-field**: "Friends & dates" is now Map › **Friends**, and "Saved plans" is now Map › **My plans**.
  The field rewards open from the place panel ("Pick a little reward"). Map search now lists matches below the field,
  and Enter or a click picks one. It no longer jumps to a place on every key press (Codex's 1b0e907). The empty case
  offers "Clear map search".
- **quest-icons**: Codex keeps action labels visible (an icon plus text; only × is icon-only), so the check covers
  `.qj-action` instead of the icon-only class. The pages are Today, Find a quest, Skills, Rewards, Collection and Map.
  The check now picks a hint you can see and moves focus away first. It also takes its "nothing changed" snapshot
  after the map's one-time guide seeding.
- **quest-focus**: the Nights layer's club pins count as pins too. The check counts the journal's own six by id.
- **quest-paris**: map search redraws its pins on the next frame. The check waits for that instead of a fixed 150 ms.
- **mapfirst64**: the strip has gained errands67's **＋ Errand** button. It is still one row.
- **city-integration**: since Codex's quieter map (65b428c), only events you keep get a venue pin. paris-quiet-map
  checks the same rule. The check now plans the venue's event from the Outing desk, then checks that its pin appears and
  opens it. "Explore places" is now the strip's **More places**. The kind filter is now the Place category select. It
  reads the open desk's tab. Side note: closed Outing desk dialogs can stay in the page after closing. That isn't visible,
  but it could be worth a look.

## Round 61–69 click-first entry points

I checked that each one is still visible on the Life space: the ✦ quest tracker on the rail (questhud61), the map
strip's Layers / Food & stops / Nights / My walks / Visited / More places / Plan a walk / ＋ Errand (mapfirst64,
mapbuttons66, errands67), I'm here (herepin66), and This week (Today). "Add a place" was the one entry point the
redesign had hidden, and it is restored (above).

## For Codex

- `tools/quest-journal.js` (3 small edits, commented): `deckBrief` take puts an opened card in the hand; the Map
  panel has an "Add a place" link again; `savedPlans` shows progress / Resting for world plans and sets `data-plan`.
- Check files updated: quest-deck, quest-session, quest-journal, quest-life, quest-workstation, quest-world,
  quest-icons, quest-focus, quest-field, quest-paris, city-integration; mapfirst64 (ours).

## Tests

All passing on this branch, run under `flock /tmp/hearth-run.lock` with at most 5 per hold: the 12 checks plus
questhud61, herepin66, mapbuttons66, errands67, lazy, unit:boot-test, unit:quest-test and dev/quest-deck-test.js. In
the full run, quest-icons once failed "browsing and hints do not modify progress", because the map stores the guide's
picks the first time it opens. It now opens the map and lets that settle before it takes its snapshot, and it passed on
the re-run.

## For the patch notes

- In Life › Find a quest, every single quest can be taken now. Before, most cards answered "Deal or open this card
  before taking it."
- Life › Map has an "Add a place" link again, for pinning your own spot. Double-clicking the map still works too.
- Life › Map › My plans shows how far a trip quest has got ("1/3 done"), and marks plans you let rest as "Resting".
