// (round 67, errands67) Errands, by CLICKING only (no chat command; it fails if one is used), on the smoke run's throwaway
// profile, offline (saved Shotgun / DICE responses, no map tiles, nothing sent):
//   1. the ✦ quest tracker has "＋ Errand"; typing "AirPods" suggests Apple Opéra first with its usual hours ("usual
//      hours, check before going") and a live "Right now" badge; Add errand saves one quest in the journal
//   2. the tracker lists it under Errands with the same badge and a Done ✓
//   3. the Paris map shows its pin (badge in its label); the Layers panel has "Errands", on by default, and it switches
//   4. the map's "＋ Errand" chip: "Click a spot on the map…", a real click on the map, typed hours (a lunch break),
//      a name for the spot → a second errand exactly there; its badge matches the hours
//   5. clicking an errand's pin opens its card (Done ✓, Remove, the hours)
//   6. 📍 I'm here near Apple Opéra → Close to you lists the errand with its badge; Done ✓ there completes the quest
//      (+XP), it leaves the map, the tracker and the list
//   7. Done ✓ in the tracker completes the other one
//   node dev/smoke.js --script dev/checks/errands67.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const S = () => QuestJournal.snapshot();
const map = () => root()?.querySelector('.qj-world-layout .qj-atlas');
const card = () => document.querySelector('dialog.er-card[open]');
const hud = () => document.querySelector('.qh-panel');
const btn = (txt, scope) => [...(scope || document).querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt : txt.test(b.textContent)));
const errands = () => S().campaigns.filter((c) => String(c.id).startsWith('c-errand-'));
const shots = window.SMOKE_TMP || window.SMOKE_SAVES;
const commands = []; const realTry = Commands.tryRun; Commands.tryRun = function (...a) { commands.push(a[0]); return realTry.apply(this, a); };
const opened = []; window.hub.openExternal = (u) => { opened.push(u); };
const sent = []; const realFetch = window.fetch; window.fetch = function (u, ...a) { const s = String(u?.url || u); if (/^https?:/.test(s)) sent.push(s); return realFetch.call(this, u, ...a); };
const xo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { if (/^https?:/.test(String(u))) sent.push(String(u)); return xo.call(this, m, u, ...a); };
const click = async (x, y) => { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }); };
const clickEl = async (n) => { n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); await click(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)); };
// typing into a field: focus it with a click, select what's there, type (real key input)
const type = async (input, text) => { await clickEl(input); input.select(); await smoke({ cdp: 'Input.insertText', params: { text } }); await wait(60); };
const misses = [];
const clickUntil = async (get, ok, what) => {
  for (let i = 0; i < 4; i++) {
    const n = get(); if (!n) { await wait(300); continue; }
    await clickEl(n);
    for (let k = 0; k < 25; k++) { if (ok()) return true; await wait(60); }
    misses.push(what);
  }
  throw Error(`timed out: ${what}`);
};
const openHud = async () => { if (!hud()) await clickUntil(() => document.querySelector('.qh-chip'), () => hud() && QuestHud.journal().status === 'ok' && hud().querySelector('[data-k="errand-add"]'), 'tracker'); };

try {
  try { await window.hub.shows?.test?.({ dev: window.SMOKE_DEV }); } catch { /* no saved shows: the map works without */ }
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  const xp0 = QuestCore.xp(S());

  // ---------- 1. ✦ tracker › ＋ Errand › AirPods › Apple Opéra › Add errand ----------
  await until(() => document.querySelector('.qh-chip') && !document.querySelector('.qh-chip').hidden, 'quest chip');
  await openHud();
  const add = hud().querySelector('[data-k="errand-add"]');
  step('the ✦ tracker has a labelled “＋ Errand” row', add.textContent.trim() === '＋ Errand' && !!add.title, add.title);
  await clickUntil(() => hud()?.querySelector('[data-k="errand-add"]'), () => card(), 'errand card');
  step('it opens “＋ New errand”: what, where, opening hours', /New errand/.test(card().querySelector('h2').textContent) && !!card().querySelector('.er-what') && !!card().querySelector('.er-hours') && !!btn(/Click a spot on the map/, card()));
  await type(card().querySelector('.er-what'), 'AirPods');
  await until(() => card().querySelector('.er-shop')?.dataset.shop === 'apple-opera', 'Apple Opéra suggested first');
  const sug = [...card().querySelectorAll('.er-shop')].map((b) => b.dataset.shop);
  step('typing “AirPods” suggests Apple Opéra first (then other shops that sell them)', sug[0] === 'apple-opera' && sug.every((id) => /apple|fnac/.test(id)), sug);
  await clickEl(card().querySelector('.er-shop[data-shop="apple-opera"]'));
  await until(() => card().querySelector('.er-shop.on')?.dataset.shop === 'apple-opera', 'shop chosen');
  const hrs = card().querySelector('.er-hours').value, nowTxt = card().querySelector('.er-now').textContent;
  const expect1 = ErrandsCore.status(ErrandsCore.shop('apple-opera').week).text;
  step('choosing it fills its usual hours, marked “Usual hours, check before going”', hrs === 'Mon–Sat 10:00–20:00 · Sun 11:00–19:00' && /Usual hours, check before going/.test(card().querySelector('.er-usual').textContent), hrs);
  step('“Right now” shows the badge for this computer’s clock', nowTxt.includes(expect1), { nowTxt, expect1 });
  await smoke({ shot: shots + '/errands67-card.png' });
  await clickEl(btn('Add errand', card()));
  await until(() => !card() && errands().length === 1, 'errand saved');
  const e1 = errands()[0];
  step('Add errand saves one quest in the journal: what, where, hours (and the main quest stays)', e1.errand.what === 'AirPods' && e1.errand.place.shop === 'apple-opera' && e1.errand.usual === true && e1.quests.length === 1 && S().active !== e1.id, { title: e1.title, place: e1.errand.place.name });

  // ---------- 2. the tracker lists it, with its badge ----------
  await openHud();
  await until(() => hud().querySelector(`[data-errand="${e1.id}"]`), 'tracker row');
  const row1 = hud().querySelector(`[data-errand="${e1.id}"]`);
  step('the tracker lists it under Errands with the same badge and Done ✓', /Errands/.test(hud().textContent) && row1.querySelector('.er-badge').textContent === expect1 && !!btn('Done ✓', row1), row1.textContent);
  await smoke({ shot: shots + '/errands67-hud.png' });
  hud().querySelector('[data-k="close"]').click(); await wait(150);

  // ---------- 3. the map: its pin; Layers › Errands ----------
  QuestJournal.navigate('world');
  await until(() => map() && map().querySelector(`[data-place="er-${e1.id}"]`), 'errand pin on the map');
  const pin1 = map().querySelector(`[data-place="er-${e1.id}"]`);
  step('the errand is on the map, its label says how open it is', pin1.textContent.includes('AirPods') && pin1.textContent.includes(ErrandsCore.status(e1.errand.week).short) && /\ber-(open|soon|later|closed)\b/.test(pin1.className), pin1.textContent);
  await clickUntil(() => map().querySelector('.qml-open'), () => map().querySelector('.qml-panel'), 'Layers panel');
  const sw = () => map().querySelector('.qml-panel input[data-layer="errands"]');
  step('the Layers panel has “Errands (1)”, on by default', !!sw() && sw().checked && /Errands \(1\)/.test(sw().closest('label').textContent), sw()?.closest('label')?.textContent);
  await clickEl(sw()); // real clicks on the switch, then on its name (round 66's panel let the map's drag eat them)
  await until(() => !map().querySelector(`[data-place="er-${e1.id}"]`), 'errands off');
  step('switching Errands off hides the pin (remembered on this computer)', QuestMapFirst.on('errands') === false);
  await clickEl(sw().closest('label').querySelector('.qml-name')); // a real click on the row's name, as a person would
  await until(() => map().querySelector(`[data-place="er-${e1.id}"]`), 'errands back');
  step('…and on again brings it back', QuestMapFirst.on('errands') === true);
  await clickUntil(() => btn('Done', map().querySelector('.qml-panel')), () => !map().querySelector('.qml-panel'), 'Layers closed');

  // ---------- 4. the map's ＋ Errand: a spot of your own, typed hours ----------
  const chip = map().querySelector('.qmf-strip .er-add');
  step('the map’s chip row has “＋ Errand”', !!chip && /Errand/.test(chip.textContent));
  await clickUntil(() => map().querySelector('.qmf-strip .er-add'), () => card(), 'card from the map');
  await type(card().querySelector('.er-what'), 'Keys cut');
  await clickEl(btn(/Click a spot on the map/, card()));
  await until(() => !card() && map().classList.contains('er-picking') && map().querySelector('.er-hint'), 'picking a spot');
  step('“Click a spot on the map…” closes the card and asks for a click on the map', /Click the map where you’ll get Keys cut/.test(map().querySelector('.er-hint').textContent));
  const r = map().getBoundingClientRect(); let x = Math.round(r.left + r.width * 0.4), y = Math.round(r.top + r.height * 0.6);
  for (let i = 0; i < 12 && document.elementFromPoint(x, y)?.closest('button'); i++) y += 9;
  const spot = map().qjHere.at(x, y), places0 = S().atlas.places.length;
  await click(x, y);
  await until(() => card() && /Spot chosen/.test(card().textContent), 'card back with the spot');
  step('a real click on the map brings the card back with that spot (no place added to the map)', !map().classList.contains('er-picking') && S().atlas.places.length === places0);
  await type(card().querySelector('.er-spot-name'), 'Cordonnerie');
  await type(card().querySelector('.er-hours'), 'Mon-Fri 9-12, 14-18 · Sat 10-13');
  const week2 = ErrandsCore.parse('Mon-Fri 9-12, 14-18 · Sat 10-13');
  await until(() => card().querySelector('.er-now .er-badge')?.textContent === ErrandsCore.status(week2).text, 'live badge for typed hours');
  step('typed hours (with a lunch break) show their own badge, marked as yours', /Your hours/.test(card().querySelector('.er-usual').textContent));
  await clickEl(btn('Add errand', card()));
  await until(() => !card() && errands().length === 2, 'second errand');
  const e2 = errands().find((c) => c.errand.what === 'Keys cut');
  step('the errand is saved exactly where you clicked, with your hours', Math.abs(e2.errand.place.lat - spot.lat) < 1e-5 && Math.abs(e2.errand.place.lon - spot.lon) < 1e-5 && e2.errand.place.name === 'Cordonnerie' && ErrandsCore.format(e2.errand.week) === 'Mon–Fri 09:00–12:00, 14:00–18:00 · Sat 10:00–13:00 · Sun closed' && e2.errand.usual === false, e2.errand);
  await until(() => map().querySelector(`[data-place="er-${e2.id}"]`), 'second pin');

  // ---------- 5. its pin opens its card ----------
  await clickUntil(() => map().querySelector(`[data-place="er-${e2.id}"]`), () => card(), 'pin → card');
  step('clicking an errand’s pin opens its card: badge, hours, Done ✓, Remove', /Errand: Keys cut/.test(card().textContent) && !!btn('Done ✓', card()) && !!btn('Remove', card()) && card().querySelector('.er-hours').value === ErrandsCore.format(e2.errand.week));
  await clickEl(btn('Close', card())); await until(() => !card(), 'card closed');

  // ---------- 6. 📍 I'm here near Apple Opéra › Close to you › Done ✓ ----------
  const opera = ErrandsCore.shop('apple-opera');
  map().qjHere.go({ lat: opera.lat - 0.001, lon: opera.lon }, 16); await wait(300);
  await clickUntil(() => map().querySelector('.hp-dock .hp-btn'), () => map().querySelector('.hp-centre'), 'I’m here');
  await clickUntil(() => map().querySelector('.hp-centre'), () => map().querySelector('.hp-near'), 'pin at the centre');
  const erow = () => map().querySelector(`.hp-near .hp-item[data-id="errand:${e1.id}"]`);
  await until(() => erow(), 'errand in Close to you');
  step('Close to you lists the errand (Errand · about 1 min walk) with its badge and Done ✓', /Errand/.test(erow().querySelector('.hp-kind').textContent) && /about \d+ min walk/.test(erow().textContent) && erow().querySelector('.er-badge')?.textContent === ErrandsCore.status(e1.errand.week).text && !!btn('Done ✓', erow()), erow().textContent);
  await smoke({ shot: shots + '/errands67-near.png' });
  await clickEl(btn('Done ✓', erow()));
  await until(() => QuestCore.done(S(), e1.quests[0].id), 'errand 1 done');
  step('Done ✓ completes it as a quest (+XP, self-reported, no proof asked)', QuestCore.xp(S()) - xp0 === ErrandsCore.XP && /Self-reported/.test(S().records[e1.quests[0].id].note) && !document.querySelector('dialog.qj-dialog[open]'), { xp: QuestCore.xp(S()) - xp0 });
  await until(() => !erow() && !map().querySelector(`[data-place="er-${e1.id}"]`), 'gone from the list and the map');
  step('…and it leaves Close to you and the map', true);

  // ---------- 7. Done ✓ in the tracker ----------
  await openHud();
  await until(() => hud().querySelector(`[data-errand="${e2.id}"]`) && !hud().querySelector(`[data-errand="${e1.id}"]`), 'tracker: only the open errand');
  await clickEl(btn('Done ✓', hud().querySelector(`[data-errand="${e2.id}"]`)));
  await until(() => QuestCore.done(S(), e2.quests[0].id), 'errand 2 done');
  await until(() => !hud()?.querySelector('[data-errand]'), 'tracker row gone');
  step('Done ✓ in the tracker completes the other one; the tracker keeps “＋ Errand”', QuestCore.xp(S()) - xp0 === 2 * ErrandsCore.XP && !!hud().querySelector('[data-k="errand-add"]'));
  hud().querySelector('[data-k="close"]')?.click();

  step('real clicks landed (a miss is a re-render under the pointer, noted)', misses.length <= 2, misses);
  step('no chat command was used', commands.length === 0, commands);
  step('nothing sent on the network, nothing opened in the browser', sent.length === 0 && opened.length === 0, { sent, opened });
} catch (err) { fails.push('crashed: ' + err.message); out.steps.push('✖ ' + err.stack); }
out.fails = fails;
if (fails.length) throw Error(JSON.stringify(out, null, 1));
return JSON.stringify(out, null, 1);
