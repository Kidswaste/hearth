// Quest content is local and editable by release, never a generated model task.
(function (root, make) { const value = make(); if (typeof module === 'object') module.exports = value; else root.QuestCatalog = value; })(typeof self !== 'undefined' ? self : this, () => {
  const paths = [
    { id: 'visual', name: 'Visual Alchemist', icon: '◈', color: '#b8a0fa', description: 'Give light, texture and sound a shape.', skills: ['Curiosity', 'Texture keeper', 'Motion apprentice', 'Scene maker', 'Visual storyteller'] },
    { id: 'music', name: 'Sound Explorer', icon: '♫', color: '#edbd79', description: 'Collect sounds. Shape them into something yours.', skills: ['Listener', 'Sample hunter', 'Sound sculptor', 'Loop architect', 'Sonic storyteller'] },
    { id: 'game', name: 'World Builder', icon: '⬡', color: '#8ec9ab', description: 'A small world. One good interaction.', skills: ['Player', 'Rule maker', 'Interaction designer', 'World keeper', 'Game maker'] },
    { id: 'life', name: 'Everyday Adventurer', icon: '☀', color: '#84bbd7', description: 'Make a little room for the life you want.', skills: ['Here again', 'Small steps', 'Finding rhythm', 'Making space', 'Steady adventurer'] },
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
  return { paths, campaigns, daily };
});
