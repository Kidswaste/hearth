// CaptureAnnotate: draw on a screenshot before it goes out: arrows, boxes, circles, lines, pen, highlighter, text,
// numbered badges, blur / pixelate / redact (hide private bits), spotlight, magnifier and crop. Shapes stay editable
// (V to select and drag, Delete removes) until you save; the original file is never changed.
//   CaptureAnnotate.open(pathOrDataUrl, { name }) → the saved path (… annotated.png), or null if closed
//   CaptureAnnotate.render(img, shapes, crop) → canvas (used by tests and by the editor's export)
const CaptureAnnotate = (() => {
  const D = CaptureData;
  const api = () => window.hub.capture;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const MAIN_TOOLS = ['arrow', 'rect', 'text', 'badge', 'blur', 'crop'];
  const prefs = (() => { const p = store.get('capture.annotate', {}); return { tool: p.tool || 'arrow', color: p.color || '#ff6a1a', size: p.size || 'm' }; })();
  const savePrefs = () => store.set('capture.annotate', prefs);

  // ---------- drawing (pure: image + shapes → canvas) ----------
  const px = (img) => Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height) / 1400; // stroke scale for big shots
  function strokeOf(s, k) { return (D.SIZES.find((z) => z.id === s.size)?.px || 6) * Math.max(0.6, k); }
  function arrow(g, x1, y1, x2, y2, w) {
    const a = Math.atan2(y2 - y1, x2 - x1); const head = w * 4.2;
    g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head); g.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head); g.closePath(); g.fill();
  }
  const norm = (s) => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) });
  function drawShape(g, s, img, k) {
    const w = strokeOf(s, k);
    g.save();
    g.strokeStyle = s.color; g.fillStyle = s.color;
    const r = norm(s);
    if (s.type === 'arrow') { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = w; arrow(g, s.x1, s.y1, s.x2, s.y2, w); }
    else if (s.type === 'line') { g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke(); }
    else if (s.type === 'rect') { g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); g.roundRect ? g.roundRect(r.x, r.y, r.w, r.h, w * 1.2) : g.rect(r.x, r.y, r.w, r.h); g.stroke(); }
    else if (s.type === 'ellipse') { g.lineWidth = w; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); g.stroke(); }
    else if (s.type === 'pen' || s.type === 'marker') {
      g.lineWidth = s.type === 'marker' ? w * 3.2 : w; g.lineCap = 'round'; g.lineJoin = 'round';
      if (s.type === 'marker') { g.globalAlpha = 0.38; g.globalCompositeOperation = 'multiply'; }
      g.beginPath(); (s.points || []).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    } else if (s.type === 'text') {
      const fs = Math.round(w * 4.2); g.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; g.textBaseline = 'top';
      g.lineWidth = Math.max(2, fs / 7); g.strokeStyle = s.color === '#111111' ? '#fff' : 'rgba(0,0,0,.75)'; g.lineJoin = 'round';
      String(s.text || '').split('\n').forEach((line, i) => { g.strokeText(line, s.x1, s.y1 + i * fs * 1.2); g.fillText(line, s.x1, s.y1 + i * fs * 1.2); });
    } else if (s.type === 'badge') {
      const rr = w * 2.6; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = w;
      g.beginPath(); g.arc(s.x1, s.y1, rr, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = s.color === '#ffffff' || s.color === '#ffc233' ? '#111' : '#fff'; g.font = `800 ${Math.round(rr * 1.15)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(s.n || 1), s.x1, s.y1 + rr * 0.04);
    } else if (s.type === 'blur' || s.type === 'pixelate') {
      if (r.w > 2 && r.h > 2) {
        g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
        if (s.type === 'blur') { g.filter = `blur(${Math.round(w * 2.2)}px)`; g.drawImage(img, r.x - 20, r.y - 20, r.w + 40, r.h + 40, r.x - 20, r.y - 20, r.w + 40, r.h + 40); }
        else {
          const cell = Math.max(4, Math.round(w * 2)); const tw = Math.max(1, Math.round(r.w / cell)); const th = Math.max(1, Math.round(r.h / cell));
          const t = el('canvas', { width: tw, height: th }); t.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, tw, th);
          g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, tw, th, r.x, r.y, r.w, r.h);
        }
      }
    } else if (s.type === 'redact') { g.fillStyle = '#0b0b0d'; g.fillRect(r.x, r.y, r.w, r.h); }
    else if (s.type === 'magnify') {
      const rad = Math.max(20, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)); const z = 2;
      g.beginPath(); g.arc(s.x1, s.y1, rad, 0, Math.PI * 2); g.save(); g.clip();
      g.drawImage(img, s.x1 - rad / z, s.y1 - rad / z, (rad * 2) / z, (rad * 2) / z, s.x1 - rad, s.y1 - rad, rad * 2, rad * 2); g.restore();
      g.lineWidth = w; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = w * 2; g.beginPath(); g.arc(s.x1, s.y1, rad, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }
  // spotlights dim everything outside all of them, together
  function drawSpots(g, shapes, W, Hh) {
    const spots = shapes.filter((s) => s.type === 'spotlight');
    if (!spots.length) return;
    g.save(); g.fillStyle = 'rgba(0,0,0,.62)'; g.beginPath(); g.rect(0, 0, W, Hh);
    for (const s of spots) { const r = norm(s); g.roundRect ? g.roundRect(r.x, r.y, r.w, r.h, 12) : g.rect(r.x, r.y, r.w, r.h); }
    g.fill('evenodd'); g.restore();
  }
  function render(img, shapes = [], crop = null) {
    const W = img.naturalWidth || img.width; const Hh = img.naturalHeight || img.height;
    const full = el('canvas', { width: W, height: Hh }); const g = full.getContext('2d');
    g.drawImage(img, 0, 0);
    const k = px(img);
    for (const s of shapes.filter((x) => ['blur', 'pixelate', 'redact'].includes(x.type))) drawShape(g, s, img, k);
    drawSpots(g, shapes, W, Hh);
    for (const s of shapes.filter((x) => !['blur', 'pixelate', 'redact', 'spotlight'].includes(x.type))) drawShape(g, s, full, k);
    if (!crop || crop.w < 4 || crop.h < 4) return full;
    const c = el('canvas', { width: Math.round(crop.w), height: Math.round(crop.h) });
    c.getContext('2d').drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    return c;
  }

  // ---------- the editor ----------
  function open(src, { name = '' } = {}) {
    return new Promise((resolve) => {
      (async () => {
        let img;
        try { img = await Capture.loadImage(src); } catch (err) { toast(err.message, { type: 'error' }); resolve(null); return; }
        const W = img.naturalWidth; const Hh = img.naturalHeight;
        const canvas = el('canvas', { width: W, height: Hh, class: 'cap-ann-canvas' });
        const g = canvas.getContext('2d');
        let shapes = []; const undo = []; const redo = []; let crop = null; let sel = null; let drag = null;
        const snap = () => { undo.push(JSON.stringify({ shapes, crop })); if (undo.length > 80) undo.shift(); redo.length = 0; };
        const restore = (s) => { const o = JSON.parse(s); shapes = o.shapes; crop = o.crop; sel = null; paint(); };
        const nextBadge = () => 1 + shapes.filter((s) => s.type === 'badge').reduce((m, s) => Math.max(m, s.n || 0), 0);
        function paint() {
          const out = render(img, shapes, null);
          g.clearRect(0, 0, W, Hh); g.drawImage(out, 0, 0);
          if (crop) { g.save(); g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.rect(0, 0, W, Hh); g.rect(crop.x, crop.y, crop.w, crop.h); g.fill('evenodd'); g.strokeStyle = '#fff'; g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeRect(crop.x, crop.y, crop.w, crop.h); g.restore(); }
          if (sel) { const r = bbox(sel); g.save(); g.strokeStyle = '#3aa7ff'; g.setLineDash([6, 5]); g.lineWidth = Math.max(1.5, px(img) * 2); g.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12); g.restore(); }
        }
        function bbox(s) {
          if (s.points) { const xs = s.points.map((p) => p[0]); const ys = s.points.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
          if (s.type === 'badge') { const r = strokeOf(s, px(img)) * 2.6; return { x: s.x1 - r, y: s.y1 - r, w: r * 2, h: r * 2 }; }
          if (s.type === 'text') { const fs = strokeOf(s, px(img)) * 4.2; const lines = String(s.text).split('\n'); return { x: s.x1, y: s.y1, w: Math.max(...lines.map((l) => l.length)) * fs * 0.58, h: lines.length * fs * 1.2 }; }
          if (s.type === 'magnify') { const r = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); return { x: s.x1 - r, y: s.y1 - r, w: r * 2, h: r * 2 }; }
          return norm(s);
        }
        const hit = (x, y) => [...shapes].reverse().find((s) => { const r = bbox(s); const m = 10 * px(img); return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m; });
        const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * Hh }; };
        canvas.addEventListener('pointerdown', async (e) => {
          if (e.button !== 0) return;
          const p = at(e);
          canvas.setPointerCapture(e.pointerId);
          const t = prefs.tool;
          if (t === 'move') {
            sel = hit(p.x, p.y) || null;
            if (sel) { snap(); drag = { mode: 'move', from: p, orig: JSON.parse(JSON.stringify(sel)) }; }
            paint(); return;
          }
          if (t === 'text') {
            const text = await Modal.prompt('Text', { multiline: true, label: 'Shown where you clicked' });
            if (text?.trim()) { snap(); shapes.push({ type: 'text', color: prefs.color, size: prefs.size, x1: p.x, y1: p.y, text: text.trim() }); paint(); }
            return;
          }
          if (t === 'badge') { snap(); shapes.push({ type: 'badge', color: prefs.color, size: prefs.size, x1: p.x, y1: p.y, n: nextBadge() }); paint(); return; }
          snap();
          if (t === 'crop') { drag = { mode: 'crop', from: p }; crop = { x: p.x, y: p.y, w: 0, h: 0 }; return; }
          const s = { type: t, color: prefs.color, size: prefs.size, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
          if (t === 'pen' || t === 'marker') s.points = [[p.x, p.y]];
          shapes.push(s);
          drag = { mode: 'draw', shape: s, shift: false };
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!drag) return;
          const p = at(e);
          if (drag.mode === 'move') {
            const dx = p.x - drag.from.x; const dy = p.y - drag.from.y; const o = drag.orig;
            Object.assign(sel, { x1: o.x1 + dx, y1: o.y1 + dy, ...(o.x2 != null ? { x2: o.x2 + dx, y2: o.y2 + dy } : {}), ...(o.points ? { points: o.points.map(([x, y]) => [x + dx, y + dy]) } : {}) });
          } else if (drag.mode === 'crop') {
            crop = { x: Math.min(drag.from.x, p.x), y: Math.min(drag.from.y, p.y), w: Math.abs(p.x - drag.from.x), h: Math.abs(p.y - drag.from.y) };
          } else {
            const s = drag.shape;
            if (s.points) s.points.push([p.x, p.y]);
            else {
              let x2 = p.x; let y2 = p.y;
              if (e.shiftKey) {
                if (['rect', 'ellipse', 'blur', 'pixelate', 'redact', 'spotlight'].includes(s.type)) { const d = Math.max(Math.abs(x2 - s.x1), Math.abs(y2 - s.y1)); x2 = s.x1 + Math.sign(x2 - s.x1 || 1) * d; y2 = s.y1 + Math.sign(y2 - s.y1 || 1) * d; }
                else { const a = Math.round(Math.atan2(y2 - s.y1, x2 - s.x1) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(x2 - s.x1, y2 - s.y1); x2 = s.x1 + Math.cos(a) * len; y2 = s.y1 + Math.sin(a) * len; }
              }
              s.x2 = x2; s.y2 = y2;
            }
          }
          paint();
        });
        canvas.addEventListener('pointerup', () => {
          if (drag?.mode === 'draw') { const s = drag.shape; const r = bbox(s); if (!s.points && r.w < 3 && r.h < 3 && s.type !== 'magnify') { shapes.pop(); undo.pop(); } }
          if (drag?.mode === 'crop' && crop && (crop.w < 8 || crop.h < 8)) crop = null;
          drag = null; paint();
        });
        canvas.addEventListener('dblclick', async (e) => {
          const s = hit(at(e).x, at(e).y);
          if (s?.type === 'text') { const t = await Modal.prompt('Text', { value: s.text, multiline: true }); if (t != null) { snap(); s.text = t; paint(); } }
        });

        // tools: the six everyday ones on the bar, the rest behind ⋯ (all have a letter key)
        const toolBtn = (id) => { const t = D.TOOLS.find((x) => x.id === id); return el('button', { type: 'button', class: `cap-ann-tool${prefs.tool === id ? ' on' : ''}`, dataset: { tool: id }, title: `${t.label} (${t.key})`, text: ICON[id] || t.label, on: { click: () => setTool(id) } }); };
        const ICON = { move: '⬚', arrow: '↗', line: '╱', rect: '▢', ellipse: '◯', pen: '✎', marker: '▬', text: 'T', badge: '①', blur: '◌', pixelate: '▦', redact: '■', spotlight: '◐', magnify: '🔍', crop: '⌗' };
        const tools = el('div', { class: 'cap-ann-tools' }, ['move', ...MAIN_TOOLS].map(toolBtn),
          el('button', { type: 'button', class: 'cap-ann-tool', text: '⋯', title: 'More tools: line, circle, pen, highlighter, pixelate, redact, spotlight, magnifier', on: { click: (e) => Capture.menu(e.clientX, e.clientY, D.TOOLS.filter((t) => !MAIN_TOOLS.includes(t.id) && t.id !== 'move').map((t) => ({ label: `${prefs.tool === t.id ? '✓ ' : ''}${ICON[t.id] || ''} ${t.label}  ${t.key}`, action: () => setTool(t.id) }))) } }));
        const swatch = el('button', { type: 'button', class: 'cap-ann-swatch', title: 'Color (1–9, 0)', style: { background: prefs.color }, on: { click: (e) => Capture.menu(e.clientX, e.clientY, D.COLORS.map((c, i) => ({ label: `${prefs.color === c.hex ? '✓ ' : ''}${c.label}  ${(i + 1) % 10}`, action: () => setColor(c.hex) }))) } });
        const sizeBtn = el('button', { type: 'button', class: 'ghost', title: 'Thickness ([ ])', text: D.SIZES.find((z) => z.id === prefs.size)?.label || 'Medium', on: { click: (e) => Capture.menu(e.clientX, e.clientY, D.SIZES.map((z) => ({ label: `${prefs.size === z.id ? '✓ ' : ''}${z.label}`, action: () => setSize(z.id) }))) } });
        function setTool(id) { prefs.tool = id; savePrefs(); for (const b of tools.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === id); canvas.style.cursor = id === 'move' ? 'default' : id === 'text' ? 'text' : 'crosshair'; }
        function setColor(hex) { prefs.color = hex; savePrefs(); swatch.style.background = hex; if (sel) { snap(); sel.color = hex; paint(); } }
        function setSize(id) { prefs.size = id; savePrefs(); sizeBtn.textContent = D.SIZES.find((z) => z.id === id)?.label; if (sel) { snap(); sel.size = id; paint(); } }
        const doUndo = () => { if (!undo.length) return; redo.push(JSON.stringify({ shapes, crop })); restore(undo.pop()); };
        const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify({ shapes, crop })); restore(redo.pop()); };
        const finalCanvas = () => { sel = null; return render(img, shapes, crop); };
        let result = null;
        const save = async ({ close = true } = {}) => {
          const c = finalCanvas();
          const nm = name || `${typeof src === 'string' && !/^data:/.test(src) ? base(src).replace(/\.\w+$/, '') : 'Hearth'} annotated`;
          const out = await api().save({ name: nm, data: Capture.canvasData(c) });
          Capture.remember({ kind: 'shot', path: out, w: c.width, h: c.height });
          result = out;
          if (close) dlg.close();
          return out;
        };
        const foot = el('div', { class: 'cap-view-foot' }, tools, swatch, sizeBtn,
          el('button', { type: 'button', class: 'ghost', text: '↶', title: `Undo (${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Z)`, on: { click: doUndo } }),
          el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Copy', title: 'Copy the result (Ctrl+C)', on: { click: async () => { const c = finalCanvas(); await Capture.copyImage(Capture.canvasData(c)); toast('Copied', { timeout: 1200 }); paint(); } } }),
          el('button', { type: 'button', text: '→ Chat', title: 'Save and attach to the chat', on: { click: async () => { const p = await save(); await Capture.attachToChat(p); } } }),
          el('button', { type: 'button', class: 'primary', text: 'Save', title: 'Save as a new picture (Ctrl+S); the original stays', on: { click: () => save() } }));
        const dlg = el('dialog', { class: 'ui-modal cap-view cap-ann' },
          el('div', { class: 'cap-view-head' }, el('h2', { text: 'Annotate' }), el('span', { class: 'hint', text: `${W}×${Hh} · Shift keeps it straight / square · V selects (drag to move, Delete removes) · double-click edits text` }), el('span', { class: 'spacer' }),
            el('button', { type: 'button', class: 'ghost', text: '✕', title: 'Close without saving (Esc)', on: { click: () => dlg.close() } })),
          el('div', { class: 'cap-view-stage pic cap-ann-stage' }, canvas), foot);
        dlg.addEventListener('keydown', (e) => {
          if (e.target.closest('input, textarea')) return;
          const k = e.key;
          if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
          if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); doRedo(); return; }
          if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'S')) { e.preventDefault(); save(); return; }
          if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'C')) { e.preventDefault(); Capture.copyImage(Capture.canvasData(finalCanvas())).then(() => { toast('Copied', { timeout: 1200 }); paint(); }); return; }
          if ((k === 'Delete' || k === 'Backspace') && sel) { e.preventDefault(); snap(); shapes = shapes.filter((s) => s !== sel); sel = null; paint(); return; }
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const t = D.TOOLS.find((x) => x.key.toLowerCase() === k.toLowerCase());
          if (t) { e.preventDefault(); setTool(t.id); return; }
          if (/^[0-9]$/.test(k)) { const c = D.COLORS[(Number(k) + 9) % 10]; if (c) setColor(c.hex); return; }
          if (k === '[' || k === ']') { const i = D.SIZES.findIndex((z) => z.id === prefs.size); const n = D.SIZES[Math.max(0, Math.min(D.SIZES.length - 1, i + (k === ']' ? 1 : -1)))]; setSize(n.id); }
          if (k === 'Enter' && crop) { e.preventDefault(); save(); }
        });
        dlg.addEventListener('close', () => { setTimeout(() => dlg.remove(), 0); resolve(result); });
        document.body.append(dlg);
        dlg.showModal();
        setTool(prefs.tool);
        paint();
        dlg.annotate = { get shapes() { return shapes; }, set shapes(v) { shapes = v; paint(); }, get crop() { return crop; }, set crop(v) { crop = v; paint(); }, save, undo: doUndo, redo: doRedo, setTool, setColor, setSize };
        CaptureAnnotate.current = dlg;
      })();
    });
  }
  return { open, render, current: null, MAIN_TOOLS };
})();
