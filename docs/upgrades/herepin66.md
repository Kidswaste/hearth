# herepin66 (round 66): "📍 I'm here" on the Paris map

When you're out in Paris, you can tell Hearth where you are by clicking a spot on the map. It doesn't use GPS or the
network. It then shows what's close, by walking time, with a one-click start. The spot is kept on this computer only,
and it's forgotten after 3 hours.

## Upgrades

On the map (Sidequest Studio › Map)
1. **📍 I'm here button**, top right of the map. Click it, then click the map where you are. The button turns into
   **Cancel** and a small hint says "Click the map where you are now". Esc also cancels. A pin under your click doesn't
   open its panel; the spot is the point you clicked.
2. **Use the map's centre**, in that hint: puts the pin at the middle of the map without clicking it (handy with a
   keyboard or a touchpad).
3. **Your pin on the map**: a blue target, "You are here (pin set 12 min ago)". It gets lighter each hour and is
   gone after 3 hours. Click it to open Close to you.
4. **Close to you panel**, on the map under the button. It lists the nearest place quests, **shows tonight**
   (Shotgun / DICE shows until 6 am; ended or cancelled ones are left out) and **park-jam spots** (the Paris guide's
   music-outdoors parks). Up to 8 of them, all within 45 minutes on foot, nearest first.
5. **"about N min walk"** on every row: straight-line distance at an easy 4.5 km/h. Each row also shows its
   arrondissement and type, or the show's time and venue.
6. **Start this quest** on every row: a place starts its go → do → proof quest; a show saves its "Go see …" quest; a
   park-jam spot starts the "Make music at the park" session there. Its first step opens. Started ones read
   **Continue quest**; finished ones **Done ✓**.
7. **Show on map** on every row: a place on your map is selected, and its panel opens beside the map. Anything else
   (a show's venue, a guide place not on your map) is marked with a gold star and the map centres on it.
8. **× hides the list** and the pin stays. **Close to you · N** brings it back. The panel's footer has **Move my pin**
   and **Clear pin**.
9. The panel says how old the pin is and when it fades: "pin set 40 min ago · fades in 2 h 20".

In the ✦ quest tracker (the rail's quest chip)
10. **📍 Near me · N close**: one row in the tracker while a pin is set. Click it to go to the map with Close to you
    open. With no pin, or after 3 hours, the row isn't there.
11. **⋯ More › Near you… › 📍 I'm here: click my spot on the Paris map…** opens the map ready for your click.

Chat (secondary)
12. `/quest here` lists what's close, or opens the map to pick a spot. `/quest here pick` picks a new spot, and
    `/quest here clear` forgets it.

Privacy and safety: no GPS (the computer's location is never asked) and nothing goes over the network. The pin is one
small entry in this computer's localStorage (`herepin.pin`, never in the quest journal or the data folder). It's
dropped when it's older than 3 hours or isn't a valid Paris spot. Starting a quest goes through the journal's own save
(`QuestJournal.paris.mutate` / `ShowSync.makeQuest`), the same as the map's own buttons.

## Files
- `tools/herepin-core.js` (new, lazy group `questcore`): distance → walking minutes, the 3-hour pin, tonight's shows,
  candidates and nearest-first ranking, and the tracker row's words. No DOM, so Node tests can load it.
- `tools/herepin.js` + `tools/herepin.css` (new, lazy group `questjournal`): the map layer (pin, select, `below()` →
  the button and panel inside the map), picking, Close to you, Start / Show on map, `/quest here`.
- `questhud.js` / `questhud-core.js`: the Near me row, the ⋯ More item, the `here` word for `/quest`.
- `lazy-data.js`: the new files in their groups (they register no command, palette action or tool, so the manifest is
  unchanged).

## For Codex
- `tools/quest-atlas.js`: one added line in `mount()` (after `host.append(…)`), `host.qjHere = { at(clientX, clientY)
  → { lat, lon }, go(point, zoom) }`. `at` is the same sum the map's double-click uses. Nothing else changed. Without
  `tools/herepin.js` nothing calls it.
- The map layer uses the existing `QuestJournal.addMapLayer` contract (`pins`, `owns`, `select`, `below`). Its pins
  are `herepin-me` and `herepin-look`, with tone classes `hp-me-0/1/2` and `hp-look`. `below()` returns null and puts
  `.hp-dock` inside `.qj-atlas` (top right). It's kept across re-renders and rebuilt only when what it shows changes.
  When the shows' status line is up (top right), the dock moves under it.

## Tests
- `dev/herepin66-test.js` (unit, 9 checks): haversine metres; minutes at 4.5 km/h, never 0; "about N min walk"; the
  pin's validity, rounding and Paris bounds; it fades at 3 h and gets lighter each hour; age / fade words; tonight runs
  until 6 am, and ended, cancelled and date-only listings follow showsync's rule; candidates from the real guide
  (jam-tag spots; shows placed by their venue or the map's venue pin); ranking (nearest first, ≤ 45 min, ties show →
  jam → place → name, no duplicates, limit); the tracker row.
- `dev/checks/herepin66.js` (group `herepin66`, 32 steps, clicks only and real mouse input; it fails if a chat
  command is used). It runs on the smoke run's throwaway profile, with saved Shotgun / DICE responses, offline tiles and
  one made-up show tonight. Steps: the labelled button on the map; Esc cancels; a real click sets the pin at exactly
  that point and the marker is drawn there; no GPS call and no http request; no place added and no dialog opened; the
  pin is in localStorage and not in the journal; the panel has place / show / jam rows sorted by minutes, matching an
  independent haversine at 4.5 km/h; Start this quest for each kind (place → tracked + first step, show → show quest,
  jam → the park quest at that spot); Continue quest; Show on map for a place (selected) and a show (marked, centred);
  × / Close to you · N; the ✦ tracker's "📍 Near me · 8 close" → the map; 2½ h → lighter and "fades in 30 min"; 3 h →
  no pin, no panel, stored pin forgotten, no tracker row; Use the map's centre; Move my pin; Clear pin.
- Results: `herepin66` ✓, `unit:herepin66-test` ✓, `unit:boot-test` ✓, `unit:questhud-test` ✓. Note: right after
  the map first opens, the Studio is still busy for a moment (seeding the guide, the week's shows), and a click in that
  first ~half second could go unanswered. The check now waits for the map to settle before its first click. Any click
  that gets no answer is retried and listed in the result (none in the last run; at most one is allowed).
- `lazy` ✖, on the two failures already known on main before this stream (round 66 notes, lazyfix66's job): "all
  held at start" (the `projects` group loads at boot) and "starts on the Lab" (the start surface is the Desk). Nothing
  in it points at these files.
- `unit:datasafe-scan` ✖ and `unit:winmac-test` ✖, on Codex files already on main (`tools/quest-chat.js`,
  `cloud-files.js`, `sync-engine.js`). None of this stream's files are named.

## For the patch notes
- **New: "📍 I'm here" on the Paris map.** In Sidequest Studio, open **Map** and click **📍 I'm here** (top right of
  the map), then click where you are. No GPS, nothing sent: the spot stays on this computer and fades after 3 hours.
- **Close to you** opens right on the map. It shows the nearest place quests, tonight's shows and park-jam spots, with
  "about N min walk" on each. Click **Start this quest** to begin one, or **Show on map** to see where it is.
- **In the ✦ quest tracker**, a **📍 Near me** row shows while your pin is set. Click it to jump back to what's close.
  You can also set the pin from the tracker's **⋯ More › Near you… › 📍 I'm here**.
- **Move my pin** and **Clear pin** are at the bottom of the Close to you panel. Click **×** to hide the list while
  keeping the pin.
