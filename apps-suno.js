// Suno (round 14, apps stream): its web app in its own window (sign in there; Suno has no public API, so Hearth
// never pretends to call one), songs downloaded there go straight to the Lab's song loader (or Video Review / the
// board), and a chat helper writes the prompt: /suno prompt reads the scene's vibe (the Lab sketch's name, layers and
// palette, the board's moods, your words) and writes Suno's style tags + a lyrics / structure sheet, locally (no
// tokens). One click pastes it into Suno's boxes; "✍ Lyrics by …" asks this chat's agent for real lyrics, and
// /suno paste reply pastes its answer. /suno use loads the newest Suno download as the Lab's song.
const AppsSuno = (() => {
  const C = AppsCore;
  const api = () => window.hub?.apps || null;
  const LAST = 'suno.last';

  // ---------- the vibe of what's on screen ----------
  async function vibe(words = '') {
    const out = { text: String(words || ''), words: [], palette: [], name: '', instrumental: !/\b(vocals?|lyrics|sing|singer|song about)\b/i.test(words) };
    try {
      const S = ThreeLab.scenes;
      const cur = S?.get?.(S.currentId?.());
      if (cur) {
        out.name = cur.name || '';
        out.palette = (cur.palette || []).slice(0, 5);
        out.words.push(...(cur.layers || []).map((L) => String(L.name || '').replace(/[^\w\s-]/g, '').trim()).filter(Boolean).slice(0, 4));
      }
    } catch { /* the Lab isn't loaded */ }
    try {
      if (typeof Board !== 'undefined' && Board.current?.()) {
        const items = Board.items().slice(-12);
        const text = items.map((it) => `${it.title || ''} ${it.text || ''} ${it.note || ''} ${(it.tags || []).join(' ')} ${Board.vibeOf?.(it) || ''}`).join(' ');
        out.text = `${out.text} ${text.slice(0, 1500)}`;
        if (!out.palette.length) out.palette = items.flatMap((it) => it.colors || (it.color ? [it.color] : [])).slice(0, 5);
      }
    } catch { /* no board */ }
    return out;
  }
  async function prompt(words = '') {
    const v = await vibe(words);
    const p = C.sunoPrompt(v);
    const rec = { ...p, words: String(words || ''), at: Date.now() };
    store.set(LAST, rec);
    return rec;
  }
  const last = () => store.get(LAST, null);

  // ---------- into Suno's page ----------
  // Custom mode has Title / Style / Lyrics boxes; the simple mode one "song description" box (the style goes there).
  async function paste(p = last(), { only } = {}) {
    if (!p) throw new Error('No Suno prompt yet: /suno prompt');
    await Apps.openWindow('suno');
    const r = { };
    const put = async (field, text) => { if (!text) return null; const x = await api().paste('suno', { text, field, strict: true }); r[field] = x; return x; };
    if (!only || only === 'style') await put('style', p.style);
    if (!only || only === 'lyrics') await put('lyrics', p.lyrics);
    if (!only && p.title) await put('title', p.title);
    if (!r.style?.ok && !r.lyrics?.ok) {
      // the simple mode: one box for a description
      const x = await api().paste('suno', { text: `${p.style}${p.title ? ` — ${p.title}` : ''}`.slice(0, 480), field: 'prompt' });
      r.prompt = x;
      return x?.ok ? 'Pasted into Suno\'s song description (switch Suno to Custom for the lyrics, then /suno paste again).' : `Couldn't type into Suno (${x?.error || 'no box'}): the style is copied, paste it with ${/Mac/.test(navigator.platform) ? '⌘V' : 'Ctrl+V'}.`;
    }
    return `Pasted into Suno: ${['style', 'lyrics', 'title'].filter((f) => r[f]?.ok).join(', ')}. Press Create there.`;
  }

  // ---------- the newest Suno song → the Lab ----------
  async function newestSong() {
    const fromApps = Apps.downloads().filter((d) => d.app === 'suno' && d.state === 'completed' && /^(audio|video)$/.test(C.kindOf(d.name)));
    if (fromApps.length) return fromApps[0].path;
    const all = (await api()?.downloads('suno')) || [];
    return all.find((d) => d.state === 'completed' && /^(audio|video)$/.test(C.kindOf(d.name)))?.path || null;
  }
  async function use(target = 'lab-song') {
    const p = await newestSong();
    if (!p) throw new Error('No Suno song downloaded yet: download one in the Suno window (⋯ → Download → MP3), then /suno use.');
    await Apps.route(p, target);
    return p;
  }

  // ---------- a note with the prompt and its buttons ----------
  function noteText(p) {
    return `🎵 **Suno prompt**${p.title ? ` · ${p.title}` : ''}\n\n**Style**\n\`\`\`\n${p.style}\n\`\`\`\n**Lyrics / structure**\n\`\`\`\n${p.lyrics}\n\`\`\`${p.exclude ? `\nExclude: ${p.exclude}` : ''}`;
  }
  function actions(p, ctx) {
    const ag = H.agent?.(ctx.agentId);
    return [
      { label: '→ Paste into Suno', run: () => paste(p).then((t) => ctx.say?.(t) || toast(t, { timeout: 5000 })).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Copy style', run: () => copyText(p.style, 'Style copied') },
      { label: 'Copy lyrics', run: () => copyText(p.lyrics, 'Lyrics copied') },
      ag?.mode === 'native' ? { label: `✍ Lyrics by ${ag.name}`, run: () => askAgent(p, ctx) } : null,
    ].filter(Boolean);
  }
  // the agent writes real lyrics on request (one short message, the owner clicked for it)
  function askAgent(p, ctx) {
    const brief = [p.words, p.moods?.join(', '), p.title].filter(Boolean).join(' · ');
    const text = `Write a Suno song for this vibe: ${brief || p.style}. Reply with "Title: …", "Style: …" (comma-separated tags, under 200 characters; start from: ${p.style}) and the lyrics with Suno section tags ([Verse], [Chorus], [Bridge]…), under 1500 characters. Nothing else.`;
    if (ctx.send) ctx.send(text); else Native.send(ctx.agentId, text);
    toast('When the reply is in: /suno paste reply', { timeout: 5000 });
  }

  function commands() {
    if (typeof Commands === 'undefined' || Commands.get('suno')) return;
    Commands.register({
      name: 'suno', area: 'Apps', args: '[prompt [words]] | paste [reply|style|lyrics] | use [review|board] | open',
      desc: 'Suno in its own window; /suno prompt writes style tags and lyrics from the scene\'s vibe and pastes them in; /suno use loads your newest Suno song in the Lab',
      keywords: 'music song ai lyrics style tags soundtrack',
      examples: ['/suno', '/suno prompt dreamy night drive', '/suno paste', '/suno use'],
      complete: (a) => ['prompt', 'paste', 'paste reply', 'use', 'use review', 'use board', 'open'].filter((v) => v.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      run: async (args, ctx) => {
        const [w0 = '', ...rest] = String(args || '').trim().split(/\s+/);
        const sub = w0.toLowerCase();
        const tail = rest.join(' ');
        if (!sub || sub === 'open') { await Apps.open('suno'); return null; }
        if (sub === 'prompt' || sub === 'write') {
          const p = await prompt(tail);
          if (ctx.note) ctx.note(noteText(p), { actions: actions(p, ctx).map((a) => ({ label: a.label, run: a.run })), id: 'suno-prompt' });
          else return noteText(p);
          return null;
        }
        if (sub === 'paste') {
          if (/^reply$/i.test(tail)) {
            const text = Native.lastReplyText?.(ctx.agentId) || '';
            const s = C.splitSuno(text);
            if (!s.style && !s.lyrics) return 'The last reply has no "Style:" line or lyrics to paste.';
            const p = { ...(last() || {}), ...s, style: s.style || last()?.style || '', at: Date.now() };
            store.set(LAST, p);
            return paste(p);
          }
          return paste(last(), { only: /^(style|lyrics)$/i.test(tail) ? tail.toLowerCase() : null });
        }
        if (sub === 'use') { const target = /review|video/i.test(tail) ? 'review' : /board/i.test(tail) ? 'board' : 'lab-song'; const p = await use(target); return `Using ${p.split(/[\\/]/).pop()}${target === 'lab-song' ? ' as the Lab\'s song' : ''}.`; }
        // anything else: words for a prompt
        const p = await prompt(String(args));
        if (ctx.note) { ctx.note(noteText(p), { actions: actions(p, ctx), id: 'suno-prompt' }); return null; }
        return noteText(p);
      },
    });
  }

  Apps.register({
    id: 'suno', name: 'Suno', icon: '🎵', group: 'Sound', url: 'https://suno.com/create', hosts: ['suno.com', 'suno.ai'],
    desc: 'AI songs: /suno prompt writes the prompt from your scene, downloads become the Lab\'s song', keywords: 'music song lyrics',
    routes: { audio: 'lab-song', video: 'review' },
    actions: [
      { id: 'use', label: '♪ Use my newest Suno song in the Lab', run: async () => { const p = await use('lab-song'); return `Using ${p.split(/[\\/]/).pop()} in the Lab.`; } },
      { id: 'prompt', label: '✍ Write a prompt from the scene and paste it', run: async () => paste(await prompt('')) },
      { id: 'paste', label: 'Paste my last Suno prompt', run: () => paste(last()) },
    ],
  });
  addEventListener('DOMContentLoaded', commands);
  return { vibe, prompt, paste, use, last, newestSong };
})();
window.AppsSuno = AppsSuno;
