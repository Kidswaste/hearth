// ⬆ Update: when main has something new, a small button shows at the bottom of the rail; one click lists what's new
// and pulls it (updatermain.js: the app's own git checkout, local edits kept), then reloads the window, or restarts
// the app when a main-process file changed. Looks quietly 25 s after start, every 30 min and when the window comes
// back after a while; nothing is pulled without the click. /update [now | check | auto on|off].
const Updater = (() => {
  const EVERY = 30 * 60000;
  let last = null; // the last status
  let checkedAt = 0;
  let checking = null;
  let btn = null;
  const auto = () => store.get('update.auto', true);
  let api = () => window.hub.update; // (checks swap it)

  function mountBtn() {
    const rail = document.getElementById('rail');
    if (!rail) return null;
    if (!btn) {
      btn = el('button', { class: 'tool-btn up-btn', id: 'up-btn', type: 'button', hidden: true, dataset: { feature: 'Update' }, 'aria-label': 'Update Hearth' },
        el('span', { class: 'up-ic', text: '⬆' }), el('b', { class: 'up-n' }));
      btn.addEventListener('click', () => dialog());
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX + 6, e.clientY - 120, [
          { label: 'What\'s new…', action: () => dialog() },
          { label: 'Update & reload now', action: () => run() },
          { label: 'Check again', action: () => check({ loud: true }) },
          { label: auto() ? 'Stop looking for updates' : 'Look for updates by itself', action: () => { store.set('update.auto', !auto()); paint(); } },
        ]);
      });
    }
    const anchor = document.getElementById('rq-badge') || document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? btn.nextElementSibling !== anchor : btn.parentElement !== rail) (anchor ? anchor.before(btn) : rail.append(btn));
    return btn;
  }
  function paint() {
    const n = last?.ok ? last.behind : 0;
    if (!n && !btn) return;
    const b = mountBtn();
    if (!b) return;
    const show = n > 0;
    if (b.hidden === show) b.hidden = !show;
    const t = n > 99 ? '99+' : String(n);
    if (b.lastChild.textContent !== t) b.lastChild.textContent = show ? t : '';
    const title = show ? `Update Hearth: ${n} new change${n === 1 ? '' : 's'} on main · click: what's new, then update & reload · right-click: more` : '';
    if (b.title !== title) b.title = title;
  }

  async function check({ loud = false, fetch = true } = {}) {
    if (checking) return checking;
    checking = (async () => {
      try { last = await api().status({ fetch }); } catch (err) { last = { ok: false, message: err.message }; }
      checkedAt = Date.now();
      paint();
      if (loud) {
        if (!last.ok) toast(last.message, { type: 'error', timeout: 8000 });
        else if (!last.behind) toast(`Hearth is up to date (${last.head}).`, { timeout: 2400 });
      }
      return last;
    })().finally(() => { checking = null; });
    return checking;
  }

  const busyChats = () => (typeof H !== 'undefined' ? H.agents().filter((a) => { const c = H.activeChat?.[a.id]; return c && Native.isBusy?.(c); }).map((a) => a.name) : []);
  const busyRenders = () => { try { return (window.Renders?.list?.() || []).filter((j) => j.status === 'starting' || j.status === 'running').length; } catch { return 0; } };

  async function run({ ask = true } = {}) {
    const busy = busyChats();
    const renders = busyRenders();
    if (ask && (busy.length || renders)) {
      const what = [busy.length ? `${busy.join(', ')} ${busy.length === 1 ? 'is' : 'are'} still answering` : '', renders ? `${renders} render${renders === 1 ? '' : 's'} running` : ''].filter(Boolean).join(' and ');
      if (!await Modal.confirm('Update now?', `${what}. Updating reloads Hearth, which stops ${busy.length && renders ? 'them' : 'it'}.`, { ok: 'Update anyway' })) return null;
    }
    // (round 15, tour) What's new: what each upgrade doc has now, to tell the new lines after the update (≤ 2.5 s)
    try { await Promise.race([window.Discover?.beforeUpdate?.(), new Promise((res) => setTimeout(res, 2500))]); } catch { /* a bonus */ }
    const t = toast('Updating Hearth…', { timeout: 60000 });
    let r;
    try { r = await api().apply(); } catch (err) { r = { ok: false, message: err.message }; }
    t?.remove?.();
    if (!r.ok) { toast(r.message, { type: 'error', timeout: 12000 }); return r; }
    if (!r.changed) { toast(r.message || 'Already up to date.', { timeout: 2400 }); last = { ...(last || {}), behind: 0 }; paint(); return r; }
    store.set('update.just', { from: r.from, to: r.to, n: r.changed, at: Date.now(), restart: r.restart, note: r.note || '', files: (r.files || []).filter((f) => /^docs\//.test(f)).slice(0, 80) });
    toast(r.restart ? 'Updated: restarting Hearth…' : 'Updated: reloading…', { timeout: 3000 });
    setTimeout(() => (r.restart ? api().restart() : api().reload()), 700);
    return r;
  }

  function dialog() {
    const s = last;
    if (!s?.ok) { check({ loud: true }); return; }
    const list = el('ol', { class: 'up-list' }, (s.commits || []).slice(0, 25).map((c) => el('li', {}, el('span', { class: 'up-subj', text: c.subject }), el('span', { class: 'up-when', text: typeof timeAgo === 'function' ? timeAgo(c.at) : '' }))));
    const more = s.behind > 25 ? el('p', { class: 'hint', text: `…and ${s.behind - 25} more.` }) : null;
    const notes = [
      s.dirty ? `${s.dirty} file${s.dirty === 1 ? '' : 's'} in this copy changed by hand: kept (put aside and back again, like --autostash).` : '',
      s.branch && s.branch !== 'main' ? `This copy is on the branch "${s.branch}": main is pulled into it.` : '',
      s.ahead ? `${s.ahead} change${s.ahead === 1 ? '' : 's'} here aren't on main: kept.` : '',
    ].filter(Boolean);
    const dlg = el('dialog', { class: 'ui-modal up-dlg' },
      el('h3', { text: `⬆ ${s.behind} new change${s.behind === 1 ? '' : 's'} on main` }),
      el('p', { class: 'hint', text: `You have ${s.head} · main is at ${s.remote}. Hearth pulls them, then reloads (or restarts when needed). Your chats, scenes and settings stay.` }),
      list, more, ...notes.map((n) => el('p', { class: 'hint', text: n })),
      el('div', { class: 'modal-buttons' },
        el('button', { type: 'button', text: 'Later', on: { click: () => dlg.close() } }),
        el('button', { type: 'button', class: 'primary', text: 'Update & reload', on: { click: () => { dlg.close(); run(); } } })));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  // what the last update brought, once, after the reload / restart
  function afterUpdate() {
    const j = store.get('update.just', null);
    if (!j) return;
    store.set('update.just', null);
    store.set('update.last', j); // (round 15) discover.js: What's new from the docs this update changed
    document.dispatchEvent(new CustomEvent('hearth:updated', { detail: j }));
    if (Date.now() - j.at < 5 * 60000) toast(`Hearth updated (${j.from} → ${j.to}, ${j.n} file${j.n === 1 ? '' : 's'}).${j.note ? ` ${j.note}` : ''}`, { timeout: j.note ? 12000 : 4000 });
  }

  function start() {
    afterUpdate();
    setTimeout(() => { if (auto()) check(); }, 25000);
    setInterval(() => { if (auto() && !document.hidden) check(); }, EVERY);
    window.addEventListener('focus', () => { if (auto() && Date.now() - checkedAt > 10 * 60000) check(); });
    if (typeof Commands !== 'undefined' && !Commands.get('update')) {
      Commands.register({
        name: 'update', area: 'App', args: '[now | check | auto on|off]', aliases: ['upgrade-hearth'],
        desc: 'Update Hearth from main (its git checkout): what\'s new, then pull and reload / restart',
        complete: () => ['now', 'check', 'auto on', 'auto off'].map((value) => ({ value })),
        examples: ['/update', '/update now', '/update auto off'],
        run: async (args) => {
          const a = String(args || '').trim().toLowerCase();
          if (a === 'auto on' || a === 'auto off') { store.set('update.auto', a === 'auto on'); return `Looking for updates by itself: **${auto() ? 'on' : 'off'}** (the ⬆ button shows when main has something new).`; }
          const s = await check();
          if (!s.ok) return s.message;
          if (!s.behind) return `Hearth is up to date (${s.head}).`;
          if (a === 'now') { run(); return `Updating: ${s.behind} new change${s.behind === 1 ? '' : 's'}…`; }
          if (a !== 'check') dialog();
          return `**${s.behind} new change${s.behind === 1 ? '' : 's'} on main**:\n${s.commits.slice(0, 8).map((c) => `- ${c.subject}`).join('\n')}${s.behind > 8 ? `\n- …and ${s.behind - 8} more` : ''}\n\n\`/update now\` (or the ⬆ button) pulls them and reloads.`;
        },
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { check, run, dialog, get status() { return last; }, _setApi: (fn) => { api = fn; } };
})();
