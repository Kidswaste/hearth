// Quest content is local and editable by release, never a generated model task.
(function (root, make) { const value = make(); if (typeof module === 'object') module.exports = value; else root.QuestCatalog = value; })(typeof self !== 'undefined' ? self : this, () => {
  const paths = [
    { id: 'visual', name: 'Visual Alchemist', icon: '◈', color: '#bd8bff', description: 'Give light, texture and sound a shape.', skills: ['Curiosity', 'Texture keeper', 'Motion apprentice', 'Scene maker', 'Visual storyteller'] },
    { id: 'music', name: 'Sound Explorer', icon: '♫', color: '#ffb14a', description: 'Collect sounds. Shape them into something yours.', skills: ['Listener', 'Sample hunter', 'Sound sculptor', 'Loop architect', 'Sonic storyteller'] },
    { id: 'game', name: 'World Builder', icon: '⬡', color: '#ff6b6b', description: 'A small world. One good interaction.', skills: ['Player', 'Rule maker', 'Interaction designer', 'World keeper', 'Game maker'] },
    { id: 'life', name: 'Everyday Adventurer', icon: '☀', color: '#ffd75e', description: 'Make a little room for the life you want.', skills: ['Here again', 'Small steps', 'Finding rhythm', 'Making space', 'Steady adventurer'] },
  ];
  const q = (id, title, done, tiny, minutes, xp, tool, deep) => ({ id: `q-${id}`, title, done, tiny, minutes, xp, tool, deep: deep || 'Try one variation. Keep the version you prefer; more is optional.' });
  const campaigns = [
    { id: 'c-material', title: 'A texture worth keeping', subtitle: 'CHAPTER I · SMALL WORLDS', path: 'visual', why: 'Make one seamless material you would actually use in a scene.', badge: 'Texture keeper', quests: [
      q('material-seed', 'Find a pattern that pulls you in', 'Save the seed or a screenshot of one seamless tile you want to develop.', 'Open Seamless tiles and look at just one pattern.', 5, 25, 'tiles'),
      q('material-palette', 'Give it a palette', 'Choose three colors and write down their hex values.', 'Pick one color you want to keep.', 10, 35, 'tiles'),
      q('material-test', 'Look beyond the edges', 'Check the tile repeated in a 3 × 3 grid. Adjust or accept the seams deliberately.', 'Place two copies beside each other.', 15, 40, 'tiles'),
      q('material-export', 'Keep the finished thing', 'Export the tile, give it a useful name, and attach it here or write where it lives.', 'Choose the filename before you export.', 5, 60, 'tiles', 'Try the texture on a simple Three.js object. Stop after one material.'),
    ] },
    { id: 'c-passage', title: 'Passage I · a sound takes shape', subtitle: 'CHAPTER II · LIGHT IN MOTION', path: 'visual', why: 'Finish one short music-reactive loop, with a stable subject and a deliberate palette.', badge: 'First passage', quests: [
      q('passage-sound', 'Choose your fifteen seconds', 'Write down a track and a 15-second section to build around.', 'Listen to a favorite track for two minutes.', 5, 25, 'lab'),
      q('passage-subject', 'One shape. One mood.', 'Save a scene with one central subject and a chosen palette.', 'Name the shape and the feeling in one sentence.', 15, 40, 'lab'),
      q('passage-react', 'Let one sound move it', 'Connect one audio feature to one visual property and preview the result.', 'Choose the pair: for example bass → scale.', 20, 50, 'lab'),
      q('passage-cut', 'Choose what to leave out', 'Keep one version. Remove or disable one distracting element.', 'Write down what you like most about the current version.', 10, 35, 'lab'),
      q('passage-export', 'Eight seconds, finished', 'Export at least eight seconds, watch it once, and keep the file.', 'Choose a filename and where the export will go.', 10, 70, 'lab', 'Make a second aspect ratio only after your first export is safely saved.'),
    ] },
    { id: 'c-samples', title: 'Your pocket sample pack', subtitle: 'CHAPTER III · FOUND FREQUENCIES', path: 'music', why: 'Build a tiny pack of three sounds that belong together.', badge: 'Sound collector', quests: [
      q('samples-theme', 'Name the world it comes from', 'Choose a theme and three sound roles: for example pulse, texture, accent.', 'Write one word for the mood.', 5, 25, 'sounds'),
      q('samples-first', 'Keep one good sound', 'Record, import or synthesize one sound and save a source copy.', 'Listen to or generate one candidate.', 10, 35, 'sounds'),
      q('samples-shape', 'Find its best moment', 'Trim the sound, check the edges, and export a named WAV.', 'Mark the moment you want to keep.', 10, 40, 'slice'),
      q('samples-family', 'Make a family of three', 'Create two complementary sounds and export all three.', 'Choose how the second sound will differ from the first.', 20, 50, 'rack'),
      q('samples-pack', 'Make it easy to use later', 'Put the three WAVs in a named folder with a short note about their purpose.', 'Create the folder and give it a name.', 10, 65, 'files', 'Build a four-bar idea in your DAW using the pack. The pack is already finished.'),
    ] },
    { id: 'c-world', title: 'A tiny world that plays', subtitle: 'OPTIONAL CAMPAIGN · PLAYFUL SYSTEMS', path: 'game', why: 'Finish a playable experiment with one clear rule, not an entire game.', badge: 'World seed', quests: [
      q('world-rule', 'Choose one good rule', 'Describe the player action, goal and obstacle in one sentence.', 'Name one interaction you enjoy in a game.', 5, 25, 'arena'),
      q('world-prototype', 'Make the rule playable', 'Create or configure a prototype and play one complete round.', 'Open the prototype and change one setting.', 20, 50, 'arena'),
      q('world-feedback', 'Make success feel different', 'Add or choose one visual or sound cue, then test it.', 'Choose what success should sound or look like.', 15, 40, 'sounds'),
      q('world-finish', 'Call this version done', 'Export a playable file and write one sentence explaining its controls.', 'Write the controls in plain language.', 10, 65, 'arena'),
    ] },
    { id: 'c-space', title: 'Make a little room', subtitle: 'SIDE CAMPAIGN · EVERYDAY LIFE', path: 'life', why: 'Make starting your next creative session feel easier.', badge: 'Room to begin', quests: [
      q('space-clear', 'Clear one small surface', 'Clear only the space you need for your next session.', 'Move one item to its proper place.', 5, 25, null),
      q('space-ready', 'Leave a door open', 'Prepare a project, tool or folder so the next session has an obvious starting point.', 'Choose which project you want to return to.', 5, 25, null),
      q('space-note', 'A message to future you', 'Write a one-sentence next action and leave it where you will see it.', 'Start the sentence: “Next time, I will…”', 3, 30, null),
    ] },
  ];
  const daily = [
    ['visual', 'Collect one beautiful detail', 'Save or sketch one interesting texture, color or reflection and note why you chose it.', 'Look around for one interesting color.', 'tiles'],
    ['music', 'Listen for the hidden part', 'Listen to one track and write down a sound you had not noticed before.', 'Put on one track.', null],
    ['life', 'Make tomorrow easier', 'Do one small setup task that removes friction from tomorrow.', 'Choose the smallest thing you can prepare.', null],
    ['game', 'Borrow a playful idea', 'Play or remember one game mechanic and describe what makes it satisfying.', 'Name a game interaction you like.', 'arena'],
    ['visual', 'Finish a tiny export', 'Export one existing experiment as an image or short clip. A rough version counts.', 'Open the experiment you want to keep.', 'lab'],
    ['music', 'Rescue a forgotten sound', 'Find one old sound or sketch and save it somewhere you can find again.', 'Open your sketches folder.', 'slice'],
  ];
  // Each commission has a small exportable finish and an optional larger contract, never a vague project.
  const contract = (id, title, goal, tiny, tool, proof, extra) => ({ ...q(`studio-${id}`, title, goal, tiny, 25, 50, tool), proofHint: proof,
    variants: { sketch: { minutes: 10, xp: 30, done: goal + ' Keep the first rough version; one take or still is enough.' }, studio: { minutes: 25, xp: 50, done: goal }, showcase: { minutes: 45, xp: 75, done: goal + ' ' + extra } } });
  const commissions = [
    { id: 'c-studio-demo', title: 'A demo worth pressing play on', subtitle: 'MUSIC / ONE SHORT SONG', path: 'music', why: 'Turn a hook into a 30–60 second demo with a beginning, a change and an ending. No full release required.', badge: 'Demo tape 01', commission: true, quests: [
      contract('demo-hook', 'Find the part you would replay', 'Export an eight-bar hook with a clear lead idea and a simple supporting part.', 'Open a project and play one sound you want to hear again.', 'rack', 'Audio bounce plus a sentence about the intended mood; a piano-roll or arrangement screenshot helps.', 'Make a second variation and explain why the first or second wins.'),
      contract('demo-shape', 'Give the demo a beginning and an exit', 'Export a 30–60 second demo with an opening, one audible change and a deliberate ending.', 'Duplicate the hook once and remove one element from the opening.', 'rack', 'Audio export and an arrangement screenshot with the three sections visible.', 'Refine one transition and compare it against the rough bounce.'),
      contract('demo-bounce', 'Print the version you will keep', 'Export a named demo, check the start and tail, and write one specific thing to improve next.', 'Name the bounce before touching another plugin.', 'files', 'Final audio file with a short change log; no project screenshot alone.', 'Make a level-matched comparison to the previous bounce and describe one improvement.')
    ] },
    { id: 'c-studio-loop', title: 'A loop with somewhere to go', subtitle: 'MUSIC / GROOVE LAB', path: 'music', why: 'Make a satisfying loop, add one variation, then export something reusable.', badge: 'Loop keeper', commission: true, quests: [
      contract('loop-pocket', 'Make eight bars move', 'Export an eight-bar drum and bass loop; state its BPM and what creates its groove.', 'Choose a kick and place four hits.', 'rack', 'Loop audio, BPM and a sequencer screenshot.', 'Change one timing or velocity pattern and compare the two grooves.'),
      contract('loop-turn', 'Make bar nine worth reaching', 'Export the loop followed by one eight-bar variation that keeps its identity.', 'Mute one part for the first beat of the variation.', 'rack', 'A 16-bar bounce with the change labelled in your notes.', 'Make the last two bars lead naturally back to the start.'),
      contract('loop-pack', 'Save a loop you can actually reuse', 'Export one named loop with BPM and key (or unpitched), and check the seam.', 'Write a useful filename.', 'slice', 'Loop file and a short seam check; include a waveform screenshot if useful.', 'Export drums and tonal parts separately with matching lengths.')
    ] },
    { id: 'c-studio-visual', title: 'One visual with a pulse', subtitle: 'VISUAL / PASSAGE STUDY', path: 'visual', why: 'A clear central subject, a held palette and a short movement worth looping.', badge: 'Afterimage', commission: true, quests: [
      contract('visual-frame', 'Make one frame carry the idea', 'Export a still with one clear subject, a deliberate palette and readable separation from the background.', 'Open one scene and choose the subject you want to keep.', 'lab', 'An actual image export, not just a description of the scene.', 'Export a second crop and explain which composition reads better.'),
      contract('visual-motion', 'Give the frame one good movement', 'Export a 6–12 second clip with one intentional movement; keep the subject and palette readable.', 'Animate only one property.', 'lab', 'A short clip; review uses sampled frames, so include notes on timing.', 'Align one visual accent to a chosen musical moment and identify its timestamp.'),
      contract('visual-loop', 'Hide the join', 'Export a loop and show its first and last frames; explain how the movement reconnects.', 'Compare the first and final frame before changing anything else.', 'lab', 'Video or first/middle/last frames with the loop duration.', 'Fix one seam or pacing issue and show a before/after pair.')
    ] },
    { id: 'c-studio-game', title: 'One game idea, much better', subtitle: 'GAME / FEEL PASS', path: 'game', why: 'Polish one interaction until a player can understand and enjoy it. Avoid turning it into a whole new game.', badge: 'Feels good to play', commission: true, quests: [
      contract('game-promise', 'Pick the ten seconds that matter', 'Show one interaction and write what the player does, what happens and why it should feel good.', 'Name the action you most want to improve.', 'arena', 'Gameplay image/clip or a real implementation excerpt with controls.', 'Identify one confusing moment using a recorded example.'),
      contract('game-feedback', 'Make the response unmistakable', 'Change one feedback cue, timing value or control response and show the interaction before and after.', 'Choose only one cue: sound, impact, timing or movement.', 'arena', 'Before/after images or clip, with the exact change described.', 'Compare two settings and explain which one better serves the interaction.'),
      contract('game-test', 'Fix what a fresh run reveals', 'Play one complete round, identify one concrete problem, fix it and show the same moment again.', 'Play for two minutes and write down the first friction point.', 'arena', 'Test notes plus actual before/after evidence; a claim of “fixed” is not enough.', 'Repeat the test with one edge case and document the result.')
    ] },
    { id: 'c-studio-forge', title: 'Forgeheart: one meaningful upgrade', subtitle: 'FORGEHEART / SMALL RELEASE', path: 'game', why: 'Move the survivor, forging and factory game forward through one bounded change and a repeatable test.', badge: 'Forged forward', commission: true, quests: [
      contract('forge-friction', 'Find one thing that breaks the flow', 'Play a Forgeheart run and document one specific friction point in drones, forging, affixes, the lattice or rifts.', 'Open Forgeheart and choose one system to observe.', 'forge', 'Gameplay capture or a Hearth chat showing the actual test, with reproduction steps.', 'Describe the expected behavior and one measurable success condition.'),
      contract('forge-change', 'Land one bounded improvement', 'Implement one change for that friction point and show the actual diff or changed gameplay.', 'Write the smallest change that could help.', 'forge', 'A diff/code excerpt from the working chat or before/after gameplay; include what you personally decided or tested.', 'Check one neighboring system and document that it still works.'),
      contract('forge-proof', 'Prove the upgrade survives a run', 'Repeat the original test, report the result, and write a short player-facing patch note.', 'Run the same reproduction steps once.', 'forge', 'Test evidence from the run plus the patch note; mention remaining limitations.', 'Test a second build or edge case and identify the next small Forgeheart milestone.')
    ] }
  ];
  const treats = [
    { id: 'r-studio-listen', name: 'An album, headphones on, no multitasking', cost: 8, category: 'RESET', note: 'Pick the record before you start the quest.' },
    { id: 'r-studio-play', name: 'A proper game session', cost: 18, category: 'PLAY', note: 'Choose a game you actually want to sink into.' },
    { id: 'r-studio-dig', name: 'A sample-digging expedition', cost: 25, category: 'DISCOVER', note: 'Collect sounds for fun. No obligation to turn them into a track.' },
    { id: 'r-studio-plugin', name: 'Try a plugin on a throwaway session', cost: 35, category: 'EXPLORE', note: 'A demo or something already owned. No purchase happens here.' },
    { id: 'r-studio-night', name: 'A free-choice creative night', cost: 50, category: 'PLAY', note: 'Follow the interesting thing without a brief or score.' },
    { id: 'r-studio-wishlist', name: 'My next sample pack / plugin fund', cost: 100, category: 'WISHLIST', note: 'Rename this and choose your own real-world budget. Sparks only record your intention.' }
  ];
  // Stable IDs: accepting a card makes one quest, even after dealing or reloading.
  // The twist is authored for its brief; it never changes the XP or becomes mandatory by surprise.
  const card = (id, lane, mood, minutes, title, goal, tiny, tool, twist) => ({ id, lane, mood, path: lane === 'forge' ? 'game' : lane, minutes, title, done: goal, tiny, tool, twist });
  const deck = [
    card('tape-hook', 'music', 'make', 15, 'The voice-note single', 'Bounce a 20–30 second demo built around one hummed, played or recorded hook. Include a short note about the intended feeling.', 'Record one imperfect melody before choosing a preset.', 'rack', 'Use only one supporting instrument besides the hook.'),
    card('frame-chrome', 'visual', 'make', 15, 'Chrome in the quiet', 'Export one frame with a reflective central object and a background that lets its silhouette read.', 'Place one object and one light.', 'lab', 'Use only two palette colors, plus neutral highlights.'),
    card('feel-impact', 'game', 'polish', 15, 'Make the hit land', 'Change one impact cue in a game prototype. Show before/after evidence and state the exact sound, timing or visual change.', 'Find one action whose feedback feels weak.', 'arena', 'Improve the cue without adding screen shake.'),
    card('forge-drone', 'forge', 'polish', 30, 'A drone with a clear job', 'Improve one drone behavior or its readability in Forgeheart. Show the change and test the same situation before and after.', 'Observe one drone for a minute and name one confusing behavior.', 'forge', 'Solve it without adding another control or button.'),
    card('reset-door', 'life', 'reset', 5, 'Leave the studio door open', 'Prepare one project for your next session and save a note naming the file and the first action. Show the note or prepared workspace.', 'Open the project you want to return to.', 'files', 'Make the next action possible in under two minutes.'),
    card('tape-one', 'music', 'explore', 15, 'One synth, three faces', 'Export three short sounds from one synth: a bass, a soft texture and an accent. Label what changed between them.', 'Load one synth you already have.', 'sounds', 'Keep the same oscillator source for all three sounds.'),
    card('frame-tile', 'visual', 'remix', 15, 'A tile gets a second life', 'Use an existing seamless tile on a simple object and export the result. Include the original tile for comparison.', 'Choose one tile you already like.', 'tiles', 'Keep the texture colors and change only lighting or material response.'),
    card('feel-sign', 'game', 'make', 15, 'Teach without a paragraph', 'Make one game action understandable with a visual or audio cue. Show the cue and a brief test of whether the action is clear.', 'Write the one action a new player should notice.', 'arena', 'Use no written instruction in the cue itself.'),
    card('forge-affix', 'forge', 'explore', 15, 'An affix worth picking', 'Compare two Forgeheart affixes in the same situation. Save the observations and propose one bounded balance or wording improvement.', 'Pick two affixes that seem too similar.', 'forge', 'Keep the proposed change to one number or one sentence.'),
    card('reset-pile', 'life', 'reset', 5, 'Rescue one unfinished thing', 'Find one abandoned sketch, save a usable copy and write one small finish line for it. Show the copy or the actual saved note.', 'Open the sketches folder; choose the first interesting thing.', 'files', 'Do not reorganize the whole folder.'),
    card('tape-pocket', 'music', 'make', 15, 'The crooked pocket', 'Bounce an eight-bar groove and state its BPM. Include a sequencer screenshot showing the timing or velocity pattern.', 'Place a kick and a snare before adding anything else.', 'rack', 'Create the variation with velocity; keep all hit positions fixed.'),
    card('frame-echo', 'visual', 'make', 30, 'Echoes around a still center', 'Export a 6–10 second visual loop with a stable central subject and moving echoes. Include the first and last frames.', 'Duplicate the subject once and reduce the copy’s scale.', 'lab', 'Use three echoes at most, each proportionally smaller.'),
    card('feel-choice', 'game', 'explore', 15, 'Two choices that matter', 'Sketch two competing upgrades for a game idea and walk through one situation where each wins. Submit the actual sketch or design note.', 'Name the tradeoff in one sentence.', 'arena', 'Neither choice may be a straight damage increase.'),
    card('forge-lattice', 'forge', 'polish', 30, 'Read the lattice at a glance', 'Improve one lattice label, connection or selection cue in Forgeheart. Show the changed view and test that its state is understandable.', 'Capture the one part you find hard to read.', 'forge', 'Keep the layout unchanged; solve the problem with hierarchy or contrast.'),
    card('reset-listen', 'life', 'explore', 5, 'A postcard from a record', 'Listen to a short section of a favorite track. Save three specific observations and one idea you want to try in your own work.', 'Choose one track and listen without opening another tab.', null, 'Describe sound and movement without using genre names.'),
    card('tape-found', 'music', 'remix', 15, 'A room becomes a drum kit', 'Record or reuse one everyday sound and export a kick-like hit, a short tick and a texture made from it. Include the original.', 'Record one tap or scrape.', 'slice', 'Use no additional sound source.'),
    card('frame-type', 'visual', 'make', 15, 'A title with a pulse', 'Export a short title study: one word, a readable composition and one movement. Include a still and a brief timing note.', 'Choose one word and place it in the frame.', 'lab', 'Animate spacing or position, never opacity.'),
    card('feel-end', 'game', 'polish', 15, 'An ending that feels earned', 'Improve the end of one round in a prototype. Show the result screen or cue and document one complete test run.', 'Play to the end once and name what feels abrupt.', 'arena', 'Reuse the existing art and sounds.'),
    card('forge-rift', 'forge', 'make', 30, 'A rift with a warning', 'Add or refine one cue that signals a rift event in Forgeheart. Show when it appears and test one normal and one edge case.', 'Identify the moment a player needs warning.', 'forge', 'Make the cue understandable even with audio muted.'),
    card('reset-export', 'life', 'reset', 5, 'Find it again tomorrow', 'Give one finished export a useful name, put it in a known folder and save a one-line description. Show the export or file listing.', 'Choose one export that currently has an unhelpful name.', 'files', 'Include the project and version in the filename.'),
    card('tape-transition', 'music', 'polish', 15, 'The four bars before', 'Improve one transition in an existing demo. Export before and after versions and identify the changed bars.', 'Listen only to the four bars around the transition.', 'rack', 'Create the transition by taking something away.'),
    card('frame-palette', 'visual', 'explore', 15, 'Same scene, different weather', 'Export two versions of the same composition with different palettes. Choose one and explain which feeling it supports.', 'Duplicate the scene before changing its colors.', 'lab', 'Hold geometry and camera completely fixed.'),
    card('feel-friction', 'game', 'polish', 30, 'Remove one tiny annoyance', 'Find one friction point in a playable idea, fix it, and show the same test before and after. Include reproduction steps.', 'Play for two minutes and note the first annoyance.', 'arena', 'Fix it by removing or simplifying something.'),
    card('forge-factory', 'forge', 'polish', 30, 'A factory you can follow', 'Improve one Forgeheart factory flow cue or bottleneck. Show what enters, what leaves and the result of a repeatable test.', 'Follow one resource through one machine.', 'forge', 'Keep the change to one machine or one connection.'),
    card('tape-plugin', 'music', 'explore', 15, 'What does this knob really do?', 'Use a plugin you own on a short loop. Export dry and processed versions, a settings screenshot and a note on the intended change.', 'Choose one effect and leave every control at default.', 'rack', 'Change only one control and compare at a similar output level.'),
    card('frame-cover', 'visual', 'remix', 15, 'Sleeve for an unfinished song', 'Make a square cover study for one of your own demos. Export the image and explain its connection to the music.', 'Name the demo’s mood in three words.', 'lab', 'Use one shape and one texture; no title text.'),
    card('tape-tail', 'music', 'polish', 5, 'Give the last note room', 'Export a short existing phrase with a clean start and a deliberate tail. Show the waveform and describe the edit.', 'Listen to the first and last second of the file.', 'slice', 'Keep the musical content untouched; edit only its boundaries.'),
    card('frame-ascii', 'visual', 'remix', 30, 'Letters in the afterimage', 'Export a short visual with an ASCII layer supporting a clear central subject. Include a clean still showing the hierarchy.', 'Choose a sparse character set and a low-opacity layer.', 'lab', 'Keep the ASCII layer outside the subject’s silhouette.'),
    card('tape-answer', 'music', 'make', 30, 'A melody gets an answer', 'Bounce a 30-second sketch with a call, an answering phrase and a simple ending. Add an arrangement screenshot.', 'Play a two-bar phrase and leave two bars of space.', 'rack', 'Build the answer from the call’s rhythm with different notes.'),
    card('frame-join', 'visual', 'polish', 15, 'Catch the loop seam', 'Compare the start and end of an existing animation, fix one visible discontinuity and export a revised loop with matching boundary frames.', 'Put the first and final frame side by side.', 'lab', 'Keep the duration fixed while repairing the seam.')
  ];
  // Opt-in expeditions. Stable IDs preserve finished and paused work across releases.
  const lifeStep = (id, title, done, tiny, minutes = 5) => ({ ...q(`life-${id}`, title, done, tiny, minutes, minutes === 5 ? 20 : 35, null, 'Stop at the finish line. Save a next idea only if you want one.'), proofHint: 'A short saved note or checklist is enough. Share only the relevant part, with names and private details removed. Review checks this small brief, not your worth or productivity.' });
  const lifeArcs = [
    { id: 'c-life-base', title: 'Reclaim the command desk', subtitle: 'BASE CAMP', path: 'life', color: '#bd8bff', art: 'terminal', why: 'Make one corner inviting enough to start a demo, visual or Forgeheart session. The rest of the room can wait.', badge: 'Base camp restored', quests: [
      lifeStep('base-clear', 'Clear one landing pad', 'Choose a laptop-sized patch of your desk. Put away five things or clear that patch, whichever comes first. Save a before/after note or cropped photo.', 'Pick up the nearest thing that has a home.'),
      lifeStep('base-ready', 'Build your instant-start setup', 'Prepare one project, headphones or controller so it is ready to use. Save a three-item ready checklist and the project name.', 'Choose what you want to make next.'),
      lifeStep('base-use', 'Use the space you just rescued', 'Spend five minutes making one sound, frame or game observation. Save the tiny result and one sentence about what was easier.', 'Open the prepared project and change one thing.')
    ] },
    { id: 'c-life-admin', title: 'Defeat one open tab', subtitle: 'ADMIN MINI-BOSS', path: 'life', color: '#ff6b9d', art: 'adventure', why: 'Choose one nagging task and remove its next obstacle. One message, appointment or form section is enough.', badge: 'Tab closed', quests: [
      lifeStep('admin-name', 'Give the boss a name', 'Write one avoided admin task, what done would look like, and the next physical action. Keep the task small enough for a short session.', 'Write: The thing taking up space in my head is...'),
      lifeStep('admin-move', 'Take one concrete action', 'Do the next action: draft a message, find the right contact, or complete one form section. Save a redacted action log with what changed and what remains.', 'Open only the document or contact you need.', 15),
      lifeStep('admin-close', 'Close it or leave a clean handoff', 'Save a final status: done, or waiting on a type of response. If waiting, choose your own follow-up day and next action. Remove personal identifiers.', 'Write Done or Waiting on in your note.')
    ] },
    { id: 'c-life-outside', title: 'Take the artist outside', subtitle: 'FIELD TRIP', path: 'life', color: '#ffd75e', art: 'room', why: 'A tiny change of scene can become a color palette, rhythm or detail for your next world. A window or doorway counts too.', badge: 'Field recorder', quests: [
      lifeStep('outside-look', 'Find a different view', 'Spend a few minutes outdoors, by a window or in another accessible spot. Save three specific things you noticed: a color, a sound and a shape.', 'Choose a nearby spot that is easy to reach.'),
      lifeStep('outside-pocket', 'Bring back one little treasure', 'Save a photo, short sound, drawing or written description of one detail you want to keep. Explain what caught your attention.', 'Choose one of the three things you noticed.'),
      lifeStep('outside-remix', 'Smuggle it into your art', 'Turn that detail into one tiny palette, rhythm, texture sketch or game-world note. Show the source and your small response.', 'Pick just one medium and make a rough first mark.', 15)
    ] },
    { id: 'c-life-connect', title: 'Open a co-op lobby', subtitle: 'GOOD COMPANY', path: 'life', color: '#ff8c42', art: 'game', why: 'Make room for someone you enjoy. A private draft counts as the first move; another person’s reply never decides your XP.', badge: 'Co-op host', quests: [
      lifeStep('connect-pick', 'Think of your player two', 'Choose someone and write a specific shared interest or moment you could mention. Save an anonymized two-line invitation draft.', 'Think of one person you would enjoy hearing from.'),
      lifeStep('connect-invite', 'Make the invitation easy', 'Draft or send one low-pressure invitation to listen, play, walk or catch up. Include a simple option and an easy way to decline. Submit only your redacted draft, not their messages.', 'Start with the shared interest you chose.'),
      lifeStep('connect-plan', 'Prepare something to share', 'Choose one track, game, image or memory to bring to that conversation. Save what you picked and why. No reply or scheduled meetup is required.', 'Pick one thing you think they might enjoy.')
    ] },
    { id: 'c-life-rescue', title: 'Rescue the almost-finished', subtitle: 'BACKLOG DUNGEON', path: 'life', color: '#ff6b6b', art: 'collection', why: 'Get one old demo, visual or game idea across a deliberately small finish line. A rough artifact beats another giant plan.', badge: 'Backlog escapee', quests: [
      lifeStep('rescue-pick', 'Choose the smallest survivor', 'Open one unfinished project and save a note: what already works, what you will finish, and two things you will deliberately leave out.', 'Open the first old project that still interests you.'),
      lifeStep('rescue-cut', 'Make the one change that matters', 'Spend one short session on the chosen finish line. Save a changed bounce, frame, diff or design note and say exactly what changed.', 'Do the smallest part of the change before improving anything else.', 15),
      lifeStep('rescue-keep', 'Put a version on the shelf', 'Save a named keepable version and a two-sentence release note: what it is and what remains rough. Include the result or an actual working-chat excerpt.', 'Choose the filename before doing another polish pass.')
    ] },
    { id: 'c-life-landing', title: 'Make tomorrow easier', subtitle: 'SOFT LANDING', path: 'life', color: '#e2a8ff', art: 'life', why: 'End a session without leaving future you a puzzle. Rest stays available whether or not you finish this route.', badge: 'Tomorrow’s ally', quests: [
      lifeStep('landing-save', 'Leave a breadcrumb', 'Save your current work and a restart note naming the project, where it lives, and the next action. A redacted note is enough.', 'Save the open file first.'),
      lifeStep('landing-clear', 'Remove one tomorrow-obstacle', 'Prepare one small thing for your next start: a cable, a file, a bag or a clear surface. Save what you prepared and how it helps.', 'Pick the obstacle that takes less than five minutes to remove.'),
      lifeStep('landing-return', 'Return without starting over', 'At a later session, use your breadcrumb to restart for two minutes. Save what you did and whether the note helped. No deadline.', 'Read your saved next action before opening another tab.')
    ] }
  ];
  // Quentin's explicitly supplied circle. No birthdays, handles or interests are inferred.
  const friendStarters = [
    { id:'friend-thomas',name:'Thomas',birthday:'',interests:'Khamsin · musique / social' },
    { id:'friend-ismael',name:'Ismaël',birthday:'',interests:'Kultur · musique / social' },
    { id:'friend-valentin',name:'Valentin',birthday:'',interests:'Gaming · co-op games' },
    { id:'friend-guillaume',name:'Guillaume',birthday:'',interests:'Check-in · musique / social' },
    { id:'friend-jean',name:'Jean',birthday:'',interests:'' },
    { id:'friend-camille',name:'Camille',birthday:'',interests:'' },
    { id:'friend-hugo',name:'Hugo',birthday:'',interests:'' }
  ];
  const districts = [
    { id: 'home', name: 'Le Perchoir', subtitle: 'YOUR SAVE POINT', x: 19, y: 29, color: '#bd8bff', art: 'terminal', route: 'c-life-base', why: 'A studio above the rooftops. Reset your base, then choose a small adventure.' },
    { id: 'canal', name: 'Canal des Échos', subtitle: 'FIELD NOTES & FRESH AIR', x: 70, y: 24, color: '#ffd75e', art: 'room', route: 'c-life-outside', why: 'Follow the water, collect a sound, notice a color. Your real destination can be a nearby park or a window.' },
    { id: 'cafe', name: 'Place des Copains', subtitle: 'CO-OP LOBBY', x: 46, y: 36, color: '#ff6b9d', art: 'life', route: 'c-life-connect', why: 'A fictional café for real connections. Pick a friend and prepare an invitation you actually want to send.' },
    { id: 'atelier', name: 'Atelier des Possibles', subtitle: 'UNFINISHED TREASURES', x: 23, y: 73, color: '#ff6b6b', art: 'collection', route: 'c-life-rescue', why: 'Old demos, tiny worlds and half-made visuals. Bring one back with a deliberately small finish line.' },
    { id: 'bureau', name: 'Bureau des Nuages', subtitle: 'ADMIN MINI-BOSSES', x: 77, y: 71, color: '#e2a8ff', art: 'adventure', route: 'c-life-admin', why: 'One open tab is the whole boss fight. Clear the next obstacle and make room for a plan.' },
    { id: 'quai', name: 'Quai de Minuit', subtitle: 'BIRTHDAYS & BIG NIGHTS', x: 49, y: 78, color: '#ff8c42', art: 'game', route: 'c-life-landing', why: 'A place for birthdays, New Year’s Eve and nights worth remembering. Set a plan that fits your people and budget.' },
    { id: 'gare', name: 'Gare des Lucioles', subtitle: 'NEXT STOP / TOULOUSE', x: 88, y: 39, color: '#ffd75e', art: 'deck', route: null, why: 'Turn “we should go” into a small travel plan. Compare real fares for your dates; the map never invents a bargain.' }
  ];
  const specializations = [
    { id: 'songs', path: 'music', name: 'Demo alchemist', why: 'Turn the part you keep replaying into a short song you can actually bounce.', cards: ['tape-hook','tape-answer','tape-transition','tape-tail'], prefixes: ['q-studio-demo-'], titles: ['Hook keeper','Demo alchemist','Song finisher'], gift: 'A record sleeve for your desk', art: 'music' },
    { id: 'loops', path: 'music', name: 'Pocket engineer', why: 'Build grooves and sound families that are useful beyond the first session.', cards: ['tape-pocket','tape-found','tape-one','tape-plugin'], prefixes: ['q-studio-loop-','q-samples-'], titles: ['Sound scavenger','Pocket engineer','Loop architect'], gift: 'A patch cartridge for your desk', art: 'skills' },
    { id: 'passage', path: 'visual', name: 'Passage pilot', why: 'Hold a subject, give it a palette, and make one movement worth watching again.', cards: ['frame-chrome','frame-echo','frame-type','frame-ascii','frame-join'], prefixes: ['q-studio-visual-','q-passage-'], titles: ['Light catcher','Passage pilot','Afterimage author'], gift: 'A prism module for your desk', art: 'visual' },
    { id: 'materials', path: 'visual', name: 'Surface shaper', why: 'Make textures, palettes and cover studies that give your music a visual world.', cards: ['frame-tile','frame-palette','frame-cover'], prefixes: ['q-material-'], titles: ['Pattern collector','Surface shaper','World painter'], gift: 'A material sample for your desk', art: 'visual' },
    { id: 'gamefeel', path: 'game', name: 'Feel mechanic', why: 'Polish the few seconds that tell a player why your game is worth playing.', cards: ['feel-impact','feel-sign','feel-choice','feel-end','feel-friction'], prefixes: ['q-studio-game-','q-world-'], titles: ['Interaction scout','Feel mechanic','Tiny-world maker'], gift: 'A controller module for your desk', art: 'game' },
    { id: 'forgeheart', path: 'game', name: 'Forgeheart smith', why: 'Land small, tested improvements to drones, the lattice, rifts and factory flow.', cards: ['forge-drone','forge-affix','forge-lattice','forge-rift','forge-factory'], prefixes: ['q-studio-forge-'], titles: ['Forge apprentice','Forgeheart smith','System keeper'], gift: 'A miniature anvil for your desk', art: 'forge' },
    { id: 'restart', path: 'life', name: 'Return specialist', why: 'Leave a door open for future you. A clear next action is a useful piece of work.', cards: [], prefixes: [], scope: 'life', titles: ['Door opener','Return specialist','Studio caretaker'], gift: 'A warm cup for your desk', art: 'life' },
    { id: 'finish', path: 'life', name: 'Finish-line collector', why: 'Keep the proof that you can finish. Small, rough and real is enough to count.', cards: [], prefixes: [], scope: 'all', titles: ['First artifact','Finish-line collector','Body of work'], gift: 'An evidence cabinet for your desk', art: 'collection' }
  ];
  const rewardBlueprints = [
    { id: 'first-listen', name: 'My demo, headphones, lights down', cost: 6, category: 'LISTEN', note: 'Pick the bounce you want to enjoy. No fixing while it plays.', art: 'music' },
    { id: 'sample-hunt', name: 'A 20-minute sample treasure hunt', cost: 12, category: 'DISCOVER', note: 'Choose a folder or record to explore. Save only the sounds you love; no finished track required.', art: 'skills' },
    { id: 'plugin-date', name: 'A date with a forgotten plugin', cost: 15, category: 'PLAY', note: 'Name an owned plugin or a free demo. One throwaway patch, no obligation to use it.', art: 'skills' },
    { id: 'game-night', name: 'Tonight’s game, picked in advance', cost: 20, category: 'PLAY', note: 'Write the game and the session you want. This is leisure, not a research assignment.', art: 'game' },
    { id: 'passage-screen', name: 'A private Passage screening', cost: 18, category: 'CELEBRATE', note: 'Queue a few of your visuals with a track you love. Watch the work as an audience.', art: 'visual' },
    { id: 'forge-victory', name: 'A Forgeheart victory lap', cost: 12, category: 'PLAY', note: 'Play a run to enjoy the systems you improved. Leave the bug list closed for this one.', art: 'forge' },
    { id: 'crate-evening', name: 'An evening following the interesting thing', cost: 30, category: 'FREEDOM', note: 'Sound, game or visual: decide at the start. No deliverable and no score.', art: 'deck' },
    { id: 'release-ritual', name: 'My tiny-release celebration', cost: 40, category: 'CELEBRATE', note: 'Choose the food, film or activity before your next export. Keep it within your own budget.', art: 'collection' },
    { id: 'pack-budget', name: 'A sample pack from my wishlist', cost: 65, category: 'WISHLIST', note: 'Name the exact pack and your real-money limit. Claiming this only records your choice; nothing is purchased.', art: 'music' },
    { id: 'desk-hour', name: 'A desk reset with a favorite album', cost: 8, category: 'RESET', note: 'Fresh drink, comfortable lighting, favorite record. Stop whenever the space feels good.', art: 'life' }
  ];
  const consoleAccents = [
    { id: 'ember', name: 'Forge ember', color: '#ff8c42' }, { id: 'mythic', name: 'Mythic violet', color: '#bd8bff' },
    { id: 'rare', name: 'Rare gold', color: '#ffd75e' }, { id: 'pulse', name: 'Signal pink', color: '#ff6b9d' }
  ];
  return { paths, campaigns, daily, commissions, treats, deck, lifeArcs, districts, friendStarters, specializations, rewardBlueprints, consoleAccents };
});
