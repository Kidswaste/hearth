// 🔎 Find anything (round 37, appsearch): the words and places behind Ctrl/⌘+K (appsearch.js ranks with the shared
// search core, tools/three-search-core.js). No DOM here, Node-tested (dev/appsearch-test.js):
//   · VOCAB: the app's plain words ("dark mode" → Match my computer, "cheaper" → Spending / Short answers / Continue
//     lighter, "permissions" → Files it can use, "computer" → Check this AI / Check this computer…)
//   · SETTINGS: every row of Settings that isn't one of SettingsFind's switches (those are read from settings-find.js):
//     its section, the words it's found by on screen (find), a selector when a text isn't enough (sel)
//   · AI_SETUP: every row of ⋯ AI setup: its fold (opened on the way), the words it's found by on screen
//   · HELP: short "how do I…" answers, each pointing at the row its "Show me" runs (go: a row id)
// A row here that the real Settings / AI setup no longer has fails dev/checks/appsearch.js (every one is jumped to).
const AppSearchData = (() => {
  // ---------- plain words → the app's words ----------
  const SYN = [
    'dark night light bright mode theme look looks appearance skin colors colours style',
    'cheap cheaper cost costs spend spending money price budget token tokens save saving limit expensive',
    'short shorter brief concise length long longer detailed verbose',
    'permission permissions access allow allowed files file folder folders disk read write',
    'computer machine pc mac windows laptop setup install installed ready',
    'check test diagnose doctor works working broken fix problem',
    'delete remove trash erase bin',
    'copy duplicate clone',
    'rename name title',
    'new create start add make',
    'help guide how explain tutorial',
    'key keys shortcut shortcuts hotkey keyboard keybind',
    'update updates upgrade version latest',
    'chat chats conversation conversations thread talk message messages',
    'memory remember remembers forget memories',
    'instruction instructions rule rules prompt always',
    'personality persona character tone voice who',
    'think thinking effort reasoning deep smart quick hard',
    'connection connections connector connectors mcp integration integrations gmail drive notion',
    'hook hooks automation automate trigger when',
    'mission missions next message mode',
    'sync cloud drive icloud dropbox onedrive',
    'backup export archive',
    'notification notifications notify alert chime sound',
    'spell spelling spellcheck typo',
    'tip tips hint hints nudge nudges popup popups suggestion suggestions', // (round 38, hintcalm) → Don't show tips
    'tray background minimize',
    'startup login boot launch start',
    'model engine claude astra codex gpt',
    'board moodboard references refs',
    'lab three scene sketch',
    'find search look locate where',
    'agent agents ai assistant bot',
    'tool tools rail sidebar',
    'quiet calm hide hidden tidy clutter',
    'stop pause',
    'lighter compact compress summary summarize shrink',
  ];
  // (what they mean is said in content words only: a little word like "it" or "on" would add up in every row)
  const PHRASES = [
    ['dark mode', 'match computer look dark'], ['light mode', 'match computer look light'], ['night mode', 'match computer look dark'],
    ['follow system', 'match computer'], ['system theme', 'match computer'],
    ['cheaper', 'spending short answers continue lighter'], ['save money', 'spending weekly limit continue lighter'], ['save tokens', 'spending short answers continue lighter'], ['fewer tokens', 'spending short answers continue lighter'], ['less tokens', 'spending short answers continue lighter'],
    ['too expensive', 'spending weekly limit'], ['where tokens go', 'tokens go'],
    ['permission', 'files use access'], ['file access', 'files use access'], ['read my files', 'files computer'],
    ['computer', 'check ai computer'], ['is it working', 'check ai'], ['not working', 'check ai computer'], ['doesnt work', 'check ai computer'],
    ['what changed', 'whats new patch notes'], // ("what's new" is left alone: "what" is a little word, and "new" alone means a new chat as often) ['patch notes', 'whats new patch notes'], ['changelog', 'whats new patch notes'],
    ['shorter answers', 'long answers short'], ['short answers', 'long answers short'], ['longer answers', 'long answers detailed'],
    ['think harder', 'hard thinks deep'], ['think less', 'hard thinks quick'],
    ['start over', 'new chat'], ['keyboard shortcuts', 'keyboard keys'],
    ['two computers', 'sync computer'], ['other computer', 'sync computer'],
    ['remind me', 'remind decided'], ['what did we decide', 'remind decided'],
    ['several ais', 'swarm side by side ask everyone'], ['second opinion', 'second opinion only review'],
  ];
  // how much each kind leans ahead among equals: a place to set something up first, then actions, then the rest
  const KIND = { setting: 0.22, aisetup: 0.24, menu: 0.16, mission: 0.12, agent: 0.3, tool: 0.28, chat: 0.1, msg: 0.02, action: 0.06, cmd: -0.04, lab: 0.12, news: -0.2, help: -0.02, ask: -9 };

  // ---------- Settings (besides SettingsFind's switches) ----------
  // [id, section, label, find (on screen), tags, hint, sel?]; section = the name of the part it sits in (a fold's own
  // name when it's in a fold). (round 39, settingscalm) Settings reads Look & size · Your AIs · This computer & sync ·
  // Updates & what's new, each with a fold or two (PARENT), then the folds under Advanced (ADVANCED).
  const ADVANCED = new Set(['Chats', 'Keys', 'Mood board', 'Spell check languages', 'Tools in the rail', 'Folders', 'Housekeeping', 'Backup and files']);
  const PARENT = { 'More looks and tweaks': 'Look & size', 'Claude and Codex programs': 'Your AIs', 'Starting and closing': 'This computer & sync', 'Updates and tips': 'Updates & what\'s new' };
  const pathOf = (sec) => `Settings › ${ADVANCED.has(sec) ? 'Advanced › ' : ''}${PARENT[sec] ? `${PARENT[sec]} › ` : ''}${sec}`;
  const SETTINGS = [
    ['look', 'Look & size', 'Look: the colours of Hearth', '', 'look theme appearance colors dark light skin', 'Pick a look; More looks and tweaks holds the rest', '.look-picker'],
    ['follow', 'More looks and tweaks', '◐ Match my computer', 'Match my computer', 'dark mode light mode follow system appearance theme', 'The look follows your computer\'s light / dark mode', '.nf-follow'],
    ['ui-size', 'Look & size', 'Size of everything (this screen)', 'Size of everything', 'zoom scale bigger smaller text size ui 4k big screen monitor readable distance', 'Auto picks it from the screen\'s size; 100 … 200 %, kept for each screen', '.big-size'], // (round 38, bigscreen)
    ['astra-look', 'More looks and tweaks', '✦ Let Astra pick a look', 'Let Astra pick', 'look theme random surprise choose', 'Astra picks a look for you'],
    ['look-tweaks', 'More looks and tweaks', 'Textures, glow, motion, spacing, corners, chat font, accent, tooltips', 'Glow', 'textures glow motion animation density spacing corners font accent colour tooltips tweaks', 'The finer touches of the look', '.look-ctl'],
    ['sync', 'This computer & sync', 'Sync your computers', 'sync', 'sync cloud drive icloud dropbox onedrive two computers mac pc', 'Keeps your Mac and PC the same through a cloud drive folder you already use'],
    ['sync-big', 'This computer & sync', 'Sync big videos', 'Sync big videos', 'sync captures renders large files', 'Captures and renders over 100 MB travel too, in resumable pieces'],
    ['check-computer', 'This computer & sync', 'Check this computer…', 'Check this computer', 'computer ready install ffmpeg claude codex setup permissions', 'Is this computer ready? Each thing with one button to fix it'],
    ['update-now', 'Updates & what\'s new', 'Look for updates now', 'Look now', 'update check upgrade version', 'Ask for updates now (nothing is installed without you)'],
    ['whatsnew', 'Updates & what\'s new', 'What\'s new…', 'What\'s new', 'whats new patch notes changelog changes since you were away digest missed', 'Since you were away (one page), patch notes, or only what fits how you work'],
    ['ai-setup', 'Your AIs', '⋯ AI setup', 'AI setup', 'ai setup personality instructions what it can use memory', 'Who your AIs are and what they can use'],
    ['claude-path', 'Claude and Codex programs', 'Claude program (only if it isn\'t found)', 'Claude program', 'claude path engine engines program cli', 'Where the Claude program is, when Hearth can\'t find it'],
    ['codex-path', 'Claude and Codex programs', 'Codex program (only if it isn\'t found)', 'Codex program', 'codex astra path engine engines program cli', 'Where the Codex program is, when Hearth can\'t find it'],
    ['start-on', 'Starting and closing', 'Open on start', 'Open on start', 'startup first screen open launch', 'What Hearth shows when it opens'],
    ['startup', 'Starting and closing', 'Start Hearth with your computer', 'Start Hearth', 'startup login launch boot start automatically', 'Hearth opens by itself when you sign in'],
    ['tray', 'Starting and closing', 'Closing the window keeps Hearth running in the tray', 'running in the tray', 'tray close background keep running', 'Replies, renders and sync keep going'],
    ['notify', 'Chats', 'Desktop notifications while I\'m elsewhere', 'Desktop notifications', 'notifications notify alert system', 'A notification when an AI finishes while you are in another app'],
    ['keys', 'Keys', 'Keyboard keys…', 'Keyboard keys', 'keys shortcuts hotkeys keyboard alt right-click', 'Every key, what waits behind Alt, every right-click menu'],
    ['hotkey', 'Keys', 'Show / hide Hearth from anywhere', 'Show / hide Hearth', 'hotkey global shortcut bring up hide', 'A key combination that brings Hearth up or hides it, even from another app'],
    ['sleep-webs', 'Housekeeping', 'Unload websites I haven\'t opened', 'Unload websites', 'memory websites sleep unload free', 'Frees memory; a website loads again when you open it'],
    ['meshy-key', 'Housekeeping', 'Meshy key…', 'Meshy key', 'meshy api key 3d', 'Paste your Meshy API key once (stored encrypted)'],
    ['spell-langs', 'Spell check languages', 'Spell check languages', '', 'spell spelling languages english french spanish german', 'The languages the message box checks your spelling in'],
    ['rail-tools', 'Tools in the rail', 'Tools in the rail', '', 'rail tools sidebar hide show buttons', 'Untick a tool to take it off the rail'],
    ['forge-folder', 'Folders', 'Forgeheart project folder', 'Forgeheart project', 'forgeheart folder game project', 'The game project the Forge agents work in'],
    ['forge-build', 'Folders', 'Forgeheart debug build', 'Forgeheart debug build', 'forgeheart debug build game', 'The game page the Forge Debug agent plays'],
    ['ae-path', 'Folders', 'After Effects install', 'After Effects install', 'after effects adobe ae folder', 'Only when After Effects is installed somewhere unusual'],
    ['ae-dirs', 'Folders', 'Where to look for .aep projects', '.aep projects', 'after effects projects aep folders', 'Folders searched for After Effects projects'],
    ['backup', 'Backup and files', 'Backups…', 'Backups', 'backup back up hub data export save chats settings memory restore automatic daily weekly', 'Back up now, a copy as one file, restore, or back up by itself'],
    ['shortcuts', 'Backup and files', 'Create Hearth shortcuts (Start menu, desktop, Applications)', 'Create ', 'shortcut desktop start menu applications app icon', 'Open Hearth like any other app'],
    ['pack-mac', 'Backup and files', 'Pack Hearth for a Mac…', 'Pack Hearth for a Mac', 'mac move copy zip other computer', 'One zip with the app and your things, plus the Mac setup'],
    ['data-folder', 'Backup and files', 'Open data folder', 'Open data folder', 'data folder files where chats kept', 'Where Hearth keeps your chats and files'],
    ['config', 'Backup and files', 'Edit config.json', 'Edit config.json', 'config json settings file expert', 'Every setting as a text file (for experts)'],
    ['theme-css', 'Backup and files', 'Edit theme.css', 'Edit theme.css', 'css theme colors styles expert', 'Your own colours and styles as a text file (for experts)'],
  ].map(([id, sec, label, find, tags, hint, sel]) => ({ id: `set:${id}`, kind: 'setting', sec, label, find, tags, hint, sel: sel || '', adv: ADVANCED.has(sec), path: pathOf(sec) }));
  // SettingsFind's homes → the section they go in
  const HOMES = { look: 'More looks and tweaks', updates: 'Updates and tips', chats: 'Chats', start: 'Starting and closing', hearth: 'Housekeeping', board: 'Mood board' };

  // ---------- ⋯ AI setup ----------
  // [id, fold ('' = always open), label, find (on screen), tags, hint, part (where it lives, after "⋯ AI setup")]
  const AI_SETUP = [
    ['personality', '', 'Personality', 'Personality', 'personality persona character who tone voice style', 'Who it is and how it talks, in every message', 'Personality'],
    ['instructions', '', 'Instructions', 'Instructions', 'instructions rules always prompt standing system', 'Rules it always follows; untick one to pause it', 'Instructions'],
    ['use', '', 'What it can use', 'What it can use', 'access reach tools abilities permissions', 'What it may reach by itself when it helps', 'What it can use'],
    ['files', '', 'Files on this computer', 'Files on this computer', 'files folders permission access disk read write computer', 'Which folders it may read or change, for every chat with it', 'What it can use'],
    ['tools', 'tools', 'Hearth\'s tools', 'Hearth\'s tools', 'tools hearth abilities', 'Your chats, the Lab, the mood board, recordings, apps…', 'What it can use'],
    ['t-chats', 'tools', 'Use your chats and Hearth', 'Your chats and Hearth', 'chats search read other chats open', 'Read and search your other chats, open things in Hearth', 'What it can use › Hearth\'s tools'],
    ['t-lab', 'tools', 'Use the Three.js Lab', 'Three.js Lab', 'lab three director scenes build', 'Build and change scenes in the Lab', 'What it can use › Hearth\'s tools'],
    ['t-board', 'tools', 'Use the mood board', 'Mood board', 'board moodboard references see arrange', 'See and arrange your mood boards (≈ 500 tokens, only on messages that need it)', 'What it can use › Hearth\'s tools'],
    ['t-capture', 'tools', 'Take screenshots and recordings', 'Screenshots and recordings', 'screenshot record capture video frames', 'Take screenshots, record, read video frames', 'What it can use › Hearth\'s tools'],
    ['t-apps', 'tools', 'Use app windows (Meshy, Suno…)', 'App windows', 'apps meshy suno windows', 'Use the AI apps in Hearth\'s windows', 'What it can use › Hearth\'s tools'],
    ['t-adobe', 'tools', 'Drive Adobe apps', 'Adobe', 'adobe photoshop after effects premiere', 'Drive Photoshop / After Effects / Premiere on this computer', 'What it can use › Hearth\'s tools'],
    ['t-deploy', 'tools', 'Publish sites and pages', 'Publishing', 'publish deploy site web page', 'It always asks before anything goes public', 'What it can use › Hearth\'s tools'],
    ['connections', 'connections', 'Connections', 'Connections', 'connections connectors apps services mcp gmail drive notion', 'Other apps and services it can reach', 'What it can use'],
    ['c-apps', 'connections', 'Connected apps (Gmail, Drive, Notion…)', 'Connected apps', 'gmail drive notion calendar claude.ai connectors', 'Off, read only or full, per app', 'What it can use › Connections'],
    ['c-own', 'connections', 'Add a connection', 'Add a connection', 'mcp server tool server add connection own', 'A tool server you already have (the kind called MCP)', 'What it can use › Connections'],
    ['c-chrome', 'connections', 'Chrome for Google sign-in', 'Chrome (for Google sign-in)', 'chrome google sign in browser', 'Hearth\'s own Chrome, for sites that refuse sign-in inside Hearth', 'What it can use › Connections'],
    ['hooks', 'hooks', 'Hooks: when something happens, it acts', 'Hooks', 'hooks automation automate when trigger then', 'When something happens, it acts by itself', 'What it can use'],
    ['check', '', 'Check this AI', 'Check this AI', 'check test works working ai engine diagnose computer', 'A short real test, with a fix on each failing line', 'What it can use'],
    ['thinks', '', 'How hard it thinks (Quick, Smart, Deep)', 'How hard it thinks', 'thinking effort reasoning quick smart deep model', 'Smart picks for each message: lighter for small asks, deeper for code', 'How hard it thinks'],
    ['learned', '', 'What Smart has learned from you', 'Smart has learned', 'smart learned learn router model effort retry harder forget', 'Kinds of messages Smart now picks higher or lower for, from how replies went; ✕ forgets', 'How hard it thinks'], // (round 39, routerlearn)
    ['length', '', 'How long its answers are (Short answers, Normal, Detailed)', 'How long its answers are', 'answers length short concise detailed brief verbose tokens', 'Short: the answer first, fewer output tokens', 'How hard it thinks'],
    ['memory', 'memory', 'Memory: remembers things you tell it', 'Remembers things you tell it', 'memory remember forget facts', 'It keeps lasting facts and preferences for every chat with it', 'Memory'],
    ['memory-edit', 'memory', 'What it remembers…', 'What it remembers', 'memory facts edit remove forget', 'See, edit or remove what it keeps in mind', 'Memory'],
    ['memory-tidy', 'memory', 'Tidy memory…', 'Tidy memory', 'memory tidy clean duplicates merge shorten old outdated contradictions lab', 'Merge facts said twice, update old ones, shorten, keep Lab facts for the Lab', 'Memory'], // (round 38, memorytidy)
    ['habits', 'habits', 'Habits', 'Habits', 'habits by itself automatically', 'Things it does by itself', 'Habits'],
    ['self-review', 'habits', 'Checks its own work before it answers', 'Checks its own work', 'review check own work verify', 'For visual work: a quick look at the result first', 'Habits'],
    ['suggest', 'habits', 'Suggests what to do next', 'Suggests what to do next', 'suggest next steps buttons ideas', 'Up to 3 next steps as buttons under a reply', 'Habits'],
    ['show-thinking', 'habits', 'Shows its thinking', 'Shows its thinking', 'thinking thought process show hide', 'Its thought process shows folded under the reply', 'Habits'],
    ['spending', 'spending', 'Spending', 'Spending', 'spending tokens cost money budget usage cheaper', 'This week\'s use, a weekly limit, what happens near it', 'Spending'],
    ['limit', 'spending', 'Weekly limit', 'Weekly limit', 'limit budget cap tokens week', 'A weekly limit of tokens for this AI', 'Spending'],
    ['lighter', 'spending', 'Continue lighter (offer it in long chats)', 'Offer to continue lighter', 'continue lighter compact summary long chat cheaper', 'In a long chat, one line offers a summary instead of re-reading everything', 'Spending'],
    ['tokens-go', 'spending', 'Where its tokens go', 'Where its tokens go', 'tokens where cost audit prompt tools fixed part', 'What every message carries before your words, line by line', 'Spending'],
    ['cost-coach', 'spending', 'Cost coach: where your tokens went, what to change', 'Cost coach', 'coach save saving waste where went week fixes suggestions advice', 'The last 7 days by AI, kind of chat and cause, and the 3 changes that would save the most', 'Spending'], // (round 43)
    ['glance', 'spending', 'This week at a glance…', 'This week at a glance', 'week usage biggest chats tools stats', 'Biggest chats, biggest tools, one-click fixes', 'Spending'],
    ['next', 'missions', 'Your next message (missions)', 'Your next message', 'mission missions next message mode swarm', 'What the next message becomes (◎ in the chat box)', 'Your next message'],
  ].map(([id, fold, label, find, tags, hint, part]) => ({ id: `ai:${id}`, kind: 'aisetup', fold, label, find, tags, hint, path: `⋯ AI setup › ${part}` }));

  // ---------- how do I… ----------
  const HELP = [
    { title: 'How do I switch to dark or light mode?', tags: 'dark mode light mode theme look appearance colors night', text: 'Settings › Look & size: pick a look. More looks and tweaks › ◐ Match my computer makes Hearth follow your computer\'s light / dark mode by itself.', go: 'set:follow' },
    { title: 'How do I spend fewer tokens?', tags: 'cheaper cheap tokens cost money spend save budget limit', text: '⋯ AI setup › Spending: a weekly limit, Continue lighter for long chats, and Where its tokens go. How long its answers are › Short and How hard it thinks › Smart both save tokens too.', go: 'ai:spending' },
    { title: 'How do I let an AI use my files?', tags: 'files folders permission access read write disk', text: '⋯ AI setup › What it can use › Files on this computer, for every chat with that AI. For one chat only: right-click the chat header › Files it can use.', go: 'ai:files' },
    { title: 'How do I give an AI rules it always follows?', tags: 'instructions rules always standing prompt', text: '⋯ AI setup › Instructions: add one per line; untick one to pause it.', go: 'ai:instructions' },
    { title: 'How do I change how an AI talks?', tags: 'personality persona tone voice character style', text: '⋯ AI setup › Personality: pick one, or write your own.', go: 'ai:personality' },
    { title: 'How do I connect Gmail, Drive or Notion?', tags: 'connections connectors gmail drive notion calendar mcp apps', text: 'Connect them once at claude.ai › Settings › Connectors, then ⋯ AI setup › What it can use › Connections: Off, Read only or Full per app.', go: 'ai:c-apps' },
    { title: 'How do I make an AI act by itself when something happens?', tags: 'hooks automation automate when trigger', text: '⋯ AI setup › What it can use › Hooks: "when… then…", each on / off.', go: 'ai:hooks' },
    { title: 'How do I check an AI works on this computer?', tags: 'check test computer broken working engine install', text: '⋯ AI setup › What it can use › Check this AI runs a short real test with a fix per line. Settings › This computer & sync › Check this computer… checks the whole computer.', go: 'ai:check' },
    { title: 'How do I make its answers shorter?', tags: 'short shorter answers concise brief length long', text: '⋯ AI setup › How hard it thinks › How long its answers are › Short: the answer first, fewer tokens.', go: 'ai:length' },
    { title: 'How do I keep a long chat light?', tags: 'long chat slow compact lighter summary tokens', text: 'When a chat gets long, a line under the reply offers 🗜 Continue lighter: a summary replaces the old messages for the AI (every message stays in the chat). When it offers: ⋯ AI setup › Spending.', go: 'ai:lighter' },
    { title: 'How do I make it remember (or forget) things?', tags: 'memory remember forget facts', text: '⋯ AI setup › Memory: on or off, and What it remembers… to edit or remove facts.', go: 'ai:memory-edit' },
    { title: 'How do I get several AIs on one question?', tags: 'missions swarm debate several ais everyone side by side second opinion', text: '◎ in the chat box: Swarm, Debate, Side by side, Answer then review, Ask everyone… for the next message (📌: every message).', go: 'mission:swarm' },
    { title: 'How do I find what we decided in an old chat?', tags: 'find old chat decided decision remember search message', text: 'Type a few of its words here: chats and their messages are found too. ◎ › Remind me what we decided answers from all your chats, for free.' },
    { title: 'How do I keep my Mac and PC the same?', tags: 'sync two computers mac pc cloud drive', text: 'Settings › This computer & sync: pick a cloud drive folder you already use (iCloud Drive, Google Drive, Dropbox, OneDrive).', go: 'set:sync' },
    { title: 'How do I see what changed lately?', tags: 'whats new patch notes changes update', text: 'Settings › Updates & what\'s new › What\'s new…, or type "what\'s new" and a word here.', go: 'set:whatsnew' },
    { title: 'Which keys are there?', tags: 'keys shortcuts keyboard hotkeys alt', text: 'The keys button bottom left (or Settings › Advanced › Keys › Keyboard keys…) lists every key; every key also has a menu row.', go: 'set:keys' },
    { title: 'How do I back up my chats?', tags: 'backup export save chats copy', text: 'Settings › Advanced › Backup and files › Backups…: back up now, save a copy as one file, restore, or let it back up by itself every day or week.', go: 'set:backup' },
    { title: 'How do I get back chats, memory or settings I lost?', tags: 'lost missing gone disappeared deleted recover restore backup chats chat memory settings agents notes prompts data', text: 'Settings › Advanced › Backup and files › Backups… › Recover… (or type "recover" here): Hearth looks in Recently deleted, its automatic copies, what sync kept aside, the cloud folder and your backups, and adds the ones you tick next to yours. Nothing of yours is replaced.' }, // (round 43, datasafe)
    { title: 'How do I get back Lab scenes I lost?', tags: 'lab scenes sketches lost missing gone disappeared recover restore backup three', text: 'Lab › Sketch ▾ › 🛟 Recover lost scenes… (or type "recover" here, or Settings › Advanced › Backup and files › Backups… › Recover lost Lab scenes…): Hearth looks in its automatic copies, History, the time machine, sync and your backups, and adds the ones you tick next to yours.' }, // (round 43, scenesafe)
    { title: 'How do I start a new chat?', tags: 'new chat start conversation', text: 'Ctrl/⌘+N in a chat, or right-click an AI in the rail › New chat.' },
    { title: 'How do I take a tool off the rail?', tags: 'rail tools hide sidebar remove button', text: 'Right-click it in the rail › Hide from the rail. Settings › Advanced › Tools in the rail brings it back.', go: 'set:rail-tools' },
    { title: 'How do I make a Lab slider move with the music?', tags: 'lab move with the beat music pulse on kick step bar follow bass slider react rhythm three', text: 'In the Lab, right-click a slider (or its ♪) › ♪ Move with the music…: what drives it (beat, bar, kick, snare, hi-hats, bass, mids, highs, vocals, loudness), how (pulse, follow, step, random), and two handles under the slider for its range. Ctrl/⌘+K › Lab: ♪ Move a slider with the music picks the slider.' }, // (round 38, beatlink)
    { title: 'How do I add a camera move (push in, orbit, dolly zoom) to a Lab scene?', tags: 'lab camera move moves push in pull out orbit dolly zoom vertigo crane whip pan shake handheld drift punch in on the beat kick bar keyframe cinematic timeline view', text: 'In the Lab, right-click the preview › 🎥 Camera moves: push in, pull out, orbit, dolly zoom, crane, handheld shake, whip pan, slow drift, a punch-in on each kick / beat / bar, or from this view to that view (look around with right-drag or two fingers, then set the start and the end). Each move is a cyan bar under the waveform: drag its ends. 🎥 Your moves… sets the easing and the intensity. Renders match the preview.' }, // (round 40, labcamera)
    { title: 'How do I find something in the Lab?', tags: 'lab search find effect layer slider three', text: 'Press / in the Lab (or the 🔎 next to ⋯). Here, with the Lab open, its things are found too.' },
    // (round 40, chatcalm) where the message actions and the folded notes are
    { title: 'How do I retry, edit, branch or quote a message?', tags: 'retry again regenerate edit resend branch fork quote reply pin bookmark react read aloud save message reply copy', text: 'Point at a message: Copy and ⋯ show under it. ⋯ › Reply has Quote, Edit and resend, Branch, Retry, Review and a second opinion; Mark has Pin, Bookmark and React; Copy & save has the rest. Right-click a message for the same menu.' },
    { title: 'Where did the notes under a reply go?', tags: 'notes lines cache continue lighter smart learned under reply folded hidden', text: 'When two or more quiet notes apply (the cache note, 🗜 Continue lighter, what Smart learned), they fold into one line under the reply: their buttons stay on it, ▸ shows each note.' },
    { title: 'How do I see what a reply cost or which model answered?', tags: 'tokens cost price model smart pick which model answered usage bar', text: 'Point at the reply: its tokens show under it; the small bar is what your message sent (click it for the list) and the Quick / Deep chip is Smart\'s pick (click: ask again, thinking harder).' },
    { title: 'How do I change what the next message does?', tags: 'mission next message plan research review', text: '◎ in the chat box: what your next message becomes (plan first, research, review…). Right-click ◎: back to a normal reply.', go: 'ai:next' },
  ];
  return { SYN, PHRASES, KIND, SETTINGS, HOMES, ADVANCED, PARENT, pathOf, AI_SETUP, HELP };
})();
if (typeof module !== 'undefined') module.exports = AppSearchData;
