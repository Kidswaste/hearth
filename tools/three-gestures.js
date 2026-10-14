// Lab gestures (round 34 "labgestures"): moving around the Lab preview like in a 3D app, on a Mac trackpad, a Windows
// precision touchpad or a mouse. The gestures themselves live in the preview's page (tools/three-sandbox.html, "Lab
// gestures": wheel / pinch / drags / double-click, the view as an offset on the scene's camera, coasting and easing);
// this is the hub side: the Z / Shift+Z keys, the right-click › View rows, the one-time hint, the "Moving around" help,
// the keys sheet lines and /lab-view for chats. Nothing new on screen.
//   Z        frame the subject (the selected layer's, else the top one with a 3D camera)
//   Shift+Z  back to the scene's own camera
// The view isn't saved and makes no undo steps (the scene saves no camera today); "Keep this view" makes it the
// scene's camera through the scene editor's camera override, which is saved and undoable as before.
const ThreeGestures = (() => {
  let hooks = null; // { send, pane, layer }
  let seq = 0; let last = null;
  const HINT = 'three.viewHint';
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  const send = (cmd, extra = {}) => { if (!hooks) { toast('Open the Lab first', { timeout: 1400 }); return false; } hooks.send({ type: 'view', cmd, layer: hooks.layer?.() || null, ...extra }); return true; };
  const frame = () => send('frame');
  const reset = () => send('reset');
  const keep = () => send('keep');
  function attach(h) {
    hooks = h;
    h.pane.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || typing(e) || e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.code !== 'KeyZ') return;
      e.preventDefault();
      if (e.shiftKey) reset(); else frame();
      window.Usage?.key?.(e.shiftKey ? 'Shift+Z' : 'Z', 'Lab');
    });
  }
  // the preview's answers: a view command done (or why not), the first gesture-able scene under the pointer
  function onBox(msg) {
    if (msg.type === 'view-state') { seq += 1; last = msg; if (msg.say) toast(msg.say, { timeout: msg.ok ? 2600 : 1800 }); return true; }
    if (msg.type === 'view-moved') { dispatchEvent(new CustomEvent('hearth:lab-view', { detail: { steps: msg.steps } })); return true; } // (round 37) ◧ Before / after makes its picture again
    if (msg.type === 'view-hint') {
      if (store.get(HINT, false)) return true;
      // (round 38, hintcalm) one tip at a time, in the Lab (hints.js); remembered once it showed
      const show = () => { if (store.get(HINT, false)) return null; store.set(HINT, true); return toast(`Look around: ${mac() ? 'two fingers' : 'two fingers or right-drag'} turn · pinch or the wheel zooms · Z frames · Shift+Z resets`, { timeout: 6500, action: { label: 'How', fn: () => help() } }); };
      if (window.Hints) Hints.offer({ id: 'lab.view', place: 'lab', rank: 20, once: false, ttl: 60000, show }); else show();
      return true;
    }
    return false;
  }
  const mac = () => /Mac/.test(navigator.platform);
  // the preview's right-click › View rows
  function viewItems() {
    return ['-',
      { label: '◎ Frame the subject', key: 'Z', hint: 'double-click does it too', action: frame },
      { label: '⌂ Reset the view', key: 'Shift+Z', hint: 'the scene’s own camera', action: reset },
      { label: 'Keep this view', hint: 'as the scene’s camera', action: keep },
      { label: 'Moving around…', hint: 'trackpad, mouse, keys', action: () => help() }];
  }
  // the Lab ⋯ row (help, not a setting)
  const helpRow = () => ['Moving around the picture', `${mac() ? 'Two fingers turn · pinch zooms' : 'Right-drag turns · wheel zooms'} · Z frames`, () => help()];
  const ROWS = () => [
    [mac() ? 'Two-finger scroll' : 'Two-finger scroll (touchpad)', 'Turn around the subject (the picture follows your fingers)'],
    ['Shift + two-finger scroll', 'Pan'],
    ['Pinch', 'Zoom toward the pointer'],
    ['Mouse wheel', 'Zoom toward the pointer (Shift+wheel pans)'],
    ['Right-drag', 'Turn (Shift: pan) · a right-click without moving still opens the menu'],
    ['Middle-drag', 'Pan'],
    ['Double-click', `Frame the subject · again: back to the view before${mac() ? ' (a double-tap with tap to click)' : ''}`],
    ['Z · Shift+Z', 'Frame the subject · back to the scene’s own camera'],
  ];
  function help() {
    const d = el('dialog', { class: 'lab-keys' }, el('h2', { text: 'Moving around the picture' }),
      el('div', { class: 'lab-keys-grid' }, ROWS().flatMap(([k, v]) => [el('kbd', { text: k }), el('span', { text: v })])),
      el('p', { class: 'hint', text: 'For scenes with a 3D camera. A drag or a flick coasts to a stop; nothing is saved: right-click › View › Keep this view makes the view the scene’s camera. Scenes with their own controls (orbit controls in the starter) keep them; Z and Shift+Z still frame and reset them.' }),
      el('div', { class: 'dialog-actions' }, el('button', { class: 'primary', text: 'Got it', on: { click: () => d.close() } })));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d); d.showModal();
    return d;
  }
  // the keys sheet (the keys button, bottom left): Z / Shift+Z can be clicked there; the gestures are listed to read
  const inLab = () => H.surfaceIdFor?.(H.activeId) === 'tool:three';
  try {
    Keys.add(
      { area: 'Lab', keys: 'Z', what: 'Frame the subject (the selected layer’s 3D scene)', when: inLab, run: frame },
      { area: 'Lab', keys: 'Shift+Z', what: 'Reset the view: the scene’s own camera again', when: inLab, run: reset },
      { area: 'Lab', keys: 'Two-finger scroll · Right-drag', what: 'Turn around the scene (Shift: pan) · pinch or the mouse wheel zooms · middle-drag pans · double-click frames', when: inLab, run: () => help() },
    );
  } catch { /* keys list optional */ }
  // chats: /lab-view frame | reset | keep | help
  try {
    if (typeof Commands !== 'undefined' && !Commands.get('lab-view')) {
      const VERBS = { frame: 'frame the subject (Z)', reset: 'the scene’s own camera again (Shift+Z)', keep: 'keep the view you moved to as the scene’s camera', help: 'how to move around (trackpad, mouse, keys)' };
      Commands.register({
        name: 'lab-view', area: 'Three.js Lab', args: '[frame | reset | keep | help]', keywords: 'camera orbit zoom pan trackpad pinch look around',
        desc: 'The Lab preview’s view: frame the subject, reset it, keep it as the scene’s camera, or how to move around',
        complete: (a) => Object.entries(VERBS).filter(([k]) => k.startsWith(String(a || '').trim().toLowerCase())).map(([value, desc]) => ({ value, desc })),
        run: async (args) => {
          const v = String(args || '').trim().toLowerCase() || 'frame';
          if (v === 'help') { help(); return ''; }
          if (!VERBS[v]) return `Try: ${Object.keys(VERBS).join(', ')}`;
          await ThreeLab.cmd({ show: true });
          const n = seq; send(v);
          for (let i = 0; i < 20 && seq === n; i += 1) await new Promise((r) => setTimeout(r, 100));
          if (seq === n) return 'The preview didn’t answer (is a scene running?)';
          return last.ok ? (last.say || (v === 'frame' ? 'Framed.' : v === 'reset' ? 'Back to the scene’s camera.' : 'Kept.')) : last.say || 'Nothing to do here.';
        },
      });
    }
  } catch { /* commands optional */ }
  return { attach, onBox, viewItems, helpRow, frame, reset, keep, help, seq: () => seq, last: () => last };
})();
