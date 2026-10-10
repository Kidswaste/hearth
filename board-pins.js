// Pinterest for the mood board (round 14): searches that match the board's vibe or an aesthetic (search phrases, color
// words, styles), made locally from the board (no tokens) or written by a chat (board_do pinterest); a click opens
// Pinterest's own search page in a Hearth window (boardpinsmain.js) where the owner, signed in to their own account
// there, adds pins with "＋ Board" (or drags them onto the board). The pin's picture lands on the board with the pin's
// link kept as the item's source. Nothing is scraped and no Pinterest API is called: Hearth only reads the pin the
// owner clicks. Registered as an app when the Apps registry exists (Apps.register), and always from chat commands:
// /board pinterest [vibe], /board-pinterest.
const BoardPins = (() => {
  const D = typeof BoardData !== 'undefined' ? BoardData : require('./board-data.js');
  // aesthetics people search for, with the phrases that find them (the word alone is often too broad)
  const AESTHETICS = {
    y2k: ['y2k chrome aesthetic', 'y2k cyber graphic design'], vaporwave: ['vaporwave aesthetic', 'vaporwave pastel neon'], synthwave: ['synthwave retro sunset', 'outrun neon grid'],
    cyberpunk: ['cyberpunk neon city night', 'cyberpunk street photography'], noir: ['neo noir cinematography', 'film noir lighting'], 'dark academia': ['dark academia aesthetic', 'dark academia library'],
    cottagecore: ['cottagecore aesthetic', 'cottagecore soft light'], brutalist: ['brutalist graphic design', 'brutalist architecture photography'], swiss: ['swiss design poster', 'international typographic style'],
    bauhaus: ['bauhaus poster design', 'bauhaus shapes color'], minimal: ['minimal graphic design', 'minimalist photography negative space'], japandi: ['japandi interior', 'wabi sabi aesthetic'],
    memphis: ['memphis design pattern', 'memphis 80s graphic'], grunge: ['grunge texture aesthetic', '90s grunge photography'], 'film': ['35mm film photography', 'film grain portrait'],
    retro: ['retro 70s graphic design', 'vintage color palette'], kinetic: ['kinetic typography', 'motion design frames'], chrome: ['chrome 3d render', 'liquid chrome typography'],
    glitch: ['glitch art aesthetic', 'datamosh still'], 'wes anderson': ['wes anderson color palette', 'symmetrical pastel cinematography'], ethereal: ['ethereal dreamy photography', 'soft glow haze portrait'],
    acid: ['acid graphics design', 'acid y2k poster'], editorial: ['editorial fashion photography', 'editorial layout design'], anime: ['anime background art', 'anime lighting aesthetic'],
  };
  const clean = (p) => String(p || '').replace(/[^\p{L}\p{N}#&'\s-]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  // the board's vibe (BoardVibe.summary) + words → up to 6 searches, color words and style words
  function suggest(s = {}, { words = '', brief = '', max = 6 } = {}) {
    const out = [];
    const add = (p) => { const c = clean(p); if (c && c.split(' ').length <= 7 && !out.includes(c)) out.push(c); };
    const kinds = s.byKind || {};
    const clips = (kinds.clip || 0) + (kinds.gif || 0); const pics = kinds.picture || 0; const sites = kinds.site || 0;
    const subject = clips > pics && clips >= sites ? 'cinematography' : sites > pics ? 'web design' : (s.fonts || []).length && !pics ? 'typography' : 'photography';
    const colors = [...new Set((s.palette || []).slice(0, 4).map((c) => D.colorName(c.hex)).filter((n) => n && n !== 'gray'))].slice(0, 3);
    const light = s.light == null ? '' : s.light < 0.35 ? 'low key' : s.light > 0.65 ? 'high key' : '';
    const temp = s.warmth == null ? '' : s.warmth > 0.15 ? 'warm' : s.warmth < -0.1 ? 'cold' : '';
    const styles = [];
    if (s.grain > 0.4) styles.push('film grain'); if (s.edges != null && s.edges < 0.15) styles.push('minimal'); if (s.contrast > 0.6) styles.push('high contrast');
    if (s.sat != null && s.sat < 0.2) styles.push('monochrome'); if (s.sat > 0.6) styles.push('vivid'); if (s.motion > 0.4) styles.push('dynamic motion'); if (s.motion != null && s.motion < 0.15) styles.push('still');
    // the owner's words first (and the known aesthetic's best searches), then the board's own vibe, interleaved
    const w = clean(words);
    const fromWords = []; const fromBoard = [];
    if (w) {
      const known = Object.keys(AESTHETICS).find((k) => w.includes(k));
      fromWords.push(/aesthetic|design|photography|art|poster|cinematography/.test(w) ? w : `${w} aesthetic`);
      if (known) fromWords.push(...AESTHETICS[known]);
      const hue = colors.find((c) => !/black|white/.test(c));
      fromWords.push(hue ? `${w} ${hue}` : `${w} ${subject}`);
    }
    const moods = (s.moods || []).filter((m) => !/cuts|takes/.test(m));
    if (moods.length) fromBoard.push(`${moods.slice(0, 2).join(' ')} ${subject}`);
    if (colors.length >= 2) fromBoard.push(`${colors[0]} and ${colors[1]} aesthetic`); else if (colors[0]) fromBoard.push(`${colors[0]} aesthetic`);
    if (light || temp) fromBoard.push(`${light} ${temp} light ${subject}`);
    if (styles.length) fromBoard.push(`${styles.slice(0, 2).join(' ')} ${subject}`);
    if ((s.tags || []).length) fromBoard.push(`${s.tags.slice(0, 2).join(' ')} aesthetic`);
    if ((s.fonts || [])[0]) fromBoard.push(`${s.fonts[0]} typography poster`);
    if (brief) fromBoard.push(`${clean(brief).split(' ').slice(0, 4).join(' ')} ${subject}`);
    const head = w ? fromWords.slice(0, Math.max(2, max - Math.min(3, fromBoard.length))) : [];
    for (const p of [...head, ...fromBoard, ...fromWords]) add(p);
    if (!out.length) add('moodboard aesthetic inspiration');
    return { phrases: out.slice(0, max), colors, styles: [...new Set([light, temp, ...styles, ...moods.slice(0, 3)].filter(Boolean))], subject };
  }
  if (typeof window === 'undefined') return { suggest, AESTHETICS, clean };

  const B = Board; const V = BoardVibe;
  let added = 0; let lastDrag = null;
  const freeSpot = (b) => { const bb = BoardLayout.bbox(b.items); return b.items.length ? { x: bb.x + bb.w + 80, y: bb.y } : { x: 0, y: 0 }; };
  const api = () => window.hub?.board?.pins;
  async function forBoard(b, words = '') {
    const items = b.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
    return suggest(V.summary(items), { words, brief: b.brief || '' });
  }
  // the window, at a search (empty = Pinterest's home: sign in, browse)
  async function open(query = '') {
    if (!api()) { toast('The Pinterest window needs the desktop app', { type: 'error' }); return null; }
    await B.ready();
    const r = await api()('open', { query: String(query || ''), base: B.prefs().pinBase || null, board: B.current().name });
    api()('status', { board: B.current().name, added });
    return r;
  }
  // a pin the owner added in the window: its picture on the board, its pin link kept as the source
  async function addPin(pin) {
    await B.ready();
    const b = B.current();
    const at = B.isMounted() && B.visible() ? null : freeSpot(b);
    let it = null;
    try {
      if (/^data:image\//.test(pin.image)) {
        const [meta, data] = pin.image.split(',');
        const p = await window.hub.board.save(`pin.${/png/.test(meta) ? 'png' : /gif/.test(meta) ? 'gif' : 'jpg'}`, data);
        it = (await B.addFiles([p], at))[0];
      } else it = await B.addUrl(pin.image, at);
    } catch (err) { toast(`Couldn't add the pin: ${err.message}`, { type: 'error' }); return null; }
    if (!it) return null;
    B.patch([it.id], (x) => { if (pin.title) x.title = pin.title.slice(0, 80); if (pin.link) x.source = pin.link; x.credit = 'Pinterest'; x.tags = [...new Set([...(x.tags || []), 'pinterest'])]; }, 'add pin');
    added++;
    api()?.('status', { board: b.name, added });
    toast(`📌 Pin added to ${b.name}`, { timeout: 1600 });
    document.dispatchEvent(new CustomEvent('hearth:board-pin', { detail: { id: it.id, board: b.id, pin } }));
    return it;
  }
  // a pin dragged out of the window and dropped on the board: the new picture gets the pin's link too
  let patching = false;
  B.onChange((what) => {
    if (what !== 'items' || patching || !lastDrag || Date.now() - lastDrag.at > 90000) return;
    const name = decodeURIComponent(String(lastDrag.image).split(/[?#]/)[0].split('/').pop() || '');
    const fresh = (i) => Date.now() - (i.added || 0) < 90000;
    const it = B.items().find((i) => !i.source && fresh(i) && (i.url === lastDrag.image || (i.url && lastDrag.image && i.url.split('?')[0] === lastDrag.image.split('?')[0]) || (name && i.file === name)));
    if (!it) return;
    patching = true;
    try { B.patch([it.id], (x) => { x.source = lastDrag.link || undefined; x.credit = 'Pinterest'; if (lastDrag.title && !x.title?.length) x.title = lastDrag.title; x.tags = [...new Set([...(x.tags || []), 'pinterest'])]; }, 'pin source'); } finally { patching = false; }
    lastDrag = null; added++; api()?.('status', { board: B.current().name, added });
  });
  window.hub?.board?.onPin?.((pin) => addPin(pin));
  const noteDrag = (pin) => { lastDrag = { ...pin, at: Date.now() }; };
  window.hub?.board?.onPinDrag?.(noteDrag);

  // the chat side: board_do pinterest (the searches become buttons in the chat, board-eyes-ui.js draws them)
  async function op(a = {}, ctx = {}) {
    await B.ready();
    const b = ctx.chatId ? await B.boardFor(ctx.chatId) : B.current();
    const given = [].concat(a.phrases || []).map(clean).filter(Boolean).slice(0, 6);
    const s = given.length ? { phrases: given, colors: [], styles: [] } : await forBoard(b, a.aesthetic || a.query || '');
    return { ok: true, value: { searches: s.phrases, ...(s.colors.length ? { colors: s.colors } : {}), ...(s.styles.length ? { styles: s.styles } : {}), shown: 'as buttons in this chat: a click opens Pinterest in a Hearth window, where the owner adds pins to the board (pin link kept)' }, eyes: { board: b.id, boardName: b.name, pins: s.phrases, items: [], pictures: 0, tokens: 0 } };
  }

  // the app (when the Apps registry of the apps stream is there)
  let appDone = false;
  function registerApp() {
    const A = typeof Apps !== 'undefined' ? Apps : window.Apps;
    if (appDone || !A?.register) return;
    // the apps stream's Pinterest is a stand-in (fallback): this window (＋ Board on each pin) replaces it
    try { const had = A.get?.('pinterest') || A.list?.()?.find?.((x) => x.id === 'pinterest'); if (had && !had.fallback) { appDone = true; return; } } catch { /* an older registry */ }
    appDone = true;
    try {
      A.register({ id: 'pinterest', name: 'Pinterest', icon: '📌', group: 'Assets', keywords: 'inspiration moodboard aesthetic pins', url: 'https://www.pinterest.com',
        open: () => open(''), describe: () => 'Pinterest in its own window, signed in to your account: ＋ Board on a pin adds it to your mood board (its link kept). /board pinterest <vibe> suggests searches from your board.',
        commands: ['board-pinterest'] });
    } catch (err) { console.warn('Pinterest app', err); }
  }
  addEventListener('load', () => setTimeout(registerApp, 400));

  return { suggest, forBoard, open, addPin, op, registerApp, noteDrag, AESTHETICS, clean, OPS: { pinterest: op }, _: { get added() { return added; }, get lastDrag() { return lastDrag; } } };
})();
if (typeof module !== 'undefined') module.exports = BoardPins;
