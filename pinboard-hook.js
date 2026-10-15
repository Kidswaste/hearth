// Find images like this (round 30, pinboard stream): the ways in, loaded with the board. The finder itself
// (pinboard.js + pinboard-core.js, lazy group "pinboard") loads the first time one is used:
//   · the board's ⋯ menu and its right-click › "Find images like this…" (the board's vibe), the right-click on
//     selected references (their vibe), Add › "📌 Find images like this…"
//   · the ◎ mission "Find images for this vibe": your message is the vibe (or an aesthetic), with this chat's board
//   · the AIs with board tools: board_do pins {query?} → a short list, shown here as a picker card the owner confirms
//   · /find-images [pinterest|unsplash|arena|cosmos] [words] (the app's internal API; the buttons are the way in)
// Pinterest opens in the Hearth Chrome (the owner's Pinterest sign-in lives there) or in the board's own Pinterest
// window when the owner prefers it; Unsplash, Are.na and Cosmos open in their app windows. Hearth reads only the pictures
// on screen (a few modest scrolls at most), downloads only what the owner picks, and never handles a password.
const PinboardHook = (() => {
  const B = Board;
  async function ready() {
    if (typeof Lazy !== 'undefined') await Lazy.load('pinboard'); // (quick once it's in; reading the global first would load it anyway)
    if (!window.Pinboard) throw new Error('The image finder isn\'t available here');
    return window.Pinboard;
  }
  const open = (o = {}) => ready().then((P) => P.open(o)).catch((err) => { toast(`Find images didn't open: ${err.message}`, { type: 'error' }); return null; });

  // ---------- menus ----------
  const media = (i) => ['image', 'gif', 'video', 'web', 'palette', 'swatch'].includes(i.type);
  const baseBoard = B._.boardItems;
  B._.boardItems = () => [{ label: '📌 Find images like this…', hint: 'Pinterest and more, matched to this board', feature: 'Board › Find images', action: () => open({}) }, ...baseBoard()];
  const baseExtras = B._.itemExtras;
  B._.itemExtras = (list) => [...(baseExtras?.(list) || []), ...(list.some(media) ? [{ label: '📌 Find images like this…', hint: list.length > 1 ? `like these ${list.length}` : 'like this one', action: () => open({ itemIds: list.map((i) => i.id) }) }] : [])];
  const baseAdd = B._.addItems;
  B._.addItems = (p) => [...baseAdd(p), { label: '📌 Find images like this…', hint: 'matched to this board', action: () => open({}) }]; // (round 43, menucalm) its name in every menu

  // ---------- the ◎ mission ----------
  if (typeof Missions !== 'undefined' && Missions.add) {
    Missions.add({ id: 'find-images', more: true, icon: '📌', label: 'Find images for this vibe',
      desc: 'Your message is the vibe or the aesthetic ("rainy neon, 35mm, lonely"), with this chat\'s board. Pinterest opens in your Chrome; the pictures on screen show here to pick from; the ones you pick go on the board with their link. 0 tokens.',
      submit: (agentId, text) => { open({ words: text, chatId: H.activeChat?.[agentId] || null }); return true; } });
  }

  // ---------- the AIs' op (board_do pins, board-pack.js routes it here) ----------
  const OPS = { pins: (a, ctx) => ready().then((P) => P.op(a, ctx)).catch((err) => ({ ok: false, error: err.message })) };

  // ---------- the picker card in a reply ----------
  const live = new Map(); // chatId → [records] while a reply runs
  function card(rec) {
    const known = (typeof PinboardCore !== 'undefined' && rec.board === B.current()?.id) ? PinboardCore.knownFrom(B.items()) : null;
    const picked = new Set();
    const tiles = rec.pins.map((p, i) => {
      const done = known?.keys.has(p.key);
      const thumb = [p.thumb, p.image].find((u) => /^(https|data|file|blob):/i.test(String(u || ''))); // (plain http pictures are refused by Hearth's page)
      return el('button', { type: 'button', class: `pinb-ct${done ? ' done' : ''}`, title: `${p.title || 'Untitled'}${done ? ' · on the board' : ' · click to pick'}`, dataset: { i },
        on: { click: (e) => { if (done) return; const b = e.currentTarget; if (picked.has(i)) picked.delete(i); else picked.add(i); b.classList.toggle('on', picked.has(i)); paint(); } } },
      thumb ? el('img', { attrs: { referrerpolicy: 'no-referrer' }, loading: 'lazy', decoding: 'async', draggable: false, alt: '', src: thumb }) : null);
    });
    const add = el('button', { type: 'button', class: 'pinb-ca primary', text: 'Add the picked' });
    const node = el('div', { class: 'pinb-card' },
      el('div', { class: 'pinb-ch' }, `📌 ${rec.pins.length} images for `, el('b', { text: `“${rec.query}”` }), ` · ${rec.siteName || 'Pinterest'} → ${rec.boardName || 'the board'}`),
      el('div', { class: 'pinb-cs' }, tiles),
      el('div', { class: 'pinb-cf' }, add, el('button', { type: 'button', class: 'pinb-ca', text: 'Open the picker…', on: { click: () => open({ boardId: rec.board, preload: rec }) } })));
    function paint() { add.textContent = picked.size ? `Add ${picked.size} to ${rec.boardName || 'the board'}` : 'Pick the ones you want'; add.disabled = !picked.size; }
    add.addEventListener('click', async () => {
      const list = [...picked].map((i) => rec.pins[i]);
      add.disabled = true; add.textContent = 'Adding…';
      const P = await ready().catch(() => null);
      const n = P ? (await P.addPins(list, { boardId: rec.board, query: rec.query })).length : 0;
      for (const i of picked) tiles[i].classList.replace('on', 'done');
      picked.clear(); paint();
      if (n) add.textContent = `✓ ${n} added`;
    });
    paint();
    return node;
  }
  function show(chatId, rec) {
    if (!chatId || typeof Native === 'undefined') return false;
    const L = live.get(chatId) || []; L.push(rec); live.set(chatId, L.slice(-3));
    return Boolean(Native.liveCard?.(chatId, card(rec)));
  }
  if (typeof Native !== 'undefined' && Native.hooks) {
    Native.hooks.send.push((_agentId, chat) => live.delete(chat.id));
    Native.hooks.finish.push((_event, chat, extras) => { const L = live.get(chat.id); live.delete(chat.id); if (L?.length) extras.pinpick = L.map(({ board, boardName, query, site, siteName, pins }) => ({ board, boardName, query, site, siteName, pins: pins.map(({ key, image, thumb, link, title, site: s }) => ({ key, image, thumb, link, title, site: s })) })); });
    Native.hooks.message.push((node, m) => {
      if (m.role !== 'assistant' || !m.pinpick?.length) return;
      const strip = el('div', { class: 'pinb-strip' }, m.pinpick.map(card));
      const body = node.querySelector(':scope > .body');
      if (body) body.before(strip); else node.append(strip);
    });
  }

  // ---------- Are.na and Cosmos as app windows (Unsplash and Pinterest are there already) ----------
  function registerApps() {
    const A = window.Apps;
    if (!A?.register || typeof A.get !== 'function') return; // (the real registry only)
    const add = (d) => { try { if (!A.get?.(d.id)) A.register({ group: 'Assets', routes: { image: 'board' }, ...d }); } catch (err) { console.warn('pinboard app', err); } };
    add({ id: 'arena', name: 'Are.na', icon: '◼', url: 'https://www.are.na', desc: 'Visual research: find images like your board (board ⋯ › Find images like this…)', keywords: 'arena are.na inspiration research blocks moodboard' });
    add({ id: 'cosmos', name: 'Cosmos', icon: '✳', url: 'https://www.cosmos.so', desc: 'Inspiration: find images like your board (board ⋯ › Find images like this…)', keywords: 'cosmos inspiration moodboard aesthetic' });
  }
  if (typeof Lazy !== 'undefined' && Lazy.when) Lazy.when('apps', registerApps); else if (document.readyState === 'complete') setTimeout(registerApps, 500); else addEventListener('load', () => setTimeout(registerApps, 500), { once: true });

  // ---------- the command (the app's internal API) ----------
  const SITE_WORDS = ['pinterest', 'unsplash', 'arena', 'cosmos'];
  if (typeof Commands !== 'undefined' && !Commands.get('find-images')) {
    Commands.register({ name: 'find-images', aliases: Commands.get('images-like') ? [] : ['images-like'], area: 'Board', args: '[pinterest|unsplash|arena|cosmos] [vibe | aesthetic]',
      desc: 'Find images like the board\'s vibe (or your words) on Pinterest and more; pick the ones that go on the board',
      keywords: 'pinterest pins inspiration aesthetic unsplash are.na cosmos references moodboard', examples: ['/find-images', '/find-images dark academia', '/find-images unsplash foggy forest'],
      complete: (a) => { const w = String(a || '').toLowerCase(); return w.includes(' ') ? [] : [...SITE_WORDS, ...(typeof BoardPins !== 'undefined' ? Object.keys(BoardPins.AESTHETICS) : [])].filter((x) => x.startsWith(w)).slice(0, 16).map((value) => ({ value })); },
      run: (a, ctx) => {
        const words = String(a || '').trim(); const [first, ...rest] = words.split(/\s+/);
        const site = SITE_WORDS.includes(first?.toLowerCase()) ? first.toLowerCase() : null;
        open({ words: site ? rest.join(' ') : words, site, chatId: ctx?.chatId || null });
      } });
  }

  return { open, ready, OPS, card, show, registerApps, _: { live } };
})();
window.PinboardHook = PinboardHook;
