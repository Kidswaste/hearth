// Makes on the Commands page and /makes (round 139, room139: once part of makes.js). The list, one make's detail and
// "Every make" are drawn only while the Commands page is open, and /makes is a command: both wait in a lazy group
// ('makesview', a calm moment after the start; the Commands page's group comes after it). makes.js keeps the store, the
// rooms, the hooks and Makes.show (which loads this group first).
const MakesView = (() => {
  const M = Makes._page;
  const { C, base, sleep, tint, summary, get, live, find, here, hereChat, roomOf, plan, rename, dismiss, restore, handoff, progress, openRoom, openOutput,
    renamePrompt, dismissAsk, makeMenu, lineOf, ready } = M;
  // ---------- one place: Makes on the Commands page ----------
  const pageSel = { id: null };
  function pageSections(q) {
    if (!M.loaded()) return [];
    const s = String(q || '').trim().toLowerCase();
    let list = M.data().list.filter((m) => !m.dismissed);
    if (s) list = list.filter((m) => `${m.name} ${m.idea} ${C.CATS[m.cat]}`.toLowerCase().includes(s.replace(/^\//, '')));
    const out = [];
    if (list.length) out.push({ head: `Makes · ${list.length}`, items: list.slice(0, s ? 12 : 6).map((m) => ({ node: pageRow(m) })) });
    if (!s && M.data().list.length > 6) out[0]?.items.push({ node: el('button', { class: 'cp-row mk-allrow', type: 'button', dataset: { ext: 'makes:all' }, text: `All makes (${M.data().list.length}) ›` }) });
    return out;
  }
  function pageRow(m) {
    const st = C.statusOf(m);
    return tint(el('button', { class: `cp-row mk-row mk-${st}`, type: 'button', dataset: { ext: `make:${m.id}`, make: m.id }, title: lineOf(m) },
      el('span', { class: 'cp-pv mk-pv', text: m.ident.glyph }),
      el('span', { class: 'cp-rtext' }, el('b', { text: m.name }), el('span', { class: 'cp-desc', text: `${C.chain(m) || C.CATS[m.cat]} · ${C.STATUS_LABEL[st]}${C.pctOf(m) && st !== 'done' ? ` · ${C.pctOf(m)} %` : ''}` })),
      el('span', { class: 'cp-area', text: (C.CATS[m.cat] || 'make').toLowerCase() })), m.ident.color);
  }
  function pagePick(id, right) {
    if (id === 'makes:all') { renderAll(right); return; }
    const make = get(String(id).replace(/^make:/, ''));
    if (make) renderDetail(make, right);
  }
  function pageMenu(id, e) {
    const make = get(String(id).replace(/^make:/, ''));
    if (make) showMenu(e.clientX, e.clientY, makeMenu(make));
  }
  function renderAll(right) {
    pageSel.id = 'all';
    const rows = M.data().list.map((m) => { const r = pageRow(m); if (m.dismissed) r.classList.add('mk-dismissed'); return r; });
    const box = el('div', { class: 'cp-example mk-all' }, el('div', { class: 'cp-ex-head' }, el('h2', { text: 'Every make' }), el('span', { class: 'cp-area', text: `${M.data().list.length}` })),
      el('p', { class: 'cp-def', text: 'Everything Hearth made or is making for you, newest first. Dismissed ones stay here (Restore brings their rooms back).' }), el('div', { class: 'mk-list' }, ...rows));
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-ext]'); if (b) pagePick(b.dataset.ext, right); });
    box.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-ext]'); if (b) { e.preventDefault(); pageMenu(b.dataset.ext, e); } });
    right.replaceChildren(box);
  }
  function renderDetail(make, right) {
    pageSel.id = make.id;
    const st = C.statusOf(make);
    const pct = C.pctOf(make);
    const partRow = (p) => {
      const c = p.chatId && summary(p.chatId);
      return el('div', { class: `mk-part mk-c-${p.status}`, dataset: { makePart: p.id } },
        el('span', { class: 'mk-picon', text: C.KINDS[p.kind]?.icon || '•' }),
        el('span', { class: 'mk-ptext' }, el('b', { text: c ? c.title : p.frameId ? C.roomTitle(make, p) : C.label(p, make) }), el('span', { class: 'cp-desc', text: `${C.waitText(make, p)}${p.progress?.pct != null && p.status !== 'done' ? ` · ${p.progress.pct} %${p.progress.label ? ` ${p.progress.label}` : ''}` : ''}${p.last ? ` · “${p.last}”` : ''}` })),
        c || p.frameId || C.KINDS[p.kind]?.room ? el('button', { class: 'ghost small', type: 'button', text: '↗ Open', on: { click: () => openRoom(make, p) } }) : null);
    };
    const outs = make.outputs.slice(0, 8).map((o) => el('div', { class: 'mk-out' }, el('span', { class: 'mk-picon', text: o.kind === 'video' ? '▶' : o.kind === 'still' ? '▣' : '•' }), el('span', { class: 'mk-ptext', text: base(o.path), title: o.path }),
      el('button', { class: 'ghost small', type: 'button', text: 'Open', on: { click: () => openOutput(o.path) } }), el('button', { class: 'ghost small', type: 'button', text: '⧉', title: MediaFile.revealLabel, on: { click: () => window.hub.fs.reveal(o.path) } })));
    const first = make.parts.find((p) => p.chatId || p.frameId);
    const box = tint(el('div', { class: 'cp-example mk-detail', dataset: { make: make.id } },
      el('div', { class: 'cp-big mk-big' }, el('span', { class: 'mk-bigmark', text: make.ident.glyph }), el('span', { class: 'mk-bigname', text: make.name })),
      el('div', { class: 'cp-ex-head' }, el('h2', { text: make.name }), el('span', { class: 'cp-area', text: C.CATS[make.cat] || 'Make' }), el('span', { class: `mk-pill mk-c-${st}`, text: `${C.STATUS_LABEL[st]}${pct && st !== 'done' ? ` · ${pct} %` : ''}` }), el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'Rooms, rename, hand off, dismiss…', on: { click: (e) => showMenuAt(e.currentTarget, makeMenu(make)) } })),
      make.idea ? el('p', { class: 'cp-def', text: make.idea }) : null,
      el('div', { class: 'cp-sub', text: make.parts.length ? `${make.parts.length} part${make.parts.length === 1 ? '' : 's'}: ${C.chain(make)}` : 'No parts yet' }),
      el('div', { class: 'mk-parts' }, ...make.parts.map(partRow)),
      outs.length ? el('div', { class: 'cp-sub', text: `Outputs (${make.outputs.length})` }) : null, outs.length ? el('div', { class: 'mk-outs' }, ...outs) : null,
      el('div', { class: 'cp-small', text: `${make.by?.cmd ? `Made by ${make.by.cmd}${make.by.agent ? ' (an agent)' : ''}` : 'Made'} · ${timeAgo(make.at)}${make.from && summary(make.from) ? ` · from “${summary(make.from).title}”` : ''}${make.dismissed ? ' · dismissed' : ''}` }),
      el('div', { class: 'cp-row-btns' },
        first && !make.dismissed ? el('button', { class: 'primary', type: 'button', text: `↗ Open ${C.label(first, make)}`, on: { click: () => openRoom(make, first) } }) : null,
        el('button', { class: 'ghost', type: 'button', text: '✎ Rename', on: { click: () => renamePrompt(make) } }),
        make.dismissed ? el('button', { class: 'ghost', type: 'button', text: '↺ Restore', on: { click: () => restore(make) } }) : el('button', { class: 'ghost', type: 'button', text: 'Dismiss…', on: { click: () => dismissAsk(make) } }))), make.ident.color);
    right.replaceChildren(box);
  }
  function paintPage() {
    if (typeof CmdPage === 'undefined' || !CmdPage.isOpen?.()) return;
    const st = CmdPage.state;
    if (st.view === 'ext' && pageSel.id && st.right) { if (pageSel.id === 'all') renderAll(st.right); else { const m = get(pageSel.id); if (m) renderDetail(m, st.right); } }
    CmdPage.refreshList?.();
  }
  // the Makes list (Commands page), on one make when given
  async function show(id = null) {
    if (typeof CmdPage === 'undefined') return;
    CmdPage.open();
    await sleep(60);
    const st = CmdPage.state;
    if (!st.right) return;
    st.view = 'ext';
    if (id) pagePick(`make:${id}`, st.right); else renderAll(st.right);
  }

  // ---------- /makes ----------
  function register() {
    if (Commands.get('makes')) return;
    const sub = ['plan', 'list', 'open', 'rename', 'dismiss', 'restore', 'next', 'status', 'progress'];
    Commands.register({
      name: 'makes', area: 'App', args: '[plan <what> | open <make> [room] | rename <make> = <name> | next | dismiss <make> | restore <make> | status]',
      desc: 'Everything Hearth makes, one name and mark each: plan a make (its rooms are made now, in its project’s chats) · open one · rename it (every room follows) · hand off to the next room · dismiss / restore',
      keywords: 'make makes plan rooms ahead project category same name logo three video chat room folder group',
      examples: ['/makes plan a three.js animation that cuts into a video', '/makes plan a neon tunnel loop then the edit', '/makes', '/makes rename 1 = Launch teaser', '/makes next'],
      complete: (a) => {
        const s = String(a || '');
        if (!/\s/.test(s)) return sub.filter((x) => x.startsWith(s.toLowerCase())).map((x) => ({ value: x === 'plan' ? 'plan ' : x, hint: { plan: 'what will be made: its rooms now', open: 'a make\'s room', rename: 'every room follows', next: 'hand off to the next room', dismiss: 'its rooms to the trash', restore: 'back from the trash', status: 'where each make is', list: 'every make', progress: 'set a progress' }[x] }));
        const verb = s.split(/\s+/)[0].toLowerCase();
        if (verb === 'plan') return ['a three.js animation that cuts into a video', 'board refs, then a Lab scene, then the edit', 'a neon loop then a 15 s video'].map((v) => ({ value: `plan ${v}` }));
        if (['open', 'rename', 'dismiss', 'status'].includes(verb)) return live().slice(0, 8).map((m) => ({ value: `${verb} ${m.name}`, hint: C.chain(m) }));
        if (verb === 'restore') return M.data().list.filter((m) => m.dismissed).slice(0, 8).map((m) => ({ value: `restore ${m.name}` }));
        return [];
      },
      run: async (args, ctx) => {
        await ready;
        const s = String(args || '').trim();
        const [verb0, ...rest] = s.split(/\s+/);
        const verb = (verb0 || '').toLowerCase();
        const restText = rest.join(' ');
        if (verb === 'plan') {
          if (!restText) return 'What will be made? e.g. /makes plan a three.js animation that cuts into a video';
          const make = await plan(restText, { from: ctx.chatId || hereChat(), show: ctx.source !== 'code' });
          return `${make.ident.glyph} **${make.name}** is planned: ${make.parts.map((p) => (p.chatId ? `“${summary(p.chatId)?.title}”` : C.roomTitle(make, p))).join(' → ')}. The rooms are in your chats list (open the project ${make.ident.glyph} ${make.name}), empty until each part starts.`;
        }
        if (verb === 'open') {
          const m = find(rest[0]) || find(restText) || here()?.make;
          if (!m) return 'Which make? /makes lists them.';
          const want = restText.toLowerCase().replace(m.name.toLowerCase(), '').trim();
          const p = (want && m.parts.find((x) => C.label(x, m).toLowerCase().startsWith(want))) || m.parts.find((x) => x.chatId || x.frameId);
          if (p) await openRoom(m, p); else await show(m.id);
          return null;
        }
        if (verb === 'rename') {
          const [a, b] = restText.split(/\s*=\s*/);
          const m = b ? find(a) : here()?.make;
          const nm = (b ?? a ?? '').trim();
          if (!m || !nm) return 'Rename which make? /makes rename <make> = <new name> (in a room: /makes rename <new name>)';
          const was = m.name;
          const n = rename(m, nm);
          return `“${was}” is “${m.name}” now${n ? ` (${n} room${n === 1 ? '' : 's'} renamed)` : ''}.`;
        }
        if (verb === 'dismiss') { const m = find(restText) || here()?.make; if (!m) return 'Which make?'; const n = await dismiss(m); return `Dismissed “${m.name}”${n ? ` (${n} room${n === 1 ? '' : 's'} in the trash; /makes restore ${m.name} brings them back)` : ''}.`; }
        if (verb === 'restore') { const m = M.data().list.find((x) => x.dismissed && x.name.toLowerCase().includes(restText.toLowerCase())) || find(restText); if (!m) return 'Which make?'; const n = await restore(m); return `“${m.name}” is back${n ? ` with its ${n} room${n === 1 ? '' : 's'}` : ''}.`; }
        if (verb === 'next') { const r = roomOf(ctx.chatId) || here(); if (!r) return 'This chat isn\'t a make\'s room.'; const nx = await handoff(r.make, r.part); return nx ? `Handed “${r.make.name}” to ${C.label(nx, r.make)}.` : `That was the last room: “${r.make.name}” · ${C.label(r.part, r.make)} is done.`; }
        if (verb === 'progress') { const m = find(rest[0]) || here()?.make; const pct = Number.parseFloat(rest[1]); if (!m || !Number.isFinite(pct)) return '/makes progress <make> <pct> [label]'; progress(m.id, null, { pct, label: rest.slice(2).join(' ') }); return `${m.name}: ${Math.round(pct)} %`; }
        if (verb === 'status' && restText) { const m = find(restText); return m ? lineOf(m) : 'No such make.'; }
        if (verb && !['list', 'status'].includes(verb)) return `Use /makes plan <what>, open, rename, next, dismiss, restore or status.`;
        if (ctx.source !== 'code') show();
        return live().length ? live().slice(0, 10).map((m, i) => `${i + 1}. ${lineOf(m)}`).join('\n') : 'No makes yet: /makes plan a three.js animation that cuts into a video makes one with its rooms.';
      },
    });
  }
  window.addEventListener('DOMContentLoaded', register); // (where makes.js registered it: lazy.js runs it once the group is in)
  return { sections: pageSections, pick: pagePick, menu: pageMenu, paint: paintPage, show };
})();
