// Paris guide quests (round 61, parisquests61): a curated set of real places as map pins, each with a small
// go → do → proof quest, plus personal quests (AirPods at Apple Opéra, music in the park, a kind drink offer…).
// Plugs into Codex's Sidequest Studio: pins are ordinary atlas places (stable ids `pp-*`, or Codex's own default
// pins enriched by id), quests are ordinary campaigns (stable ids `c-pp-*` / `c-pq-*`) that finish through the same
// proof + review gate. Nothing here awards XP by itself, books, buys or messages anyone.
// Addresses were checked against public listings in October 2026; coordinates are placed from those addresses
// (good to about a block), not surveyed. Opening times change: every "go" step says to check before leaving.
(function (root, make) { if (typeof module === 'object') module.exports = make(require('./quest-core')); else root.QuestParis = make(root.QuestCore); })(typeof self !== 'undefined' ? self : this, C => {
  const clone = v => JSON.parse(JSON.stringify(v));
  // Filter words the map and `/quest paris <word>` understand, besides Codex's kinds and arrondissements.
  const TAGS = { show: 'Shows & clubs', records: 'Record shops', night: 'Nights out', food: 'Food', art: 'Art', walk: 'Walks', view: 'Views', park: 'Parks', free: 'Free', sunset: 'Sunset', jam: 'Music outdoors' };
  // [id, name, arrondissement, lat, lon, kind (Codex mapKinds), tags, why go, best time, do (the one specific thing), proof]
  // Ids starting with `place-` are Codex's default pins: the guide adds its notes to them instead of a duplicate pin.
  const RAW = [
    ['pp-laplace','La Place',1,48.861819,2.347644,'music',['show','art'],'Hip-hop culture under the Canopée at 10 passage de la Canopée. A destination for groove, movement and live production ideas.','Choose a public event from the official programme.','During a set, follow just the drum accents for one passage and tap your own variation afterwards.','Show an original eight-bar beat and one sentence about the rhythm you noticed.'],
    ['pp-dizonord','Dizonord',18,48.895277,2.341731,'music',['records'],'Record digging at 9 rue André-Messager. Follow an unfamiliar sleeve instead of another algorithmic recommendation.','Check the shop’s current hours before leaving.','Ask for one record outside your usual genres, or choose a sleeve yourself. Note its artist and one production detail.','Show a short original patch or loop inspired by that detail; buying or sampling the record is optional.'],
    ['pp-carnavalet','Musée Carnavalet',3,48.857057,2.362850,'game',['art','free'],'Paris history at 23 rue Madame-de-Sévigné: signs, rooms and everyday objects that can seed a Forgeheart shop.','Check museum access; permanent collections are free, temporary exhibitions may cost extra.','Find an old shop sign or room detail and sketch a fictional merchant who would use it.','Show one Forgeheart shop sign, its merchant’s name and a three-line item description.'],
    ['pp-cite-sciences','Cité des sciences',19,48.897240,2.385575,'game',['art'],'Interactive science at 30 avenue Corentin-Cariou. Look at how an exhibit teaches a rule without a long tutorial.','Pick an accessible exhibition and check tickets and opening.','Try one interactive exhibit and write down its input, feedback and reward.','Show a tiny game interaction or paper prototype using those three parts.'],
    ['pp-maison-poesie','Maison de la Poésie',3,48.862180,2.351844,'music',['show','art'],'Readings and encounters in passage Molière, 157 rue Saint-Martin. Listen for phrasing that could become a vocal rhythm.','Choose a published reading or performance and check booking.','Listen to the pauses in a reading. Afterwards, write four original lines with a similar rhythm, using your own words.','Show a voice memo of your four lines over a simple original drone.'],
    ['pp-ima','Institut du monde arabe',5,48.849172,2.356212,'visual',['art','view'],'Architecture and culture at 1 rue des Fossés-Saint-Bernard. Study a repeated shape as a visual building block.','Check which spaces and exhibitions are open and their admission conditions.','Find one geometric motif and redraw its construction from simple shapes.','Show an original seamless tile or looping pattern built from your shape study.'],
    ['pp-jeu-paume','Jeu de Paume',1,48.865800,2.323900,'visual',['art'],'Photography and moving images at the Tuileries end of place de la Concorde. Look for a framing rule you can reuse.','Check exhibition changeovers and opening on the official page before travelling.','Choose a photograph or film frame and note its foreground, middle ground and background.','Show your own three-layer composition or storyboard frame using that structure.'],
    ['pp-bellevilloise','La Bellevilloise',20,48.868415,2.392161,'social',['show','night','food'],'A cultural venue at 19–21 rue Boyer. Pick a public event to try with a friend rather than another vague “soon”.','Choose an announced event and check booking and access.','Go to a chosen event with a friend, or solo if nobody is free. Afterwards, note one moment you would recommend.','Show a specific field note and an optional draft of your next invitation; no message is sent automatically.'],
    ['pp-trabendo','Le Trabendo',19,48.892570,2.393890,'music',['show','night'],'A music venue inside Parc de la Villette, approached from 211 avenue Jean-Jaurès. Try a new live or club programme.','Check the show page and the venue’s route inside the park.','During one track, listen for how the bass changes between two sections. Recreate the movement later in your own sound.','Show a ten-second Vital or Serum 2 bass demo with two contrasting sections.'],
    ['pp-trois-baudets','Les Trois Baudets',18,48.883457,2.334465,'music',['show'],'A concert venue at 64 boulevard de Clichy. A small songwriting detour through someone else’s live set.','Choose a published concert and check ticket conditions.','Notice how one song introduces its chorus. Afterwards, hum an original four-bar answer to that idea.','Show a voice memo or short demo with your original verse-to-chorus transition.'],
    ['pp-louxor','Le Louxor',10,48.883472,2.349866,'visual',['art'],'A cinema at 170 boulevard de Magenta with an Egyptian-inspired façade. Turn a film visit into a tiny directing lesson.','Check the film programme and book if needed.','After a screening, draw a scene from memory as three shots with different distances.','Show a three-panel storyboard and a note on the cut that matters most.'],
    ['pp-montsouris','Parc Montsouris',14,48.824187,2.339934,'reset',['park','walk','free','jam'],'A quieter south-Paris escape entered at 2 rue Gazan. One bench and one song can be enough for today.','Daylight; check seasonal gate times.','Sit for one song without scrolling, then write down three sounds you noticed.','Show three specific listening notes, or a short original ambient sketch.'],
    ['pp-jardin-plantes','Jardin des Plantes',5,48.844345,2.356233,'visual',['park','walk','free'],'Botanical shapes by 57 rue Cuvier. The garden is a reference library for fictional plants and materials.','Check garden gates; galleries, greenhouses and other attractions have separate access conditions.','Choose a leaf or branching pattern without picking it. Sketch its large shape and one small detail.','Show an original Forgeheart plant, texture or prop based on your sketch.'],
    ['pp-arenes','Arènes de Lutèce',5,48.845112,2.354206,'game',['walk','free'],'A Roman arena hidden behind the streets of the 5th, with access at 4 rue des Arènes. Read it like a tiny level.','Daylight; check the square’s gate times.','Walk an accessible edge and sketch entrances, sightlines and a safe central play area.','Show a top-down Forgeheart arena layout with one encounter idea.'],
    ['pp-galerie-vivienne','Galerie Vivienne',2,48.866215,2.339481,'visual',['walk','art'],'A covered passage entered at 4 rue des Petits-Champs. Look at repeating floor shapes and the rhythm of the shopfronts.','Check passage access and respect shop entrances.','Find a repeated floor or roof shape and redraw its rhythm from memory outside.','Show an original seamless tile or an interior mood sketch using your pattern.'],
    ['pp-petit-palais','Petit Palais',8,48.866013,2.314966,'visual',['art','free'],'An art museum on avenue Winston-Churchill. Choose one lighting idea rather than trying to absorb every room.','Check museum hours; permanent collections are free and temporary exhibitions have separate tickets.','Pick a painting and reduce its lighting to three tones in your sketchbook.','Show a three-tone study and one original game or music-visual frame using it.'],
    // Official venue addresses; IGN address geocoding checked 18 October 2026.
    ['pp-centquatre','CENTQUATRE-PARIS',19,48.889983,2.371506,'visual',['art','walk'],'An arts centre at 5 rue Curial with open practice spaces: look for movement, rhythm and unexpected uses of the hall.','Check today’s access and programme before leaving.','Watch a public practice without interrupting. Sketch three poses as a tiny animation study.','Show a three-frame movement study or a five-second animation.'],
    ['pp-hasard-ludique','Le Hasard Ludique',18,48.895704,2.328516,'music',['show','night'],'A cultural venue in the former Saint-Ouen station, at 128 avenue de Saint-Ouen. A destination for a new sound with Thomas or Ismaël.','Pick a published show and check booking first.','Listen to one set and isolate the part that gives it its groove: drums, bass or a repeated texture.','Show an original eight-bar loop using that arrangement idea.'],
    ['pp-forum-images','Forum des images',1,48.862010,2.346713,'visual',['art'],'Screenings and encounters at 2 rue du Cinéma, inside Les Halles. Bring home a shot idea for a music visual.','Choose a screening from the programme and check its time.','After a screening, draw three shots from memory and mark where the camera moves.','Show a three-panel storyboard with a timing note on each panel.'],
    ['pp-fgo-barbara','FGO-Barbara',18,48.884338,2.354046,'music',['show'],'A music venue at 1 rue Fleury in the Goutte d’Or. A reason to hear someone outside your usual recommendations.','Check the current public programme and booking.','Catch a public show. Note the moment when the room’s energy changes and what the performers did.','Show a short demo with your own version of that energy change.'],
    ['pp-supersonic','Supersonic',12,48.850247,2.369707,'music',['show','night'],'A concert club at 9 rue Biscornet near Bastille. Try a guitar-driven night as a sound-design detour.','Check the event’s entry conditions and start time.','Listen for one guitar or synth texture, then describe it using only shape, motion and brightness.','Show a ten-second original Serum or Vital patch demo plus your three-word brief.'],
    ['pp-radio-france','Maison de la Radio et de la Musique',16,48.852149,2.279529,'music',['show','art'],'Radio France’s concert destination at 116 avenue du Président-Kennedy. Follow a published concert or public event.','Choose a public event; access and booking depend on the programme.','During a concert, follow one instrument rather than the whole ensemble for a full passage.','Show a short arrangement note and a demo recreating that instrument’s role in your own sound.'],
    ['pp-bnf-richelieu','BnF Richelieu',2,48.867854,2.338088,'game',['art','walk'],'A library and museum site with an entrance at 58 rue de Richelieu. Look for a room silhouette worthy of Forgeheart.','Check public-space access; research rooms have separate access rules.','From an accessible public space, sketch a room as a game hub with three destinations and one secret.','Show a Forgeheart room sketch with routes and one interaction marked.'],
    ['pp-bourdelle','Musée Bourdelle',15,48.842975,2.318588,'visual',['art'],'A sculpture museum and former artist’s studio at 18 rue Antoine-Bourdelle. Use solid forms as the starting point for a visual.','Check opening, exhibition access and drawing rules.','Choose a sculpture and reduce its silhouette to five simple shapes without tracing.','Show the shape study, then a still or loop built from those shapes.'],
    // Sound: venues
    ['pp-philharmonie', 'Philharmonie & Musée de la Musique', 19, 48.8919, 2.3937, 'music', ['show', 'art'], 'Jean Nouvel’s silver ship: a museum of 1,000 instruments, the rooftop walk and some of the best-sounding halls in Europe.', 'A weekday afternoon for the museum; climb the outside ramp at golden hour.', 'In the Musée de la Musique, find one instrument you have never heard of and listen to its audio guide sample twice.', 'Save a 15-second hum, recording or MIDI sketch of a phrase that instrument inspired, plus its name.'],
    ['pp-bataclan', 'Le Bataclan', 11, 48.8630, 2.3707, 'music', ['show', 'night'], 'The pagoda-fronted 1865 hall on boulevard Voltaire: mid-size touring shows with a proper Paris crowd.', 'Any show night; the café next door before doors.', 'Go to a show and, during one song, notice the arrangement: what drops out before the chorus comes back.', 'Write three lines on that arrangement trick and try it on one of your own loops.'],
    ['pp-cigale', 'La Cigale', 18, 48.8822, 2.3404, 'music', ['show', 'night'], 'A gilded 1887 theatre in Pigalle redone by Philippe Starck: close-up shows with a balcony view.', 'A weeknight show; arrive early for the balcony rail.', 'Pick a show this week, go, and stay for the opening act too.', 'Save a note naming the opening act and one sound or idea you want to steal for a demo.'],
    ['pp-point-ephemere', 'Point Éphémère', 10, 48.8813, 2.3684, 'music', ['show', 'night', 'free'], 'Ex-warehouse on the Canal Saint-Martin: small gigs, DJ nights, studios and a canal-side terrace.', 'Early evening on the terrace, then a gig.', 'Have a drink on the canal-side terrace and catch a set by an artist you do not know yet.', 'Save the artist’s name and a 10-second voice memo describing their sound in your own words.'],
    ['pp-machine', 'La Machine du Moulin Rouge', 18, 48.8838, 2.3321, 'music', ['show', 'night'], 'Three rooms behind the Moulin Rouge: club nights, live shows and the Bar à Bulles roof terrace.', 'A Friday or Saturday after midnight; the terrace earlier.', 'Spend ten minutes in the main room listening only to how the DJ mixes in the next track.', 'Write down one transition move you heard and rebuild it between two of your own loops.'],
    ['pp-new-morning', 'New Morning', 10, 48.8727, 2.3531, 'music', ['show', 'night'], 'The jazz club since 1981 (Chet Baker, Prince, Nina Simone): standing-room shows near rue du Faubourg-Saint-Denis.', 'A weeknight jazz or soul show.', 'See a set and count how many bars the band lets a solo run before the theme returns.', 'Save a note with the bar count and a chord or rhythm you want to try in Vital or Serum.'],
    ['pp-maroquinerie', 'La Maroquinerie', 20, 48.8688, 2.3926, 'music', ['show', 'night'], 'A basement venue in Ménilmontant where you see bands the year before they get big.', 'A weeknight show; the courtyard restaurant before.', 'Go to a show by an artist with under ten thousand monthly listeners.', 'Save the artist’s name and one reason you would go see them again.'],
    ['pp-petit-bain', 'Petit Bain', 13, 48.8355, 2.3762, 'music', ['show', 'night', 'sunset'], 'A floating venue on a barge at the foot of the BnF, with a rooftop garden over the Seine.', 'Sunset on the rooftop, then the hold for a gig.', 'Record 20 seconds of the river and the rooftop crowd (no faces, no private talk).', 'Turn the recording into a pad or texture and export a 10-second before/after.'],
    ['pp-rex', 'Rex Club', 2, 48.8707, 2.3473, 'music', ['show', 'night'], 'The temple of French techno under the Grand Rex: Laurent Garnier’s home, with a legendary sound system.', 'Wednesday to Saturday, late.', 'Stand near the middle of the room for one track and listen to how the kick and bass share the low end.', 'Save a note on the kick/bass relationship and try the same balance on one of your drums.'],
    // Sound: record shops
    ['pp-superfly', 'Superfly Records', 3, 48.8673, 2.3575, 'music', ['records'], 'A small, superb shop for rare soul, jazz, Brazilian, African and Latin records (also a label).', 'Tuesday to Saturday afternoon; check hours first.', 'Ask the person at the counter for one record that sounds like a track you love, and listen to it.', 'Save the record’s name and one sample-worthy moment (timestamp + why).'],
    ['pp-betinos', 'Betino’s Record Shop', 11, 48.8618, 2.3699, 'music', ['records'], 'Since 1999 off rue Oberkampf: deep second-hand jazz, soul, disco, Latin and African bins.', 'Monday to Saturday from 13:00.', 'Dig one bin you would usually skip and pick the cover you would never have chosen.', 'Save the record’s name and one sound idea from it for a demo.'],
    ['pp-balades-sonores', 'Balades Sonores', 18, 48.8843, 2.3455, 'music', ['records'], 'An indie record shop and label, now by the Marché Saint-Pierre (8 rue Pierre Picard) after leaving avenue Trudaine.', 'Tuesday to Saturday; Thursday evenings sometimes later.', 'Find a new French release in the racks and listen to it at the shop.', 'Save the release’s name and one line about what you liked.'],
    // With friends / nights out
    ['pp-rue-de-lappe', 'Rue de Lappe', 11, 48.8537, 2.3727, 'social', ['night'], 'An old Bastille street of bals musette turned bars and clubs. Loud, cheap and very Paris.', 'Friday night, after 22:00.', 'Walk the whole street once and pick the bar playing the music you like best.', 'Save the bar’s name and a note on what was playing.'],
    ['pp-rosa-bonheur', 'Rosa Bonheur (Buttes-Chaumont)', 19, 48.8778, 2.3818, 'social', ['night', 'park', 'food'], 'A guinguette inside the Buttes-Chaumont park: rosé, tapas and an easy dancefloor when the sun goes down.', 'A warm evening, ideally Thursday to Sunday; arrive early.', 'Get a spot outside and stay for the first hour of the DJ set.', 'Save a note on one track you Shazamed and why it worked there.'],
    ['pp-recyclerie', 'La Recyclerie', 18, 48.8976, 2.3448, 'social', ['food', 'walk'], 'A café-canteen in the old Ornano station on the Petite Ceinture, with an urban farm along the tracks.', 'A weekend brunch or a calm weekday afternoon.', 'Walk the farm side by the old tracks and record 20 seconds of the station ambience.', 'Save the recording plus one sentence about the place.'],
    ['pp-perchoir', 'Le Perchoir Ménilmontant', 11, 48.8667, 2.3829, 'social', ['night', 'view', 'sunset'], 'A seventh-floor rooftop bar with a view over east Paris.', 'Sunset; book or come early.', 'Find the Eiffel Tower and Sacré-Cœur from the rooftop and take one wide photo.', 'Save the photo and a one-line note on the evening.'],
    ['pp-enfants-rouges', 'Marché des Enfants Rouges', 3, 48.8628, 2.3620, 'social', ['food'], 'Paris’s oldest covered market (1615): Moroccan, Japanese, Lebanese and Italian stalls under one roof.', 'Weekday lunch, before 12:30.', 'Eat at a stall you have never tried and chat with the cook for a minute.', 'Save a note on what you ate and one detail the cook told you.'],
    ['pp-ground-control', 'Ground Control', 12, 48.8421, 2.3829, 'social', ['food', 'night', 'free'], 'A former SNCF hall by Gare de Lyon: food stalls, a bar, talks, kids’ dance parties and live music.', 'A weekend afternoon or evening.', 'Find one event or exhibition on that day and stay for 20 minutes of it.', 'Save a note on the event and one idea you took away.'],
    // Visual
    ['pp-palais-de-tokyo', 'Palais de Tokyo', 16, 48.8640, 2.2967, 'visual', ['art'], 'Europe’s big contemporary art centre, open late; raw concrete and odd, ambitious shows.', 'An evening visit (it opens late most days).', 'Find the work that bothers you the most and stay in front of it for three minutes.', 'Save a sketch or note of how the work used light, scale or sound.'],
    ['pp-atelier-lumieres', 'Atelier des Lumières', 11, 48.8620, 2.3799, 'visual', ['art'], 'Immersive projections and music filling a 19th-century foundry: a real visuals-and-sound lesson.', 'A weekday morning, when it is quieter.', 'Watch one full cycle and note how the visuals move with the music.', 'Make a five-second loop in the Lab inspired by one transition you saw.'],
    ['pp-sainte-chapelle', 'Sainte-Chapelle', 1, 48.8554, 2.3450, 'visual', ['art', 'sunset'], 'Fifteen walls of 13th-century stained glass. When the sun hits it, the room turns into colour.', 'Late afternoon sun; check the evening concerts.', 'Stand in the upper chapel and pick three colours from the glass.', 'Save a three-colour palette and use it for a visual or a cover idea.'],
    ['pp-bourse-commerce', 'Bourse de Commerce', 1, 48.8628, 2.3428, 'visual', ['art'], 'Pinault’s contemporary collection inside a round 18th-century grain exchange, remade by Tadao Ando.', 'A weekday; the dome is best in daylight.', 'Walk the concrete ring under the dome and photograph one line or curve.', 'Save the photo and turn it into a seamless tile or a storyboard frame.'],
    ['pp-denoyez', 'Rue Dénoyez', 20, 48.8719, 2.3781, 'visual', ['art', 'walk', 'free'], 'A short Belleville street covered in ever-changing graffiti and murals.', 'Daylight, any day.', 'Find one piece that changed since the last photo online, or one you love.', 'Save a photo and make a texture or colour study from it.'],
    ['pp-59-rivoli', '59 Rivoli', 1, 48.8592, 2.3477, 'visual', ['art', 'free'], 'An artist squat turned legal studio building since 1999: six floors of working artists, free to walk in.', 'An afternoon; check opening days.', 'Climb every floor and ask one artist what they are working on.', 'Save a note on what they said and one idea for your own work.'],
    ['pp-shakespeare', 'Shakespeare and Company', 5, 48.8526, 2.3471, 'reset', ['walk'], 'The English-language bookshop facing Notre-Dame, with a reading room upstairs.', 'A weekday morning; there is a queue later.', 'Find a book about music or sound and read a chapter upstairs.', 'Save one quote or idea from it.'],
    // Game ideas
    ['pp-arts-metiers', 'Musée des Arts et Métiers', 3, 48.8666, 2.3553, 'game', ['art'], 'Machines, automata, early instruments and the Foucault pendulum in an old priory: perfect Forgeheart prop fuel.', 'A weekday; Thursday evenings sometimes later.', 'Find one machine with a satisfying moving part and sketch how it moves.', 'Save the sketch as a Forgeheart prop or interaction idea.'],
    ['pp-station-f', 'Station F', 13, 48.8344, 2.3707, 'game', ['food'], 'The giant start-up campus in the old Halle Freyssinet; La Felicità food hall next door.', 'Lunch at La Felicità; events on the Station F site.', 'Eat at La Felicità and sketch a mini-game about the place on a napkin.', 'Save the sketch and the rule of the mini-game.'],
    // Small escapes: walks and views (four of Codex’s default pins get guide notes)
    ['place-canal', 'Canal Saint-Martin', 10, 48.8719, 2.3635, 'music', ['walk', 'sunset', 'free'], 'Iron footbridges, locks and plane trees: the most Paris walk for a music person.', 'A weekday evening, legs over the quai.', 'Sit on the quai near a lock and record 30 seconds of the water and footbridges.', 'Turn it into a loop, pad or rhythm and export a ten-second sketch.'],
    ['place-buttes', 'Parc des Buttes-Chaumont', 19, 48.8809, 2.3828, 'visual', ['park', 'view', 'jam', 'free'], 'Cliffs, a temple on a rock and a waterfall grotto: the city’s wildest park.', 'Morning, or the hour before sunset from the Temple de la Sibylle.', 'Climb to the Temple de la Sibylle and catch the view over Montmartre.', 'Save a photo or sketch and one line about the view.'],
    ['place-luxembourg', 'Jardin du Luxembourg', 6, 48.8462, 2.3372, 'reset', ['park', 'jam', 'free'], 'The green chairs, the Medici fountain and the bandstand concerts.', 'A sunny afternoon; bandstand concerts on summer weekends.', 'Pull a green chair to the Medici fountain and stay ten minutes, phone away.', 'Save a sketch or note of one thing you noticed.'],
    ['place-villette', 'Parc de la Villette', 19, 48.8936, 2.3908, 'game', ['park', 'jam', 'free'], 'Red follies, themed gardens and canals by the Philharmonie; the open-air cinema in summer.', 'A summer evening for the outdoor cinema, or a quiet morning.', 'Walk through three red follies and imagine each as a game level.', 'Save a short sketch or rule for one of those levels.'],
    ['pp-belleville-view', 'Belleville viewpoint (Parc de Belleville)', 20, 48.8716, 2.3847, 'reset', ['view', 'park', 'sunset', 'jam', 'free'], 'The top of Parc de Belleville, rue Piat: the whole city laid out, without the Sacré-Cœur crowds.', 'Sunset, or sunrise if you are brave.', 'Sit at the railing at the top of rue Piat for one song with headphones on.', 'Save a photo or a one-line note.'],
    ['pp-petite-ceinture', 'Petite Ceinture (15e)', 15, 48.8340, 2.2930, 'reset', ['walk', 'free'], 'A green walk along the 19th-century railway ring; enter by 99 rue Olivier-de-Serres.', 'A daytime walk (it closes in the evening; check the times).', 'Walk the whole section and photograph one rail detail.', 'Save the photo and make a texture from it.'],
    ['pp-promenade-plantee', 'Promenade plantée (Coulée verte)', 12, 48.8497, 2.3715, 'reset', ['walk', 'free'], 'The original elevated park, on an old viaduct from Bastille toward Vincennes.', 'A morning walk.', 'Walk at least to the Jardin de Reuilly with a playlist made for the walk.', 'Save the playlist name and one moment you liked.'],
    ['pp-sacre-coeur', 'Sacré-Cœur steps', 18, 48.8862, 2.3431, 'reset', ['view', 'sunset', 'free'], 'The classic view over Paris from the top of Montmartre, with buskers on the steps.', 'Sunrise for calm, or sunset for the buskers.', 'Listen to one busker’s whole song and leave them a coin if you liked it.', 'Save a note on the song and what made it work.'],
    ['pp-vert-galant', 'Square du Vert-Galant', 1, 48.8574, 2.3402, 'reset', ['view', 'sunset', 'free'], 'The willow-shaded tip of the Île de la Cité, at water level, under the Pont Neuf.', 'Sunset; bring a drink and sit at the very point.', 'Sit at the very tip at sunset and listen to the river for five minutes.', 'Save a note or a 10-second recording.']
  ];
  const guide = RAW.map(([id, name, arr, lat, lon, kind, tags, why, best, todo, proof]) => ({ id, name, arr, lat, lon, kind, tags, why, best, todo, proof }));
  const sources={'pp-centquatre':'https://www.104.fr/infos-pratiques','pp-hasard-ludique':'https://www.lehasardludique.paris/infos-pratiques','pp-forum-images':'https://www.forumdesimages.fr/infos-pratiques','pp-fgo-barbara':'https://fgo-barbara.fr/infos-pratiques','pp-supersonic':'https://supersonic-club.fr/infos-pratiques/','pp-radio-france':'https://www.maisondelaradioetdelamusique.fr/','pp-bnf-richelieu':'https://www.bnf.fr/fr/richelieu','pp-bourdelle':'https://www.bourdelle.paris.fr/decouvrir'};
  for(const g of guide)if(sources[g.id])g.url=sources[g.id];
  const discoverySources={laplace:'https://laplace-paris.com/',dizonord:'https://www.dizonord.fr/',carnavalet:'https://www.carnavalet.paris.fr/', 'cite-sciences':'https://www.cite-sciences.fr/fr/accueil/', 'maison-poesie':'https://maisondelapoesieparis.com/',ima:'https://www.imarabe.org/fr', 'jeu-paume':'https://jeudepaume.org/visite/horaires-acces/',bellevilloise:'https://www.labellevilloise.com/infos-pratiques/',trabendo:'https://www.letrabendo.net/contacts/', 'trois-baudets':'https://lestroisbaudets.com/',louxor:'https://www.cinemalouxor.fr/',montsouris:'https://www.paris.fr/lieux/parc-montsouris-1810', 'jardin-plantes':'https://www.jardindesplantesdeparis.fr/fr/jardin-des-plantes',arenes:'https://www.paris.fr/lieux/square-des-arenes-de-lutece-et-square-capitan-1760','galerie-vivienne':'https://pop.culture.gouv.fr/notice/merimee/PA00086024','petit-palais':'https://www.petitpalais.paris.fr/visiter/preparer-votre-visite'};
  const newPlaces=Object.keys(discoverySources).map(id=>'pp-'+id);
  for(const [id,url]of Object.entries(discoverySources))byGuide(id).url=url;
  function byGuide(id){return guide.find(g=>g.id==='pp-'+id);}
  // The personal pin (not part of the guide list): added with the AirPods quest.
  const pins = {
    'pp-apple-opera': { id: 'pp-apple-opera', name: 'Apple Opéra', arr: 9, lat: 48.8722, lon: 2.3331, kind: 'reset', tags: [], why: 'Apple Store at 12 rue Halévy, by the Palais Garnier. Métro Opéra or Chaussée d’Antin–La Fayette.', best: 'Weekday morning, after booking a pickup.' }
  };
  const byId = id => guide.find(p => p.id === id) || pins[id] || null;
  const arrLabel = n => n === 1 ? '1er' : n + 'e';
  const pathOf = kind => ({ music: 'music', visual: 'visual', game: 'game' })[kind] || 'life';
  const PROOF = 'Show the actual sound, photo, sketch or your own specific note. A visit stamp or a plan alone does not finish this step.';
  // Steps: [title, done, tiny, minutes, xp] (Codex quest fields; xp 5–100, minutes 1–120).
  const step = (cid, i, [title, done, tiny, minutes, xp], hint = PROOF) => ({ id: `q-${cid.slice(2)}-${i + 1}`, title, done, tiny, minutes, xp, tool: null, deep: 'Stop at the finish line. Save a next idea only if you want one.', proofHint: hint });
  // Short titles for the "do" step (its full brief is the place's `todo`).
  const DO_TITLES = {
    'pp-philharmonie': 'Meet an instrument you never heard',
    'pp-bataclan': 'Hear how the chorus comes back',
    'pp-cigale': 'Stay for the opening act',
    'pp-point-ephemere': 'Catch an artist you do not know',
    'pp-machine': 'Listen to the DJ’s transitions',
    'pp-new-morning': 'Count the solo bars',
    'pp-maroquinerie': 'See a band before they get big',
    'pp-petit-bain': 'Record the river from the roof',
    'pp-rex': 'Feel how the kick and bass share',
    'pp-superfly': 'Ask the counter for a record',
    'pp-betinos': 'Dig the bin you would skip',
    'pp-balades-sonores': 'Hear a new French release',
    'pp-rue-de-lappe': 'Walk the street, pick the sound',
    'pp-rosa-bonheur': 'Stay for the first hour of the set',
    'pp-recyclerie': 'Record the old station',
    'pp-perchoir': 'Find the landmarks from the roof',
    'pp-enfants-rouges': 'Eat at a new stall, meet the cook',
    'pp-ground-control': 'Catch one event of the day',
    'pp-palais-de-tokyo': 'Three minutes with a difficult work',
    'pp-atelier-lumieres': 'Watch how image follows music',
    'pp-sainte-chapelle': 'Take three colours from the glass',
    'pp-bourse-commerce': 'Photograph a line under the dome',
    'pp-denoyez': 'Find a fresh piece',
    'pp-59-rivoli': 'Ask an artist what they are making',
    'pp-shakespeare': 'Read a chapter upstairs',
    'pp-arts-metiers': 'Sketch a machine in motion',
    'pp-station-f': 'Design a napkin mini-game',
    'place-canal': 'Record a lock and the footbridges',
    'place-buttes': 'Climb to the Temple de la Sibylle',
    'place-luxembourg': 'Ten minutes at the Medici fountain',
    'place-villette': 'Three follies, three levels',
    'pp-belleville-view': 'One song at the top of rue Piat',
    'pp-petite-ceinture': 'Walk the old railway',
    'pp-promenade-plantee': 'Walk the viaduct with a playlist',
    'pp-sacre-coeur': 'One busker’s whole song',
    'pp-vert-galant': 'Five minutes at the tip of the island'
  };
  function placeSteps(p) {
    return [
      [`Get to ${p.name}`, `Go to ${p.name} (${arrLabel(p.arr)}). Best: ${p.best} Check today’s opening times before leaving. Save one photo or a one-line note of the first thing you notice there.`, 'Look up the route and leave in the next ten minutes.', 30, 20],
      [DO_TITLES[p.id] || 'Do the one thing here', p.todo, 'Put your phone on silent and look around for one minute first.', 20, 35],
      ['Bring it home', p.proof, 'Open the recording, photo or note app right now.', 15, 35]
    ];
  }
  // Personal quests in the spirit of the owner’s request. Social ones are about confidence and connection:
  // consent-aware, any answer is fine, never a script for "getting" someone.
  const personal = [
    { key: 'airpods', id: 'c-pq-airpods', title: 'Get my AirPods', subtitle: 'PARIS / ERRAND', path: 'life', pin: 'pp-apple-opera', aliases: ['apple', 'opera', 'airpod'], why: 'New AirPods from Apple Opéra (12 rue Halévy, 9e), booked so the trip is quick.', badge: 'Ears back on', url: 'https://www.apple.com/fr/airpods/', steps: [
      ['Check stock and book a pickup', 'On apple.com/fr choose your AirPods model, pick “Retrait” at Apple Opéra and check availability; book the pickup or note the model and price you saw. Save the confirmation with the order number blurred, or your note.', 'Open apple.com/fr/airpods and choose the model.', 10, 20],
      ['Go to Apple Opéra', 'Go to 12 rue Halévy (métro Opéra or Chaussée d’Antin–La Fayette) with your ID and the pickup confirmation, and collect them. Save a photo of the box or a one-line note.', 'Put the confirmation and your ID in your bag.', 45, 35],
      ['Pair and test them', 'Pair them with your phone and your Mac, try noise cancelling and transparency, record a 5-second voice memo to test the mic, and check they show in Find My. Save the memo or a short checklist.', 'Open the case next to your phone.', 10, 25]
    ] },
    { key: 'park', id: 'c-pq-park', title: 'Make music at the park', subtitle: 'PARIS / OPEN-AIR SESSION', path: 'music', pin: 'place-buttes', aliases: ['music', 'outdoor', 'jam'], why: 'A two-minute sketch made outside, on a bench, with headphones: the city as the room.', badge: 'Open-air producer', steps: [
      ['Pick a park and pack light', 'Choose a park (Buttes-Chaumont, Parc de Belleville, Luxembourg or La Villette), charge the laptop and headphones, and open one Vital or Serum 2 preset you want to play. Start a workbench sketch named after the park (/quest park <park>). Save your three-item packing list.', 'Charge your headphones now.', 10, 20],
      ['Make a two-minute sketch outdoors', 'On a bench, with headphones on, make a 2-minute sketch: one sound, one rhythm, one change. Keep speakers off unless it is quiet and nobody minds. Save the bounce.', 'Play one note and loop it.', 30, 50],
      ['Bring the park home', 'Name the bounce after the park and the date, listen once at home, and write one line about what the park added to it.', 'Open the bounce on your computer.', 10, 30]
    ] },
    // (round 63, loopsong63) the park loops' finish line: Arrange (tools/loopsong.js) offers an exported song as its proof
    { key: 'track', id: 'c-pq-track', title: 'Finish a track', subtitle: 'MUSIC / FINISH LINE', path: 'music', aliases: ['finish', 'arrange', 'bounce'], why: 'Loops are the fun part; a finished track is the gift to yourself. Done beats perfect: two minutes with a start, a middle and an end.', badge: 'Finisher', steps: [
      ['Pick the loops that belong together', 'Choose two or three loops you still like (park takes count), and lay them out in order: a start, a middle, an end. Save a one-line note of the order.', 'Play your last three loops once each.', 15, 25],
      ['Bounce the whole thing', 'Arrange it to about two minutes, fade the ends, and export the mix. It does not need to be perfect; it needs to be finished. Save the bounce.', 'Put the first loop on bar 1.', 30, 45],
      ['Listen once and name it', 'Listen once from start to end without changing anything, give it a name, and write one line about what you would keep for the next one.', 'Press play and put your hands in your lap.', 10, 30]
    ] },
    { key: 'drink', id: 'c-pq-drink', title: 'Offer someone a drink', subtitle: 'CONFIDENCE / KIND', path: 'life', aliases: ['social', 'someone', 'confidence', 'talk'], why: 'Practise starting a real conversation and making a friendly offer, with any answer welcome. It is about connection, not an outcome.', badge: 'Easy company', steps: [
      ['Be somewhere relaxed', 'Go somewhere where talking to people is normal and easy (a bar with seating, a gig’s interval, a café terrace) with no target in mind. Save a one-line note on where you went and how you felt arriving.', 'Pick the place and the time.', 30, 20],
      ['Start a genuine conversation', 'Start a short conversation about something real you share: the music, the place, the night. Listen more than you talk. If someone seems busy or gives short answers, wish them a good evening and leave it there. Save a note on what you talked about (no names).', 'Think of one honest question about the music or the place.', 15, 35],
      ['Offer, then accept any answer', 'If the conversation is mutual and easy, offer simply: “I’m getting a drink, can I get you something?” Soft drinks count. Yes, no, “I’m good” are all fine answers: thank them and keep it light, never insist or ask twice. Save a note of how you asked.', 'Breathe out, smile, keep it short.', 10, 35],
      ['Reflect', 'Write three lines: what went well, what felt awkward, one small thing to try next time. No names or private details.', 'Write the first line: “What went well was…”', 5, 20]
    ] },
    { key: 'gig', id: 'c-pq-gig', title: 'Talk to a musician after a gig', subtitle: 'SHOWS / CONNECTION', path: 'music', pin: 'pp-point-ephemere', aliases: ['musician', 'artist', 'merch'], why: 'Small venues make it easy to tell an artist what landed. A thank-you can turn into a friendship or a collab.', badge: 'Front row friend', steps: [
      ['Pick a small show', 'Choose a small show this week (Point Éphémère, La Maroquinerie, New Morning…) and get a ticket. Save the show name and date.', 'Open your Shotgun or DICE feed.', 10, 20],
      ['Say one specific thing', 'After the set, if the artist is at the merch stand or around and free, tell them one specific thing you liked. If they are busy or tired, a nod or a follow works too. Save a note of what you said.', 'Pick the moment from the set you would mention.', 10, 35],
      ['Follow up kindly', 'Follow them, buy or stream the record, and save one idea from their set for your own music.', 'Find their profile.', 10, 25]
    ] },
    { key: 'openmic', id: 'c-pq-openmic', title: 'Go to an open mic', subtitle: 'SHOWS / FIRST STEP', path: 'music', aliases: ['open-mic', 'mic', 'jam-session'], why: 'Watch one, then maybe play one: the shortest road from bedroom producer to stage.', badge: 'Open mic regular', steps: [
      ['Find one this week', 'Find an open mic or jam session in Paris this week (check listings and the venue’s page). Save the place, date and sign-up rule.', 'Search “open mic Paris” plus this week’s dates.', 15, 20],
      ['Go and watch the whole thing', 'Go, stay for the whole evening, and notice how people introduce themselves. Save a note on one performer you liked and why.', 'Plan to arrive at sign-up time.', 90, 40],
      ['Decide your own next step', 'Write what you could bring next time (a loop, a beat, a song) and whether you want to sign up. Watching again is a fine answer.', 'Write: “Next time I could bring…”', 10, 25]
    ] },
    { key: 'records', id: 'c-pq-records', title: 'Trade a record recommendation', subtitle: 'DIGGING / CONNECTION', path: 'music', pin: 'pp-superfly', aliases: ['record', 'shop', 'digging', 'vinyl'], why: 'Record shop staff love a good question. Trade one recommendation for another.', badge: 'Crate trader', steps: [
      ['Pick a shop and your record', 'Choose a shop (Superfly, Betino’s, Balades Sonores) and one record you love that you can describe in a sentence. Save the sentence.', 'Choose the record you would bring to a desert island.', 5, 20],
      ['Ask and offer', 'At the shop, ask the staff for something in the spirit of your record, listen to it, and offer your own recommendation back. Save both names.', 'Say: “I love this; what would you play me next?”', 30, 35],
      ['Flip it', 'Pull one sound, groove or idea from the recommendation into a 30-second sketch or a note for your next demo.', 'Listen again with headphones.', 20, 35]
    ] },
    { key: 'sunrise', id: 'c-pq-sunrise', title: 'Sunrise walk', subtitle: 'SMALL ESCAPE / EARLY', path: 'life', pin: 'pp-belleville-view', aliases: ['sunrise', 'morning', 'dawn'], why: 'Paris is empty and gold at sunrise. Belleville, the canal or the Sacré-Cœur steps.', badge: 'Early light', steps: [
      ['Set it up the night before', 'Check tomorrow’s sunrise time, pick the spot, and set an alarm 40 minutes before. Save the time and place.', 'Look up tomorrow’s sunrise time.', 5, 20],
      ['Walk into the sunrise', 'Get there before sunrise and record 30 seconds of the city waking up.', 'Shoes by the door.', 60, 35],
      ['Make a morning pad', 'Turn the recording into a pad or ambient loop and export ten seconds.', 'Drop the recording into your sampler.', 20, 35]
    ] },
    { key: 'solo', id: 'c-pq-solo', title: 'Go to a show alone', subtitle: 'SHOWS / CONFIDENCE', path: 'life', aliases: ['alone', 'concert'], why: 'Going solo means you pick exactly the show you want, and it is easier to meet people.', badge: 'Solo flyer', steps: [
      ['Pick the show you really want', 'From this week’s Shotgun or DICE announcements, pick one show you want to see even if no friend can come. Save the name and date.', 'Open this week’s announcements.', 10, 20],
      ['Go and stay for the whole set', 'Go, find a good spot, and stay to the end. Talking to someone is optional; enjoying the show is the quest. Save a note on the best moment.', 'Plan your way home first.', 120, 40],
      ['Note what you would repeat', 'Write two lines: what made it good alone, and one thing you would do differently.', 'Write the first line on the way home.', 5, 20]
    ] }
  ];
  const parks = { buttes: 'place-buttes', 'buttes-chaumont': 'place-buttes', belleville: 'pp-belleville-view', luxembourg: 'place-luxembourg', luco: 'place-luxembourg', villette: 'place-villette' };
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').trim();
  const words = p => fold([p.name, p.id.replace(/^(pp|place)-/, '').replace(/-/g, ' '), arrLabel(p.arr), p.kind, ...(p.tags || []), p.why].join(' '));
  // Map filter words: a tag, one of Codex's kinds, an arrondissement ("11", "11e", "1er") or free text.
  function matches(p, query) {
    const q = fold(query); if (!q || q === 'all' || q === 'guide') return true;
    const arr = q.match(/^(\d{1,2})(?:e|er|eme)?$/); if (arr) return p.arr === +arr[1];
    const tag = TAGS[q] || C.mapKinds.some(k => k.id === q) ? q : TAGS[q.replace(/s$/, '')] ? q.replace(/s$/, '') : null; // "shows", "parks"…
    if (tag) return p.kind === tag || (p.tags || []).includes(tag);
    return words(p).includes(q);
  }
  function findPlace(query) {
    const q = fold(query); if (!q) return null;
    if (parks[q]) return byId(parks[q]);
    return [...guide, ...Object.values(pins)].find(p => p.id === q || fold(p.name) === q) || [...guide, ...Object.values(pins)].find(p => fold(p.name).includes(q) || p.id.includes(q.replace(/\s+/g, '-'))) || null;
  }
  const findPersonal = key => { const q = fold(key).replace(/\s+/g, '-'); return personal.find(t => t.key === q || t.id === q || t.aliases.includes(q) || fold(t.title).includes(fold(key))) || null; };
  const hasGuide = s => guide.filter(p => p.id.startsWith('pp-')).every(p => s.atlas.places.some(x => x.id === p.id));
  // Add one pin (guide or personal) as an ordinary atlas place. Codex's default pins are reused, never duplicated.
  function ensurePin(s, pid) {
    const old = s.atlas.places.find(p => p.id === pid); if (old) return old;
    const g = byId(pid); if (!g) throw Error('Unknown Paris place.');
    if (s.atlas.places.length >= 100) throw Error('Your map holds up to 100 places. Remove one first.');
    const place = { id: g.id, name: g.name, lat: g.lat, lon: g.lon, quest: g.why.slice(0, 500), visitedAt: null, kind: g.kind, favorite: false };
    s.atlas.places.push(place); return place;
  }
  function addGuide(s) {
    let added = 0, full = 0;
    for (const g of guide) { if (s.atlas.places.some(p => p.id === g.id)) continue; if (s.atlas.places.length >= 100) { full++; continue; } ensurePin(s, g.id); added++; }
    return { added, full };
  }
  // Takes the guide's untouched pins back off the map: anything visited, starred or linked to a quest stays.
  function removeGuide(s) {
    const linked = new Set(s.campaigns.flatMap(c => [c.parisPlace, c.mapPlace,...(c.walk?.stops||[]).map(p=>typeof p==='string'?p:p.id)]).filter(Boolean));
    const keep = p => { const g=guide.find(g=>g.id===p.id);return !g||!p.id.startsWith('pp-')||p.visitedAt||p.favorite||linked.has(p.id)||p.name!==g.name||p.lat!==g.lat||p.lon!==g.lon||p.kind!==g.kind||p.quest!==g.why.slice(0,500); };
    const before = s.atlas.places.length; s.atlas.places = s.atlas.places.filter(keep);
    if (!s.atlas.places.some(p => p.id === s.atlas.selected)) s.atlas.selected = s.atlas.places[0].id;
    return before - s.atlas.places.length;
  }
  const campaignId = pid => 'c-pp-' + pid.replace(/^(pp|place)-/, '');
  function track(s, c) { c.paused = false; s.active = c.id; return c; }
  // A place's go → do → proof quest. Stable id, so accepting twice reopens the same campaign.
  function startPlace(s, pid) {
    const g = guide.find(p => p.id === pid); if (!g) throw Error('Choose a place from the Paris guide.');
    ensurePin(s, pid); s.atlas.selected = pid;
    const cid = campaignId(pid), old = s.campaigns.find(c => c.id === cid); if (old) return track(s, old);
    if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns.');
    const c = { id: cid, parisPlace: pid, title: g.name.slice(0, 100), subtitle: 'PARIS / ' + arrLabel(g.arr).toUpperCase() + ' / PLACE QUEST', path: pathOf(g.kind), why: `${g.why} Best: ${g.best}`.slice(0, 600), badge: (g.name + ' regular').slice(0, 100), quests: placeSteps(g).map((x, i) => step(cid, i, x)) };
    s.campaigns.push(c); return track(s, c);
  }
  function startPersonal(s, key, { park } = {}) {
    const t = findPersonal(key); if (!t) throw Error('Choose one of: ' + personal.map(t => t.key).join(', ') + '.');
    const pin = t.key === 'park' && park ? (findPlace(park)?.id || t.pin) : t.pin;
    if (pin) { ensurePin(s, pin); s.atlas.selected = pin; }
    const old = s.campaigns.find(c => c.id === t.id); if (old) return track(s, old);
    if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns.');
    const c = { id: t.id, parisPersonal: t.key, parisPlace: pin || null, title: t.title, subtitle: t.subtitle, path: t.path, why: t.why, badge: t.badge, quests: t.steps.map((x, i) => step(t.id, i, x, 'A short saved note, photo, memo or bounce is enough. Leave out names and private details; review checks this small brief only.')) };
    s.campaigns.push(c); return track(s, c);
  }
  // Paris campaigns with their step progress (for /quest list and the guide dialog).
  function progress(s) {
    return s.campaigns.filter(c => c.parisPlace !== undefined || c.parisPersonal).map(c => ({ id: c.id, title: c.title, total: c.quests.length, done: c.quests.filter(q => C.done(s, q.id)).length, next: C.next(s, c), paused: !!c.paused }));
  }
  const parkName = pid => ({ 'place-buttes': 'Buttes-Chaumont', 'pp-belleville-view': 'Belleville', 'place-luxembourg': 'Luxembourg', 'place-villette': 'La Villette' })[pid] || byId(pid)?.name || 'the park';
  const sketchTitle = (pid, date = new Date()) => `Park sketch · ${parkName(pid)} · ${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`;
  const outings=[
    {id:'pocket-samples',title:'Pocket sample hunt',path:'music',icon:'music',color:'#ff6b9d',places:['place-canal','pp-montsouris'],badge:'Street sampler',brief:'Find three non-private ambient sounds: a texture, a rhythm and a long tone. Record only where allowed, or describe and recreate them at home.',result:'Export a ten-second original loop using your own recordings or recreations. One change halfway through is enough.',tiny:'Take headphones and open the voice recorder.'},
    {id:'forgeheart-scout',title:'Forgeheart scout',path:'game',icon:'game',color:'#ff8c42',places:['pp-carnavalet','pp-arenes'],badge:'City worldbuilder',brief:'Find one doorway, sign or layout that could belong in Forgeheart. Sketch it and give it a fictional purpose.',result:'Show one prop or room sketch with a name, an interaction and a reason a player would care. A paper prototype counts.',tiny:'Take a pen or open a blank sketch.'},
    {id:'three-shots',title:'Three shots, one mood',path:'visual',icon:'visual',color:'#bd8bff',places:['pp-louxor','pp-forum-images'],badge:'Location director',brief:'After a screening, remember one mood and draw three original shots that could carry it in your own music visual. Do not record the screen.',result:'Show a three-panel storyboard with shot lengths and one transition. Keep the whole idea under fifteen seconds.',tiny:'Choose a film and check its start time.'},
    {id:'record-exchange',title:'Trade a discovery',path:'music',icon:'social',color:'#ffd75e',places:['pp-dizonord','pp-superfly'],badge:'Taste trader',brief:'Invite Thomas, Ismaël or Guillaume if you want. Each pick an unfamiliar record and explain one detail you like. Solo fallback: choose two records yourself. No purchase required.',result:'Keep the artist/title notes and export an original eight-bar answer to one idea. Your friend does not have to reply for you to finish.',tiny:'Choose one shop; an invitation draft is optional.'},
    {id:'tiny-reset',title:'Outside counts',path:'life',icon:'reset',color:'#e7a0ff',places:['pp-montsouris','place-luxembourg'],badge:'Fresh-air finder',brief:'Sit outside for one song without scrolling. Notice one sound, one colour and one small thing you would otherwise miss.',result:'Save three concrete lines about that visit and one tiny thing you want to do tomorrow. No creative masterpiece required.',tiny:'Put your shoes near the door.'},
    {id:'tile-safari',title:'Tile safari',path:'visual',icon:'visual',color:'#ffb14a',places:['pp-galerie-vivienne','pp-ima'],badge:'Pattern collector',brief:'Find a repeating shape. Draw its structure yourself and collect three colours for a completely new pattern.',result:'Show your original seamless tile plus a 2×2 repeat preview. Check the edges once, then call it finished.',tiny:'Open a blank sketch; a five-shape limit is enough.'}
  ];
  function discover(s,{query='',kind='all',unvisited=false,newOnly=false}={}){
    const visited=new Set(s.atlas.places.filter(p=>p.visitedAt).map(p=>p.id));
    return guide.filter(g=>(kind==='all'||g.kind===kind)&&(!newOnly||newPlaces.includes(g.id))&&(!unvisited||!visited.has(g.id))&&matches(g,query));
  }
  function startOuting(s,id,pid){
    const t=outings.find(t=>t.id===id);if(!t||!t.places.includes(pid))throw Error('Choose a place for this mini adventure.');
    const cid='c-pq-city-'+id,old=s.campaigns.find(c=>c.id===cid);if(old)return track(s,old);
    if(s.campaigns.length>=100)throw Error('Your journal holds up to 100 campaigns.');
    const g=byId(pid);ensurePin(s,pid);s.atlas.selected=pid;
    const steps=[['Make a small plan',`Choose a visit to ${g.name}. Check today’s access, route and any ticket cost on the official page. Save the time you intend to go and what you need to bring.`,t.tiny,5,15],['Find your ingredient',`At ${g.name}: ${t.brief} Keep a specific note or your own sketch/recording from the visit.`, 'Go for the smallest version of this visit; one detail is enough.',20,35],['Bring a little thing home',t.result,'Open the note, sketch or recording and work on it for five minutes.',15,40]];
    const c={id:cid,parisPersonal:'city-'+id,parisPlace:pid,title:t.title,subtitle:'PARIS / MINI ADVENTURE',path:t.path,why:g.name+' · '+t.brief,badge:t.badge,quests:steps.map((x,i)=>step(cid,i,x))};
    s.campaigns.push(c);return track(s,c);
  }
  // Friend missions use ordinary campaigns, evidence and reward budgets. No messages are sent.
  const socialMissions = [
    {id:'demo-swap',title:'Two demos, one bench',icon:'music',color:'#ff6b9d',path:'music',minutes:30,friends:['friend-thomas','friend-ismael','friend-guillaume'],places:['place-canal','place-buttes'],badge:'Demo courier',action:'Listen to one unfinished demo each on headphones. Each name a favourite moment and one change worth trying.',solo:'Listen to your own demo outside and mark one moment to keep and one to change.',result:'Keep two timestamped notes and bounce a ten-second revision. No polished track needed.',invite:'écouter deux démos sur un banc et échanger une idée chacun'},
    {id:'coop-scout',title:'Co-op before co-op',icon:'game',color:'#ff8c42',path:'game',minutes:30,friends:['friend-valentin'],places:['pp-arenes','place-luxembourg'],badge:'Co-op cartographer',action:'Walk together and invent a two-player objective using one feature of the place. Decide who does what, then try it on paper.',solo:'Sketch both player roles yourself; your friend can try it another day.',result:'Save a tiny diagram with two roles, one win condition and one way to help each other. Use it as a Forgeheart idea if it fits.',invite:'faire un petit tour et inventer une idée de jeu coop à deux'},
    {id:'check-in',title:'One-song check-in',icon:'social',color:'#ffd75e',path:'life',minutes:15,friends:['friend-guillaume'],places:['place-canal','pp-montsouris'],badge:'Small connection',action:'Take a short walk together and ask one real question about their week. Listen without turning it into a problem to solve.',solo:'Walk for one song and write a kind check-in you could send later; no reply needed.',result:'Save one non-private observation about your own mood and one small thing you would like to do next time.',invite:'prendre dix minutes dehors pour se donner des nouvelles'},
    {id:'record-relay',title:'The record relay',icon:'music',color:'#ff6b9d',path:'music',minutes:40,friends:['friend-thomas','friend-ismael','friend-guillaume'],places:['pp-dizonord','pp-superfly'],badge:'Crate companion',action:'Each choose an unfamiliar record and explain one sound you want to borrow as inspiration. Browsing is enough; no purchase required.',solo:'Choose two records and compare one sound from each yourself.',result:'Save the titles and a short original rhythm or sound inspired by your favourite detail.',invite:'fouiller quelques disques et se partager une découverte, sans obligation d’acheter'},
    {id:'photo-duet',title:'Same street, two eyes',icon:'visual',color:'#bd8bff',path:'visual',minutes:30,friends:[],places:['pp-galerie-vivienne','pp-carnavalet'],badge:'Double exposure',action:'Choose one colour together. Each capture or sketch three small architectural details in that colour, where permitted.',solo:'Make two sets yourself: one of shapes and one of textures.',result:'Arrange three details into a tiny moodboard and name it like a music single. Avoid identifiable strangers.',invite:'faire une petite chasse aux couleurs et fabriquer un mini moodboard'},
    {id:'picnic-loop',title:'Picnic with a loop',icon:'music',color:'#ffb14a',path:'music',minutes:45,friends:['friend-thomas','friend-ismael'],places:['place-buttes','pp-montsouris'],badge:'Park producer',action:'Bring a snack from home and build one eight-bar idea together on headphones. Swap one rhythm or melody suggestion; keep the volume private.',solo:'Make the eight bars yourself and save one question for a later listening session.',result:'Bounce twenty seconds with one clear change halfway through. The snack is optional; the loop is the finish line.',invite:'se poser au parc avec un snack et bricoler une boucle au casque'},
    {id:'museum-remix',title:'Museum remix duo',icon:'visual',color:'#e7a0ff',path:'visual',minutes:45,friends:[],places:['pp-carnavalet','pp-petit-palais'],badge:'Gallery accomplice',action:'Each choose one shape or colour in a work, then combine the two into an original thumbnail. Check access and photography rules first.',solo:'Choose two details yourself and combine them in a new drawing.',result:'Save one original thumbnail and a sentence about what you changed. A five-minute sketch is enough.',invite:'voir quelques œuvres et en tirer une petite idée visuelle ensemble'},
    {id:'sunset-postcard',title:'A sunset postcard',icon:'visual',color:'#ff8c42',path:'visual',minutes:20,friends:[],places:['pp-belleville-view','place-canal'],badge:'Golden-hour messenger',action:'Meet for a short outdoor break. Each name a sound, a colour and a good moment from the day. Daylight works too.',solo:'Take the break yourself and make a postcard you can share later, without waiting for a reply.',result:'Save a photo or sketch with a three-line caption. No faces or private conversation needed.',invite:'prendre une petite pause dehors et capturer une carte postale du moment'},
    {id:'show-warmup',title:'Before the show',icon:'social',color:'#ff6b9d',path:'life',minutes:20,friends:['friend-ismael','friend-thomas','friend-guillaume'],places:['pp-point-ephemere','pp-bellevilloise'],badge:'Gig wingmate',action:'Check a real upcoming show together: date, ticket price, meeting point and last way home. Walk by the venue if practical; no booking needed.',solo:'Scout one suitable show and write a low-pressure invitation for later.',result:'Keep the official show link, date, maximum budget and a return route. Sold out or too expensive? Save a different candidate.',invite:'repérer un concert et décider d’un plan simple, sans réserver tout de suite'},
    {id:'next-adventure',title:'Plan the next escape',icon:'social',color:'#ffd75e',path:'life',minutes:20,friends:[],places:['place-luxembourg','place-canal'],badge:'Plans that happen',action:'Meet for a short walk and each suggest one affordable outing. Choose a possible date and one backup. Toulouse can be a research idea, not a booking.',solo:'List two possible outings and draft a suggestion for your friend to consider later.',result:'Save one place, two possible dates and a spending cap. For travel, link an actual fare search; never guess a bargain.',invite:'faire un petit tour et choisir une prochaine sortie avec un budget tranquille'}
  ];
  const socialTreats = [
    {id:'listening',name:'An album, uninterrupted',icon:'music',cost:8,amount:0,note:'Headphones, a whole album, nothing to produce. Pick it yourself or ask a friend.'},
    {id:'coop',name:'A guilt-free co-op hour',icon:'game',cost:15,amount:0,note:'An hour of a game you already own. Invite Valentin if he is free; solo play counts too.'},
    {id:'screening',name:'Your own premiere',icon:'visual',cost:12,amount:0,note:'Show a tiny visual or demo to a willing friend, or enjoy a private screening with a snack from home.'},
    {id:'free-night',name:'A night with no deliverable',icon:'reset',cost:18,amount:0,note:'Play, listen or rest. No proof, publishing or making the evening productive.'},
    {id:'pastry',name:'Bakery detour',icon:'gift',cost:15,amount:5,note:'Reserve up to €5 for a favourite snack after an outing. Edit the allowance to the real price.'},
    {id:'coffee',name:'Coffee with a friend',icon:'social',cost:20,amount:8,note:'Reserve up to €8 for a café stop with someone from your circle. Confirm the actual cost yourself.'},
    {id:'artist',name:'Support a discovery',icon:'music',cost:30,amount:10,note:'Reserve up to €10 toward music you loved discovering. Check the release price before buying.'},
    {id:'show-fund',name:'Next-show envelope',icon:'social',cost:50,amount:20,note:'Set aside up to €20 toward a real show. This is a personal spending plan, not a ticket or a payment.'}
  ];
  function socialChoices(s,{friendId='',quick=false}={}) {
    return socialMissions.filter(t=>!quick||t.minutes<=20).map((t,i)=>({t,i})).sort((a,b)=>Number(b.t.friends.includes(friendId))-Number(a.t.friends.includes(friendId))||a.i-b.i).map(x=>x.t);
  }
  function socialCampaign(s,id,friendId){return s.campaigns.find(c=>c.socialMission===id&&c.socialFriend===friendId);}
  function socialInvite(s,id,friendId,pid){
    const t=socialMissions.find(t=>t.id===id),f=s.world.friends.find(f=>f.id===friendId),g=byId(pid);
    if(!t||!f||!t.places.includes(pid)||!g)throw Error('Choose a friend and one of this mission’s places.');
    return `Salut ${f.name} ! Ça te dit de ${t.invite} vers ${g.name} ? On se garde environ ${t.minutes} min (plus le trajet). Je pensais à [jour / heure]. Aucun souci si tu n’es pas dispo !`;
  }
  function stockSocialTreat(s,id){
    const t=socialTreats.find(t=>t.id===id);if(!t)throw Error('Choose a treat.');
    let r=s.rewards.find(r=>r.id==='r-city-social-'+id);
    if(!r){if(s.rewards.length>=100)throw Error('Your reward bay is full. Remove an unused treat first.');r={id:'r-city-social-'+id,name:t.name,cost:t.cost,amount:t.amount,note:t.note};s.rewards.push(r);}
    s.rewardGoal=r.id;return r;
  }
  function startSocial(s,id,friendId,pid,{treatId=''}={}){
    const t=socialMissions.find(t=>t.id===id),f=s.world.friends.find(f=>f.id===friendId);
    socialInvite(s,id,friendId,pid); // Validate every choice before changing the journal.
    const old=socialCampaign(s,id,friendId);if(old)return track(s,old);
    if(s.campaigns.length>=100)throw Error('Your journal holds up to 100 campaigns.');
    if(treatId&&(!socialTreats.some(t=>t.id===treatId)||(!s.rewards.some(r=>r.id==='r-city-social-'+treatId)&&s.rewards.length>=100)))throw Error('Choose an available treat or continue without one.');
    const g=byId(pid),cid=C.id('c'),hint='Your own short note, sketch, chat artifact or original audio is enough. No private messages or evidence of a friend’s reply is required. Review checks your actions and the stated solo fallback.';
    const steps=[['Make the invite easy',`Plan ${t.title.toLowerCase()} with ${f.name} at ${g.name}. Check access, route and possible cost; choose a time. Save an invitation draft or send it yourself if you want. A reply is not required.`, 'Pick one possible time. The editable invitation is ready in Friend outings.',5,15],['Take the little adventure',`${t.action} If your friend is busy: ${t.solo} Save a specific note or your own creation from doing it.`, 'Do the smallest version. Travel time is extra.',Math.max(5,t.minutes-10),35],['Keep one good thing',t.result,'Open your note or creation and give it five minutes.',5,40]];
    ensurePin(s,pid);s.atlas.selected=pid;
    const reward=treatId?stockSocialTreat(s,treatId):null;
    const c={id:cid,socialMission:id,socialFriend:friendId,socialFriendName:f.name,socialTreat:reward?.id||null,parisPlace:pid,parisPersonal:'social-'+id,title:(t.title+' · '+f.name).slice(0,100),subtitle:'PARIS / FRIEND OUTING',path:t.path,why:g.name+' · '+t.action,badge:t.badge,quests:steps.map((x,i)=>step(cid,i,x,hint))};
    s.campaigns.push(c);return track(s,c);
  }
  return { TAGS, guide, pins, personal, parks, byId, arrLabel, matches, findPlace, findPersonal, hasGuide, ensurePin, addGuide, removeGuide, startPlace, startPersonal, progress, campaignId, parkName, sketchTitle, words, placeSteps, newPlaces, outings, discover, startOuting, socialMissions, socialTreats, socialChoices, socialCampaign, socialInvite, stockSocialTreat, startSocial };
});
