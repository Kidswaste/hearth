// More apps (round 14, apps stream): the services the owner would use around Hearth, each light — a window in its
// own session, where its downloads go, and one or two actions in its window's ⋯ menu (also /apps <app> <action>).
// Free assets flow straight in instead of being one more window: Poly Haven's free HDRIs and textures through its
// public API (/polyhaven, no account, CC0), Coolors palettes into the Lab or onto the board, Unsplash / Pinterest
// pages onto the board, Sketchfab / Spline / Mixamo models into the Lab, Suno / ElevenLabs sounds as the Lab's song,
// Runway clips onto the board. Social pages (YouTube Studio, Instagram, TikTok) get "show my newest render" to
// upload it. Meshy and Suno have their own files (apps-meshy.js, apps-suno.js); Pinterest here is a stand-in the
// board stream's own registration replaces.
(() => {
  const C = AppsCore;
  const lab = async () => ThreeLab.cmd();
  async function paletteToLab({ url }) {
    const cols = C.palette(url);
    if (cols.length < 2) throw new Error('No palette in this page\'s address: open a palette (coolors.co/…-…-…) first.');
    const cmd = await lab();
    cmd.palette(cols.join(' '));
    toast(`Lab palette: ${cols.join(' ')}`, { timeout: 3000 });
    return `The Lab's palette is now ${cols.join(' ')}.`;
  }
  async function paletteToBoard({ url }) {
    const cols = C.palette(url);
    if (cols.length < 2) throw new Error('No palette in this page\'s address.');
    await Board.ready();
    Board.addSwatch(cols, null, { title: 'Coolors palette' });
    activate('tool:board');
    return `On the board: ${cols.join(' ')}`;
  }
  async function pageToBoard({ url }) {
    if (!/^https?:/i.test(url || '')) throw new Error('No page open');
    const it = await Board.addUrl(url);
    activate('tool:board');
    return it ? 'On the board.' : 'The board didn\'t take it.';
  }
  async function newestRender() {
    const done = (typeof Renders !== 'undefined' ? Renders.list?.() || [] : []).filter((j) => j.status === 'done' && j.output);
    const p = done.sort((a, b) => (b.ended || b.at || 0) - (a.ended || a.at || 0))[0]?.output;
    if (!p) throw new Error('No finished render yet (/renders).');
    window.hub.fs.reveal(p);
    await copyText(p, 'Path copied: drop the file into the upload box');
    return `Your newest render: ${p}`;
  }
  const fontToChat = ({ url }) => {
    const m = String(url || '').match(/specimen\/([^/?#]+)/);
    const name = m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : '';
    if (!name) throw new Error('Open a font\'s page first (fonts.google.com/specimen/…)');
    const ag = Apps.chatAgent();
    activate(ag.id);
    Native.setDraft(ag.id, `Use the Google font "${name}" (https://fonts.google.com/specimen/${encodeURIComponent(name).replace(/%20/g, '+')}) for the titles: `);
    return `“${name}” is in the chat's composer.`;
  };
  const SOCIAL = [{ id: 'render', label: '📂 Show my newest render (to upload it)', run: newestRender }];

  const APPS = [
    { id: 'figma', name: 'Figma', icon: '◈', group: 'Design', url: 'https://www.figma.com/files', desc: 'Design files and prototypes', routes: { image: 'board' }, actions: [{ id: 'board', label: '▦ Put this file\'s link on the board', run: pageToBoard }] },
    { id: 'spline', name: 'Spline', icon: '◍', group: '3D', url: 'https://app.spline.design', desc: '3D design in the browser; exported GLBs load into the Lab', routes: { model: 'lab-model' } },
    { id: 'sketchfab', name: 'Sketchfab', icon: '⬡', group: '3D', url: 'https://sketchfab.com/search?features=downloadable&type=models', desc: 'Free downloadable 3D models (pick glTF / GLB): straight into the Lab', routes: { model: 'lab-model' }, keywords: 'free 3d models download glb' },
    { id: 'mixamo', name: 'Mixamo', icon: '🕺', group: '3D', url: 'https://www.mixamo.com', desc: 'Rig and animate a character (a Meshy model too)', routes: { model: 'lab-ref' }, keywords: 'animation rig character fbx' },
    { id: 'polyhaven', name: 'Poly Haven', icon: '🌅', group: 'Assets', url: 'https://polyhaven.com/hdris', desc: 'Free HDRI skies and textures (CC0): /polyhaven puts one in the Lab', routes: { hdri: 'lab-hdri', image: 'lab-ref', model: 'lab-model' }, keywords: 'hdri sky environment texture free cc0',
      actions: [{ id: 'search', label: '🔎 Find a sky for the Lab…', run: () => Commands.exec('/polyhaven', Apps.chatAgent()?.id) }] },
    { id: 'unsplash', name: 'Unsplash', icon: '📷', group: 'Assets', url: 'https://unsplash.com', desc: 'Free photos for the board', routes: { image: 'board' }, actions: [{ id: 'board', label: '▦ Put this photo page on the board', run: pageToBoard }] },
    { id: 'coolors', name: 'Coolors', icon: '🎨', group: 'Design', url: 'https://coolors.co/generate', desc: 'Palettes: one click into the Lab or onto the board', keywords: 'palette colors colours',
      actions: [{ id: 'palette', label: '🎨 Use this palette in the Lab', run: paletteToLab }, { id: 'board', label: '▦ Put this palette on the board', run: paletteToBoard }] },
    { id: 'fonts', name: 'Google Fonts', icon: '🔤', group: 'Design', url: 'https://fonts.google.com', desc: 'Fonts: send one to the chat, downloads go to the Lab\'s references', routes: { font: 'lab-ref' }, keywords: 'type typography font', actions: [{ id: 'font', label: '🔤 Use this font (tell the chat)', run: fontToChat }] },
    { id: 'runway', name: 'Runway', icon: '🎞', group: 'Make', url: 'https://app.runwayml.com', desc: 'AI video: clips you download go on the board', routes: { video: 'board', image: 'board' }, keywords: 'ai video gen' },
    { id: 'elevenlabs', name: 'ElevenLabs', icon: '🗣', group: 'Sound', url: 'https://elevenlabs.io/app', desc: 'Voices and sound effects: downloads become the Lab\'s sound', routes: { audio: 'lab-song' }, keywords: 'voice over tts sfx sound effects' },
    { id: 'youtube', name: 'YouTube Studio', icon: '▶', group: 'Social', url: 'https://studio.youtube.com', desc: 'Upload and check your videos', actions: SOCIAL, keywords: 'upload shorts' },
    { id: 'instagram', name: 'Instagram', icon: '◎', group: 'Social', url: 'https://www.instagram.com', desc: 'Post reels and check your profile', actions: SOCIAL, keywords: 'reels upload' },
    { id: 'tiktok', name: 'TikTok Studio', icon: '♪', group: 'Social', url: 'https://www.tiktok.com/tiktokstudio/upload', desc: 'Upload and check your TikToks', actions: SOCIAL, hosts: ['tiktok.com'], keywords: 'upload' },
    { id: 'pinterest', name: 'Pinterest', icon: '📌', group: 'Assets', url: 'https://www.pinterest.com', desc: 'Inspiration: pins onto the board', routes: { image: 'board' }, fallback: true, actions: [{ id: 'board', label: '▦ Put this pin on the board', run: pageToBoard }], keywords: 'inspiration moodboard' },
  ];
  for (const a of APPS) Apps.register(a);

  // ---------- Poly Haven: free HDRIs and textures (public API, no account) ----------
  let polyBase = null;
  async function base() { polyBase ||= (await window.hub.apps.status())?.polyBase || 'https://api.polyhaven.com'; return polyBase; }
  async function json(u) { const r = await window.hub.apps.fetchJson(u); if (!r?.ok) throw new Error(`Poly Haven didn't answer (${r?.error || 'offline?'})`); return r.value; }
  const thumbOf = (id, a) => a.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=256&height=256`;
  async function search(q = '', type = 'hdris') {
    const all = await json(`${await base()}/assets?t=${type}`);
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return Object.entries(all).map(([id, a]) => ({ id, ...a }))
      .filter((a) => !words.length || words.every((w) => `${a.id} ${a.name} ${(a.tags || []).join(' ')} ${(a.categories || []).join(' ')}`.toLowerCase().includes(w)))
      .sort((a, b) => (b.download_count || 0) - (a.download_count || 0)).slice(0, 30);
  }
  async function fetchAsset(id, type = 'hdris', res = '1k') {
    const files = await json(`${await base()}/files/${encodeURIComponent(id)}`);
    let url; let name;
    if (type === 'hdris') { const f = files.hdri?.[res] || files.hdri?.['1k'] || Object.values(files.hdri || {})[0]; url = f?.hdr?.url || f?.exr?.url; name = `${id}_${res}.${f?.hdr ? 'hdr' : 'exr'}`; }
    else { const d = files.Diffuse || files.diffuse || files.Color || Object.values(files)[0]; const f = d?.[res] || d?.['1k'] || Object.values(d || {})[0]; url = f?.jpg?.url || f?.png?.url; name = `${id}_diffuse_${res}.${f?.jpg ? 'jpg' : 'png'}`; }
    if (!url) throw new Error(`No ${res} file for ${id}`);
    const r = await window.hub.apps.fetchTo({ url, appId: 'polyhaven', appName: 'Poly Haven', name });
    if (!r?.ok) throw new Error(r?.error || 'Download failed');
    return r.path;
  }
  async function polyDialog(q, type) {
    const list = await search(q, type);
    const hd = type === 'hdris';
    return Apps.grid({
      title: `🌅 Poly Haven ${hd ? 'skies' : 'textures'}${q ? ` · ${q}` : ''}`,
      empty: `Nothing for “${q}”. Try sunset, studio, night, forest, interior…`,
      items: list.map((a) => ({
        title: a.name || a.id, sub: (a.categories || []).slice(0, 3).join(' · '), thumb: thumbOf(a.id, a), icon: '🌅',
        actions: hd
          ? [{ label: '◭ Sky in the Lab', primary: true, run: async () => Apps.route(await fetchAsset(a.id, 'hdris', '1k'), 'lab-hdri', { name: a.name }) }, { label: '2K', hint: 'Sharper, bigger file', run: async () => Apps.route(await fetchAsset(a.id, 'hdris', '2k'), 'lab-hdri', { name: a.name }) }]
          : [{ label: '◭ Lab reference', primary: true, run: async () => Apps.route(await fetchAsset(a.id, 'textures', '1k'), 'lab-ref') }, { label: '▦ Board', run: async () => Apps.route(await fetchAsset(a.id, 'textures', '1k'), 'board') }],
      })),
    });
  }
  addEventListener('DOMContentLoaded', () => {
    if (typeof Commands === 'undefined' || Commands.get('polyhaven')) return;
    Commands.register({
      name: 'polyhaven', aliases: ['hdri'], area: 'Apps', args: '[words] [textures] | get <id> [2k]',
      desc: 'Free HDRI skies (and textures) from Poly Haven, straight into the Lab: no account, CC0',
      keywords: 'hdri sky environment lighting backdrop texture free',
      examples: ['/polyhaven sunset', '/polyhaven studio', '/polyhaven brick textures', '/hdri get kloppenheim_06'],
      run: async (args) => {
        const s = String(args || '').trim();
        const g = s.match(/^get\s+([\w-]+)(?:\s+(1k|2k|4k))?/i);
        if (g) { const p = await fetchAsset(g[1], 'hdris', (g[2] || '1k').toLowerCase()); await Apps.route(p, 'lab-hdri', { name: g[1] }); return `🌅 ${g[1]} is the Lab's sky.`; }
        const tex = /\btextures?\b/i.test(s);
        await polyDialog(s.replace(/\btextures?\b/ig, '').trim(), tex ? 'textures' : 'hdris');
        return null;
      },
    });
  });
  window.AppsPoly = { search, fetchAsset, dialog: polyDialog };
})();
