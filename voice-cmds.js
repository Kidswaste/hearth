// Voice (round 23): the chat commands. /talk listens (again: stop); /voice sets it up and tunes it.
(() => {
  const AREA = 'Voice';
  const get = (k, d) => store.get(`voice.${k}`, d);
  const set = (k, v) => store.set(`voice.${k}`, v);
  const onOff = (a, cur) => { const s = String(a || '').trim().toLowerCase(); if (/^(on|yes|true|1)$/.test(s)) return true; if (/^(off|no|false|0)$/.test(s)) return false; return !cur; };
  const pick = (list) => (args) => list.filter((x) => String(x.value || x).toLowerCase().includes(String(args || '').toLowerCase())).map((x) => (typeof x === 'string' ? { value: x } : x));
  const yes = (v) => (v ? 'on' : 'off');
  const reg = (def) => { if (Commands.get(def.name) && !def.when) console.warn(`voice: /${def.name} already exists`); else Commands.register({ area: AREA, ...def }); };

  reg({
    name: 'talk', aliases: ['dictate', 'listen'], desc: 'Listen to you: the words land in the chat box (again: stop). Hold Ctrl+Space does it too', args: '[send]',
    keys: 'Hold Ctrl+Space',
    run: async (args, ctx) => {
      const st = Voice.state().state;
      if (st === 'listening') { await Voice.finish(/^send$/i.test(args.trim()) ? { send: true } : {}); return null; }
      const started = await Voice.start({ mode: 'toggle', agentId: ctx.agentId || Voice.targetAgent() });
      return started ? `🎙 Listening… it stops when you do (or /talk again, Esc cancels).` : null;
    },
  });

  const SUBS = [
    { value: 'install', hint: 'set up local speech-to-text' }, { value: 'status' }, { value: 'words', hint: 'the voice commands' },
    { value: 'word ', hint: '<phrase> = /command' }, { value: 'try ', hint: 'act as if you said it' }, { value: 'key ', hint: 'Ctrl+Space · F8 · mouse4' },
    { value: 'send-on-release on' }, { value: 'send-on-release off' }, { value: 'replies on', hint: 'read replies to what you said' }, { value: 'replies off' },
    { value: 'commands off' }, { value: 'commands on' }, { value: 'speak system', hint: 'the system\'s own voice (say / SAPI)' }, { value: 'speak browser' },
    { value: 'voice ', hint: 'a system voice by name' }, { value: 'model ', hint: 'tiny · base · small · base.en' }, { value: 'lang ', hint: 'auto · en · fr…' },
    { value: 'mic ', hint: 'which microphone' }, { value: 'anykey off', hint: 'keys no longer stop reading' }, { value: 'silence ', hint: 'ms of quiet that ends it' },
    { value: 'path ', hint: 'whisper-cli by hand' }, { value: 'history' },
  ];
  let voicesCache = null;
  reg({
    name: 'voice', area: AREA, args: '[install | status | words | word <phrase> = /cmd | try <words> | key <keys> | send-on-release | replies | commands | speak system|browser | voice <name> | model <name> | lang <code> | mic <name> | anykey | silence <ms> | path <file> | history]',
    desc: 'Talk to chats and hear them: local speech-to-text (whisper), voice commands, push-to-talk key, read-aloud voice',
    examples: ['/voice install', '/voice try freeze', '/voice word make it pop = /shuffle', '/voice key F8', '/voice speak system'],
    keywords: 'speech dictation microphone whisper push to talk say read aloud tts stt',
    complete: (args) => {
      if (/^model\s/i.test(args)) return pick(Object.entries(VoiceCore.MODELS).map(([n, m]) => ({ value: `model ${n}`, hint: `${m.mb} MB · ${m.note}` })))(args);
      if (/^voice\s/i.test(args)) { if (!voicesCache) window.hub.voice.voices().then((v) => { voicesCache = v; }); return pick((voicesCache || []).map((v) => ({ value: `voice ${v.name}`, hint: v.lang })))(args); }
      if (/^key\s/i.test(args)) return pick(['key Ctrl+Space', 'key Alt+Space', 'key F8', 'key Ctrl+Shift+Space', 'key mouse4', 'key mouse5', 'key default'])(args);
      if (/^lang\s/i.test(args)) return pick(['lang auto', 'lang en', 'lang fr', 'lang es', 'lang de', 'lang it', 'lang pt', 'lang ja'])(args);
      return pick(SUBS)(args);
    },
    run: async (args, ctx) => {
      const a = args.trim();
      const [w0, ...rest] = a.split(/\s+/);
      const v = (w0 || 'status').toLowerCase();
      const tail = a.slice(w0?.length || 0).trim();
      if (v === 'install' || v === 'setup' || v === 'set-up') return Voice.install();
      if (v === 'status') {
        const st = await Voice.engine(true);
        return [
          st.engine ? `🎙 Speech-to-text: ${st.engine}${st.model ? ` · model ${st.model.split(/[\\/]/).pop()}` : st.engine === 'whisper.cpp' ? ' · no model yet (/voice install)' : ''}` : '🎙 No local speech-to-text yet: /voice install (until then your system\'s dictation works in the chat box)',
          `Push to talk: hold ${Voice.keyText()} (a tap listens until you stop) · ＋ › 🎙 Talk · /talk`,
          `Send when you let go: ${yes(get('sendOnRelease', false))} · read replies to what you said: ${yes(get('replyAloud', true) !== false)} · voice commands: ${yes(get('commands', true) !== false)} · reading voice: ${get('tts', 'browser') === 'system' ? `system${get('ttsVoice', '') ? ` (${get('ttsVoice', '')})` : ''}` : 'browser'} · language: ${get('lang', 'auto')}`,
        ].join('\n');
      }
      if (v === 'words') {
        const own = Object.entries(get('words', {}));
        return ['Say these (alone) and they run, no tokens spent:', ...VoiceCore.words().map((x) => `• ${x.what} → ${x.line}`), '• "director, …" / "astra, …" / "claude, …" → sent to that chat', '• "command <name> …" → /<name> …',
          ...(own.length ? ['Yours:', ...own.map(([p, l]) => `• "${p}" → ${l}`)] : ['Add your own: /voice word make it pop = /shuffle'])].join('\n');
      }
      if (v === 'word') {
        const m = tail.match(/^(.+?)\s*=\s*(\/.*)?$/);
        if (!m) return 'Usage: /voice word <what you say> = /command (nothing after = removes it)';
        const words = { ...get('words', {}) };
        const phrase = VoiceCore.clean(m[1]);
        if (!m[2]) { delete words[phrase]; set('words', words); return `Removed "${phrase}".`; }
        words[phrase] = m[2].trim(); set('words', words);
        return `Saying "${phrase}" now runs ${m[2].trim()}`;
      }
      if (v === 'try' || v === 'say') {
        if (!tail) return 'Usage: /voice try <words> (as if you had said them)';
        const r = await Voice.deliver(tail, ctx.agentId || Voice.targetAgent());
        return r.kind === 'cmd' ? `🎙 → ${r.line}` : r.kind === 'agent' ? `🎙 → ${H.agent(r.agentId)?.name || r.who}` : r.kind === 'do' ? `🎙 → ${r.what}` : null;
      }
      if (v === 'key') {
        if (!tail || /^default$/i.test(tail)) { Voice.setKey('Ctrl+Space'); return 'Push to talk: hold Ctrl+Space'; }
        const k = Voice.setKey(tail);
        return k ? `Push to talk: hold ${Voice.keyText()}` : `“${tail}” doesn't work as a key: try Ctrl+Space, Alt+Space, F8 or mouse4 (a side button). Letters need Ctrl or Alt.`;
      }
      if (v === 'send-on-release' || v === 'send') { const on = onOff(tail, get('sendOnRelease', false)); set('sendOnRelease', on); return on ? 'Push to talk now sends when you let go (voice commands still run).' : 'Your words land in the chat box to edit before sending.'; }
      if (v === 'replies' || v === 'read') { const on = onOff(tail, get('replyAloud', true) !== false); set('replyAloud', on); return on ? 'Replies to what you said are read aloud (any key stops).' : 'Replies are no longer read aloud after you speak.'; }
      if (v === 'commands') { const on = onOff(tail, get('commands', true) !== false); set('commands', on); return on ? 'Voice commands on: /voice words lists them.' : 'Voice commands off: everything you say is text.'; }
      if (v === 'anykey') { const on = onOff(tail, get('anyKeyStops', true) !== false); set('anyKeyStops', on); return on ? 'Any key stops reading aloud.' : 'Only Esc / Alt+R / ⏹ stop reading aloud.'; }
      if (v === 'speak' || v === 'tts') {
        const sys = /^system$/i.test(tail) ? true : /^browser$/i.test(tail) ? false : get('tts', 'browser') !== 'system';
        set('tts', sys ? 'system' : 'browser');
        return sys ? `Replies are read with the system's own voice${Voice.PLATFORM === 'darwin' ? ' (say)' : Voice.PLATFORM === 'win32' ? ' (Windows voices)' : ''}. /voice voice <name> picks one.` : 'Replies are read with the built-in voice (/read voice <name> picks one).';
      }
      if (v === 'voice') {
        if (!tail) { set('ttsVoice', ''); return 'The system\'s default voice.'; }
        const all = voicesCache || (voicesCache = await window.hub.voice.voices());
        const hit = all.find((x) => x.name.toLowerCase() === tail.toLowerCase()) || all.find((x) => x.name.toLowerCase().includes(tail.toLowerCase()));
        if (!hit && all.length) return `No system voice called “${tail}”.`;
        set('ttsVoice', hit?.name || tail); set('tts', 'system');
        return `System voice: ${hit?.name || tail}`;
      }
      if (v === 'model') {
        const name = (rest[0] || '').toLowerCase();
        if (!VoiceCore.MODELS[name]) return `Models: ${Object.entries(VoiceCore.MODELS).map(([n, m]) => `${n} (${m.mb} MB)`).join(' · ')}`;
        set('model', name);
        const st = await Voice.engine(true);
        if (st.engine === 'whisper.cpp' && !st.models.find((m) => m.name === name)?.have) { await Voice.offerModel(name); return null; }
        return `Speech model: ${name}`;
      }
      if (v === 'lang' || v === 'language') { const l = (rest[0] || 'auto').toLowerCase(); if (l !== 'auto' && !/^[a-z]{2}$/.test(l)) return 'A two-letter language code (en, fr, es…) or auto.'; set('lang', l); return `Speech language: ${l}`; }
      if (v === 'silence') { const ms = Math.min(4000, Math.max(400, Number(rest[0]) || 1100)); set('silence', ms); return `An utterance ends after ${ms} ms of quiet.`; }
      if (v === 'path') { set('whisperPath', tail); await Voice.engine(true); return tail ? `whisper-cli: ${tail}` : 'whisper-cli is looked for on its own again.'; }
      if (v === 'model-file') { set('modelPath', tail); await Voice.engine(true); return tail ? `Speech model file: ${tail}` : 'The speech model is looked for in the data folder again.'; }
      if (v === 'mic') {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        if (!tail || /^default$/i.test(tail)) { set('device', ''); return `The default microphone.${devs.length ? ` Others: ${devs.map((d) => d.label || d.deviceId.slice(0, 6)).join(' · ')}` : ''}`; }
        const d = devs.find((x) => (x.label || '').toLowerCase().includes(tail.toLowerCase()));
        if (!d) return `No microphone matching “${tail}”${devs.length ? `: ${devs.map((x) => x.label).filter(Boolean).join(' · ')}` : ''}`;
        set('device', d.deviceId); return `Microphone: ${d.label}`;
      }
      if (v === 'history') { const h = Voice.history(); return h.length ? h.map((x) => `• ${new Date(x.at).toLocaleTimeString()} ${x.text}`).join('\n') : 'Nothing said yet.'; }
      if (v === 'on' || v === 'listen' || v === 'talk') return Commands.tryRun('/talk', ctx.agentId);
      if (v === 'off' || v === 'stop') { await Voice.finish(); return null; }
      if (v === 'cancel') { Voice.cancel(); return null; }
      return `Unknown: /voice ${v} (try /voice status)`;
    },
  });
})();
