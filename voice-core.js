// Voice (round 23): the pure parts of talking to chats, shared by the renderer (voice.js) and the Node tests
// (dev/voice-test.js): voice commands (a transcript that starts with a command word runs a command, no tokens), the
// push-to-talk key (combo text ⇄ events), voice activity detection (when an utterance ends), 16 kHz resampling and the
// WAV the speech-to-text tool reads, whisper.cpp's output lines, and the text a reply is read aloud with (no code).
const VoiceCore = (() => {
  // ---------- voice commands ----------
  // [pattern on the cleaned transcript, command line (or a { do } for an in-app action), what it does]
  // Only short transcripts (≤ 6 words) are matched, so "save the world in your next reply" stays a message.
  const WORDS = [
    [/^(un ?freeze|unfreeze|resume|keep going|go on)( it| the (frame|picture))?$/, '/freeze off', 'unfreeze the Lab picture'],
    [/^freeze( it| (the )?(frame|picture))?$/, '/freeze', 'freeze the Lab picture'],
    [/^freeze on (the )?(next )?(beat|bar|kick)$/, (m) => `/freeze ${m[3]}`, 'freeze exactly on the next beat / bar'],
    [/^(next|one) frame$/, '/next-frame', 'one frame forward'],
    [/^save( it| (the )?(sliders?|this|that|look))?$/, '/save-sliders', 'save the slider values into the code'],
    [/^next (scene|look)$/, '/look next', 'the next saved look'],
    [/^(previous|prev|last|back) (scene|look)$/, '/look prev', 'the previous saved look'],
    [/^random (scene|look)$/, '/look random', 'a random saved look'],
    [/^shuffle( it| (the )?(sliders|colou?rs))?$/, (m) => (/colou?r/.test(m[0]) ? '/shuffle Colors' : '/shuffle'), 'shuffle the sliders'],
    [/^(un ?shuffle|undo (the )?shuffle)$/, '/unshuffle', 'take the shuffle back'],
    [/^(play|play (the )?(song|music))$/, '/play', 'play the song'],
    [/^(pause|pause (the )?(song|music))$/, '/pause', 'pause the song'],
    [/^present( it)?$/, '/present', 'present the preview fullscreen'],
    [/^(tap|beat)$/, '/tap', 'a tap-tempo tap'],
    [/^(stop|stop (talking|reading|it)|quiet|shush|be quiet|silence|enough)$/, { do: 'hush' }, 'stop reading aloud'],
    [/^(send|send it)$/, { do: 'send' }, 'send what is in the chat box'],
    [/^(clear|clear (it|that|the box)|scratch that|never ?mind)$/, { do: 'clear' }, 'empty the chat box'],
    [/^(read (it|that)( again)?|read the (last )?(reply|answer))$/, '/read last', 'read the last reply aloud'],
    [/^new chat$/, { do: 'new' }, 'a new chat'],
  ];
  // "director, make it pinker" → the Three Director; "astra, …" → Astra; "claude, …" → Claude (the rest is sent)
  const WHO = [[/^(hey |ok |okay )?(the )?(three )?director[,:.!]?\s+/i, 'director'], [/^(hey |ok |okay )?astra[,:.!]?\s+/i, 'astra'], [/^(hey |ok |okay )?claude[,:.!]?\s+/i, 'claude']];
  const clean = (t) => String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s/-]+/gu, ' ').replace(/^\s*(hey|ok|okay|um+|uh+|so|please)\s+/, '').replace(/\s+(please|now|thanks|thank you)\s*$/, '').replace(/\s+/g, ' ').trim();
  // { kind: 'cmd', line } · { kind: 'do', what } · { kind: 'agent', who, text } · null (an ordinary message)
  // own: the owner's own words ({ phrase: '/command line' }, /voice word …) come first; has(name): the command exists
  function route(transcript, { own = {}, has = () => true } = {}) {
    const raw = String(transcript || '').trim();
    if (!raw) return null;
    for (const [re, who] of WHO) {
      const m = raw.match(re);
      if (m && raw.length > m[0].length) {
        const text = raw.slice(m[0].length).trim();
        const inner = route(text, { own, has }); // "director, freeze" runs /freeze (no tokens) instead of asking
        if (inner && inner.kind !== 'agent') return inner;
        return { kind: 'agent', who, text: text.charAt(0).toUpperCase() + text.slice(1) };
      }
    }
    const c = clean(raw);
    if (!c) return null;
    for (const [phrase, line] of Object.entries(own || {})) if (clean(phrase) === c && line) return { kind: 'cmd', line: String(line) };
    // "command freeze bar" / "slash size 9 16" → /freeze bar, /size 9 16 when such a command exists
    const said = c.match(/^(command|slash)\s+([a-z0-9][\w-]*)(?:\s+(.*))?$/);
    if (said && has(said[2])) return { kind: 'cmd', line: `/${said[2]}${said[3] ? ` ${said[3]}` : ''}` };
    if (c.split(' ').length > 6) return null;
    for (const [re, line] of WORDS) {
      const m = c.match(re);
      if (!m) continue;
      if (line && typeof line === 'object') return { kind: 'do', what: line.do };
      const l = typeof line === 'function' ? line(m) : line;
      if (has(l.slice(1).split(' ')[0])) return { kind: 'cmd', line: l };
    }
    return null;
  }
  const words = () => WORDS.map(([re, line, what]) => ({ say: re.source.replace(/^\^|\$$/g, '').replace(/\\s\+|\s\+/g, ' ').slice(0, 60), line: typeof line === 'string' ? line : typeof line === 'function' ? '(depends)' : `(${line.do})`, what }));

  // ---------- the push-to-talk key ----------
  // "Ctrl+Space", "Alt+Space", "F8", "Ctrl+Shift+V", "mouse4" / "mouse5" (the side buttons) → { mods, code, button }
  const CODE = { space: 'Space', enter: 'Enter', tab: 'Tab', backquote: 'Backquote', '`': 'Backquote' };
  function parseCombo(text) {
    const t = String(text || '').trim();
    const mouse = t.match(/^mouse\s*([3-5])$/i);
    if (mouse) return { mods: { ctrl: false, alt: false, shift: false }, code: null, button: Number(mouse[1]) - 1, text: `mouse${mouse[1]}` };
    const parts = t.split('+').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const mods = { ctrl: false, alt: false, shift: false };
    for (const p of parts.slice(0, -1)) {
      const k = p.toLowerCase();
      if (/^(ctrl|control|cmd|command|⌘|⌃)$/.test(k)) mods.ctrl = true;
      else if (/^(alt|option|opt|⌥)$/.test(k)) mods.alt = true;
      else if (/^(shift|⇧)$/.test(k)) mods.shift = true;
      else return null;
    }
    const last = parts.at(-1);
    const l = last.toLowerCase();
    let code = CODE[l] || (/^f([1-9]|1[0-9]|2[0-4])$/i.test(last) ? last.toUpperCase() : /^[a-z]$/i.test(last) ? `Key${last.toUpperCase()}` : /^[0-9]$/.test(last) ? `Digit${last}` : null);
    if (!code) return null;
    // a bare letter / digit / Space would type: it needs a modifier (function keys are fine alone)
    if (!mods.ctrl && !mods.alt && !/^F\d/.test(code)) return null;
    const name = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code;
    return { mods, code, button: null, text: [mods.ctrl && 'Ctrl', mods.alt && 'Alt', mods.shift && 'Shift', name].filter(Boolean).join('+') };
  }
  // Does a keydown / pointerdown event press the combo? (ctrlKey is also ⌘ on a Mac: ui.js maps it)
  function matches(combo, e) {
    if (!combo || !e) return false;
    if (combo.button != null) return e.button === combo.button && e.type !== 'keydown';
    return e.code === combo.code && Boolean(e.ctrlKey || e.metaKey) === combo.mods.ctrl && Boolean(e.altKey) === combo.mods.alt && Boolean(e.shiftKey) === combo.mods.shift;
  }
  // Does a keyup let go of it (the key itself or one of its modifiers)?
  function releases(combo, e) {
    if (!combo || combo.button != null || !e) return false;
    if (e.code === combo.code) return true;
    return (combo.mods.ctrl && /^(Control|Meta)/.test(e.code || e.key)) || (combo.mods.alt && /^Alt/.test(e.code || e.key)) || (combo.mods.shift && /^Shift/.test(e.code || e.key));
  }

  // ---------- voice activity detection ----------
  // Feed it the loudness of each short chunk; it learns the room's noise floor and says when speech started and when an
  // utterance ended (silenceMs of quiet after at least minSpeechMs of speech). Nothing heard for idleMs: 'idle'.
  function vad({ silenceMs = 1100, minSpeechMs = 180, idleMs = 8000, maxMs = 60000, margin = 2.6, floorDb = -62 } = {}) {
    let floor = 0.003; let t = 0; let speechMs = 0; let quietMs = 0; let speaking = false; let heard = false; let first = -1; let lastLoud = -1;
    return {
      // rms of a chunk lasting ms → null | 'start' | 'end' | 'idle' | 'max'
      feed(rms, ms) {
        t += ms;
        const loudEnough = rms > Math.max(floor * margin, 10 ** (floorDb / 20));
        if (!loudEnough) floor = floor * 0.95 + rms * 0.05; // the floor follows the quiet parts only
        else floor = Math.min(floor * 1.002, 0.05);
        if (loudEnough) { speechMs += ms; quietMs = 0; lastLoud = t; if (first < 0) first = t - ms; } else { quietMs += ms; if (!speaking) speechMs = Math.max(0, speechMs - ms / 2); }
        if (!speaking && speechMs >= minSpeechMs) { speaking = true; heard = true; return 'start'; }
        if (speaking && quietMs >= silenceMs) { speaking = false; speechMs = 0; return 'end'; }
        if (!heard && t >= idleMs) return 'idle';
        if (t >= maxMs) return 'max';
        return null;
      },
      state: () => ({ speaking, heard, ms: t, floor, first, lastLoud }),
    };
  }
  const rms = (buf) => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return buf.length ? Math.sqrt(s / buf.length) : 0; };

  // ---------- audio → the WAV whisper reads (16 kHz mono 16-bit) ----------
  function resample(input, from, to = 16000) {
    if (from === to) return Float32Array.from(input);
    const n = Math.floor(input.length * to / from);
    const out = new Float32Array(n);
    const step = from / to;
    for (let i = 0; i < n; i++) {
      const x = i * step; const j = Math.floor(x); const f = x - j;
      // a light box average when shrinking a lot (48 k → 16 k), so high hiss doesn't fold down
      if (step >= 2) { let s = 0; const k = Math.min(input.length, j + Math.floor(step)); for (let q = j; q < k; q++) s += input[q]; out[i] = s / Math.max(1, k - j); } else out[i] = (input[j] || 0) * (1 - f) + (input[j + 1] || 0) * f;
    }
    return out;
  }
  // Keep from a little before the first speech to a little after the last (whisper is faster on less silence).
  function trim(samples, rate, firstMs, lastMs, padMs = 300) {
    if (firstMs < 0) return samples;
    const a = Math.max(0, Math.floor((firstMs - padMs) * rate / 1000));
    const b = Math.min(samples.length, Math.ceil((lastMs + padMs) * rate / 1000));
    return b > a ? samples.subarray(a, b) : samples;
  }
  function wav(samples, rate = 16000) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Uint8Array(buf);
  }

  // ---------- whisper output ----------
  // "[00:00:00.000 --> 00:00:02.000]   Hello there." → "Hello there." (also plain lines; drops [BLANK_AUDIO], (music)…)
  function segmentText(line) {
    const t = String(line || '').replace(/^\s*\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, '').trim();
    if (!t || /^\[(BLANK_AUDIO|MUSIC|SILENCE|NO SPEECH)[^\]]*\]$/i.test(t) || /^\((music|silence|inaudible|applause)\)$/i.test(t) || /^whisper_|^main:|^system_info|^output_/.test(t)) return '';
    return t.replace(/\[(BLANK_AUDIO|MUSIC)\]/gi, '').trim();
  }
  const joinText = (parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();

  // ---------- reading replies aloud ----------
  // What is worth hearing: code blocks are skipped (one short mention), tables become "a table", links read their
  // words, inline code reads plainly, Markdown marks and emoji-ish symbols are dropped, bare URLs say "a link".
  function speakable(text) {
    let t = String(text || '');
    t = t.replace(/```[\s\S]*?(```|$)/g, (m) => (m.split('\n').length > 3 ? ' (code skipped) ' : ' (code) '));
    t = t.replace(/(^|\n)\s*\|.*\|\s*(?=\n|$)(\n\s*\|.*\|\s*(?=\n|$))+/g, ' (a table) ');
    t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, ' (a picture) ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    t = t.replace(/https?:\/\/\S+/g, ' a link ').replace(/`([^`]+)`/g, '$1');
    t = t.replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*>\s?/gm, '');
    t = t.replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~\n]+?)\1/g, '$2').replace(/[#*_`>|~]/g, '');
    t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
    return t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').replace(/ *\n */g, '\n').trim();
  }
  // Long replies are read in sentences-sized pieces (system voices stall on very long input; stop works between them).
  function chunks(text, max = 600) {
    const out = []; let cur = '';
    for (const s of String(text).split(/(?<=[.!?])\s+|\n+/)) {
      if (!s.trim()) continue;
      if ((cur + ' ' + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
      if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max)); continue; }
      cur += ` ${s}`;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // ---------- local speech-to-text: models ----------
  const MODELS = {
    tiny: { file: 'ggml-tiny.bin', mb: 75, note: 'fastest, rougher' },
    base: { file: 'ggml-base.bin', mb: 142, note: 'the default: quick and good' },
    small: { file: 'ggml-small.bin', mb: 466, note: 'better accuracy, slower' },
    'base.en': { file: 'ggml-base.en.bin', mb: 142, note: 'English only, a bit better in English' },
    'small.en': { file: 'ggml-small.en.bin', mb: 466, note: 'English only' },
  };
  const modelUrl = (name) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODELS[name]?.file || MODELS.base.file}`;
  // The exact steps for each system (shown by /voice install; Hearth never runs an installer itself)
  function installSteps(platform) {
    if (platform === 'darwin') return [
      'Install Homebrew if you don\'t have it: https://brew.sh',
      'In Terminal: brew install whisper-cpp',
      'Back in Hearth: /voice install again (it finds whisper-cli and offers the speech model download)',
      'Or, with Python: pip3 install faster-whisper (Hearth finds it too)',
    ];
    if (platform === 'win32') return [
      'Download whisper-bin-x64.zip from https://github.com/ggml-org/whisper.cpp/releases (latest release, Assets)',
      'Unzip it to C:\\whisper (so C:\\whisper\\Release\\whisper-cli.exe exists)',
      'Back in Hearth: /voice install again (it finds it and offers the speech model download), or /voice path <whisper-cli.exe>',
      'Or, with Python: py -m pip install faster-whisper (Hearth finds it too)',
    ];
    return ['Build whisper.cpp (https://github.com/ggml-org/whisper.cpp) and put whisper-cli on your PATH, or pip install faster-whisper', 'Then /voice install again'];
  }
  // Without local speech-to-text: the system's own dictation types into the focused chat box
  function dictationHint(platform) {
    if (platform === 'darwin') return 'Mac dictation: press Fn twice (or the 🎤 key) with the chat box focused; turn it on in System Settings › Keyboard › Dictation.';
    if (platform === 'win32') return 'Windows voice typing: press Win+H with the chat box focused.';
    return 'Use your system\'s dictation with the chat box focused.';
  }

  return { route, words, clean, WORDS, parseCombo, matches, releases, vad, rms, resample, trim, wav, segmentText, joinText, speakable, chunks, MODELS, modelUrl, installSteps, dictationHint };
})();
if (typeof module !== 'undefined') module.exports = VoiceCore;
