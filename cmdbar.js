// Command bar: a slim command line over any tool (Ctrl/⌘+; anywhere, or "/" in the Ctrl+K palette). It uses the
// chat composer's "/" menu (Prompts.attach: pinned, recent here, argument hints, plain-language matches) and runs
// commands in the context of what's on screen: in the Lab, Lab commands (and `when` variants) resolve as they
// do in the docked Three Director chat. Output shows in a small card under the bar instead of a chat.
// Also here: the searchable help view (/help), command history (↑ / ↓), /repeat and "!!", macros (/macro rec),
// timers (/every, /at, /after: kept across a reload, off when Hearth quits), /wait for chains, favorites (/star),
// /undo-report, /what, /how, /discover, and clickable `/commands` inside agents' replies. All local: no tokens.
const CmdBar = (() => {
  const ls = {
    get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not critical */ } },
  };
  const safe = (t) => String(t || '').replace(/`/g, "'");
  const mac = /Mac/.test(navigator.platform);
  const KEY = mac ? '⌘;' : 'Ctrl+;';
  const R = (def) => { if (Commands.get(def.name) && !def.when) { console.warn(`cmdbar: /${def.name} is taken`); return null; } return Commands.register({ area: 'App', ...def, aliases: (def.aliases || []).filter((a) => !Commands.get(a)) }); };

  // ---------- where commands run: the chat of what's on screen ----------
  // A tool → its docked director chat (so `when` variants and ctx.draft land there), a native agent → itself,
  // anything else (a website agent) → Claude. The bar's chip can point it at another chat until you leave the tool.
  let pinnedTarget = null; // { agentId, place }
  function target() {
    const active = H.activeId || '';
    const sid = H.surfaceIdFor(active) || '';
    if (pinnedTarget && pinnedTarget.place === sid && H.agent(pinnedTarget.agentId)) return H.agent(pinnedTarget.agentId);
    if (sid.startsWith('tool:')) {
      const tool = sid.slice(5);
      const docked = H.agents().find((a) => a.dock === tool && a.mode === 'native');
      if (docked) return docked;
    }
    const a = H.agent(active);
    return a?.mode === 'native' ? a : H.claudeAgent() || null;
  }
  function chipMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const sid = H.surfaceIdFor(H.activeId) || '';
    const now = target();
    showMenu(r.left, r.bottom + 4, [
      ...H.agents().filter((a) => a.mode === 'native').map((a) => ({ label: `${a.id === now?.id ? '● ' : ''}Run in ${a.name}'s chat${a.dock ? ` (docked in ${a.dock})` : ''}`, action: () => { pinnedTarget = { agentId: a.id, place: sid }; place(); input.focus(); } })),
      { label: 'Back to the chat of what\'s on screen', action: () => { pinnedTarget = null; place(); input.focus(); } },
      { label: 'Every command…  F1', action: () => help() },
      { label: `Move the bar to the ${pos() === 'top' ? 'bottom' : 'top'}`, action: () => runLine(`/cmdbar ${pos() === 'top' ? 'bottom' : 'top'}`) },
    ]);
  }

  // ---------- the bar ----------
  let bar = null, input = null, out = null, chip = null, menuApi = null;
  let histAt = -1, histDraft = '';
  const pos = () => ls.get('cmdbar.pos', 'top');
  function build() {
    input = el('textarea', { class: 'cmdbar-input', rows: 1, spellcheck: false, placeholder: 'Type / for commands, or what you want (“make it 9 by 16”)  ·  ↑ history  ·  ? help', attrs: { 'aria-label': 'Command' } });
    chip = el('button', { type: 'button', class: 'cmdbar-place', title: 'Commands run here (the chat of what\'s on screen)', on: { mousedown: (e) => e.preventDefault(), click: chipMenu } });
    const helpBtn = el('button', { type: 'button', class: 'ghost cmdbar-btn', text: '?', title: 'Every command, searchable (F1)', on: { mousedown: (e) => e.preventDefault(), click: () => help(input.value.replace(/^\//, '')) } });
    const timersBtn = el('button', { type: 'button', class: 'ghost cmdbar-btn cmdbar-timers', hidden: true, title: 'Your timers (/timers)', on: { mousedown: (e) => e.preventDefault(), click: () => runLine('/timers') } });
    out = el('div', { class: 'cmdbar-out', hidden: true });
    bar = el('div', { class: `cmdbar ${pos()}`, hidden: true, attrs: { role: 'dialog', 'aria-label': 'Command bar' } },
      el('div', { class: 'cmdbar-row' }, chip, el('span', { class: 'cmdbar-field' }, input), timersBtn, helpBtn), out);
    document.body.append(bar);
    menuApi = Prompts.attach(input, (text) => { const a = target(); if (a) { close(); activate(a.id); Native.setDraft(a.id, text); } }, { agentId: () => target()?.id || null, bare: true, below: pos() === 'top' });
    input.addEventListener('input', () => { histAt = -1; grow(); });
    addEventListener('resize', () => { if (isOpen()) place(); });
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', () => setTimeout(() => {
      // clicking elsewhere closes the bar (not its own card, a dialog the command opened, or the menu)
      if (!bar.hidden && !bar.contains(document.activeElement) && !document.querySelector('dialog[open]') && document.getElementById('menu')?.hidden !== false) close();
    }, 180));
    out.addEventListener('click', onOutClick);
  }
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; };
  function place() {
    // over the visible surface (Lab, Video Review, a chat…), centered
    const r = document.getElementById('surfaces')?.getBoundingClientRect() || { left: 0, width: innerWidth, top: 0, bottom: innerHeight };
    const w = Math.min(680, Math.max(320, r.width - 32));
    bar.style.width = `${w}px`;
    bar.style.left = `${Math.round(r.left + (r.width - w) / 2)}px`;
    bar.style.top = pos() === 'top' ? `${Math.round(r.top + 10)}px` : '';
    bar.style.bottom = pos() === 'bottom' ? `${Math.round(innerHeight - r.bottom + 70)}px` : '';
    bar.classList.toggle('top', pos() === 'top');
    bar.classList.toggle('bottom', pos() === 'bottom');
    const p = Commands.place();
    const a = target();
    chip.textContent = `${p.id === 'chat' ? '💬' : '⌁'} ${p.id === 'chat' ? (a?.name || 'Chat') : p.label}`;
    chip.title = `Commands run in ${p.label}${a ? ` · ${a.name}'s chat` : ''} (click: run them in another chat)`;
    bar.querySelector('.cmdbar-timers').hidden = !timers.length;
    bar.querySelector('.cmdbar-timers').textContent = `⏱ ${timers.length}`;
    bar.classList.toggle('rec', Boolean(rec));
  }
  function open(text = '') {
    if (!bar) build();
    bar.hidden = false;
    place();
    input.value = text || unsent;
    text = input.value;
    unsent = '';
    grow();
    input.focus();
    input.setSelectionRange(text.length, text.length);
    if (text) input.dispatchEvent(new Event('input'));
    histAt = -1;
    if (typeof Usage !== 'undefined') Usage.track('Command bar › open');
  }
  // what you were typing when the bar closed comes back next time (Esc on an empty bar forgets it)
  let unsent = '';
  function close() { if (!bar || bar.hidden) return; unsent = input.value.trim() ? input.value : ''; menuApi?.close(); bar.hidden = true; clearOut(); }
  const isOpen = () => Boolean(bar && !bar.hidden);
  const toggle = (text) => (isOpen() ? close() : open(text));

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (out && !out.hidden && !input.value) clearOut(); else if (input.value) { input.value = ''; grow(); menuApi?.close(); } else close(); return; }
    if (e.key === 'F1') { e.preventDefault(); help(input.value.replace(/^\//, '')); return; }
    // Alt+1…9: run your pinned command 1…9 (its arguments go in the bar when it needs some)
    if (e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault(); e.stopPropagation();
      const d = Commands.favs().map(Commands.get).filter(Boolean)[Number(e.code.slice(5)) - 1];
      if (!d) { show(`No pinned command ${e.code.slice(5)}: ☆ in the / menu (or /star) pins one.`); return; }
      if (/^</.test(String(d.args || '').trim())) { input.value = `/${d.name} `; grow(); input.dispatchEvent(new Event('input')); } else runLine(`/${d.name}`);
      return;
    }
    // Ctrl+Z in an empty bar: take back the last command when there is a known way (/undo-report)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !input.value) { e.preventDefault(); undoLast(); return; }
    const menuOpen = menuApi?.isOpen();
    // ↑ / ↓: the commands you ran (when the menu isn't open, or the box is empty)
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (!menuOpen || !input.value.trim() || histAt >= 0)) {
      const h = Commands.history();
      if (!h.length) return;
      e.preventDefault();
      if (histAt < 0) { histDraft = input.value; histAt = h.length; }
      histAt = Math.max(0, Math.min(h.length, histAt + (e.key === 'ArrowUp' ? -1 : 1)));
      menuApi?.close();
      input.value = histAt === h.length ? histDraft : h[histAt];
      if (histAt === h.length) histAt = -1;
      grow();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter runs and keeps the bar for the next command · Ctrl+Enter runs and closes · Alt+Enter keeps the text
      e.preventDefault();
      const text = input.value.trim();
      if (!text) { close(); return; }
      if (!e.altKey) { input.value = ''; grow(); }
      histAt = -1; menuApi?.close();
      runLine(text).then(() => { if (e.ctrlKey || e.metaKey) setTimeout(close, out?.hidden ? 0 : 2500); });
    }
  }

  function undoLast() {
    const line = Commands.last();
    const d = line && Commands.parse(line)?.def;
    const how = d && Commands.undoOf(d);
    if (!how) { show(line ? `No known undo for \`${safe(line)}\`. \`/undo-report\` lists every way back.` : 'Nothing ran yet.'); return; }
    // "/unshuffle (Shift+R) or /undo-sliders" → "/unshuffle": the first complete command in the text (a name and at
    // most one plain word, no <placeholder>), never the same line again
    const cmd = how.split(/(?:^|\s+)or\s+|[()·,;]/).map((s) => s.trim()).filter((s) => /^\/[\w-]+(\s[\w:%.+-]+)?$/.test(s) && Commands.parse(s))
      .find((s) => s !== line.trim() && !(s.split(/\s/).length === 1 && Commands.parse(s).def === Commands.parse(line).def));
    if (cmd && cmd !== line.split(/\s/)[0]) { show(`↶ \`${safe(line)}\` → \`${cmd}\``); runLine(cmd, { keep: true }); }
    else show(`To undo \`${safe(line)}\`: ${how}`);
  }

  // ---------- output card ----------
  let outRun = 0;
  let lastBarLine = '';
  function clearOut() { if (out) { out.replaceChildren(); out.hidden = true; } }
  function show(text, { actions = [], type = '' } = {}) {
    if (!bar || bar.hidden) { toast(String(text).replace(/[*`]/g, '').slice(0, 300), { type: type === 'error' ? 'error' : 'info', timeout: 6000 }); return null; }
    const box = el('div', { class: `cmdbar-note ${type}` },
      el('div', { class: 'body', html: renderMarkdown(String(text)) }),
      actions.length ? el('div', { class: 'note-acts' }, actions.map((a) => el('button', { type: 'button', class: 'ghost small', text: a.label, title: a.title || '', on: { mousedown: (e) => e.preventDefault(), click: () => a.run(box) } }))) : null);
    out.append(box);
    out.hidden = false;
    // copy / to the chat box, for the whole card
    if (!out.querySelector('.cmdbar-out-acts')) {
      out.prepend(el('div', { class: 'cmdbar-out-acts' },
        el('button', { type: 'button', class: 'ghost small', text: '↻', title: 'Run it again', on: { mousedown: (e) => e.preventDefault(), click: () => { if (lastBarLine) runLine(lastBarLine); } } }),
        el('button', { type: 'button', class: 'ghost small', text: '⧉', title: 'Copy the output', on: { mousedown: (e) => e.preventDefault(), click: () => { navigator.clipboard.writeText(outText()); toast('Copied', { timeout: 1200 }); } } }),
        el('button', { type: 'button', class: 'ghost small', text: '📝', title: 'Save the output to Notes (like | note)', on: { mousedown: (e) => e.preventDefault(), click: async () => { await Notes.append(outText()); toast('Saved to Notes', { timeout: 1400 }); } } }),
        el('button', { type: 'button', class: 'ghost small', text: '→ draft', title: 'Put the output in the chat box (like | draft)', on: { mousedown: (e) => e.preventDefault(), click: () => { const a = target(); if (a) { const t = outText(); close(); activate(a.id); Native.setDraft(a.id, t); } } } }),
        el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Clear (Esc)', on: { mousedown: (e) => e.preventDefault(), click: clearOut } })));
    }
    out.scrollTop = out.scrollHeight;
    return box;
  }
  const outText = () => [...out.querySelectorAll('.cmdbar-note .body')].map((b) => b.innerText.trim()).join('\n\n');
  function onOutClick(e) {
    const code = e.target.closest('.cmdbar-note code');
    if (!code || code.closest('pre')) return;
    const t = code.textContent.trim();
    if (!/^\/[\w-]+/.test(t) || !Commands.parse(t.replace(/\s*\[.*$/, '').trim())) return;
    if (/[<[]/.test(t) || /\s$/.test(code.textContent)) { open(`${t.split(/\s[<[]/)[0].trim()} `); return; }
    runLine(t);
  }

  // ---------- running a line ----------
  // Runs "/cmd args" (pipes, "!!", plain words…) the way the bar does: output in the card.
  async function runLine(raw, { agent = target(), quiet = false, keep = false } = {}) {
    let text = String(raw || '').trim();
    if (!text) return false;
    if (!quiet && !isOpen()) open();
    if (++outRun && !quiet && !keep) clearOut();
    if (!agent) { show('Add a native chat agent first (＋ in the rail).', { type: 'error' }); return false; }
    // shell-like prefixes: "?" help · "!!" the last command · "!calc" the last /calc line · "=" math · ">" a message
    if (text === '?') { help(); return true; }
    if (/^\?\S/.test(text)) { help(text.slice(1).trim()); return true; }
    if (text === '!!' || text === '/!!') { text = Commands.last(); if (!text) { show('Nothing ran yet.'); return false; } }
    else if (/^!\S/.test(text)) {
      const w = text.slice(1).toLowerCase();
      const hit = Commands.history().slice().reverse().find((l) => l.toLowerCase().startsWith(`/${w}`)) || Commands.history().slice().reverse().find((l) => l.toLowerCase().includes(w));
      if (!hit) { show(`No command in your history matches “${safe(w)}”.`); return false; }
      text = hit;
    }
    if (/^=\s*\S/.test(text)) text = `/calc ${text.replace(/^=\s*/, '')}`;
    if (/^>\s*\S/.test(text)) {
      const msg = text.replace(/^>\s*/, '');
      Commands.addHistory(text);
      if (!quiet) close();
      if (H.surfaceIdFor(agent.id) === H.surfaceIdFor(H.activeId)) Native.focus(agent.id); else activate(agent.id);
      await Native.sendText(agent.id, msg);
      return true;
    }
    // a timer-free plain sentence: the best matches as buttons
    if (!text.startsWith('/')) {
      const s = Commands.suggest(text, { limit: 5, ctx: Commands.context(agent.id, null, { source: 'bar' }) });
      show(s.length ? `**Commands for “${safe(text)}”**\n${s.map((x) => `- \`${x.line.trim()}\` ${x.def.desc}`).join('\n')}` : `No command matches “${safe(text)}”.`,
        { actions: [...(s[0] && !s[0].fill ? [{ label: `Run ${s[0].line.trim()}`, run: () => runLine(s[0].line) }] : []), { label: `Send to ${agent.name}`, title: 'Send these words as a message', run: () => { close(); activate(agent.id); Native.sendText(agent.id, text); } }] });
      return false;
    }
    if (!Commands.parse(text)) {
      const means = Commands.didYouMean(text, { limit: 4 });
      show(`\`${safe(text.split(/\s/)[0])}\` isn't a command.${means.length ? ` Did you mean ${means.map((m) => `\`${m.line.trim()}\``).join(' · ')}?` : ' `/help` lists them all.'}`,
        { actions: [...(means[0] ? [{ label: `Run ${means[0].line.trim()}`, run: () => runLine(means[0].line) }] : []), { label: `Send to ${agent.name}`, run: () => { close(); activate(agent.id); Native.sendText(agent.id, text); } }] });
      return false;
    }
    const opts = {
      source: 'bar',
      say: (t) => show(t),
      note: (t, o) => show(t, o),
      error: (m) => show(m, { type: 'error' }),
      // the command fills the chat box: go there
      draft: (t) => { close(); activate(agent.id); Native.setDraft(agent.id, t); },
    };
    if (quiet) Object.assign(opts, { say: (t) => toast(String(t).replace(/[*`]/g, '').slice(0, 240), { timeout: 4000 }), note: (t) => toast(String(t).replace(/[*`]/g, '').slice(0, 240), { timeout: 4000 }) });
    if (!quiet) lastBarLine = text;
    const ok = await Commands.tryRun(text, agent.id, null, opts);
    if (isOpen() && document.activeElement !== input && !document.querySelector('dialog[open]') && !document.activeElement?.closest?.('.composer, .notes-panel')) input.focus();
    return ok;
  }

  // ---------- shortcuts ----------
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === ';' || e.code === 'Semicolon')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) help(); else toggle(); }
  }, true);
  window.hub.onShortcut?.((s) => { if (s?.key === ';') { if (s.shift) help(); else toggle(); } }); // Ctrl+Shift+; → the help view

  // ---------- help view ----------
  // A compact dialog: search (names, words, plain language), an area / list picker, each command with its
  // arguments, shortcut, ★, examples you can run and a ▶ try button.
  function help(filter = '') {
    document.querySelector('dialog.cmd-help')?.close();
    const dlg = el('dialog', { class: 'ui-modal cmd-help' });
    const q = el('input', { class: 'cmd-help-q', placeholder: `Search ${Commands.list().length} commands: a name, a word, or what you want to do`, value: filter });
    const groups = [['all', 'All areas'], ['pinned', '★ Pinned'], ['recent', 'Recent'], ['here', `In ${Commands.place().label}`], ['examples', 'With examples'], ['keys', 'With shortcuts'], ['yours', 'Yours (aliases, macros)'],
      ...Commands.areas().map((a) => [`area:${a}`, `${a} (${Commands.list().filter((d) => d.area === a).length})`])];
    const area = el('select', { class: 'cmd-help-area', title: 'Show one area or list' }, groups.map(([v, l]) => el('option', { value: v, text: l })));
    area.value = ls.get('cmdbar.helpArea', 'all');
    if (![...area.options].some((o) => o.value === area.value)) area.value = 'all';
    // "/help lab", "/help video": an area's name opens that area
    const f = String(filter || '').trim().toLowerCase();
    const areaHit = f && Commands.areas().find((a) => a.toLowerCase() === f || a.toLowerCase().split(/[\s.]+/).includes(f));
    if (areaHit) { area.value = `area:${areaHit}`; q.value = ''; }
    else if (f) area.value = 'all';
    const listEl = el('div', { class: 'cmd-help-list' });
    const count = el('span', { class: 'cmd-help-count' });
    let rows = [], sel = 0;
    const tryLine = (line, fill) => { dlg.close(); if (fill) open(line); else runLine(line); };
    // a small right-click menu inside the dialog (the app's #menu would sit under the modal)
    const popMenu = (e, items) => {
      dlg.querySelector('.cmd-help-pop')?.remove();
      const card = dlg.querySelector('.cmd-help-card');
      const r = card.getBoundingClientRect();
      const pop = el('div', { class: 'cmd-help-pop', style: { left: `${Math.min(e.clientX - r.left, r.width - 250)}px`, top: `${Math.min(e.clientY - r.top, r.height - 40 * items.length)}px` } },
        items.map((it) => el('button', { type: 'button', text: it.label, on: { click: () => { pop.remove(); it.action(); } } })));
      card.append(pop);
      setTimeout(() => dlg.addEventListener('click', () => pop.remove(), { once: true }), 0);
    };
    const row = (d, line) => {
      const exs = Commands.examplesOf(d).slice(0, 4);
      const needs = /^</.test(String(d.args || '').trim());
      const starBtn = el('button', { type: 'button', class: `ghost small cmd-star${Commands.isFav(d.name) ? ' on' : ''}`, text: Commands.isFav(d.name) ? '★' : '☆', title: 'Pin to the top of the / menu', on: { click: (e) => { e.stopPropagation(); const on = Commands.toggleFav(d.name); starBtn.textContent = on ? '★' : '☆'; starBtn.classList.toggle('on', on); } } });
      const go = () => tryLine(line || (needs ? `/${d.name} ` : `/${d.name}`), !line && needs);
      const menu = (e) => {
        e.preventDefault();
        const plain = `/${d.name}`;
        popMenu(e, [
          { label: needs ? 'Fill it in the command bar' : 'Run it', action: go },
          ...(needs ? [] : [{ label: 'Put it in the command bar', action: () => tryLine(`${plain} `, true) }]),
          { label: Commands.isFav(d.name) ? 'Unpin from the / menu' : 'Pin to the / menu', action: () => { Commands.toggleFav(d.name); render(); } },
          { label: 'Copy the command', action: () => navigator.clipboard.writeText(line ? line.trim() : plain) },
          { label: 'Everything about it (/what)', action: () => tryLine(`/what ${d.name}`) },
          { label: 'Make my own shortcut for it (/alias)…', action: () => tryLine(`/alias my-${d.name} ${line ? line.trim() : plain}`, true) },
          { label: 'Run it on a timer (/every)…', action: () => tryLine(`/every 5m ${line ? line.trim() : plain}`, true) },
        ]);
      };
      const undo = Commands.undoOf(d);
      const where = d.variants?.filter((v) => v.whenLabel).map((v) => `${v.whenLabel}: ${v.area}`).join(' · ');
      const r = el('div', { class: 'cmd-help-row', dataset: { name: d.name }, on: { dblclick: go, contextmenu: menu } },
        el('div', { class: 'cmd-help-top' },
          el('code', { class: 'cmd-help-name', text: line ? line.trim() : `/${d.name}${d.args ? ` ${d.args}` : ''}` }),
          d.keys ? el('kbd', { text: Commands.keyText(d.keys) }) : null,
          el('span', { class: 'spacer' }), starBtn,
          el('button', { type: 'button', class: 'ghost small cmd-try', text: needs && !line ? '✎ fill' : '▶ try', title: needs && !line ? 'Put it in the command bar to add the arguments' : 'Run it now (in the command bar)', on: { click: (e) => { e.stopPropagation(); go(); } } })),
        el('div', { class: 'cmd-help-desc', text: `${d.desc}${d.aliases.length ? ` · also /${d.aliases.join(', /')}` : ''}` }),
        undo || where ? el('div', { class: 'cmd-help-meta' }, where ? el('span', { text: `⇄ ${where}`, title: 'The same name does something else there' }) : null, undo ? el('span', { text: `↶ ${undo}`, title: 'How to take it back' }) : null) : null,
        exs.length ? el('div', { class: 'cmd-help-ex' }, exs.map((x) => el('button', { type: 'button', class: 'ex-chip', text: x, title: 'Run this example', on: { click: (e) => { e.stopPropagation(); tryLine(x); } } }))) : null);
      return r;
    };
    const render = () => {
      const s = q.value.trim().toLowerCase().replace(/^\//, '');
      const g = area.value;
      ls.set('cmdbar.helpArea', g);
      let defs = Commands.list().filter((d) => !d.hidden || s);
      const recent = Commands.recent();
      if (g === 'pinned') defs = Commands.favs().map(Commands.get).filter(Boolean);
      else if (g === 'recent') defs = [...new Set([...Commands.recent(Commands.place().id), ...recent])].map(Commands.get).filter(Boolean);
      else if (g === 'here') { const a = Commands.place().area; defs = defs.filter((d) => d.area === a || d.variants?.some((v) => v.area === a)); }
      else if (g === 'examples') defs = defs.filter((d) => Commands.examplesOf(d).length);
      else if (g === 'keys') defs = defs.filter((d) => d.keys);
      else if (g === 'yours') defs = defs.filter((d) => d.area === 'Yours');
      else if (g.startsWith('area:')) defs = defs.filter((d) => d.area === g.slice(5));
      const best = [];
      if (s) {
        const words = s.split(/\s+/);
        const hit = defs.filter((d) => { const hay = `${d.name} ${d.aliases.join(' ')} ${d.desc} ${d.area} ${Commands.keywordsOf(d)} ${d.args}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
        // plain language first ("make it vertical" → /size 9:16), then text matches
        for (const x of Commands.suggest(s, { limit: 4 })) if (x.score >= 4 && (g === 'all' || defs.includes(x.def))) best.push(x);
        defs = hit.sort((a, b) => (b.name.startsWith(s) ? 1 : 0) - (a.name.startsWith(s) ? 1 : 0));
      }
      const nodes = [];
      rows = [];
      if (best.length) {
        nodes.push(el('div', { class: 'cmd-help-head', text: 'Best matches' }));
        for (const x of best) { const r = row(x.def, x.fill ? '' : x.line); rows.push(r); nodes.push(r); }
      }
      let last = '';
      for (const d of defs.slice(0, 220)) {
        if (best.some((b) => b.def === d)) continue;
        if (!s && g === 'all' && d.area !== last) { last = d.area; nodes.push(el('div', { class: 'cmd-help-head', text: d.area })); }
        const r = row(d); rows.push(r); nodes.push(r);
      }
      if (!rows.length) nodes.push(el('div', { class: 'cmd-help-empty', text: g === 'pinned' ? 'No pinned commands yet: ☆ on any row (or /star <command>) pins it to the top of the / menu.' : 'Nothing matches. Try other words, or “All areas”.' }));
      listEl.replaceChildren(...nodes);
      count.textContent = `${rows.length}${defs.length > 220 ? '+' : ''} shown`;
      sel = 0; paint();
    };
    const paint = () => { rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); rows[sel]?.scrollIntoView({ block: 'nearest' }); };
    q.addEventListener('input', render);
    area.addEventListener('change', () => { render(); q.focus(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); rows[sel]?.querySelector('.cmd-try')?.click(); }
    });
    const tips = el('div', { class: 'cmd-help-tips' },
      el('span', { html: `<kbd>${KEY}</kbd> command bar anywhere` }), el('span', { html: '<kbd>↑</kbd> history · <code>!!</code> again' }),
      el('span', { html: '<code>| draft</code> <code>| copy</code> pipes' }), el('span', { html: '<code>/alias</code> <code>/macro</code> <code>/every</code> <code>/at</code>' }));
    dlg.append(el('div', { class: 'cmd-help-card' },
      el('div', { class: 'cmd-help-bar' }, el('h2', { text: 'Commands' }), q, area, count,
        el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Close (Esc)', on: { click: () => dlg.close() } })),
      listEl, tips));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    dlg.showModal();
    q.focus();
    render();
    if (typeof Usage !== 'undefined') Usage.track('Command bar › help view');
    return dlg;
  }

  // ---------- clickable commands in agents' replies ----------
  // Inline code in a reply that is exactly an existing command (e.g. `/size 9:16`) runs when clicked. Nothing is
  // added to any prompt: it's only a look at text already on screen.
  const exactCmd = (t) => {
    const s = String(t || '').trim();
    if (!/^\/[\w-]+(\s[^\n]{0,100})?$/.test(s) || /[<[\]>…]/.test(s) || /\s\|\s/.test(s.replace(/\s\|\s*(draft|copy|send|note|say)\s*$/, ''))) return null;
    return Commands.parse(s) ? s : null;
  };
  // `/size <ratio>` (a command with a placeholder) is clickable too: it goes into the command bar to fill in
  const fillCmd = (t) => { const m = String(t || '').trim().match(/^\/([\w-]+)\s+[<[]/); return m && Commands.get(m[1]) ? `/${Commands.get(m[1]).name} ` : null; };
  const linksOn = () => ls.get('cmdbar.links', true);
  function decorate(root = document) {
    if (!linksOn()) return;
    for (const c of root.querySelectorAll('.msg:not(.note):not(.user) code:not([data-cmdchk]), .notes-panel code:not([data-cmdchk])')) {
      c.dataset.cmdchk = '1';
      if (c.closest('pre')) continue;
      const line = exactCmd(c.textContent);
      const fill = !line && fillCmd(c.textContent);
      if (!line && !fill) continue;
      c.classList.add('cmd-code');
      if (fill) c.classList.add('fill');
      c.title = line ? `Run ${line} (click) · Alt+click: put it in the command bar · ${Commands.parse(line).def.desc}` : `Fill it in the command bar (click) · ${Commands.parse(fill.trim()).def.desc}`;
    }
  }
  let decoTimer = 0;
  new MutationObserver(() => { clearTimeout(decoTimer); decoTimer = setTimeout(() => decorate(), 250); })
    .observe(document.body, { childList: true, subtree: true });
  function agentOfNode(node) {
    for (const [sid, s] of H.surfaces) {
      if (!s.el.contains(node)) continue;
      if (!sid.startsWith('tool:')) return H.agent(sid);
      return H.agents().find((a) => a.dock === sid.slice(5) && a.mode === 'native') || null;
    }
    return null;
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest?.('code.cmd-code');
    if (!c || !linksOn()) return;
    const line = exactCmd(c.textContent);
    const fill = !line && fillCmd(c.textContent);
    if (!line && !fill) return;
    e.preventDefault(); e.stopPropagation();
    if (fill) { open(fill); return; }
    const a = agentOfNode(c) || target();
    if (e.altKey) { open(line); return; }
    if (typeof Usage !== 'undefined') Usage.track('Command bar › command in a reply');
    Commands.exec(line, a?.id);
  }, true);

  // ---------- timers: /every, /at, /after ----------
  // Kept in localStorage so a reload (Ctrl+Shift+R) keeps them; a fresh start of Hearth clears them ("off on quit").
  const TKEY = 'cmdbar.timers';
  let timers = [];
  const handles = new Map();
  const reloaded = (() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      const same = sessionStorage.getItem('cmdbar.session') === '1';
      sessionStorage.setItem('cmdbar.session', '1');
      return same || nav?.type === 'reload';
    } catch { return false; }
  })();
  // "5m", "30s", "1h30m", "90" (seconds), "500ms", "2.5m", "8 bars" / "4 beats" (at the Lab's tempo)
  function parseDur(s) {
    const t = String(s || '').trim().toLowerCase();
    const bars = t.match(/^(\d+(?:\.\d+)?)\s*(bars?|beats?)$/);
    if (bars) {
      const bpm = ThreeLab.peek?.()?.state?.bpm;
      if (!bpm) throw new Error('no tempo yet: load a song in the Lab (or give seconds)');
      return Number(bars[1]) * (60000 / bpm) * (/^bar/.test(bars[2]) ? 4 : 1);
    }
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 1000;
    let ms = 0, any = false;
    for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|hours?|m|mins?|minutes?|s|secs?|seconds?)/g)) {
      any = true;
      const n = Number(m[1]), u = m[2];
      ms += u === 'ms' ? n : /^h/.test(u) ? n * 3600000 : /^m/.test(u) ? n * 60000 : n * 1000;
    }
    if (!any) throw new Error(`"${s}" isn't a duration (e.g. 30s, 5m, 1h, 8 bars)`);
    return ms;
  }
  const fmtDur = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${Math.round(ms / 100) / 10}s` : ms < 3600000 ? `${Math.round(ms / 6000) / 10}m` : `${Math.round(ms / 360000) / 10}h`);
  // "21:30", "9pm", "9:15am", "in 10m" → a time today (or tomorrow if it has passed)
  function parseAt(s) {
    const t = String(s || '').trim().toLowerCase();
    const inM = t.match(/^in\s+(.+)$/);
    if (inM) return Date.now() + parseDur(inM[1]);
    if (/^(noon|midday)$/.test(t)) return parseAt('12:00');
    if (t === 'midnight') return parseAt('0:00');
    const tm = t.match(/^tomorrow\s+(.+)$/);
    if (tm) { const d = new Date(parseAt(tm[1])); if (d.getDate() === new Date().getDate()) d.setDate(d.getDate() + 1); return d.getTime(); }
    const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) throw new Error(`"${s}" isn't a time (21:30, 9pm, in 10m)`);
    let h = Number(m[1]); const min = Number(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) throw new Error(`"${s}" isn't a time`);
    const d = new Date(); d.setHours(h, min, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const saveTimers = () => { ls.set(TKEY, timers); if (bar && !bar.hidden) place(); };
  function schedule(t) {
    clearTimeout(handles.get(t.id));
    const wait = Math.max(0, t.next - Date.now());
    handles.set(t.id, setTimeout(() => fire(t.id), Math.min(wait, 2 ** 31 - 1)));
  }
  async function fire(id) {
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    if (Date.now() < t.next - 50) { schedule(t); return; } // a very long wait was capped
    // paused (/timers-pause): repeating timers skip their turn, one-shot ones wait until you resume
    if (ls.get('cmdbar.timersPaused', false)) { if (t.every) t.next += t.every; else t.next = Date.now() + 5000; schedule(t); saveTimers(); return; }
    const agent = H.agent(t.agentId) || target();
    t.runs = (t.runs || 0) + 1;
    if (t.every) { t.next = Math.max(t.next + t.every, Date.now() + 500); schedule(t); } else timers = timers.filter((x) => x !== t);
    saveTimers();
    let failed = false;
    await Commands.tryRun(t.cmd, agent?.id, null, {
      source: 'timer', history: false,
      say: (x) => { if (!t.quiet) toast(`⏱ ${t.cmd}: ${String(x).replace(/[*`]/g, '').slice(0, 200)}`, { timeout: 3500 }); },
      note: (x) => { if (!t.quiet) toast(`⏱ ${String(x).replace(/[*`]/g, '').slice(0, 200)}`, { timeout: 3500 }); },
      error: (m) => { failed = true; toast(`⏱ ${m}`, { type: 'error' }); },
    });
    // three failures in a row stop a repeating timer (so a broken one doesn't nag forever)
    if (t.every) { t.fails = failed ? (t.fails || 0) + 1 : 0; if (t.fails >= 3) { cancel(t.id); toast(`⏱ Stopped “${t.cmd}” after 3 errors`, { type: 'error' }); } else saveTimers(); }
  }
  function addTimer({ every = 0, at = 0, cmd, quiet = false }) {
    if (!Commands.parse(cmd)) throw new Error(`“${cmd}” isn't a command`);
    if (timers.length >= 30) throw new Error('30 timers at most: /timer-cancel some first');
    const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, cmd, every, next: every ? Date.now() + every : at, agentId: target()?.id || null, place: Commands.place().label, created: Date.now(), quiet };
    timers.push(t);
    saveTimers();
    schedule(t);
    return t;
  }
  function cancel(id) {
    const gone = timers.filter((t) => id === 'all' || t.id === id);
    for (const t of gone) clearTimeout(handles.get(t.id));
    timers = timers.filter((t) => !gone.includes(t));
    saveTimers();
    return gone.length;
  }
  const timerText = (t, i) => `${i + 1}. \`${safe(t.cmd)}\` ${t.every ? `every ${fmtDur(t.every)}` : `at ${new Date(t.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} · next in ${fmtDur(Math.max(0, t.next - Date.now()))}${t.runs ? ` · ran ${t.runs}×` : ''}${t.quiet ? ' · quiet' : ''}`;
  // restore after a reload; a fresh start forgets them
  if (reloaded) {
    timers = ls.get(TKEY, []).filter((t) => t && t.cmd && (t.every || t.next > Date.now() - 60000));
    setTimeout(() => { for (const t of timers) { if (!t.every && t.next < Date.now()) t.next = Date.now() + 1500; schedule(t); } }, 2500);
  } else ls.set(TKEY, []);
  // "/every 5m /shuffle" or "/every 30s quiet /tap"
  const splitCmd = (args) => { const i = String(args || '').indexOf(' /'); return i < 0 ? null : { when: args.slice(0, i).trim(), cmd: args.slice(i + 1).trim() }; };

  // ---------- macros: record the commands you run ----------
  let rec = null; // { name, lines: [] }
  Commands.onRun(({ line, def, source, nested }) => {
    if (!rec || nested || source === 'timer' || ['macro', 'repeat', 'help', 'every', 'at', 'after', 'timers', 'timer-cancel', 'cmd-history', 'what', 'how'].includes(def.name)) return;
    rec.lines.push(line);
    if (bar && !bar.hidden) place();
  });

  // =============================================================================================================
  // Commands
  // =============================================================================================================
  R({
    name: 'cmdbar', aliases: ['bar-cmd', 'cmd'], keys: 'Ctrl+;', args: '[top | bottom | <command>]', desc: 'The command bar over any tool (Ctrl/⌘+;): commands run in what\'s on screen; top / bottom moves it',
    keywords: 'command line console bar launcher prompt',
    complete: () => [{ value: 'top', hint: 'At the top of the view' }, { value: 'bottom', hint: 'Above the meter, at the bottom' }],
    examples: ['/cmdbar', '/cmdbar bottom', '/cmdbar /lab-state'],
    run: (args) => {
      const a = args.trim();
      if (/^(top|bottom)$/i.test(a)) { ls.set('cmdbar.pos', a.toLowerCase()); if (bar) { bar.remove(); bar = null; } open(); return null; }
      if (a.startsWith('/')) { runLine(a); return null; }
      setTimeout(() => open(), 30);
      return null;
    },
  });
  R({
    name: 'repeat', area: 'App', args: '[n] [/command]', when: (ctx, args) => ctx?.source === 'bar' || /^(\d+\b|\/|cmd\b|last-cmd\b)/i.test(String(args || '').trim()), whenLabel: 'with a count, a /command, or in the command bar',
    desc: 'Run the last command again (n times), or a command n times: /repeat 3 /tap',
    examples: ['/repeat', '/repeat 3', '/repeat 4 /tap'],
    run: async (args, ctx) => {
      const m = String(args || '').trim().match(/^(?:(\d+)\s*)?(?:cmd|last-cmd)?\s*(\/[\s\S]+)?$/i) || [];
      const n = Math.min(Math.max(Number(m[1] || 1), 1), 50);
      const line = (m[2] || Commands.last() || '').trim();
      if (!line) return 'Nothing ran yet. Run a command first, or `/repeat 3 /tap`.';
      if (/^\/repeat\b/.test(line)) return 'That would repeat itself.';
      for (let i = 0; i < n; i++) await Commands.tryRun(line, ctx.agentId, null, { source: ctx.source, say: ctx.say, note: ctx.note, history: false });
      return n > 1 ? `Ran \`${safe(line)}\` ${n}×` : null;
    },
  });
  R({
    name: 'wait', aliases: ['sleep', 'delay'], args: '<time>', desc: 'Pause a /run chain or a macro (e.g. /run /freeze ; /wait 2s ; /freeze off)', keywords: 'pause chain macro',
    examples: ['/run /shuffle ; /wait 2s ; /unshuffle'],
    run: async (args) => { const ms = Math.min(parseDur(args || '1s'), 600000); await new Promise((r) => setTimeout(r, ms)); return null; },
  });
  R({
    name: 'every', args: '<interval> [quiet] </command>', desc: 'Run a command on a timer: /every 5m /shuffle, /every 8 bars /reshuffle (kept across a reload, off when Hearth quits)',
    keywords: 'timer interval schedule loop repeat periodically automatically',
    examples: ['/every 30s /lab-state', '/every 8 bars /shuffle colors subtle', '/every 10m quiet /backup now'],
    run: (args) => {
      const s = splitCmd(args);
      if (!s) return 'Use `/every <interval> /command`, e.g. `/every 5m /shuffle` (`/timers` lists them).';
      const quiet = /\bquiet$/.test(s.when);
      const every = parseDur(s.when.replace(/\s*quiet$/, ''));
      if (every < 1000) throw new Error('every 1 second at the fastest');
      const t = addTimer({ every, cmd: s.cmd, quiet });
      return `⏱ \`${safe(t.cmd)}\` every ${fmtDur(every)} (first in ${fmtDur(every)}) · \`/timers\` lists them · \`/timer-cancel ${timers.length}\` stops it`;
    },
  });
  R({
    name: 'at', args: '<time | in 10m> </command>', desc: 'Run a command once at a time today (21:30, 9pm) or after a while (in 10m)',
    keywords: 'timer schedule later remind alarm clock',
    examples: ['/at 21:30 /freeze', '/at in 10m /echo stretch your legs'],
    run: (args) => {
      const s = splitCmd(args);
      if (!s) return 'Use `/at <time> /command`, e.g. `/at 21:30 /freeze` or `/at in 10m /echo break`.';
      const t = addTimer({ at: parseAt(s.when), cmd: s.cmd });
      return `⏱ \`${safe(t.cmd)}\` at ${new Date(t.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (in ${fmtDur(t.next - Date.now())})`;
    },
  });
  R({
    name: 'after', aliases: ['later-cmd'], args: '<delay> </command>', desc: 'Run a command once after a delay: /after 2m /unfreeze', keywords: 'timer delay later',
    examples: ['/after 30s /freeze off', '/after 2m /echo check the render'],
    run: (args) => { const s = splitCmd(args); if (!s) return 'Use `/after <delay> /command`'; const t = addTimer({ at: Date.now() + parseDur(s.when), cmd: s.cmd }); return `⏱ \`${safe(t.cmd)}\` in ${fmtDur(t.next - Date.now())}`; },
  });
  R({
    name: 'timers', aliases: ['schedules'], desc: 'Your command timers (/every, /at, /after), with buttons to stop them',
    run: (_a, ctx) => {
      if (!timers.length) return 'No timers. `/every 5m /shuffle` · `/at 21:30 /freeze` · `/after 30s /freeze off`';
      ctx.note(`**Timers** (kept across a reload, off when Hearth quits)\n${timers.map(timerText).join('\n')}`, {
        id: 'timers',
        actions: [...timers.slice(0, 6).map((t, i) => ({ label: `Stop ${i + 1}`, run: (box) => { cancel(t.id); box?.remove?.(); } })), { label: 'Stop all', run: (box) => { cancel('all'); box?.remove?.(); toast('Every timer stopped', { timeout: 1500 }); } }],
      });
      return null;
    },
  });
  R({
    name: 'timer-cancel', aliases: ['untimer', 'stop-timer'], args: '<n | all>', desc: 'Stop a timer by its number in /timers (or all)',
    complete: () => [...timers.map((t, i) => ({ value: String(i + 1), hint: t.cmd })), { value: 'all' }],
    run: (args) => {
      const a = args.trim().toLowerCase();
      if (a === 'all') return `Stopped ${cancel('all')} timer(s).`;
      const t = timers[Number(a) - 1];
      if (!t) return timers.length ? `No timer ${a}: \`/timers\` lists ${timers.length}.` : 'No timers.';
      cancel(t.id);
      return `Stopped \`${safe(t.cmd)}\`.`;
    },
  });
  R({
    name: 'macro', aliases: ['macros'], args: '[rec <name> | stop | cancel | <name> </cmd ; /cmd…> | show <name> | edit <name> | delete <name>]',
    desc: 'Macros: record the commands you run (rec … stop) into your own command, or write one with ; between steps',
    keywords: 'record recording sequence steps automate playback',
    examples: ['/macro rec drop', '/macro stop', '/macro vertical-look /size 9:16 ; /freeze ; /still'],
    complete: (a) => (a.includes(' ') ? [] : [{ value: 'rec ', hint: 'Start recording' }, { value: 'stop', hint: 'Save the recording' }, { value: 'cancel', hint: 'Drop the recording' }, { value: 'show ', hint: 'A macro\'s steps' }, { value: 'edit ', hint: 'Change the steps' }, { value: 'delete ', hint: 'Remove one' }]),
    run: async (args, ctx) => {
      const a = String(args || '').trim();
      const all = store.get('chat.aliases', {});
      const [w, ...restW] = a.split(/\s+/);
      const rest = restW.join(' ');
      if (!a) {
        const mine = Object.entries(all);
        return `${rec ? `● Recording **${rec.name}** (${rec.lines.length} step(s)): \`/macro stop\` saves it.\n\n` : ''}${mine.length ? `**Your commands and macros**\n${mine.map(([n, t]) => `- \`/${n}\` → ${safe(t).slice(0, 120)}`).join('\n')}` : 'No macros yet: `/macro rec <name>`, run some commands, then `/macro stop`.'}`;
      }
      if (/^(rec|record|start)$/i.test(w)) {
        const name = rest.toLowerCase().replace(/^\//, '');
        if (!/^[a-z0-9][\w-]*$/.test(name)) return 'Give it a name: `/macro rec drop-look`';
        if (Commands.get(name) && !all[name]) return `/${name} already exists. Pick another name.`;
        rec = { name, lines: [] };
        if (bar && !bar.hidden) place();
        toast(`● Recording /${name}: run commands, then /macro stop`, { timeout: 3500 });
        return `● Recording **/${name}**: every command you run now is a step. \`/macro stop\` saves it, \`/macro cancel\` drops it.`;
      }
      if (/^(stop|save|end)$/i.test(w)) {
        if (!rec) return 'Not recording. `/macro rec <name>` starts.';
        const r = rec; rec = null;
        if (bar && !bar.hidden) place();
        if (!r.lines.length) return 'Nothing recorded (no command ran).';
        await Commands.tryRun(`/alias ${r.name} /run ${r.lines.join(' ; ')}`, ctx.agentId, null, { source: ctx.source, say: () => {}, history: false });
        return `Saved **/${r.name}** (${r.lines.length} step(s)):\n${r.lines.map((l, i) => `${i + 1}. \`${safe(l)}\``).join('\n')}\nRun it: \`/${r.name}\` · see it: \`/macro show ${r.name}\``;
      }
      if (/^edit$/i.test(w)) {
        const name = rest.toLowerCase().replace(/^\//, '');
        if (!all[name]) return `No macro /${name}. \`/macro\` lists yours.`;
        const steps = all[name].replace(/^\/run\s+/, '').split(/\s*;\s*(?=\/)/);
        const text = await Modal.prompt(`Edit /${name}: one command per line`, { value: steps.join('\n'), multiline: true });
        if (text == null) return null;
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return 'Empty: kept it as it was (`/macro delete` removes it).';
        await Commands.tryRun(`/alias ${name} ${lines.length > 1 ? `/run ${lines.join(' ; ')}` : lines[0]}`, ctx.agentId, null, { source: ctx.source, say: () => {}, history: false });
        return `Saved **/${name}** (${lines.length} step(s)).`;
      }
      if (/^cancel$/i.test(w)) { const had = Boolean(rec); rec = null; if (bar && !bar.hidden) place(); return had ? 'Recording dropped.' : 'Not recording.'; }
      if (/^show$/i.test(w)) { const t = all[rest.toLowerCase().replace(/^\//, '')]; return t ? `\`/${rest}\` →\n${t.replace(/^\/run\s+/, '').split(/\s*;\s*(?=\/)/).map((l, i) => `${i + 1}. \`${safe(l)}\``).join('\n')}` : `No macro /${rest}.`; }
      if (/^(delete|remove|rm)$/i.test(w)) return (await Commands.tryRun(`/unalias ${rest}`, ctx.agentId, null, { source: ctx.source, say: ctx.say })) ? null : 'Could not remove it.';
      // "/macro name /a ; /b": write one directly (same as /alias with /run)
      const m = a.match(/^([a-z0-9][\w-]*)\s+(\/[\s\S]+)$/i);
      if (!m) return 'Use `/macro rec <name>` … `/macro stop`, or `/macro <name> /cmd one ; /cmd two`.';
      const steps = m[2].split(/\s*;\s*(?=\/)/).filter(Boolean);
      await Commands.tryRun(`/alias ${m[1].toLowerCase()} ${steps.length > 1 ? `/run ${steps.join(' ; ')}` : steps[0]}`, ctx.agentId, null, { source: ctx.source, say: () => {}, history: false });
      return Commands.get(m[1]) ? `Made **/${m[1].toLowerCase()}** (${steps.length} step(s)).` : 'Could not make it (is the name taken?).';
    },
  });
  R({
    name: 'star', aliases: ['pin-cmd', 'fav-cmd'], args: '<command>', desc: 'Pin a command to the top of the / menu (again: unpin); ☆ in the menu does the same',
    keywords: 'favorite favourite pin bookmark command menu',
    complete: (a) => Commands.matching(a.replace(/^\//, '')).slice(0, 12).map((d) => ({ value: d.name, hint: `${Commands.isFav(d.name) ? '★ ' : ''}${d.desc}` })),
    examples: ['/star size', '/star shuffle'],
    run: (args) => {
      const d = Commands.get(args.trim().replace(/^\//, ''));
      if (!d) return args.trim() ? `No command /${args.trim().replace(/^\//, '')}.` : starsText();
      return Commands.toggleFav(d.name) ? `★ \`/${d.name}\` is pinned at the top of the / menu.` : `\`/${d.name}\` unpinned.`;
    },
  });
  R({
    name: 'stars', aliases: ['pinned-cmds'], desc: 'Your pinned commands (first in the / menu)',
    run: () => starsText(),
  });
  function starsText() { const f = Commands.favs().map(Commands.get).filter(Boolean); return f.length ? `**★ Pinned commands**\n${f.map((d) => `- \`/${d.name}\` ${d.desc}`).join('\n')}` : 'No pinned commands: `/star <command>` or ☆ in the / menu.'; }
  R({
    name: 'cmd-history', aliases: ['hist', 'cmds-run'], args: '[filter | clear]', desc: 'The commands you ran lately (click one to run it again)',
    keywords: 'history previous last ran',
    run: (args) => {
      const a = args.trim().toLowerCase();
      if (a === 'clear') { localStorage.removeItem('commands.history'); return 'Command history cleared.'; }
      const h = Commands.history().filter((l) => !a || l.toLowerCase().includes(a)).slice(-20).reverse();
      return h.length ? `**Commands you ran** (newest first · ↑ in the command bar)\n${h.map((l) => `- \`${safe(l)}\``).join('\n')}` : 'No commands yet.';
    },
  });
  R({
    name: 'what', aliases: ['explain-cmd', 'whatis'], args: '<command>', desc: 'Everything about one command: what it does, arguments, examples, shortcut, where it works, how to undo it',
    keywords: 'explain describe usage manual man',
    complete: (a) => Commands.matching(a.replace(/^\//, '')).slice(0, 12).map((d) => ({ value: d.name, hint: d.desc })),
    examples: ['/what size', '/what shuffle'],
    run: (args) => {
      const d = Commands.get(args.trim().replace(/^\//, '').split(/\s/)[0]);
      if (!d) return args.trim() ? (Commands.didYouMean(`/${args.trim()}`).map((m) => `\`${m.line.trim()}\``).join(' · ') || `No command /${args.trim()}.`) : 'Use `/what <command>`';
      const ex = Commands.examplesOf(d);
      const undo = Commands.undoOf(d);
      return [`**\`/${d.name}${d.args ? ` ${d.args}` : ''}\`** · ${d.area}${Commands.isFav(d.name) ? ' · ★ pinned' : ''}`, d.desc,
        d.aliases.length ? `Also: ${d.aliases.map((x) => `/${x}`).join(', ')}` : '',
        d.keys ? `Shortcut: ${Commands.keyText(d.keys)}` : '',
        d.variants ? `Works differently by place: ${d.variants.map((v) => `${v.whenLabel || 'elsewhere'} (${v.area})`).join(' · ')}` : '',
        ex.length ? `Examples: ${ex.map((x) => `\`${safe(x)}\``).join(' · ')}` : '',
        undo ? `Undo: ${undo}` : ''].filter(Boolean).join('\n');
    },
  });
  R({
    name: 'how', aliases: ['which', 'find-cmd'], args: '<what you want to do>', desc: 'Find the command for something, in your own words: /how make it vertical (all local, no tokens)',
    keywords: 'search find lookup discover natural language',
    examples: ['/how make it 9 by 16', '/how dark theme', '/how stop every reply'],
    run: (args, ctx) => {
      if (!args.trim()) return 'Say what you want: `/how freeze the picture`';
      const s = Commands.suggest(args, { limit: 6, ctx });
      return s.length ? `**Commands for “${safe(args)}”** (click to run)\n${s.map((x) => `- \`${x.line.trim()}\` ${x.def.desc}`).join('\n')}` : `Nothing obvious for “${safe(args)}”. \`/help\` searches every command.`;
    },
  });
  R({
    name: 'discover', aliases: ['tip-cmd'], args: '[area]', desc: 'Three commands you have never run (from what\'s on screen first), with examples',
    keywords: 'tips learn random surprise new ideas',
    complete: () => Commands.areas().map((a) => ({ value: a })),
    run: (args) => {
      const used = new Set([...Commands.recent(), ...Commands.history().map((l) => (l.match(/^\/([\w-]+)/) || [])[1])]);
      const want = args.trim().toLowerCase() || Commands.place().area.toLowerCase();
      let pool = Commands.list().filter((d) => !d.hidden && !used.has(d.name) && d.area.toLowerCase() === want);
      if (pool.length < 3) pool = Commands.list().filter((d) => !d.hidden && !used.has(d.name));
      const picks = [];
      while (pool.length && picks.length < 3) picks.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
      return `**Try these**\n${picks.map((d) => { const ex = Commands.examplesOf(d)[0]; return `- \`/${d.name}${d.args ? ` ${d.args}` : ''}\` ${d.desc}${ex ? ` · e.g. \`${safe(ex)}\`` : ''}`; }).join('\n')}`;
    },
  });
  R({
    name: 'keys', aliases: ['cmd-keys'], args: '[filter]', desc: 'Commands that also have a keyboard shortcut', keywords: 'shortcuts hotkeys keyboard',
    run: (args) => {
      const f = args.trim().toLowerCase();
      const ks = Commands.list().filter((d) => d.keys && (!f || `${d.name} ${d.desc}`.toLowerCase().includes(f)));
      return `**Shortcuts** (${KEY}: the command bar)\n${ks.map((d) => `- ${Commands.keyText(d.keys)} · \`/${d.name}\` ${d.desc}`).join('\n')}\n\n\`/shortcuts\` · \`/lab-keys\` · \`/video-keys\` list the rest.`;
    },
  });
  // What can be taken back, and how: the undo mechanisms by area, which commands they cover, and your last runs.
  const UNDO_PATHS = [
    ['Chat actions', '/undo', 'rename, delete, forget, clear draft, archive, tags… (the last 20)'],
    ['Deleted chats', '/restore · /trash', 'kept 30 days'],
    ['Lab sliders', '/undo-sliders · Ctrl+Z', 'slider changes, shuffles (/unshuffle), resets (/tame halfway)'],
    ['Lab timeline', 'Ctrl+Z in the Lab', 'grid, markers, cues, curves'],
    ['Director code edits', '/undo-edit · /redo-edit', 'the director\'s edits in the Lab'],
    ['Node graphs', '/nodes-undo · /shader-nodes-undo', 'node edits in the Lab / shader graphs'],
    ['Looks / themes', '/theme prev · /appearance reset · /classic', 'the app\'s look'],
    ['Hidden controls', '/show-feature <name | all>', 'what /hide-feature hid'],
    ['Memory', '/undo (after /forget) · /memory edit', 'remembered facts'],
    ['Your commands', '/unalias · /timer-cancel · /star again', 'aliases, macros, timers, pins'],
  ];
  R({
    name: 'undo-report', aliases: ['undos', 'undo-coverage'], desc: 'What can be undone and how: every undo by area, coverage of the commands, and your last commands',
    keywords: 'undo revert take back restore coverage',
    run: () => {
      const all = Commands.list().filter((d) => !d.hidden);
      const covered = all.filter((d) => Commands.undoOf(d));
      const byArea = {};
      for (const d of covered) (byArea[d.area] ||= []).push(d);
      const last = Commands.history().slice(-8).reverse();
      const mark = (line) => { const d = Commands.parse(line)?.def; const u = d && Commands.undoOf(d); return `- \`${safe(line)}\` ${u ? `↶ ${u}` : '· (no undo known)'}`; };
      return [`**Undo**: ${covered.length} of ${all.length} commands have a known way back (the rest only show or open things, or are one-way like sending).`,
        '', '**Ways back**', ...UNDO_PATHS.map(([a, how, what]) => `- ${a}: \`${how.split(' · ')[0]}\`${how.includes(' · ') ? ` · ${how.split(' · ').slice(1).join(' · ')}` : ''} (${what})`),
        '', '**Covered commands**', ...Object.entries(byArea).map(([a, ds]) => `- ${a}: ${ds.map((d) => `/${d.name}`).join(', ')}`),
        ...(last.length ? ['', '**Your last commands**', ...last.map(mark)] : [])].join('\n');
    },
  });

  R({
    name: 'cmd-links', args: '[on | off]', desc: 'Commands written in agents\' replies and your notes (like `/size 9:16`) run when clicked (on by default)',
    keywords: 'clickable links replies inline code',
    complete: () => [{ value: 'on' }, { value: 'off' }],
    run: (args) => {
      const a = args.trim().toLowerCase();
      const on = a === 'on' ? true : a === 'off' ? false : !linksOn();
      ls.set('cmdbar.links', on);
      document.querySelectorAll('code[data-cmdchk]').forEach((c) => { delete c.dataset.cmdchk; if (!on) c.classList.remove('cmd-code', 'fill'); });
      if (on) decorate();
      return on ? 'Commands in replies and notes are clickable.' : 'Commands in replies stay plain text.';
    },
  });
  R({
    name: 'timers-pause', aliases: ['pause-timers'], args: '[on | off]', desc: 'Pause every command timer (again: resume); repeating ones skip their turns while paused',
    keywords: 'timers pause resume hold',
    complete: () => [{ value: 'on' }, { value: 'off' }],
    run: (args) => {
      const a = args.trim().toLowerCase();
      const on = a === 'on' ? true : a === 'off' ? false : !ls.get('cmdbar.timersPaused', false);
      ls.set('cmdbar.timersPaused', on);
      return on ? `⏸ Timers paused (${timers.length}). \`/timers-pause\` again resumes.` : '▶ Timers running again.';
    },
  });
  R({
    name: 'cmd-stats', aliases: ['my-commands', 'top-cmds'], args: '[n]', desc: 'The commands you use most (and areas you never touched)',
    keywords: 'stats usage most used favorite commands',
    run: (args) => {
      const c = Commands.counts();
      const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, Number(args) || 12);
      if (!top.length) return 'No commands counted yet: they are counted from now on.';
      const usedAreas = new Set(top.map(([n]) => Commands.get(n)?.area));
      const never = Commands.areas().filter((a) => !Object.keys(c).some((n) => Commands.get(n)?.area === a));
      return `**Your commands** (${Object.values(c).reduce((s, n) => s + n, 0)} runs)\n${top.map(([n, k]) => `- \`/${n}\` ${k}×${Commands.isFav(n) ? ' ★' : ''}`).join('\n')}${never.length ? `\n\nAreas you haven't tried: ${never.slice(0, 10).join(', ')} (\`/discover <area>\`)` : ''}${usedAreas.size ? '' : ''}`;
    },
  });
  R({
    name: 'where', aliases: ['cmd-context'], desc: 'Where commands run right now: the tool on screen, the chat they talk to, and which shared commands change meaning here',
    keywords: 'context place target which chat',
    run: (_a, ctx) => {
      const p = Commands.place();
      const a = H.agent(ctx.agentId);
      const shared = Commands.list().filter((d) => d.variants?.some((v) => v.when && (() => { try { return v.when(ctx, ''); } catch { return false; } })()));
      return `**Here**: ${p.label}${a ? ` · commands talk to **${a.name}**'s chat` : ''}${pinnedTarget ? ' (picked in the bar)' : ''}\n${shared.length ? `Shared names that do something else here: ${shared.map((d) => `/${d.name}`).join(', ')}` : 'No shared command changes meaning here.'}\nRecent here: ${(Commands.recent(p.id).map((n) => `\`/${n}\``).join(' ') || '–')}`;
    },
  });
  // Your command setup (aliases, macros, pins, history) as one file, to move it to the Mac or keep a copy.
  R({
    name: 'cmd-export', args: '', desc: 'Save your aliases, macros, pinned commands and command history to a file',
    keywords: 'backup export aliases macros settings move',
    run: async () => {
      const data = { hearthCommands: 1, aliases: store.get('chat.aliases', {}), favs: Commands.favs(), history: Commands.history(), counts: Commands.counts() };
      const p = await window.hub.saveFile({ defaultPath: `hearth-commands-${new Date().toLocaleDateString('en-CA')}.json`, filters: [{ name: 'JSON', extensions: ['json'] }], content: JSON.stringify(data, null, 2) });
      return p ? `Saved ${Object.keys(data.aliases).length} alias(es) / macro(s), ${data.favs.length} pin(s) to ${p.split(/[\\/]/).pop()}` : null;
    },
  });
  R({
    name: 'cmd-import', args: '', desc: 'Bring back aliases, macros and pins from a /cmd-export file (merges, keeps yours)',
    keywords: 'restore import aliases macros',
    run: async (_a, ctx) => {
      const [p] = await window.hub.openDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }], title: 'Import commands' });
      if (!p) return null;
      let data;
      try { data = JSON.parse(await window.hub.fs.read(p)); } catch (err) { return `Can't read that file (${err.message}).`; }
      if (!data?.hearthCommands) return 'That isn\'t a /cmd-export file.';
      let n = 0;
      const mine = store.get('chat.aliases', {});
      for (const [name, text] of Object.entries(data.aliases || {})) {
        if (mine[name] || Commands.get(name)) continue;
        await Commands.tryRun(`/alias ${name} ${text}`, ctx.agentId, null, { source: ctx.source, say: () => {}, history: false });
        n += 1;
      }
      for (const f of data.favs || []) if (Commands.get(f)) Commands.toggleFav(f, true);
      for (const l of data.history || []) Commands.addHistory(l);
      return `Imported ${n} alias(es) / macro(s) and ${(data.favs || []).length} pin(s).`;
    },
  });

  // ---------- palette, shortcuts list ----------
  AppUI.addAction?.('Command bar (run a /command over any tool)', () => open(), 'Ctrl+;');
  AppUI.addAction?.('Every chat command (searchable help)', () => help());
  AppUI.addAction?.('Command timers (/timers)', () => runLine('/timers'));

  return { open, close, toggle, isOpen, help, runLine, target, decorate, timers: () => timers.slice(), parseDur, parseAt, recording: () => rec && { ...rec } };
})();
