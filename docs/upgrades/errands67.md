# errands67 (round 67): Errands, practical quests with opening hours

A quest like "go to the Apple Store (ideally Opéra) to get AirPods" is an errand. It matters that the shop is open.
You can now add an errand by clicking. Type what you need, then choose a shop from a short list of well-known Paris
shops (or click a spot on the map). It shows on the map, in the ✦ quest tracker and in "Close to you", each time with
a badge such as **Open now · closes at 20:00**, **Opens at 10:00** or **Closed today · opens tomorrow at 10:00**.
**Done ✓** completes it as a quest. Nothing is looked up on the internet. Shop hours are the usual hours, and the card
always says "Usual hours, check before going".

## Upgrades

Adding an errand
1. **＋ Errand in the ✦ quest tracker**: one row in the tracker's panel. It's there even when you have no errands.
2. **＋ Errand on the Paris map**: one chip at the end of the map's chip row (bottom left).
3. **＋ Errand… in the tracker's ⋯ More menu**.
4. **The errand card**: "What do you need?", "Where", "Opening hours", then **Add errand**. If something is missing,
   one plain sentence under the form says what. Nothing is saved until it's right.
5. **Shop suggestions while you type**: "AirPods" puts Apple Opéra first, then the other Apple stores and Fnac.
   "doliprane" shows the 24 h pharmacies, "used books" shows Gibert Joseph and "screws" shows BHV. With an
   "📍 I'm here" pin set, the nearest shop comes first among equals.
6. **A built-in list of 13 well-known Paris shops**: Apple Opéra, Apple Champs-Élysées, Apple Marché Saint-Germain,
   Fnac Saint-Lazare, Fnac Forum des Halles, Fnac Montparnasse, BHV Marais, Galeries Lafayette Haussmann, Printemps
   Haussmann, Gibert Joseph Saint-Michel, Monoprix République, Pharmacie des Champs-Élysées (24 h) and Pharmacie
   Européenne place de Clichy (24 h). Each one has its address, its area and its usual hours.
7. **"Usual hours, check before going"** under the hours whenever they're a shop's built-in ones. If you change them,
   it says "Your hours" instead.
8. **Click a spot on the map…** for anywhere that isn't on the list. The card steps aside and a hint at the top of the
   map says "Click the map where you'll get …", with Cancel (Esc cancels too). Click the map and the card comes back
   with that spot, plus a box to name it ("Cordonnerie").
9. **Hours you can type in plain words**: "Mon–Sat 10:00–20:00 · Sun closed", "lun-ven 9h-19h; sam 10h-18h",
   "Mo-Fr 09:30-19:00", "Monday to Friday 9am-6pm", "Daily 10-20; Tue closed", "weekdays 8-20 · weekend 10-18",
   "24/7", a lunch break ("Mon-Fri 9-12, 14-18") and late nights ("Tue-Sat 22:00-02:00"). A day you don't mention is
   closed. Leave the box empty if you don't know, and the badge says "Hours unknown".
10. **A live "Right now" badge in the card** that updates as you type the hours. If Hearth can't read them, it shows
    how to write them.

The badge
11. **Open now · closes at 20:00**, **Closes soon · at 20:00** (within the hour), **Opens at 10:00** (later today),
    **Closed now · opens tomorrow at 10:00** / **opens Mon at 10:00**, **Closed today · opens …**, **Open 24 h**.
12. **Sundays and closing days**: a day with no hours reads "Closed today", and the next opening skips over closed
    days. Saturday night says "opens Mon".
13. **Late nights**: a 22:00–02:00 place reads "Open now · closes at 02:00 (late)" in the evening. The hours after
    midnight still count as the night before, so at 01:30 on Sunday it says "Closes soon · at 02:00" even when Sunday
    is a closed day.
14. **24 h and long stretches**: a place open around the clock reads "Open 24 h". A Friday night that runs through
    the weekend says when it really closes ("closes at 20:00 Sun").
15. **Colours**: green when open, amber when it closes soon, gold when it opens later, red-grey when closed. The same
    colours are used on the map pin, the tracker and the card.

Where errands show
16. **On the map**: a gift-bag pin at the shop or spot, labelled "AirPods · open till 20:00". Closed ones are drawn
    lighter. Click the pin to open its card.
17. **"Errands" in the map's Layers panel**, on by default, with its count ("Errands (1)"). Switch it off to hide them.
18. **In the ✦ tracker**: an "Errands" section with each open errand (open ones first, the one closing soonest at the
    top), its shop, its badge and **Done ✓**. Click the name to open the card.
19. **In "Close to you"** (the 📍 I'm here panel): an errand near your pin appears as an "Errand" row with "about N min
    walk", the shop, its badge, **Done ✓** and **Show on map**.
20. **In Sidequest Studio**: an errand is a quest (path Everyday Adventurer). Its quest detail shows the badge, the
    hours, **Done ✓** and **Edit errand…**.

Finishing and changing
21. **Done ✓** (in the tracker, in Close to you, on the card, in the Studio) completes the errand's quest: +15 XP, and
    it counts in your week review and My Paris. Errands are self-reported (like the map's visit stamp), so no proof
    review is asked.
22. **Edit**: click an errand's pin or its row in the tracker to change what, where or the hours. **Save** keeps the
    same quest.
23. **Remove** on the card, with a confirm, takes the errand off the map and out of your quests.
24. **Show on map** on the card centres the map on the errand. If the Errands layer was off, it's switched back on.

A fix found on the way
25. **Map Layers switches now work with a real mouse click.** In round 66's Layers panel, pressing a switch's label
    started a map drag, so the switch didn't move with a mouse (the checks clicked it from code and passed). Presses
    and the mouse wheel inside the panel now stay in the panel, and scrolling the list no longer zooms the map.

Chat (secondary)
26. `/quest errand` lists your errands with their badges. `/quest errand AirPods at Apple Opéra` opens the card filled
    in, and `/quest errand done AirPods` completes it.

## How it works
- `tools/errands-core.js` (new, lazy group `questcore`, Node-testable): reads and writes opening hours, works out the
  status for this computer's clock, holds the 13 shops and the suggestions, and does the errand changes in the journal
  (`add`, `edit`, `complete`, `remove`, `list`).
- `tools/errands.js` + `tools/errands.css` (new, lazy group `questjournal`): the card, picking a spot on the map, the
  map layer `errands`, the ＋ Errand chip, the Studio detail hook and `/quest errand`.
- Store: Codex's quest journal only. Each errand is one small campaign, `c-errand-<id>`, with one quest
  `q-errand-<id>-1` and an extra field `c.errand = { v: 1, what, place: { name, addr, lat, lon, shop }, week, usual,
  createdAt, doneAt }`. `week` holds 7 lists of `[open, close]` minutes (index 0 = Sunday). A close above 1440 means
  after midnight. The writes go through `QuestHud.write`, which uses `QuestJournal.mutate` when the Studio holds the
  journal, so datasafe rules, validation and the `hearth:quests` event are the journal's own. Adding an errand never
  changes the main quest (`s.active`).
- Nothing is uploaded or looked up, and there are no timers or polling. The badges are worked out each time the map,
  the tracker, Close to you or a card draws. A map left open for hours shows the badge from its last draw.

## For Codex
- **Errands are journal campaigns with one extra field** (`c.errand`, see above). `QuestCore.validate` accepts them as
  they are. Ids are `c-errand-…` and quests are `q-errand-…-1`, path `life`, 15 XP, 30 min.
- **Done ✓ is self-reported**: `ErrandsCore.complete` writes `s.records[qid] = { completedAt, note: "Errand done: … Self-reported.", artifact: null }`
  directly instead of calling `QuestCore.complete`, because the studio rules (`s.studio`) would ask for proof and a
  review, which doesn't make sense for buying AirPods. It's the same idea as the map's visit stamp. `QuestCore.undo`
  works on it as usual. If you'd rather have a QuestCore-level exception (for example `q.selfReport: true`), swap it in
  `complete()` and nothing else needs to change.
- **Codex files touched: none.** Everything plugs into your existing hooks: `QuestJournal.addMapLayer` (layer
  `errands`, pins `er-c-errand-…`, tones `er-open / er-soon / er-later / er-closed / er-unknown`, kind `gift`),
  `QuestJournal.addDetailHook` (an errand's quest detail gets its badge, Done ✓ and Edit errand…), and the
  `host.qjHere.at()` hook from round 66 for the map click.
- `tools/quest-atlas.js` captures the pointer on `pointerdown` for anything that isn't a `button` or an `a`. Any
  overlay with labels or inputs inside the map element has to stop `pointerdown` itself (see item 25). Changing that
  rule in quest-atlas.js (for example skipping `label,input,select,textarea`) would fix it for everyone.

## Ours, touched
- `tools/quest-mapfirst.js`: `errands` in `DEFAULTS` (on) and `LAYER_OF`, an "Errands" row in the Layers panel, the
  ＋ Errand chip in the strip, and the Layers panel keeping its presses and wheel (item 25).
- `tools/herepin-core.js` / `tools/herepin.js`: errands among the candidates (kind `errand`, ranked after tonight's
  show and before park jams at the same distance), and their row in Close to you.
- `questhud.js` / `questhud-core.js` / `questhud.css`: the Errands section and ＋ Errand row, the ⋯ More item, the
  `errand` word for `/quest`, and the badge styles.
- `lazy-data.js`: the new files in `questcore` and `questjournal`. They register no command, action or tool, so the
  manifest is unchanged (`node dev/lazy-manifest.js` was run and left it as it was).
- `dev/run-checks.js`: `errands67-test` in the `UNIT` list and the `errands67` group.

## Tests
- `dev/errands67-test.js` (unit, 19 checks, passes in Paris, New York and Auckland time zones). It covers:
  - reading hours in English, French and OSM style, in 12 h and 24 h, with daily, 7/7, weekdays / weekend, lunch
    breaks, split day lists, overrides and ranges that wrap the week
  - writing hours back and reading them again (round trip)
  - errors that say how to write the hours
  - every status (open, soon, later, closed now, closed today, never, unknown) on weekdays, Sundays and closing days
  - late nights and the hours after midnight, including Sunday's small hours
  - 24 h places and stretches that run over several days
  - the 13 shops, and the suggestions (AirPods → Apple Opéra first, nearest first with a pin)
  - an errand in a real QuestCore journal: it validates, it doesn't take the main quest, Done ✓ gives +15 XP with the
    studio rules on, a second Done ✓ is a no-op, edit, remove (it still validates), the order of the list
  - an errand in Close to you's ranking
- `dev/checks/errands67.js` (app, real clicks only, isolated throwaway profile, offline). It walks through:
  - the tracker's ＋ Errand, typing "AirPods", Apple Opéra first, its usual hours and the "Right now" badge, then
    Add errand
  - the tracker row with the same badge
  - the map pin and its label
  - Layers › Errands (1), on by default, switched off and on with real clicks
  - the map chip, Click a spot on the map…, a real map click, the spot named, typed hours with a lunch break, saved
    exactly there
  - the pin opening its card
  - 📍 I'm here near Opéra: Close to you lists the errand with its badge, and Done ✓ there gives +15 XP and the errand
    leaves the list and the map
  - Done ✓ in the tracker
  - no chat command, no network request, nothing opened in the browser
- Passed: errands67, unit:errands67-test, herepin66, unit:herepin66-test, mapbuttons66, lazy, unit:boot-test.
- These fail the same way as on the untouched base: questhud61 ("Studio repainted"), unit:datasafe-scan (Codex's
  quest-chat.js) and unit:winmac-test (1 shell-cmd hit). weekendplan66 and mapbuttons66 already noted them.

## For the patch notes
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
