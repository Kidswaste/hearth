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
    const linked = new Set(s.campaigns.flatMap(c => [c.parisPlace, c.mapPlace]).filter(Boolean));
    const keep = p => !p.id.startsWith('pp-') || p.visitedAt || p.favorite || linked.has(p.id);
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
  return { TAGS, guide, pins, personal, parks, byId, arrLabel, matches, findPlace, findPersonal, hasGuide, ensurePin, addGuide, removeGuide, startPlace, startPersonal, progress, campaignId, parkName, sketchTitle, words };
});
