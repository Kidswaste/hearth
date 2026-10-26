// (round 67, invite67) 👋 Bring someone: the small card a show's "👋 Bring someone" button opens (lazy group 'invite',
// loaded on that first click). Where the button is: every show card (Sidequest Studio › Map › ✦ Shows this week → a show,
// a venue pin on the map → its next show) and the weekend plan's night-out slot (🗓 Plan my weekend in the ✦ tracker).
// The card: pick a tone (Casual · Hyped · Low-pressure) and a language (Français · English); Hearth writes a short invite
// with the show's name, date, venue and ticket link from a template (invite-core.js: no AI, no tokens). The text is
// yours to edit. Copy · Open in WhatsApp / Messages (Mac) / Instagram: these only open the app with the text filled in
// (Instagram can't be filled: the text is copied, you paste it) — nothing is ever sent by Hearth. "✨ Rewrite with
// Claude" asks Claude for a reworded version only when clicked (one small lean turn). "I sent it" (only your click)
// saves your invite as your own proof on a matching social quest's invite step (Codex's QuestCore.submit: no AI, no XP
// until you ask for the Studio's review); with no matching quest, nothing is logged. The tone and language you last
// picked are remembered on this computer (store: a convenience, nothing else).
const Invite = (() => {
  const IC = () => InviteCore;
  const PREF = 'invite67:prefs';
  const _test = { ask: null, opened: [], noOpen: false }; // (checks) a stand-in AI answer; the links opened; noOpen: don't hand them to the OS
  let prefs = { tone: 'casual', lang: 'fr' };
  try { prefs = { ...prefs, ...(store.get(PREF, {}) || {}) }; } catch { /* defaults */ }
  let dlg = null, cur = null, opener = null;

  const os = () => window.hub?.native?.os || (/Mac/.test(navigator.platform) ? 'mac' : 'win');
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `iv-btn ${cls}`.trim(), text, title: title || null, on: { click: (e) => { e.preventDefault(); Promise.resolve(run(e)).catch((err) => say(calmError(err), true)); } } });
  function say(text, bad = false) { const s = dlg?.querySelector('.iv-status'); if (s) { s.textContent = text; s.classList.toggle('bad', !!bad); } }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* the window isn't focused: Electron's own clipboard */ }
    try { if (window.hub?.clipboard?.writeText) { await window.hub.clipboard.writeText(text); return true; } } catch { /* nothing */ }
    return false;
  }
  function openLink(url) { _test.opened.push(url); if (!_test.noOpen) window.hub?.openExternal?.(url); }

  // ---------- the card ----------
  function open(show, { from = 'card' } = {}) {
    if (!show) throw Error('Pick a show first.');
    close();
    opener = document.activeElement;
    cur = { show, from, tone: IC().tone(prefs.tone), lang: IC().lang(prefs.lang), text: '', edited: false, matches: null, busy: '', logged: false };
    cur.text = IC().build({ show, tone: cur.tone, lang: cur.lang });
    dlg = el('dialog', { class: 'iv-dialog', attrs: { 'aria-label': 'Bring someone' }, dataset: { invite: show.key || '' } });
    dlg.addEventListener('close', () => { dlg?.remove(); dlg = null; cur = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // a click on the backdrop closes it
    document.body.append(dlg);
    render();
    dlg.showModal();
    dlg.querySelector('.iv-copy')?.focus({ preventScroll: true });
    findQuests().then(() => render(true)).catch(() => {});
    return dlg;
  }
  function close() { if (dlg?.open) dlg.close(); else { dlg?.remove(); dlg = null; cur = null; } }

  function regen() { cur.text = IC().build({ show: cur.show, tone: cur.tone, lang: cur.lang }); cur.edited = false; }
  function setTone(t) { cur.tone = IC().tone(t); prefs.tone = cur.tone; savePrefs(); regen(); render(); }
  function setLang(l) { cur.lang = IC().lang(l); prefs.lang = cur.lang; savePrefs(); regen(); render(); }
  function savePrefs() { try { store.set(PREF, { tone: prefs.tone, lang: prefs.lang }); } catch { /* a convenience only */ } }

  function seg(label, list, names, value, set, cls) {
    return el('div', { class: `iv-seg ${cls}`, attrs: { role: 'group', 'aria-label': label } }, el('span', { class: 'iv-k', text: label }),
      ...list.map((v) => el('button', { type: 'button', class: `iv-pill${v === value ? ' on' : ''}`, text: names[v], dataset: { v }, attrs: { 'aria-pressed': String(v === value) }, on: { click: () => set(v) } })));
  }
  function render(soft = false) {
    if (!dlg || !cur) return;
    const ta = dlg.querySelector('.iv-text');
    if (soft && ta) { // only the "I sent it" row changes (the quests were read): keep the text box and its caret as they are
      dlg.querySelector('.iv-sent')?.replaceWith(sentRow());
      return;
    }
    const s = cur.show, I = IC();
    const text = el('textarea', { class: 'iv-text', attrs: { 'aria-label': 'Your invite (you can edit it)', rows: 6, maxlength: 1500, spellcheck: 'true' } });
    text.value = cur.text;
    text.addEventListener('input', () => { cur.text = text.value; cur.edited = true; });
    const L = I.links(cur.text, os());
    const openIn = el('div', { class: 'iv-row iv-open' }, el('span', { class: 'iv-k', text: 'Open in…' }),
      btn('WhatsApp', () => openApp('whatsapp'), 'iv-wa', 'Opens WhatsApp with the text filled in: you pick who and press send'),
      L.messages ? btn('Messages', () => openApp('messages'), 'iv-sms', 'Opens Messages with the text filled in: you pick who and press send') : null,
      btn('Instagram', () => openApp('instagram'), 'iv-ig', 'Copies the text, then opens your Instagram messages: paste it in the chat you pick'));
    dlg.replaceChildren(
      el('header', { class: 'iv-head' },
        el('div', { class: 'iv-title' }, el('span', { class: 'iv-pi', text: '👋' }), el('div', {}, el('strong', { text: 'Bring someone' }), el('span', { class: 'iv-sub', text: I.summary(s, 'en') }))),
        el('button', { type: 'button', class: 'iv-x', text: '×', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } })),
      seg('Tone', I.TONES, I.TONE_NAMES, cur.tone, setTone, 'iv-tone'),
      seg('Language', I.LANGS, I.LANG_NAMES, cur.lang, setLang, 'iv-lang'),
      text,
      el('div', { class: 'iv-row iv-main' },
        btn('Copy', async () => { say((await copy(cur.text)) ? 'Copied. Paste it wherever you like: nothing is sent by Hearth.' : 'Couldn’t copy: select the text and copy it yourself.'); }, 'iv-primary iv-copy', 'Copy the invite'),
        btn(cur.busy === 'ai' ? '✨ Rewriting…' : '✨ Rewrite with Claude', rewrite, 'iv-ai', 'Asks Claude for a reworded version (one small message, only now). Your template text stays if you don’t like it.')),
      openIn,
      el('p', { class: 'iv-note', text: 'Nothing is sent for you: Hearth only fills the text in. You pick who, and it’s fine if they say no.' }),
      sentRow(),
      el('p', { class: 'iv-status', attrs: { role: 'status', 'aria-live': 'polite' } }));
    if (cur.busy === 'ai') dlg.querySelector('.iv-ai').disabled = true;
  }
  function sentRow() {
    const m = cur.matches || [];
    if (cur.logged) return el('div', { class: 'iv-row iv-sent' }, el('span', { class: 'iv-done', text: `✓ Logged “Invited someone” on ${cur.logged}. Any answer is a good one.` }));
    const pick = m.length > 1 ? el('select', { class: 'iv-quest', attrs: { 'aria-label': 'Log it on this quest' } }, ...m.map((x, i) => { const o = el('option', { text: `${x.quest} · ${x.step}` }); o.value = String(i); return o; })) : null;
    const hint = m.length === 1 ? el('span', { class: 'iv-hint', text: `logs it on “${m[0].quest}”` }) : !m.length && cur.matches ? el('span', { class: 'iv-hint', text: 'no social quest is waiting for an invite: nothing is logged' }) : null;
    const b = btn(cur.busy === 'log' ? 'Saving…' : '✓ I sent it', () => sent(pick ? Number(pick.value) : 0), 'iv-sentbtn', m.length ? 'Saves your invite on that quest’s invite step, as your own proof (no AI, nothing sent)' : 'Closes the card');
    if (cur.busy === 'log') b.disabled = true;
    return el('div', { class: 'iv-row iv-sent' }, b, pick, hint);
  }

  // ---------- Open in… (only opens the app; never sends) ----------
  async function openApp(app) {
    const L = IC().links(cur.text, os()), copied = await copy(cur.text);
    const url = L[app]; if (!url) throw Error('That app isn’t available on this computer.');
    openLink(url);
    say(app === 'instagram' ? (copied ? 'Text copied. Instagram is opening: paste it in the chat you pick, then send it yourself.' : 'Instagram is opening. Copy the text first, then paste it in the chat you pick.')
      : `${app === 'whatsapp' ? 'WhatsApp' : 'Messages'} is opening with the text filled in (also copied). You pick who and press send.`);
  }

  // ---------- ✨ Rewrite with Claude (only on click) ----------
  async function rewrite() {
    if (cur.busy) return;
    const was = cur.text, lang = cur.lang, prompt = IC().rewritePrompt(was, cur.tone, lang);
    cur.busy = 'ai'; render(); say('Asking Claude for a reworded version…');
    try {
      let r;
      if (_test.ask) r = await _test.ask(prompt);
      else {
        const agent = typeof H !== 'undefined' ? H.claudeAgent?.() || (H.agents || []).find((a) => a.native) : null;
        if (!agent || !window.hub?.askOnce) throw Error('No Claude to ask here. The template text is ready as it is.');
        r = await window.hub.askOnce({ agentId: agent.id, text: prompt, options: { lean: true, helper: true, effort: 'low' } });
      }
      if (!r?.ok) throw Error(`Claude couldn’t answer just now (${String(r?.error || 'no answer').slice(0, 100)}). Your text is unchanged.`);
      if (!cur) return;
      cur.text = IC().tidyRewrite(r.text, was, lang); cur.edited = true;
      const used = r.usage ? (r.usage.input || 0) + (r.usage.output || 0) : 0;
      cur.busy = ''; render(); say(`✨ Reworded by Claude${used ? ` · ${used.toLocaleString()} tokens` : ''}. Edit it freely; pick a tone again for the template.`);
    } catch (err) { if (cur) { cur.busy = ''; render(); say(calmError(err), true); } }
  }

  // ---------- "I sent it": the matching social quests, and the log on one of them ----------
  async function journal() {
    if (typeof QuestHud === 'undefined') return null;
    await QuestHud.refresh?.();
    const j = QuestHud.journal?.(); return j?.status === 'ok' && j.C && j.S ? j : null;
  }
  async function findQuests() {
    const want = cur;
    let m = [];
    try { const j = await journal(); if (j) m = IC().matchQuests(j.C, j.S, want.show); } catch { m = []; }
    if (cur === want) cur.matches = m;
    return m;
  }
  const b64 = (text) => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  async function sha(text) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
  async function sent(i = 0) {
    if (!cur || cur.busy) return null;
    const m = cur.matches || await findQuests(), pick = m[i];
    if (!pick) { const msg = 'Nice. Have a good night!'; close(); toast(`👋 ${msg}`, { timeout: 2500 }); return null; }
    cur.busy = 'log'; render(true);
    try {
      const note = IC().proofNote({ show: cur.show, tone: cur.tone, lang: cur.lang, text: cur.text });
      const path = await window.hub.saveAttachment(`invite-${String(cur.show.key || 'show').replace(/[^\w-]+/g, '-').slice(0, 60)}-${Date.now().toString(36)}.md`, b64(note));
      if (!path || typeof path !== 'string') throw Error('Your note couldn’t be saved, so nothing was logged.');
      const proof = { type: 'file', title: `Invited someone: ${cur.show.title || 'a show'}`.slice(0, 200), path, kind: 'text/markdown', bytes: new TextEncoder().encode(note).length,
        fingerprint: await sha(note), images: [], excerpt: note, analysis: '', coverage: IC().PROOF_COVERAGE };
      await QuestHud.write((s) => {
        const C = QuestHud.journal().C;
        if (!C.available(s, pick.qid) || C.done(s, pick.qid)) throw Error('That quest step moved on in the meantime. Nothing was logged.');
        return C.submit(s, pick.qid, proof, 'Invited someone');
      }, `Invited someone: saved on “${pick.quest}”.`);
      cur.logged = pick.quest; cur.busy = '';
      render(true);
      say('Saved as your own proof on the quest’s invite step. Ask for its review in Sidequest Studio when you like.');
      return pick;
    } catch (err) { if (cur) { cur.busy = ''; render(true); say(calmError(err), true); } return null; }
  }

  return { open, close, isOpen: () => Boolean(dlg?.open), state: () => (cur ? { tone: cur.tone, lang: cur.lang, text: cur.text, matches: cur.matches, logged: cur.logged, from: cur.from } : null), sent, rewrite, openApp, _test };
})();
