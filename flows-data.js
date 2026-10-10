// Flows data (round 10): the principal commands that stay in the "/" menu, the journeys written by hand (Doctor,
// Make a video, Record, Lab scene, Sequence, Board, Export, Astra & Claude, Look, Memory) and the rules that turn
// every other command into a flow by area ("Lab: music & timing", "Video editor", "Mood board"…), so none of the
// ≈ 920 commands is lost: each one is still typed by name, run by chats, and one click away inside its flow.
// Plain data + pure functions (Node-testable: dev/flows-test.js).
const FlowsData = (() => {
  // ---------- the principal commands: what the "/" menu lists ----------
  // From the owner's usage (night brief: Save 46, Shuffle 31, Tap 58, Freeze 16, frame sizes, Live sound 30, the
  // Three Director all day, Compact, Read aloud, Copy, Stop…) and what every chat needs. Pinned and recent commands
  // still show above them, the 4 commands you run most join them automatically, and /principal adds / removes.
  const PRINCIPAL = [
    // chats
    'help', 'new', 'compact', 'stop', 'retry', 'copy', 'read', 'undo', 'screenshot', 'do',
    // Claude & Astra
    'astra', 'claude', 'handoff', 'jam', 'opinion', 'decide', 'doctor',
    // the Lab (the owner's day)
    'save-sliders', 'shuffle', 'tap', 'freeze', 'size', 'live', 'present', 'sketches', 'scene', 'look', 'still', 'sequence',
    // board, capture, video
    'board', 'board-use', 'capture', 'rec', 'editor', 'intro',
    // the app
    'settings', 'theme', 'usage', 'flows', 'flow',
  ];

  // ---------- journeys written by hand ----------
  const YN = ['yes', 'no'];
  const JOURNEYS = [
    {
      id: 'doctor', name: 'Doctor', icon: '✚', area: 'Agents', desc: 'Claude Code and Codex checked, fixed in a window you can see, checked again, tested',
      nodes: [
        { id: 'check', kind: 'action', title: 'Check both engines', cmd: '/doctor', var: 'report', next: 'ok', x: 0, y: 0 },
        { id: 'ok', kind: 'choice', title: 'Does the card say both engines can work?', var: 'ok', options: [{ label: 'Yes', value: 'yes', next: 'test' }, { label: 'No', value: 'no', next: 'which' }], guess: { var: 'report', match: 'both engines can work', value: 'yes', else: 'no' } },
        { id: 'which', kind: 'choice', title: 'Which one has the problem?', var: 'engine', options: [{ label: 'Claude Code', value: 'claude', set: { login: '/login' } }, { label: 'Codex (Astra)', value: 'codex', set: { login: '/astra-login' } }], next: 'what' },
        { id: 'what', kind: 'choice', title: 'What does the card say?', var: 'fix', options: [
          { label: 'Too old: update it', value: 'update', next: 'update' },
          { label: 'Not installed: install it', value: 'install', next: 'update' },
          { label: 'Signed out: sign in', value: 'login', next: 'login' },
          { label: 'An older copy is pinned: use the newest', value: 'auto', next: 'auto' },
          { label: 'Something else: ask Claude', value: 'other', next: 'explain' }] },
        { id: 'update', kind: 'action', title: 'Update / install in a visible window', cmd: '/engine-update {engine}', next: 'wait' },
        { id: 'login', kind: 'action', title: 'Sign in (its own window)', cmd: '{login}', next: 'wait' },
        { id: 'auto', kind: 'action', title: 'Use the newest copy', cmd: '/engines {engine} auto', next: 'again' },
        { id: 'explain', kind: 'ai', title: 'Claude explains', engine: 'claude', prompt: 'Hearth\'s engine check (/doctor) says this about {engine}:\n{report}\nIn 3 short steps, what should I do?', var: 'advice', next: 'wait' },
        { id: 'wait', kind: 'check', title: 'Done in that window?', ask: 'Finished in the Terminal / PowerShell window (or did what Claude said)?', next: 'again' },
        { id: 'again', kind: 'action', title: 'Check again', cmd: '/doctor', var: 'report', next: 'fixed' },
        { id: 'fixed', kind: 'choice', title: 'Fixed?', var: 'fixed', options: [{ label: 'Yes', value: 'yes', next: 'test' }, { label: 'No, still broken', value: 'no', next: 'which' }], guess: { var: 'report', match: 'both engines can work', value: 'yes', else: 'no' } },
        { id: 'test', kind: 'choice', title: 'Test both with a real reply? (a few tokens)', var: 'test', options: [{ label: 'Yes', value: 'yes', next: 'run' }, { label: 'No', value: 'no', next: 'done' }] },
        { id: 'run', kind: 'action', title: 'Test Claude and Astra', cmd: '/doctor --run', var: 'report', next: 'done' },
        { id: 'done', kind: 'result', title: 'Engines', text: '{report}' },
      ],
    },
    {
      id: 'make-video', name: 'Make a video', icon: '🎬', area: 'Video project', desc: 'Your idea → Astra drafts the beats → you keep or change them → the video project (/intro) → the chats build it',
      nodes: [
        { id: 'idea', kind: 'text', title: 'What is the video about?', var: 'idea', placeholder: 'a motion-design intro for Hearth: two AIs, one window', next: 'fmt' },
        { id: 'fmt', kind: 'choice', title: 'Format', var: 'fmt', options: [{ label: '9:16 vertical', value: '9:16' }, { label: '16:9 wide', value: '16:9' }, { label: '1:1 square', value: '1:1' }, { label: '4:5 feed', value: '4:5' }], next: 'len' },
        { id: 'len', kind: 'choice', title: 'Length', var: 'len', options: [{ label: '15 s', value: '15' }, { label: '30 s', value: '30' }, { label: '60 s', value: '60' }], next: 'beats' },
        { id: 'beats', kind: 'ai', title: 'Astra drafts the beats', engine: 'astra', var: 'beats', prompt: 'Plan a {len} s social video ({fmt}) about: {idea}. 4 to 6 beats, one line each: time · what we see · the words on screen. Only the list.', next: 'keep' },
        { id: 'keep', kind: 'choice', title: 'Use these beats?', var: 'keep', options: [{ label: 'Yes', value: 'yes', next: 'plan' }, { label: 'Change them', value: 'change', next: 'change' }, { label: 'New ones', value: 'again', next: 'beats' }] },
        { id: 'change', kind: 'text', title: 'What should change in the beats?', var: 'change', placeholder: 'shorter hook, end on the logo…', next: 'redo' },
        { id: 'redo', kind: 'ai', title: 'Astra changes the beats', engine: 'astra', var: 'beats', prompt: 'Here are beats for a {len} s {fmt} video:\n{beats}\nChange only this: {change}. Reply with the full new list.', next: 'keep' },
        { id: 'plan', kind: 'action', title: 'Start the video project', cmd: '/intro {idea}', next: 'length' },
        { id: 'length', kind: 'action', title: 'Its length', cmd: '/intro length {len}', next: 'formats' },
        { id: 'formats', kind: 'action', title: 'Its format', cmd: '/intro formats {fmt}', next: 'go' },
        { id: 'go', kind: 'choice', title: 'Let the chats build it now? (board vibe → Lab scenes → captures → editor → renders)', var: 'go', options: [{ label: 'Yes, build it', value: 'yes', next: 'build' }, { label: 'Not now', value: 'no', next: 'planned' }] },
        { id: 'build', kind: 'action', title: 'Build it', cmd: '/intro go', next: 'built' },
        { id: 'built', kind: 'check', title: 'Wait until it is rendered', cmd: '/intro status', match: 'render(ed)? ✓|done|finished|every format', every: 8000, timeout: 3600000, next: 'video' },
        { id: 'video', kind: 'result', title: 'Your video', text: '{last}' },
        { id: 'planned', kind: 'result', title: 'Planned', text: 'The project is planned with these beats:\n{beats}\n/intro go builds it, /intro status shows where it is.' },
      ],
    },
    {
      id: 'record', name: 'Record Hearth', icon: '◉', area: 'Capture', desc: 'Record the window, a tool, the chat or a region, with or without sound, then open, trim or share it',
      nodes: [
        { id: 'what', kind: 'choice', title: 'What do you want to record?', var: 'target', options: [{ label: 'The whole window', value: '' }, { label: 'This tool', value: 'tool' }, { label: 'The chat', value: 'chat' }, { label: 'A region you drag', value: 'region' }, { label: 'A scripted tour', value: 'tour', next: 'tour' }], next: 'sound' },
        { id: 'sound', kind: 'choice', title: 'Sound?', var: 'snd', options: [{ label: 'No sound', value: '' }, { label: 'Hearth\'s sound', value: 'sound' }, { label: 'Microphone', value: 'mic' }, { label: 'Both', value: 'both' }], next: 'len' },
        { id: 'len', kind: 'choice', title: 'How long?', var: 'dur', options: [{ label: '10 s', value: '10s' }, { label: '30 s', value: '30s' }, { label: 'Until I stop it', value: '' }], next: 'rec' },
        { id: 'rec', kind: 'action', title: 'Record', cmd: '/rec {target} {snd} {dur}', next: 'stop' },
        { id: 'stop', kind: 'check', title: 'Done?', ask: 'Say yes when you are done (it stops the recording if it still runs)', next: 'end' },
        { id: 'end', kind: 'action', title: 'Stop the recording', cmd: '/rec stop', next: 'last' },
        { id: 'tour', kind: 'action', title: 'Pick a tour', cmd: '/tour', next: 'stop' },
        { id: 'last', kind: 'action', title: 'Open it', cmd: '/capture-last', next: 'then' },
        { id: 'then', kind: 'choice', title: 'Then?', var: 'then', options: [{ label: 'Open it in the video editor', value: '/editor on' }, { label: 'A GIF of it', value: '/make gif last' }, { label: 'A contact sheet', value: '/contact last' }, { label: 'Nothing', value: '', next: 'done' }], next: 'do' },
        { id: 'do', kind: 'action', title: 'Do it', cmd: '{then}', next: 'done' },
        { id: 'done', kind: 'result', title: 'Recorded', text: '{last}' },
      ],
    },
    {
      id: 'lab-scene', name: 'Lab scene', icon: '◭', area: 'Three.js Lab', desc: 'Say the visual, Claude / Astra / both build it in the Lab, keep it, shuffle it or change it, save the look',
      nodes: [
        { id: 'idea', kind: 'text', title: 'Describe the visual', var: 'idea', placeholder: 'a slow ember tunnel, gold and violet, calm', next: 'who' },
        { id: 'who', kind: 'choice', title: 'Who builds it?', var: 'who', options: [{ label: 'Claude (Three Director)', value: 'claude', next: 'lab' }, { label: 'Astra', value: 'astra', next: 'astra' }, { label: 'Both, taking turns (jam)', value: 'jam', next: 'jam' }] },
        { id: 'astra', kind: 'action', title: 'The director on Astra', cmd: '/director-engine three astra', next: 'lab' },
        { id: 'lab', kind: 'action', title: 'Open the Lab', cmd: '/lab', next: 'build' },
        { id: 'build', kind: 'ai', title: 'The director builds it', agent: 'threedirector', inChat: true, engine: 'claude', prompt: '{idea}', var: 'made', next: 'look' },
        { id: 'jam', kind: 'action', title: 'Jam', cmd: '/jam {idea}', next: 'jammed' },
        { id: 'jammed', kind: 'check', title: 'Jam finished?', ask: 'Is the jam done (best round kept)?', next: 'look' },
        { id: 'look', kind: 'choice', title: 'Happy with it?', var: 'next', options: [{ label: 'Keep it: save the look', value: 'keep', next: 'save' }, { label: 'Shuffle the sliders', value: 'shuffle', next: 'shuffle' }, { label: 'Change something', value: 'change', next: 'change' }, { label: 'A still 9:16', value: 'still', next: 'still' }] },
        { id: 'shuffle', kind: 'action', title: 'Shuffle', cmd: '/shuffle', next: 'look' },
        { id: 'change', kind: 'text', title: 'What should change?', var: 'change', next: 'redo' },
        { id: 'redo', kind: 'ai', title: 'The director changes it', agent: 'threedirector', inChat: true, engine: 'claude', prompt: '{change}', var: 'made', next: 'look' },
        { id: 'still', kind: 'action', title: 'A still', cmd: '/still 9:16', next: 'look' },
        { id: 'save', kind: 'action', title: 'Save the look', cmd: '/save-look', next: 'done' },
        { id: 'done', kind: 'result', title: 'Scene kept', text: '{made}' },
      ],
    },
    {
      id: 'sequence', name: 'Sequence', icon: '▤', area: 'Three.js Lab', desc: 'Your scenes on the song as a video: arrange, look at it, render it in a social format, finish it in the editor',
      nodes: [
        { id: 'how', kind: 'choice', title: 'How do you start?', var: 'how', options: [{ label: '✦ Arrange my scenes on the song', value: 'arrange', next: 'tpl' }, { label: 'Add this scene to it', value: 'add', next: 'add' }, { label: 'Just open it', value: 'open', next: 'open' }] },
        { id: 'tpl', kind: 'choice', title: 'Which arrangement?', var: 'tpl', optionsFrom: '/arrange', options: [{ label: 'Let Hearth pick', value: '' }], next: 'arrange' },
        { id: 'arrange', kind: 'action', title: 'Arrange', cmd: '/arrange {tpl}', next: 'open' },
        { id: 'add', kind: 'action', title: 'Add this scene', cmd: '/add-scene', next: 'open' },
        { id: 'open', kind: 'action', title: 'Open the sequence', cmd: '/sequence', next: 'ok' },
        { id: 'ok', kind: 'choice', title: 'Render it?', var: 'fmt', options: [{ label: '9:16', value: '9:16' }, { label: '16:9', value: '16:9' }, { label: '1:1', value: '1:1' }, { label: 'Every format', value: 'all' }, { label: 'Not yet', value: '', next: 'done' }], next: 'render' },
        { id: 'render', kind: 'action', title: 'Render', cmd: '/sequence-render {fmt}', next: 'editor' },
        { id: 'editor', kind: 'choice', title: 'Finish it in the video editor?', var: 'ed', options: [{ label: 'Yes', value: 'yes', next: 'toed' }, { label: 'No', value: 'no', next: 'done' }] },
        { id: 'toed', kind: 'action', title: 'To the editor', cmd: '/sequence editor', next: 'done' },
        { id: 'done', kind: 'result', title: 'Sequence', text: '{last}' },
      ],
    },
    {
      id: 'board', name: 'Mood board', icon: '▦', area: 'Board', desc: 'Open the board, add references, give a chat its vibe (never the footage)',
      nodes: [
        { id: 'open', kind: 'action', title: 'Open the board', cmd: '/board', next: 'what' },
        { id: 'what', kind: 'choice', title: 'What now?', var: 'what', options: [{ label: 'Add a reference', value: 'add', next: 'ref' }, { label: 'Give this chat its vibe', value: 'use', next: 'use' }, { label: 'Show the vibe here (free)', value: 'vibe', next: 'vibe' }, { label: 'A new board', value: 'new', next: 'name' }, { label: 'Done', value: 'done', next: 'done' }] },
        { id: 'ref', kind: 'text', title: 'A website, a file path, #colors or a note', var: 'ref', next: 'add' },
        { id: 'add', kind: 'action', title: 'Add it', cmd: '/board-add {ref}', next: 'what' },
        { id: 'use', kind: 'action', title: 'Attach the vibe', cmd: '/board-use', next: 'what' },
        { id: 'vibe', kind: 'action', title: 'The vibe', cmd: '/vibe', next: 'what' },
        { id: 'name', kind: 'text', title: 'Its name', var: 'name', next: 'new' },
        { id: 'new', kind: 'action', title: 'New board', cmd: '/board-new {name}', next: 'what' },
        { id: 'done', kind: 'result', title: 'Board', text: '{last}' },
      ],
    },
    {
      id: 'export', name: 'Export', icon: '⇪', area: 'Export', desc: 'This chat, token usage, memory, your commands, notes or a backup, as a file',
      nodes: [
        { id: 'what', kind: 'choice', title: 'What do you want to export?', var: 'what', options: [
          { label: 'This chat', value: 'chat', next: 'chatfmt' }, { label: 'Token usage', value: 'usage', next: 'usefmt' }, { label: 'Memory', value: 'memory', set: { cmd: '/memory-export' }, next: 'go' },
          { label: 'Your aliases, macros, pins', value: 'cmds', set: { cmd: '/cmd-export' }, next: 'go' }, { label: 'Notes', value: 'notes', set: { cmd: '/note-export' }, next: 'go' }, { label: 'A backup of everything', value: 'backup', set: { cmd: '/backup now' }, next: 'go' }] },
        { id: 'chatfmt', kind: 'choice', title: 'Format', var: 'fmt', options: [{ label: 'Markdown', value: 'md', set: { cmd: '/export md file' } }, { label: 'HTML', value: 'html', set: { cmd: '/export html file' } }, { label: 'JSON', value: 'json', set: { cmd: '/export json file' } }, { label: 'Text', value: 'txt', set: { cmd: '/export txt file' } }, { label: 'To the clipboard', value: 'clip', set: { cmd: '/export md clipboard' } }], next: 'go' },
        { id: 'usefmt', kind: 'choice', title: 'Format', var: 'fmt', options: [{ label: 'CSV', value: 'csv', set: { cmd: '/export-usage csv' } }, { label: 'JSON', value: 'json', set: { cmd: '/export-usage json' } }, { label: 'Markdown table', value: 'md', set: { cmd: '/export-usage md' } }], next: 'go' },
        { id: 'go', kind: 'action', title: 'Export', cmd: '{cmd}', next: 'done' },
        { id: 'done', kind: 'result', title: 'Exported', text: '{last}' },
      ],
    },
    {
      id: 'astra-claude', name: 'Astra & Claude', icon: '⚇', area: 'Collab', desc: 'Both engines on one thing: side by side, one drafts and the other improves, a debate, a council, a second opinion, a handoff, a jam',
      nodes: [
        { id: 'mode', kind: 'choice', title: 'How should they work together?', var: 'mode', options: [
          { label: 'Side by side (duo)', value: 'duo' }, { label: 'One drafts, the other improves (relay)', value: 'relay' }, { label: 'A debate', value: 'debate' }, { label: 'A council', value: 'council' },
          { label: 'Second opinion on the last reply', value: 'opinion', set: { notopic: '1' } }, { label: 'Hand this chat to the other', value: 'handoff', set: { notopic: '1' } }, { label: 'Jam a music visual in the Lab', value: 'jam' }], next: 'topic' },
        { id: 'topic', kind: 'text', title: 'About what?', var: 'topic', skipIf: 'notopic', placeholder: 'the question, the task or the idea', next: 'go' },
        { id: 'go', kind: 'action', title: 'Start', cmd: '/{mode} {topic}', next: 'done' },
        { id: 'done', kind: 'result', title: 'Started', text: '{last}' },
      ],
    },
    {
      id: 'look', name: 'Look', icon: '◐', area: 'Look', desc: 'Pick an app look (or let Astra pick), keep it or go back',
      nodes: [
        { id: 'how', kind: 'choice', title: 'How?', var: 'how', options: [{ label: 'I pick', value: 'me', next: 'pick' }, { label: 'Astra picks', value: 'astra', next: 'decide' }, { label: 'Surprise me', value: 'random', set: { theme: 'random' }, next: 'apply' }] },
        { id: 'pick', kind: 'choice', title: 'Which look?', var: 'theme', optionsFrom: '/theme', options: [{ label: 'The next one', value: 'next' }], next: 'apply' },
        { id: 'decide', kind: 'action', title: 'Astra picks', cmd: '/decide theme', next: 'keep' },
        { id: 'apply', kind: 'action', title: 'Apply it', cmd: '/theme {theme}', next: 'keep' },
        { id: 'keep', kind: 'choice', title: 'Keep it?', var: 'keep', options: [{ label: 'Yes', value: 'yes', next: 'done' }, { label: 'No, back', value: 'no', next: 'back' }, { label: 'Another', value: 'another', next: 'how' }] },
        { id: 'back', kind: 'action', title: 'Back to the one before', cmd: '/theme prev', next: 'done' },
        { id: 'done', kind: 'result', title: 'Look', text: '{last}' },
      ],
    },
    {
      id: 'memory', name: 'Memory', icon: '🧠', area: 'Memory', desc: 'What your agents remember: add, forget, look, what it costs, export',
      nodes: [
        { id: 'what', kind: 'choice', title: 'Memory', var: 'what', options: [
          { label: 'Remember something', value: 'add', next: 'fact' }, { label: 'Forget something', value: 'forget', next: 'words' }, { label: 'What it remembers', value: 'list', set: { cmd: '/memory-list' }, next: 'go' },
          { label: 'What it costs per message', value: 'cost', set: { cmd: '/memory-cost' }, next: 'go' }, { label: 'Export it', value: 'export', set: { cmd: '/memory-export' }, next: 'go' }, { label: 'Done', value: 'done', next: 'done' }] },
        { id: 'fact', kind: 'text', title: 'The fact', var: 'fact', placeholder: 'I make music-driven visuals for socials', next: 'scope' },
        { id: 'scope', kind: 'choice', title: 'For which agents?', var: 'scope', options: [{ label: 'This agent', value: 'one', set: { cmd: '/remember {fact}' } }, { label: 'Every agent', value: 'all', set: { cmd: '/remember-all {fact}' } }], next: 'go' },
        { id: 'words', kind: 'text', title: 'Words of the fact to forget (or "last")', var: 'words', next: 'forget' },
        { id: 'forget', kind: 'action', title: 'Forget', cmd: '/forget {words}', next: 'what' },
        { id: 'go', kind: 'action', title: 'Do it', cmd: '{cmd}', next: 'what' },
        { id: 'done', kind: 'result', title: 'Memory', text: '{last}' },
      ],
    },
  ];

  // ---------- every other command, by area: one flow each ----------
  // First matching rule wins. `area` matches the command's area, `re` its name.
  const AREA_FLOWS = [
    { id: 'all-lab-music', name: 'Lab: music & timing', icon: '♪', area: 'Three.js Lab', re: /tap|bpm|beat|downbeat|kick|snare|^hit|grid|click|^cue|marker|section|drop|analy|^song|^live|music|react|auto-preset|autobars|trigger|quantize|nudge|follow|midi|^loop|^snap|mark-|fill-markers|clear-markers/ },
    { id: 'all-lab-motion', name: 'Lab: motion kit', icon: '✦', area: 'Three.js Lab', re: /motion|kinetic|camera|logo|end-card|hearth-|brand|cursor-path|shot-list|^ease|animate|type-3d/ },
    { id: 'all-lab-frames', name: 'Lab: footage & frames', icon: '▭', area: 'Three.js Lab', re: /frame|footage|step|shuttle|^hold|^ref|match-pacing|pace|^cut-|edit-points|lab-cuts|send-clip|song-trim|clip-speed|onion/ },
    { id: 'all-lab-sequence', name: 'Lab: sequence & scenes', icon: '▤', area: 'Three.js Lab', re: /sequence|arrange|add-scene|^scene|lab-to-editor|morph/ },
    { id: 'all-lab-sliders', name: 'Lab: sliders & looks', icon: '⧉', area: 'Three.js Lab', re: /slider|shuffle|save|look|knob|fav|lock|preset|recolor|palette|tame|exaggerate|surprise|tweak|reset|copy-|paste-|^slot|^ease/ },
    { id: 'all-lab-layers', name: 'Lab: layers & effects', icon: '◫', area: 'Three.js Lab', re: /layer|^fx|blend|filter|overlay|guides|blackout|^safe/ },
    { id: 'all-lab', name: 'Lab: everything else', icon: '◭', area: 'Three.js Lab' },
    { id: 'all-video-flows', name: 'Video flows & After Effects', icon: '⇢', area: 'Video', re: /^video-flow|^video-nodes|^pipeline|^ae-|^render$|^toolkit|^director$|^resolve/ },
    { id: 'all-video-editor', name: 'Video editor', icon: '✂', area: 'Video', re: /^(clip|edit-|cut|track|trim|razor|ripple|roll|slip|slide|lift|insert|overwrite|nest|unnest|keyframe|copy-|paste-|dup-|move-clip|swap|split|select|range|extend|fit-to|speed|reverse|freeze-frame|title|lower|add-|transition|effect|grade|adjust|blend|overlay|to-main|to-overlay|sequence|lane|sound|solo|volume|mirror|reset-transform|captions|match|scopes|inspector|proxy|fill-slot|pingpong|normalize|shuffle-clips|editor|draw)/ },
    { id: 'all-video', name: 'Video Review', icon: '🎞', area: 'Video' },
    { id: 'all-video-project', name: 'Video projects', icon: '🎬', area: 'Video project' },
    { id: 'all-board', name: 'Mood board: every command', icon: '▦', area: 'Board' },
    { id: 'all-capture', name: 'Capture & frames', icon: '◉', area: 'Capture' },
    { id: 'all-director', name: 'Directors', icon: '◈', area: 'Director' },
    { id: 'all-nodes', name: 'Nodes & shader nodes', icon: '⊶', area: /^(Nodes|Shader nodes)$/ },
    { id: 'all-forge', name: 'Forge Debug', icon: '⚒', area: 'Forge' },
    { id: 'all-collab', name: 'Claude & Astra together', icon: '⚇', area: 'Collab' },
    { id: 'all-astra', name: 'Astra settings', icon: '✧', area: 'Astra' },
    { id: 'all-assist', name: 'Let the AI decide', icon: '✦', area: 'Assist' },
    { id: 'all-agents', name: 'Agents & engines', icon: '☉', area: 'Agents' },
    { id: 'all-chat', name: 'Chats', icon: '☰', area: 'Chat' },
    { id: 'all-messages', name: 'Messages', icon: '✉', area: 'Messages' },
    { id: 'all-compose', name: 'Write & attach', icon: '✎', area: /^(Compose|Style)$/ },
    { id: 'all-memory', name: 'Memory: every command', icon: '🧠', area: 'Memory' },
    { id: 'all-notes', name: 'Notes, prompts & export', icon: '📝', area: /^(Notes|Prompts|Export)$/ },
    { id: 'all-look', name: 'Look & view', icon: '◐', area: /^(Look|View)$/ },
    { id: 'all-meter', name: 'Tokens & usage', icon: '▮', area: 'Meter' },
    { id: 'all-kit', name: 'Color & timing kit', icon: '◍', area: 'Kit' },
    { id: 'all-data', name: 'Backups & data', icon: '⛁', area: 'Data' },
    { id: 'all-app', name: 'App, timers & macros', icon: '⚙', area: 'App' },
    { id: 'all-other', name: 'Everything else', icon: '⋯', area: /./ },
  ];
  const areaMatch = (rule, area) => (rule.area instanceof RegExp ? rule.area.test(area || '') : rule.area === area);
  // The area flow a command lives in.
  function flowFor(def) {
    for (const r of AREA_FLOWS) if (areaMatch(r, def.area) && (!r.re || r.re.test(def.name))) return r.id;
    return 'all-other';
  }
  // Within a flow, commands are grouped by what they do (the first word of the name that says it), so no choice
  // shows a hundred buttons.
  const VERBS = [
    ['Make / add / open', /^(new|add|make|create|insert|from|import|start|open|load|grab|record|rec|capture|duplicate|dup|clone|template|starter|snapshot|screenshot|shot|shots|tour|film|intro|draft|attach|grab|lab|board|editor|video|sketch|scene)$/],
    ['Change', /^(set|color|colors|style|blend|opacity|rotate|scale|crop|speed|volume|mute|fade|title|rename|tag|label|lock|unlock|bg|backdrop|look|theme|accent|density|glow|texture|font|size|effect|grade|adjust|recolor|palette|tone|persona|lang|model|effort|mode|shuffle|tweak|knob|slider|move|nudge|trim|split|cut|freeze)$/],
    ['Arrange & view', /^(align|distribute|layout|grid|zoom|fit|view|select|range|lane|track|order|sort|snap|gather|untangle|frame|focus|minimap|overview|peek|scroll|goto|jump|next|prev|top|bottom|fold|unfold|wrap|width|spacing|panel|zen|dock)$/],
    ['Share & save', /^(export|copy|send|save|share|to|note|post|render|publish|backup|paste|link|keep|pin|star|fav|bookmark)$/],
    ['Look up', /^(list|info|stats|status|search|find|show|what|where|help|log|usage|tokens|history|cost|which|check|doctor|lab-state|state|guide|keys|why)$/],
    ['Undo & clean', /^(undo|redo|delete|remove|clear|clean|reset|forget|restore|trash|unlink|unnote|unpin|unmark|unarchive|archive|stop|cancel|hide)$/],
  ];
  function verbOf(def) {
    const toks = def.name.split(/[-_]/);
    for (const t of toks.slice(0, 3)) for (const [label, re] of VERBS) if (re.test(t)) return label;
    return 'More';
  }
  const CHUNK = 14; // options shown on one choice node (the node filters as you type when there are more)
  // A flow for a list of commands: pick what kind → pick the command → its arguments (skipped when it takes
  // none; suggestions from the command itself) → run → the result → another one?
  function commandFlow(rule, defs, counts = {}) {
    const byUse = (a, b) => (counts[b.name] || 0) - (counts[a.name] || 0) || a.name.localeCompare(b.name);
    const sorted = [...defs].sort(byUse);
    const opt = (d) => ({ label: `/${d.name}`, value: d.name, hint: d.desc || '', set: { cmd: d.name } });
    const nodes = [];
    const tail = [
      { id: 'args', kind: 'text', title: 'Its arguments', var: 'args', argsOf: 'cmd', optional: true, next: 'run' },
      { id: 'run', kind: 'action', title: 'Run it', cmd: '/{cmd} {args}', next: 'result' },
      { id: 'result', kind: 'result', title: 'Result', text: '{last}', next: 'again' },
      { id: 'again', kind: 'choice', title: 'Another one?', var: 'again', options: [{ label: 'Yes', value: 'yes', next: 'pick' }, { label: 'No', value: 'no', next: null }] },
    ];
    if (sorted.length <= CHUNK + 4) {
      nodes.push({ id: 'pick', kind: 'choice', title: 'Which command?', var: 'cmd', options: sorted.map(opt), next: 'args' });
    } else {
      const byVerb = new Map();
      for (const d of sorted) { const g = verbOf(d); if (!byVerb.has(g)) byVerb.set(g, []); byVerb.get(g).push(d); }
      // one kind only: by name instead; a kind with too many commands: in parts (A–F…) of at most CHUNK + 6
      const kinds = byVerb.size > 1 ? byVerb : new Map([['Commands', sorted]]);
      const groups = new Map();
      for (const [g, list] of kinds) {
        if (list.length <= CHUNK + 6) { groups.set(g, list); continue; }
        const abc = [...list].sort((a, b) => a.name.localeCompare(b.name));
        const parts = Math.ceil(abc.length / CHUNK);
        for (let i = 0; i < parts; i++) { const part = abc.slice(Math.round((i * abc.length) / parts), Math.round(((i + 1) * abc.length) / parts)); const a = part[0].name.slice(0, 2); const b = part.at(-1).name.slice(0, 2); const label = `${g} (${a}–${b})`; groups.set(a === b || groups.has(label) ? `${g} ${i + 1}/${parts}` : label, part); }
      }
      const order = [...groups.keys()];
      nodes.push({ id: 'pick', kind: 'choice', title: 'What do you want to do?', var: 'group', options: order.map((g, i) => ({ label: `${g} · ${groups.get(g).length}`, value: `g${i + 1}`, next: `g${i + 1}` })) });
      order.forEach((g, i) => nodes.push({ id: `g${i + 1}`, kind: 'choice', title: g, var: 'cmd', options: groups.get(g).map(opt), next: 'args' }));
    }
    nodes.push(...tail);
    return { id: rule.id, name: rule.name, icon: rule.icon, area: typeof rule.area === 'string' ? rule.area : '', desc: `${defs.length} commands: ${sorted.slice(0, 6).map((d) => `/${d.name}`).join(' ')}${defs.length > 6 ? '…' : ''}`, generated: true, commands: sorted.map((d) => d.name), nodes };
  }
  // Every command → its area flow (defs: the registry's list). Returns [flow] for the non-empty ones.
  function generate(defs, counts = {}) {
    const by = new Map();
    for (const d of defs) { const id = flowFor(d); if (!by.has(id)) by.set(id, []); by.get(id).push(d); }
    return AREA_FLOWS.filter((r) => by.get(r.id)?.length).map((r) => commandFlow(r, by.get(r.id), counts));
  }
  // Which journeys use a command (for "where did /x go?").
  function journeysWith(name) {
    const n = String(name || '').replace(/^\//, '');
    return JOURNEYS.filter((f) => f.nodes.some((x) => new RegExp(`/${n}(\\s|$|\\})`).test(`${x.cmd || ''} ${(x.options || []).map((o) => `${o.set?.cmd || ''} ${typeof o.value === 'string' && o.value.startsWith('/') ? o.value : ''}`).join(' ')} `))).map((f) => f.id);
  }

  return { PRINCIPAL, JOURNEYS, AREA_FLOWS, VERBS, flowFor, verbOf, commandFlow, generate, journeysWith };
})();
if (typeof module !== 'undefined') module.exports = FlowsData;
