# Paris: places and mini adventures

The guide now contains 60 places, including 16 new destinations: La Place, Dizonord, Carnavalet, Cité des sciences, Maison de la Poésie, Institut du monde arabe, Jeu de Paume, La Bellevilloise, Trabendo, Les Trois Baudets, Le Louxor, Montsouris, Jardin des Plantes, Arènes de Lutèce, Galerie Vivienne and Petit Palais.

Every new place has an official source/access button and a specific creative mission. Addresses were checked on those venue or city pages on 18 October 2026. Pins use approximate IGN geocoded entrances; Trabendo and Jeu de Paume use their building positions rather than ambiguous street geocodes (cross-checked against their venue access pages and public map coordinates). Opening times and events remain linked to their sources instead of hardcoded as current availability.

Map footer → **Browse places** opens twelve cards at a time. Search handles accents, names, tags and arrondissements. Lane, New places and Unvisited filters combine. Preview the actual mission before choosing Show on map or Start place quest. Existing Explore places still adds the guide without replacing personal edits.

Map footer → **Mini adventures** offers six small campaigns:

- Pocket sample hunt: three ambient ingredients → a ten-second original loop.
- Forgeheart scout: a sign, doorway or layout → one usable game idea.
- Three shots, one mood: a film visit → a short storyboard.
- Trade a discovery: optional friend/solo record digging → an original eight-bar answer.
- Outside counts: one song outside → three specific notes and a tiny next step.
- Tile safari: observe a repeating shape → an original tile and repeat preview.

Each lets you choose one of two places. The accepted venue and brief are frozen; reopening continues the same campaign. Three existing proof/review steps pay 15 + 35 + 40 XP, with an existing campaign badge. Acceptance earns nothing; repeated completion pays nothing. Travel, screening durations and ticket costs are not included in the creative-work estimates. Invitations and purchases are optional; Hearth sends or buys nothing.

No new dependencies, background requests, persisted schema, updater logic or app restarts. Only Paris guide/UI/style and relevant tests changed. Existing quests, walks, weekly planning and proof rules are reused.

Validation: Paris rules and proof/deduplication/filter tests; walk, week planner, field and city regressions; isolated Electron discovery + real reload, existing Paris UI flow. Screenshots in `outputs/paris-discovery/` on the development task. Published through a normal feature-branch PR to main, which is Hearth's existing updater source.
