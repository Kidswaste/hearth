// Voice (round 23) in the app, with a stubbed microphone (an oscillator stream: its pitch picks dev/fake-whisper.js's
// canned words) and whisper-cli = dev/fake-whisper.js (HEARTH_WHISPER, set by dev/run-checks.js): ＋ › 🎙 Talk, hold
// Ctrl+Space → live waveform → let go → the words in the chat box; /talk hands-free ended by silence (voice activity
// detection) → "Freeze." runs /freeze (no tokens); "Director, make it pinker." goes to the Three Director; send on
// release → the reply is read aloud (speechSynthesis stubbed) without its code; any key stops reading.
//   HEARTH_WHISPER=$PWD/dev/fake-whisper.js HEARTH_WHISPER_MODEL=$PWD/dev/fake-whisper.js node dev/smoke.js --fake-engines --script dev/checks/voice.js --shot /tmp/voice.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const A = H.claudeAgent();
await wait(1200);
activate(A.id); await wait(300);
await Lazy.load('voice');
ok(typeof Voice !== 'undefined' && Commands.get('talk') && Commands.get('voice'), 'the voice group loads with /talk and /voice');

// ---------- stubs: the microphone (an oscillator), speech synthesis, the commands run ----------
const ac = new AudioContext(); await ac.resume().catch(() => {});
const osc = ac.createOscillator(); const gain = ac.createGain();
osc.connect(gain); osc.start(); gain.gain.value = 0;
const say = (hz) => { osc.frequency.value = hz; gain.gain.value = 0.6; };
const hush = () => { gain.gain.value = 0; };
let micAsks = 0;
// a fresh stream each time, like the real one (voice.js stops the tracks when it's done)
navigator.mediaDevices.getUserMedia = async () => { micAsks += 1; const d = ac.createMediaStreamDestination(); gain.connect(d); return d.stream; };
const spoken = [];
speechSynthesis.speak = (u) => { spoken.push(u.text); setTimeout(() => u.onend?.(), 4000); };
speechSynthesis.cancel = () => {};
const ran = [];
const realTry = Commands.tryRun;
Commands.tryRun = (line, ...rest) => { ran.push(String(line)); return realTry(line, ...rest); };
const sentTo = [];
const realSend = Native.sendText;
const v = Native.view(A.id);
const st = () => Voice.state().state;

// ---------- ＋ › 🎙 Talk ----------
v.root.querySelector('.attach-btn').click();
const talkRow = await until(() => [...document.querySelectorAll('#menu button')].find((b) => /Talk/.test(b.textContent)), 3000);
ok(talkRow, '＋ menu has 🎙 Talk');
out.talkHint = talkRow?.querySelector('.menu-hint')?.textContent;
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
document.body.click(); await wait(150);

// ---------- hold Ctrl+Space, speak, let go → the words in the chat box ----------
Native.setDraft(A.id, '');
v.input.focus();
say(300);
window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }));
ok(await until(() => st() === 'listening', 5000), `push to talk listens (${st()})`);
const pill = document.querySelector('.voice-pill');
ok(pill && pill.querySelector('canvas.voice-wave'), 'the pill with its waveform shows');
await wait(1300);
const cv = document.querySelector('.voice-pill canvas');
const px = cv ? cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data : [];
let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit += 1;
ok(lit > 50, `the waveform draws (${lit} px)`);
ok(Voice.state().heard, 'voice activity detected');
window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
hush();
ok(await until(() => st() === 'off', 10000), `transcribed (${st()})`);
out.composer = v.input.value;
ok(/Make the particles drift slower, please\./.test(v.input.value), `the words land in the chat box (${v.input.value})`);
ok(!ran.length, 'an ordinary sentence runs no command');
ok(!document.querySelector('.voice-pill'), 'the pill goes');

// ---------- /talk hands-free: silence ends it; "Freeze." runs /freeze ----------
Native.setDraft(A.id, '');
say(500);
await realTry('/talk', A.id);
ok(await until(() => st() === 'listening', 5000), '/talk listens');
await wait(1000); hush();
ok(await until(() => st() === 'off', 12000), `silence ends it (${st()})`);
ok(await until(() => ran.includes('/freeze'), 8000), `"Freeze." runs /freeze (${ran.join(', ')})`);
ok(!v.input.value.trim(), 'a voice command leaves the chat box empty');
out.history = Voice.history().map((h) => h.text);

// ---------- "Director, make it pinker." → the Three Director (sending recorded) ----------
const dir = { id: 'voicedirector', name: 'Three Director', icon: '◆', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, enabled: true };
H.config.agents.push(dir);
const hasDir = H.agents().some((a) => a.id === dir.id);
Native.sendText = async (agentId, text) => { sentTo.push({ agentId, text }); };
say(700);
window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }));
await until(() => st() === 'listening', 5000); await wait(1000);
window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', bubbles: true, cancelable: true }));
hush();
await until(() => st() === 'off', 10000);
await until(() => sentTo.length, 8000);
out.director = { hasDir, sentTo: sentTo.slice(), target: Voice.targetAgent(), active: H.activeId, toasts: [...document.querySelectorAll('#toasts .toast span')].map((t) => t.textContent).slice(-4), hist: Voice.history().length };
if (hasDir) ok(sentTo[0]?.agentId === dir.id && sentTo[0]?.text === 'Make it pinker.', `"Director, …" goes to the director (${JSON.stringify(sentTo)})`);
else ok(/Make it pinker/.test(v.input.value), 'no director: the words land in the box');
H.config.agents.splice(H.config.agents.indexOf(dir), 1);
Native.sendText = realSend;
Native.setDraft(A.id, '');

// ---------- /voice try: next scene → /look next ----------
ran.length = 0;
let said = '';
await realTry('/voice try next scene', A.id, null, { say: (t) => { said = String(t); } });
ok(ran.includes('/look next'), `"next scene" → /look next (${ran.join(', ')})`);
await realTry('/voice words', A.id, null, { say: (t) => { said = String(t); } });
ok(/freeze/.test(said) && /director/.test(said), 'the words list');
await realTry('/voice status', A.id, null, { say: (t) => { said = String(t); } });
out.status = said.split('\n')[0];
ok(/whisper\.cpp/.test(said), `status sees the (fake) whisper-cli (${out.status})`);

// ---------- send on release → the reply is read aloud, without code; any key stops ----------
store.set('voice.sendOnRelease', true);
const before = Native.current?.(A.id)?.messages?.length || 0;
say(300);
window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true, cancelable: true }));
await until(() => st() === 'listening', 5000); await wait(1000);
window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
hush();
ok(await until(() => spoken.length, 20000), 'the reply to what you said is read aloud');
out.spoken = spoken.slice(0, 2).map((s) => s.slice(0, 120));
const chat = Native.current?.(A.id);
ok(!chat || chat.messages.length > before, 'the words were sent');
store.set('voice.sendOnRelease', false);
ok(Native.isSpeaking(), 'reading');
document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
ok(!Native.isSpeaking(), 'any key stops reading');
spoken.length = 0;
Native.speak('Here it is:\n```js\nconst secret = 1;\nconst b = 2;\nrun(secret);\n```\nAll **done**, see [the docs](https://example.com).');
ok(spoken[0] && !/secret|```|\*\*|https/.test(spoken[0]) && /code skipped/.test(spoken[0]) && /the docs/.test(spoken[0]), `read aloud skips code (${spoken[0]})`);
Native.stopSpeaking();

// ---------- the key can change ----------
await realTry('/voice key F8', A.id, null, { say: (t) => { said = String(t); } });
ok(Voice.state().key === 'F8', 'the key changes');
await realTry('/voice key default', A.id, null, { say: () => {} });
ok(Voice.state().key === 'Ctrl+Space', 'and back');

// leave it listening for the screenshot
say(300);
await realTry('/talk', A.id);
await until(() => st() === 'listening', 4000); await wait(700);
out.micAsks = micAsks;
Commands.tryRun = realTry;
return JSON.stringify({ ok: !problems.length, problems, ...out }, null, 1);
