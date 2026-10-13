// "What can I do here?" (round 31, quickstart): the ways in, loaded right after the first screen (tiny). The card itself
// (quickstart.js + quickstart-core.js, lazy group "quickstartui") loads the first time it's asked for:
//   · each window's ⋯: the chat's ⋯ (AI setup's header, and the right-click menu), the Lab toolbar's ⋯, the board's ⋯
//   · by itself, once, the first time you open a chat, the Lab or the board in this version (never again after that;
//     × = gone for good); never in the first seconds, over a dialog or another card, or while you're away
//   · Ctrl/⌘+K "What can I do here?" and /what-can-i-do (the app's internal API)
// It is the one place for "things to try": Discover's daily tip no longer pops up by itself (discover.js sees
// this group in the build), and the window's own first-run chips step aside while the card is up (quickstart.css).
const QuickstartHooks = (() => {
  const ST = 'quickstart';
  const T0 = Date.now();
  const placeOf = (id = H.activeId) => {
    const a = H.agent?.(id);
    if (id === 'tool:three' || a?.dock === 'three') return 'lab';
    if (id === 'tool:board') return 'board';
    return a?.mode === 'native' ? 'chat' : null;
  };
  async function open(place = placeOf(), opts = {}) {
    try {
      if (typeof Lazy !== 'undefined') await Lazy.load('quickstartui');
      return await Quickstart.open(place, opts);
    } catch (err) { toast(`What can I do here? didn't open: ${err.message}`, { type: 'error' }); return null; }
  }
  const LABEL = '✦ What can I do here?';
  // a showMenu row (the chat's right-click, the board's ⋯)
  const menuItem = (place, agentId = null) => ({ label: LABEL, hint: 'things worth trying here', action: () => open(place, { agentId }) });
  // a ThreeTweaks.menu row (the Lab toolbar's ⋯)
  const labRow = () => [LABEL, 'Things worth trying in the Lab now', () => open('lab')];
  // a small button for a header (AI setup's)
  const button = (place, agentId, before) => el('button', { type: 'button', class: 'ghost small qs-ask', text: '?', title: 'What can I do here?', on: { click: () => { before?.(); open(place, { agentId }); } } });

  // ---------- the board's ⋯ (the Board button's menu and its right-click › Board) ----------
  function hookBoard() {
    if (typeof Lazy !== 'undefined' && !Lazy.isIn('board')) return false;
    if (typeof Board === 'undefined' || !Board._?.boardItems) return false;
    if (Board._.boardItems.qs) return true;
    const base = Board._.boardItems;
    const wrapped = () => [menuItem('board'), ...base()];
    wrapped.qs = true;
    Board._.boardItems = wrapped;
    return true;
  }
  hookBoard();

  // ---------- by itself, the first time a window opens ----------
  const st = () => store.get(ST, {}) || {};
  const due = (place) => Boolean(place) && !st().seen?.[place] && !st().gone?.[place];
  const busyScreen = () => Boolean(document.hidden || document.querySelector('dialog[open], .speed-card:not(.out), .qs-card, .ms-pop, .opt-sheet, .tour-card, .splash')
    || (typeof Tour !== 'undefined' && Tour.current));
  let timer = 0;
  function soon(ms = 1400) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const place = placeOf();
      if (!due(place)) return;
      if (window.SMOKE_SAVES && !store.get('quickstart.testAuto', false)) return; // never by itself in the headless test runs
      if (Date.now() - T0 < 5000 || busyScreen() || window.Jank?.busy?.()) { soon(2500); return; }
      if (place === 'lab' && !((typeof Lazy === 'undefined' || Lazy.isIn('lab')) && typeof ThreeLab !== 'undefined' && ThreeLab.peek())) { soon(1500); return; } // the Lab still coming up
      const go = () => { if (placeOf() === place && due(place) && !busyScreen()) open(place, { auto: true }); };
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else go();
    }, ms);
  }
  addEventListener('hearth:view', () => soon());
  soon(5200);

  // ---------- Ctrl/⌘+K and the command (the buttons above are the way in) ----------
  try { AppUI.addAction?.('What can I do here?', () => open()); } catch { /* no palette */ }
  if (typeof Commands !== 'undefined' && !Commands.get('what-can-i-do')) {
    Commands.register({
      name: 'what-can-i-do', aliases: Commands.get('quickstart') ? [] : ['quickstart'], area: 'App', args: '[chat | lab | board | list | reset]',
      desc: 'What can I do here? 3–5 things worth trying in this window, picked from what you haven\'t used yet and what\'s on screen (free)',
      keywords: 'what can i do here try start ideas help discover first run new quickstart',
      examples: ['/what-can-i-do', '/what-can-i-do list', '/what-can-i-do lab'],
      complete: () => ['chat', 'lab', 'board', 'list', 'reset'].map((value) => ({ value })),
      async run(args, ctx) {
        const a = String(args || '').trim().toLowerCase();
        if (typeof Lazy !== 'undefined') await Lazy.load('quickstartui');
        if (a === 'reset') { Quickstart.reset(); return 'The card will show by itself again the first time each window opens.'; }
        if (a === 'list') {
          const place = placeOf(); const rows = place ? await Quickstart.list(place, ctx?.agentId) : [];
          return rows.length ? rows.map((r, i) => `${i + 1}. ${r.label}: ${r.why}`).join('\n') : 'Nothing new to try here.';
        }
        await open(['chat', 'lab', 'board'].includes(a) ? a : placeOf(), { agentId: ctx?.agentId && H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : null });
        return undefined;
      },
    });
  }
  return { open, placeOf, menuItem, labRow, button, hookBoard, soon, due };
})();
