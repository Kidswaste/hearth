// Studio (round 15): one-click creative pipelines that chain what Hearth already has (the board's eyes, Pinterest,
// the Three Director, the Lab's music analysis, the sequence, the render queue, Meshy, Poly Haven, Photoshop, deploy,
// Suno). A recipe is plain data: its pitch, the rooms its make gets ahead of time, what it needs on this computer,
// what it may cost, and its steps. studio.js turns a recipe into a make (one name, one mark, rooms now) and walks it
// as a Flows run (the Commands page's "Going now", hung → pick up here, ↻ Again).
// Pure: no DOM, loads in Node (module.exports at the bottom).
//
// A recipe's steps compile to Flow nodes (flows.js):
//   { id, ask: 'choice' | 'text', title, var, options | placeholder, optional, skipIf }   a question (asked first)
//   { id, do: '<handler>', title, part, var, timeout, onError }                          /studio-do <recipe> <id>
//   { id, wait: '<handler>', title, part, every, timeout, match }                        a check, polled
//   { id, director: true, title, part, prompt }                                          the Lab room's Three Director (in its chat)
//   { id, result: '<text with {vars}>' }
// part: the make's part the step moves (rooms: board / lab / video; steps: their label).
const StudioData = (() => {
  // ---- what a recipe may need on this computer (studio.js checks each one, and says how to fix it) ----
  const NEEDS = {
    claude: { label: 'a Claude engine (the Three Director)', fix: '/doctor checks the engines and installs or signs in for you', cmd: '/doctor' },
    ffmpeg: { label: 'ffmpeg (renders)', fix: '/ffmpeg install installs it in one click', cmd: '/ffmpeg install' },
    meshy: { label: 'a Meshy API key', fix: '/meshy key (paste it once; or "Use Meshy\'s test key" to try it for free)', cmd: '/meshy key' },
    photoshop: { label: 'Adobe Photoshop', fix: 'install Photoshop from the Creative Cloud app, then /adobe to check', cmd: '/adobe' },
    deploy: { label: 'a publishing CLI (Vercel, Netlify, Cloudflare or GitHub)', fix: 'install one in a terminal (npm i -g vercel), then /deploy login', cmd: '/deploy status' },
    board: { label: 'references on the board', fix: 'drop a few pictures or clips on the board (or describe the vibe when it asks)', cmd: '/board' },
    suno: { label: 'Suno (its window, signed in on its page)', fix: '/suno opens it; sign in there once', cmd: '/suno' },
  };

  const DIRECTOR = (what) => `Studio: ${what} Build it in this chat's Lab scene, in layers (vibe, not footage). Reply in two short lines when it runs.`;

  const RECIPES = [
    {
      id: 'board-video', name: 'Board → video', icon: '▦', words: 'board vibe moodboard references pinterest video reel socials youtube',
      pitch: 'Your board\'s vibe becomes a Lab scene, cut into a sequence, rendered for socials, then opened in your video player.',
      rooms: [{ key: 'board', kind: 'board' }, { key: 'lab', kind: 'lab' }, { key: 'seq', kind: 'step', label: 'Sequence' }, { key: 'render', kind: 'step', label: 'Render' }, { key: 'video', kind: 'video' }],
      needs: ['claude', 'ffmpeg'], soft: ['board'], tokens: 'one Three Director reply (≈ 4–8k tokens)',
      steps: [
        { id: 'fmt', ask: 'choice', title: 'Render it for?', var: 'fmt', options: [{ label: 'Reels / TikTok / Shorts (9:16)', value: 'reels' }, { label: 'YouTube (16:9)', value: 'youtube' }, { label: 'Both', value: 'reels youtube' }] },
        { id: 'vibe', do: 'vibe', title: 'Read the board\'s vibe', part: 'board', var: 'vibeout' },
        { id: 'words', ask: 'text', title: 'The board is empty: describe the vibe', var: 'vibewords', placeholder: 'chrome, night, slow pink light, grainy 35mm…', skipIf: 'hasvibe' },
        { id: 'pins', do: 'pins', title: 'Pinterest searches for missing refs', part: 'board' },
        { id: 'room', do: 'room', title: 'Open the Lab room', part: 'lab' },
        { id: 'scene', director: true, title: 'The Three Director makes the scene', part: 'lab', prompt: DIRECTOR('a loopable scene with this vibe: {vibe}{vibewords}.') },
        { id: 'seq', do: 'sequence', title: 'Cut it into a sequence', part: 'seq', var: 'seqout', template: 'teaser', secs: 15 },
        { id: 'render', do: 'render', title: 'Render ({fmt})', part: 'render', var: 'renderout' },
        { id: 'review', do: 'review', title: 'Open it when it\'s rendered', part: 'video' },
        { id: 'done', result: '{name}: the scene is made, cut ({seqout}) and in the render queue ({renderout}). It opens in your video player when it\'s rendered.' },
      ],
    },
    {
      id: 'song-viz', name: 'Song → visualizer', icon: '♪', words: 'song music audio track suno visualizer reactive beat sections socials',
      pitch: 'A song (a file or your newest Suno download) is analysed in the Lab, a scene reacts to it, a sequence cuts on its sections, and every social size renders.',
      rooms: [{ key: 'music', kind: 'step', label: 'Song' }, { key: 'lab', kind: 'lab' }, { key: 'seq', kind: 'step', label: 'Sequence' }, { key: 'render', kind: 'step', label: 'Render' }],
      needs: ['claude', 'ffmpeg'], tokens: 'one Three Director reply (≈ 4–8k tokens)',
      steps: [
        { id: 'song', ask: 'text', title: 'Which song?', var: 'song', placeholder: 'a file path · "suno" for your newest Suno download · empty: the Lab\'s song', optional: true, skipIf: 'songset' },
        { id: 'room', do: 'room', title: 'Open the Lab room', part: 'lab' },
        { id: 'load', do: 'song', title: 'Load and analyse the song', part: 'music', var: 'music', timeout: 300000 },
        { id: 'scene', director: true, title: 'The Three Director makes it react', part: 'lab', prompt: DIRECTOR('a scene that reacts to the song loaded in the Lab ({music}): kick and bass drive the motion, each section changes the look.') },
        { id: 'seq', do: 'sequence', title: 'Cut on the song\'s sections', part: 'seq', var: 'seqout', template: 'reel' },
        { id: 'render', do: 'render', title: 'Render every social size', part: 'render', var: 'renderout', fmt: 'socials' },
        { id: 'done', result: '{name}: {music} → a reactive scene, cut on the sections ({seqout}), rendering for every social ({renderout}).' },
      ],
    },
    {
      id: 'idea-3d', name: 'Idea → 3D hero', icon: '🧊', words: 'idea 3d model meshy hero object hdri sky poly haven camera orbit render product',
      pitch: 'Words (or a board picture) become a Meshy 3D model in the Lab, lit by a free Poly Haven sky, with a camera move, rendered.',
      rooms: [{ key: 'model', kind: 'step', label: 'Model' }, { key: 'lab', kind: 'lab' }, { key: 'render', kind: 'step', label: 'Render' }],
      needs: ['meshy', 'ffmpeg'], credits: 'text', tokens: 'no tokens',
      steps: [
        { id: 'idea', ask: 'text', title: 'What should the hero be?', var: 'idea', placeholder: 'a chrome dragon skull · "board" for the newest board picture', skipIf: 'ideaset' },
        { id: 'room', do: 'room', title: 'Open the Lab room', part: 'lab' },
        { id: 'meshy', do: 'meshy', title: 'Meshy makes the model (cost shown, asked first)', part: 'model', timeout: 900000, onError: 'none' },
        { id: 'wait', wait: 'meshy-wait', title: 'The model lands in the Lab', part: 'model', every: 4000, timeout: 1800000, match: '^ready' },
        { id: 'sky', do: 'sky', title: 'A Poly Haven sky lights it', part: 'lab', var: 'sky', timeout: 300000 },
        { id: 'cam', do: 'camera', title: 'A camera move', part: 'lab' },
        { id: 'seq', do: 'sequence', title: 'A 6 s loop', part: 'render', var: 'seqout', template: 'loop', secs: 6 },
        { id: 'render', do: 'render', title: 'Render (9:16)', part: 'render', var: 'renderout', fmt: 'reels' },
        { id: 'done', result: '{name}: the model is in the Lab under {sky}, orbiting, rendering ({renderout}).' },
        { id: 'none', result: 'Nothing was made and nothing was spent. ↻ Again when you want it.' },
      ],
    },
    {
      id: 'scene-web', name: 'Scene → website', icon: '🌐', words: 'scene website web page deploy publish share link vercel netlify',
      pitch: 'The open Lab scene becomes a web page on your publishing service (it asks before anything goes public); the link is copied.',
      rooms: [{ key: 'pub', kind: 'step', label: 'Publish' }, { key: 'link', kind: 'step', label: 'Link' }],
      needs: ['deploy'], tokens: 'no tokens',
      steps: [
        { id: 'pub', do: 'publish', title: 'Build, preview, publish (asks first)', part: 'pub', var: 'url', timeout: 900000, onError: 'none' },
        { id: 'link', do: 'link', title: 'Copy the link', part: 'link' },
        { id: 'done', result: '{name} is live: {url} (copied).' },
        { id: 'none', result: 'Nothing went public.' },
      ],
    },
    {
      id: 'still-ps', name: 'Still → Photoshop', icon: '🖼', words: 'still frame photoshop psd layers social sizes retouch board',
      pitch: 'A still of the Lab goes to Photoshop (social sizes too, if you like); what you save there comes back, and the still lands on the board.',
      rooms: [{ key: 'still', kind: 'step', label: 'Still' }, { key: 'ps', kind: 'step', label: 'Photoshop' }, { key: 'board', kind: 'board' }],
      needs: ['photoshop'], tokens: 'no tokens',
      steps: [
        { id: 'sizes', ask: 'choice', title: 'Social sizes too?', var: 'sizes', options: [{ label: 'Yes: 9:16, 4:5, 1:1', value: 'socials' }, { label: 'Just the still', value: '' }] },
        { id: 'still', do: 'still', title: 'A still of the Lab', part: 'still', var: 'still' },
        { id: 'ps', do: 'photoshop', title: 'Open it in Photoshop', part: 'ps', var: 'psout', timeout: 600000, onError: 'board' },
        { id: 'board', do: 'to-board', title: 'Onto the board', part: 'board' },
        { id: 'done', result: '{name}: {psout} The still is on the board; save in Photoshop and it comes back.' },
      ],
    },
    {
      id: 'vibe-song', name: 'Vibe → song', icon: '🎵', words: 'suno song music soundtrack vibe prompt lyrics style',
      pitch: 'Suno\'s style tags and lyrics written from your scene and board (no tokens), typed into Suno; the song you download becomes the Lab\'s song.',
      rooms: [{ key: 'prompt', kind: 'step', label: 'Prompt' }, { key: 'song', kind: 'step', label: 'Song' }],
      needs: [], soft: ['suno'], tokens: 'no tokens (Suno spends its own credits when you press Create there)',
      steps: [
        { id: 'words', ask: 'text', title: 'Anything to add to the vibe?', var: 'words', placeholder: 'dreamy night drive, female vocals…', optional: true },
        { id: 'prompt', do: 'suno-prompt', title: 'Write and paste the Suno prompt', part: 'prompt', var: 'sunoout', timeout: 180000 },
        { id: 'wait', wait: 'suno-wait', title: 'Press Create in Suno, then download the song', part: 'song', every: 5000, timeout: 1800000, match: '^ready' },
        { id: 'use', do: 'suno-use', title: 'It becomes the Lab\'s song', part: 'song', var: 'songout', timeout: 300000 },
        { id: 'done', result: '{name}: {songout} Next: /studio song → visualizer.' },
      ],
    },
  ];

  const norm = (s) => String(s || '').toLowerCase().replace(/[→>-]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const get = (id) => RECIPES.find((r) => r.id === id) || null;
  // forgiving: "song", "song viz", "Board → video", "3d", "website", "photoshop"
  function find(q) {
    const s = norm(q);
    if (!s) return null;
    const exact = RECIPES.find((r) => r.id === s.replace(/ /g, '-') || norm(r.name) === s);
    if (exact) return exact;
    const words = s.split(' ');
    let best = null; let score = 0;
    for (const r of RECIPES) {
      const hay = `${r.id.replace(/-/g, ' ')} ${norm(r.name)} ${r.words}`.split(' ');
      const sc = words.reduce((n, w) => n + (hay.includes(w) ? 2 : hay.some((h) => h.startsWith(w) && w.length > 1) ? 1 : 0), 0);
      if (sc > score) { score = sc; best = r; }
    }
    return best;
  }

  // the Flow (flows.js) of a recipe; o: { agentId (the Lab room's director, for the director step), makeName }
  function flowOf(r, o = {}) {
    const nodes = r.steps.map((s, i) => {
      const next = s.result ? undefined : r.steps[i + 1]?.id;
      const base = { id: s.id, title: s.title || s.id, part: s.part || null, next };
      if (s.ask) return { ...base, kind: s.ask, var: s.var, ...(s.options ? { options: s.options } : {}), ...(s.placeholder ? { placeholder: s.placeholder } : {}), ...(s.optional ? { optional: true } : {}), ...(s.skipIf ? { skipIf: s.skipIf } : {}) };
      if (s.do) return { ...base, kind: 'action', cmd: `/studio-do ${r.id} ${s.id} {sid}`, quiet: true, ...(s.var ? { var: s.var } : {}), ...(s.timeout ? { timeout: s.timeout } : {}), ...(s.onError ? { onError: s.onError } : {}) };
      if (s.wait) return { ...base, kind: 'check', cmd: `/studio-do ${r.id} ${s.id} {sid}`, quiet: true, every: s.every || 4000, timeout: s.timeout || 600000, match: s.match || '^ready' };
      if (s.director) return { ...base, kind: 'ai', engine: 'claude', inChat: true, prompt: s.prompt, timeout: 1200000, ...(o.agentId ? { agent: o.agentId } : {}) };
      return { id: s.id, kind: 'result', title: 'Done', text: s.result };
    });
    // a second result (a "declined" ending, after the main one) is only reached through onError
    return { id: `studio-${r.id}`, name: `Studio · ${r.name}`, desc: r.pitch, icon: r.icon, area: 'Studio', studio: r.id, start: nodes[0].id, nodes };
  }
  // what the make's rooms / parts are: Makes.plan kinds ([{ kind, brief }]) and their labels
  const partsOf = (r) => r.rooms.map((x) => ({ kind: x.kind, brief: x.kind === 'step' ? '' : `Studio · ${r.name}`, label: x.label || null, key: x.key }));
  // one line per recipe (/studio list, the chats' map)
  const line = (r) => `${r.icon} **${r.name}** · ${r.pitch}`;

  return { NEEDS, RECIPES, get, find, flowOf, partsOf, line, norm };
})();
if (typeof module !== 'undefined') module.exports = StudioData;
