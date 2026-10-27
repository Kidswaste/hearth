// Find images like this (round 30, pinboard), end to end with a real Chromium standing in for Google Chrome
// (Playwright's, launched "as Chrome" in the throwaway profile) and local pages standing in for the sites
// (dev/fake-cdp.js pages(): a Pinterest-like search, an Unsplash-like search, a sign-in page, their pictures):
//  1. the ways in: board ⋯ and right-click › Find images like this…, Add › 📌 Find images like this…, the ◎ mission, /find-images
//  2. board ⋯ › Find images like this… → Pinterest opens in the Hearth Chrome, the pictures on screen show in the picker
//     (no logo / avatar / ad / shopping link, each picture once), three picked → on the board, saved locally, with their
//     pin link, credit and title; searching again leaves them out ("already on your board"); More = one more screen
//  3. Pinterest "inside Hearth" (the board's Pinterest window), Unsplash in its app window, a sign-in page (noticed only)
//  4. the AIs: board_do pins → a short numbered list, the picker with those; the picker card adds what's ticked
//  5. (regression, the owner's screenshot) while it looks, the picker isn't turned into the chat list's 7 px rotated
//     .busy dot (a tilted see-through collage over the rail); nothing from the picker stays outside the board after
//     closing; a picture with no title gets a readable caption (the search words + n), never its file's hash name
//   node dev/smoke.js --pw-chrome --wait 6000 --check-timeout 240000 --script dev/checks/pinboard.js --shot /tmp/pinboard.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(200); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await Lazy.load('board');
  await Board.ready();
  const st = await window.hub.chrome.status({ fresh: true });
  const base = st.testBase;
  step(Boolean(st.found && base) && typeof PinboardHook !== 'undefined' && typeof PinboardCore !== 'undefined', 'the board loads with the ways in; Chrome (the stand-in) and the test pages are up', st.found?.name);
  store.set('pinboard.bases', { pinterest: `${base}/pinboard/search/pins/?q={q}`, unsplash: `${base}/pinboard/s/photos/{q-}` });
  activate('tool:board');
  await wait(600);
  const B = Board;
  const n0 = B.items().length;

  // 1. the ways in
  // (round 35, bugbash2) since round 31 the ⋯ menus open with "✦ What can I do here?" (quickstart-hooks.js): the finder
  // is the first of the board's own rows, right after it
  const rows = B._.boardItems().filter((x) => x && typeof x === 'object' && !/What can I do here/.test(x.label || ''));
  const top = rows[0];
  step(/Find images like this/.test(top?.label || ''), 'board ⋯ (and right-click › Board) starts with "Find images like this…"', top?.label);
  step(B._.addItems({ x: 0, y: 0 }).some((x) => /^📌 Find images like this…/.test(x?.label || '')), 'Add › 📌 Find images like this… (round 43: one name in every menu)');
  const m = Missions.LIST.find((x) => x.id === 'find-images');
  step(Boolean(m?.submit) && /Find images for this vibe/.test(m.label), 'the ◎ mission "Find images for this vibe"');
  step(Boolean(Commands.get('find-images')), '/find-images (the internal API)');
  const lz = () => Lazy.state().find((g) => g.name === 'pinboard')?.state;
  step(lz() === 'stub', 'the finder itself isn\'t loaded until it\'s used', lz());

  // 2. board ⋯ › Find images like this… → Pinterest in the Hearth Chrome
  const root = document.documentElement; const skin0 = root.dataset.skin;
  root.dataset.skin = `${skin0 || ''} forge`.trim(); // (the owner's skin: there the chat list's .busy dot is turned 45°)
  top.action();
  const busyWrap = await until(() => lz() === 'loaded' && Pinboard.ui?.st.busy && document.querySelector('.pinb-wrap'), 15000);
  const bw = busyWrap?.getBoundingClientRect(); const bcs = busyWrap && getComputedStyle(busyWrap);
  step(Boolean(busyWrap) && Math.round(bw.width) === innerWidth && Math.round(bw.height) === innerHeight && bcs.transform === 'none' && bcs.opacity === '1' && !busyWrap.classList.contains('busy'),
    'while it looks: the picker still covers the window (not shrunk, turned or faded like the chat list\'s .busy dot)', busyWrap && { w: bw.width, h: bw.height, transform: bcs.transform, opacity: bcs.opacity, cls: busyWrap.className });
  if (skin0 === undefined) delete root.dataset.skin; else root.dataset.skin = skin0;
  const ui = await until(() => lz() === 'loaded' && Pinboard.ui, 15000);
  step(Boolean(ui && document.querySelector('.pinb-wrap .pinb-q')), 'the picker opens (the finder loaded on use)', ui?.st?.query);
  await until(() => !Pinboard.ui.st.busy && Pinboard.ui.st.res, 60000);
  let s0 = Pinboard.ui.st;
  const status = () => document.querySelector('.pinb-status')?.textContent || '';
  step(s0.res?.where === 'Chrome' && /in Chrome/.test(status()), 'Pinterest opened in the Hearth Chrome and was read there', status());
  const pages = (await window.hub.chrome.page(null, 'pages')).value || [];
  step(pages.some((p) => /\/pinboard\/search\/pins\//.test(p.url) && p.key === 'app:pinterest'), 'its Chrome window shows the Pinterest-like search (as the Pinterest app window)', pages.map((p) => `${p.key}:${p.url.slice(-40)}`));
  const links = s0.pins.map((p) => p.link);
  step(s0.pins.length >= 8 && links.every((l) => /\/pin\/\d+\/$/.test(l)), `${s0.pins.length} pins, every one a pin link (no shopping link, logo or avatar)`, links.map((l) => l.match(/\/pin\/(\d+)/)?.[1]));
  step(!links.some((l) => /\/pin\/1007\//.test(l)) && new Set(links).size === links.length && new Set(s0.pins.map((p) => p.key)).size === links.length && !links.some((l) => /\/pin\/1005\//.test(l)), 'no ad, no pin twice, no picture twice');
  step(s0.pins.every((p) => /\/736x\//.test(p.image) && p.title && !/^This may contain/i.test(p.title)), 'the biggest picture and a clean title for each', s0.pins.slice(0, 3).map((p) => p.title));
  const tiles = [...document.querySelectorAll('.pinb-tile')];
  step(tiles.length === s0.pins.length, `the picker shows them (${tiles.length} tiles)`);
  for (const t of tiles.slice(0, 3)) t.click();
  const nTiles = tiles.length;
  const add = document.querySelector('.pinb-add');
  step(/Add 3 to/.test(add.textContent) && !add.disabled, 'three picked: "Add 3 to …"', add.textContent);
  const picked = s0.pins.slice(0, 3);
  add.click();
  const got = await until(() => (B.items().filter((i) => i.credit === 'Pinterest' && i.pinKey).length >= 3 ? B.items().filter((i) => i.pinKey) : null), 30000);
  const ok3 = got && picked.every((p) => got.some((i) => i.pinKey === p.key && i.source === p.link && i.title === p.title.slice(0, 80) && i.type === 'image' && i.src && !/^https?:/.test(i.src) && (i.tags || []).includes('pinterest')));
  step(Boolean(ok3), 'on the board: saved locally (like a dropped picture), the pin link as source, Pinterest as credit, its title', got?.map((i) => ({ src: String(i.src).slice(-40), source: i.source, title: i.title })));
  step(B.items().length === n0 + 3, `only the three picked were added (${B.items().length - n0})`);
  // a pin with no title, its picture named by a hash (as Pinterest's are): the search words + n
  const hashUrl = `${base}/pinboard/i/3e1e6b6875438000b9a6ccb4c18c0b7.jpg`;
  const [hp] = await Pinboard.addPins([{ key: 'hashpin', image: hashUrl, thumb: hashUrl, link: 'https://www.pinterest.com/pin/4242/', title: '', site: 'pinterest' }], { query: 'restrained monochrome' });
  const bare = await B.addUrl(`${base}/pinboard/i/9f86d081884c7d659a2feaa0c55ad015.png`, { x: 0, y: 0 });
  step(hp?.title === 'restrained monochrome 1' && bare && !B._.hashy(bare.title) && /^127\.0\.0\.1|^localhost/.test(bare.title) && B.items().every((i) => !B._.hashy(i.title)),
    'captions are readable: no title → the search words + n (a bare address → the site + n), never the file\'s hash', { pin: hp?.title, url: bare?.title });
  step(B._.hashy('3e1e6b6875438000b9a6ccb4c18c0b7') && B._.hashy('0b5e7d3c-1f2a-4b6c-9d8e-7f6a5b4c3d2e') && !B._.hashy('Foggy forest at dawn') && !B._.hashy('IMG_2041') && B._.readableTitle('lq2x9k0a1b-3e1e6b6875438000b9a6ccb4c18c0b7.jpg', 'image', { items: [] }) === 'Picture 1',
    'a hash / uuid file name is told apart from a real one');
  B.removeItems?.([hp?.id, bare?.id].filter(Boolean));
  await until(() => !Pinboard.ui.st.busy && /3 added/.test(status()), 8000);
  step(document.querySelectorAll('.pinb-tile').length === nTiles - 3 && /3 added/.test(status()), 'the picker leaves them out now and says so', status());

  // search again: the three are already on the board; then one more screen
  Pinboard.ui.run();
  await wait(300);
  await until(() => !Pinboard.ui.st.busy && Pinboard.ui.st.res, 60000);
  s0 = Pinboard.ui.st;
  step(s0.res.dupes === 3 && !s0.pins.some((p) => picked.some((q) => q.key === p.key)) && /3 already on your board/.test(status()), 'searching again: "3 already on your board", not offered again', status());
  const before = s0.pins.length;
  const more = document.querySelector('.pinb-more');
  step(more && !more.hidden, 'More ↓ is offered (the page goes on)');
  more.click();
  await wait(300);
  await until(() => !Pinboard.ui.st.busy, 30000);
  step(Pinboard.ui.st.pins.length > before && new Set(Pinboard.ui.st.pins.map((p) => p.key)).size === Pinboard.ui.st.pins.length, `More: one more screen (${before} → ${Pinboard.ui.st.pins.length}), still each picture once`);
  const ses = Pinboard._.sessions.get('pinterest');
  step(ses.scrolls <= 3, `a modest scroll (${ses.scrolls} so far, 6 at most per search)`);

  // 3. Pinterest inside Hearth (the board's Pinterest window), Unsplash in its app window, a sign-in page
  await window.hub.apps.chrome('pinterest', 'hearth');
  await Pinboard.ui.run();
  const pw = await window.hub.board.pins('state');
  step(Pinboard.ui.st.res?.where === 'its Hearth window' && Pinboard.ui.st.pins.length >= 5 && pw.open && /\/pinboard\/search\/pins\//.test(pw.url), 'Pinterest "inside Hearth": the board\'s Pinterest window, read the same way', `${Pinboard.ui.st.pins.length} · ${status()}`);
  await window.hub.apps.chrome('pinterest', 'auto');
  await window.hub.board.pins('close');
  Pinboard.ui.st.site = 'unsplash';
  document.querySelector('.pinb-q').value = 'foggy forest';
  await Pinboard.ui.run();
  const us = Pinboard.ui.st;
  step(us.res?.site === 'unsplash' && us.pins.length === 3 && us.pins.every((p) => /\/photos\//.test(p.link)) && /from Unsplash/.test(status()), 'Unsplash: its app window, 3 photos (no banner, sponsored one or avatar)', status());
  const uw = (await window.hub.apps.windows()).find((w) => w.id === 'unsplash');
  step(Boolean(uw?.visible || uw), 'the Unsplash app window is open on the search', uw?.url);
  store.set('pinboard.bases', { pinterest: `${base}/pinboard/login?q={q}` });
  Pinboard.ui.st.site = 'pinterest';
  document.querySelector('.pinb-q').value = 'neon';
  await Pinboard.ui.run();
  step(Pinboard.ui.st.res?.signin === true && /asks you to sign in/.test(status()) && /never sees your password/.test(status()), 'a sign-in page: the picker says so (sign in there; Hearth never sees the password)', status());
  store.set('pinboard.bases', { pinterest: `${base}/pinboard/search/pins/?q={q}` });
  Pinboard.close();

  // the mission: the message is the vibe
  m.submit(H.claudeAgent().id, 'rainy neon');
  await until(() => Pinboard.ui && !Pinboard.ui.st.busy && Pinboard.ui.st.res, 60000);
  step(/rainy neon/.test(Pinboard.ui.st.query) && Pinboard.ui.st.pins.length > 0, 'the mission searches your words', Pinboard.ui.st.query);
  Pinboard.close();

  // 4. the AIs: board_do pins
  const r = await HubBridge.call('board_do', { op: 'pins', query: 'liquid chrome' }, {});
  const list = r.value?.found || [];
  step(r.ok && list.length >= 1 && list.length <= 8 && /^1\. /.test(list[0]) && /picker/.test(r.value.shown), 'board_do pins: a short numbered list (8 at most) and "the owner picks"', r.value);
  step(JSON.stringify(r.value).length < 900, `the answer stays small (${JSON.stringify(r.value).length} characters)`);
  await until(() => Pinboard.ui, 5000);
  step(Boolean(Pinboard.ui) && document.querySelectorAll('.pinb-tile').length === list.length, 'no reply running: the picker opens with those to confirm', document.querySelectorAll('.pinb-tile').length);
  const rec = { board: B.current().id, boardName: B.current().name, query: 'liquid chrome', site: 'pinterest', siteName: 'Pinterest', pins: Pinboard.ui.st.pins.slice(0, 4) };
  Pinboard.close();
  // closed: nothing from the picker or its search stays in the page outside the board, nothing big turned over the app
  const left = [...document.querySelectorAll('[class*="pinb"]')].filter((n) => !n.closest('.bd-vp, .msg, .live-cards'));
  const tilted = [...document.body.querySelectorAll('*')].filter((n) => { if (n.closest('.bd-vp, .pw-gallery-hero')) return false; // (round 74) the Projects home's turned orbit art is its own const t = getComputedStyle(n).transform; if (!t || t === 'none') return false; const r = n.getBoundingClientRect(); return r.width * r.height > 150 * 150 && !/^matrix\(1, 0, 0, 1,/.test(t); });
  step(!left.length && !tilted.length, 'closed: nothing from the picker stays outside the board, nothing big turned over the app', { left: left.map((n) => n.className).slice(0, 5), tilted: tilted.map((n) => `${n.tagName}.${n.className}`).slice(0, 5) });
  // the card a reply shows (the same one saved replies draw)
  const card = PinboardHook.card(rec);
  document.body.append(card);
  card.querySelector('.pinb-ct').click();
  const cb = card.querySelector('.pinb-ca.primary');
  step(/Add 1 to/.test(cb.textContent), 'the card in a reply: tick one → "Add 1 to …"', cb.textContent);
  const nb = B.items().length;
  cb.click();
  await until(() => B.items().length === nb + 1, 20000);
  step(B.items().length === nb + 1 && /1 added/.test(cb.textContent), 'the card adds it', cb.textContent);
  card.remove();
  const rerender = PinboardHook.card(rec);
  step(rerender.querySelectorAll('.pinb-ct.done').length >= 1, 'drawn again later: what is on the board shows ✓');

  // right-click on a reference: like this one
  const pic = B.items().find((i) => i.pinKey);
  const ex = B._.itemExtras([pic]);
  step(ex.some((x) => /Find images like this/.test(x?.label || '')), 'right-click on a picture › Find images like this…');
  B.removeItems?.(B.items().filter((i) => i.pinKey).map((i) => i.id));
  // for the screenshot: the picker with pictures (data: stand-ins for the sites' https pictures)
  const sw = (c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="236" height="300"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="236" height="300" fill="url(#g)"/></svg>`)}`;
  const demo = ['#ff3d7f', '#2de2e6', '#f6019d', '#ffd319', '#7b2cbf', '#ff6c11', '#3a86ff', '#06d6a0', '#ef476f', '#8338ec', '#fb5607', '#00f5d4'].map((c, i) => ({ key: `demo${i}`, image: sw(c), thumb: sw(c), link: `https://www.pinterest.com/pin/${900 + i}/`, title: ['Neon chrome lettering', 'Cyan haze', 'Magenta glow', 'Gold hour', 'Violet fog', 'Orange flare', 'Blue grid', 'Mint light', 'Rose smoke', 'Purple glass', 'Ember', 'Teal water'][i], site: 'pinterest' }));
  await Pinboard.open({ preload: { board: B.current().id, query: 'neon chrome aesthetic', site: 'pinterest', pins: demo } });
  for (const t of [...document.querySelectorAll('.pinb-tile')].slice(1, 3)) t.click();
  await wait(400);
} catch (err) { step(false, `threw: ${err.message}`, err.stack?.split('\n').slice(0, 3).join(' | ')); }
try { await window.hub.chrome.quit(); } catch { /* gone */ }
return JSON.stringify({ ok: !out.problems.length, ...out }, null, 1);
