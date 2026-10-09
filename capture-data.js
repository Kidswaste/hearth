// Capture presets (pure data, used by capture.js, capture-annotate.js, capture-frames.js, capture-tour.js and the
// commands): social frames, backgrounds and frames for "beautified" shots, annotation colors, recording presets,
// cursor / click / caption styles, contact-sheet layouts, frame-read modes, scene sensitivities and tour templates.
// One searchable picker shows each family; nothing here is on screen by itself.
const CaptureData = (() => {
  // ---------- social frames: crop (or fit) a shot / a recording to a post's exact size ----------
  const SOCIAL = [
    { id: '9:16', label: 'Reels / TikTok / Shorts / Stories', w: 1080, h: 1920 },
    { id: '4:5', label: 'Instagram / Facebook feed (portrait)', w: 1080, h: 1350 },
    { id: '1:1', label: 'Square post', w: 1080, h: 1080 },
    { id: '16:9', label: 'YouTube / landscape video', w: 1920, h: 1080 },
    { id: '3:4', label: 'Instagram grid (3:4)', w: 1080, h: 1440 },
    { id: '2:3', label: 'Pinterest pin', w: 1000, h: 1500 },
    { id: '4:3', label: 'Classic 4:3', w: 1440, h: 1080 },
    { id: '3:2', label: 'Photo 3:2', w: 1620, h: 1080 },
    { id: '5:4', label: 'Print 5:4', w: 1350, h: 1080 },
    { id: '21:9', label: 'Cinematic 21:9', w: 2560, h: 1080 },
    { id: '1.91:1', label: 'Link card (og:image 1200×628)', w: 1200, h: 628 },
    { id: '2:1', label: 'GitHub social preview (1280×640)', w: 1280, h: 640 },
    { id: '3:1', label: 'X / Twitter header (1500×500)', w: 1500, h: 500 },
    { id: '4:1', label: 'LinkedIn banner (1584×396)', w: 1584, h: 396 },
    { id: 'yt-thumb', label: 'YouTube thumbnail (1280×720)', w: 1280, h: 720 },
    { id: 'x-post', label: 'X / Twitter post image (1600×900)', w: 1600, h: 900 },
    { id: 'dribbble', label: 'Dribbble shot (1600×1200)', w: 1600, h: 1200 },
    { id: 'ph-gallery', label: 'Product Hunt gallery (1270×760)', w: 1270, h: 760 },
    { id: 'iphone', label: 'App Store iPhone 6.9″ (1290×2796)', w: 1290, h: 2796 },
    { id: 'ipad', label: 'App Store iPad 13″ (2064×2752)', w: 2064, h: 2752 },
    { id: 'mac-store', label: 'Mac App Store (2880×1800)', w: 2880, h: 1800 },
    { id: '4k', label: '4K UHD (3840×2160)', w: 3840, h: 2160 },
    { id: 'story-safe', label: 'Story with safe zones (1080×1920)', w: 1080, h: 1920, safe: { top: 0.14, bottom: 0.2 } },
  ];
  const socialOf = (id) => SOCIAL.find((s) => s.id === String(id).toLowerCase() || s.id === String(id)) || null;
  // "9x16", "9:16", "9 by 16", "1080x1920", "reels", "story" → a social frame (or a free ratio { w, h })
  const WORDS = { reels: '9:16', reel: '9:16', tiktok: '9:16', shorts: '9:16', story: '9:16', stories: '9:16', vertical: '9:16', portrait: '4:5', feed: '4:5', square: '1:1', insta: '1:1', youtube: '16:9', landscape: '16:9', wide: '16:9', widescreen: '16:9', cinema: '21:9', cinematic: '21:9', pinterest: '2:3', og: '1.91:1', card: '1.91:1', thumbnail: 'yt-thumb', thumb: 'yt-thumb', header: '3:1', banner: '4:1' };
  function parseFrame(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (WORDS[t]) return socialOf(WORDS[t]);
    const hit = socialOf(t);
    if (hit) return hit;
    const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:[:x×/]|by)\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const a = Number(m[1]); const b = Number(m[2]);
    if (!(a > 0 && b > 0)) return null;
    const known = SOCIAL.find((s) => Math.abs(s.w / s.h - a / b) < 0.002 && /^\d/.test(s.id));
    if (a >= 100 && b >= 100) return { id: `${a}x${b}`, label: `${a}×${b}`, w: Math.round(a), h: Math.round(b) };
    return known || { id: `${a}:${b}`, label: `${a}:${b}`, w: Math.round(1080 * Math.min(1, a / b) * (a / b >= 1 ? a / b : 1)), h: Math.round((1080 * Math.min(1, a / b) * (a / b >= 1 ? a / b : 1)) / (a / b)) };
  }

  // ---------- backgrounds for beautified shots (padding around the window picture) ----------
  // kind: linear (angle, stops), radial (stops), solid (stops[0]), blur (the picture itself, blurred), none (transparent)
  const BACKGROUNDS = [
    { id: 'forge', label: 'Forge ember', kind: 'linear', angle: 135, stops: ['#2a0f05', '#a8340f', '#ffb020'] },
    { id: 'molten', label: 'Molten', kind: 'radial', stops: ['#ffcf5a', '#ff6a1a', '#3a0a02'] },
    { id: 'gold', label: 'Gold leaf', kind: 'linear', angle: 120, stops: ['#5a3d0a', '#d9a520', '#fff1b8'] },
    { id: 'violet', label: 'AI violet', kind: 'linear', angle: 150, stops: ['#160a2e', '#5b2bd6', '#c08bff'] },
    { id: 'ice', label: 'Ice glass', kind: 'linear', angle: 160, stops: ['#0b2433', '#3aa7d9', '#d9f6ff'] },
    { id: 'midnight', label: 'Midnight', kind: 'linear', angle: 180, stops: ['#05070d', '#141a2e', '#2b3558'] },
    { id: 'aurora', label: 'Aurora', kind: 'linear', angle: 120, stops: ['#00111a', '#00a37a', '#7cffc4', '#5b2bd6'] },
    { id: 'sunset', label: 'Sunset', kind: 'linear', angle: 135, stops: ['#ff5f6d', '#ffc371'] },
    { id: 'peach', label: 'Peach', kind: 'linear', angle: 135, stops: ['#ffd1b3', '#ff9a8b'] },
    { id: 'ocean', label: 'Ocean', kind: 'linear', angle: 135, stops: ['#2193b0', '#6dd5ed'] },
    { id: 'lime', label: 'Lime soda', kind: 'linear', angle: 135, stops: ['#a8ff78', '#78ffd6'] },
    { id: 'candy', label: 'Candy', kind: 'linear', angle: 135, stops: ['#f857a6', '#ff5858'] },
    { id: 'grape', label: 'Grape', kind: 'linear', angle: 135, stops: ['#8e2de2', '#4a00e0'] },
    { id: 'royal', label: 'Royal', kind: 'linear', angle: 135, stops: ['#141e30', '#243b55'] },
    { id: 'mint', label: 'Mint', kind: 'linear', angle: 135, stops: ['#d4fc79', '#96e6a1'] },
    { id: 'rose', label: 'Rose gold', kind: 'linear', angle: 135, stops: ['#f4c4b4', '#b76e79'] },
    { id: 'neon', label: 'Neon night', kind: 'linear', angle: 135, stops: ['#0f0c29', '#302b63', '#ff00cc'] },
    { id: 'rainbow', label: 'Hearth rainbow', kind: 'linear', angle: 90, stops: ['#ff3b30', '#ffb020', '#ffe14d', '#34c759', '#3aa7d9', '#5b2bd6'] },
    { id: 'chrome', label: 'Chrome', kind: 'linear', angle: 180, stops: ['#f5f7fa', '#9aa3ad', '#e9edf1', '#5d6670'] },
    { id: 'paper', label: 'Paper', kind: 'solid', stops: ['#f4f1ea'] },
    { id: 'white', label: 'White', kind: 'solid', stops: ['#ffffff'] },
    { id: 'black', label: 'Black', kind: 'solid', stops: ['#000000'] },
    { id: 'charcoal', label: 'Charcoal', kind: 'solid', stops: ['#1c1d21'] },
    { id: 'studio', label: 'Studio grey', kind: 'radial', stops: ['#4a4d55', '#15161a'] },
    { id: 'spot', label: 'Spotlight', kind: 'radial', stops: ['#3a2a1a', '#000000'] },
    { id: 'blur', label: 'Its own colors, blurred', kind: 'blur' },
    { id: 'none', label: 'Transparent', kind: 'none' },
    { id: 'green', label: 'Green screen (key it out)', kind: 'solid', stops: ['#00b140'] },
    { id: 'blue', label: 'Blue screen (key it out)', kind: 'solid', stops: ['#0047bb'] },
    { id: 'sand', label: 'Sand dune', kind: 'linear', angle: 160, stops: ['#e6c79c', '#a9744f'] },
    { id: 'forest', label: 'Forest', kind: 'linear', angle: 160, stops: ['#0b3d2e', '#2f7d4f', '#9be15d'] },
    { id: 'cherry', label: 'Cherry', kind: 'linear', angle: 135, stops: ['#eb3349', '#f45c43'] },
    { id: 'steel', label: 'Steel', kind: 'linear', angle: 135, stops: ['#2c3e50', '#bdc3c7'] },
    { id: 'lavender', label: 'Lavender', kind: 'linear', angle: 135, stops: ['#e0c3fc', '#8ec5fc'] },
    { id: 'cyber', label: 'Cyber', kind: 'linear', angle: 135, stops: ['#00f5a0', '#00d9f5', '#7b2ff7'] },
    { id: 'dusk', label: 'Dusk', kind: 'linear', angle: 170, stops: ['#2c3e50', '#fd746c'] },
    { id: 'tropical', label: 'Tropical', kind: 'linear', angle: 135, stops: ['#11998e', '#38ef7d'] },
    { id: 'berry', label: 'Berry', kind: 'linear', angle: 135, stops: ['#8e2de2', '#ff6a88'] },
    { id: 'sky', label: 'Sky', kind: 'linear', angle: 180, stops: ['#2980b9', '#6dd5fa', '#ffffff'] },
    { id: 'coral', label: 'Coral', kind: 'linear', angle: 135, stops: ['#ff9966', '#ff5e62'] },
    { id: 'slate', label: 'Slate', kind: 'linear', angle: 160, stops: ['#232526', '#414345'] },
    { id: 'onyx', label: 'Onyx', kind: 'radial', stops: ['#2a2a2e', '#050506'] },
    { id: 'pearl', label: 'Pearl', kind: 'linear', angle: 135, stops: ['#fdfbfb', '#ebedee'] },
    { id: 'sakura', label: 'Sakura', kind: 'linear', angle: 135, stops: ['#fbd3e9', '#bb377d'] },
    { id: 'matrix', label: 'Matrix', kind: 'linear', angle: 180, stops: ['#000000', '#0f9b0f'] },
    { id: 'lagoon', label: 'Lagoon', kind: 'linear', angle: 135, stops: ['#43cea2', '#185a9d'] },
    { id: 'citrus', label: 'Citrus', kind: 'linear', angle: 135, stops: ['#fdc830', '#f37335'] },
    { id: 'plum', label: 'Plum', kind: 'linear', angle: 135, stops: ['#3a1c71', '#d76d77', '#ffaf7b'] },
    { id: 'arctic', label: 'Arctic', kind: 'linear', angle: 180, stops: ['#e0eafc', '#cfdef3'] },
    { id: 'copper', label: 'Copper', kind: 'linear', angle: 135, stops: ['#3d1f0d', '#b87333', '#f0c08a'] },
    { id: 'jade', label: 'Jade', kind: 'radial', stops: ['#3ddc97', '#0b3d2e'] },
    { id: 'noir', label: 'Noir', kind: 'linear', angle: 180, stops: ['#000000', '#434343'] },
    { id: 'velvet', label: 'Velvet', kind: 'radial', stops: ['#7b1e3a', '#200510'] },
    { id: 'solar', label: 'Solar flare', kind: 'radial', stops: ['#fff3b0', '#ff8c00', '#5a0f00'] },
    { id: 'nebula', label: 'Nebula (mesh)', kind: 'mesh', stops: ['#0b0620', '#5b2bd6', '#ff4fa3', '#22e0ff'] },
    { id: 'forge-mesh', label: 'Forge glow (mesh)', kind: 'mesh', stops: ['#120603', '#ff6a1a', '#ffc233', '#a8340f'] },
    { id: 'aurora-mesh', label: 'Aurora (mesh)', kind: 'mesh', stops: ['#00111a', '#00a37a', '#7cffc4', '#5b2bd6'] },
    { id: 'candy-mesh', label: 'Candy (mesh)', kind: 'mesh', stops: ['#fff0f6', '#ff9ac1', '#a0e7ff', '#ffe29a'] },
    { id: 'ocean-mesh', label: 'Deep ocean (mesh)', kind: 'mesh', stops: ['#020b1a', '#0a4d8c', '#22e0ff', '#123a5c'] },
  ];
  const CHROME = [
    { id: 'none', label: 'No window bar' },
    { id: 'mac', label: 'Mac window (traffic lights)' },
    { id: 'win', label: 'Windows title bar' },
    { id: 'minimal', label: 'Minimal bar (three dots)' },
    { id: 'browser', label: 'Browser with an address bar' },
    { id: 'phone', label: 'Phone bezel' },
  ];
  // beautify options (each also works alone: /beautify bg:aurora pad:l corners:24 shadow:strong bar:mac)
  const PADS = [{ id: 'none', label: 'No padding', pad: 0 }, { id: 's', label: 'Small', pad: 0.04 }, { id: 'm', label: 'Medium', pad: 0.08 }, { id: 'l', label: 'Large', pad: 0.12 }, { id: 'xl', label: 'Huge', pad: 0.18 }];
  const CORNERS = [{ id: '0', label: 'Square', radius: 0 }, { id: '8', label: 'Soft', radius: 8 }, { id: '14', label: 'Round', radius: 14 }, { id: '24', label: 'Rounder', radius: 24 }, { id: '40', label: 'Very round', radius: 40 }];
  const SHADOWS = [{ id: 'none', label: 'No shadow', shadow: 0 }, { id: 'soft', label: 'Soft', shadow: 0.3 }, { id: 'medium', label: 'Medium', shadow: 0.5 }, { id: 'strong', label: 'Strong', shadow: 0.7 }];
  // whole looks: background + padding (fraction of the picture's long side) + corner radius + shadow + chrome
  const BEAUTIFY = [
    { id: 'clean', label: 'Clean: white, soft shadow', bg: 'white', pad: 0.06, radius: 14, shadow: 0.35, chrome: 'none' },
    { id: 'forge', label: 'Forge: ember gradient, Mac window', bg: 'forge', pad: 0.08, radius: 14, shadow: 0.55, chrome: 'mac' },
    { id: 'violet', label: 'AI violet, Mac window', bg: 'violet', pad: 0.08, radius: 14, shadow: 0.55, chrome: 'mac' },
    { id: 'studio', label: 'Studio: dark, big shadow', bg: 'studio', pad: 0.1, radius: 12, shadow: 0.7, chrome: 'none' },
    { id: 'glass', label: 'Glass: its own colors blurred', bg: 'blur', pad: 0.07, radius: 16, shadow: 0.5, chrome: 'none' },
    { id: 'dribbble', label: 'Dribbble: peach, browser', bg: 'peach', pad: 0.09, radius: 12, shadow: 0.4, chrome: 'browser' },
    { id: 'launch', label: 'Launch day: sunset, Mac window', bg: 'sunset', pad: 0.09, radius: 14, shadow: 0.5, chrome: 'mac' },
    { id: 'minimal', label: 'Minimal: paper, thin bar', bg: 'paper', pad: 0.05, radius: 10, shadow: 0.25, chrome: 'minimal' },
    { id: 'night', label: 'Neon night, no bar', bg: 'neon', pad: 0.08, radius: 16, shadow: 0.6, chrome: 'none' },
    { id: 'aurora', label: 'Aurora, Windows bar', bg: 'aurora', pad: 0.08, radius: 10, shadow: 0.5, chrome: 'win' },
    { id: 'phone', label: 'Phone: bezel on a gradient', bg: 'ice', pad: 0.12, radius: 46, shadow: 0.55, chrome: 'phone' },
    { id: 'flat', label: 'Flat: no padding, rounded', bg: 'none', pad: 0, radius: 14, shadow: 0, chrome: 'none' },
    { id: 'keyable', label: 'Green screen, no shadow (for compositing)', bg: 'green', pad: 0.08, radius: 0, shadow: 0, chrome: 'none' },
    { id: 'rainbow', label: 'Hearth rainbow', bg: 'rainbow', pad: 0.08, radius: 14, shadow: 0.5, chrome: 'mac' },
    { id: 'chrome', label: 'Chrome metal', bg: 'chrome', pad: 0.08, radius: 14, shadow: 0.45, chrome: 'mac' },
  ];

  // ---------- annotation ----------
  const COLORS = [
    { id: 'ember', label: 'Ember', hex: '#ff6a1a' }, { id: 'gold', label: 'Gold', hex: '#ffc233' }, { id: 'red', label: 'Red', hex: '#ff3b30' },
    { id: 'violet', label: 'Violet', hex: '#9b6bff' }, { id: 'blue', label: 'Blue', hex: '#3aa7ff' }, { id: 'green', label: 'Green', hex: '#34c759' },
    { id: 'pink', label: 'Pink', hex: '#ff4fa3' }, { id: 'white', label: 'White', hex: '#ffffff' }, { id: 'black', label: 'Black', hex: '#111111' },
    { id: 'cyan', label: 'Cyan', hex: '#22e0ff' },
  ];
  const SIZES = [{ id: 's', label: 'Thin', px: 3 }, { id: 'm', label: 'Medium', px: 6 }, { id: 'l', label: 'Thick', px: 10 }, { id: 'xl', label: 'Extra thick', px: 16 }];
  // key: the letter that picks the tool in the annotation editor (registered with Keys)
  const TOOLS = [
    { id: 'move', key: 'V', label: 'Select / move' },
    { id: 'arrow', key: 'A', label: 'Arrow' },
    { id: 'line', key: 'L', label: 'Line' },
    { id: 'rect', key: 'R', label: 'Box' },
    { id: 'ellipse', key: 'O', label: 'Circle' },
    { id: 'pen', key: 'P', label: 'Pen' },
    { id: 'marker', key: 'H', label: 'Highlighter' },
    { id: 'text', key: 'T', label: 'Text' },
    { id: 'badge', key: 'N', label: 'Number badge (1, 2, 3…)' },
    { id: 'blur', key: 'B', label: 'Blur (hide private bits)' },
    { id: 'pixelate', key: 'X', label: 'Pixelate' },
    { id: 'redact', key: 'D', label: 'Redact (solid box)' },
    { id: 'spotlight', key: 'S', label: 'Spotlight (dim the rest)' },
    { id: 'magnify', key: 'M', label: 'Magnifier (loupe)' },
    { id: 'crop', key: 'C', label: 'Crop' },
  ];

  // ---------- recording ----------
  // mbps: video bitrate; size: 'native' (device pixels), '1080p', '720p', or a social id (cropped / scaled to it)
  const RECORD = [
    { id: 'quick', label: 'Quick: window, 30 fps, good quality', fps: 30, mbps: 8, size: 'native', audio: 'none' },
    { id: 'smooth', label: 'Smooth: 60 fps, high quality', fps: 60, mbps: 16, size: 'native', audio: 'none' },
    { id: 'promo', label: 'Promo: 60 fps, very high quality, MP4, clicks shown', fps: 60, mbps: 30, size: 'native', audio: 'app', cursor: 'ring', clicks: 'ring', mp4: true, clean: true },
    { id: 'reel', label: 'Reel: 9:16 1080×1920, 60 fps, MP4', fps: 60, mbps: 20, size: '9:16', audio: 'app', mp4: true, clean: true },
    { id: 'square', label: 'Square post: 1080×1080, 30 fps, MP4', fps: 30, mbps: 14, size: '1:1', audio: 'app', mp4: true, clean: true },
    { id: 'feed', label: 'Feed: 4:5 1080×1350, 30 fps, MP4', fps: 30, mbps: 14, size: '4:5', audio: 'app', mp4: true, clean: true },
    { id: 'youtube', label: 'YouTube: 1920×1080, 60 fps, MP4', fps: 60, mbps: 20, size: '1080p', audio: 'app', mp4: true, clean: true },
    { id: 'tutorial', label: 'Tutorial: cursor, clicks and keys shown, voice', fps: 30, mbps: 8, size: 'native', audio: 'app+mic', cursor: 'halo', clicks: 'ring', keys: true },
    { id: 'voice', label: 'Voice-over: your microphone only', fps: 30, mbps: 8, size: 'native', audio: 'mic' },
    { id: 'draft', label: 'Draft: small file, 24 fps', fps: 24, mbps: 3, size: '720p', audio: 'none' },
    { id: 'gif', label: 'GIF: 15 fps, 720p, makes a GIF when it stops', fps: 15, mbps: 4, size: '720p', audio: 'none', gif: true },
    { id: 'studio', label: 'Studio: zooms in on your clicks, 60 fps, MP4 (like a screen-studio take)', fps: 60, mbps: 24, size: 'native', audio: 'app', cursor: 'arrow', clicks: 'ring', autozoom: true, mp4: true, clean: true },
    { id: 'facecam', label: 'Facecam: your camera in a corner bubble, voice', fps: 30, mbps: 12, size: 'native', audio: 'app+mic', camera: 'br', mp4: true },
    { id: 'master', label: 'Master: 60 fps, near lossless (big files)', fps: 60, mbps: 50, size: 'native', audio: 'app' },
    { id: 'lab', label: 'Lab preview only, 60 fps', fps: 60, mbps: 20, size: 'native', audio: 'app', target: 'lab' },
    { id: 'chat', label: 'The chat only, 30 fps', fps: 30, mbps: 8, size: 'native', audio: 'none', target: 'chat' },
    { id: 'cinema', label: 'Cinematic 24 fps, 21:9', fps: 24, mbps: 16, size: '21:9', audio: 'app', mp4: true, clean: true },
  ];
  const QUALITY = [{ id: 'draft', label: 'Draft', mbps: 3 }, { id: 'good', label: 'Good', mbps: 8 }, { id: 'high', label: 'High', mbps: 16 }, { id: 'very', label: 'Very high', mbps: 30 }, { id: 'master', label: 'Master', mbps: 50 }];
  const FPS = [15, 24, 25, 30, 50, 60];
  const AUDIO = [
    { id: 'none', label: 'No sound' },
    { id: 'app', label: 'Hearth\'s own sound (the Lab\'s music, previews)' },
    { id: 'mic', label: 'Your microphone' },
    { id: 'app+mic', label: 'Hearth\'s sound + your microphone' },
    { id: 'system', label: 'The whole computer\'s sound (Windows only)' },
  ];
  const CURSORS = [
    { id: 'off', label: 'No cursor drawn' },
    { id: 'dot', label: 'Dot' },
    { id: 'ring', label: 'Ring' },
    { id: 'halo', label: 'Soft yellow halo' },
    { id: 'spotlight', label: 'Spotlight (dims around the cursor)' },
    { id: 'arrow', label: 'Big arrow' },
    { id: 'hand', label: 'Pointing hand' },
    { id: 'crosshair', label: 'Crosshair' },
    { id: 'glow', label: 'Violet glow' },
    { id: 'square', label: 'Square focus box' },
  ];
  const CLICKS = [{ id: 'off', label: 'No click effect' }, { id: 'ring', label: 'Ring ripple' }, { id: 'burst', label: 'Burst' }, { id: 'pulse', label: 'Soft pulse' }, { id: 'double', label: 'Double ring' }, { id: 'square', label: 'Square' }, { id: 'spark', label: 'Gold spark' }];
  const COUNTDOWN = [0, 3, 5, 10];
  // the camera bubble's corner (tutorials, facecam): off or a corner
  const CAMERA = [{ id: 'off', label: 'No camera' }, { id: 'br', label: 'Camera bottom right' }, { id: 'bl', label: 'Camera bottom left' }, { id: 'tr', label: 'Camera top right' }, { id: 'tl', label: 'Camera top left' }];
  const MAX_LENGTH = [0, 10, 15, 30, 60, 120, 300, 600];

  // ---------- tours: captions / titles / zooms ----------
  const CAPTIONS = [
    { id: 'lower', label: 'Lower third (left, bottom)' },
    { id: 'subtitle', label: 'Subtitle (centered, bottom)' },
    { id: 'top', label: 'Top banner' },
    { id: 'center', label: 'Big centered words' },
    { id: 'pill', label: 'Small pill (top right)' },
    { id: 'typewriter', label: 'Typewriter (letters appear)' },
    { id: 'kinetic', label: 'Kinetic (words pop in one by one)' },
    { id: 'neon', label: 'Neon sign' },
    { id: 'glass', label: 'Frosted glass card' },
    { id: 'tag', label: 'Gold tag (left)' },
    { id: 'quote', label: 'Quote (big quotation marks)' },
    { id: 'bubble', label: 'Chat bubble' },
    { id: 'label', label: 'Small caps label (top left)' },
    { id: 'outline', label: 'Huge outlined words' },
  ];
  const TITLES = [
    { id: 'forge', label: 'Forge: gold on ember' },
    { id: 'clean', label: 'Clean: white on black' },
    { id: 'glass', label: 'Glass over the app' },
    { id: 'rainbow', label: 'Hearth rainbow' },
    { id: 'neon', label: 'Neon on black' },
    { id: 'minimal', label: 'Minimal: small and calm' },
    { id: 'gradient', label: 'Violet gradient' },
    { id: 'split', label: 'Split: title left, subtitle right' },
    { id: 'chrome', label: 'Chrome letters' },
    { id: 'ember', label: 'Ember glow' },
    { id: 'paper', label: 'Paper and ink' },
    { id: 'mono', label: 'Monospace terminal' },
  ];
  const EASES = [
    { id: 'smooth', label: 'Smooth', css: 'cubic-bezier(.45,.05,.2,1)' },
    { id: 'snappy', label: 'Snappy', css: 'cubic-bezier(.2,.9,.25,1.15)' },
    { id: 'slow', label: 'Slow push', css: 'cubic-bezier(.33,0,.15,1)' },
    { id: 'linear', label: 'Linear', css: 'linear' },
  ];

  // ---------- frame reading ----------
  const READ_MODES = [
    { id: 'at', label: 'Exact frame at a time / frame / timecode', args: '<time | f120 | 00:00:01:12>' },
    { id: 'every', label: 'Every N frames', args: '<N>' },
    { id: 'spread', label: 'N frames spread evenly', args: '<N>' },
    { id: 'scenes', label: 'Scene changes (one frame per shot)', args: '[gentle|normal|sensitive|every]' },
    { id: 'sheet', label: 'Contact sheet with timecodes', args: '[layout]' },
    { id: 'motion', label: 'Motion energy curve (+ busiest moments)', args: '' },
    { id: 'pacing', label: 'Pacing: shots, average shot length, cuts per minute', args: '' },
    { id: 'palette', label: 'Palette of a frame (or across the video)', args: '[time]' },
    { id: 'light', label: 'Brightness and saturation over time', args: '' },
    { id: 'info', label: 'True fps, frame count, duration, size, codec', args: '' },
    { id: 'verify', label: 'Check the shown frame in the player matches (requestVideoFrameCallback)', args: '<frame>' },
    { id: 'diff', label: 'Difference between two frames', args: '<a> <b>' },
    { id: 'black', label: 'Black stretches (fades to black, gaps)', args: '' },
    { id: 'freeze', label: 'Frozen stretches (holds, still shots)', args: '' },
    { id: 'silence', label: 'Quiet stretches in the sound', args: '' },
    { id: 'loudness', label: 'Loudness (LUFS) for socials', args: '' },
    { id: 'keyframes', label: 'Keyframes (clean cut points)', args: '' },
    { id: 'letterbox', label: 'Black bars: the picture\'s real area', args: '' },
    { id: 'barcode', label: 'Color barcode (the color story in one picture)', args: '' },
    { id: 'waveform', label: 'Sound waveform picture', args: '' },
    { id: 'loop', label: 'Best seamless loop point', args: '[from]' },
    { id: 'vibe', label: 'Vibe card: palette, light, pacing, motion and key frames in one picture (a reference\'s feel, not its footage)', args: '' },
  ];
  // things made from a video (ffmpeg; the source is never changed)
  const EDITS = [
    { id: 'gif', label: 'GIF (15 fps, 720 px)', args: { fps: 15 } },
    { id: 'gif-small', op: 'gif', label: 'Small GIF (10 fps, 480 px)', args: { fps: 10, width: 480 } },
    { id: 'trim', label: 'Trim (frame-exact MP4)' },
    { id: 'speed2', op: 'speed', label: 'Timelapse 2×', args: { factor: 2 } },
    { id: 'speed4', op: 'speed', label: 'Timelapse 4×', args: { factor: 4 } },
    { id: 'speed8', op: 'speed', label: 'Timelapse 8× (silent)', args: { factor: 8 } },
    { id: 'slow', op: 'speed', label: 'Slow motion 0.5×', args: { factor: 0.5 } },
    { id: 'boomerang', label: 'Boomerang (forward + back)' },
    { id: 'sequence', label: 'PNG frames for After Effects' },
    { id: 'sequence-jpg', op: 'sequence', label: 'JPEG frames (smaller)', args: { format: 'jpg' } },
    { id: 'reels', op: 'reframe', label: 'Reframe to 9:16 (crop)', args: { w: 1080, h: 1920 } },
    { id: 'reels-fit', op: 'reframe', label: 'Reframe to 9:16 (fit on a blurred fill)', args: { w: 1080, h: 1920, fit: 'fit' } },
    { id: 'square', op: 'reframe', label: 'Reframe to 1:1', args: { w: 1080, h: 1080 } },
    { id: 'feed', op: 'reframe', label: 'Reframe to 4:5', args: { w: 1080, h: 1350 } },
    { id: 'wide', op: 'reframe', label: 'Reframe to 16:9 (fit)', args: { w: 1920, h: 1080, fit: 'fit' } },
    { id: 'mute', label: 'A copy without sound' },
    { id: 'audio', label: 'The sound only (m4a)' },
    { id: 'poster', label: 'Poster frame (PNG)' },
  ];
  const SENSITIVITY = [
    { id: 'gentle', label: 'Gentle: only hard cuts', threshold: 0.45 },
    { id: 'normal', label: 'Normal', threshold: 0.3 },
    { id: 'sensitive', label: 'Sensitive: soft cuts and flashes too', threshold: 0.18 },
    { id: 'every', label: 'Every change (fast motion counts)', threshold: 0.1 },
  ];
  const TC_STYLES = [
    { id: 'smpte', label: '00:00:01:12 (timecode)' },
    { id: 'ms', label: '0:01.500 (minutes:seconds.ms)' },
    { id: 'frames', label: 'f36 (frame number)' },
    { id: 's', label: '1.500s (seconds)' },
    { id: 'both', label: 'Timecode + frame number' },
  ];
  // cols × rows of cells (count = cols × rows unless `count`); label: where the timecode goes
  const SHEETS = [
    { id: '3x3', label: '3 × 3', cols: 3, rows: 3 },
    { id: '4x3', label: '4 × 3 (default)', cols: 4, rows: 3 },
    { id: '4x4', label: '4 × 4', cols: 4, rows: 4 },
    { id: '5x4', label: '5 × 4', cols: 5, rows: 4 },
    { id: '6x5', label: '6 × 5 (dense)', cols: 6, rows: 5 },
    { id: '8x6', label: '8 × 6 (very dense)', cols: 8, rows: 6 },
    { id: '2x2', label: '2 × 2 (big frames)', cols: 2, rows: 2 },
    { id: 'strip', label: 'Film strip (one row of 8)', cols: 8, rows: 1, film: true },
    { id: 'column', label: 'One column of 6 (for a phone)', cols: 1, rows: 6 },
    { id: 'story', label: 'Storyboard: 3 wide with notes space', cols: 3, rows: 3, notes: true },
    { id: 'portrait', label: 'Portrait 2 × 4 (fits 9:16)', cols: 2, rows: 4 },
    { id: 'wide', label: 'Wide 6 × 2 (fits 16:9)', cols: 6, rows: 2 },
    { id: 'scenes', label: 'One frame per shot (scene changes)', cols: 4, rows: 0, scenes: true },
    { id: 'polaroid', label: 'Polaroids (white frames, handwritten feel)', cols: 4, rows: 2, polaroid: true },
    { id: 'minimal', label: 'Minimal: no labels, tight', cols: 4, rows: 3, label: 'none', gap: 2 },
    { id: '3x4', label: '3 × 4 (portrait page)', cols: 3, rows: 4 },
    { id: '7x7', label: '7 × 7 (the whole video at a glance)', cols: 7, rows: 7 },
    { id: 'long-strip', label: 'Long strip (one row of 12)', cols: 12, rows: 1, film: true },
    { id: 'frames', label: 'With frame numbers instead of timecodes', cols: 4, rows: 3, label: 'frame' },
    { id: 'both', label: 'Timecode + frame number', cols: 4, rows: 3, label: 'both' },
  ];
  const SHEET_THEMES = [
    { id: 'dark', label: 'Dark', bg: '#0e0f12', fg: '#f3efe6', sub: '#9a978f' },
    { id: 'light', label: 'Light', bg: '#f4f1ea', fg: '#1c1b18', sub: '#6b6760' },
    { id: 'forge', label: 'Forge', bg: '#1a0d07', fg: '#ffc233', sub: '#ff8a3d' },
    { id: 'film', label: 'Film', bg: '#000000', fg: '#ffffff', sub: '#c8c8c8' },
    { id: 'violet', label: 'Violet', bg: '#120a24', fg: '#e6dbff', sub: '#9b6bff' },
    { id: 'blueprint', label: 'Blueprint', bg: '#0b2a4a', fg: '#dff1ff', sub: '#7fb8e6' },
    { id: 'paper', label: 'Paper', bg: '#efe8da', fg: '#2b2620', sub: '#8a7f6e' },
    { id: 'mint', label: 'Mint', bg: '#e8fff4', fg: '#0b3d2e', sub: '#2f7d4f' },
  ];

  // ---------- tours: scripted, repeatable recordings (capture-tour.js reads these) ----------
  // One step per line; "#" starts a comment. See TOUR_STEPS for every step.
  const TOUR_STEPS = [
    ['record [preset] [9:16] [60fps] [sound]', 'Start recording (the rest of the tour is filmed)'],
    ['stop', 'Stop recording (the file opens when the tour ends)'],
    ['open <three | ae | board | chat | claude | astra | tool id>', 'Show a tool or a chat'],
    ['wait <1.5s | 800ms>', 'Wait'],
    ['cmd </command args>', 'Run a chat command in the chat on screen'],
    ['type "<text>" [fast|slow]', 'Type into the chat box like a person'],
    ['send', 'Send what was typed'],
    ['click <selector | "Button text">', 'Glide the cursor there and click'],
    ['hover <selector | "text">', 'Glide the cursor there'],
    ['move <x> <y> [0.8s]', 'Glide the cursor to a point (pixels or 0..1 of the window)'],
    ['key <Ctrl+K>', 'Press keys (shown when the keys overlay is on)'],
    ['zoom <selector | x y> [1.6] [1s]', 'Zoom the view into something'],
    ['zoom out [1s]', 'Back to the whole window'],
    ['pan <x> <y> [1s]', 'Move the zoomed view'],
    ['caption "<text>" [2.5s] [lower|subtitle|top|center|pill|typewriter]', 'Words on screen'],
    ['title "<title>" ["subtitle"] [2s] [forge|clean|glass|rainbow]', 'A title card over the app'],
    ['highlight <selector | "text"> [2s]', 'Spotlight one thing'],
    ['scroll <selector> <pixels>', 'Scroll something smoothly'],
    ['shot [target] [9:16]', 'Take a screenshot'],
    ['mark "<label>"', 'A marker in the recording (shown in the viewer and Video Review)'],
    ['pause / resume', 'Pause / resume the recording'],
    ['cursor <dot|ring|halo|spotlight|arrow|off>', 'Cursor style while filming'],
    ['clean on|off', 'Hide toasts, menus and scrollbars'],
    ['theme <name>', 'Switch Hearth\'s look'],
    ['size <1920x1080>', 'Resize the window content exactly (restored after the tour)'],
    ['fade in|out [0.6s]', 'Fade the picture from / to black'],
    ['say "<text>"', 'A note in the chat (not sent)'],
    ['esc', 'Close menus and dialogs'],
    ['tilt <x°> [y°] [1s]', 'Tilt the whole app in 3D (camera move)'],
    ['spin <deg> [1s]', 'Rotate the view'],
    ['push <selector> [1.3] [3s]', 'A slow push in (Ken Burns)'],
    ['shake [strength] [0.4s]', 'Camera shake'],
    ['whip out|in [left|right] [0.35s]', 'Whip pan out (blurred) and back in, between scenes'],
    ['flash [white|gold|#hex] [0.25s]', 'A flash frame'],
    ['blur in|out [0.6s]', 'Focus pull from / to blur'],
    ['letterbox on|off [2.39]', 'Cinema bars'],
    ['vignette on|off', 'Darker corners'],
    ['grain on|off', 'Film grain over the picture'],
    ['watermark "<text>" [corner] | off', 'A small mark in a corner for the whole take'],
    ['timecode on|off', 'A running clock in the corner'],
    ['progress on|off', 'A thin bar showing the tour\'s progress'],
    ['confetti [count]', 'A burst of Hearth-colored confetti'],
    ['emoji "🔥" [x y]', 'A big emoji pop'],
    ['ease <smooth|snappy|slow|linear>', 'Easing for the next moves and zooms'],
    ['bpm <120>', 'Tempo for beat waits'],
    ['beat [n]', 'Wait n beats (sync a tour to music)'],
    ['drag <from> <to> [0.8s]', 'Press, glide and release (sliders, timelines)'],
    ['hide <selector> / show <selector>', 'Hide a part of the app for the take (back after the tour)'],
  ];
  const TOURS = [
    { id: 'hello', label: 'Hello Hearth (10 s)', steps: `# a short hello: title, the chat, a caption
record promo
fade in 0.6s
title "Hearth" "your AI studio" 2s forge
open claude
wait 0.6s
caption "Claude and Astra in one window" 2.2s lower
type "Make me a glowing particle intro" fast
wait 0.8s
fade out 0.6s
stop` },
    { id: 'intro', label: 'App intro for socials (≈30 s)', steps: `# the whole app in half a minute, hands-free
record promo
fade in 0.6s
title "Hearth" "one window for your AI agents" 2.2s forge
open claude
caption "Chats with Claude and Astra" 2s lower
hover ".composer textarea"
type "/help" fast
wait 1.2s
esc
open three
caption "The Three.js Lab: visuals you shape with sliders" 2.4s lower
zoom ".three-preview" 1.35 1.2s
wait 1.6s
zoom out 0.8s
cmd /size 9:16
caption "Social frame sizes in one command" 2s lower
wait 1.2s
cmd /size 16:9
open ae
caption "Video Review: frame-accurate notes" 2.2s lower
wait 1.5s
title "Hearth" "made with Claude and Astra" 2s forge
fade out 0.8s
stop` },
    { id: 'lab', label: 'Lab glow-up (≈15 s)', steps: `record smooth
open three
caption "Shuffle, save, repeat" 2s lower
zoom ".three-preview" 1.25 1s
cmd /shuffle
wait 1.4s
cmd /shuffle colors
wait 1.4s
zoom out 0.8s
stop` },
    { id: 'sizes', label: 'Frame sizes parade (≈12 s)', steps: `record smooth
open three
caption "9:16" 1s pill
cmd /size 9:16
wait 1.4s
caption "4:5" 1s pill
cmd /size 4:5
wait 1.4s
caption "1:1" 1s pill
cmd /size 1:1
wait 1.4s
caption "16:9" 1s pill
cmd /size 16:9
wait 1.4s
stop` },
    { id: 'commands', label: 'Chat commands showcase (≈15 s)', steps: `record promo
open claude
caption "Everything is a chat command" 2s lower
click ".composer textarea"
type "/" slow
wait 1.4s
key Escape
type "/help capture" fast
wait 0.6s
key Enter
wait 2s
stop` },
    { id: 'palette', label: 'Command bar (≈10 s)', steps: `record promo
key Ctrl+;
wait 0.6s
caption "Ctrl+; runs anything in plain words" 2.2s subtitle
type "make it 9 by 16" fast
wait 1.6s
esc
stop` },
    { id: 'looks', label: 'Looks parade (≈12 s)', steps: `record smooth
caption "Pick a look" 1.4s pill
theme forgeheart
wait 1.4s
theme midnight
wait 1.4s
theme forgeheart
wait 1s
stop` },
    { id: 'review', label: 'Video Review tour (≈12 s)', steps: `record promo
open ae
caption "Video Review" 1.6s lower
wait 1s
highlight ".tool-body" 1.6s
caption "Notes on exact frames, safe zones, exports" 2.2s lower
wait 1.5s
stop` },
    { id: 'shots', label: 'Screenshots of every tool (no recording)', steps: `open claude
wait 0.6s
shot tool
open three
wait 1.2s
shot tool
shot lab
open ae
wait 1s
shot tool` },
    { id: 'reel', label: 'Vertical reel of the Lab (9:16)', steps: `record reel lab
open three
wait 0.5s
cmd /shuffle
wait 2s
cmd /shuffle
wait 2s
stop` },
    { id: 'cinematic', label: 'Cinematic intro (bars, tilt, push, whip)', steps: `record promo
letterbox on
fade in 0.8s
title "Hearth" "the studio for your AI" 2s ember
tilt 8 -12 1.2s
open claude
caption "Talk to Claude and Astra" 2s lower
tilt 0 0 1s
whip out left 0.35s
open three
whip in 0.35s
push .three-preview 1.3 2.5s
caption "Visuals you shape by hand" 2s lower
zoom out 0.8s
flash gold 0.25s
title "Hearth" "" 1.5s chrome
fade out 0.8s
letterbox off
stop` },
    { id: 'beat', label: 'On the beat (120 BPM cuts)', steps: `# every cut lands on the beat: set the song's tempo with bpm
record promo
bpm 120
open claude
beat 2
flash white 0.15s
open three
beat 2
flash white 0.15s
open ae
beat 2
flash white 0.15s
open claude
beat 2
stop` },
    { id: 'kinetic', label: 'Kinetic words (text-led)', steps: `record promo
caption "One window" 1.2s kinetic
caption "Every AI" 1.2s kinetic
caption "Your rules" 1.2s kinetic
title "Hearth" "" 1.6s neon
stop` },
    { id: 'tutorial', label: 'Tutorial style (cursor, clicks, keys)', steps: `record tutorial
cursor halo ring
open claude
caption "Type / to see every command" 2s subtitle
click ".composer textarea"
type "/" slow
wait 1.2s
key Escape
caption "Ctrl+; runs them from anywhere" 2s subtitle
key Ctrl+;
wait 1s
esc
stop` },
    { id: 'zooms', label: 'Zoom showcase (UI details)', steps: `record smooth
open claude
ease snappy
zoom #rail 1.8 0.8s
wait 1s
pan 0 300 0.8s
wait 0.6s
zoom out 0.6s
ease smooth
zoom .composer 1.6 1s
wait 1s
zoom out 0.8s
stop` },
    { id: 'clean-ui', label: 'Clean UI shots of each screen (no rail)', steps: `hide #rail
hide #panel
open claude
wait 0.4s
shot window
open three
wait 1.2s
shot window
open ae
wait 0.8s
shot window
show #rail
show #panel` },
    { id: 'social-set', label: 'Screenshots in all four social sizes', steps: `open three
wait 1s
shot lab 9:16
shot lab 4:5
shot lab 1:1
shot lab 16:9` },
    { id: 'square-post', label: 'Square post (1:1) of the chats', steps: `record square
open claude
caption "Hearth" 1.6s center
wait 0.4s
open astra
wait 1.4s
stop` },
    { id: 'glitch', label: 'Glitchy transitions', steps: `record promo
open claude
shake 0.6 0.3s
flash #ff4fa3 0.12s
open three
blur in 0.4s
shake 0.4 0.25s
flash #22e0ff 0.12s
open ae
wait 0.8s
stop` },
    { id: 'watermarked', label: 'Watermarked walkthrough with a clock', steps: `record quick
watermark "made with Hearth" br
timecode on
progress on
open claude
wait 1s
open three
wait 1.5s
open ae
wait 1s
stop` },
    { id: 'celebrate', label: 'Celebration ending', steps: `record promo
open three
wait 0.6s
confetti 80
emoji "🔥"
title "Shipped" "made in Hearth" 1.8s rainbow
stop` },
  ];

  return { CAMERA, PADS, CORNERS, SHADOWS, EDITS, SOCIAL, socialOf, parseFrame, BACKGROUNDS, CHROME, BEAUTIFY, COLORS, SIZES, TOOLS, RECORD, QUALITY, FPS, AUDIO, CURSORS, CLICKS, COUNTDOWN, MAX_LENGTH, CAPTIONS, TITLES, EASES, READ_MODES, SENSITIVITY, TC_STYLES, SHEETS, SHEET_THEMES, TOUR_STEPS, TOURS };
})();
if (typeof module !== 'undefined') module.exports = CaptureData;
