# Sidequest city integration — 18 October 2026

When desk motion was off, the shared pause rule froze Forge's dialog entrance at opacity zero. The modal backdrop still blocked the app. Journal dialogs now appear without an entrance animation, including nested dialogs and app-away states. Dialog actions invoked from chat activate the Studio before opening.

The existing Outing desk was present but disconnected from the map. It now has a workstation entry and three visible map actions: Explore places, Find events, My lineup. Discover has an explicit Load Paris events / Check for new events button. The feed remains an explicit two-request refresh, with a 15-minute cooldown and last-good-cache fallback; no background network or engine call was added.

Cached upcoming events become amber calendar pins grouped by coordinates, without consuming saved-place slots. Map lane, search and saved filters apply to these pins; a guide-only filter excludes event pins. A venue pin lists its events and opens a saved outing planner. The existing planner covers a friend, visit time, estimated costs, calendar export and a creative take-home quest with the existing proof/review gate. ShowSync's Keep in my lineup now opens the actual saved event, rather than landing silently on Discover. No booking, payment or message is sent.

Explore places adds the guide in one action, preserving edits and reporting the 100-place cap. Eight places bring the guide to 44, with specific loops, patch demos, movement studies, storyboards and Forgeheart room sketches. Removing the guide now preserves edited pins and walk-linked stops as well as visited/starred/quest-linked places.

## Sources

Venue addresses were checked on official pages; approximate entrance coordinates came from IGN's public address geocoder (`data.geopf.fr/geocodage/search`). Source buttons are included on the new place panels. Check each programme before travelling; these are venue quests, not invented dated events.

- [CENTQUATRE](https://www.104.fr/infos-pratiques)
- [Le Hasard Ludique](https://www.lehasardludique.paris/infos-pratiques)
- [Forum des images](https://www.forumdesimages.fr/infos-pratiques)
- [FGO-Barbara](https://fgo-barbara.fr/infos-pratiques)
- [Supersonic](https://supersonic-club.fr/infos-pratiques/)
- [Maison de la Radio et de la Musique](https://www.maisondelaradioetdelamusique.fr/)
- [BnF Richelieu](https://www.bnf.fr/fr/richelieu)
- [Musée Bourdelle](https://www.bourdelle.paris.fr/decouvrir)
- Dated events: [Ville de Paris open agenda](https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/), retaining event source links and attribution.

## Validation and handoff

- Node: city-integration-test, outing-test, quest-paris-test, questwalk-test, quest-field-test.
- Isolated Electron: city-integration (23 checks + real reload), outing-desk (75 + reload), quest-icons (230), quest-paris (45). Includes motion off, chat entry, nested dialog under app-away, grouped pins to saved plan to proof quest, narrow planner, filtering and persistence.
- Read-only live agenda probe: 196 usable events / 145 mapped venues at time of check. This is a bounded selection, not a complete city calendar. UI tests use fixtures and offline tiles; no real account data was changed.
- Screenshots in `C:/Users/quent/Documents/Codex/2026-08-23/do-x20/outputs/city-integration/`.

Branch `codex/sidequest-city-integration`, based on main `9c5eccd6`. Claude retains main merge and updater release ownership. Live checkout, unrelated dirty changes, app process and user data are untouched. No dependency or lazy-registration change.
