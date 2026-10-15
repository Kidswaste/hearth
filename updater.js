// ⬆ Update: when main has something new, a small button shows at the bottom of the rail; one click lists what's new
// and pulls it (updatermain.js: the app's own git checkout, local edits kept), then reloads the window, or restarts
// the app when a main-process file changed. Looks quietly 25 s after start, every 30 min and when the window comes
// back after a while; nothing is pulled without the click. /update [now | check | back | auto on|off].
// (round 37, updatesafe) a failed update is one calm dialog: what happened in plain words, what the fix runs (shown
// before the click) and ONE button (Install Git, Connect, Go back onto main, Restart and finish the update…); the
// view (which chat each AI shows, the screen) comes back after the reload / restart; ↶ Go back to the previous version
// in the after-update note, Settings › Updates › What's new…, ⌘K and /update back.
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
          ...(last?.back ? [{ label: `Go back to the previous version (${last.back.from})`, action: () => goBack() }] : []),
          { label: auto() ? 'Stop looking for updates' : 'Look for updates by itself', action: () => { store.set('update.auto', !auto()); paint(); } },
        ]);
      });
    }
    const anchor = document.getElementById('rq-badge') || document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? btn.nextElementSibling !== anchor : btn.parentElement !== rail) (anchor ? anchor.before(btn) : rail.append(btn));
    return btn;
  }
  // (round 37) what blocks every update until the owner acts shows the button with "!" (a passing network hiccup doesn't)
  const ATTN = new Set(['half', 'staged', 'detached', 'lock', 'owner', 'perm', 'repo-other']);
  const attn = () => Boolean(last && !last.ok && ATTN.has(last.reason));
  function paint() {
    const n = last?.ok ? last.behind : 0;
    const warn = attn();
    if (!n && !warn && !btn) return;
    const b = mountBtn();
    if (!b) return;
    const show = n > 0 || warn;
    if (b.hidden === show) b.hidden = !show;
    const t = warn ? '!' : n > 99 ? '99+' : String(n);
    if (b.lastChild.textContent !== t) b.lastChild.textContent = show ? t : '';
    if (b.classList.contains('up-attn') !== warn) b.classList.toggle('up-attn', warn);
    const title = warn ? `Updates need one thing: ${last.message} · click to fix` : show ? `Update Hearth: ${n} new change${n === 1 ? '' : 's'} on main · click: what's new, then update & reload · right-click: more` : '';
    if (b.title !== title) b.title = title;
  }

  async function check({ loud = false, fetch = true } = {}) {
    if (checking) return checking;
    checking = (async () => {
      try { last = await api().status({ fetch }); } catch (err) { last = { ok: false, message: err.message }; }
      if (last?.swapped) swapped(last.swapped); // (round 37) the main side says it once
      checkedAt = Date.now();
      paint();
      if (!loud) window.Notify?.update?.(last); // (round 44, notify) "A Hearth update is ready", once per new set of changes, while you're elsewhere
      if (loud) {
        if (!last.ok && last.fix) trouble(last);
        else if (!last.ok) toast(last.message, { type: 'error', timeout: 8000 });
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
    if (!r.ok) { if (r.fix || r.staged) trouble(r); else toast(r.message, { type: 'error', timeout: 12000 }); return r; }
    if (!r.changed) { toast(r.message || 'Already up to date.', { timeout: 2400 }); last = { ...(last || {}), behind: 0 }; paint(); return r; }
    return landed(r);
  }
  // the update is in: remember it for after the reload / restart, keep the view, then reload or restart
  function landed(r, { back = false } = {}) {
    store.set('update.just', { from: r.from, to: r.to, n: r.changed, at: Date.now(), restart: r.restart, note: r.note || '', back, files: (r.files || []).filter((f) => /^docs\//.test(f)).slice(0, 80) });
    keepView();
    toast(back ? `Going back to ${r.to}: ${r.restart ? 'restarting' : 'reloading'}…` : r.restart ? 'Updated: restarting Hearth…' : 'Updated: reloading…', { timeout: 3000 });
    setTimeout(() => (r.restart ? api().restart() : api().reload()), 700);
    return r;
  }

  // ---------- (round 37) the view survives the reload / restart: each AI's open chat, the screen on top ----------
  function keepView() {
    try {
      window.SafetyNet?.keepNow?.(); // the work journal now, not in 0.25 s (drafts / Lab / board: safetynet.js)
      store.set('update.view', { at: Date.now(), id: typeof H !== 'undefined' ? H.activeId : null, chats: typeof H !== 'undefined' ? { ...H.activeChat } : {} });
    } catch { /* a bonus */ }
  }
  function restoreView() {
    const v = store.get('update.view', null);
    if (!v) return;
    store.set('update.view', null);
    if (Date.now() - v.at > 10 * 60000 || typeof H === 'undefined') return;
    try {
      const have = new Set((H.chats || []).map((c) => c.id));
      for (const [agentId, chatId] of Object.entries(v.chats || {})) if (chatId && have.has(chatId) && H.agent?.(agentId) && H.activeChat[agentId] !== chatId) H.activeChat[agentId] = chatId;
      if (v.id && v.id !== H.activeId && (H.agent?.(v.id) || H.isTool?.(v.id))) activate(v.id);
      else if (v.chats?.[H.activeId] && Native.hasView?.(H.activeId)) Native.refresh?.(H.activeId);
    } catch (err) { console.warn('update view', err); }
  }

  // ---------- (round 37) a failed update: plain words, the command shown, one fix ----------
  let troubleDlg = null;
  function trouble(r) {
    troubleDlg?.close();
    const say = el('p', { class: 'up-say', text: r.message || 'The update didn\'t go through. Nothing was lost.' });
    const cmd = r.fix?.command ? el('details', { class: 'up-cmd', open: Boolean(r.fix.password || r.fix.admin) }, el('summary', { text: r.fix.password ? 'What it runs (it asks for your password in its own window; Hearth never sees it)' : r.fix.admin ? 'What it runs (Windows asks to allow it)' : 'What it runs' }), el('pre', { text: r.fix.command })) : null;
    const status = el('p', { class: 'hint up-status', hidden: true });
    const primary = r.fix ? el('button', { type: 'button', class: 'primary', text: r.fix.label }) : null;
    const alt = r.alt ? el('button', { type: 'button', text: r.alt.label }) : null;
    const dlg = el('dialog', { class: 'ui-modal up-dlg up-trouble', dataset: { reason: r.reason || '' } },
      el('h3', { text: r.reason === 'half' ? '⬆ The last update stopped half-way' : r.staged || r.reason === 'staged' ? '⬆ The update finishes when Hearth restarts' : '⬆ The update needs one thing' }),
      say, cmd, status,
      el('div', { class: 'modal-buttons' }, el('button', { type: 'button', text: 'Later', on: { click: () => dlg.close() } }), alt, primary));
    const busy = (on) => { for (const b of dlg.querySelectorAll('.modal-buttons button')) b.disabled = on; };
    const runFix = async (fx) => {
      busy(true); status.hidden = false; status.textContent = 'Working…';
      let res;
      try { res = await api().fix(fx.id); } catch (err) { res = { ok: false, message: err.message }; }
      busy(false);
      if (res.restart) { status.textContent = res.message; store.set('update.swapWait', Date.now()); keepView(); setTimeout(() => api().restart(), 500); return; }
      if (res.ok && res.changed) { dlg.close(); landed(res); return; }
      if (res.waiting) { // a visible window runs it: when it's done, the same button tries again
        status.textContent = res.message;
        if (primary) { primary.textContent = 'Try again'; primary.onclick = () => { dlg.close(); check({ loud: true }).then((s) => { if (s?.ok && s.behind) run({ ask: false }); }); }; }
        return;
      }
      if (res.ok && res.rolledBack) { dlg.close(); toast(res.message, { timeout: 6000 }); last = null; check(); return; }
      if (res.ok) { dlg.close(); if (res.message) toast(res.message, { timeout: 4000 }); const s = await check(); if (s?.ok && s.behind) run({ ask: false }); else if (s && !s.ok && s.fix) trouble(s); return; }
      say.textContent = res.message; status.hidden = true;
      if (res.fix && primary && res.fix.id !== fx.id) { primary.textContent = res.fix.label; primary.onclick = () => runFix(res.fix); }
    };
    primary?.addEventListener('click', () => runFix(r.fix));
    alt?.addEventListener('click', () => runFix(r.alt));
    dlg.addEventListener('close', () => { dlg.remove(); if (troubleDlg === dlg) troubleDlg = null; });
    document.body.append(dlg);
    dlg.showModal();
    troubleDlg = dlg;
    return dlg;
  }

  // ---------- (round 37) ↶ Go back to the previous version ----------
  async function goBack({ ask = true } = {}) {
    if (!last?.back) await check({ fetch: false });
    const b = last?.back;
    if (!b) { toast('There is no update to go back from.', { timeout: 3000 }); return null; }
    if (ask && !await Modal.confirm('Go back to the previous version?', `Hearth goes back to ${b.from} (before the update to ${b.to}), then reloads. Your chats, scenes, settings and data stay as they are, and so do your own edits. ⬆ offers the update again whenever you want.`, { ok: '↶ Go back' })) return null;
    let r;
    try { r = await api().back(); } catch (err) { r = { ok: false, message: err.message }; }
    if (!r.ok) { if (r.fix) trouble(r); else toast(r.message, { type: 'error', timeout: 8000 }); return r; }
    return landed(r, { back: true });
  }

  function dialog() {
    const s = last;
    if (s && !s.ok && s.fix) return trouble(s);
    if (!s?.ok) { check({ loud: true }); return; }
    const list = el('ol', { class: 'up-list' }, (s.commits || []).slice(0, 25).map((c) => el('li', {}, el('span', { class: 'up-subj', text: c.subject }), el('span', { class: 'up-when', text: typeof timeAgo === 'function' ? timeAgo(c.at) : '' }))));
    const more = s.behind > 25 ? el('p', { class: 'hint', text: `…and ${s.behind - 25} more.` }) : null;
    const notes = [
      s.dirty ? `${s.dirty} file${s.dirty === 1 ? '' : 's'} in this copy changed by hand: kept (put aside in a named stash and back again).` : '',
      s.plan?.collide?.length ? `${s.plan.collide.length === 1 ? `${s.plan.collide[0]}, which you added by hand, has` : `${s.plan.collide.length} files you added by hand have`} the same name as a new file: the update's goes in, yours is kept in a named stash.` : '',
      s.plan?.diverged ? `This copy has ${s.ahead} change${s.ahead === 1 ? '' : 's'} of its own: combined with main (if they clash, Hearth offers to keep them on a side branch).` : '',
      s.branch && s.branch !== 'main' ? `This copy is on the branch "${s.branch}": main is pulled into it.` : '',
      s.ahead && !s.plan?.diverged ? `${s.ahead} change${s.ahead === 1 ? '' : 's'} here aren't on main: kept.` : '',
    ].filter(Boolean);
    // (round 29) the patch notes of the rounds this copy doesn't have yet come first, in plain words; the commit list
    // folds under Details
    const pn = (s.notes || []).map((n) => {
      const box = el('div', { class: 'up-note pn-body' });
      if (typeof renderMarkdown === 'function') box.innerHTML = renderMarkdown(n.text); else box.textContent = n.text;
      return box;
    });
    const dlg = el('dialog', { class: 'ui-modal up-dlg' },
      el('h3', { text: pn.length ? `⬆ What's new: ${pn.length === 1 ? `round ${s.notes[0].round}` : `${pn.length} rounds`}` : `⬆ ${s.behind} new change${s.behind === 1 ? '' : 's'} on main` }),
      el('p', { class: 'hint', text: `You have ${s.head} · main is at ${s.remote}. Hearth pulls them, then reloads (or restarts when needed). Your chats, scenes and settings stay.` }),
      pn.length ? el('div', { class: 'up-notes' }, pn) : null,
      pn.length ? el('details', { class: 'up-details' }, el('summary', { text: `Details: ${s.behind} change${s.behind === 1 ? '' : 's'}` }), list, more) : list, pn.length ? null : more,
      ...notes.map((n) => el('p', { class: 'hint', text: n })),
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
    if (Date.now() - j.at > 5 * 60000) return;
    // (round 38, hintcalm) first in the one-at-a-time queue (hints.js): the patch notes come before any other note
    const say = (show) => (window.Hints ? Hints.offer({ id: `update:${j.at}`, kind: 'notice', rank: 0, once: false, ttl: 5 * 60000, show }) : show());
    if (j.back) { say(() => toast(`Back on the previous version (${j.to}). ⬆ offers the update again whenever you want.${j.note ? ` ${j.note}` : ''}`, { timeout: 9000 })); return; }
    // (round 42, whatsnew) two rounds or more: ONE digest card (Since you were away) is the note; one round: as before
    justUpdated = true;
    say(async () => {
      const card = await sinceAway(j);
      if (card) return card;
      const t = toast(`Hearth updated (${j.from} → ${j.to}, ${j.n} file${j.n === 1 ? '' : 's'}).${j.note ? ` ${j.note}` : ''}`, { timeout: j.note ? 14000 : 10000, action: { label: '📰 Patch notes', fn: () => patchNotes() } });
      // (round 37) something feels wrong? one click back to the version before, for this session
      t?.lastElementChild?.before?.(el('button', { class: 'up-back', text: '↶ Go back', title: `Go back to the version before this update (${j.from}): your chats and data stay`, on: { click: () => { t.remove(); goBack(); } } }));
      return t;
    });
  }
  // (round 37) an update finished as Hearth restarted (Windows had files open): said like any other, once
  // (asked for once after the restart; any later look would also bring it)
  function afterSwap() {
    if (!store.get('update.swapWait', 0)) return;
    store.set('update.swapWait', 0);
    check({ fetch: false });
  }
  function swapped(sw) {
    if (!sw.ok) { trouble({ ...sw, fix: sw.fix || { id: 'retry', label: 'Try again' } }); return; }
    store.set('update.just', { from: String(sw.from).slice(0, 7), to: String(sw.to).slice(0, 7), n: sw.changed, at: Date.now(), restart: false, note: sw.note || '', files: (sw.files || []).filter((f) => /^docs\//.test(f)).slice(0, 80) });
    afterUpdate();
  }

  // (round 42, whatsnew) ✦ Since you were away (whatsnew.js, its own lazy group): after an update, the digest card or
  // null (≤ 2.5 s, else the usual note); openSinceAway() = the digest any time (Settings › What's new…, Ctrl/⌘+K)
  let justUpdated = false;
  const loadWn = () => (typeof Lazy !== 'undefined' ? Lazy.load('whatsnew') : Promise.resolve());
  const sinceAway = (j) => Promise.race([loadWn().then(() => WhatsNew.afterUpdate(j, { goBack })), new Promise((res) => setTimeout(() => res(null), 2500))]).catch((err) => { console.warn('whatsnew', err); return null; });
  const openSinceAway = () => loadWn().then(() => WhatsNew.open()).catch((err) => toast(err.message, { type: 'error' }));
  // Hearth updated some other way (pulled by hand): the newest round's notes vs what this computer saw, cheaply
  // (index.txt only); the group loads only when there is something new
  async function sinceAwayAtStart() {
    if (justUpdated) return;
    let top = 0;
    try { top = Math.max(0, ...(await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).split('\n').map((l) => Number((/^round-(\d+)\.md$/.exec(l.trim()) || [])[1]) || 0)); } catch { return; }
    if (!top || justUpdated) return;
    const seen = store.get('whatsnew.seen', null);
    if (seen == null) { store.set('whatsnew.seen', top); return; } // the first start with it: from here on
    if (top > Number(seen)) loadWn().then(() => WhatsNew.atStart()).catch(() => {});
  }
  // (round 29) the patch-notes reader (patchnotes.js, its own lazy group)
  const patchNotes = (file) => (typeof Lazy !== 'undefined' ? Lazy.load('patchnotes') : Promise.resolve()).then(() => PatchNotes.open(file)).catch((err) => toast(err.message, { type: 'error' }));
  function start() {
    afterUpdate();
    const ready = () => { restoreView(); afterSwap(); setTimeout(() => sinceAwayAtStart(), 4000); };
    if (performance.getEntriesByName('hearth:ready').length) ready(); else addEventListener('hearth:ready', ready, { once: true });
    AppUI.addAction?.('Patch notes: what changed, round by round', () => patchNotes());
    AppUI.addAction?.('Go back to the previous Hearth version (before the last update)', () => goBack());
    // (round 39, powerwise) on the background schedule: only while Hearth is on screen, every hour on battery, never
    // while the computer sleeps and not before a minute after it wakes (the network comes back first)
    if (window.Power) Power.every('updater', EVERY, () => { if (auto()) check(); }, { first: 25000, hidden: 'skip', wakeSettle: 60000 });
    else { setTimeout(() => { if (auto()) check(); }, 25000); setInterval(() => { if (auto() && !document.hidden) check(); }, EVERY); }
    // (round 19, splash) not on the window's first focus at launch (a git fetch while the first screen builds): the
    // check 25 s in covers that; later, coming back after 10 minutes away checks again
    window.addEventListener('focus', () => { if (auto() && performance.now() > 20000 && Date.now() - checkedAt > 10 * 60000) check(); });
    if (typeof Commands !== 'undefined' && !Commands.get('update')) {
      Commands.register({
        name: 'update', area: 'App', args: '[now | check | back | auto on|off]', aliases: ['upgrade-hearth'],
        desc: 'Update Hearth from main (its git checkout): what\'s new, then pull and reload / restart',
        complete: () => ['now', 'check', 'back', 'auto on', 'auto off'].map((value) => ({ value })),
        examples: ['/update', '/update now', '/update back', '/update auto off'],
        run: async (args) => {
          const a = String(args || '').trim().toLowerCase();
          if (a === 'auto on' || a === 'auto off') { store.set('update.auto', a === 'auto on'); return `Looking for updates by itself: **${auto() ? 'on' : 'off'}** (the ⬆ button shows when main has something new).`; }
          if (a === 'back') { const r = await goBack(); return r?.ok ? `Going back to **${r.to}**…` : r?.message || 'Nothing to go back to.'; }
          const s = await check();
          if (!s.ok) { if (s.fix) trouble(s); return s.message; }
          if (!s.behind) return `Hearth is up to date (${s.head}).`;
          if (a === 'now') { run(); return `Updating: ${s.behind} new change${s.behind === 1 ? '' : 's'}…`; }
          if (a !== 'check') dialog();
          return `**${s.behind} new change${s.behind === 1 ? '' : 's'} on main**:\n${s.commits.slice(0, 8).map((c) => `- ${c.subject}`).join('\n')}${s.behind > 8 ? `\n- …and ${s.behind - 8} more` : ''}\n\n\`/update now\` (or the ⬆ button) pulls them and reloads.`;
        },
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { check, run, dialog, patchNotes, sinceAway: openSinceAway, goBack, trouble, restoreView, keepView, get status() { return last; }, _setApi: (fn) => { api = fn; } };
})();
