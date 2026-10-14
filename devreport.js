// Report to the developer (round 21, devreport): when something in Hearth goes wrong, the owner (or a chat, with the
// owner's OK) sends it to the developer agent that builds Hearth, as a GitHub issue in kidswaste/hearth labelled
// hearth-report. A scheduled developer session reads those issues, fixes them on main and closes them; ⬆ Update brings
// the fix, and Hearth says "Your report #12 is fixed in this update". Loaded on first use (lazy group 'devreport');
// devreport-hooks.js puts the ⚑ / Report buttons where problems show.
//   The report: a short title, what the owner was doing, the error and its stack (app file:line), the last ~50 log
//   lines that matter (the error log, the jank watch's top culprits, the engine log's tail), Hearth's version (git
//   HEAD), OS / Electron / engine versions, the chat's last steps (tool names only). No chat text unless the owner
//   ticks it; keys / tokens / passwords masked (AccessRules.redact and more), the home folder shown as ~.
//   Always shown in full for review and editing first: sending is outward-facing.
//   Sending: with the GitHub CLI when it's installed and signed in (devreportmain.js; Hearth never touches a token),
//   else GitHub's new-issue page opens prefilled in the browser (the full text on the clipboard when the link had to
//   be cut) and the owner presses Submit.
//   Sent reports are kept on this computer (kv/dev-reports.json): the same error isn't reported twice in a day,
//   /report list shows them with their issue links and state (open / fixed).
//   /report auto on: crashes are sent by themselves (needs gh; still masked, no chat text, at most 3 a day).
// Chats: chat_report_problem { title, details } only drafts a card; the owner opens and sends it.
const DevReport = (() => {
  const C = DevReportCore;
  const KV = 'dev-reports';
  const AUTO_MAX = 3;
  let api = () => window.hub.devreport;
  let openUrl = (url) => window.hub.openExternal(url);
  let data = null;
  let infoCache = null;
  const short = (s, n = 80) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const within = (p, ms, dflt = null) => Promise.race([Promise.resolve(p).catch(() => dflt), new Promise((r) => setTimeout(() => r(dflt), ms))]);
  const autoOn = () => store.get('devreport.auto', false) === true;

  async function load() {
    if (data) return data;
    try { data = await window.hub.kvGet(KV, null); } catch { /* none */ }
    if (!data || !Array.isArray(data.items)) data = { items: [], auto: { day: '', n: 0 } };
    return data;
  }
  const save = () => window.hub.kvSet(KV, data).catch(() => {});

  // ---------- gathering ----------
  async function info() {
    if (!infoCache) {
      const i = (await within(api()?.info?.(), 6000, null)) || {};
      let engines = '';
      try {
        const d = await within(window.hub.engineDoctor?.(), 6000, null);
        if (d) engines = ['claude', 'codex'].map((e) => d[e] && `${d[e].label || e} ${d[e].version || (d[e].found ? '(version unknown)' : 'not found')}`).filter(Boolean).join(' · ');
      } catch { /* none */ }
      infoCache = { ...i, engines };
    }
    return infoCache;
  }
  const toolName = (t) => { const n = String(t || ''); const m = n.match(/^mcp__(?:claude_ai_)?.+?__(.+)$/); return (m ? m[1] : n.split(' · ')[0]).slice(0, 40); };
  function chatOf(agentId) { try { return agentId ? Native.chatOf(agentId) : null; } catch { return null; } }
  function lastSteps(chat) {
    const m = [...(chat?.messages || [])].reverse().find((x) => x.role === 'assistant' && x.tools?.length);
    return m ? m.tools.slice(-12).map(toolName) : [];
  }
  function chatText(chat) {
    const msgs = (chat?.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'error').slice(-3);
    return msgs.map((m) => `${m.role === 'user' ? 'Owner' : m.role === 'error' ? 'Error' : 'Reply'}: ${String(m.text || '').slice(0, 1200)}`).join('\n\n');
  }
  function doing(agentId) {
    const bits = [];
    try {
      const id = H.activeId || '';
      if (id.startsWith('tool:')) bits.push(`in ${(typeof Tools !== 'undefined' && Tools.get?.(id.slice(5))?.name) || id.slice(5)}`);
      const a = H.agent(agentId || id);
      if (a) bits.push(`chatting with ${a.name}${a.dock ? ` (docked in ${a.dock})` : ''}${a.engine ? `, ${a.engine === 'codex' ? 'Codex' : 'Claude'} engine` : ''}`);
    } catch { /* early */ }
    try { const r = Commands.recent().filter((n) => n !== 'report').slice(0, 5); if (r.length) bits.push(`recent commands: ${r.map((n) => `/${n}`).join(' ')}`); } catch { /* none */ }
    return bits.join(' · ');
  }
  async function logs(kind, home, appDir) {
    const out = { errors: [], jank: [], engine: [], extra: [] };
    try { out.errors = (Habits.top(8) || []).map((e) => `${e.n}× ${short(e.sample, 160)}${e.where ? ` (${Object.keys(e.where).slice(0, 3).join(', ')})` : ''}`); } catch { /* none */ }
    try {
      if (window.Lazy) await within(Lazy.load('jankwatch'), 4000);
      const g = await within(JankReport.gather('day'), 5000, null);
      out.jank = (g?.top || []).map((c) => `${Math.round(c.ms)} ms in ${c.n} long frame${c.n === 1 ? '' : 's'} · ${c.where} · ${c.plain} · ${c.call}`);
    } catch { /* not loaded */ }
    try {
      const dir = String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
      const file = `${dir}/engine.log`;
      const text = (await window.hub.fs.stat?.(file)) ? await within(window.hub.fs.read(file), 3000, '') : '';
      out.engine = String(text || '').trim().split('\n').filter((l) => l.trim()).slice(-(kind === 'reply' || kind === 'stall' ? 30 : 15)).map((l) => short(l, 300));
    } catch { /* no log yet */ }
    // ~50 lines in all: the engine tail gives way first
    const room = 50 - out.errors.length - out.jank.length;
    if (out.engine.length > room) out.engine = out.engine.slice(-Math.max(5, room));
    for (const k of Object.keys(out)) out[k] = out[k].map((l) => C.mask(l, { home, appDir }));
    return out;
  }
  const TITLE = { toast: 'Error', page: 'Page error', reply: 'A reply failed', crash: 'Hearth crashed', stall: 'A reply stalled', smooth: 'Not smooth', chat: 'Problem a chat found', manual: 'Problem' };
  // opts: { kind, item, agentId, chatId, title, what, status, includeChat }
  async function gather(opts = {}) {
    const i = await info();
    const home = i.home || ''; const appDir = i.appDir || '';
    const kind = opts.kind || 'manual';
    let item = opts.item || null;
    if (!item && kind === 'manual') { const l = DevReportHooks?.last?.(); if (l && Date.now() - l.at < 15 * 60000) item = l; }
    const agentId = opts.agentId || item?.agentId || (H.agent(H.activeId) ? H.activeId : H.claudeAgent?.()?.id);
    const chat = chatOf(agentId);
    const r = { id: C.newId(), kind, info: { ...i, where: item?.where || '' }, steps: lastSteps(chat) };
    if (item?.message) r.error = { message: C.mask(item.message, { home, appDir }).slice(0, 1500), stack: C.appStack(item.stack, { home, appDir }) };
    r.what = C.mask(opts.what || '', { home, appDir });
    r.doing = C.mask(doing(agentId), { home, appDir });
    r.logs = await logs(kind, home, appDir);
    if (opts.status) r.logs.extra = [`# the reply's live status`, ...String(opts.status).split('\n').slice(0, 12).map((l) => C.mask(l, { home, appDir }))];
    if (item?.crashes?.length) r.logs.extra = [`# crashes`, ...item.crashes.slice(-5).map((c) => `${new Date(c.t).toISOString()} ${c.kind}: ${C.mask(c.what, { home, appDir })}`)];
    r.chat = chat ? C.mask(chatText(chat), { home, appDir }) : '';
    const first = (item?.message || '').split('\n')[0].replace(/^(Page error|Unhandled|Crash):\s*/, '');
    r.title = C.mask(opts.title || (opts.what && kind === 'manual' ? short(opts.what, 90) : `${TITLE[kind] || 'Problem'}${first ? `: ${short(first, 80)}` : opts.what ? `: ${short(opts.what, 80)}` : ''}`), { home, appDir });
    r.key = C.keyOf(item?.message || opts.title || opts.what || r.title);
    r.home = home; r.appDir = appDir;
    return r;
  }

  // ---------- review ----------
  async function open(opts = {}) {
    await load();
    const r = await gather(opts);
    const dup = C.dupOf(data.items, r.key);
    if (dup && !opts.force) {
      const again = await Modal.confirm('Already reported today', `You reported this ${timeAgo(dup.at)}${dup.number ? ` (#${dup.number})` : ''}: “${short(dup.title, 90)}”. Report it again anyway?`, { ok: 'Report again' });
      if (!again) return null;
    }
    return review(r, opts);
  }
  function review(r, opts = {}) {
    const st = within(api()?.gh?.(), 8000, { installed: false });
    let withChat = Boolean(opts.includeChat);
    const title = el('input', { class: 'dr-title', value: r.title, maxlength: 200 });
    const text = el('textarea', { class: 'dr-body', rows: 16, spellcheck: false, value: C.body(r, { chat: withChat }) });
    let edited = false;
    text.addEventListener('input', () => { edited = true; });
    const chatBox = el('input', { type: 'checkbox', checked: withChat, disabled: !r.chat });
    chatBox.addEventListener('change', () => {
      withChat = chatBox.checked;
      const block = C.body(r, { chat: true }).match(/<!-- chat -->[\s\S]*?<!-- \/chat -->/)?.[0] || '';
      if (!edited) { text.value = C.body(r, { chat: withChat }); return; }
      if (withChat && !text.value.includes('<!-- chat -->')) text.value = text.value.replace(/\n\n---\n_Sent from Hearth/, `\n\n${block}\n\n---\n_Sent from Hearth`);
      else if (!withChat) text.value = text.value.replace(/\n*<!-- chat -->[\s\S]*?<!-- \/chat -->/, '');
    });
    const how = el('p', { class: 'hint dr-how', text: 'Checking how to send…' });
    st.then((s) => { how.textContent = s?.signedIn ? `Sends as a GitHub issue with the GitHub CLI (signed in), to ${C.REPO}.` : `Opens GitHub's new-issue page in your browser with this filled in: press Submit there.${s?.installed ? ' (The GitHub CLI is installed but not signed in: `gh auth login` lets Hearth send it directly.)' : ''}`; });
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const form = el('form', { method: 'dialog', on: { submit: (e) => e.preventDefault() } },
        el('h2', { text: '⚑ Report to the developer' }),
        el('p', { class: 'hint', text: 'It goes to the developer who builds Hearth, who fixes it on main; ⬆ Update brings the fix. Read it and change anything: keys, passwords and your user name are already taken out.' }),
        el('label', { class: 'dr-field' }, 'Title', title),
        el('label', { class: 'dr-field' }, 'The report (Markdown)', text),
        el('label', { class: 'check dr-chat', title: r.chat ? 'The last messages of this chat, masked' : 'No chat open' }, chatBox, ' Include the chat\'s last messages'),
        how,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => { dlg.close(); } } }),
          el('button', { type: 'button', text: 'Copy', title: 'Copy the report (to paste it anywhere)', on: { click: () => copyText(`# ${title.value}\n\n${text.value}`, 'Report copied') } }),
          el('button', { type: 'button', class: 'primary', text: 'Send', on: { click: async (e) => {
            const t = title.value.trim();
            if (!t) { title.focus(); return; }
            e.target.disabled = true;
            const res = await send({ ...r, title: t }, text.value, { withChat });
            if (res.ok) { dlg.close(); finish(res); } else e.target.disabled = false;
          } } })));
      const dlg = el('dialog', { class: 'ui-modal devreport-dlg' }, form);
      dlg.addEventListener('close', () => { dlg.remove(); finish(null); });
      document.body.append(dlg);
      dlg.showModal();
      title.focus();
    });
  }

  // ---------- sending ----------
  async function send(r, bodyText, { withChat = false, quiet = false, ghOnly = false } = {}) {
    await load();
    const title = C.mask(r.title, { home: r.home, appDir: r.appDir }).slice(0, 200);
    const text = C.mask(bodyText, { home: r.home, appDir: r.appDir }); // again: what the owner typed or pasted too
    const s = await within(api()?.gh?.(), 8000, { installed: false });
    let res = null;
    if (s?.signedIn) {
      const t = quiet ? null : toast('Sending the report…', { timeout: 60000 });
      res = await within(api().send({ title, body: text }), 70000, { ok: false, error: 'gh didn\'t answer' });
      t?.remove?.();
      if (res.ok) res.via = 'gh';
      else if (!quiet) toast(`The GitHub CLI couldn't file it (${res.error}). Opening GitHub in the browser instead.`, { type: 'error', timeout: 7000, devreport: false });
    }
    if (!res?.ok) {
      if (ghOnly) return { ok: false, error: res?.error || 'The GitHub CLI isn\'t signed in' };
      const u = C.issueUrl(title, text);
      if (u.trimmed) { try { await navigator.clipboard.writeText(text); } catch { /* no clipboard */ } }
      try { await openUrl(u.url); } catch (err) { toast(`Couldn't open the browser: ${err.message}`, { type: 'error', devreport: false }); return { ok: false }; }
      res = { ok: true, via: 'browser', url: '', number: null, trimmed: u.trimmed, link: u.url };
    }
    const rec = { id: r.id, key: r.key, kind: r.kind, title: short(title, 140), at: Date.now(), via: res.via, number: res.number || null, url: res.url || '', state: 'open', chat: withChat };
    data.items.unshift(rec);
    data.items = data.items.slice(0, 100);
    await save();
    if (!quiet) {
      if (res.via === 'gh') toast(`Sent to the developer: issue #${res.number}. Hearth tells you when an update fixes it.`, { timeout: 8000, action: res.url ? { label: 'Open', fn: () => openUrl(res.url) } : undefined });
      else toast(`GitHub opened with your report: press Submit there.${res.trimmed ? ' It was too long for the link: the full report is on the clipboard, paste it over the text.' : ''}`, { timeout: 12000 });
    }
    return { ...res, record: rec };
  }

  // crashes sent by themselves (the owner's opt-in): gh only, masked, no chat text, 3 a day at most, no repeats
  async function autoCrash(item) {
    await load();
    const day = new Date().toLocaleDateString('en-CA');
    if (data.auto?.day !== day) data.auto = { day, n: 0 };
    const r = await gather({ kind: 'crash', item });
    const dup = C.dupOf(data.items, r.key);
    const offer = () => toast(`Hearth crashed last time (${short(item.message.replace(/^Crash:\s*/, ''), 60)}).`, { type: 'error', timeout: 12000, devreport: false, action: { label: 'Report to the developer', fn: () => open({ kind: 'crash', item }) } });
    if (dup) return { ok: false, why: 'dup' };
    if (!autoOn() || data.auto.n >= AUTO_MAX) { offer(); return { ok: false, why: 'limit' }; }
    const res = await send(r, C.body(r, { chat: false }), { quiet: true, ghOnly: true });
    if (!res.ok) { offer(); return { ok: false, why: 'gh' }; }
    data.auto.n += 1; await save();
    toast(`Hearth crashed last time; the report went to the developer by itself (#${res.number}).`, { timeout: 8000, action: res.url ? { label: 'Open', fn: () => openUrl(res.url) } : undefined });
    return res;
  }

  // ---------- after an update ----------
  // j: store 'update.last' ({ from, to, … }); j.messages (tests) or the commits' messages from git
  async function checkUpdate(j) {
    await load();
    const open = data.items.filter((x) => x.state !== 'fixed');
    if (!open.length || !j) return [];
    const messages = Array.isArray(j.messages) ? j.messages : await within(api()?.log?.({ from: j.from, to: j.to }), 8000, []);
    const fixed = C.fixedBy(messages, open);
    for (const x of fixed) { x.state = 'fixed'; x.fixedIn = j.to || ''; x.fixedAt = Date.now(); }
    if (fixed.length) {
      await save();
      const names = fixed.map((x) => (x.number ? `#${x.number}` : `“${short(x.title, 40)}”`));
      const show = () => toast(fixed.length === 1 ? `Your report ${names[0]} is fixed in this update.` : `Your reports ${names.join(', ')} are fixed in this update.`, { timeout: 12000, action: { label: 'Your reports', fn: () => Commands.exec('/report list', H.claudeAgent()?.id) } });
      if (window.Hints) Hints.offer({ id: `report-fixed:${j.to || ''}`, kind: 'notice', rank: 2, once: false, ttl: 15 * 60000, show }); else show(); // (round 38, hintcalm) after the patch notes
    }
    return fixed;
  }

  // ---------- /report list ----------
  async function list() {
    await load();
    const items = data.items.slice(0, 15);
    if (!items.length) return 'No reports sent yet. `/report <what went wrong>` (or ⚑ on an error) sends one, after you review it.';
    const nums = items.filter((x) => x.number && x.state !== 'fixed').map((x) => x.number);
    if (nums.length) {
      const st = await within(api()?.states?.(nums), 12000, {});
      let changed = false;
      for (const x of items) { const s = st?.[x.number]; if (s && s !== x.state) { x.state = s; changed = true; } }
      if (changed) await save();
    }
    const ICON = { open: '○ open', fixed: '✓ fixed', closed: '– closed' };
    return [`**Your reports to the developer** (${data.items.length})`, ...items.map((x) => `- ${x.number ? `[#${x.number}](${x.url})` : x.via === 'browser' ? `sent in the browser (\`/report link ${x.id} <issue #>\`)` : x.id} ${ICON[x.state] || x.state}${x.fixedIn ? ` in ${x.fixedIn}` : ''} · ${short(x.title, 70)} · ${timeAgo(x.at)}`),
      autoOn() ? '\nCrashes are sent by themselves (`/report auto off` stops it).' : ''].filter(Boolean).join('\n');
  }

  // ---------- the chat's draft card (chat_report_problem) ----------
  function draftCard(agentId, { title, details }) {
    const a = H.agent(agentId);
    const t = short(title, 120); const d = String(details || '').slice(0, 1500);
    const box = Native.note(agentId, `**⚑ ${a?.name || 'The chat'} suggests a report to Hearth's developer**\n\n**${t}**\n\n${d}`, { id: `devreport-draft-${agentId}`,
      actions: [{ label: 'Review & send…', title: 'See the whole report first; nothing is sent without you', run: (b) => { b?.remove?.(); open({ kind: 'chat', agentId, title: `${t}`, what: d }); } },
        { label: 'Not now', run: (b) => b?.remove?.() }] });
    return box;
  }
  if (typeof HubBridge !== 'undefined') {
    HubBridge.register(['chat_report_problem'], async (tool, args) => {
      const title = String(args?.title || '').trim(); const details = String(args?.details || '').trim();
      if (!title) return { ok: false, error: 'A title is needed.' };
      draftCard(args.agentId, { title, details });
      return { ok: true, value: 'Drafted as a card in the chat: the user reviews it and decides whether to send it. Don\'t ask again for this problem.' };
    });
  }

  // ---------- /report ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('report')) return;
    Commands.register({
      name: 'report', aliases: ['report-bug'], area: 'App', args: '[<what went wrong> | last | list | link <id> <#> | auto on|off | tool on|off]',
      desc: 'Report a problem to the developer who builds Hearth (a GitHub issue; you review it first); list shows your reports and whether they\'re fixed',
      keywords: 'bug issue problem broken crash error github developer feedback fix report',
      examples: ['/report the Lab preview went black after Shuffle', '/report last', '/report list'],
      complete: () => [['last', 'the last error Hearth saw'], ['list', 'your sent reports, open or fixed'], ['auto on', 'send crash reports by themselves (3 a day at most)'], ['auto off', 'ask first for crashes too'], ['tool off', 'chats can\'t draft reports (saves ≈ 45 tokens a message)'], ['tool on', 'chats may draft reports for you to send']].map(([value, hint]) => ({ value, hint })),
      run: async (args, ctx) => {
        const a = String(args || '').trim();
        if (/^list$/i.test(a)) return list();
        const auto = a.match(/^auto\s+(on|off)$/i);
        if (auto) { store.set('devreport.auto', auto[1].toLowerCase() === 'on'); return autoOn() ? `Crash reports are sent by themselves now (with the GitHub CLI, masked, no chat text, ${AUTO_MAX} a day at most). Everything else still asks first.` : 'Crash reports ask first again.'; }
        const tool = a.match(/^tool\s+(on|off)$/i);
        if (tool) {
          const on = tool[1].toLowerCase() === 'on';
          for (const ag of H.agents().filter((x) => x.mode === 'native')) { if (on) delete ag.reportTool; else ag.reportTool = false; }
          saveConfig();
          return on ? 'Chats may draft a report to the developer again (chat_report_problem; you always review it). New chats get it.' : 'Chats no longer get chat_report_problem (≈ 45 tokens less per message). /report still works.';
        }
        const link = a.match(/^link\s+(hr-[a-z0-9]{6})\s+(?:#?(\d+)|(https:\/\/github\.com\/\S+\/issues\/(\d+)))$/i);
        if (link) {
          await load();
          const x = data.items.find((y) => y.id === link[1].toLowerCase());
          if (!x) return `No report ${link[1]} (\`/report list\`).`;
          x.number = Number(link[2] || link[4]); x.url = link[3] || `https://github.com/${C.REPO}/issues/${x.number}`; await save();
          return `Report ${x.id} is issue #${x.number} now.`;
        }
        const kind = /^(smooth|stall)$/i.test(a) ? a.toLowerCase() : 'manual';
        const opts = { kind, agentId: ctx?.agentId };
        if (kind === 'stall') { try { opts.status = ChatLive.describe(Native.pendingFor(ctx?.agentId) || H.activeChat[ctx?.agentId]) || ''; } catch { /* none */ } }
        if (/^last$/i.test(a)) { const l = DevReportHooks.last(); if (!l) return 'Hearth hasn\'t seen an error since it started. `/report <what went wrong>` describes it in your words.'; opts.item = l; opts.kind = l.kind; } else if (kind === 'manual' && a) opts.what = a;
        const res = await open(opts);
        return res ? undefined : 'Not sent.';
      },
    });
  }
  register();
  if (typeof AppUI !== 'undefined') {
    AppUI.addAction?.('Report a problem to the developer…', () => Commands.exec('/report', H.claudeAgent()?.id));
    AppUI.addAction?.('Your reports to the developer', () => Commands.exec('/report list', H.claudeAgent()?.id));
  }

  return { open, gather, review, send, list, checkUpdate, autoCrash, draftCard, _setApi: (fn) => { api = fn; infoCache = null; }, _setOpen: (fn) => { openUrl = fn; }, _reset: () => { data = null; infoCache = null; } };
})();
