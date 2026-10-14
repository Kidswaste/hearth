// Native chats: the hub's own chat screen, answered through the official Claude Code / Codex engines.
const Native = (() => {
  const views = new Map(); // agent id -> DOM refs + composer state
  const chats = new Map(); // chat id -> full chat (loaded on demand)
  const pending = new Map(); // chat id -> { text, tools, started, el }

  const ENGINE_LABEL = { claude: 'Claude', codex: 'ChatGPT' };
  const MODEL_CHOICES = { claude: ['opus', 'sonnet', 'haiku', 'fable'], codex: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] };
  const REMEMBER_TAG = /<remember>([\s\S]*?)<\/remember>/gi;
  // How much earlier conversation is sent as context when a chat has to start a fresh engine session
  // (imported chats, edited or regenerated messages, chats continued from another agent).
  const CONTEXT_CHARS = 24000;
  const TEXT_ATTACH_LIMIT = 200 * 1024;
  const COLLAPSE_PX = 900;
  const unfolded = new Set(); // "chatId:index" of long replies the user unfolded (they stay open)
  // Extension points for chat-*.js: render(agentId, view, chat), message(node, m, index, agent),
  // event(event, chat), mark(chat, index, key, on), send(agentId, chat, text).
  const hooks = { render: [], message: [], event: [], mark: [], send: [], newChat: [], finish: [], compose: [], speak: [], options: [], msgMenu: [] }; // msgMenu(agentId, index, m, chat) → more Reply › items (round 41, routines.js) // newChat(agentId): "New chat" (chat-scenes.js)
  // (round 23, voice.js) speak: { text(raw) → what is read, say(text, done) → true when it reads it itself (a system
  // voice), stop() }: the last one added reads replies aloud
  // (round 9, chatcore) finish(event, chat, extras): add fields to the reply about to be saved (chat-things.js: the
  // captures / renders / board items / scenes a reply made). compose(agentId, chat, full, message): may return a new
  // text for the engine (chat-context.js adds one short context line, only when your words point at the chat's things).

  // Follow-up suggestions the agent offers as buttons: <suggest>…</suggest>.
  const SUGGEST_TAG = /<suggest>([\s\S]*?)<\/suggest>/gi;
  // Hide memory / suggestion tags from what you see, including a tag that is still streaming in.
  // (round 10) <flow answer="…"/> moves the chat's flow (flows-ui.js reads it before this strips it)
  // (round 11) <progress pct="40" note="…"/>: how far the agent says it is (progress-hooks.js reads it while it streams)
  const visibleText = (text) => text.replace(REMEMBER_TAG, '').replace(SUGGEST_TAG, '').replace(/<flow\b[^>]*?\/?>(?:<\/flow>)?/gi, '').replace(/<progress\b[^>]*?\/?>(?:<\/progress>)?/gi, '').replace(/<progress\b[^>]*$/i, '').replace(/<(remember|suggest)>[\s\S]*$/i, '').replace(/<(rem|sug|prog)[a-z]*$/i, '').trim();
  const REVIEW_PROMPT = 'Review your last result critically against what I asked. For visual work, take a fresh screenshot and look closely. List the concrete problems you see, then fix the important ones.';

  // "mcp__claude_ai_Gmail__search_threads" -> "Gmail · search threads"
  const toolLabel = (name) => {
    const m = name.match(/^mcp__(?:claude_ai_)?(.+?)__(.+)$/);
    return m ? `${m[1].replace(/_/g, ' ')} · ${m[2].replace(/[_-]/g, ' ')}` : name;
  };
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const draftKey = (agentId) => `draft.${agentId}.${H.activeChat[agentId] || 'new'}`;
  const nearBottom = (list) => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  // Auto-scroll follows a reply only while you're at the bottom (v.follow). Your own scrolling decides it (wheel, keys,
  // a drag on the scrollbar): up stops it, back down to the bottom starts it again. It used to be decided by "within
  // 80 px of the bottom" at each paint, which pulled you back down when you had just scrolled up a little.
  const follows = (v) => (v ? v.follow !== false && !v.scrollLock : true);
  // Scrolls to the bottom once per frame, after the frame's DOM changes (one layout, not one per paint). It jumps:
  // a smooth scroll restarted by every paint (~16× a second) barely moves (each restart eases in again).
  function scrollToEnd(list, v) {
    if (list.endRaf) return;
    list.endRaf = requestAnimationFrame(() => {
      list.endRaf = 0;
      if (v && !follows(v)) return; // you scrolled up in the meantime
      const top = list.scrollHeight - list.clientHeight;
      if (top - list.scrollTop >= 1) list.scrollTop = top;
    });
  }

  function mount(agentId, root) {
    const title = el('span', { class: 'chat-title', title: 'Double-click to rename' });
    const meta = el('span', { class: 'chat-meta' });
    const modelSel = el('select', { class: 'model-select', title: 'Model for this chat' });
    const menuBtn = el('button', { class: 'ghost chat-menu-btn', text: '⋯', title: 'AI setup: who it is, its instructions and what it can use · right-click: this chat (model, rename, export…)', attrs: { 'data-feature': 'Chat options', 'aria-label': 'Chat options' } }); // (round 33, simplify3) the tooltip says what opens; usage keeps its name
    const newBtn = el('button', { class: 'ghost', text: '＋ New chat', title: 'New chat (Ctrl+N)', on: { click: () => newChat(agentId) } });
    // How much context each message sends now (the last reply's input tokens); click to compact.
    const ctx = el('button', { class: 'ctx-meter', hidden: true, on: { click: () => compactChat(agentId) } }, el('span', { class: 'ctx-bar' }, el('i')), el('span', { class: 'ctx-text' }));
    const header = el('header', { class: 'native-head' }, title, meta, ctx, el('span', { class: 'spacer' }), modelSel, menuBtn, newBtn);
    // Docked director chats are narrow: the header keeps only what fits (model and more live in ⋯ and /model).
    if (root.classList.contains('tool-dock')) { newBtn.textContent = '＋'; root.classList.add('dock-chat'); }
    // One button in the header: ⋯ holds New chat (Ctrl+N), the model and the rest. The model dropdown and the
    // big New chat button were never used; /model and Ctrl+N stay.
    else newBtn.hidden = true;
    modelSel.hidden = true;
    title.addEventListener('dblclick', () => renameCurrent(agentId));
    menuBtn.addEventListener('click', (e) => { if (typeof Lazy !== 'undefined' && Lazy.load) Lazy.load('options').then(() => Options.open({ agentId, place: 'chat' })).catch(() => chatMenu(agentId, e)); else chatMenu(agentId, e); });
    menuBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); chatMenu(agentId, e); });
    // (round 26, smooth26) pointing at ⋯ fetches AI setup (18 KB): the click then opens it at once
    menuBtn.addEventListener('pointerenter', () => { if (typeof Lazy !== 'undefined' && Lazy.load && !Lazy.loaded('options')) window.Jank?.calm?.(1500, null).then(() => Lazy.load('options')).catch(() => {}) ?? Lazy.load('options').catch(() => {}); }, { once: true });
    modelSel.addEventListener('change', () => setChatModel(agentId, modelSel.value));

    const list = el('div', { class: 'messages' });
    list.addEventListener('click', (e) => onListClick(e, agentId));
    list.addEventListener('toggle', fillFold, true); // (round 16) folded tool steps fill in when opened (toggle doesn't bubble: capture)
    // (round 35, streamrender) a picture in a reply loaded: its size is remembered (it takes its place before it loads
    // next time: the finished reply, the chat opened again), and a chat following its end stays at the end
    list.addEventListener('load', (e) => { if (e.target.tagName !== 'IMG') return; rememberSize(e.target); if (follows(v)) scrollToEnd(list, v); }, true);
    // Selected text in the chat gets a small bar: quote it, copy it, find it in the chat, or save it to notes.
    const selAct = (label, title, fn) => el('button', { type: 'button', text: label, title, on: { click: () => { const t = String(getSelection()).trim(); quoteSel.hidden = true; if (t) fn(t); } } });
    const quoteSel = el('div', { class: 'quote-sel sel-bar', hidden: true },
      selAct('❝ Quote', 'Quote it in your message', (t) => { input.value = `${t.split('\n').map((l) => `> ${l}`).join('\n')}\n\n${input.value}`; autosize(input); input.focus(); getSelection().removeAllRanges(); }),
      selAct('Copy', 'Copy the selection', (t) => copyText(t, 'Copied')),
      selAct('🔎', 'Find it in this chat', (t) => (typeof ChatUX !== 'undefined' ? ChatUX.find(agentId, t.slice(0, 80)) : null)),
      selAct('📝', 'Save it to notes', (t) => Notes.append(t)));
    quoteSel.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('mouseup', () => setTimeout(() => {
      const s = getSelection(); const t = String(s).trim();
      if (!t || !s.rangeCount || !list.contains(s.anchorNode)) { quoteSel.hidden = true; return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      Object.assign(quoteSel.style, { left: `${r.left + r.width / 2}px`, top: `${r.top - 30}px` });
      quoteSel.hidden = false;
    }));
    list.addEventListener('scroll', () => { if (!quoteSel.hidden) quoteSel.hidden = true; });
    document.body.append(quoteSel);
    queueMicrotask(() => list.parentElement?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyLastReply(agentId); }
    }));
    const jump = el('button', { class: 'jump-bottom', text: '↓', title: 'Jump to the latest message', hidden: true, on: { click: () => { v.follow = true; list.scrollTop = list.scrollHeight; } } });
    // the user's own scrolling (see follows): input in the last moment + where the scroll ended up
    let userAt = 0;
    const byUser = () => { userAt = performance.now(); };
    for (const ev of ['wheel', 'touchmove', 'pointerdown', 'keydown']) list.addEventListener(ev, byUser, { passive: true });
    // (round 35, streamrender) a wheel turned up (or Page Up / Home / ↑) stops following at once: waiting for the scroll
    // it starts let a reply's next paint scroll to the end first, which cancelled your wheel
    list.addEventListener('wheel', (e) => { if (e.deltaY < 0 && list.scrollTop > 0) v.follow = false; }, { passive: true });
    list.addEventListener('keydown', (e) => { if (['PageUp', 'Home', 'ArrowUp'].includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) v.follow = false; }, { passive: true });
    list.addEventListener('scroll', () => {
      const gap = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (gap < 4) v.follow = true; // at the very bottom (End, ↓, the jump button, or scrolled there): follow again
      else if (performance.now() - userAt < 700) v.follow = gap < 24;
      const near = gap < 80;
      if (jump.hidden !== near) jump.hidden = near;
      if (near && jump.classList.contains('has-new')) jump.classList.remove('has-new');
    });

    const chips = el('div', { class: 'attach-chips' });
    const input = el('textarea', { rows: 3, spellcheck: true });
    // (round 9) ＋ opens one menu: files, the board, captures, the Lab's frame, a screen region, recent renders (chat-attach.js)
    // (round 40, chatcalm) one sentence per tooltip, and Send says its key from the start
    const attachBtn = el('button', { type: 'button', class: 'ghost attach-btn', text: '＋', title: 'Attach files, the board, a capture, the Lab or the screen (or drop / paste them)', attrs: { 'aria-label': 'Attach' } });
    const sendBtn = el('button', { type: 'submit', class: 'primary', text: 'Send', title: 'Send (Enter)' });
    const counter = el('span', { class: 'composer-count' });
    const queueBox = el('div', { class: 'queue-chips', hidden: true });
    const styleBox = el('div', { class: 'style-chips', hidden: true });
    // (round 26) ◎ Missions (missions.js): what your next message becomes (split it up, swarm, review, jam…)
    const missionBtn = typeof Missions !== 'undefined' ? Missions.button(agentId) : null;
    const form = el('form', { class: 'composer' }, el('div', { class: 'composer-box' }, styleBox, queueBox, chips, input, counter), missionBtn, attachBtn, sendBtn);
    const v = { root, title, meta, ctx, modelSel, list, input, sendBtn, chips, counter, jump, attachments: [], queue: [], queueBox, styleBox, form, follow: true };

    const saveDraft = saver(() => store.set(draftKey(agentId), input.value || null), 400); // (round 29) kept during long typing too
    // (round 32, smooth32) deleting can't make the box taller: at its smallest it stays (measuring it laid out the whole
    // chat twice per Backspace)
    input.addEventListener('input', (e) => { if (!(e.inputType?.startsWith('delete') && input.style.height === '84px')) autosize(input); else input.lenSeen = input.value.length; updateCounter(v); saveDraft(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const id = H.activeChat[agentId];
        if (id && pending.has(id)) window.hub.stop(id);
        else if (stopSpeaking()) { /* Esc also stops reading aloud */ } else if (!input.value) clearNotes(agentId);
      }
      // Ctrl+↑ / Ctrl+↓: jump between your own messages
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const mine = [...list.querySelectorAll('.msg.user')]; const top = list.scrollTop; const up = e.key === 'ArrowUp';
        const target = up ? mine.reverse().find((m) => m.offsetTop < top - 8) : mine.find((m) => m.offsetTop > top + 8);
        if (target) { list.scrollTop = target.offsetTop - 12; target.classList.add('flash-msg'); setTimeout(() => target.classList.remove('flash-msg'), 700); }
      }
      // Alt+↑ / Alt+↓: earlier messages you sent (draft history)
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); historyStep(agentId, e.key === 'ArrowUp' ? 1 : -1); return; }
      // Alt+T: open / close every thinking block in this chat
      // (keys are read from e.code: on a Mac, Alt+letter types a special character)
      const altKey = e.code?.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key;
      if (e.altKey && altKey === 't') { e.preventDefault(); toggleThinking(agentId); return; }
      // Alt+R read the last reply aloud (again: stop) · Alt+B bookmark it · Alt+P pin it · Alt+Home / Alt+End scroll
      if (e.altKey && !e.ctrlKey && ALT_KEYS[altKey]) { e.preventDefault(); ALT_KEYS[altKey](agentId); return; }
      // Tab inside a ``` code fence indents instead of leaving the box
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && ((input.value.slice(0, input.selectionStart).match(/```/g) || []).length % 2 === 1)) {
        e.preventDefault(); insertDraft(agentId, '  '); return;
      }
      // /enter-sends off: Enter makes a new line and Ctrl+Enter sends
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && store.get('chat.enterSends', true) === false && !(e.ctrlKey || e.metaKey) && !input.value.startsWith('/')) { e.stopImmediatePropagation(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && store.get('chat.enterSends', true) === false) { e.preventDefault(); form.requestSubmit(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); return; }
      if (e.key === 'ArrowUp' && !input.value) { // edit your last message, like most chat apps
        const chat = chats.get(H.activeChat[agentId]);
        const idx = chat?.messages.map((m) => m.role).lastIndexOf('user');
        if (idx >= 0) { e.preventDefault(); editMessage(agentId, idx); }
      }
    });
    input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(agentId, files); return; }
      smartPaste(agentId, e);
    });
    attachBtn.addEventListener('click', async (e) => {
      if (typeof ChatAttach !== 'undefined' && !e.shiftKey) { ChatAttach.menu(agentId, attachBtn); return; } // Shift+click: the file picker straight away
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files' });
      for (const p of paths) await addPath(agentId, p);
    });
    dropZone(root, (files) => addFiles(agentId, files), { hint: 'Drop to attach' });
    // Text or a link dragged onto the messages goes into your message (text as a quote).
    list.addEventListener('dragover', (e) => { if (!e.dataTransfer?.types.includes('Files') && e.dataTransfer?.types.some((t) => t === 'text/plain' || t === 'text/uri-list')) e.preventDefault(); });
    list.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files.length) return;
      const url = e.dataTransfer?.getData('text/uri-list');
      const text = e.dataTransfer?.getData('text/plain');
      if (!url && !text) return;
      e.preventDefault();
      insertDraft(agentId, url && url === text ? `${url} ` : `${text.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n\n`);
    });
    Prompts.attach(input, (text) => { input.value = text; autosize(input); updateCounter(v); input.focus(); }, { agentId });

    input.addEventListener('input', () => syncSendBtn(agentId));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const chatId = H.activeChat[agentId];
      const text = input.value.trim();
      // While it answers: a typed message waits in line (sent when the reply ends); an empty box means Stop.
      // Chat commands still run right away (/stop, /find, /stats… while it works).
      if (chatId && pending.has(chatId)) {
        if (!text) { window.hub.stop(chatId); return; }
        if (text.startsWith('/') && Commands.parse(text)) {
          pushHistory(text);
          input.value = ''; store.set(draftKey(agentId), null); autosize(input); updateCounter(v); syncSendBtn(agentId);
          Commands.tryRun(text, agentId, input);
          return;
        }
        (v.queue ||= []).push(text);
        // (round 36) a mission picked for it waits with it (it runs as that mission when its turn comes)
        const mid = typeof Missions !== 'undefined' ? Missions.take?.(agentId) : null;
        if (mid) (v.queueMissions ||= new Map()).set(text, mid);
        input.value = '';
        store.set(draftKey(agentId), null);
        autosize(input);
        renderQueue(agentId);
        return;
      }
      if (!text && !v.attachments.length) return;
      if (text) pushHistory(text);
      // A "/word" that is almost a command (a typo) asks first: Enter again sends it to the agent as written.
      const typo = text.startsWith('/') && !Commands.parse(text) && !Commands.splitPipe?.(text) && v.typoOk !== text && Commands.closest?.(text.slice(1).split(/\s/)[0]);
      // (commands.js didYouMean adds plain-language matches: "/make it 9 by 16" → /size 9:16)
      const means = text.startsWith('/') && !Commands.parse(text) && !Commands.splitPipe?.(text) && v.typoOk !== text ? (Commands.didYouMean?.(text) || []) : [];
      if (typo || means.length) {
        v.typoOk = text;
        const opts = means.length ? means.map((m) => `\`${m.line.trim()}\``).join(' · ') : `\`/${typo.name}\``;
        note(agentId, `\`/${text.slice(1).split(/\s/)[0]}\` isn't a command. Did you mean ${opts}? Click one to run it, or press Enter again to send it to ${H.agent(agentId).name} as a message.`, { id: 'typo' });
        return;
      }
      // (round 26) a mission picked for this message (missions.js) sends it its own way
      if (text && !text.startsWith('/') && !v.attachments.length && typeof Missions !== 'undefined' && Missions.current(agentId).id !== 'normal') {
        input.value = ''; store.set(draftKey(agentId), null); autosize(input); updateCounter(v);
        if (Missions.submit(agentId, text)) return;
      }
      // "/command args" runs a chat command instead of sending (see commands.js); unknown "/words" are sent.
      if (text.startsWith('/') && Commands.parse(text)) {
        input.value = '';
        store.set(draftKey(agentId), null);
        autosize(input);
        updateCounter(v);
        Commands.tryRun(text, agentId, input);
        return;
      }
      input.value = '';
      store.set(draftKey(agentId), null);
      autosize(input);
      updateCounter(v);
      send(agentId, text).catch((err) => toast(err.message, { type: 'error' }));
    });

    root.append(header, el('div', { class: 'messages-wrap' }, list, jump), form);
    views.set(agentId, v);
    render(agentId);
    return v;
  }

  // Grows with the text up to ~45% of the window, then scrolls.
  function autosize(input) {
    const max = Math.max(160, Math.round(window.innerHeight * 0.45));
    // (round 16) typing more text that still fits (or a box already at its tallest) changes nothing: one cheap read
    // instead of resetting the height, which laid out the whole chat above it on every keystroke
    // (round 38, inputlatency) textLength, not value.length: reading a textarea's value copies its whole text (a long
    // draft: 30,000 characters per keystroke, several times)
    const len = input.textLength ?? input.value.length; const grew = len >= (input.lenSeen ?? Infinity); input.lenSeen = len;
    if (grew && input.style.height && (input.style.height === `${max}px` || input.scrollHeight <= input.clientHeight)) return;
    // (round 38) deleting in a box at its tallest whose text still overflows it: it stays as it is (one read instead of
    // resetting the height and laying the chat out twice per Backspace in a long draft)
    if (!grew && input.style.height === `${max}px` && input.scrollHeight > input.clientHeight + 2) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(Math.max(input.scrollHeight + 2, 84), max)}px`;
    input.style.overflowY = input.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }
  const numFmt = new Intl.NumberFormat(); // (round 38) n.toLocaleString() built a formatter on every keystroke
  function updateCounter(v) {
    const n = v.input.textLength ?? v.input.value.length;
    const t = n > 200 ? `${numFmt.format(n)} chars · ~${fmt(Math.ceil(n / 4))} tokens` : '';
    if (v.counter.textContent !== t) v.counter.textContent = t; // (round 16) per keystroke: only when it changes
  }

  // ---------- composer helpers: draft history, smart paste, style chips ----------
  // Everything you send (messages and commands) is kept, newest first; Alt+↑ / Alt+↓ walks through it.
  const HISTORY_KEY = 'chat.sentHistory';
  function pushHistory(text) {
    const list = store.get(HISTORY_KEY, []).filter((t) => t !== text);
    list.unshift(text.slice(0, 4000));
    store.set(HISTORY_KEY, list.slice(0, 60));
  }
  function historyStep(agentId, dir) {
    const v = views.get(agentId);
    const list = store.get(HISTORY_KEY, []);
    if (!v || !list.length) return;
    if (v.histAt == null) { v.histAt = -1; v.histDraft = v.input.value; }
    v.histAt = Math.max(-1, Math.min(list.length - 1, v.histAt + dir));
    v.input.value = v.histAt < 0 ? v.histDraft : list[v.histAt];
    autosize(v.input); updateCounter(v);
    if (v.histAt < 0) v.histAt = null;
  }
  // Inserts text at the cursor (or the end) of the composer.
  function insertDraft(agentId, text) {
    const v = views.get(agentId);
    if (!v) return;
    const i = v.input;
    const at = document.activeElement === i ? i.selectionStart : i.value.length;
    i.value = `${i.value.slice(0, at)}${text}${i.value.slice(at)}`;
    autosize(i); updateCounter(v); i.focus();
    i.setSelectionRange(at + text.length, at + text.length);
    i.dispatchEvent(new Event('input'));
  }
  // Pasted code gets a ``` fence with its language; a huge paste becomes a text attachment instead of
  // filling the box. Ctrl+Shift+V (plain paste) is never touched; /smart-paste off turns this off.
  const looksLikeCode = (t) => t.includes('\n') && (/[;{}]\s*$/m.test(t) && /^\s{2,}\S/m.test(t) || /^\s*(import|export|const|let|function|def|class|#include|<\w+[^>]*>)\b/m.test(t)) && !/^\s*```/.test(t);
  function guessLang(t) {
    if (/^\s*(def |import \w+$|from \w+ import)/m.test(t)) return 'python';
    if (/gl_FragColor|void main\s*\(|uniform \w+/.test(t)) return 'glsl';
    if (/^\s*<[a-z!][\s\S]*>\s*$/i.test(t)) return 'html';
    if (/^\s*[\w-]+\s*\{[^}]*:[^}]*\}/m.test(t) && !/=>|function/.test(t)) return 'css';
    if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(t) && (() => { try { JSON.parse(t); return true; } catch { return false; } })()) return 'json';
    return 'js';
  }
  function smartPaste(agentId, e) {
    if (store.get('chat.smartPaste', true) === false) return;
    const t = e.clipboardData?.getData('text/plain') || '';
    const v = views.get(agentId);
    if (!t || !v) return;
    if (t.length > 6000) {
      e.preventDefault();
      // (round 40, attachlean) a "Pasted text" chip with its cost; trimmed like any big text when sent (attachlean.js)
      const lean = typeof AttachLean !== 'undefined';
      v.attachments.push({ kind: 'text', name: lean ? 'Pasted text' : `pasted-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.txt`, content: t.slice(0, lean ? AttachLean.MAX_BYTES : TEXT_ATTACH_LIMIT), ...(lean ? { pasted: true } : {}) });
      renderChips(agentId);
      toast(lean ? `Long paste attached as “Pasted text” (≈ ${fmt(Math.ceil(t.length / 4))} tokens; only what your message is about is sent)` : `Long paste (${t.length.toLocaleString()} chars) attached as a text file`, { timeout: 2500, action: { label: 'Paste as text', fn: () => { v.attachments.pop(); renderChips(agentId); insertDraft(agentId, t); } } });
      return;
    }
    const i = v.input;
    const inFence = (i.value.slice(0, i.selectionStart).match(/```/g) || []).length % 2 === 1;
    if (!inFence && looksLikeCode(t)) {
      e.preventDefault();
      insertDraft(agentId, `${i.selectionStart && !i.value.slice(0, i.selectionStart).endsWith('\n') ? '\n' : ''}\`\`\`${guessLang(t)}\n${t.replace(/\s+$/, '')}\n\`\`\`\n`);
    }
  }
  // The style chips above the composer (/tone, /persona, /lang): what rides along with your next message.
  function renderStyle(agentId) {
    const v = views.get(agentId);
    if (!v) return;
    const chat = chats.get(H.activeChat[agentId]);
    const next = v.styleNext;
    const active = !next && chat?.style;
    v.styleBox.hidden = !next && !active;
    if (!next && !active && !v.styleBox.firstChild) return; // (round 16) nothing shown, nothing to clear
    v.styleBox.replaceChildren(next || active ? el('span', { class: 'style-chip', title: next ? 'Sent once with your next message (then the agent keeps it in mind)' : 'This chat\'s style (already given to the agent)' },
      el('span', { text: `${next ? '✎ next message: ' : '🎭 '}${(next || active).slice(0, 80)}` }),
      el('button', { type: 'button', text: '×', title: next ? 'Don\'t send it' : 'Drop this style', on: { click: () => { if (next) { v.styleNext = ''; v.styleClear = false; } else setStyle(agentId, null); renderStyle(agentId); } } })) : null);
  }
  function setStyle(agentId, text) {
    const v = views.get(agentId);
    if (!v) return;
    const chat = chats.get(H.activeChat[agentId]);
    if (text) { v.styleNext = text; v.styleClear = false; } else if (chat?.style) {
      v.styleNext = 'Forget the style instructions I gave you earlier (tone, persona, language); answer normally.';
      v.styleClear = true;
    } else v.styleNext = '';
    renderStyle(agentId);
  }
  // Alt+letter shortcuts in the message box (also listed in /help next to their commands).
  const lastReplyIndex = (agentId) => chats.get(H.activeChat[agentId])?.messages.map((m) => m.role).lastIndexOf('assistant') ?? -1;
  const ALT_KEYS = {
    r: (agentId) => { if (!stopSpeaking()) { const i = lastReplyIndex(agentId); if (i >= 0) speakMessage(agentId, i); } },
    b: (agentId) => { const i = lastReplyIndex(agentId); if (i >= 0) toast(toggleMark(agentId, i, 'bookmark') ? '🔖 Bookmarked the last reply' : 'Bookmark removed', { timeout: 1200 }); },
    p: (agentId) => { const i = lastReplyIndex(agentId); if (i >= 0) toast(toggleMark(agentId, i, 'pinnedMsg') ? '📌 Pinned the last reply' : 'Unpinned', { timeout: 1200 }); },
    m: (agentId) => { const i = lastReplyIndex(agentId); const node = views.get(agentId)?.list.querySelector(`.msg[data-index="${i}"] .msg-more`); if (node) messageMenu(agentId, i, node); },
    Home: (agentId) => { const l = views.get(agentId)?.list; if (l) l.scrollTop = 0; },
    End: (agentId) => { const l = views.get(agentId)?.list; if (l) l.scrollTop = l.scrollHeight; },
  };
  // Opens or closes every thinking block in the chat (Alt+T).
  function toggleThinking(agentId, open) {
    const v = views.get(agentId);
    const all = [...(v?.list.querySelectorAll('details.thinking') || [])];
    if (!all.length) { toast('No thinking in this chat', { timeout: 1200 }); return 0; }
    const next = open ?? !all.some((d) => d.open);
    for (const d of all) d.open = next;
    return all.length;
  }

  // ---------- attachments ----------
  function renderChips(agentId) {
    const v = views.get(agentId);
    v.chips.replaceChildren(...v.attachments.map((a, i) => el('span', { class: `attach-chip ${a.kind}` },
      a.kind === 'image' && a.preview ? el('img', { src: a.preview, alt: '' }) : el('span', { text: a.kind === 'text' ? '📄' : '📎' }),
      el('span', { text: a.name }),
      (typeof AttachLean !== 'undefined' ? AttachLean.badge(agentId, a) : null), // (round 40, attachlean) what it costs: "≈ 1.5k of 14k tok", "sent at 1568 px"; click: send whole
      a.tokens ? el('span', { class: 'attach-tok', text: ` · ${fmt(a.tokens)} tok`, title: `≈ ${a.tokens} tokens go with your next message (exactly this text; chat-refs.js)` }) : null, // (round 24) an @ reference's cost
      el('button', { type: 'button', text: '×', title: 'Remove', on: { click: () => { v.attachments.splice(i, 1); renderChips(agentId); } } }))));
  }
  const isTextName = (name) => /\.(txt|md|markdown|js|mjs|ts|tsx|jsx|json|csv|tsv|html?|css|glsl|frag|vert|py|xml|ya?ml|ini|log|jsx|sh|bat|ps1|c|cpp|h|cs|java|rs|go|lua|toml|svg)$/i.test(name);
  async function addFiles(agentId, files) {
    const v = views.get(agentId);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const name = file.name || `pasted-${Date.now()}.png`;
        const path = await window.hub.saveAttachment(name, btoa(bin));
        v.attachments.push({ kind: 'image', name, path, preview: URL.createObjectURL(file) });
      } else if (isTextName(file.name) || file.type.startsWith('text/')) {
        const max = typeof AttachLean !== 'undefined' ? AttachLean.MAX_BYTES : TEXT_ATTACH_LIMIT; // (round 40) big texts are trimmed when sent
        if (file.size > max) { toast(`${file.name} is over ${Math.round(max / 1048576) || '0.2'} MB; attach a smaller excerpt.`, { type: 'error' }); continue; }
        v.attachments.push({ kind: 'text', name: file.name, content: await file.text(), src: window.hub.pathForFile?.(file) || undefined });
      } else {
        const path = window.hub.pathForFile(file);
        if (path) await addPath(agentId, path); else toast(`Can't attach ${file.name}`, { type: 'error' });
      }
    }
    renderChips(agentId);
  }
  // Media dropped in the Three Director's chat (videos, models, sounds…) are added to the open sketch's
  // references, with a note telling the director their names.
  async function labReference(agentId, path) {
    const agent = H.agent(agentId);
    if (!agent?.threeTools || typeof ThreeLab === 'undefined') return false;
    try {
      const r = await ThreeLab.addReference(path);
      const use = r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}`;
      views.get(agentId).attachments.push({ kind: 'text', name: `reference: ${r.key}`, content: `The user added "${r.name}" (${r.kind}) to this sketch's references as "${r.key}". In code: ${use}.` });
      return true;
    } catch (err) { toast(err.message, { type: 'error' }); return false; }
  }
  async function addPath(agentId, path) {
    const v = views.get(agentId);
    const name = path.split(/[\\/]/).pop();
    // (round 14) a folder dropped on a chat becomes one of the folders it may use (access.js)
    if (typeof Access !== 'undefined' && await Access.maybeFolder(agentId, path).catch(() => false)) return;
    if (H.agent(agentId)?.threeTools && typeof ThreeLab !== 'undefined' && ThreeLab.isReference(name) && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
      if (await labReference(agentId, path)) { renderChips(agentId); toast(`${name} added to the sketch's references`, { timeout: 2200 }); return; }
    }
    // (round 9) a video (a capture, a render) attaches its contact sheet: engines read pictures, not video files
    if (/\.(mp4|webm|mov|m4v|mkv)$/i.test(name) && !H.agent(agentId)?.workspace && typeof FrameRead !== 'undefined') {
      try {
        const busy = toast(`Reading ${name}…`, { timeout: 0 });
        try {
          const sheet = await FrameRead.sheet(path, { layout: '4x3' });
          const p = await window.hub.saveAttachment(`${name.replace(/\.\w+$/, '')} · contact sheet.jpg`, await window.hub.fs.read(sheet.path, { encoding: 'base64' }));
          v.attachments.push({ kind: 'image', name: `${name} · contact sheet`, path: p, preview: WinMac.fileUrl(p), video: path });
        } finally { busy.remove(); }
        renderChips(agentId); return;
      } catch (err) { toast(`Couldn't read ${name}: ${err.message}`, { type: 'error' }); return; }
    }
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
      // The Three Director can turn attached pictures into sketch references, from the attachments folder.
      if (H.agent(agentId)?.threeTools) { try { path = await window.hub.saveAttachment(name, await window.hub.fs.read(path, { encoding: 'base64' })); } catch { /* keep the original path */ } }
      v.attachments.push({ kind: 'image', name, path, preview: WinMac.fileUrl(path) }); // (round 31, winmac) # / % / a Mac's /Users path
    } else if (isTextName(name)) {
      try { v.attachments.push({ kind: 'text', name, src: path, content: await window.hub.fs.read(path, { maxBytes: typeof AttachLean !== 'undefined' ? AttachLean.MAX_BYTES : TEXT_ATTACH_LIMIT }) }); } catch (err) { toast(err.message, { type: 'error' }); }
    } else {
      const agent = H.agent(agentId);
      if (agent.workspace || (typeof Access !== 'undefined' && Access.isOn(agentId))) v.attachments.push({ kind: 'file', name, path }); // Claude reads it with Read, Astra with a sandboxed command
      else { toast(`${name} isn't a text file. Give this agent File access to let it open other file types.`, { type: 'error' }); return; }
    }
    renderChips(agentId);
  }

  // ---------- message list ----------
  async function onListClick(e, agentId) {
    const t = e.target;
    const copy = t.closest('.copy-code, .copy-msg');
    if (copy) {
      const text = copy.classList.contains('copy-code') ? copy.closest('pre').querySelector('code').textContent : copy.closest('.msg').dataset.raw;
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
      return;
    }
    const codeAction = t.closest('.code-act, .code-unfold');
    if (codeAction) {
      const pre = codeAction.closest('pre');
      const code = pre.querySelector('code').textContent;
      const lang = pre.dataset.lang || '';
      if (codeAction.dataset.act === 'unfold') { pre.classList.remove('code-folded'); codeAction.remove(); return; }
      if (codeAction.dataset.act === 'nodes') window.NodeView?.openCode?.(code, lang);
      if (codeAction.dataset.act === 'more') {
        const r = codeAction.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, [
          { label: 'Insert in my message', action: () => insertDraft(agentId, `\`\`\`${lang}\n${code}\n\`\`\`\n`) },
          { label: pre.classList.contains('code-wrap') ? 'Don\'t wrap lines' : 'Wrap long lines', action: () => pre.classList.toggle('code-wrap') },
          { label: 'Copy as a Markdown block', action: () => copyText(`\`\`\`${lang}\n${code}\n\`\`\``, 'Code copied') },
          { label: 'Save to notes', action: () => Notes.append(`\`\`\`${lang}\n${code}\n\`\`\``) },
          window.NodeView?.openCode ? { label: 'Open in the node view', action: () => window.NodeView.openCode(code, lang) } : null,
          typeof ThreeLab !== 'undefined' && /^(js|javascript|mjs)$/i.test(lang) ? { label: 'Open in Three.js Lab', action: () => ThreeLab.openCode(code) } : null,
        ].filter(Boolean));
        return;
      }
      if (codeAction.dataset.act === 'save') {
        const ext = { javascript: 'js', js: 'js', jsx: 'jsx', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', glsl: 'glsl', markdown: 'md', md: 'md', extendscript: 'jsx', bash: 'sh', powershell: 'ps1' }[lang.toLowerCase()] || 'txt';
        const saved = await window.hub.saveFile({ defaultPath: `snippet.${ext}`, content: code });
        if (saved) toast(`Saved ${saved.split(/[\\/]/).pop()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(saved) } });
      }
      if (codeAction.dataset.act === 'three') ThreeLab.openCode(code);
      if (codeAction.dataset.act === 'ae') (async () => { await window.Lazy?.load?.('adobe'); const r = await Adobe.run('aftereffects', code, { label: 'From chat' }); toast(r.ok ? 'Sent to After Effects (one undo in AE takes it back)' : r.error, { type: r.ok ? undefined : 'error', timeout: r.ok ? 3500 : 9000 }); })().catch((err) => toast(err.message, { type: 'error' }));
      if (codeAction.dataset.act === 'shader') ThreeLab.openShader(code);
      return;
    }
    const sug = t.closest('[data-suggest]');
    if (sug) {
      // A suggestion that starts with "/" is a chat command the agent offers (it runs here, nothing is sent).
      const s = sug.dataset.suggest;
      if (s.startsWith('/') && Commands.parse(s)) Commands.exec(s, agentId);
      else send(agentId, s).catch((err) => toast(err.message, { type: 'error' }));
      return;
    }
    // In hub notes (command output), `/command` snippets run when clicked.
    const cmdCode = t.closest('.msg.note code');
    if (cmdCode && /^\/[\w-]+/.test(cmdCode.textContent) && Commands.parse(cmdCode.textContent.replace(/\s*\[.*$/, '').trim())) {
      const text = cmdCode.textContent.trim();
      if (/[<[]/.test(text)) setDraft(agentId, `${text.split(/\s[<[]/)[0]} `); else Commands.exec(text, agentId);
      return;
    }
    const act = t.closest('[data-msg-act]');
    if (act) {
      const idx = Number(act.closest('.msg').dataset.index);
      const what = act.dataset.msgAct;
      if (what === 'menu') { messageMenu(agentId, idx, act); return; }
      if (what === 'continue') { send(agentId, 'Continue exactly where you stopped.').catch((err) => toast(err.message, { type: 'error' })); return; }
      if (what === 'copy-error') { copyText(act.closest('.msg').dataset.raw, 'Error copied'); return; }
      if (what === 'engines') { Commands.exec('/engines', agentId); return; }
      if (what === 'fold') { const node = act.closest('.msg'); unfolded.delete(`${H.activeChat[agentId]}:${idx}`); node.classList.add('collapsed'); act.remove(); node.append(el('button', { class: 'show-more-msg msg-act', text: 'Show full reply', dataset: { msgAct: 'more' } })); node.scrollIntoView({ block: 'nearest' }); return; }
      if (what === 'branch') branchFrom(agentId, idx);
      if (what === 'speak') speak(act.closest('.msg').dataset.raw, act);
      if (what === 'savemd') { const m = chats.get(H.activeChat[agentId])?.messages[idx]; if (m) saveReply(m); }
      if (what === 'review') send(agentId, REVIEW_PROMPT).catch((err) => toast(err.message, { type: 'error' }));
      if (what === 'opinion') secondOpinion(agentId);
      if (what === 'apply-opinion') {
        const m = chats.get(H.activeChat[agentId])?.messages[idx];
        if (m) send(agentId, `Here is ${m.from}'s second opinion on your last result:\n\n${m.text}\n\nWhat do you take from it? Apply the parts that make it better and tell me what you changed (and what you disagree with).`).catch((err) => toast(err.message, { type: 'error' }));
      }
      if (what === 'edit') editMessage(agentId, idx);
      if (what === 'retry') regenerate(agentId, idx);
      if (what === 'quote') quote(agentId, idx);
      if (what === 'more') {
        const node = act.closest('.msg');
        node.classList.remove('collapsed'); act.remove(); unfolded.add(`${H.activeChat[agentId]}:${idx}`);
        // a way back: fold it again from its end
        node.querySelector('.msg-foot')?.append(el('button', { class: 'msg-act', text: 'Fold', title: 'Fold this reply again', dataset: { msgAct: 'fold' } }));
      }
      return;
    }
    const img = t.closest('img.md-img');
    if (img) { window.hub.openExternal(img.src); return; }
    const undo = t.closest('.undo-memory');
    if (undo) {
      await forgetFacts(undo.dataset.agent, JSON.parse(undo.dataset.facts));
      undo.parentElement.replaceWith(el('div', { class: 'memory-chip', text: 'Removed from memory' }));
      return;
    }
    const login = t.closest('.login-btn');
    if (login) {
      await window.hub.login(login.dataset.engine);
      login.replaceWith(el('span', { class: 'hint', text: 'Finish signing in in the window that opened, then press Retry.' }));
    }
  }

  // "↑ Show earlier" reached by scrolling up loads the rest. (round 20, soak) one observer per view, let go at the next
  // draw: each one used to stay alive (and with it the render's closure: every message node of that draw) until
  // scrolled into view, so switching between long chats kept their old nodes forever (≈ 110 per switch)
  function watchEarlier(v, agentId, more) {
    v.earlierT = setTimeout(() => {
      if (!more.isConnected) return;
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); if (v.earlierIO === io) v.earlierIO = null; showEarlier(agentId, EARLIER); } }, { root: v.list });
      io.observe(more); v.earlierIO = io;
    }, 600);
  }
  async function loadChat(id) {
    chatUsed.set(id, Date.now());
    if (!chats.has(id)) {
      const chat = await window.hub.getChat(id);
      if (!chat) return null;
      if (chats.has(id)) return chats.get(id); // (loaded meanwhile by another caller: keep that one)
      chats.set(id, chat);
      trimChats();
    } else if (chats.size > CHAT_KEEP) { const c = chats.get(id); chats.delete(id); chats.set(id, c); } // most recent last
    return chats.get(id);
  }
  // (round 20, soak) a long session opens many chats: only the last CHAT_KEEP stay in memory (whole histories can be
  // big), never one on screen in an agent, streaming, or used in the last minute; the others load again from disk
  const CHAT_KEEP = 12;
  const chatUsed = new Map();
  function trimChats() {
    if (chats.size <= CHAT_KEEP) return;
    const keep = new Set(Object.values(H.activeChat || {}));
    const now = Date.now();
    for (const id of chats.keys()) {
      if (chats.size <= CHAT_KEEP) break;
      if (keep.has(id) || pending.has(id) || now - (chatUsed.get(id) || 0) < 60000) continue;
      chats.delete(id); chatUsed.delete(id);
    }
  }

  // Adds Save / Run buttons to code blocks depending on their language and content. Long blocks start
  // folded (click "Show all N lines"); the language and line count sit in a small label.
  const CODE_FOLD_LINES = 28;
  function decorateCode(body) {
    for (const pre of body.querySelectorAll('pre')) {
      const code = pre.querySelector('code').textContent;
      const lang = (pre.dataset.lang || '').toLowerCase();
      const lines = code.split('\n').length;
      const bar = el('span', { class: 'code-acts' }, el('button', { class: 'code-act', text: 'Save', title: 'Save as a file', dataset: { act: 'save' } }));
      if (/^(js|javascript|mjs)$/.test(lang) && /three|THREE\./.test(code)) bar.append(el('button', { class: 'code-act', text: 'Open in Three.js Lab', dataset: { act: 'three' } }));
      if (/^(glsl|frag|shader)$/.test(lang) || (/gl_FragColor|fragColor|void main\s*\(/.test(code) && !/import /.test(code))) bar.append(el('button', { class: 'code-act', text: 'Shader playground', dataset: { act: 'shader' } }));
      if (/^(jsx|extendscript)$/.test(lang) || /app\.project|CompItem|app\.beginUndoGroup/.test(code)) bar.append(el('button', { class: 'code-act', text: 'Run in After Effects', dataset: { act: 'ae' } }));
      if (window.NodeView?.openCode) bar.append(el('button', { class: 'code-act', text: 'Nodes', title: 'Open in the node view', dataset: { act: 'nodes' } }));
      bar.append(el('button', { class: 'code-act', text: '⋯', title: 'More: insert in your message, wrap lines, copy as a quote', dataset: { act: 'more' } }));
      pre.append(bar);
      pre.prepend(el('span', { class: 'code-label', text: `${lang || 'text'} · ${lines} line${lines === 1 ? '' : 's'}` }));
      if (lines > CODE_FOLD_LINES && !pre.closest('.streaming')) {
        pre.classList.add('code-folded');
        pre.append(el('button', { class: 'code-unfold', text: `Show all ${lines} lines`, dataset: { act: 'unfold' } }));
      }
    }
  }

  function messageEl(m, agent, index, isLast, live = null) {
    // Claude × Astra collaborations (duo, relay, debate…) draw their own card (astra.js)
    if (m.role === 'collab' && typeof Astra !== 'undefined') return Astra.collabEl(m, agent, index, isLast);
    if (m.role === 'jam' && typeof Jam !== 'undefined') return Jam.cardEl(m, agent, index); // jam.js
    if (m.role === 'intro') return el('div', { class: 'msg note', dataset: { index }, text: `🎬 Video project${m.name ? ` “${m.name}”` : ''} (video projects left with Video Review in round 17; the Lab sequence makes videos now)` });
    if (m.role === 'comp' && typeof CompDispatch !== 'undefined') return CompDispatch.cardEl(m, agent, index); // comp-dispatch.js (parts in other chats)
    // (round 35, streamrender) `live`: the reply that just finished streaming becomes this message in place: its node
    // and its text (already exactly a full render's, see paintBody) stay where they are, only what's around the text
    // is built again. Drawn as a new node, a long reply was styled and laid out from scratch when it ended (≈ 0.45 s
    // for 60K characters here: the end of every long reply was a visible hitch).
    let node; let body;
    if (live) {
      node = live.el; body = node.querySelector(':scope > .body');
      paintBody(live.p, body, m.text);
      for (const c of [...node.childNodes]) if (c !== body) c.remove();
      for (const a of [...node.attributes]) if (a.name !== 'class') node.removeAttribute(a.name);
      // (the class only loses "streaming": only what depends on it is styled again)
      node.className = `msg ${m.role}`; node.dataset.raw = m.text; node.dataset.index = index; node.title = m.at ? fmtDate(m.at) : '';
      decorateCode(body); sizeImages(body);
    } else {
      node = el('div', { class: `msg ${m.role}`, dataset: { raw: m.text, index }, title: m.at ? fmtDate(m.at) : '' });
      body = el('div', { class: 'body' });
      if (m.role === 'assistant' || m.role === 'opinion') { body.innerHTML = renderMarkdown(m.text); decorateCode(body); sizeImages(body); } else body.textContent = m.text;
    }
    const above = live ? (...xs) => body.before(...xs) : (...xs) => node.append(...xs); // (the text never moves)
    if (m.role === 'opinion') above(el('div', { class: 'opinion-head', text: `🔎 Second opinion from ${m.from}${m.cost ? ` · ${fmt(m.cost.input)} in · ${fmt(m.cost.output)} out` : ''}` }));
    if (m.thinking) above(thinkingEl(m.thinking, false, m.thinkMs));
    for (const qa of m.qa || []) above(el('div', { class: 'qa-done' }, el('span', { class: 'qa-q', text: `❓ ${qa.q}` }), el('span', { class: 'qa-a', text: `→ ${qa.a}` })));
    for (const op of m.opinions || []) above(opinionCard(op));
    if (m.progress) above(progressCard(m.progress));
    for (const sh of m.shows || []) above(showCard(sh));
    if (!live) node.append(body);
    if (m.role === 'opinion') node.append(el('div', { class: 'msg-foot' }, el('button', { class: 'msg-act primary-act', text: `Ask ${agent.name} to use it`, dataset: { msgAct: 'apply-opinion' } })));
    if (m.suggest?.length && (isLast || m.lastReply)) node.append(el('div', { class: 'suggest-chips' }, m.suggest.map((s) => (s.startsWith('/')
      ? el('button', { class: 'suggest-chip cmd', text: s, dataset: { suggest: s }, title: 'Run this chat command (nothing is sent)' })
      : el('button', { class: 'suggest-chip', text: s, dataset: { suggest: s }, title: 'Send this' })))));
    if (m.attachments?.length) node.append(el('div', { class: 'msg-attachments' }, m.attachments.map((a) => el('span', { class: 'attach-chip small', text: `${a.kind === 'image' ? '🖼' : '📄'} ${a.name}`, ...(a.lean ? { title: a.lean.same ? `Not sent again: the same as at ${a.lean.same}` : a.lean.diff ? `Only the changes since ${a.lean.diff} were sent (≈ ${a.lean.tokens} tokens)` : `Sent ≈ ${a.lean.tokens} tokens${a.lean.wholeTokens > a.lean.tokens ? ` of ≈ ${a.lean.wholeTokens}` : ''}${a.lean.px ? ` (at ${a.lean.px} px)` : ''}` } : {}) }))));
    if (m.role === 'error' && m.needsLogin) {
      node.append(el('button', { class: 'primary login-btn', text: `Sign in to ${ENGINE_LABEL[agent.engine] || agent.engine}`, dataset: { engine: agent.engine } }));
    }
    // (round 9) one quiet line ("⚙ 4 steps · three, capture"); click it for the list
    if (m.tools?.length) node.prepend(toolFold(m.tools));
    if (m.remembered?.length) {
      node.append(el('div', { class: 'memory-chip' }, `Saved to memory: ${m.remembered.join(' · ')} `,
        el('button', { class: 'undo-memory', text: 'Undo', dataset: { agent: agent.id, facts: JSON.stringify(m.remembered) } })));
    }
    const time = m.at ? fmtLocal(m.at, { hour: '2-digit', minute: '2-digit' }, 'time') : ''; // (round 20) one cached formatter
    const act = (name, label, title) => el('button', { class: 'msg-act', text: label, title, dataset: { msgAct: name } });
    // Marks you put on a message (/pin-msg, /bookmark, /react): small badges in its corner.
    const marks = [m.pinnedMsg ? '📌' : null, m.bookmark ? '🔖' : null, m.reaction ? m.reaction.emoji : null].filter(Boolean);
    if (marks.length) { node.classList.add('marked'); node.append(el('span', { class: 'msg-marks', text: marks.join(' '), title: m.reaction?.note ? `Your note: ${m.reaction.note}` : 'Your marks on this message (/unmark to clear)' })); }
    if (m.pinnedMsg) node.classList.add('pinned-msg');
    const timeEl = el('span', { class: 'msg-time', text: time, title: m.at ? `${fmtDate(m.at)} · ${timeAgo(m.at)} · message #${index + 1}` : '' });
    const num = el('span', { class: 'msg-num', text: `#${index + 1}` });
    // Rarely used actions live in the ⋯ menu; Copy and Read aloud stay one click away.
    const more = el('button', { class: 'msg-act msg-more', text: '⋯', title: 'More: quote, branch, retry, pin, bookmark, react, save…', dataset: { msgAct: 'menu' } });
    if (m.role === 'assistant') {
      const u = m.usage;
      node.append(el('div', { class: 'msg-foot' },
        u && typeof Meter !== 'undefined' ? Meter.badge(m) : u ? el('span', { class: 'tok-badge', text: `${fmt(u.input)} in · ${fmt(u.output)} out${m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}`, title: `${u.input.toLocaleString()} tokens sent (context) · ${u.output.toLocaleString()} written${m.ms && u.output ? ` · ~${Math.round(u.output / (m.ms / 1000))} tokens/s` : ''}${m.model ? ` · ${m.model}` : ''}` }) : null,
        m.stopped ? el('span', { text: 'stopped' }) : null,
        timeEl, num,
        // Copy + ⋯ only (read aloud, retry… are in ⋯); a stopped reply keeps its one obvious next step
        el('button', { class: 'copy-msg', text: 'Copy', title: 'Copy this reply' }),
        // (round 40, chatcalm) a stopped reply's one next step shows without pointing at it
        isLast && m.stopped ? el('button', { class: 'msg-act primary-act', text: 'Continue', title: 'Ask it to continue where it stopped (Retry is in ⋯)', dataset: { msgAct: 'continue' } }) : null,
        more));
    } else if (m.role === 'user') {
      node.append(el('div', { class: 'msg-foot user-foot' }, num, m.edited ? el('span', { class: 'edited-mark', text: 'edited', title: m.edits?.length ? `Before: ${m.edits.at(-1).slice(0, 300)}` : '' }) : null, timeEl,
        el('button', { class: 'copy-msg', text: 'Copy', title: 'Copy this message' }), more));
    } else if (m.role === 'error' && isLast) {
      node.append(el('div', { class: 'msg-foot' }, act('retry', 'Retry', 'Send the last message again'),
        act('copy-error', 'Copy error', 'Copy the error text'), act('engines', 'Check engines', 'Whether Claude Code / Codex were found (/engines)')));
    }
    for (const fn of hooks.message) { try { fn(node, m, index, agent); } catch (err) { console.warn(err); } }
    calmFoot(node);
    return node;
  }
  // (round 40, chatcalm) one order under every message, whatever added to it: what it is (tokens, Smart's pick, time)
  // → its one next step (Continue, ↶ Undo what it did) → Copy → ⋯. A failed reply keeps Retry in sight; copy the
  // error, check the programs and Report wait in its ⋯.
  function calmFoot(node) {
    const foot = node.querySelector(':scope > .msg-foot');
    if (!foot || foot.classList.contains('net-acts')) return; // offline.js draws its own (Retry / Cancel / Sign in)
    const copy = foot.querySelector(':scope > .copy-msg');
    const more = foot.querySelector(':scope > .msg-more');
    const at = copy || more;
    if (at) for (const b of foot.querySelectorAll(':scope > .primary-act, :scope > .au-reply')) if (b.nextElementSibling !== at) at.before(b);
    if (!node.classList.contains('error') || !foot.querySelector(':scope > [data-msg-act="copy-error"]') || foot.querySelector(':scope > .err-more')) return;
    const rest = [...foot.querySelectorAll(':scope > .msg-act:not([data-msg-act="retry"])')];
    for (const b of rest) b.classList.add('calm-tucked');
    foot.append(el('button', { type: 'button', class: 'msg-act msg-more err-more', text: '⋯', title: 'More: copy the error, check the AI programs, report it',
      on: { click: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, rest.filter((b) => b.isConnected).map((b) => ({ label: b.textContent, action: () => b.click() }))); } } }));
  }
  // The tool calls of a reply, folded: "⚙ 3 steps · three · capture", open for the list (repeats counted)
  function toolFold(tools) {
    const labels = tools.map(toolLabel);
    const counts = new Map(); for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
    const where = [...new Set(tools.map((t) => (String(t).match(/^mcp__(?:claude_ai_)?([^_]+(?:_[^_]+)?)__/) || String(t).match(/^(\w+?)_/) || String(t).match(/^([\w ]+?) ·/) || [])[1]).filter(Boolean).map((x) => x.replace(/^hearth[-_]?/, '').replace(/_/g, ' ')))].slice(0, 3);
    const d = el('details', { class: 'tool-chips tool-fold' },
      el('summary', { text: `⚙ ${tools.length === 1 ? labels[0] : `${tools.length} steps`}${tools.length > 1 && where.length ? ` · ${where.join(' · ')}` : ''}`, title: [...counts].map(([l, n]) => `${l}${n > 1 ? ` ×${n}` : ''}`).join('\n') }));
    // (round 16) the list is built the first time it opens (most folds are never opened: no nodes for them);
    // one 'toggle' listener on the message list does it for every fold (fillFold)
    d.steps = counts;
    return d;
  }

  function fillFold(e) {
    const d = e.target;
    if (!d.open || !d.steps || d.querySelector(':scope > .tool-list')) return;
    d.append(el('ol', { class: 'tool-list' }, [...d.steps].map(([l, n]) => el('li', { text: `${l}${n > 1 ? `  ×${n}` : ''}` }))));
  }

  // The ⋯ menu of a message: the usual actions first, the rest behind More… (each item has a chat command too).
  function messageMenu(agentId, index, anchor) {
    const chat = chats.get(H.activeChat[agentId]);
    const m = chat?.messages[index];
    if (!m) return;
    const agent = H.agent(agentId);
    const last = index === chat.messages.length - 1;
    const astra = astraAgent();
    const r = anchor.getBoundingClientRect();
    // (round 7) five open entries that branch into the detail: Copy and Read aloud stay one click away, the rest
    // sit in Reply ›, Mark › and Save › (right-click a message for the same menu at the pointer)
    // (round 40, chatcalm) opened from its ⋯, Copy is the button right beside it: the menu doesn't say it twice
    const besideCopy = anchor?.classList?.contains('msg-more') && anchor.parentElement?.querySelector(':scope > .copy-msg');
    const items = [
      besideCopy ? null : { label: 'Copy', action: () => copyText(m.text, 'Copied') },
      m.role === 'assistant' ? { label: 'Read aloud', key: last ? 'Alt+R' : '', action: () => speak(m.text) } : null,
      { label: 'Reply', items: () => [
        { label: 'Quote in my message', action: () => quote(agentId, index) },
        m.role === 'user' ? { label: 'Edit and resend', key: '↑', action: () => editMessage(agentId, index) } : null,
        { label: 'Branch: new chat from here', action: () => branchFrom(agentId, index) },
        m.role === 'assistant' && last ? { label: 'Retry: write it again', action: () => regenerate(agentId) } : null,
        m.role === 'assistant' && last ? { label: 'Retry with another model', items: () => (MODEL_CHOICES[agent.engine] || []).filter((x) => x !== (chat.model || agent.model)).map((x) => ({ label: x, action: async () => { await setChatModel(agentId, x); regenerate(agentId); } })) } : null,
        m.role === 'assistant' && last && agent.engine === 'claude' ? { label: '🔍 Review: check its own result', action: () => send(agentId, REVIEW_PROMPT).catch((err) => toast(err.message, { type: 'error' })) } : null,
        m.role === 'assistant' && last && astra && astra.id !== agentId ? { label: `👁 Second opinion from ${astra.name}`, key: 'Ctrl+Alt+O', action: () => secondOpinion(agentId) } : null,
        ...hooks.msgMenu.flatMap((fn) => { try { return fn(agentId, index, m, chat) || []; } catch (err) { console.warn(err); return []; } }),
      ] },
      // (round 9) what this reply made (chat-things.js): open any of them
      m.things?.length && typeof ChatThings !== 'undefined' ? { label: 'Made here', hint: String(m.things.length), items: () => m.things.filter((t) => !t.gone).map((t) => ({ label: `${ChatThings.GLYPH[t.k] || '◇'} ${String(t.name || ChatThings.KIND[t.k]).slice(0, 36)}`, action: () => ChatThings.openThing(t, { agentId, index }) })) } : null,
      { label: 'Mark', items: () => [
        { label: '📌 Pin message', checked: Boolean(m.pinnedMsg), action: () => toggleMark(agentId, index, 'pinnedMsg') },
        { label: '🔖 Bookmark', checked: Boolean(m.bookmark), action: () => toggleMark(agentId, index, 'bookmark') },
        { label: `React${m.reaction ? ` (${m.reaction.emoji})` : ''}`, items: () => [
          ...REACTIONS.map((emoji) => ({ label: `${emoji}  ${{ '👍': 'Good', '👎': 'Not good', '❤️': 'Love it', '🔥': 'Great', '🤔': 'Hmm' }[emoji]}`, checked: emoji === m.reaction?.emoji, action: () => react(agentId, index, emoji) })),
          m.reaction ? { label: 'Remove the reaction', action: () => react(agentId, index, m.reaction.emoji) } : null,
        ] },
        m.reaction ? { label: 'Add a feedback note…', action: async () => { const note = await Modal.prompt('Feedback note', { value: m.reaction.note || '', label: 'Kept with your reaction (not sent to the agent).' }); if (note != null) { m.reaction.note = note.trim(); remember(chat); render(agentId, { keepScroll: true }); } } } : null,
      ] },
      { label: 'Copy & save', items: () => [
        { label: 'Copy as plain text', action: () => copyText(plainText(m.text), 'Copied as plain text') },
        m.thinking ? { label: 'Copy its thinking', action: () => copyText(m.thinking, 'Thinking copied') } : null,
        { label: `Copy “/jump ${index + 1}”`, hint: 'to come back here', action: () => copyText(`/jump ${index + 1}`, 'Paste it in this chat to come back to this message') },
        '-',
        m.role === 'assistant' ? { label: 'Save as a Markdown file…', action: () => saveReply(m) } : null,
        { label: 'Save to notes', action: () => Notes.append(m.text) },
        m.role !== 'user' ? { label: 'Show the Markdown source', action: () => toggleRaw(agentId, index) } : null,
      ] },
      ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chat') : []), // round 7: pin / tuck what's under messages
    ].filter(Boolean);
    showMenu(r.left, r.bottom + 4, items);
  }
  // Shows a reply's Markdown source in place (again: back to the formatted view).
  function toggleRaw(agentId, index) {
    const node = views.get(agentId)?.list.querySelector(`.msg[data-index="${index}"]`);
    const m = chats.get(H.activeChat[agentId])?.messages[index];
    if (!node || !m) return false;
    const body = node.querySelector(':scope > .body');
    if (body.classList.toggle('raw')) body.textContent = m.text;
    else { body.innerHTML = renderMarkdown(m.text); decorateCode(body); sizeImages(body); }
    return body.classList.contains('raw');
  }
  const plainText = (t) => String(t || '').replace(/```[\w+-]*\n?/g, '').replace(/\*\*|__|~~|==|`/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const REACTIONS = ['👍', '👎', '❤️', '🔥', '🤔'];
  function react(agentId, index, emoji, note) {
    const chat = chats.get(H.activeChat[agentId]);
    const m = chat?.messages[index];
    if (!m) return false;
    if (m.reaction?.emoji === emoji && note == null) delete m.reaction;
    else m.reaction = { emoji, at: Date.now(), ...(note ? { note } : m.reaction?.note ? { note: m.reaction.note } : {}) };
    remember(chat);
    render(agentId, { keepScroll: true });
    return true;
  }
  function toggleMark(agentId, index, key, value) {
    const chat = chats.get(H.activeChat[agentId]);
    const m = chat?.messages[index];
    if (!m) return null;
    const next = value ?? !m[key];
    if (next) m[key] = true; else delete m[key];
    remember(chat);
    render(agentId, { keepScroll: true });
    for (const fn of hooks.mark) { try { fn(chat, index, key, next); } catch (err) { console.warn(err); } }
    return next;
  }
  async function saveReply(m) {
    const p = await window.hub.saveFile({ defaultPath: `${(m.text.split('\n').find((l) => l.trim()) || 'reply').replace(/[#*`>\\/:*?"<>|]/g, '').trim().slice(0, 50) || 'reply'}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: m.text });
    if (p) toast('Reply saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
  }

  function emptyState(agent) {
    const engineOk = H.engineStatus[agent.engine] !== false;
    const hint = el('p', { class: 'hint', text: engineOk
      ? 'Ask anything. ＋ attaches files (or drop / paste them), ◎ turns your next message into a mission (a second opinion, side by side, a jam…), ⋯ at the top sets up the AI.'
      : `Couldn't find the ${agent.engine === 'claude' ? 'Claude' : 'Codex'} app on this computer, so this chat can't run yet.` });
    // (round 40, chatcalm) one line in an empty chat: a lone link (✦ What can I do here?) joins the hint instead of a
    // line of its own; Astra's status lines, when it shows them, stay lines
    let extra = typeof Astra !== 'undefined' ? Astra.emptyHints(agent) : null;
    const links = extra && !extra.querySelector('.astra-onboard') ? [...extra.querySelectorAll('a')] : [];
    if (engineOk && links.length === 1 && extra.textContent.trim() === links[0].textContent.trim()) { hint.append(' ', links[0]); extra = null; }
    return el('div', { class: 'empty' },
      el('div', { class: 'empty-icon', attrs: { style: `--agent: ${agent.color || 'var(--accent)'}` } }, Icons.for(agent) || document.createTextNode(agent.icon || agent.name[0])),
      el('h3', { text: `New chat with ${agent.name}` }),
      hint,
      // (round 18, tidy) first run without the engine: one action, straight to the setting that fixes it
      engineOk ? null : el('button', { type: 'button', class: 'primary', text: 'Show me where to set it', on: { click: () => AppUI.openSettings('program') } }),
      extra);
  }

  function fillModelSelect(v, agent, chat) {
    const current = chat?.model || '';
    const choices = [...new Set([agent.model, ...(MODEL_CHOICES[agent.engine] || []), current].filter(Boolean))];
    v.modelSel.replaceChildren(el('option', { value: '', text: `Model: ${agent.model || 'default'}` }),
      ...choices.filter((c) => c !== agent.model).map((c) => el('option', { value: c, text: c, selected: c === current })));
  }

  // ---------- (round 16, chatperf) message nodes kept between redraws ----------
  // A message's node is reused while the message is the same object with the same text and fields (its marks, things,
  // usage…), at the same place (index, last or not). Native.refresh() from other files rebuilds everything (gen), since
  // they call it after changing something a message draws from (a setting, the board, an engine fix).
  const NODE_CHATS = 3; // chats whose nodes stay ready for switching back
  const measured = new WeakSet(); // replies already measured for auto-fold
  let gen = 0;
  const SIG_SKIP = new Set(['text', 'thinking', 'sent', 'edits', 'images', 'lastReply']);
  function msgSig(m, index, isLast) {
    let rest;
    try { rest = JSON.stringify(m, function skip(k, val) { return this === m && SIG_SKIP.has(k) ? undefined : val; }); } catch { return null; }
    return `${gen}|${index}|${isLast ? 1 : 0}|${m.lastReply ? 1 : 0}|${m.thinking?.length || 0}|${m.edits?.length || 0}|${m.images?.length || 0}|${rest}`;
  }
  const handoff = new WeakMap(); // (round 35) a finished reply → its live node { el, p } (onEvent)
  const REUSABLE = new Set(['user', 'assistant', 'opinion']); // cards of collaborations / jams / dispatches draw live state: always fresh
  function nodeFor(cache, next, m, agent, index, isLast) {
    if (!REUSABLE.has(m.role)) return messageEl(m, agent, index, isLast);
    const sig = msgSig(m, index, isLast);
    const hit = cache.get(m);
    // (round 35) the reply that just finished: its live node becomes the message (messageEl, `live`)
    const h = handoff.get(m); if (h) handoff.delete(m);
    const live = h && m.role === 'assistant' && h.el.isConnected && h.el.classList.contains('streaming') && h.el.querySelector(':scope > .body') ? h : null;
    const node = sig && hit && hit.sig === sig && hit.text === m.text ? hit.node : messageEl(m, agent, index, isLast, live);
    if (sig) next.set(m, { node, sig, text: m.text });
    return node;
  }
  // Makes list's children exactly `nodes`, moving only what is out of place (nodes already there stay untouched).
  function placeChildren(list, nodes) {
    // what goes away goes first, so the nodes that stay are already in order and the new ones slot in between
    const keep = new Set(nodes);
    for (const c of [...list.childNodes]) if (!keep.has(c)) c.remove();
    let cur = list.firstChild;
    for (const n of nodes) {
      if (n === cur) { cur = cur.nextSibling; continue; }
      list.insertBefore(n, cur);
    }
    while (cur) { const nx = cur.nextSibling; cur.remove(); cur = nx; }
  }

  // Auto-fold of long replies: heights read first, then the folds written (one layout for the batch)
  const FOLD_NOW = 6;
  function foldIfLong(nodes, heights) {
    nodes.forEach((node, i) => {
      if (heights[i] <= COLLAPSE_PX || node.classList.contains('collapsed') || node.querySelector('.show-more-msg')) return;
      node.classList.add('collapsed');
      const words = (node.dataset.raw.match(/\S+/g) || []).length;
      node.append(el('button', { class: 'show-more-msg msg-act', text: `Show full reply · ${words.toLocaleString()} words`, dataset: { msgAct: 'more' } }));
    });
  }
  function foldWhenNear(v, node) {
    v.foldWatch ||= new Set();
    v.foldIO ||= new IntersectionObserver((entries) => {
      const near = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      for (const n of near) { v.foldIO.unobserve(n); v.foldWatch.delete(n); }
      const chatId = H.activeChat[[...views].find(([, x]) => x === v)?.[0]];
      const todo = near.filter((n) => n.isConnected && !unfolded.has(`${chatId}:${n.dataset.index}`));
      foldIfLong(todo, todo.map((n) => n.querySelector('.body').scrollHeight));
    }, { root: v.list, rootMargin: '1200px 0px' });
    v.foldWatch.add(node);
    v.foldIO.observe(node);
  }

  // (round 20, offmain) the replies about to be drawn whose Markdown isn't ready are rendered on the Markdown worker
  // first (md.js Md.warm), so this thread only inserts them: worth it from ~24k characters (a few ms here); a short
  // chat, or one already drawn, renders at once as before. The earlier messages of a long chat (behind ↑ Show earlier)
  // are warmed at the next idle moment, so showing them only builds their nodes.
  const WARM_CHARS = 24000;
  async function warmReplies(v, chat) {
    const from = shownFrom(chat, unreadFrom.get(chat.id));
    const kept = v.nodes?.get(chat.id);
    const texts = [];
    for (let i = from; i < chat.messages.length; i++) { const m = chat.messages[i]; if ((m.role === 'assistant' || m.role === 'opinion') && kept?.get(m)?.text !== m.text) texts.push(m.text); }
    if (Md.uncached(texts) >= WARM_CHARS) await Md.warm(texts, 400);
    if (from > 0) {
      const earlier = chat.messages.slice(0, from).filter((m) => m.role === 'assistant' || m.role === 'opinion').map((m) => m.text);
      if (Md.uncached(earlier)) (window.requestIdleCallback || setTimeout)(() => Md.warm(earlier, 0), { timeout: 1500 });
    }
  }
  async function render(agentId, { keepScroll = false, rebuild = false } = {}) {
    const v = views.get(agentId);
    const agent = H.agent(agentId);
    if (!v || !agent) return;
    v.drawing = (v.drawing || 0) + 1; // (round 35) draws under way (a jump waits for them: jumpTo)
    const seq = v.drawSeq = (v.drawSeq || 0) + 1; // (round 35) a newer draw of this view makes this one stop
    const stale = () => { if (v.drawSeq === seq) return false; v.drawing = Math.max(0, v.drawing - 1); return true; };
    const chatId = H.activeChat[agentId];
    const chat = chatId ? await loadChat(chatId) : null;
    if (chatId && !chat) H.activeChat[agentId] = null;
    if (chat && window.Md) await warmReplies(v, chat);
    if (stale()) return;
    const wasNearBottom = nearBottom(v.list);
    const prevScroll = v.list.scrollTop;
    // (round 35) reading higher up: what's at the top of the chat stays there (a reply finishing below, or changing
    // height above, used to move the chat under you: only the scroll offset was kept)
    const anchor = keepScroll && !(wasNearBottom && v.follow !== false) ? topAnchor(v.list) : null;

    // (round 16) the header is written only where it changed (a redraw of the same chat left it as it was)
    const put = (node, key, value) => { if (node[key] !== value) node[key] = value; };
    put(v.title, 'textContent', `${chat?.pinned ? '📌 ' : ''}${chat?.title || 'New chat'}`);
    put(v.title, 'title', chat ? `${chat.title}\n${chat.messages.length} messages · started ${fmtDate(chat.createdAt || chat.updatedAt)}\nDouble-click to rename` : 'Double-click to rename');
    const total = (chat?.messages || []).reduce((sum, m) => sum + (m.usage ? m.usage.input + m.usage.output : 0), 0);
    const folder = agent.workspace ? `edits ${agent.workspace.split(/[\\/]/).filter(Boolean).pop() || agent.workspace}` : null;
    const metaText = [folder, total ? `${fmt(total)} tokens this chat` : null].filter(Boolean).join(' · ');
    if (v.metaText !== metaText) { v.metaText = metaText; const badge = v.meta.querySelector('.access-badge'); v.meta.textContent = metaText; if (badge) v.meta.append(badge); }
    put(v.meta, 'title', agent.workspace ? `Can read and edit files in ${agent.workspace}` : '');
    paintContext(v, chat);
    put(v.input, 'placeholder', v.root.classList.contains('dock-chat') ? `Message ${agent.name}…`
      : `Message ${agent.name}…${store.get('chat.enterSends', true) === false ? '  (Ctrl+Enter sends)' : ''}`);
    const modelKey = `${agent.model}|${agent.engine}|${chat?.model || ''}`;
    if (v.modelKey !== modelKey) { v.modelKey = modelKey; fillModelSelect(v, agent, chat); }
    renderStyle(agentId);
    if (!v.input.value) { v.input.value = store.get(draftKey(agentId), '') || ''; autosize(v.input); updateCounter(v); }

    // (round 16, chatperf) the list is gathered as nodes, then put in place with the fewest moves (placeChildren):
    // messages that didn't change keep their DOM (nodeFor), so a reply ending in a 300-message chat adds one message
    // instead of rebuilding them all, and switching back to a chat reuses what it showed
    const out = [];
    const cache = (!rebuild && v.nodes?.get(chatId)) || new Map(); const nextCache = new Map();
    if (!chat) out.push(emptyState(agent));
    else {
      if (chat.imported || chat.continuedFrom) {
        out.push(el('div', { class: 'import-banner', text: chat.continuedFrom
          ? `Continued from a ${chat.continuedFrom} chat. ${chat.session?.id ? '' : 'Your next message sends the earlier conversation along as context.'}`
          : chat.session?.id ? `Imported from ${chat.imported}, continued here.` : `Imported from ${chat.imported}. Send a message to continue it here; the earlier conversation goes along as context.` }));
      }
      const lastIdx = chat.messages.length - 1;
      // suggestions stay on the latest reply even after a second opinion is added below it
      const lastReplyIdx = chat.messages.findLastIndex((m) => m.role === 'assistant' && !m.compactSummary);
      const pins = chat.messages.map((m, i) => (m.pinnedMsg ? i : -1)).filter((i) => i >= 0);
      if (pins.length) out.push(pinnedStrip(agentId, chat, pins));
      const firstNew = unreadFrom.get(chat.id);
      // A long chat opens on its last 40 messages (switching to one rebuilt every message: ~36k laid-out objects);
      // "↑ Show earlier" or scrolling up to it brings the rest, and jumpTo() loads them when it needs an older one.
      const from = shownFrom(chat, firstNew);
      v.earlierIO?.disconnect(); v.earlierIO = null; clearTimeout(v.earlierT); // (the last draw's "Show earlier" watch)
      if (from > 0) {
        const more = el('button', { type: 'button', class: 'ghost show-earlier', text: from > EARLIER + 10 ? `↑ Show earlier messages (${from} more)` : `↑ Show ${from} earlier message${from === 1 ? '' : 's'}`, on: { click: () => showEarlier(agentId, EARLIER) } });
        out.push(more);
        // reaching it by scrolling up loads them too (after the chat has settled at the bottom)
        watchEarlier(v, agentId, more);
      }
      let day = '';
      const busy = pending.has(chat.id);
      const onlyOpinionsAfter = chat.messages.slice(lastReplyIdx + 1).every((x) => x.role === 'opinion');
      // (round 35, streamrender) many messages to draw (a long chat shown whole for a jump, the next earlier ones):
      // built a few ms at a time with frames in between (it was one long task: ≈ 0.6 s for 1,200 messages here, the
      // window frozen); the chat shows them all at once when they're ready, as before
      let sliceAt = performance.now();
      for (let i = from; i < chat.messages.length; i++) {
        const m = chat.messages[i];
        if (m.compactReq) continue; // the "please compact" request is shown as part of the divider
        // a quiet date line where the day changes (Today / Yesterday / the date)
        const d = m.at ? dayLabel(m.at) : '';
        if (d && d !== day) { if (day || chat.messages.length > 1) out.push(el('div', { class: 'day-sep', text: d })); day = d; }
        if (firstNew === i) out.push(el('div', { class: 'new-sep', text: 'New' }));
        if (m.compactSummary) { out.push(compactDivider(m)); continue; }
        m.lastReply = i === lastReplyIdx && onlyOpinionsAfter && !busy ? true : undefined;
        out.push(nodeFor(cache, nextCache, m, agent, i, i === lastIdx && !busy));
        if (performance.now() - sliceAt > SLICE_MS) {
          await nextSlice();
          if (stale()) { keepBuilt(v, chatId, nextCache); return; }
          sliceAt = performance.now();
        }
      }
      // the nodes of the last few chats shown stay ready for switching back (older ones are let go)
      v.nodes ||= new Map(); v.nodes.delete(chatId); v.nodes.set(chatId, nextCache);
      while (v.nodes.size > NODE_CHATS) v.nodes.delete(v.nodes.keys().next().value);
    }
    if (chat) markSeen(chat.id);

    // hub notes shown in this chat (command output) come back after the redraw; dismissed ones stay gone
    v.notes = (v.notes || []).filter((n) => !n.box.dataset.gone);
    for (const n of v.notes) if (n.chatId === (chat?.id || null)) out.push(n.box);
    const banner = chat && longChatBanner(agent, chat);
    if (banner) out.push(banner);
    const p = chat && pending.get(chat.id);
    if (p) {
      // the live reply keeps its node (and its frozen Markdown, see paintBody) across redraws of its chat
      if (!p.el || p.el.parentElement !== v.list) { p.el = el('div', { class: 'msg assistant streaming' }, el('div', { class: 'body' })); p.md = null; }
      paintStreaming(p);
      out.push(p.el);
    }
    placeChildren(v.list, out);
    restack(agentId); // (round 40, chatcalm) two or more quiet notes: one line
    syncSendBtn(agentId);
    renderQueue(agentId);
    // Long replies start folded so the conversation stays scannable.
    requestAnimationFrame(() => {
      v.drawing = Math.max(0, (v.drawing || 1) - 1);
      // measure every reply first, then fold: folding one between two measurements made each measurement lay out the
      // whole chat again (one full layout per folded reply)
      const autoFold = store.get('chat.autoFold', true) !== false;
      const lastReply = v.list.querySelector('.msg.assistant:last-of-type');
      // (round 16) a reply kept from the last redraw was measured then: only new ones are. The last few are measured
      // now (they're on screen, the chat opens at its end); older ones when they come near the screen (foldWhenNear):
      // measuring them all forced a layout of every reply, even the ones content-visibility lets the browser skip.
      const fresh = !autoFold ? [] : [...v.list.querySelectorAll('.msg.assistant:not(.streaming)')]
        .filter((node) => !measured.has(node) && (measured.add(node), node !== lastReply && !unfolded.has(`${chat?.id}:${node.dataset.index}`)));
      const now = fresh.splice(-FOLD_NOW);
      foldIfLong(now, now.map((node) => node.querySelector('.body').scrollHeight));
      for (const node of fresh) foldWhenNear(v, node);
      // nodes that left the list stop being watched (measured again if they come back)
      for (const node of v.foldWatch || []) if (!node.isConnected) { v.foldIO.unobserve(node); v.foldWatch.delete(node); measured.delete(node); }
      const newSep = v.list.querySelector('.new-sep');
      if (keepScroll && !(wasNearBottom && v.follow !== false)) { v.list.scrollTop = prevScroll; if (anchor) keepAnchor(v.list, anchor); }
      else if (newSep && !keepScroll) { v.list.scrollTop = Math.max(0, newSep.offsetTop - 40); v.follow = v.list.scrollHeight - v.list.scrollTop - v.list.clientHeight < 4; }
      else if (!(v.scrollLock && keepScroll)) { v.follow = true; v.list.scrollTop = v.list.scrollHeight; }
      if (v.jumpAfter != null) { const at = v.jumpAfter; v.jumpAfter = null; jumpTo(agentId, at); } // (round 35) a jump waiting for this draw
      const near = nearBottom(v.list);
      if (v.jump.hidden !== near) v.jump.hidden = near;
      for (const fn of hooks.render) { try { fn(agentId, v, chat); } catch (err) { console.warn(err); } }
    });
  }

  // (round 35, streamrender) what's at the top edge of the chat: a message, or a block of the reply being written
  // (that one is replaced by the finished message when it ends: found again by its place in the reply)
  function firstBelow(nodes, top) { // nodes are in order down the page: the first whose bottom is under `top`
    let lo = 0; let hi = nodes.length - 1; let hit = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (nodes[mid].getBoundingClientRect().bottom > top + 1) { hit = mid; hi = mid - 1; } else lo = mid + 1; }
    return hit;
  }
  function topAnchor(list) {
    const top = list.getBoundingClientRect().top;
    const kids = list.children; let i = firstBelow(kids, top);
    if (i < 0) return null;
    // a message rather than what's drawn anew each time (the "Show earlier" button, a day line)
    for (let j = i; j < kids.length && j < i + 4; j++) if (kids[j].classList.contains('msg')) { i = j; break; }
    const n = kids[i];
    const body = n.classList.contains('streaming') ? n.querySelector(':scope > .body') : null;
    const k = body ? firstBelow(body.children, top) : -1;
    if (k >= 0) { const b = body.children[k]; return { live: n, k, tag: b.tagName, y: b.getBoundingClientRect().top - top }; }
    return { node: n, y: n.getBoundingClientRect().top - top };
  }
  function keepAnchor(list, a) {
    let n = a.node?.isConnected ? a.node : null;
    if (a.live) { // still streaming: the same block; finished: the same place in the finished reply
      const body = a.live.isConnected ? a.live.querySelector(':scope > .body') : [...list.querySelectorAll(':scope > .msg.assistant:not(.streaming) > .body')].pop();
      const b = body?.children[a.k]; n = b?.tagName === a.tag ? b : null;
    }
    if (!n) return;
    const d = n.getBoundingClientRect().top - list.getBoundingClientRect().top - a.y;
    if (Math.abs(d) >= 1) list.scrollTop += d;
  }
  // Pictures in replies (![…](https://…)): their sizes, once seen, so they hold their place before they load
  const imgSizes = new Map(Object.entries(store.get('chat.imgSizes', {}) || {}));
  const saveSizes = saver(() => store.set('chat.imgSizes', Object.fromEntries([...imgSizes].slice(-300))), 2000);
  let sizing = true; // (off while _test.streamCorpus compares the live HTML with a full render)
  function rememberSize(img) {
    if (!img.classList.contains('md-img') || !img.naturalWidth) return;
    const src = img.getAttribute('src'); const s = [img.naturalWidth, img.naturalHeight];
    if (String(imgSizes.get(src)) === String(s)) return;
    imgSizes.delete(src); imgSizes.set(src, s);
    while (imgSizes.size > 300) imgSizes.delete(imgSizes.keys().next().value);
    saveSizes();
  }
  // the size it will have once loaded (features.css: max-width min(100%, 420px), max-height 320px): the width that
  // fits the height cap, the ratio for the height; a narrower chat still shrinks it (max-width) in proportion
  function sizeImages(root) {
    if (!sizing || !imgSizes.size) return;
    for (const img of root.querySelectorAll('img.md-img')) {
      const s = imgSizes.get(img.getAttribute('src'));
      if (!s || img.style.aspectRatio) continue;
      img.style.width = `${Math.round(Math.min(s[0], (320 * s[0]) / s[1]))}px`;
      img.style.aspectRatio = `${s[0]} / ${s[1]}`;
    }
  }

  // (round 35, streamrender) drawing many messages: a few ms, then the frame goes on (scheduler.yield)
  const SLICE_MS = 6;
  const nextSlice = () => (window.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
  // a draw that stopped for a newer one: the nodes it built are kept for that one
  function keepBuilt(v, chatId, built) {
    v.nodes ||= new Map();
    const kept = v.nodes.get(chatId);
    if (kept) { for (const [m, e] of built) if (!kept.has(m)) kept.set(m, e); } else v.nodes.set(chatId, built);
  }

  // ---------- day lines, unread replies, pinned messages ----------
  function dayLabel(ms) {
    const d = new Date(ms); const today = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(today) - start(d)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return fmtLocal(ms, { weekday: diff < 7 ? 'long' : undefined, day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' }, 'date');
  }
  // Replies that arrived while you looked elsewhere: chat id -> index of the first one you haven't seen.
  const unreadFrom = new Map();
  H.unreadChats ||= new Set();
  const visibleNow = (agentId) => H.surfaceIdFor(H.activeId) === H.surfaceIdFor(agentId) && !document.hidden;
  function markSeen(chatId) {
    const chat = chats.get(chatId);
    if (!chat || !visibleNow(chat.agentId) || !H.unreadChats.has(chatId)) return;
    H.unreadChats.delete(chatId);
    setTimeout(() => unreadFrom.delete(chatId), 1500); // the "New" line stays for this render
    (Panel.soon || Panel.render)(); // (round 16) coalesced with the save that usually follows
  }
  // A docked chat's tool opened later (or the window came back): replies now on screen count as seen.
  // (on 'hearth:view' from start.js, focus and visibility instead of a check every 1.5 s)
  const seeShown = () => {
    if (!H.unreadChats.size) return;
    for (const agentId of views.keys()) {
      const id = H.activeChat[agentId];
      if (id && H.unreadChats.has(id) && visibleNow(agentId) && document.hasFocus()) markSeen(id);
    }
  };
  addEventListener('hearth:view', seeShown);
  addEventListener('focus', seeShown);
  document.addEventListener('visibilitychange', seeShown);
  function pinnedStrip(agentId, chat, pins) {
    let at = 0;
    const label = (i) => `📌 ${pins.length > 1 ? `${at + 1}/${pins.length} · ` : ''}${(chat.messages[i].text || '').replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)}`;
    const strip = el('button', { class: 'pinned-strip', text: label(pins[0]), title: 'Pinned messages: click to jump, click again for the next one' });
    strip.addEventListener('click', () => {
      jumpTo(agentId, pins[at]);
      at = (at + 1) % pins.length;
      strip.textContent = label(pins[at]);
    });
    return strip;
  }
  const WINDOW = 40;
  const fullChats = new Set(); // chats whose earlier messages are shown (this session)
  // (round 26, smooth26) "Show earlier" / scrolling up brings EARLIER more at a time: all 260 earlier messages of a
  // 300-message chat in one go was a ~300 ms frame (here) right under your wheel
  const EARLIER = 60;
  const earlierFrom = new Map(); // chat id → first message shown after some "Show earlier"
  function shownFrom(chat, firstNew) {
    if (fullChats.has(chat.id) || chat.messages.length <= WINDOW + 10) return 0;
    let from = Math.min(chat.messages.length - WINDOW, earlierFrom.get(chat.id) ?? Infinity);
    if (firstNew != null && firstNew < from) from = Math.max(0, firstNew - 2);
    return from;
  }
  // the earlier messages of the open chat (step: that many more, else all), keeping what's on screen where it is
  function showEarlier(agentId, step = 0) {
    const v = views.get(agentId); const id = H.activeChat[agentId];
    if (!v || !id || fullChats.has(id)) return;
    const chat = chats.get(id);
    const from = chat && step ? shownFrom(chat, unreadFrom.get(id)) - step : 0;
    if (from > 10) earlierFrom.set(id, from); else fullChats.add(id);
    const h0 = v.list.scrollHeight; const t0 = v.list.scrollTop;
    const keep = () => { v.list.scrollTop = t0 + (v.list.scrollHeight - h0); };
    keep();
    // (round 20) render waits for its chat (and the Markdown worker): keep the place after it drew
    // (round 35) as a redraw that keeps your place (keepScroll: the message at the top stays there): drawn as a fresh
    // one it ended by scrolling to the bottom, so scrolling up into earlier messages threw you back to the end
    render(agentId, { keepScroll: true }).then(keep);
  }
  // Scrolls to message #index (0-based) and flashes it; unfolds it when folded.
  function jumpTo(agentId, index) {
    const v = views.get(agentId);
    // (round 35, streamrender) an older message of a long chat: the chat is drawn whole, and the jump happens once that
    // draw has placed its scroll (it put you back at the bottom after the jump: recall's "show me" landed on the end)
    if (v && !v.list.querySelector(`.msg[data-index="${index}"]`) && H.activeChat[agentId] && !fullChats.has(H.activeChat[agentId])) { fullChats.add(H.activeChat[agentId]); v.jumpAfter = index; render(agentId); }
    const node = v?.list.querySelector(`.msg[data-index="${index}"]`);
    if (!node) { if (v?.drawing) v.jumpAfter = index; return false; }
    if (v.drawing) v.jumpAfter = index; // a draw on its way would put the scroll back: jump again after it
    node.scrollIntoView({ block: index === 0 ? 'start' : 'center' });
    node.classList.add('flash-msg');
    setTimeout(() => node.classList.remove('flash-msg'), 900);
    return true;
  }

  // The live reply: its thinking (open while it thinks), what it's doing, the text so far, and any
  // question / second-opinion cards (kept as the same DOM nodes so typed answers survive re-renders).
  // (round 35, streamrender) the reply is rendered by Md.live (md.js): a block whose shape can't change any more is
  // frozen (parsed and inserted once, never compared again: it was everything up to the last blank line before, so a
  // long table, list or code block without one was parsed and swapped whole on every paint); a code block is
  // highlighted line by line as it arrives (its frozen lines are appended, never highlighted twice); and only the
  // block still being written is parsed on each paint and morphed into place (a table gets its new row, a list its new
  // item: the rows and items above keep their nodes, styles and layout). The DOM ends up exactly as a full render's
  // (Native._test.streamCorpus compares them in the page, dev/streamrender-test.js in Node).
  const fragOf = (html) => { const t = document.createElement('template'); t.innerHTML = html; return [...t.content.childNodes]; };
  // makes `a` like `b` (a fresh parse of the new HTML), touching only what differs; returns the node now in place
  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return b; }
    if (a.nodeType === 3) { if (a.data !== b.data) { if (b.data.startsWith(a.data)) a.appendData(b.data.slice(a.data.length)); else a.data = b.data; } return a; }
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return a; }
    for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    // (a folded callout you opened while it streams stays open)
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && !(at.name === 'open' && a.nodeName === 'DETAILS')) a.removeAttribute(at.name);
    const ac = a.childNodes; const bc = [...b.childNodes];
    let i = 0;
    while (i < bc.length && i < ac.length && ac[i].isEqualNode(bc[i])) i += 1;
    for (; i < bc.length; i += 1) { if (i < ac.length) morph(ac[i], bc[i]); else a.append(bc[i]); }
    while (ac.length > bc.length) a.lastChild.remove();
    return a;
  }
  // puts the nodes of `next` where those of `cur` are (or at the end), removing them
  function swapBlock(body, cur, next) {
    const ref = cur?.nodes[0] || null;
    for (const n of next.nodes) body.insertBefore(n, ref);
    if (cur) for (const n of cur.nodes) n.remove();
    return next;
  }
  // one block of the live reply in the DOM: `cur` = what shows there now ({ html, nodes } or a code block's
  // { fence, nodes, code, applied, chunkNodes, tail }), `b` = the block from Md.live
  function putBlock(body, cur, b) {
    if (b.fence) {
      const e = cur?.fence === b.fence ? cur : swapBlock(body, cur, (() => { const [pre] = fragOf(`${b.fence.tag}</code></pre>`); return { fence: b.fence, nodes: [pre], code: pre.lastChild, applied: 0, chunkNodes: 0, tail: '' }; })());
      const { chunks } = b.fence; const { code } = e;
      if (e.applied < chunks.length || e.tail !== b.tail) {
        while (code.childNodes.length > e.chunkNodes) code.lastChild.remove(); // the unfrozen end (the last lines)
        if (e.applied < chunks.length) { code.insertAdjacentHTML('beforeend', chunks.slice(e.applied).join('')); e.applied = chunks.length; e.chunkNodes = code.childNodes.length; }
        if (b.tail) code.insertAdjacentHTML('beforeend', b.tail);
        e.tail = b.tail;
      }
      return e;
    }
    if (cur && !cur.fence && cur.html === b.html) return cur;
    const next = fragOf(b.html);
    if (b.html.includes('<img')) for (const n of next) if (n.nodeType === 1) sizeImages(n);
    if (cur && !cur.fence && cur.nodes.length === 1 && next.length === 1 && cur.nodes[0].nodeName === next[0].nodeName) {
      cur.nodes = [morph(cur.nodes[0], next[0])]; cur.html = b.html;
      return cur;
    }
    return swapBlock(body, cur, { html: b.html, nodes: next });
  }
  function paintBody(p, body, text) {
    if (!text && body.childNodes.length === 1 && body.firstChild.classList?.contains('typing')) return; // still waiting: the dots stay
    if (!window.Md?.live) { body.innerHTML = window.renderMarkdown(text); return; }
    let st = p.md;
    if (!st || st.body !== body) { st = p.md = { body, live: Md.live(), tail: [] }; body.replaceChildren(); }
    if (text && body.lastChild?.classList?.contains('typing')) body.lastChild.remove();
    const r = st.live.update(text);
    if (!r) return; // the same text (a paint for the thinking, a step or a card)
    if (r.reset) { body.replaceChildren(); st.tail = []; }
    const all = r.frozen.length ? [...r.frozen, ...r.tail] : r.tail;
    const next = all.map((b, i) => putBlock(body, st.tail[i], b));
    for (const e of st.tail.slice(all.length)) for (const n of e.nodes) n.remove();
    st.tail = next.slice(r.frozen.length); // the frozen ones stay in the body, never looked at again
  }
  // (round 21) thinking text as paragraph blocks (a long one cut at 4,000 characters): a new piece only touches the
  // last block, and blocks out of view skip layout (content-visibility in features.css)
  function appendThinking(tt, add, p) {
    let last = p.thinkBreak ? null : tt.lastElementChild;
    const segs = add.split(/\n{2,}/);
    segs.forEach((seg0, i) => {
      if (i > 0) last = null;
      let seg = i === 0 && !last ? seg0.replace(/^\n+/, '') : seg0;
      while (seg) {
        if (!last || last.textContent.length >= 4000) { last = document.createElement('p'); tt.append(last); seg = seg.replace(/^\n+/, ''); if (!seg) break; }
        const room = 4000 - last.textContent.length;
        const piece = seg.slice(0, room);
        seg = seg.slice(room);
        if (last.firstChild) last.firstChild.appendData(piece); else last.append(piece);
      }
    });
    p.thinkBreak = /\n{2,}$/.test(add);
  }
  function paintStreaming(p) {
    const body = p.el.querySelector('.body');
    const text = visibleText(p.text);
    if (p.thinking) {
      let th = p.el.querySelector('.thinking');
      if (!th) { th = thinkingEl('', true); p.el.prepend(th); p.thinkShown = 0; th.addEventListener('toggle', () => schedulePaint(p.chatId)); }
      // (only what changed is written: this runs ~16× a second while a reply streams)
      // (round 21, liveness) appended in paragraph blocks, and only while it is open: the whole text was written again
      // on each paint (a long think: hundreds of KB laid out 16× a second, ≈ 1.6 s of layout in a 4 s task)
      const tt = th.querySelector('.thinking-text');
      const grew = th.open && p.thinking.length > (p.thinkShown || 0);
      if (grew) { appendThinking(tt, p.thinking.slice(p.thinkShown || 0), p); p.thinkShown = p.thinking.length; }
      const sum = th.querySelector('summary'); const label = text ? 'Thought process' : 'Thinking…';
      if (sum.textContent !== label) sum.textContent = label;
      // it folds itself once the answer starts, unless you asked for thinking to stay open (/thinking always)
      if (text && !p.thinkClosed) { if (!store.get('chat.thinkingOpen', false)) th.open = false; p.thinkClosed = true; }
      if (th.open && grew) tt.scrollTop = tt.scrollHeight;
    }
    if (p.tools.length) {
      let chips = p.el.querySelector('.tool-chips');
      if (!chips) { chips = el('div', { class: 'tool-chips' }); body.before(chips); }
      const using = `${p.tools.length > 1 ? `Step ${p.tools.length} · ` : ''}Using ${toolLabel(p.tools.at(-1))}…`;
      if (chips.textContent !== using) { chips.textContent = using; chips.title = p.tools.map(toolLabel).join('\n'); }
    }
    window.ChatLive?.paint(p.chatId, p.el, body); // (round 21) agents deployed + the activity panel
    paintBody(p, body, text);
    const dots = !text && !p.cards.some((c) => c.classList.contains('ask-card') && !c.classList.contains('answered'));
    if (dots && !body.lastChild?.classList?.contains('typing')) body.insertAdjacentHTML('beforeend', '<span class="typing"><i></i><i></i><i></i></span>');
    let host = p.el.querySelector('.live-cards');
    if (!host) { host = el('div', { class: 'live-cards' }); p.el.append(host); }
    for (const c of p.cards) if (c.parentElement !== host) host.append(c);
    paintStatus(p);
  }
  // "Writing · 12 s · 140 words" under the live reply, ticking every second.
  function paintStatus(p) {
    if (!p.el) return;
    let st = p.el.querySelector('.stream-status');
    if (!st) { st = el('div', { class: 'stream-status' }); p.el.append(st); }
    // at most twice a second (it was rewritten on every streamed piece: ~15 writes a second for a clock in seconds)
    const now = Date.now(); const phase = p.text ? 1 : p.tools.length ? 2 : p.thinking ? 3 : 0;
    if (st.textContent && now - (p.statusAt || 0) < 500 && p.statusPhase === phase) return;
    p.statusAt = now; p.statusPhase = phase;
    // words counted at most every 2 s (the whole reply was scanned twice a second)
    if (p.text.length !== p.wordsLen && now - (p.wordsAt || 0) > 2000) { p.words = (visibleText(p.text).match(/\S+/g) || []).length; p.wordsLen = p.text.length; p.wordsAt = now; }
    // (round 21, liveness) the phase, the time, the steps, the agents, how long since the last news, and when the
    // engine has been quiet for 2 min, what it may be doing with Wait / Stop / Stop & retry (chat-live.js)
    if (window.ChatLive) { ChatLive.paintStatus(p.chatId, st, p); return; }
    const secs = Math.round((now - p.started) / 1000);
    const words = p.words || 0;
    const doing = p.text ? 'Writing' : p.tools.length ? 'Working' : p.thinking ? 'Thinking' : 'Starting';
    const line = `${doing} · ${secs} s${words ? ` · ${words.toLocaleString()} words` : ''}${p.tools.length ? ` · ${p.tools.length} step${p.tools.length > 1 ? 's' : ''}` : ''} · Esc stops`;
    if (st.textContent !== line) st.textContent = line;
  }
  // The folded "Thought for N s" block. /thinking open keeps finished ones open; Alt+T opens / closes all.
  function thinkingEl(text, open, ms) {
    const words = text ? (text.match(/\S+/g) || []).length : 0;
    const d = el('details', { class: 'thinking' },
      el('summary', {}, ms ? `Thought for ${Math.max(1, Math.round(ms / 1000))} s${words ? ` · ${words.toLocaleString()} words` : ''}` : 'Thought process',
        // a glance at what it thought about, without opening it
        ms && text ? el('span', { class: 'thinking-peek', text: text.replace(/\s+/g, ' ').trim().slice(0, 120) }) : null),
      el('div', { class: 'thinking-text', text }));
    d.open = open || (text !== '' && store.get('chat.thinkingOpen', false));
    return d;
  }
  function progressCard(steps) {
    const done = steps.filter((s) => s.status === 'done').length;
    const card = el('div', { class: 'progress-card' },
      el('div', { class: 'progress-head' }, el('b', { text: 'Plan' }), el('span', { text: `${done} / ${steps.length}` }),
        el('span', { class: 'progress-bar' }, el('i'))),
      el('ol', {}, steps.map((s) => el('li', { class: `step ${s.status || 'todo'}`, text: s.text }))));
    card.style.setProperty('--pct', `${Math.round((done / (steps.length || 1)) * 100)}%`);
    return card;
  }
  function showCard(sh) {
    const url = WinMac.fileUrl(sh.path);
    return el('figure', { class: 'show-card' }, el('img', { src: url, alt: sh.caption, loading: 'lazy', decoding: 'async', title: 'Click to open full size', on: { click: () => window.hub.fs.open(sh.path) } }), el('figcaption', { text: sh.caption }));
  }
  function opinionCard(op) {
    return el('div', { class: 'opinion-card' }, el('div', { class: 'opinion-head', text: `🔎 ${op.from}'s second opinion${op.q ? `: ${op.q.slice(0, 80)}${op.q.length > 80 ? '…' : ''}` : ''}` }),
      el('div', { class: 'body', html: renderMarkdown(op.text || '') }));
  }
  // Streaming text arrives in many small pieces; re-rendering the whole reply for each one gets heavy on
  // long answers, so pieces are gathered and painted at most every 60 ms.
  // (round 35, streamrender) the paint itself runs at the start of the next frame (requestAnimationFrame): its DOM
  // changes, the scroll that follows them and the frame's style / layout happen together, once. Painted from a timer,
  // the changes waited for the next frame half-done, and a key press in between (typing while it streams) had to
  // style and lay out the new part of the reply first, inside the key's handler.
  function schedulePaint(chatId) {
    const p = pending.get(chatId);
    if (!p || p.paintTimer) return;
    p.paintTimer = setTimeout(() => { p.paintTimer = requestAnimationFrame(() => { p.paintTimer = 0; repaintPending(chatId, true); }); }, 60);
  }
  function repaintPending(chatId, inFrame = false) {
    const p = pending.get(chatId);
    if (!p?.el?.isConnected) return;
    const list = p.el.closest('.messages');
    const v = views.get(chats.get(chatId)?.agentId);
    paintStreaming(p);
    if (v ? follows(v) : nearBottom(list)) {
      // in the frame already: scroll now (one layout for both), not one frame later (a frame drawn with the new text
      // below the bottom edge)
      if (inFrame && !list.endRaf) { const top = list.scrollHeight - list.clientHeight; if (top - list.scrollTop >= 1) list.scrollTop = top; } else scrollToEnd(list, v);
    } else if (v && !v.jump.classList.contains('has-new')) v.jump.classList.add('has-new'); // "↓" turns into "↓ new" while the reply grows below
  }
  function syncSendBtn(agentId) {
    const v = views.get(agentId);
    const busy = pending.has(H.activeChat[agentId]);
    if (!v) return;
    // (round 16) runs on every keystroke: written only when it changes
    // (round 38) the text is only read while it answers (Queue / Stop): reading a long draft copies it
    const typed = busy && Boolean(v.input.value.trim());
    const label = busy ? (typed ? 'Queue' : 'Stop') : 'Send';
    if (v.sendBtn.textContent === label) return;
    v.sendBtn.textContent = label;
    v.sendBtn.title = busy ? (typed ? 'Send this when the reply ends' : 'Stop (Esc)') : 'Send (Enter)';
    v.sendBtn.classList.toggle('stop', busy && !typed);
  }
  function renderQueue(agentId) {
    const v = views.get(agentId);
    if (!v) return;
    if (v.queueBox.hidden !== !v.queue.length) v.queueBox.hidden = !v.queue.length;
    if (!v.queue.length && !v.queueBox.firstChild) { syncSendBtn(agentId); return; } // (round 16) empty stays empty: no write
    // (round 36) a queued message's mission shows on its chip (and comes back with it when you edit it)
    const mOf = (q) => { const id = v.queueMissions?.get(q); return id && typeof Missions !== 'undefined' ? Missions.LIST.find((x) => x.id === id) || null : null; };
    const unq = (i, q) => { v.queue.splice(i, 1); if (!v.queue.includes(q)) v.queueMissions?.delete(q); };
    v.queueBox.replaceChildren(...v.queue.map((q, i) => { const mi = mOf(q); return el('span', { class: 'queue-chip', title: `${q}\n\n(${mi ? `${mi.label} · ` : ''}click to edit it again)` },
      el('span', { text: `⏳ ${mi ? `${mi.icon} ` : ''}${q.length > 60 ? `${q.slice(0, 59)}…` : q}`, on: { click: () => { const id = v.queueMissions?.get(q); unq(i, q); renderQueue(agentId); insertDraft(agentId, q); if (id) Missions.set(agentId, id); } } }),
      el('button', { type: 'button', text: '×', title: 'Remove from the queue', on: { click: () => { unq(i, q); renderQueue(agentId); } } })); }));
    syncSendBtn(agentId);
  }

  const knownSaves = new Set(); // (round 38) `${agentId}|fact` saved again but already known (nothing added)
  async function rememberFacts(agentId, facts) {
    const memory = await window.hub.getMemory();
    // (round 38, memorytidy) a fact that repeats or contradicts one it has replaces it instead of piling up
    if (window.MemoryTidyCore) {
      const r = MemoryTidyCore.saveFacts(memory, H.agent(agentId) || { id: agentId }, facts);
      await window.hub.saveMemory(r.memory);
      window.MemoryEditor?.stamp?.(agentId, r);
      for (const t of r.skipped) knownSaves.add(`${agentId}|${t}`); // it knew it already: its Undo leaves the old fact
      return r;
    }
    const current = (memory.agents[agentId] || '').trim();
    memory.agents[agentId] = [current, ...facts.map((f) => `- ${f}`)].filter(Boolean).join('\n');
    await window.hub.saveMemory(memory);
  }

  async function forgetFacts(agentId, facts) {
    const memory = await window.hub.getMemory();
    if (window.MemoryTidyCore) { await window.hub.saveMemory(MemoryTidyCore.unsave(memory, agentId, facts.filter((f) => !knownSaves.has(`${agentId}|${MemoryTidyCore.strip(f)}`)))); return; } // (round 38) puts back what a fact replaced
    const drop = new Set(facts.map((f) => `- ${f}`));
    memory.agents[agentId] = (memory.agents[agentId] || '').split('\n').filter((l) => !drop.has(l.trim())).join('\n');
    await window.hub.saveMemory(memory);
  }

  // When the engine has no session for this chat's history (imported, edited, regenerated or
  // continued from another agent), send the earlier conversation along once.
  function withContext(chat, text) {
    if (chat.session?.id || chat.messages.length <= 1) return text;
    if (chat.compact) {
      // (round 34, autocompact) a lighter continuation carries its last exchanges word for word: from `tail`
      const after = chat.messages.slice(chat.compact.tail ?? chat.compact.index, -1).filter((m) => m.role !== 'error' && !m.compactSummary && !m.compactReq)
        .map((m) => `${m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from} (second opinion)` : 'Assistant'}: ${m.ctx || m.text}`).join('\n\n');
      return `We compacted our earlier conversation to save context. Here is your summary of it${after ? ', then what we said since' : ''}. Continue naturally.\n\n<summary>\n${chat.compact.summary}\n</summary>${after ? `\n\n<since_then>\n${after.length > CONTEXT_CHARS ? `…${after.slice(-CONTEXT_CHARS)}` : after}\n</since_then>` : ''}\n\n${text}`;
    }
    const earlier = chat.messages.slice(0, -1).filter((m) => m.role !== 'error')
      .map((m) => `${m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from} (second opinion)` : 'Assistant'}: ${m.ctx || m.text}`).join('\n\n');
    if (!earlier) return text;
    const trimmed = earlier.length > CONTEXT_CHARS ? `…${earlier.slice(-CONTEXT_CHARS)}` : earlier;
    const where = chat.imported ? ` (imported from ${chat.imported})` : chat.continuedFrom ? ` (from a ${chat.continuedFrom} chat)` : '';
    return `Here is our earlier conversation${where}. Continue it naturally.\n\n<earlier_conversation>\n${trimmed}\n</earlier_conversation>\n\n${text}`;
  }

  function remember(chat) {
    window.hub.saveChat(chat);
    const summary = { id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt, pinned: Boolean(chat.pinned), model: chat.model, ...(chat.engine ? { engine: chat.engine } : {}) };
    H.chats = [summary, ...H.chats.filter((c) => c.id !== chat.id)];
    (Panel.soon || Panel.render)(); // (round 16) one list redraw for a burst of saves (send, reply, things found…)
  }

  function titleFrom(text) {
    const line = text.split('\n').find((l) => l.trim())?.trim() || 'New chat';
    return line.length > 48 ? `${line.slice(0, 47)}…` : line;
  }

  // Turns pending attachments into message text + engine options.
  function packAttachments(agentId, text) {
    const v = views.get(agentId);
    const atts = v ? v.attachments.splice(0) : [];
    if (v) renderChips(agentId);
    let full = text;
    for (const a of atts.filter((x) => x.kind === 'text')) full += `\n\n${a.wrapped || `<file name="${a.name}">\n${a.content}\n</file>`}`; // wrapped: attachlean's trimmed / referenced form
    const files = atts.filter((x) => x.kind === 'file');
    if (files.length) full += `\n\n[Attached files, open them with your ${H.agent(agentId)?.engine === 'codex' ? 'read-only commands' : 'Read tool'}]\n${files.map((f) => f.path).join('\n')}`;
    const images = atts.filter((x) => x.kind === 'image').map((x) => x.path);
    return { full, images, meta: atts.map((a) => ({ kind: a.kind, name: a.name, ...(a.tokens ? { tokens: a.tokens, ref: a.ref } : {}), ...(a.leanMeta ? { lean: a.leanMeta } : {}) })) };
  }

  // chatId: send into that chat of the agent even when it isn't the open one (a part dispatched by comp-dispatch.js
  // runs in the background, its own scene backstage); the composer's attachments and style stay with the open chat
  async function send(agentId, text, { fromHistory = false, compact = false, chatId: only = null } = {}) {
    let chatId = only || H.activeChat[agentId];
    if (chatId && pending.has(chatId)) throw new Error(`${H.agent(agentId).name} is still answering`);
    let chat = chatId ? await loadChat(chatId) : null;
    if (only && !chat) throw new Error('That chat is gone.');
    // (round 40, attachlean) pictures scaled, big texts trimmed to what the message is about, a file sent before referenced
    const lean = !fromHistory && !only && typeof AttachLean !== 'undefined' && views.get(agentId)?.attachments.length ? await AttachLean.prepare(agentId, chat, text).catch((err) => { console.warn('attachlean', err); return null; }) : null;
    if (chatId && pending.has(chatId)) throw new Error(`${H.agent(agentId).name} is still answering`);
    const now = Date.now();
    const { full, images, meta } = fromHistory || only ? { full: text, images: [], meta: [] } : packAttachments(agentId, text);
    if (!chat) {
      const v = views.get(agentId);
      chat = { id: `${agentId}-${now.toString(36)}`, agentId, title: titleFrom(text || meta[0]?.name || 'Attachment'), createdAt: now, updatedAt: now, session: {}, messages: [], model: v?.pendingModel || undefined };
      if (v) v.pendingModel = undefined;
      chats.set(chat.id, chat);
      H.activeChat[agentId] = chat.id;
      drafts.delete(agentId);
    }
    if (!fromHistory) {
      const message = { role: 'user', text: text || '(see attachments)', at: now, ...(compact ? { compactReq: true } : {}) };
      if (meta.length) { message.attachments = meta; message.sent = full; message.images = images; }
      chat.messages.push(message);
      lean?.commit(chat);
    }
    const last = chat.messages.at(-1);
    chat.updatedAt = now;
    remember(chat);
    const p = { chatId: chat.id, text: '', tools: [], started: now, thinking: '', cards: [], qa: [], opinions: [], progress: null, shows: [] };
    p.tick = setInterval(() => { if (p.el?.isConnected) paintStatus(p); }, 1000);
    pending.set(chat.id, p);
    for (const fn of hooks.send) { try { fn(agentId, chat, text); } catch (err) { console.warn(err); } }
    render(agentId);
    // A style you set with /tone, /persona or /lang rides along once per engine session (never in the system prompt).
    const v = only && only !== H.activeChat[agentId] ? null : views.get(agentId);
    let style = '';
    if (!compact && v?.styleNext) { style = v.styleNext; chat.style = v.styleClear ? undefined : v.styleNext; v.styleNext = ''; v.styleClear = false; renderStyle(agentId); remember(chat); }
    else if (!compact && chat.style && !chat.session?.id) style = chat.style;
    // astra.js adds the chat's effort / persona / web search, a collaboration's outcome, and a fallback
    // (the conversation as context) in case the engine lost the session
    let raw = last.sent || full || last.text;
    if (!fromHistory && !compact) for (const fn of hooks.compose) { try { const t = await fn(agentId, chat, raw, last); if (typeof t === 'string' && t !== raw) { raw = t; last.sent = t; } } catch (err) { console.warn(err); } }
    const extra = typeof Astra !== 'undefined' ? Astra.beforeSend(chat, raw, withContext) : { text: withContext(chat, raw), options: {} };
    // (round 28, router.js) options(agentId, chat, raw, message, options, { compact, fromHistory }): may fill in engine
    // options for this one message (Smart picks model + effort); what is already set (the chat's own pick) stays
    for (const fn of hooks.options) { try { fn(agentId, chat, raw, last, extra.options, { compact, fromHistory }); } catch (err) { console.warn(err); } }
    window.hub.send({
      agentId, chatId: chat.id, session: chat.session,
      text: style ? `[${style}]\n\n${extra.text}` : extra.text,
      options: { model: chat.model || undefined, images: last.images || images, ...(lean?.readFiles ? { readFiles: true } : {}), ...extra.options, ...(chat.captureTools ? { captureTools: true } : {}), ...(chat.subagents ? { subagents: true } : {}), ...(chat.crew ? { crewOn: true } : {}), ...(typeof Access !== 'undefined' ? Access.sendOptions(chat) : {}) },
    }).catch((err) => onEvent({ chatId: chat.id, type: 'error', message: err.message }));
  }

  function onEvent(event) {
    const p = pending.get(event.chatId);
    const chat = chats.get(event.chatId);
    if (!p || !chat) return;
    if (event.type === 'thinking') {
      if (!p.thinkStart) p.thinkStart = Date.now();
      p.thinking += event.text;
      p.thinkEnd = Date.now();
      schedulePaint(event.chatId);
      return;
    }
    if (event.type === 'progress') { // the engine's own plan (Codex todo list) as the live checklist
      p.progress = event.steps || [];
      const card = progressCard(p.progress);
      const old = p.cards.find((c) => c.classList.contains('progress-card'));
      if (old) { p.cards[p.cards.indexOf(old)] = card; old.replaceWith(card); } else p.cards.unshift(card);
      schedulePaint(event.chatId);
      return;
    }
    if (event.type === 'delta' || event.type === 'tool') {
      if (event.type === 'tool') {
        if (event.parent) { schedulePaint(event.chatId); return; } // a subagent's step: under its agent (chat-live.js), not in the reply
        p.tools.push(event.name);
        if (p.text && !p.text.endsWith('\n\n')) p.text += '\n\n';
      } else {
        p.text += event.text;
      }
      schedulePaint(event.chatId);
      return;
    }
    pending.delete(event.chatId);
    clearInterval(p.tick);
    // a reply you weren't looking at: the chat gets an unread mark and a "New" line where it starts
    if (event.type !== 'stopped' && !(H.activeChat[chat.agentId] === chat.id && visibleNow(chat.agentId) && document.hasFocus())) {
      H.unreadChats.add(chat.id);
      if (!unreadFrom.has(chat.id)) unreadFrom.set(chat.id, chat.messages.length);
    }
    // an unanswered question can't be answered anymore
    for (const c of p.cards) c.dispatchEvent(new Event('expire'));
    const at = Date.now();
    const extras = {};
    if (p.thinking.trim()) { extras.thinking = p.thinking.trim().slice(0, 30000); extras.thinkMs = (p.thinkEnd || at) - (p.thinkStart || p.started); }
    if (p.qa.length) extras.qa = p.qa;
    if (p.opinions.length) extras.opinions = p.opinions;
    if (p.progress) extras.progress = p.progress;
    if (p.shows.length) extras.shows = p.shows;
    for (const fn of hooks.finish) { try { fn(event, chat, extras); } catch (err) { console.warn(err); } }
    let replyText = '';
    if (event.type === 'done') {
      const raw = event.text || p.text;
      const facts = [...raw.matchAll(REMEMBER_TAG)].map((m) => m[1].trim()).filter(Boolean);
      const suggest = [...raw.matchAll(SUGGEST_TAG)].map((m) => m[1].trim()).filter(Boolean).slice(0, 4);
      const message = { role: 'assistant', text: visibleText(raw), at, usage: event.usage, ms: at - p.started, ...extras, ...(suggest.length ? { suggest } : {}), ...(chat.model ? { model: chat.model } : {}) };
      if (p.tools.length) message.tools = p.tools;
      if (facts.length) {
        message.remembered = facts;
        if (!window.ChatMemory?.intercept?.(chat, facts, message)) rememberFacts(chat.agentId, facts); // (round 24) /memory approve on: it waits for your OK
      }
      chat.messages.push(message);
      if (p.el && p.md) handoff.set(message, { el: p.el, p });
      chat.session = event.session;
      replyText = message.text;
    } else if (event.type === 'stopped') {
      if (p.text || extras.thinking) chat.messages.push({ role: 'assistant', text: visibleText(p.text), at, stopped: true, ...extras });
      if (event.session?.id) chat.session = event.session;
    } else {
      // what it wrote before failing stays (marked stopped), then the error
      if (visibleText(p.text)) chat.messages.push({ role: 'assistant', text: visibleText(p.text), at, stopped: true, ...extras });
      chat.messages.push({ role: 'error', text: event.message, needsLogin: event.needsLogin, ...(event.fixAction ? { fixAction: event.fixAction, fixEngine: event.fixEngine } : {}), at });
      replyText = `Error: ${event.message}`;
    }
    chat.updatedAt = at;
    remember(chat);
    // whoever waited for this reply (compacting, summarize-and-continue) gets its text
    const after = afterReply.get(event.chatId);
    afterReply.delete(event.chatId);
    after?.(event.type === 'done' ? visibleText(event.text || p.text) : null);
    if (H.activeChat[chat.agentId] === chat.id) render(chat.agentId, { keepScroll: true });
    if (replyText) AppUI.replyFinished(chat.agentId, chat.id, replyText);
    for (const fn of hooks.event) { try { fn(event, chat); } catch (err) { console.warn(err); } }
    if (event.type === 'done' && !after && !chat.messages.at(-1)?.compactSummary && maybeAutoCompact(chat, chat.messages.at(-1))) return;
    // messages typed while it worked go out now, one at a time
    const v = views.get(chat.agentId);
    if (v?.queue?.length && H.activeChat[chat.agentId] === chat.id && event.type !== 'stopped') {
      const next = v.queue.shift();
      const mid = v.queueMissions?.get(next); if (mid) v.queueMissions.delete(next);
      renderQueue(chat.agentId);
      setTimeout(() => { if (mid && typeof Missions !== 'undefined' && Missions.start(chat.agentId, mid, next)) return; send(chat.agentId, next).catch((err) => toast(err.message, { type: 'error' })); }, 250);
    }
  }

  // ---------- compact context ----------
  // Like Claude Code's /compact: the agent summarizes the conversation, the engine session restarts, and
  // the next message carries only that summary plus what came after. The chat itself keeps every message.
  const COMPACT_PROMPT = 'Compact our context: write a summary of this conversation that you can continue from without the full history. Include the goal, the decisions and preferences I gave you, what exists now (files, sketches, layers, settings, with their exact names), what you were in the middle of, and what is left to do. Complete but compact (under 350 words), no preamble.';
  const AUTO_COMPACT_TOKENS = 110000;
  async function compactChat(agentId, { auto = false } = {}) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    if (!chat.messages.some((m) => m.role === 'assistant' && !m.compactSummary)) { toast('Nothing to compact yet', { timeout: 1500 }); return; }
    // (round 34, autocompact.js) continue lighter: the cheapest model writes the summary, the last exchanges stay word for word
    if (window.Autocompact?.run) { await Autocompact.run(agentId, { auto }).catch((err) => toast(err.message, { type: 'error' })); return; }
    const before = [...chat.messages].reverse().find((m) => m.usage)?.usage.input || 0;
    await send(agentId, COMPACT_PROMPT, { compact: true });
    afterReply.set(chat.id, (summary) => {
      const reply = chat.messages.at(-1);
      if (!summary || reply?.role !== 'assistant') return;
      reply.compactSummary = true;
      reply.compactFrom = before;
      chat.compact = { summary, index: chat.messages.length, at: Date.now() };
      chat.session = {};
      chat.longDismissed = false;
      remember(chat);
      if (H.activeChat[agentId] === chat.id) render(agentId, { keepScroll: true });
      toast(`${auto ? 'Long task: context compacted automatically' : 'Context compacted'}${before ? ` (was ${fmt(before)} tokens per message)` : ''}`, { timeout: 3500 });
    });
  }
  function compactDivider(m) {
    return el('details', { class: 'compact-divider' },
      el('summary', { text: `🗜 ${m.lighter ? 'Continued lighter' : 'Context compacted'} here${m.compactFrom ? ` · was ${fmt(m.compactFrom)} tokens per message` : ''}${m.lighter ? ` · the last ${m.lighter.kept} exchanges kept word for word` : ''} · click to read the summary` }),
      el('div', { class: 'body', html: renderMarkdown(m.text) }));
  }
  function paintContext(v, chat) {
    const last = [...(chat?.messages || [])].reverse().find((m) => m.usage);
    // (round 34) continued lighter and nothing sent since: what the next message will send (≈), hover: what it was
    const lt = chat?.compact?.lighter && chat.messages.lastIndexOf(last) < chat.compact.index ? chat.compact.lighter : null;
    const n = lt ? lt.after : last?.usage.input || 0;
    if (v.ctx.hidden !== !n) v.ctx.hidden = !n;
    if (!n || v.ctxSeen === n) return; // (round 16) unchanged: nothing written
    v.ctxSeen = n;
    const pct = Math.min(100, Math.round((n / 200000) * 100));
    v.ctx.style.setProperty('--pct', `${pct}%`);
    v.ctx.classList.toggle('warn', n >= 60000);
    v.ctx.classList.toggle('high', n >= AUTO_COMPACT_TOKENS);
    v.ctx.querySelector('.ctx-text').textContent = `${lt ? '≈ ' : ''}${fmt(n)} context`;
    const was = chat?.compact?.lighter?.before;
    v.ctx.title = `Each message now sends about ${fmt(n)} tokens of context${was > n ? ` (was ${fmt(was)} before continuing lighter)` : ''}. Click to compact it into a summary (the chat keeps every message).`;
  }
  // After a reply that pushed the context past the limit: compact on its own (agent setting, on by default).
  function maybeAutoCompact(chat, message) {
    const agent = H.agent(chat.agentId);
    if (!agent || agent.autoCompact === false || !message?.usage || message.usage.input < AUTO_COMPACT_TOKENS) return false;
    if (window.Autocompact) return false; // (round 34) never silently: the offer to continue lighter (or the banner when it's off)
    if (H.activeChat[chat.agentId] !== chat.id || views.get(chat.agentId)?.queue?.length) return false;
    setTimeout(() => compactChat(chat.agentId, { auto: true }), 400);
    return true;
  }
  // Branch: a new chat with everything up to this message, to try another direction without losing this one.
  async function branchFrom(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat) return;
    const now = Date.now();
    const copy = {
      id: `${agentId}-${now.toString(36)}`, agentId, title: `${chat.title} (branch)`, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: `"${chat.title}"`, contextFrom: chat.id, model: chat.model, // contextFrom: the board, scene, captures… it worked with go along (chat-context.js)
      messages: chat.messages.slice(0, index + 1).map((m) => ({ ...m, lastReply: undefined })),
      ...(chat.compact && chat.compact.index <= index + 1 ? { compact: { ...chat.compact } } : {}),
    };
    chats.set(copy.id, copy);
    remember(copy);
    open(agentId, copy.id);
    toast('Branched: this chat continues from that message; the original is unchanged', { timeout: 3000 });
  }

  // ---------- long chats: summarize and continue fresh ----------
  // Every message re-sends the whole conversation; past ~80k tokens a fresh chat that starts from a short
  // summary is much cheaper. A banner offers it; afterReply catches the summary.
  const afterReply = new Map(); // chat id -> fn(text | null) when its reply ends
  const LONG_CHAT_TOKENS = 80000;
  const SUMMARY_PROMPT = 'We are moving to a fresh chat to save tokens. Write a compact summary of this conversation that you could continue from: the goal, what we decided, what exists now (files, sketches, layers, settings with their names), and what is left to do. Under 250 words, no preamble.';
  async function summarizeAndContinue(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    await send(agentId, SUMMARY_PROMPT);
    afterReply.set(chat.id, (summary) => {
      if (!summary) return;
      const now = Date.now();
      const fresh = {
        id: `${agentId}-${now.toString(36)}`, agentId, title: `${chat.title.replace(/ \(continued\)$/, '')} (continued)`, createdAt: now, updatedAt: now,
        session: {}, continuedFrom: 'summary of the earlier chat', contextFrom: chat.id, model: chat.model,
        messages: [{ role: 'assistant', text: `**Where we are** (summary of "${chat.title}")\n\n${summary}`, at: now }],
      };
      chats.set(fresh.id, fresh);
      remember(fresh);
      open(agentId, fresh.id);
      toast('Continuing in a fresh chat from the summary (the old chat stays in the list)', { timeout: 4000 });
    });
  }
  function longChatBanner(agent, chat) {
    const last = [...(chat?.messages || [])].reverse().find((m) => m.usage);
    if (!last || last.usage.input < LONG_CHAT_TOKENS || chat.longDismissed || pending.has(chat.id)) return null;
    if (window.Autocompact?.handles(agent)) return null; // (round 34) one calm line under the reply instead (autocompact.js)
    return el('div', { class: 'long-chat' },
      el('span', { text: `This chat now sends about ${fmt(last.usage.input)} tokens with every message.` }),
      el('button', { class: 'primary small', text: '🗜 Compact context', title: 'It summarizes the conversation; this chat continues from the summary (every message stays visible)', on: { click: () => compactChat(agent.id) } }),
      el('button', { class: 'ghost small', text: 'New chat from a summary', title: 'A short summary (goal, decisions, open tasks, key files), shown and editable; a new chat continues from it', on: { click: () => (window.ChatFresh ? ChatFresh.start(agent.id).catch((err) => toast(err.message, { type: 'error' })) : summarizeAndContinue(agent.id)) } }), // (round 24) a free summary, editable first
      el('button', { class: 'ghost small', text: 'Keep going', on: { click: () => { chat.longDismissed = true; remember(chat); render(agent.id, { keepScroll: true }); } } }));
  }

  // ---------- talking back: questions and second opinions (mcp/chat-mcp.js → HubBridge) ----------
  const astraAgent = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && /astra/i.test(a.name))
    || H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  // Second opinions go both ways: Claude-engine agents ask Astra, Astra (Codex) agents ask Claude.
  const partnerOf = (agent) => {
    if (!agent) return null;
    const other = agent.engine === 'codex' ? H.agents().find((a) => a.mode === 'native' && a.engine === 'claude' && !a.dock) || H.agents().find((a) => a.mode === 'native' && a.engine === 'claude') : astraAgent();
    return other && other.id !== agent.id ? other : null;
  };
  const pendingFor = (agentId) => [...pending.keys()].find((id) => chats.get(id)?.agentId === agentId);
  async function headsUp(agentId, chatId, text) {
    const agent = H.agent(agentId);
    const onScreen = H.surfaceIdFor(H.activeId) === H.surfaceIdFor(agentId) && H.activeChat[agentId] === chatId && !document.body.classList.contains('lab-focus');
    const focused = await window.hub.isWindowFocused();
    if (onScreen && focused) return;
    const note = toast(`${agent?.name || 'An agent'} ${text}`, { timeout: 15000, action: { label: 'Open', fn: () => { document.querySelector('.lab-focus-exit')?.click(); open(agentId, chatId); } } });
    if (typeof ChatScenes !== 'undefined') ChatScenes.markToast(note, chatId); // a director chat's color + mark
    if (!focused) {
      window.hub.flashWindow();
      const n = new Notification(`${agent?.name || 'Hearth'} ${text.split(':')[0]}`, { body: text, silent: false });
      n.onclick = () => { window.hub.showWindow(); open(agentId, chatId); };
    }
    return note;
  }
  // A question card in the live reply; resolves with the answer (or a skip / stop note).
  function askUser(agentId, { question, options = [], multiple = false, free = true }) {
    const chatId = pendingFor(agentId);
    const p = chatId && pending.get(chatId);
    if (!p) return Promise.resolve({ ok: false, error: 'There is no reply in progress to ask from.' });
    return new Promise((resolve) => {
      const picked = new Set();
      let noteP = Promise.resolve(null);
      const text = el('textarea', { class: 'ask-text', rows: 2, placeholder: options.length ? 'Or type your own answer…' : 'Your answer…' });
      const card = el('div', { class: 'ask-card' });
      const done = (answer, label = answer) => {
        if (card.classList.contains('answered')) return;
        card.classList.add('answered');
        card.replaceChildren(el('span', { class: 'qa-q', text: `❓ ${question}` }), el('span', { class: 'qa-a', text: `→ ${label}` }));
        p.qa.push({ q: question, a: label });
        noteP.then((n) => n?.remove());
        resolve({ ok: true, value: answer });
        repaintPending(chatId);
      };
      const optBtns = options.map((o) => el('button', { type: 'button', class: 'ask-opt', text: o, on: { click: (e) => {
        if (!multiple) { done(o); return; }
        if (picked.has(o)) picked.delete(o); else picked.add(o);
        e.currentTarget.classList.toggle('on', picked.has(o));
      } } }));
      const sendIt = () => {
        const typed = text.value.trim();
        const parts = [...picked, ...(typed ? [typed] : [])];
        if (!parts.length) { text.focus(); return; }
        done(parts.join('; '));
      };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIt(); } });
      card.append(el('div', { class: 'ask-q', text: question }),
        optBtns.length ? el('div', { class: 'ask-opts' }, optBtns) : null,
        free !== false || multiple ? el('div', { class: 'ask-row' }, free !== false ? text : null,
          el('button', { type: 'button', class: 'primary small', text: multiple ? 'Send choices' : 'Answer', on: { click: sendIt } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Skip', title: 'Let it decide', on: { click: () => done('(The user skipped this question: use your best judgment.)', 'skipped') } })) : null);
      card.addEventListener('expire', () => done('(The reply ended before the user answered.)', 'not answered'));
      p.cards.push(card);
      repaintPending(chatId);
      setTimeout(() => (text.isConnected ? text : optBtns[0])?.focus?.(), 50);
      noteP = headsUp(agentId, chatId, `asks you: ${question}`);
      document.dispatchEvent(new CustomEvent('hearth:needs-you', { detail: { kind: 'question', agentId, chatId, text: `asks: ${question}`, node: card } })); // (round 27) activity.js
    });
  }
  // What the user is looking at, as an image file for the second opinion.
  async function screenshotFor(agent) {
    try {
      if (agent?.dock === 'three' && typeof ThreeLab !== 'undefined') {
        const url = await ThreeLab.shot?.();
        if (url) return await window.hub.saveAttachment(`lab-${Date.now()}.png`, url.split(',')[1]);
      }
      return await window.hub.captureWindow();
    } catch { return null; }
  }
  async function askAstra(agentId, question, { screenshot = false, to = null } = {}) {
    const agent = H.agent(agentId);
    const astra = (to && H.agent(to)) || partnerOf(agent);
    if (!astra) return { ok: false, error: agent?.engine === 'codex' ? 'No Claude chat agent is set up in the hub.' : 'No Astra (ChatGPT / Codex) agent is set up in the hub.' };
    const img = screenshot ? await screenshotFor(agent) : null;
    const text = `${question}\n\n[You are giving a second opinion to ${agent?.name || 'another AI'}, which is working on this for the user.${img ? ' The attached image is what the user sees right now.' : ''} Be concise and concrete: what works, what doesn't, and the 3 changes that would help most.]`;
    // lean: the judge needs no tools of its own, so the opinion costs about one plain chat turn
    // (round 33, swarmlean) the reviewer of an "Answer, then review" mission: the helper pick (cheaper model on Smart)
    const extra = typeof SwarmLean !== 'undefined' ? SwarmLean.takeReview(agentId, astra.id) : {};
    const r = await window.hub.askOnce({ agentId: astra.id, text, images: img ? [img] : [], options: { lean: true, ...extra } });
    if (r.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: astra.id, usage: r.usage, source: 'second opinion' } }));
    return r.ok ? { ok: true, from: astra.name, text: r.text, usage: r.usage } : r;
  }
  HubBridge.register(['chat_'], async (tool, args) => {
    const agentId = args.agentId;
    if (tool === 'chat_ask') {
      const opts = Array.isArray(args.options) ? args.options.map(String).filter(Boolean).slice(0, 8) : [];
      return askUser(agentId, { question: String(args.question || '').slice(0, 600), options: opts, multiple: Boolean(args.multiple), free: args.free !== false });
    }
    if (tool === 'chat_progress') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      if (!p) return { ok: false, error: 'No reply in progress.' };
      const steps = (Array.isArray(args.steps) ? args.steps : []).slice(0, 12).map((s) => (typeof s === 'string' ? { text: s, status: 'todo' } : { text: String(s.text || '').slice(0, 160), status: ['todo', 'doing', 'done'].includes(s.status) ? s.status : 'todo' }));
      p.progress = steps;
      const card = progressCard(steps);
      card.style.setProperty('--pct', `${Math.round((steps.filter((s) => s.status === 'done').length / (steps.length || 1)) * 100)}%`);
      const old = p.cards.find((c) => c.classList.contains('progress-card'));
      if (old) { p.cards[p.cards.indexOf(old)] = card; old.replaceWith(card); } else p.cards.unshift(card);
      repaintPending(chatId);
      return { ok: true, value: 'Shown.' };
    }
    if (tool === 'chat_show') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      if (!p) return { ok: false, error: 'No reply in progress.' };
      const path = await screenshotFor(H.agent(agentId));
      if (!path) return { ok: false, error: 'Could not take the screenshot.' };
      const sh = { caption: String(args.caption || '').slice(0, 200), path };
      p.shows.push(sh);
      p.cards.push(showCard(sh));
      repaintPending(chatId);
      return { ok: true, value: 'Shown to the user.' };
    }
    if (tool === 'chat_second_opinion') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      const r = await askAstra(agentId, String(args.question || ''), { screenshot: Boolean(args.screenshot) });
      if (!r.ok) return r;
      if (p) { p.opinions.push({ from: r.from, q: String(args.question || ''), text: r.text }); p.cards.push(opinionCard(p.opinions.at(-1))); repaintPending(chatId); }
      return { ok: true, value: `${r.from} says:\n${r.text}` };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  });
  // The 👁 button: Astra judges the last reply (with a screenshot for docked tools); its answer joins the chat.
  async function secondOpinion(agentId, to = null, { screenshot = null } = {}) {
    const chat = chats.get(H.activeChat[agentId]);
    const agent = H.agent(agentId);
    if (!chat || pending.has(chat.id)) return;
    const judge = (to && H.agent(to)) || partnerOf(agent);
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user')?.text || '';
    const replyMsg = [...chat.messages].reverse().find((m) => m.role === 'assistant');
    const asked = replyMsg?.qa?.length ? `\n(While working it asked the user: ${replyMsg.qa.map((x) => `"${x.q}" → ${x.a}`).join('; ')})` : '';
    const offered = replyMsg?.suggest?.length ? `\n(It offered these next steps as buttons: ${replyMsg.suggest.join(' | ')})` : '';
    const lastReply = `${replyMsg?.text || ''}${asked}${offered}`;
    const t = toast(`Asking ${judge?.name || 'Astra'} for a second opinion…`, { timeout: 60000 });
    const r = await askAstra(agentId, `The user asked ${agent.name}: "${lastUser.slice(0, 2000)}"\n\n${agent.name} answered: "${lastReply.slice(0, 4000)}"\n\nGive your second opinion on the result.`, { screenshot: screenshot ?? Boolean(agent.dock), to: judge?.id });
    t?.remove();
    if (!r.ok) { toast(r.error || 'No answer', { type: 'error' }); return; }
    chat.messages.push({ role: 'opinion', from: r.from, text: r.text, at: Date.now(), ...(r.usage ? { cost: r.usage } : {}) }); // not "usage": that one drives the context meter
    remember(chat);
    if (H.activeChat[agentId] === chat.id) render(agentId);
  }

  // ---------- message actions ----------
  // Editing or regenerating rewrites history, so the chat continues in a fresh engine session
  // with the remaining conversation sent along as context.
  async function editMessage(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    const original = chat.messages[index];
    if (chat.compact && index < chat.compact.index) delete chat.compact;
    const next = await Modal.prompt('Edit message', { value: original.text, multiline: true, label: 'Everything after this message will be replaced by a new reply.' });
    if (next == null || !next.trim()) return;
    chat.messages = chat.messages.slice(0, index);
    // the earlier wording is kept (shown on hover over "edited")
    const edits = [...(original.edits || []), original.text].slice(-5);
    chat.messages.push({ ...original, text: next.trim(), sent: original.sent ? original.sent.replace(original.text, next.trim()) : undefined, at: Date.now(), edited: true, edits });
    chat.session = {};
    await send(agentId, next.trim(), { fromHistory: true });
  }

  async function regenerate(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    const lastUser = chat.messages.map((m) => m.role).lastIndexOf('user');
    if (lastUser < 0) return;
    if (chat.compact && lastUser < chat.compact.index) delete chat.compact;
    chat.messages = chat.messages.slice(0, lastUser + 1);
    chat.session = {};
    await send(agentId, chat.messages[lastUser].text, { fromHistory: true });
  }

  function quote(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    const v = views.get(agentId);
    const text = chat?.messages[index]?.text || '';
    const quoted = text.split('\n').slice(0, 30).map((l) => `> ${l}`).join('\n');
    v.input.value = `${quoted}\n\n${v.input.value}`;
    autosize(v.input);
    v.input.focus();
    v.input.setSelectionRange(v.input.value.length, v.input.value.length);
  }

  // ---------- chat-level actions ----------
  function chatMarkdown(chat) {
    const agent = H.agent(chat.agentId);
    return `# ${chat.title}\n\n_${agent?.name || chat.agentId} · ${fmtDate(chat.createdAt)}_\n\n${chat.messages.filter((m) => m.role !== 'error')
      .map((m) => `**${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from} (second opinion)` : agent?.name || 'Assistant'}:**\n\n${m.text}`).join('\n\n---\n\n')}\n`;
  }

  // (round 26) the ⋯ button opens Options (options.js: this chat's actions + every option in tabs); right-click ⋯ (or
  // the header) keeps this menu. chatMenuItems is what both show.
  async function chatMenu(agentId, e) {
    const items = chatMenuItems(agentId);
    const r = e.currentTarget?.getBoundingClientRect?.() || { left: e.clientX, bottom: e.clientY - 4 };
    showMenu(r.left, r.bottom + 4, items);
  }
  function chatMenuItems(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    const others = H.agents().filter((a) => a.mode === 'native' && a.id !== agentId);
    // (round 7) a few open entries that branch: Model ›, View ›, Organise ›, Copy & export › (right-click the header
    // for the same menu)
    const modelItems = () => { const agent = H.agent(agentId); const cur = chat?.model || ''; return [
      { label: `Agent default (${agent.model || 'engine default'})`, checked: !cur, action: () => { setChatModel(agentId, ''); render(agentId, { keepScroll: true }); } },
      ...[...new Set(MODEL_CHOICES[agent.engine] || [])].filter((c) => c !== agent.model).map((c) => ({ label: c, checked: cur === c, action: () => { setChatModel(agentId, c); render(agentId, { keepScroll: true }); } })),
    ]; };
    const items = chat ? [
      { label: '＋ New chat', key: 'Ctrl+N', action: () => newChat(agentId) },
      { label: '🗜 Compact context', action: () => compactChat(agentId) },
      { label: 'Model', hint: chat.model || H.agent(agentId).model || 'default', items: modelItems },
      // (round 14) what this chat may do with your files (access.js)
      ...(typeof Access !== 'undefined' ? [Access.menuItem(agentId, chat)] : []),
      { label: 'View', items: () => [
        { label: 'Find in this chat…', key: 'Alt+F', action: () => Commands.exec('/find', agentId) },
        { label: 'Open / close all thinking', key: 'Alt+T', action: () => toggleThinking(agentId) },
        { label: 'Fold all long replies', action: () => foldAll(agentId, true) },
        { label: 'Unfold all replies', action: () => foldAll(agentId, false) },
        { label: 'Jump to the first message', action: () => { const l = views.get(agentId)?.list; if (l) l.scrollTop = 0; } },
        { label: 'Read the last reply aloud', key: 'Alt+R', action: () => speak(lastReplyText(agentId)) },
        { label: 'Chat stats', action: () => chatStats(chat) },
        { label: 'Everything it can do…', action: () => Commands.exec('/help', agentId) },
      ] },
      // (round 9) the board, scene, sequence, project, captures this chat works with (chat-context.js)
      ...(typeof ChatContext !== 'undefined' ? (() => { const w = ChatContext.attachItems(agentId).filter((x) => typeof x === 'object'); return w.length ? [{ label: 'Works with', hint: String(w.length), items: () => [...w, '-', { label: 'What it is and how your words use it', action: () => Commands.exec('/chat-context', agentId) }] }] : []; })() : []),
      { label: 'Organise', items: () => [
        { label: 'Rename…', action: () => renameCurrent(agentId) },
        { label: 'Pin to top', checked: Boolean(chat.pinned), action: () => togglePin(chat.id) },
        { label: 'Tags and folder…', action: () => Commands.exec('/tags', agentId) },
        { label: 'Duplicate this chat', action: () => { const n = chat.messages.length; if (n) branchFrom(agentId, n - 1); } },
        ...others.map((a) => ({ label: `Continue with ${a.name}`, action: () => continueWith(chat.id, a.id) })),
      ] },
      { label: 'Copy & export', items: () => [
        { label: 'Copy as Markdown', action: () => copyText(chatMarkdown(chat), 'Chat copied') },
        { label: 'Copy the last reply', action: () => copyLastReply(agentId) },
        { label: 'Export as Markdown file…', action: async () => { const p = await window.hub.saveFile({ defaultPath: `${chat.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: chatMarkdown(chat) }); if (p) toast('Chat exported', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); } },
        { label: 'Export as JSON (to import later)…', action: () => Commands.exec('/export json file', agentId) },
      ] },
      { label: 'Delete chat', danger: true, action: async () => { if (await Modal.confirm('Delete chat?', `"${chat.title}" moves to Recently deleted (Ctrl+K → Recently deleted chats) for 30 days.`, { ok: 'Delete', danger: true })) remove(chat.id); } },
    ] : [
      { label: 'Model', hint: H.agent(agentId).model || 'default', items: modelItems },
      ...(typeof Access !== 'undefined' ? [Access.menuItem(agentId, null)] : []),
      { label: 'Import a chat from a file…', action: () => Commands.exec('/import', agentId) },
      { label: 'Everything it can do…', action: () => Commands.exec('/help', agentId) },
    ];
    if (window.Lazy?.isIn?.('quickstart') && typeof QuickstartHooks !== 'undefined') items.push(QuickstartHooks.menuItem(QuickstartHooks.placeOf(agentId), agentId)); // (round 31) What can I do here?
    if (typeof Declutter !== 'undefined') items.push(...Declutter.customiseItems('Chat'));
    return items;
  }

  // The model list as a menu (docked chats hide the dropdown).
  function modelMenu(agentId, e) {
    const agent = H.agent(agentId);
    const chat = chats.get(H.activeChat[agentId]);
    const current = chat?.model || '';
    const choices = [...new Set([...(MODEL_CHOICES[agent.engine] || [])])].filter((c) => c !== agent.model);
    const r = (e?.currentTarget || views.get(agentId)?.title)?.getBoundingClientRect?.() || { left: 200, bottom: 80 };
    setTimeout(() => showMenu(r.left, r.bottom + 4, [
      { label: `${current ? '' : '✓ '}Agent default (${agent.model || 'engine default'})`, action: () => { setChatModel(agentId, ''); render(agentId, { keepScroll: true }); } },
      ...choices.map((c) => ({ label: `${current === c ? '✓ ' : ''}${c}`, action: () => { setChatModel(agentId, c); render(agentId, { keepScroll: true }); } })),
    ]), 0);
  }

  // ---------- small helpers for the chat menu and keys ----------
  function lastReplyText(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    return [...(chat?.messages || [])].reverse().find((m) => m.role === 'assistant')?.text || '';
  }
  function copyLastReply(agentId) {
    const t = lastReplyText(agentId);
    if (!t) { toast('No reply yet'); return; }
    navigator.clipboard.writeText(t).then(() => toast('Last reply copied', { timeout: 1400 }));
  }
  function foldAll(agentId, fold) {
    const v = views.get(agentId); const chat = chats.get(H.activeChat[agentId]);
    if (!v) return;
    for (const node of v.list.querySelectorAll('.msg.assistant:not(.streaming)')) {
      const key = `${chat?.id}:${node.dataset.index}`;
      if (fold) { unfolded.delete(key); if (node.querySelector('.body').scrollHeight > COLLAPSE_PX / 3 && !node.classList.contains('collapsed')) { node.classList.add('collapsed'); if (!node.querySelector('.show-more-msg')) node.append(el('button', { class: 'show-more-msg msg-act', text: 'Show full reply', dataset: { msgAct: 'more' } })); } }
      else { unfolded.add(key); node.classList.remove('collapsed'); node.querySelector('.show-more-msg')?.remove(); }
    }
  }
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  function chatStats(chat) {
    const ms = chat.messages;
    const words = (role) => ms.filter((m) => m.role === role).reduce((n, m) => n + (m.text.match(/\S+/g) || []).length, 0);
    const tokIn = ms.reduce((n, m) => n + (m.usage?.input || 0), 0); const tokOut = ms.reduce((n, m) => n + (m.usage?.output || 0), 0);
    const time = ms.reduce((n, m) => n + (m.ms || 0), 0);
    const first = ms.find((m) => m.at)?.at; const last = [...ms].reverse().find((m) => m.at)?.at;
    Modal.alert('Chat stats', [
      plural(ms.filter((m) => m.role === 'user').length, 'message') + ` from you (${plural(words('user'), 'word')})`,
      plural(ms.filter((m) => m.role === 'assistant').length, 'reply', 'replies') + ` (${plural(words('assistant'), 'word')})`,
      tokIn || tokOut ? `${tokIn.toLocaleString()} tokens in · ${tokOut.toLocaleString()} out` : null,
      time ? `${Math.round(time / 1000)} s spent answering` : null,
      first ? `From ${new Date(first).toLocaleString()} to ${new Date(last).toLocaleString()}` : null,
    ].filter(Boolean).join('\n')) ?? toast('Stats unavailable');
  }
  // 🔊 read a reply aloud (the system voice); clicking again stops. /read rate 1.3 and /read voice <name> tune it.
  let speaking = null;
  function speak(text, btn = null, msgNode = null) {
    if (speaking) {
      speaking.via?.stop?.(); speechSynthesis.cancel();
      const was = speaking; speaking = null;
      if (was.btn) was.btn.textContent = '🔊';
      was.node?.classList.remove('speaking');
      if (!btn || was.btn === btn) return false;
    }
    const via = hooks.speak.at(-1);
    const plain = via?.text ? via.text(text) : String(text || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[#*_`>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = Number(store.get('chat.readRate', 1)) || 1;
    const voice = store.get('chat.readVoice', '');
    if (voice) u.voice = speechSynthesis.getVoices().find((x) => x.name === voice) || null;
    const node = msgNode || btn?.closest('.msg');
    const me = { btn, node };
    node?.classList.add('speaking');
    u.onend = () => { node?.classList.remove('speaking'); if (speaking === me) { speaking = null; if (btn) btn.textContent = '🔊'; } };
    speaking = me;
    if (btn) btn.textContent = '⏹';
    if (via?.say?.(plain, u.onend)) { me.via = via; return true; } // (round 23) read by voice.js (a system voice)
    speechSynthesis.speak(u);
    return true;
  }
  // Reads message #index of the open chat aloud, highlighting it while it reads.
  function speakMessage(agentId, index) {
    const m = chats.get(H.activeChat[agentId])?.messages[index];
    if (!m) return false;
    stopSpeaking();
    return speak(m.text, null, views.get(agentId)?.list.querySelector(`.msg[data-index="${index}"]`));
  }
  function stopSpeaking() { if (!speaking) return false; speaking.via?.stop?.(); speechSynthesis.cancel(); if (speaking.btn) speaking.btn.textContent = '🔊'; speaking.node?.classList.remove('speaking'); speaking = null; return true; }

  async function togglePin(chatId) {
    const chat = await loadChat(chatId);
    if (!chat) return;
    chat.pinned = !chat.pinned;
    remember(chat);
    if (H.activeChat[chat.agentId] === chatId) render(chat.agentId, { keepScroll: true });
  }

  async function renameCurrent(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat) return;
    const title = await Modal.prompt('Rename chat', { value: chat.title });
    if (title) rename(chat.id, title);
  }

  async function setChatModel(agentId, model) {
    const chat = chats.get(H.activeChat[agentId]);
    const v = views.get(agentId);
    if (!chat) { v.pendingModel = model; toast(model ? `This new chat will use ${model}` : 'Using the agent\'s default model', { timeout: 1600 }); return; }
    chat.model = model || undefined;
    remember(chat);
    toast(model ? `This chat now uses ${model}` : 'This chat uses the agent\'s default model', { timeout: 1600 });
  }

  // Copies a chat to another native agent; the next message sends the history along as context.
  async function continueWith(chatId, targetId) {
    const chat = await loadChat(chatId);
    const from = H.agent(chat.agentId);
    const now = Date.now();
    const copy = {
      id: `${targetId}-${now.toString(36)}`, agentId: targetId, title: chat.title, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: from?.name || chat.agentId, contextFrom: chat.id,
      messages: chat.messages.filter((m) => m.role !== 'error').map(({ role, text, at }) => ({ role, text, at })),
    };
    chats.set(copy.id, copy);
    remember(copy);
    open(targetId, copy.id);
  }

  function open(agentId, chatId) {
    if (drafts.delete(agentId)) setTimeout(() => Panel.render(), 0);
    const changed = H.activeChat[agentId] !== chatId;
    H.activeChat[agentId] = chatId;
    activate(agentId);
    render(agentId);
    if (changed) enterAnim(agentId);
    Panel.highlight();
  }
  // a chat you switch to slides into place (polish.css .chat-enter)
  function enterAnim(agentId) {
    const list = views.get(agentId)?.list;
    if (!list) return;
    // restart it without forcing a layout of the chat you're leaving (that was a full layout of a long chat per switch)
    const running = list.getAnimations().find((a) => a.animationName === 'hx-chat');
    if (running) { running.currentTime = 0; running.play(); return; }
    if (list.classList.contains('chat-enter')) return; // waiting for its end already (/motion off: none comes)
    list.classList.add('chat-enter');
    // (round 36, motionpolish) its own end only: a message's entrance ending inside it bubbled up and cut the slide short
    const end = (e) => { if (e.target !== list) return; list.removeEventListener('animationend', end); list.removeEventListener('animationcancel', end); list.classList.remove('chat-enter'); };
    list.addEventListener('animationend', end); list.addEventListener('animationcancel', end);
  }

  // A blank chat (＋) isn't saved until its first message, but it shows in the chats list right away as "New chat"
  // (Panel reads isDraft); opening another chat drops it, the first message turns it into the real one.
  const drafts = new Set();
  const isDraft = (agentId) => drafts.has(agentId) && !H.activeChat[agentId];
  function newChat(agentId) {
    drafts.add(agentId);
    H.activeChat[agentId] = null;
    const v = views.get(agentId);
    if (v) v.input.value = '';
    render(agentId);
    enterAnim(agentId);
    Panel.render();
    focus(agentId);
    for (const fn of hooks.newChat) { try { fn(agentId); } catch (err) { console.warn(err); } }
  }

  // (round 38, inputlatency) the chat box is always in view: focusing it needn't lay the page out to scroll it there
  // (switching chats focused it inside the click, a layout of the chat each time)
  function focus(agentId) { views.get(agentId)?.input.focus({ preventScroll: true }); }

  function setDraft(agentId, text) {
    const v = views.get(agentId);
    if (!v) return;
    v.input.value = text;
    autosize(v.input);
    updateCounter(v);
    v.input.focus();
    v.input.setSelectionRange(text.length, text.length);
  }

  async function rename(chatId, title) {
    const chat = await loadChat(chatId);
    if (!chat || !title.trim()) return;
    chat.title = title.trim().slice(0, 80);
    remember(chat);
    if (H.activeChat[chat.agentId] === chatId) render(chat.agentId, { keepScroll: true });
  }

  async function remove(chatId) {
    const summary = H.chats.find((c) => c.id === chatId);
    if (pending.has(chatId)) window.hub.stop(chatId);
    await window.hub.deleteChat(chatId);
    chats.delete(chatId);
    H.chats = H.chats.filter((c) => c.id !== chatId);
    if (summary && H.activeChat[summary.agentId] === chatId) newChat(summary.agentId);
    Panel.render();
    toast(`Deleted "${summary?.title || 'chat'}"`, { action: { label: 'Undo', fn: async () => { await window.hub.restoreChat(chatId); H.chats = await window.hub.listChats(); Panel.render(); } } });
  }

  // A note in the chat from the hub itself (command output, help): shown, never sent, not saved.
  // actions: optional buttons [{ label, run, title? }] under the note. Returns the note element.
  function note(agentId, text, { actions = [], id, quiet } = {}) {
    const v = views.get(agentId);
    if (!v) { toast(text, { timeout: 8000 }); return null; }
    if (id) v.list.querySelector(`.msg.note[data-note-id="${id}"]`)?.remove(); // a newer note of the same kind replaces the old one
    // (round 10) …for good: a replaced note no longer comes back when the chat redraws
    if (id) for (const n of v.notes || []) if (n.box.dataset.noteId === id) n.box.dataset.gone = '1';
    const body = el('div', { class: 'body', html: renderMarkdown(text) });
    const box = el('div', { class: 'msg note', dataset: { ...(id ? { noteId: id } : {}), ...((quiet ?? QUIET_NOTES.has(id)) ? { quiet: '1' } : {}) } }, body,
      actions.length ? el('div', { class: 'note-acts' }, actions.map((a) => el('button', { type: 'button', class: 'ghost small', text: a.label, title: a.title || '', on: { click: () => { a.run(box); restack(agentId); } } }))) : null,
      el('button', { type: 'button', class: 'ghost note-x', text: '×', title: 'Dismiss (Esc in an empty box clears every note)', on: { click: () => { box.dataset.gone = '1'; box.remove(); restack(agentId); } } }));
    // notes belong to the chat they were shown in and survive re-renders until dismissed
    v.notes = (v.notes || []).filter((n) => !n.box.dataset.gone).slice(-30);
    v.notes.push({ box, chatId: H.activeChat[agentId] || null });
    v.list.append(box);
    restack(agentId);
    v.list.scrollTop = v.list.scrollHeight;
    return box;
  }
  function clearNotes(agentId) {
    const v = views.get(agentId);
    if (!v) return;
    v.list.querySelectorAll('.msg.note').forEach((n) => n.remove());
    v.notes = (v.notes || []).filter((n) => n.chatId !== (H.activeChat[agentId] || null));
    restack(agentId);
  }
  // (round 40, chatcalm) the quiet lines that come by themselves under a reply (the cache note, 🗜 Continue lighter,
  // what Smart learned): when two or more apply they fold into one line: their first words, their buttons (still one
  // click), ▸ to read them all. Errors, offline lines, your commands' output and your hooks' notes never fold.
  const QUIET_NOTES = new Set(['cachewise', 'autocompact', 'routerlearn']);
  const firstWords = (n) => { const t = (n.querySelector(':scope > .body')?.textContent || '').trim().split('\n')[0]; const s = t.split(/(?<=[.:;?!])\s/)[0].replace(/[.:;]$/, ''); return s.length > 56 ? `${s.slice(0, 55)}…` : s; };
  function restack(agentId) {
    const v = views.get(agentId);
    if (!v) return;
    const quiet = [...v.list.querySelectorAll(':scope > .msg.note[data-quiet]')].filter((n) => !n.dataset.gone);
    let row = v.noteStack;
    if (quiet.length < 2) {
      if (row?.isConnected) row.remove();
      for (const n of quiet) if (n.classList.contains('stacked')) n.classList.remove('stacked');
      if (!quiet.length) v.stackOpen = false;
      return;
    }
    const open = Boolean(v.stackOpen);
    const acts = open ? [] : quiet.flatMap((n) => [...n.querySelectorAll(':scope > .note-acts > button')]);
    const titles = quiet.map(firstWords);
    const sig = JSON.stringify([open, titles, acts.map((b) => b.textContent)]);
    if (!row || row.dataset.sig !== sig) {
      row ||= v.noteStack = el('div', { class: 'note-stack' });
      row.dataset.sig = sig;
      row.replaceChildren(
        el('button', { type: 'button', class: 'ns-toggle', title: open ? 'Fold these notes into one line' : 'Show each note', attrs: { 'aria-expanded': String(open) },
          on: { click: () => { v.stackOpen = !v.stackOpen; restack(agentId); } } },
        el('span', { class: 'ns-n', text: `${open ? '▾' : '▸'} ${quiet.length} notes` }), el('span', { class: 'ns-t', text: titles.join(' · ') })),
        ...acts.map((b) => el('button', { type: 'button', class: 'ghost small ns-act', text: b.textContent, title: b.title, on: { click: () => { b.click(); restack(agentId); } } })));
    }
    if (row.nextElementSibling !== quiet[0]) quiet[0].before(row);
    for (const n of quiet) if (n.classList.contains('stacked') === open) n.classList.toggle('stacked', !open);
  }

  // ---------- for astra.js (collaborations, handoff, per-chat engine options) ----------
  const chatOf = (agentId) => chats.get(H.activeChat[agentId]) || null;
  // The chat on screen for this agent, created (like a first message would) when there is none yet.
  function ensureChat(agentId, title) {
    let chat = chatOf(agentId);
    if (chat) return chat;
    const now = Date.now();
    const v = views.get(agentId);
    chat = { id: `${agentId}-${now.toString(36)}`, agentId, title: titleFrom(title || 'New chat'), createdAt: now, updatedAt: now, session: {}, messages: [], model: v?.pendingModel || undefined };
    if (v) v.pendingModel = undefined;
    chats.set(chat.id, chat);
    H.activeChat[agentId] = chat.id;
    return chat;
  }
  function adopt(chat, { show = true } = {}) {
    chats.set(chat.id, chat);
    remember(chat);
    if (show) open(chat.agentId, chat.id);
  }

  window.hub.onEngineEvent(onEvent);

  // The chat as data, for chat-*.js and chat commands.
  const current = (agentId) => chats.get(H.activeChat[agentId]) || null;
  function stopReply(agentId) {
    const id = H.activeChat[agentId];
    if (id && pending.has(id)) { window.hub.stop(id); return true; }
    const other = pendingFor(agentId);
    if (other) { window.hub.stop(other); return true; }
    return false;
  }
  // Adds an existing chat object (imported / duplicated) and opens it.
  function adopt(chat, { openIt = true } = {}) {
    chats.set(chat.id, chat);
    remember(chat);
    if (openIt) open(chat.agentId, chat.id);
    return chat;
  }

  return { showEarlier, isDraft,
    chatOf, ensureChat, adopt, save: remember, loadChat, partnerOf, rememberFacts, forgetFacts,
    takeAttachments: (agentId) => packAttachments(agentId, ''),
    secondOpinion,
    isAgentBusy: (agentId) => Boolean(pendingFor(agentId)),
    hasView: (agentId) => views.has(agentId),
    // other files refresh after changing something messages draw from: every message is drawn again (see nodeFor)
    mount, refresh: (agentId, opts = {}) => { gen += 1; return render(agentId, opts); }, focus, send, open, newChat, rename, remove, togglePin, setDraft, continueWith, copyLastReply, foldAll,
    attachPaths: async (agentId, paths) => { for (const p of paths) await addPath(agentId, p); },
    isBusy: (chatId) => pending.has(chatId),
    note,
    compact: (agentId) => compactChat(agentId), // the token meter's one-click compact
    sendText: (agentId, text) => send(agentId, text).catch((err) => toast(err.message, { type: 'error' })),
    markdownOf: async (chatId) => chatMarkdown(await loadChat(chatId)),
    // additive API for chat-*.js / chat commands
    hooks, current, view: (agentId) => views.get(agentId) || null, load: loadChat, save: remember, adopt,
    compact: compactChat, summarizeAndContinue, branch: branchFrom, edit: editMessage, retry: regenerate, quote,
    secondOpinion, review: (agentId) => send(agentId, REVIEW_PROMPT), chatMarkdown, stats: chatStats, speak, speakMessage, stopSpeaking, isSpeaking: () => Boolean(speaking), plainText, modelMenu, toggleRaw,
    setModel: setChatModel, renameCurrent, stop: stopReply, pendingFor, renderQueue, insertDraft, setStyle, renderStyle,
    toggleThinking, jumpTo, react, toggleMark, REACTIONS, messageMenu, chatMenu, chatMenuItems, lastReplyText, dayLabel,
    MODEL_CHOICES, astraAgent, screenshotFor, addFiles, addPath, pickFiles: async (agentId) => {
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files' });
      for (const p of paths || []) await addPath(agentId, p);
      return (paths || []).length;
    },
    unreadFrom, rememberFacts, forgetFacts, fmt, clearNotes,
    // (round 9) a card in a reply that is still streaming (chat-things.js); null when no reply runs in that chat
    repaint: (chatId) => schedulePaint(chatId), // (round 21) chat-live.js: its panel opened / changed
    liveCard(chatId, node) { const p = pending.get(chatId); if (!p) return null; p.cards.push(node); repaintPending(chatId); return node; },
    toolLabel, renderChips,
    // (round 35, streamrender) for dev/checks/streamrender.js: tricky Markdown streamed in random pieces through the
    // live renderer into a real (detached) reply body; after every piece its HTML must equal a full render
    _test: {
      streamCorpus({ docs = [], runs = 4, seed = 35 } = {}) {
        let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const diffs = []; let steps = 0; sizing = false;
        try {
        for (const [k, doc] of docs.entries()) {
          for (let r = 0; r < runs; r++) {
            const p = { md: null }; const body = el('div', { class: 'body' });
            for (let at = 0; at < doc.length && diffs.length < 10;) {
              at = Math.min(doc.length, at + 1 + Math.floor(rnd() * (r % 2 ? 4 : 40)));
              const text = doc.slice(0, at);
              paintBody(p, body, text); steps += 1;
              const t = document.createElement('template'); t.innerHTML = window.renderMarkdownLive(text);
              const want = t.innerHTML; // (as the browser writes it back: disabled="", ' for &#39; …)
              if (body.innerHTML !== want) { diffs.push(`doc ${k} run ${r} at ${at}: ${JSON.stringify(text.slice(-60))}`); break; }
            }
          }
        }
        } finally { sizing = true; }
        return { docs: docs.length, runs, steps, diffs };
      },
      paintBody: (p, body, text) => paintBody(p, body, text), // (dev/checks/streamrender.js times it against the old way)
      // the live reply of a chat painted now with all its text; its HTML and the text it shows
      livePaint(chatId) { const p = pending.get(chatId); if (!p?.el) return null; const text = visibleText(p.text); paintBody(p, p.el.querySelector('.body'), text); return { html: p.el.querySelector('.body').innerHTML, text }; },
    },
    // (round 10, sync.js) a chat that arrived from another computer: read again from disk next time (not mid-reply)
    forget: (chatId) => { if (pending.has(chatId)) return false; chats.delete(chatId); return true; },
    // (round 16, dev/checks/chatperf.js) a text streamed in pieces of `step` characters, painted like a live reply: its HTML
    _streamHTML(text, step = 12) { const p = {}; const body = document.createElement('div'); for (let i = step; i < text.length + step; i += step) paintBody(p, body, text.slice(0, i).trim()); return body.innerHTML; },
  };
})();
