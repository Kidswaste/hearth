// AI apps (round 14, apps stream, the owner: "pack other AI in Apps while you're there, feel free to make me discover
// things"). A curated set of AI services, each light: its own window and sign-in, one line on what it's good for,
// free / paid, where its downloads go, and `fits` (when it is worth suggesting: lab, board, song, edit, chat), which
// the Discover section (apps-discover.js) matches to what you're doing. They live in the one Apps picker (kinds,
// search, favorites and recents first), never as a list on screen. Adobe Firefly is a stand-in the adobe stream's
// own registration replaces (same id).
(() => {
  const AI = [
    // ---------- pictures and video ----------
    { id: 'midjourney', name: 'Midjourney', icon: '⛵', group: 'Make', url: 'https://www.midjourney.com/imagine', price: 'paid', fits: ['board', 'lab'], routes: { image: 'board' }, desc: 'Painterly, cinematic stills: mood frames and textures', keywords: 'image ai art' },
    { id: 'ideogram', name: 'Ideogram', icon: '✎', group: 'Make', url: 'https://ideogram.ai', price: 'free tier', fits: ['board', 'edit'], routes: { image: 'board' }, desc: 'Images with readable text: posters, titles, logos', keywords: 'image typography text logo' },
    { id: 'krea', name: 'Krea', icon: '◐', group: 'Make', url: 'https://www.krea.ai', price: 'free tier', fits: ['board', 'lab'], routes: { image: 'board', video: 'review' }, desc: 'Real-time image generation, upscaling and video', keywords: 'realtime upscale enhance image video' },
    { id: 'leonardo', name: 'Leonardo', icon: '🦁', group: 'Make', url: 'https://app.leonardo.ai', price: 'free tier', fits: ['board', 'lab'], routes: { image: 'board' }, desc: 'Images and game-style textures with fine control', keywords: 'image texture game assets' },
    { id: 'recraft', name: 'Recraft', icon: '◇', group: 'Make', url: 'https://www.recraft.ai', price: 'free tier', fits: ['board', 'edit'], routes: { image: 'board' }, desc: 'Vector art, icons and brand-consistent illustration', keywords: 'vector svg icon brand illustration' },
    { id: 'firefly', name: 'Adobe Firefly', icon: '🔥', group: 'Make', url: 'https://firefly.adobe.com', partition: 'adobe', price: 'with your Adobe plan', fits: ['board', 'edit'], routes: { image: 'board', video: 'review' }, desc: 'Commercially safe images and video, your Adobe sign-in', keywords: 'adobe image video generative fill', fallback: true },
    { id: 'pika', name: 'Pika', icon: '⚡', group: 'Make', url: 'https://pika.art', price: 'free tier', fits: ['lab', 'edit'], routes: { video: 'review' }, desc: 'Short playful video clips and effects from a picture', keywords: 'video ai effects' },
    { id: 'luma', name: 'Luma Dream Machine', icon: '🌙', group: 'Make', url: 'https://dream-machine.lumalabs.ai', price: 'free tier', fits: ['lab', 'board', 'edit'], routes: { video: 'review', image: 'board' }, desc: 'Smooth, realistic camera moves from words or a still', keywords: 'video ai camera motion' },
    { id: 'kling', name: 'Kling', icon: '🎬', group: 'Make', url: 'https://app.klingai.com', price: 'free daily credits', fits: ['lab', 'edit'], routes: { video: 'review' }, desc: 'Long, physical video shots (people, motion) from words or a frame', keywords: 'video ai' },
    // ---------- 3D ----------
    { id: 'tripo', name: 'Tripo', icon: '🔺', group: '3D', url: 'https://www.tripo3d.ai', price: 'free tier', fits: ['lab', 'board'], routes: { model: 'lab-model' }, desc: 'Fast 3D models from a picture or words (GLB into the Lab)', keywords: '3d model glb image to 3d' },
    { id: 'genie', name: 'Luma Genie', icon: '🧞', group: '3D', url: 'https://lumalabs.ai/genie', price: 'free', fits: ['lab'], routes: { model: 'lab-model' }, desc: 'Quick 3D objects from a sentence, free', keywords: '3d model text to 3d' },
    { id: 'csm', name: 'CSM', icon: '◆', group: '3D', url: 'https://3d.csm.ai', price: 'free tier', fits: ['lab', 'board'], routes: { model: 'lab-model' }, desc: 'Image to 3D with clean parts, sketch to 3D', keywords: '3d model sketch image to 3d' },
    // ---------- sound ----------
    { id: 'udio', name: 'Udio', icon: '🎙', group: 'Sound', url: 'https://www.udio.com', price: 'free tier', fits: ['song', 'lab'], routes: { audio: 'lab-song' }, desc: 'Songs with strong vocals and genre range (a second take next to Suno)', keywords: 'music song ai vocals' },
    { id: 'stableaudio', name: 'Stable Audio', icon: '〰', group: 'Sound', url: 'https://stableaudio.com', price: 'free tier', fits: ['song', 'lab', 'edit'], routes: { audio: 'lab-song' }, desc: 'Loops, textures and sound design by length and bpm', keywords: 'loop sound design ambient bpm' },
    // ---------- chat and research ----------
    { id: 'chatgpt', name: 'ChatGPT', icon: '◎', group: 'Chat', url: 'https://chatgpt.com', price: 'your ChatGPT plan', fits: ['chat'], desc: 'Its own apps (image generation, canvas, search) in the browser', keywords: 'openai gpt images' },
    { id: 'claudeai', name: 'Claude.ai', icon: '✳', group: 'Chat', url: 'https://claude.ai', price: 'your Claude plan', fits: ['chat'], desc: 'Claude\'s website: projects, artifacts and connectors', keywords: 'anthropic artifacts projects' },
    { id: 'gemini', name: 'Gemini', icon: '✦', group: 'Chat', url: 'https://gemini.google.com', price: 'free tier', fits: ['chat', 'edit'], desc: 'Google\'s assistant: long videos and documents, Google apps', keywords: 'google video understanding' },
    { id: 'perplexity', name: 'Perplexity', icon: '⌕', group: 'Chat', url: 'https://www.perplexity.ai', price: 'free tier', fits: ['chat', 'board'], desc: 'Web research with sources: references, trends, how-tos', keywords: 'search research sources' },
    { id: 'notebooklm', name: 'NotebookLM', icon: '📓', group: 'Chat', url: 'https://notebooklm.google.com', price: 'free', fits: ['chat'], desc: 'Drop in docs and videos, get summaries and a podcast of them', keywords: 'google notes podcast summary' },
    { id: 'grok', name: 'Grok', icon: '✕', group: 'Chat', url: 'https://grok.com', price: 'free tier', fits: ['chat'], desc: 'xAI\'s assistant: what X is talking about, images', keywords: 'x twitter trends' },
    // ---------- sites and code ----------
    { id: 'v0', name: 'v0', icon: '▲', group: 'Code', url: 'https://v0.dev', price: 'free tier', fits: ['chat'], desc: 'A web page or UI from a description (React)', keywords: 'vercel ui website react' },
    { id: 'bolt', name: 'Bolt', icon: '⚡', group: 'Code', url: 'https://bolt.new', price: 'free tier', fits: ['chat'], desc: 'A whole web app built and run in the browser', keywords: 'web app stackblitz' },
    { id: 'lovable', name: 'Lovable', icon: '♡', group: 'Code', url: 'https://lovable.dev', price: 'free tier', fits: ['chat'], desc: 'Apps and landing pages by chatting, with a database', keywords: 'web app landing page' },
    { id: 'replit', name: 'Replit', icon: '⟳', group: 'Code', url: 'https://replit.com', price: 'free tier', fits: ['chat'], desc: 'Code, run and host small apps; its Agent builds them', keywords: 'code host agent' },
    { id: 'framer', name: 'Framer', icon: '▣', group: 'Code', url: 'https://framer.com', price: 'free tier', fits: ['board', 'chat'], desc: 'Designed websites with motion, AI-assisted (a site for your work)', keywords: 'website portfolio motion' },
    { id: 'shadertoy', name: 'Shadertoy', icon: '◉', group: 'Code', url: 'https://www.shadertoy.com', price: 'free', fits: ['lab'], desc: 'Thousands of shaders to learn from: paste one into the Lab\'s shader playground', keywords: 'glsl shader effects' },
    // ---------- video editing ----------
    { id: 'descript', name: 'Descript', icon: '✂', group: 'Edit', url: 'https://web.descript.com', price: 'free tier', fits: ['edit', 'song'], routes: { video: 'review', audio: 'lab-song' }, desc: 'Edit video by editing its transcript; clean voice', keywords: 'transcript podcast voice' },
    { id: 'capcut', name: 'CapCut', icon: '◪', group: 'Edit', url: 'https://www.capcut.com/editor', price: 'free tier', fits: ['edit'], routes: { video: 'review' }, desc: 'Quick social edits: trending effects, auto captions', keywords: 'tiktok reels captions effects' },
    { id: 'captions', name: 'Captions', icon: '💬', group: 'Edit', url: 'https://www.captions.ai', price: 'free tier', fits: ['edit'], routes: { video: 'review' }, desc: 'Animated captions and AI edits for talking videos', keywords: 'subtitles captions' },
  ];
  for (const a of AI) Apps.register({ takes: ['image'], ...a });
  // what the apps registered elsewhere are good for (Discover reads `fits`)
  const FITS = {
    meshy: ['lab', 'board'], suno: ['song', 'lab'], spline: ['lab'], sketchfab: ['lab'], mixamo: ['lab'], polyhaven: ['lab'], unsplash: ['board'], pinterest: ['board'],
    coolors: ['board', 'lab'], fonts: ['board', 'edit'], runway: ['lab', 'edit'], elevenlabs: ['song', 'edit'], figma: ['board'], youtube: ['edit'], instagram: ['edit'], tiktok: ['edit'],
  };
  const PRICE = { meshy: 'you\'re subscribed', suno: 'you\'re subscribed', polyhaven: 'free', unsplash: 'free', sketchfab: 'free models', coolors: 'free', fonts: 'free', mixamo: 'free', pinterest: 'free' };
  addEventListener('DOMContentLoaded', () => {
    for (const [id, fits] of Object.entries(FITS)) { const a = Apps.get(id); if (a && !a.fits) a.fits = fits; }
    for (const [id, p] of Object.entries(PRICE)) { const a = Apps.get(id); if (a && !a.price) a.price = p; }
  });
})();
