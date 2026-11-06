// /scene and /scene-timeline (round 139, room139): the chat side of a director chat's own scene and of the scene's
// timeline, once part of chat-scenes.js. Both load the Lab before they do anything, so they wait in a lazy group
// ('scenecmds', a calm moment after the start); their stand-ins sit at chat-scenes.js's place in the "/" menu, /help and
// the Commands page. They read chat-scenes.js's links through ChatScenes (its _cmd helpers for the private ones).
const SceneCmds = (() => {
  const { identity, linkOf, ownerOf, link, unlink, linkGuest, isLabChat } = ChatScenes;
  const { lab, freshScene, draftSketch, titleOf, threeAgent } = ChatScenes._cmd;
  // ---------- /scene ----------
  // The director chat a command talks about: the one it was typed in, or the docked Three Director's open chat.
  function chatFor(ctx) {
    const a = H.agent(ctx.agentId);
    if (a?.dock === 'three') return { agent: a, chatId: H.activeChat[a.id] || null };
    // (round 72) a plain chat with the Lab's tools: its own (guest) link
    if (a && (a.threeTools || isLabChat(H.activeChat[a.id]))) return { agent: a, chatId: H.activeChat[a.id] || null, guest: true };
    const t = threeAgent();
    return t ? { agent: t, chatId: H.activeChat[t.id] || null } : { agent: null, chatId: null };
  }
  if (!Commands.get('scene')) {
    Commands.register({
      name: 'scene', area: 'Three.js Lab', args: '[link | new | unlink]',
      desc: 'This director chat\'s own scene: show which sketch it owns · link the open one · a fresh one · unlink',
      keywords: 'chat sketch per chat own scene which',
      examples: ['/scene', '/scene link', '/scene new'],
      complete: () => [{ value: 'link', hint: 'the open sketch becomes this chat\'s scene' }, { value: 'new', hint: 'a fresh starter scene for this chat' }, { value: 'unlink', hint: 'this chat lets go of its scene (the sketch stays)' }],
      run: async (args, ctx) => {
        const { agent, chatId, guest } = chatFor(ctx);
        if (!agent) return 'Per-chat scenes are for the Three Director: /director-setup docks one in the Lab.';
        await window.Lazy?.load?.('lab'); // (round 94, labload94) the Lab may not be in yet
        await ThreeLab.cmd({ show: false });
        for (let i = 0; i < 50 && !lab(); i += 1) await new Promise((r) => setTimeout(r, 100));
        const S = lab();
        if (!S) return 'The Lab did not load.';
        const sub = String(args || '').trim().toLowerCase();
        const name = (id) => `"${S.get(id)?.name}"`;
        // (round 72, labbridge72) a plain chat: link / new / unlink its guest link (the 🔗 chip over its chat box does the same by click)
        if (guest) {
          if (!chatId) return 'Send a first message in this chat, then link it to a scene (the 🔗 chip over the chat box).';
          if (sub === 'new') { const sk = freshScene(chatId); linkGuest(chatId, sk.id); return `This chat works on a fresh scene now: ${name(sk.id)} (open it from the 🔗 chip).`; }
          if (sub === 'link') { linkGuest(chatId, S.currentId()); return `This chat works on ${name(S.currentId())} now (the scene open in the Lab).`; }
          if (sub === 'unlink') { if (!linkOf(chatId)) return 'This chat has no scene.'; const was = name(linkOf(chatId)); unlink(chatId); return `This chat let go of ${was} (the scene stays in Your sketches).`; }
          if (sub) return 'Use /scene, /scene link, /scene new or /scene unlink.';
          const sk = linkOf(chatId);
          return sk ? `🔗 This chat works on **${S.get(sk).name}** · ${S.currentId() === sk ? 'on screen' : 'not on screen (its calls run backstage)'}${ownerOf(sk) && ownerOf(sk) !== chatId ? ` · it's also the scene of the chat "${titleOf(ownerOf(sk))}"` : ''}` : 'This chat isn\'t linked to a scene: /scene link (the one open in the Lab), /scene new, or the 🔗 chip over the chat box.';
        }
        if (sub === 'new') {
          if (!chatId) { S.open(draftSketch().id); return 'A fresh scene is open: it becomes this chat\'s when you send your first message.'; }
          const sk = freshScene(chatId);
          link(chatId, sk.id, { rename: false });
          ChatScenes.data().links[chatId].auto = sk.name; // (the links object is replaced when the other computer's arrive)
          S.open(sk.id);
          return `This chat has a fresh scene: ${name(sk.id)}.`;
        }
        if (!chatId) return 'This is a new chat: the scene on screen becomes its scene when you send your first message.';
        if (sub === 'link') {
          const cur = S.currentId();
          const was = ownerOf(cur);
          link(chatId, cur, { rename: false });
          return `${name(cur)} is this chat's scene now${was && was !== chatId ? ` (the chat "${titleOf(was)}" let go of it: it gets its own scene when you use it)` : ''}.`;
        }
        if (sub === 'unlink') {
          const sk = linkOf(chatId);
          if (!sk) return 'This chat has no scene yet.';
          unlink(chatId);
          return `This chat let go of ${name(sk)} (the sketch stays in Your sketches). Its next message makes the sketch on screen its scene.`;
        }
        if (sub) return 'Use /scene, /scene link, /scene new or /scene unlink.';
        const sk = linkOf(chatId);
        const id = identity(chatId);
        if (!sk) return `${id.glyph} This chat (${id.colorName}) has no scene yet: the sketch on screen becomes its scene when you send a message here. /scene link links it now, /scene new makes a fresh one.`;
        const x = S.get(sk);
        const song = S.songOf(sk)?.split(/[\\/]/).pop();
        const onScreen = S.currentId() === sk;
        const own = !song && S.timelineOf?.(sk);
        return `${id.glyph} **${x.name}** is this chat's scene (${id.colorName}) · ${S.layersOf(x).length} layer${S.layersOf(x).length === 1 ? '' : 's'} · ${S.frameOf(sk) || 'fit'}${song ? ` · ♪ ${song}` : own ? ` · ⏱ its own timeline, ${own.len} s (/scene-timeline)` : ''} · ${onScreen ? 'on screen' : 'not on screen (the director works on it backstage)'}`;
      },
    });
  }

  // ---------- /scene-timeline: the scene's one clock (round 10, orb) ----------
  // The scene on screen's timeline: its song, else its own (length, frame-exact). Every keyframe, cue and the
  // sequence sit on it. No new buttons: the timeline's name opens its length menu; this is the chat side.
  if (!Commands.get('scene-timeline')) {
    const fmtS = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    Commands.register({
      name: 'scene-timeline', area: 'Three.js Lab', args: '[length <s> | go <time|f120> | play | pause | snap]',
      desc: 'The scene\'s timeline (its song, else its own, no song needed): what is on it · its length · go to a time or frame · play / pause · snap keyframes and cues to the song\'s bars',
      keywords: 'scene timeline clock length seconds frames keyframes no song orb',
      examples: ['/scene-timeline', '/scene-timeline length 20', '/scene-timeline go f120', '/scene-timeline snap'],
      complete: (a) => [{ value: 'length 10', hint: 'seconds (no song)' }, { value: 'length 20', hint: 'seconds (no song)' }, { value: 'go 0', hint: 'a time (s, m:ss) or a frame (f120)' }, { value: 'play' }, { value: 'pause' }, { value: 'snap', hint: 'keyframes and cues to the song\'s bars' }].filter((x) => x.value.startsWith(String(a || '').trim().toLowerCase().split(' ')[0] || '')),
      run: async (args) => {
        await window.Lazy?.load?.('lab');
        const c = await ThreeLab.cmd({ show: false });
        for (let i = 0; i < 50 && !lab(); i += 1) await new Promise((r) => setTimeout(r, 100));
        const S = lab(); const d = ThreeLab.director;
        if (!S || !d) return 'The Lab did not load.';
        const P = c.player || d.media;
        const id = S.currentId();
        const [sub, ...rest] = String(args || '').trim().split(/\s+/);
        const v = rest.join(' ');
        const verb = (sub || '').toLowerCase();
        if (verb === 'length') {
          const n = Number.parseFloat(v);
          if (!(n >= 1 && n <= 600)) return 'A length in seconds, 1 to 600: /scene-timeline length 20';
          if (S.songOf(id)) return `This scene plays on its song (${S.songOf(id).split(/[\\/]/).pop()}): its timeline is the song. Its own timeline comes back when you take the song out.`;
          S.setTimeline(id, { ...(S.timelineOf(id) || { fps: 30 }), len: n });
          return `⏱ The scene's timeline is ${n} s now (its keyframes stay where they are).`;
        }
        if (!P.loaded) d.ensureTimeline();
        if (verb === 'go') {
          const f = /^f(\d+)$/i.exec(v) || /^(\d+)f$/i.exec(v);
          const fps = P.clock?.fps || 30;
          const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(v);
          const t = f ? Number(f[1]) / fps : m ? Number(m[1]) * 60 + Number(m[2]) : Number.parseFloat(v);
          if (!Number.isFinite(t)) return 'Go where? A time (4.5, 0:04.5) or a frame (f120).';
          P.seek(t);
          return `⏱ ${fmtS(P.time)}${P.clock ? ` · f${P.clock.frame}` : ''}`;
        }
        if (verb === 'play' || verb === 'pause') { P.toggle(verb === 'play'); return verb === 'play' ? '▶ Playing the scene\'s timeline' : '⏸ Paused'; }
        if (verb === 'snap') {
          const r = d.snapToBars();
          return r ? `✦ ${r.keys} keyframes and ${r.cues} cues on the song's ${r.unit}s (/undo-… : the toast's Undo, or Ctrl+Z for the cues)` : 'No song with bars on this scene: snapping needs one (🎵 loads a song; keyframes keep their seconds).';
        }
        if (verb) return 'Use /scene-timeline, /scene-timeline length <s>, go <time|f120>, play, pause or snap.';
        const tl = d.timeline();
        const keys = (tl.layers || []).reduce((n, L) => n + Object.values(L.keyframes || {}).reduce((m, ks) => m + ks.length, 0), 0);
        const seq = typeof ThreeSeq !== 'undefined' ? ThreeSeq.summaryFor?.(id) : null;
        const song = S.songOf(id);
        const own = P.clock;
        return `⏱ **${S.get(id)?.name}** · ${song ? `on its song ${song.split(/[\\/]/).pop()} (${fmtS(tl.duration)}, ${Math.round(tl.grid?.bpm || 0)} BPM)` : own ? `its own timeline: ${tl.duration} s at ${own.fps} fps, frame ${own.frame} of ${own.frames} (no song: nothing reacts to music)` : 'no timeline yet'} · ${keys} keyframe${keys === 1 ? '' : 's'} · ${tl.cues?.length || 0} cue${tl.cues?.length === 1 ? '' : 's'}${seq ? ` · ▤ its sequence: ${seq.clips} clip${seq.clips === 1 ? '' : 's'}, ${seq.seconds.toFixed(1)} s` : ''}`;
      },
    });
  }
  return { chatFor };
})();
