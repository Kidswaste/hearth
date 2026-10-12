// Projects (round 23): chat commands and wiring. Everything Home and the menus do is here as a command too:
//   /project new <name> · add [chat | scene | board | <path>] [to <project>] · remove … · open <project> · continue
//   rename <project> = <name> · status <active|paused|done|archived> · note <text> · suggest [n] · group on|off
//   filter <project> | off · delete <project> · list        /projects · /home [project] · /everything <words>
// Wiring: the chats list (Panel.hooks: skip, top, view, menu), makes (a make with rooms is a project), chat-scenes
// (a project chat's scene joins it: the 'hearth:scene-link' event), captures and renders made while a project is in
// front of you, Ctrl/⌘+Shift+K (renderer.js handleShortcut), the palette, the keys sheet.
(() => {
  const P = Projects;
  const C = ProjectsCore;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const VERBS = { new: 'a new project (this chat comes along)', add: 'this chat / scene / board / a path', remove: 'take something out', open: 'its page on Home', continue: 'where you left off', rename: 'a new name', status: 'active, paused, done, archived', note: 'add a line to its notes', suggest: 'projects found by names and links', group: 'group the chats list by project (on / off)', filter: 'only one project\'s chats', delete: 'forget the grouping (things stay)', list: 'every project' };
  const lineOf = (p, i) => `${i != null ? `${i + 1}. ` : ''}${p.ident.glyph} **${p.name}** · ${C.countText(p)}${p.status !== 'active' ? ` · ${C.STATUS[p.status].toLowerCase()}` : ''}`;
  // "<what> to <project>" / "<what> from <project>"
  const split = (s, word) => { const m = new RegExp(`^(.*?)\\s+${word}\\s+(.+)$`, 'i').exec(s); return m ? [m[1].trim(), m[2].trim()] : [s.trim(), '']; };
  let lastSugg = [];

  // what "this" is: the chat the command came from, the scene on screen, the board on screen, a path
  async function thing(what, ctx) {
    const w = String(what || '').trim();
    const chatId = ctx.chatId || P.hereChat();
    if (!w || /^(this|this chat|chat|here)$/i.test(w)) return chatId && H.chats.find((c) => c.id === chatId) ? { type: 'chat', ref: chatId, name: H.chats.find((c) => c.id === chatId).title } : null;
    if (/^(the )?scene$|^sketch$/i.test(w)) { const s = P.currentScene() || (typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf(chatId) : null); return s ? { type: 'scene', ref: s, name: '' } : null; }
    if (/^(the )?board$/i.test(w)) { const b = P.currentBoard(); return b ? { type: 'board', ref: b, name: '' } : null; }
    if (/^(the )?(last )?render$/i.test(w)) { const r = (await P.Src.renders()).find((j) => j.output && j.status === 'done'); return r ? { type: 'render', ref: r.id, name: r.title || base(r.output) } : null; }
    if (/^https?:\/\//i.test(w)) return { type: 'deploy', ref: w, name: w };
    if (/[\\/]/.test(w)) return { type: 'file', ref: w.replace(/^["']|["']$/g, ''), name: base(w) };
    // a chat by its title
    const c = H.chats.find((x) => x.title.toLowerCase() === w.toLowerCase()) || H.chats.find((x) => x.title.toLowerCase().includes(w.toLowerCase()));
    return c ? { type: 'chat', ref: c.id, name: c.title } : null;
  }

  function register() {
    if (!Commands.get('project')) {
      Commands.register({
        name: 'project', area: 'Projects', args: '[new <name> | add [chat|scene|board|<path>] [to <project>] | open <project> | continue | rename … | status … | note … | suggest | group on|off | filter <project>]',
        desc: 'Projects: a home for a piece of work (its chats, Lab scenes, boards, renders, files). new · add this chat / the scene / the board · open its page · continue where you left off · suggest (no tokens) · rename · status · notes',
        keywords: 'project projects group folder home workspace collection organise organize stoop',
        examples: ['/project new Stoop Ronin', '/project add', '/project add scene to Stoop Ronin', '/project continue', '/project suggest', '/project status done'],
        complete: (a) => {
          const s = String(a || '');
          if (!/\s/.test(s)) return Object.keys(VERBS).filter((v) => v.startsWith(s.toLowerCase())).map((v) => ({ value: `${v} `, hint: VERBS[v] }));
          const verb = s.split(/\s+/)[0].toLowerCase();
          if (['open', 'continue', 'delete', 'filter', 'rename'].includes(verb)) return P.live().slice(0, 10).map((p) => ({ value: `${verb} ${p.name}${verb === 'rename' ? ' = ' : ''}`, hint: C.countText(p) }));
          if (verb === 'add' || verb === 'remove') return ['chat', 'scene', 'board', 'render'].map((w) => ({ value: `${verb} ${w}`, hint: w === 'chat' ? 'this chat (with its scene)' : `the ${w} on screen` }));
          if (verb === 'status') return Object.keys(C.STATUS).map((k) => ({ value: `status ${k}` }));
          if (verb === 'group') return ['on', 'off'].map((v) => ({ value: `group ${v}` }));
          return [];
        },
        run: async (args, ctx) => {
          await P.ready();
          const s = String(args || '').trim();
          const [verb0, ...rest] = s.split(/\s+/);
          const verb = (verb0 || '').toLowerCase();
          const restText = rest.join(' ').trim();
          const hereP = () => P.projectOfChat(ctx.chatId) || P.here();
          if (!verb) {
            const p = hereP();
            if (ctx.source !== 'code') P.openHome(p?.id || null);
            return p ? lineOf(p) : P.live().length ? 'Home shows your projects (/project new <name> makes one).' : 'No projects yet: /project new <name> makes one with this chat in it, /project suggest finds some.';
          }
          if (verb === 'new') {
            const p = P.create({ name: restText });
            const t = await thing('', ctx);
            if (t) P.add(p, t.type, t.ref, t.name);
            return `${p.ident.glyph} **${p.name}** is a project${t ? ` with this chat${C.counts(p).scene ? ' and its scene' : ''} in it` : ''}. Home shows it; /project add puts more in it.`;
          }
          if (verb === 'add' || verb === 'remove') {
            const [what, pname] = split(restText, verb === 'add' ? 'to' : 'from');
            const p = pname ? P.find(pname) : hereP() || (verb === 'add' ? P.live()[0] : null);
            if (!p) return pname ? `No project “${pname}” (/project list).` : 'Which project? /project add <what> to <project> (or /project new <name>).';
            const t = await thing(what, ctx);
            if (!t) return `Nothing to ${verb}: say chat, scene, board, render or a path.`;
            if (verb === 'remove') return P.remove(p, t.type, t.ref) ? `Took ${C.TYPES[t.type].label.toLowerCase()} “${t.name || base(t.ref)}” out of ${p.name}.` : `It isn't in ${p.name}.`;
            const n = P.add(p, t.type, t.ref, t.name);
            return n ? `Added ${C.TYPES[t.type].label.toLowerCase()} “${C.cap(t.name || base(t.ref), 50)}”${n > 1 ? ' (and its scene)' : ''} to ${p.ident.glyph} ${p.name}.` : `It's already in ${p.name}.`;
          }
          if (verb === 'open') { const p = P.find(restText) || hereP(); if (!p) return 'Which project?'; if (ctx.source !== 'code') P.openHome(p.id); return lineOf(p); }
          if (verb === 'continue') { const p = P.find(restText) || hereP() || P.live()[0]; if (!p) return 'No projects yet.'; const x = await P.continueIn(p); return x ? `Back in ${p.name}: ${C.TYPES[x.type].label.toLowerCase()} “${P.nameOf(x)}”.` : `${p.name} is empty: its page is open.`; }
          if (verb === 'rename') {
            const [a, b] = restText.split(/\s*=\s*/);
            const p = b != null ? P.find(a) : hereP();
            const nm = (b ?? a ?? '').trim();
            if (!p || !nm) return 'Rename which project? /project rename <project> = <new name> (in its chat: /project rename <new name>)';
            const was = p.name;
            P.rename(p, nm);
            return `“${was}” is “${p.name}” now.`;
          }
          if (verb === 'status') {
            const st = (rest[0] || '').toLowerCase();
            if (!C.STATUS[st]) return `/project status ${Object.keys(C.STATUS).join(' | ')} [project]`;
            const p = P.find(rest.slice(1).join(' ')) || hereP();
            if (!p) return 'Which project?';
            P.setStatus(p, st);
            return `${p.name}: ${C.STATUS[st].toLowerCase()}.`;
          }
          if (verb === 'note' || verb === 'notes') {
            const p = hereP();
            if (!p) return 'Open a project\'s chat (or its page) first, or use its page on Home.';
            if (!restText) { if (ctx.source !== 'code') P.notesPrompt(p); return p.notes ? `Notes of ${p.name}:\n${p.notes}` : `${p.name} has no notes yet.`; }
            P.setNotes(p, `${p.notes ? `${p.notes}\n` : ''}${restText}`);
            return `Noted in ${p.name}.`;
          }
          if (verb === 'suggest') {
            const k = Number.parseInt(rest[0], 10);
            if (k && lastSugg[k - 1]) { const p = P.acceptSuggestion(lastSugg[k - 1]); lastSugg = []; return `${p.ident.glyph} **${p.name}** is a project: ${C.countText(p)}.`; }
            lastSugg = await P.suggestions(5);
            if (!lastSugg.length) return 'No suggestions: nothing shares a name (or a link) with enough other things yet.';
            return `${lastSugg.map((x, i) => `${i + 1}. ${x.why}`).join('\n')}\n/project suggest <n> makes one a project.`;
          }
          if (verb === 'group') { const on = !/^(off|no|0|false)$/i.test(rest[0] || ''); P.setGrouping(on); return on ? 'The chats list groups chats by project.' : 'The chats list groups chats by agent only.'; }
          if (verb === 'filter') { if (/^(off|all|none)?$/i.test(restText)) { Panel.setView(null); return 'Showing every chat.'; } const p = P.find(restText); if (!p) return 'Which project?'; Panel.setView(`project:${p.id}`); return `Showing only ${p.name}'s chats (/project filter off).`; }
          if (verb === 'delete') { const p = P.find(restText); if (!p) return 'Which project? /project delete <project>'; P.removeProject(p); return `Deleted the project “${p.name}” (its chats, scenes and files stay).`; }
          if (verb === 'list') return P.live().length ? P.live().slice(0, 15).map(lineOf).join('\n') : 'No projects yet.';
          return `Use /project ${Object.keys(VERBS).join(' | ')}.`;
        },
      });
    }
    if (!Commands.get('projects')) {
      Commands.register({ name: 'projects', area: 'Projects', args: '', desc: 'Every project (Home shows them as cards with covers)', keywords: 'list projects home',
        run: async (args, ctx) => { await P.ready(); if (ctx.source !== 'code') P.openHome(); return P.live().length ? P.live().slice(0, 15).map(lineOf).join('\n') : 'No projects yet: /project new <name>, or /project suggest.'; } });
    }
    if (!Commands.get('home')) {
      Commands.register({ name: 'home', area: 'Projects', args: '[project]', desc: 'Home: your projects as cards, continue where you left off, search everything (/home <project>: its page)', keywords: 'start dashboard overview recent projects',
        complete: (a) => P.live().filter((p) => p.name.toLowerCase().startsWith(String(a || '').toLowerCase())).slice(0, 8).map((p) => ({ value: p.name, hint: C.countText(p) })),
        run: async (args) => { await P.ready(); const p = String(args || '').trim() ? P.find(args) : null; await P.openHome(p?.id || null); return null; } });
    }
    if (!Commands.get('everything')) {
      Commands.register({ name: 'everything', aliases: Commands.get('search-all') ? [] : ['search-all'], area: 'Projects', args: '<words>', keys: 'Ctrl+Shift+K',
        desc: 'Search everything: projects, chats (and their messages), Lab scenes (names, code, sliders), boards (items, captions), renders, files, commands. Start with scene: / chat: / board: / file: to keep one kind',
        keywords: 'search find everywhere all global lookup scenes boards renders files',
        examples: ['/everything stoop ronin', '/everything scene: bloom', '/everything board: neon'],
        run: async (args, ctx) => {
          const q = String(args || '').trim();
          if (ctx.source !== 'code') { ProjectsSearch.open(q); return null; }
          if (!q) return 'What should I look for?';
          const { hits } = await ProjectsSearch.find(q);
          const ms = await ProjectsSearch.messages(q);
          const lines = [...hits.slice(0, 12), ...ms.slice(0, 4)].map((d) => `${C.TYPES[d.type]?.icon || (d.type === 'command' ? '/' : '▣')} ${d.title}${d.sub ? ` · ${C.cap(d.sub, 60)}` : ''}`);
          return lines.length ? lines.join('\n') : 'Nothing matches.';
        } });
    }
  }

  // ---------- wiring ----------
  window.addEventListener('DOMContentLoaded', () => {
    register();
    Panel.hooks.skip?.push(P.panelSkip);
    Panel.hooks.top?.push(P.panelTop);
    Panel.hooks.view?.push(P.panelView);
    Panel.hooks.menu?.push(P.panelMenu);
    // a chat's right-click menu in the chats list: "Project ›" (the chat, with its scene)
    Panel.hooks.itemMenu?.push((item) => (item.chatId ? [P.projectMenu('chat', item.chatId, item.title)] : []));
    addEventListener('hearth:scene-link', (e) => P.sceneLinked(e.detail?.chatId, e.detail?.sketchId));
    document.addEventListener('hearth:capture', (e) => { if (e.detail?.path) P.madeHere('capture', e.detail.path); });
    document.addEventListener('hearth:recording', (e) => { if (e.detail && e.detail.recording === false && e.detail.path) P.madeHere('capture', e.detail.path); });
    if (window.Lazy) window.Lazy.when('renders', () => Renders.onChange((j) => { try { P.onRenderJob(j); } catch (err) { console.warn(err); } }));
    Keys.add([
      { area: 'Projects', keys: 'Ctrl+Shift+K', what: 'Search everything: projects, chats, scenes, boards, renders, files, commands (Tab: one kind)', run: () => ProjectsSearch.open() },
      { area: 'Projects', keys: 'Right-click a project', what: 'In the chats list (or ⋯ on its row) and on Home: its page, continue, only its chats, add, rename, status, look, notes' },
    ]);
    try {
      AppUI.addAction?.('Home: your projects', () => P.openHome());
      AppUI.addAction?.('Search everything…', () => ProjectsSearch.open(), 'Ctrl+Shift+K');
      AppUI.addAction?.('Projects: new project…', () => P.openHome().then(() => ProjectsHome.newProject()));
      AppUI.addAction?.('Projects: suggest projects (from names and links)', () => Commands.exec('/project suggest', H.claudeAgent()?.id));
    } catch { /* the palette is optional */ }
    P.ready().then(async () => {
      // makes with rooms are projects (and keep following their make)
      if (typeof Makes !== 'undefined') {
        await Makes.ready();
        P.syncMakes(Makes.list());
        Makes.onChange((d) => { if (d.why !== 'progress' && d.make) P.syncMakes([d.make]); });
      }
      // a project chat's scene that was linked before projects loaded
      try { for (const [chatId, l] of Object.entries(ChatScenes.data?.().links || {})) if (l?.sketch) P.sceneLinked(chatId, l.sketch); } catch { /* no scenes */ }
      Panel.render();
    });
  });
})();
