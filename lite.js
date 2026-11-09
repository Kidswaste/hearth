// (round 153a, lite153) ⚡ Lite mode's menus, indicator and offer (docs/upgrades/lite153.md). The switch itself and what it
// changes are elsewhere: powerwise.js (window.HearthLite, read before the first paint, Power's background pace),
// powerwise.css (no animations / transitions / backdrop blur / will-change), look.js (Motion: off, no textures, no glow:
// never saved), tools/three.js + three-sandbox.html (the Lab preview: 30 fps, half resolution, no glow / effects /
// shadows / antialias; renders untouched), tools/three-hudstage.js (no reactive stage). Here:
//   · /lite [on | off | status], Ctrl/⌘+K "Lite mode: on / off", Ctrl/⌘+Alt+L, the command bar's words (cmdbar.js)
//   · the LITE tag in the rail's status corner while it is on (a click turns it off; the Lab bar has its own)
//   · "Things are slow — turn on Lite mode?": once a session at most, when the Lab preview stays under 20 fps for a while
//     as it plays or moves, or the window froze several times in a minute; one click turns it on, × dismisses; never
//     switched by itself. "Don't ask again" is the menu's (store lite.noOffer).
const LiteUI = (() => {
  const L = () => window.HearthLite;
  const ON_TEXT = '⚡ Lite mode on: the Lab preview at 30 fps and half resolution, no glow, no animations, slower background checks. Renders stay full quality.';
  const OFF_TEXT = 'Lite mode off: everything is back as it was';
  const SLOW_FPS = 20; const SLOW_MS = 12000; // under 20 fps for 12 s of stats (the preview sends them once a second while it plays)
  const S = { slowSince: 0, offered: false, offers: 0, offerNode: null, why: '', tag: null, freezes: 0 };
  function set(v, { quiet = false } = {}) {
    const on = L()?.set(v);
    if (!quiet) toast(on ? ON_TEXT : OFF_TEXT, { timeout: on ? 4200 : 2200 });
    return on;
  }
  const toggle = (o) => set(!L()?.on, o);

  // ---------- the rail's LITE tag (beside the ☕ / status corner) ----------
  function paintTag() {
    const on = Boolean(L()?.on);
    if (!on && !S.tag) return;
    const rail = document.getElementById('rail');
    if (!rail) return;
    if (!S.tag) {
      S.tag = el('button', { type: 'button', class: 'tool-btn lite-tag', id: 'lite-rail', text: 'LITE', dataset: { feature: 'Lite mode tag' }, title: '⚡ Lite mode is on (30 fps preview at half resolution, no glow or animations; renders stay full quality) · click to turn it off', 'aria-label': 'Lite mode is on: click to turn it off' });
      S.tag.addEventListener('click', () => set(false));
    }
    const anchor = document.getElementById('pw-awake') || document.getElementById('rq-badge') || document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? S.tag.nextElementSibling !== anchor : S.tag.parentElement !== rail) (anchor ? anchor.before(S.tag) : rail.append(S.tag));
    if (S.tag.hidden === on) S.tag.hidden = !on;
  }
  addEventListener('hearth:lite', (e) => { paintTag(); if (e.detail?.on && S.offerNode?.isConnected) S.offerNode.remove(); });

  // ---------- the offer: once a session, never automatic ----------
  const noOffer = () => store.get('lite.noOffer', false) === true;
  function offer(why) {
    if (S.offered || L()?.on || noOffer()) return false;
    S.offered = true; S.offers += 1; S.why = why;
    S.offerNode = toast('Things are slow — turn on Lite mode? (30 fps preview at half resolution, no glow or animations; renders stay full quality)', { timeout: 20000, action: { label: '⚡ Turn on Lite mode', fn: () => set(true) } });
    S.offerNode?.classList?.add('lite-offer');
    return true;
  }
  // the Lab's stats (tools/three.js hands each one over, ≤ 2 a second): under 20 fps for a while, as it plays or moves
  function stats(msg) {
    if (S.offered || L()?.on) return;
    const fps = Number(msg?.fps) || 0;
    const moving = fps > 0 && !msg?.pace?.still && !document.hidden;
    if (!moving || fps >= SLOW_FPS) { S.slowSince = 0; return; }
    const now = Date.now();
    if (!S.slowSince) { S.slowSince = now; return; }
    if (now - S.slowSince >= SLOW_MS) offer(`the Lab preview at ${Math.round(fps)} fps`);
  }
  // the PC busy: the window froze (≥ 0.5 s) three times or more in the last minute (jank.js keeps the list); once a minute,
  // only while Hearth is on screen
  function busyCheck() {
    if (S.offered || L()?.on || !window.Jank?.slow) return;
    let n = 0;
    try { const t = Date.now() - 60000; n = (Jank.slow().last || []).filter((x) => x.t >= t && x.ms >= 500).length; } catch { return; }
    S.freezes = n;
    if (n >= 3) offer(`${n} freezes in a minute`);
  }
  if (window.Power?.every) Power.every('lite-busy', 60000, busyCheck, { hidden: 'skip', battery: false, first: 90000 });

  // ---------- /lite, Ctrl/⌘+K, Ctrl/⌘+Alt+L ----------
  function status() {
    const on = Boolean(L()?.on);
    return on
      ? '**⚡ Lite mode is on**: the Lab preview at 30 fps and half resolution, no glow, effects, shadows or antialias in it; no animations or blur anywhere; background checks at a third of their pace. Renders and exports stay full quality. /lite off gives back exactly what was there.'
      : '**Lite mode is off.** /lite on: the Lab preview at 30 fps and half resolution, no glow or animations, slower background checks (renders stay full quality).';
  }
  if (typeof Commands !== 'undefined' && !Commands.get('lite')) {
    Commands.register({
      name: 'lite', area: 'App', args: '[on | off | status]', desc: '⚡ Lite mode for a busy PC: the Lab preview at 30 fps and half resolution, no glow or animations, slower background checks (renders stay full quality)',
      keywords: 'lite light fast faster slow lag laggy performance smooth busy battery saver low power potato reduce effects glow animations',
      examples: ['/lite on', '/lite off', '/lite'],
      complete: () => [{ value: 'on', hint: 'lighter: 30 fps preview, no glow or animations' }, { value: 'off', hint: 'everything back as it was' }, { value: 'status', hint: 'what it does now' }],
      run: async (args) => {
        const a = String(args || '').trim().toLowerCase();
        if (/^(on|yes|1|enable|start)$/.test(a)) set(true, { quiet: true });
        else if (/^(off|no|0|disable|stop)$/.test(a)) set(false, { quiet: true });
        else if (!a) toggle({ quiet: true });
        return status();
      },
    });
    try { Commands.addInfo?.({ lite: { args: { enable: 'on', disable: 'off', start: 'on', stop: 'off' }, undo: '/lite off (or /lite on)' } }); } catch { /* optional */ }
  }
  try {
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      AppUI.addAction('Lite mode: on / off (⚡ 30 fps preview, no glow or animations)', () => toggle(), 'Ctrl+Alt+L');
      AppUI.addAction('Lite mode: don\'t offer it when things are slow', () => { store.set('lite.noOffer', !noOffer()); toast(noOffer() ? 'Hearth won\'t offer Lite mode any more (/lite turns it on)' : 'Hearth may offer Lite mode again when things are slow', { timeout: 2600 }); });
    }
  } catch { /* optional */ }
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey || e.code !== 'KeyL' || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    toggle();
  }, true);
  try { if (typeof Keys !== 'undefined' && Keys.add && !Keys.all().some((k) => k.keys === 'Ctrl+Alt+L')) Keys.add({ area: 'App', keys: 'Ctrl+Alt+L', what: '⚡ Lite mode on / off (30 fps preview, no glow or animations; renders stay full quality)', run: () => toggle() }); } catch { /* optional */ }

  paintTag();
  return { set, toggle, stats, offer, status, paintTag, state: () => ({ on: Boolean(L()?.on), offered: S.offered, offers: S.offers, why: S.why, slowSince: S.slowSince, freezes: S.freezes, tag: Boolean(S.tag && !S.tag.hidden) }), _test: { reset: () => { S.offered = false; S.slowSince = 0; S.offerNode?.remove?.(); S.offerNode = null; } } };
})();
window.LiteUI = LiteUI;
