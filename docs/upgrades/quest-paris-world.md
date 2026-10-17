# Paris after hours

An authored SVG map turns the social/life planner into seven imaginary Paris districts. It is a game interface, not a geographic map or navigation service. Open **Paris after hours** from the workstation controls, or **Open the world map** in Life expeditions.

## Places and people

Le Perchoir links to the desk-reset route; Canal des Échos to the field trip; Place des Copains to the co-op invitation route; Atelier des Possibles to unfinished-project rescue; Bureau des Nuages to the admin mini-boss; Quai de Minuit to soft landings and event plans; Gare des Lucioles to Toulouse travel planning. Native buttons overlay the SVG, with keyboard focus, selected state and narrow-layout bounds. Completed life routes earn a district star.

The first world notebook includes exactly the circle Quentin supplied: Thomas (Khamsin; musique/social), Ismaël (Kultur; musique/social), Valentin (gaming/co-op), Guillaume (check-in; musique/social), Jean, Camille and Hugo. Birthdays and unspecified interests remain empty. Existing world notebooks and edited friend records are preserved. This is local journal data with a user-requested starter catalog, not imported contacts or identity matching.

Circle cards prepare editable plans: music friends get a listening-session starting point, Valentin a co-op session, Guillaume a catch-up, and unspecified interests a coffee/walk suggestion. All can be changed. The friends notebook supports nicknames, shared interests and optional month/day birthdays. The horizon shows the next valid birthday date and New Year's Eve. February 29 stays February 29 in the next leap year. No scheduled reminders are created.

## Plans become quests

Plans save kind (outing, birthday, New Year's Eve or trip), friend, fictional district, real city/venue, date/return date, optional EUR budget and a personal note. A plan has an editable invitation draft that is copied only on explicit click; Hearth does not send it.

**Make this a quest** creates a stable three-checkpoint life campaign: concrete plan (20 XP), invitation or solo preparation (20 XP), actual field memory (35 XP). Each uses the existing proof and review gate. Creating/reopening a plan awards no XP, does not consume side-quest slots and cannot duplicate a campaign. Later edits to the plan do not rewrite accepted quest briefs. If the trip changes, the visit checkpoint can rest or be skipped; preparation is not counted as a visit. Resting a plan also pauses its linked campaign, preserving all progress. Plans can be resumed from the resting list.

## Fare scout

The Toulouse station prepares an Astra research draft containing destination, exact dates and budget. It preserves existing draft text and starts no engine turn. The user sends it if they want live research. The draft asks for dated sources, return versus one-way costs, luggage/transfers, alternative dates and honest limits if prices cannot be checked.

Provider shortcuts were verified against the official [SNCF Connect Paris–Toulouse page](https://www.sncf-connect.com/train/trajet/paris/toulouse) and [FlixBus Paris–Toulouse page](https://www.flixbus.fr/voyages-car/paris-toulouse). These open separately without prefilling dates; other destinations open the provider home page. No quoted advertised starting prices are embedded in Hearth.

The fare notebook records a manually checked operator, amount, one-way/return scope, HTTPS source, timestamp and the trip details at that moment. A quote is always labelled availability-unverified. After 24 hours, a past departure, a future timestamp, or a date/destination change, it is flagged for rechecking. A one-way price does not qualify as within a return-trip budget. Return quotes require a return date. The comparison covers transport only; accommodation and other costs must be considered separately. There is no background price monitor, booking or payment.

## Storage and verification

World v1 is an optional additive section in the existing journal. Friends, plans and fares round-trip in backup/restore. Bounds and validation cover valid calendar dates, known friend/district references, finite budgets/prices, duplicate IDs, safe source schemes and note lengths. Personal route notes are not silently inserted into proof-review prompts. Friend names appear only in the drafts/plans the user chooses to create; no communication happens automatically.

`dev/quest-world-test.js` covers migration, the supplied circle, leap dates, validation, drafted research, fare freshness/scope, stable quest conversion and backup corruption. `dev/checks/quest-world.js` exercises actual map pins, personalized co-op planning, birthday planning, invitation drafts, dated quotes, stale-date handling, preserved Astra drafts, proof-gated XP, pause/resume, narrow bounds and a real Electron reload. Prices, the added test friend and review responses are explicit fixtures. Screenshots are under `outputs/studio-paris-shots`.

Main integration and Hearth updater release remain with Claude. No live process restart, live journal edit, actual outreach, purchase or deployment is part of this branch.
