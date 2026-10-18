# Familiar nights and a quieter Paris map

The default map now focuses on seven familiar clubs and twelve food/record/park stops, alongside the user's own places. Other Shotgun/DICE venues appear at zoom 15; labels appear at 16. Hover and keyboard focus still name a pin at every zoom. General Outing desk feeds only put saved plans on the map. Their full lists remain in the desk.

Food stops: Double Dragon, Le Servan, Mokonuts, Mokochaya, Bouillon République and Bouillon Pigalle, plus the existing Enfants Rouges and Ground Control. Menus/booking links travel with each guide entry. The short default also includes Superfly, Betino's, Gardette and Truillot. More places / Explore places restores the full guide; My spots returns to the quieter view. Existing guide pins are filtered rather than deleted. Visits, favourites, edited pins, selections and quest/walk references are preserved. Curated seeding has its own one-time key, and uses the existing journal transaction/capacity rules.

Familiar venues stay pinned even when their list cannot update: Rex Club, La Machine, Mia Mao, Phantom, Kilomètre25, Badaboum and Glazart. A venue opens its upcoming nights and original programme. Matching live and stored guide venues share a map location; the guide panel links back to upcoming nights. The show list has a venue filter, including Madame Loyal, and a direct programme fallback.

## Source coverage and limitations

- La Machine: https://www.lamachinedumoulinrouge.com/agenda/ — bounded `/evenement/` detail reads; date from the event's time tag, Paris wall time from its visible hours. Only `lienheadtevt` ticket links count: footer advertisements otherwise attach unrelated Shotgun links to non-Shotgun concerts.
- Kilomètre25: https://www.kilometre25.fr/francais/agenda — bounded `/evenement/` reads, explicit date and original Shotgun ticket link. When hours are absent, `dateOnly` marks a date anchor, displayed as **time to confirm**. No automatic calendar export, Google calendar link, reminder or Outing desk time is generated from that anchor. Quests ask to confirm the time on the ticket. A later exact ticket listing supersedes the date anchor during deduplication.
- Rex https://rexclub.com/billetterie/ and Phantom https://phantom.paris/tickets.html currently embed Shotgun; no independent programme parser is claimed. Their Shotgun venue pages are default sources, with the existing robots checks, caching and challenge cooldown. Direct programme links remain available when automated reads fail.
- Madame Loyal https://madameloyalfestival.com/ is a travelling promoter, not a permanent Paris venue. Its official Shotgun page is a default source and festival event URLs are accepted. Only events with actual Paris-area locations can create map pins. The official homepage checked on 18 October advertised Geneva and Rennes; no Paris event or imaginary fixed venue was manufactured.
- Existing Badaboum, Mia Mao and Glazart adapters remain. The full Shotgun catalogue is still partial while its automated requests are challenged. DICE remains available through the existing parser.

All feeds keep the existing daily caching, robots enforcement, per-host request spacing, bounded reads and last-good retention. Default-source capacity leaves the existing fourteen personal follows available. No private account, proxy or desktop automation is used.

## Place references

Official pages checked 18 October 2026:

- https://www.doubledragonparis.com/ and https://www.doubledragonparis.com/contact-1
- https://www.leservan.fr/ (address also verified at https://parisjetaime.com/restaurant/le-servan-p786)
- https://www.mokonuts.com/fr/mokonuts and https://www.mokonuts.com/fr/mokochaya
- https://bouillonlesite.com/bouillon-republique and https://bouillonlesite.com/nos-boutiques
- Phantom entrance: https://phantom.paris/informations.html (8 boulevard de Bercy, porte 28).

Restaurant, Rex, La Machine, Phantom and KM25 coordinates use the public IGN address geocoder at `data.geopf.fr/geocodage/search`. These are address points, not surveyed entrances. Menu prices and opening hours are not hardcoded as live guarantees.

## Validation and delivery

- Live isolated probe on 18 October: 11 La Machine + 4 Kilomètre25 upcoming Shotgun-linked listings; both geocoded, neither adapter reported a parsing problem. This probe exercised those two actual hosts; it did not claim a fresh successful read of Shotgun's challenged catalogue.
- `dev/showsync-test.js`, `dev/showsync-venues-test.js`, `dev/showprep-test.js`, `dev/quest-paris-test.js`, `dev/outing-test.js`, lazy-group and boot checks passed.
- Isolated Electron: `dev/checks/shotgun-programmes.js`, `dev/checks/paris-quiet-map.js`, and the adapted `dev/checks/mapfirst64.js` passed. Covers the five programme pins, event-to-quest flow, source/venue filters, zoom disclosure, unknown hours, edited/visited/favourite preservation, full-guide opt-in, walks and narrow layout.
- Coordinated on GitHub issue #2. Based on main/Claude round 64 `534dab04`. Publish via Git/main for Hearth's updater; do not restart or overwrite the dirty live checkout.
