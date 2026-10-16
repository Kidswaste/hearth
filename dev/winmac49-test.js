#!/usr/bin/env node
// (round 49, winmac49) Keys that feel native on the owner's Mac and Windows PC, checked with simulated platforms:
//   · WinMac.keyLabel: every shortcut said each computer's way (⇧⌘K / Ctrl+Shift+K), the Mac's real-Control keys
//     (⌃Tab, ⌃Space, ⌃⌥D, ⌃⌥H), both-computers text ("Ctrl/⌘+K"), idempotent; every key line in the app, both ways
//   · the AltGr-safe shortcut table: every Ctrl+Alt shortcut against what AltGr types on AZERTY / QWERTZ / … keyboards,
//     through ui.js' own key shim run in a VM (AltGr types, the left Ctrl+Alt is the shortcut; the Mac's ⌥ in a field)
//   · letters by the letter on the key (AZERTY / QWERTZ), main's hub keys and capture keys under AltGr
//   · the OS clash tables (dev/keytables.js) against every key line, the scan's new rules at zero and catching plants
// Node only: node dev/winmac49-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const W = require('../winmac');
const KT = require('./keytables');
const { scan, scanText } = require('./winmac-scan');

const ROOT = path.join(__dirname, '..');
let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(a === b, `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- 1. one shortcut, each computer's way ----------
const TABLE = [
  // written                    the Mac                 Windows
  ['Undo (Ctrl+Z)',             'Undo (⌘Z)',            'Undo (Ctrl+Z)'],
  ['Ctrl/⌘+K',                  '⌘K',                   'Ctrl+K'],
  ['⌘/Ctrl+K',                  '⌘K',                   'Ctrl+K'],
  ['Ctrl/⌘+Shift+Z',            '⇧⌘Z',                  'Ctrl+Shift+Z'],
  ['Ctrl+Shift+U',              '⇧⌘U',                  'Ctrl+Shift+U'],
  ['⌘⇧K',                       '⇧⌘K',                  'Ctrl+Shift+K'],
  ['⇧⌘K',                       '⇧⌘K',                  'Ctrl+Shift+K'],
  ['⌥⌘I',                       '⌥⌘I',                  'Ctrl+Alt+I'],
  ['Cmd+K',                     '⌘K',                   'Ctrl+K'],
  ['Shift+Alt+drag',            '⌥⇧-drag',              'Alt+Shift+drag'],
  ['Ctrl+Tab',                  '⌃Tab',                 'Ctrl+Tab'],
  ['Ctrl+Shift+Tab',            '⌃⇧Tab',                'Ctrl+Shift+Tab'],
  ['Hold Ctrl+Space',           'Hold ⌃Space',          'Hold Ctrl+Space'],
  ['Ctrl+Alt+D',                '⌃⌥D',                  'Ctrl+Alt+D'],
  ['Ctrl+Alt+H',                '⌃⌥H',                  'Ctrl+Alt+H'],
  ['Ctrl+Alt+M',                '⌥⌘M',                  'Ctrl+Alt+M'],
  ['Ctrl/⌘+Alt+S',              '⌥⌘S',                  'Ctrl+Alt+S'],
  ['Ctrl+Alt+1…9',              '⌥⌘1…9',                'Ctrl+Alt+1…9'],
  ['Ctrl+click',                'Ctrl+click',           'Ctrl+click'],
  ['Ctrl/⌘+click picks more',   '⌘-click picks more',   'Ctrl+click picks more'],
  ['Ctrl+drag',                 '⌘-drag',               'Ctrl+drag'],
  ['Alt+scroll',                '⌥-scroll',             'Alt+scroll'],
  ['Shift+click',               '⇧-click',              'Shift+click'],
  ['Ctrl+= / Ctrl+- / Ctrl+0',  '⌘= / ⌘- / ⌘0',         'Ctrl+= / Ctrl+- / Ctrl+0'],
  ['Ctrl+\\',                   '⌘\\',                  'Ctrl+\\'],
  ['Ctrl+;',                    '⌘;',                   'Ctrl+;'],
  ['Ctrl/⌘+.',                  '⌘.',                   'Ctrl+.'],
  ['Ctrl+PgDn',                 '⌘PgDn',                'Ctrl+PgDn'],
  ['Ctrl+Shift+Enter',          '⇧⌘Enter',              'Ctrl+Shift+Enter'],
  ['Alt+F4',                    '⌥F4',                  'Alt+F4'],
  ['⌘+Z · Esc',                 '⌘Z · Esc',             'Ctrl+Z · Esc'],
  // left alone: a symbol that names nothing, both systems named on purpose, the Mac's own ⌃ on Windows, words
  ['⌘ Command palette',         '⌘ Command palette',    '⌘ Command palette'],
  ['⌘V / Ctrl+V',               '⌘V / Ctrl+V',          '⌘V / Ctrl+V'],
  ['F11 / ⌃⌘F or ⛶',            'F11 / ⌃⌘F or ⛶',       'F11 / ⌃⌘F or ⛶'],
  ['Hold Alt',                  'Hold Alt',             'Hold Alt'],
  ['Ctrl+Kick',                 'Ctrl+Kick',            'Ctrl+Kick'],
  ['Kick+Shift',                'Kick+Shift',           'Kick+Shift'],
];
for (const [x, mac, win] of TABLE) {
  eq(W.keyLabel(x, { mac: true }), mac, `the Mac says "${x}"`);
  eq(W.keyLabel(x, { mac: false }), win, `Windows says "${x}"`);
  eq(W.keyLabel(mac, { mac: true }), mac, `the Mac: "${mac}" again is the same`);
  eq(W.keyLabel(win, { mac: false }), win, `Windows: "${win}" again is the same`);
}
eq(W.keyLabel('Ctrl+W no longer closes the window; Ctrl/⌘+K finds it', { mac: true, both: true }), 'Ctrl+W no longer closes the window; ⌘K finds it', 'both: only "Ctrl/⌘" changes (patch notes name one system\'s keys on purpose)');
eq(W.keyLabel('⌘Q quits · Ctrl/⌘+Shift+G', { mac: false, both: true }), '⌘Q quits · Ctrl+Shift+G', 'both on Windows: the Mac\'s own ⌘Q stays');
eq(W.keyLabel(null), null, 'null passes'); eq(W.keyLabel(42), 42, 'a number passes');

// simulated platforms: the default follows process.platform off the window (main-side use)
// (Node's navigator.platform, as Electron's main process has it: MacIntel / Win32 / Linux x86_64)
const realNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
for (const [plat, want] of [['MacIntel', '⇧⌘K'], ['Win32', 'Ctrl+Shift+K'], ['Linux x86_64', 'Ctrl+Shift+K']]) {
  Object.defineProperty(globalThis, 'navigator', { value: { platform: plat }, configurable: true });
  eq(W.keyLabel('Ctrl+Shift+K'), want, `simulated ${plat}: default`);
}
if (realNav) Object.defineProperty(globalThis, 'navigator', realNav); else delete globalThis.navigator;

// every key line in the app (the keys sheet, commands, palette actions), both ways: no "Ctrl" on the Mac but the
// right-click, no ⌘ / ⌥ / ⇧ on Windows but a line naming both systems or the Mac's ⌃
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).concat(fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.js')).map((f) => `tools/${f}`));
const lines = [];
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/\bkeys: (?:[A-Z]+ \? '([^']*)' : )?'([^']+)'/g)) lines.push({ f, keys: m[2], macOnly: m[1] });
  for (const m of src.matchAll(/addAction\([^\n]*?, '((?:Ctrl|Alt|Shift)[^']*)'\)/g)) lines.push({ f, keys: m[1] });
}
ok(lines.length > 150, `read the app's key lines (${lines.length})`);
let macBad = 0; let winBad = 0;
for (const { f, keys, macOnly } of lines) {
  const mac = W.keyLabel(macOnly || keys, { mac: true });
  const win = W.keyLabel(keys, { mac: false });
  if (/\b(?:Ctrl|Alt|Cmd)\+(?!click\b)/.test(mac.replace(/Ctrl\+click/g, ''))) { macBad += 1; ok(false, `the Mac: "${keys}" (${f}) still says ${mac}`); }
  if (/[⌘⌥⇧]/.test(win) && !/⌃|(?:Ctrl|Alt)\+/.test(win)) { winBad += 1; ok(false, `Windows: "${keys}" (${f}) says ${win}`); }
}
ok(!macBad && !winBad, `every key line reads right on both (${lines.length} lines)`);

// ---------- 2. the OS keeps these: no key line names one ----------
for (const { f, keys } of lines) {
  if (f === 'nativefeel.js') continue; // its Window lines list the system's own keys on purpose
  for (const part of keys.split(/\s+\/\s+|\s+·\s+|,\s+|\s+or\s+/).map((k) => k.replace(/^(?:Hold|Type)\s+/, '').split(/\s+/)[0])) {
    const mac = KT.clash(part, 'mac');
    if (mac && !W.MAC_REAL_CTRL.has(KT.norm(part))) ok(false, `the Mac takes ${part} (${mac}) from ${f}`);
    const win = KT.clash(part, 'win');
    if (win) ok(false, `Windows takes ${part} (${win}) from ${f}`);
  }
}
for (const k of W.MAC_REAL_CTRL) ok(W.keyLabel(k.replace(/\b\w/g, (c) => c.toUpperCase()).replace('Esc', 'Esc'), { mac: true }).startsWith('⌃'), `the Mac shows ${k} with the real Control (⌃)`);
ok(Boolean(KT.clash('Ctrl+Q', 'mac')) && Boolean(KT.clash('Alt+Space', 'win')) && Boolean(KT.clash('Win+D', 'win')) && !KT.clash('Ctrl+K', 'mac') && !KT.clash('Ctrl+K', 'win'), 'the clash tables answer');

// ---------- 3. ui.js' own key shim, in a VM, on a simulated Mac and Windows ----------
const UI = read('ui.js');
const start = UI.indexOf('if (/Mac/.test(navigator.platform)) {'); // the Mac's ⌘ = Ctrl, then round 49's shim
const end = UI.indexOf("addEventListener('keyup', fix, true);\n}", start) + "addEventListener('keyup', fix, true);\n}".length;
ok(start > 0 && end > start, 'found ui.js\' key shim');
const SHIM = UI.slice(start, end);
// a layout map like navigator.keyboard's (AZERTY, or QWERTZ), physical code → the character on the key
const AZERTY = new Map(Object.entries({ KeyQ: 'a', KeyW: 'z', KeyA: 'q', KeyZ: 'w', Semicolon: 'm', KeyM: ',', KeyE: 'e', KeyD: 'd', KeyC: 'c', KeyO: 'o', KeyG: 'g', KeyX: 'x', KeyS: 's', KeyR: 'r', Digit0: 'à' }));
const QWERTZ = new Map(Object.entries({ KeyY: 'z', KeyZ: 'y', KeyM: 'm', KeyQ: 'q', KeyE: 'e', KeyD: 'd', KeyC: 'c', KeyO: 'o' }));
async function shim(platform, layout) {
  const listeners = {};
  const ctx = {
    WinMac: W, navigator: { platform, keyboard: { getLayoutMap: () => Promise.resolve(layout) } },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  };
  vm.runInNewContext(SHIM, ctx);
  await new Promise((r) => setImmediate(r)); // the layout map arrives
  return (type, init, target = { tagName: 'TEXTAREA' }) => {
    const e = { type, isTrusted: true, key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, target, ...init };
    for (const fn of listeners[type] || []) fn(e);
    return e;
  };
}
// what a Hearth shortcut handler would see: the shortcut fires only with Ctrl+Alt still there, on the code it reads
const fires = (e, code) => e.ctrlKey && e.altKey && e.code === code;

(async () => {
  // Windows, AZERTY
  let k = await shim('Win32', AZERTY);
  const altGr = (code, key, target) => { k('keydown', { code: 'ControlLeft', key: 'Control', ctrlKey: true }); k('keydown', { code: 'AltRight', key: 'AltGraph', ctrlKey: true, altKey: true }); const e = k('keydown', { code, key, ctrlKey: true, altKey: true }, target); k('keyup', { code: 'AltRight', key: 'AltGraph' }); return e; };
  let e = altGr('Digit0', '@');
  ok(!e.ctrlKey && !e.altKey && e.key === '@', 'Windows AZERTY: AltGr+à types @ (no Ctrl+Alt left for a shortcut)');
  e = altGr('Digit6', '|', { tagName: 'DIV' });
  ok(!e.ctrlKey && !e.altKey && e.key === '|', 'Windows AZERTY: AltGr+6 is | in the Lab too (its | key pins a frame)');
  e = altGr('Digit8', '\\', { tagName: 'DIV' });
  ok(!e.ctrlKey && e.key === '\\', 'Windows AZERTY: AltGr+8 is \\ (the Lab\'s freeze key), not Ctrl+\\');
  e = altGr('Digit2', 'Dead');
  ok(!e.ctrlKey && !e.altKey, 'Windows AZERTY: AltGr+é (the ~ dead key) types');
  e = k('keydown', { code: 'Semicolon', key: 'm', ctrlKey: true, altKey: true });
  ok(fires(e, 'KeyM'), 'Windows AZERTY: the left Ctrl+Alt+M (M is where QWERTY has ;) is the "next model" shortcut, on code KeyM');
  e = k('keydown', { code: 'KeyM', key: ',', ctrlKey: true });
  eq(e.code, 'Comma', 'Windows AZERTY: the key that says "," reads Comma (not M)');
  e = k('keydown', { code: 'KeyQ', key: 'a', ctrlKey: true, shiftKey: true });
  eq(e.code, 'KeyA', 'Windows AZERTY: Ctrl+Shift+A (the assets panel) is the key that says A');
  e = k('keydown', { code: 'KeyD', key: 'd', ctrlKey: true, altKey: true });
  ok(fires(e, 'KeyD'), 'Windows AZERTY: the left Ctrl+Alt+D is Duo');
  e = k('keydown', { code: 'KeyE', key: '€', ctrlKey: true, altKey: true });
  ok(fires(e, 'KeyE'), 'Windows AZERTY: the left Ctrl+Alt+E (types € on its own) still reads as Ctrl+Alt+E for a shortcut');
  e = k('keydown', { code: 'KeyQ', key: 'a', ctrlKey: true, altKey: true, isTrusted: false });
  eq(e.code, 'KeyQ', 'synthetic events (the keys sheet, tours) are left alone');
  // Windows, QWERTZ
  k = await shim('Win32', QWERTZ);
  e = altGr('KeyM', 'µ');
  ok(!e.ctrlKey && !e.altKey && e.key === 'µ', 'Windows QWERTZ: AltGr+M types µ (not "next model")');
  e = altGr('KeyQ', '@');
  ok(!e.ctrlKey && e.key === '@', 'Windows QWERTZ: AltGr+Q types @');
  e = k('keydown', { code: 'KeyM', key: 'm', ctrlKey: true, altKey: true });
  ok(fires(e, 'KeyM'), 'Windows QWERTZ: the left Ctrl+Alt+M is the shortcut');
  e = k('keydown', { code: 'KeyY', key: 'z', ctrlKey: true });
  eq(e.code, 'KeyZ', 'Windows QWERTZ: Ctrl+Z is the key that says Z (QWERTY\'s Y place)');
  e = k('keydown', { code: 'KeyZ', key: 'y', ctrlKey: true });
  eq(e.code, 'KeyY', 'Windows QWERTZ: the key that says Y reads KeyY');
  // the Mac (German / French): ⌥ types @ [ ] { } | in a field; ⌥ letters stay shortcuts; ⌘ is Ctrl
  k = await shim('MacIntel', QWERTZ);
  e = k('keydown', { code: 'KeyL', key: '@', altKey: true });
  ok(!e.altKey && e.key === '@', 'the Mac (German): ⌥L types @ in a text field');
  e = k('keydown', { code: 'Digit5', key: '[', altKey: true });
  ok(!e.altKey, 'the Mac (German): ⌥5 types [ in the Lab\'s code (not "hide layer 5")');
  e = k('keydown', { code: 'Digit5', key: '[', altKey: true }, { tagName: 'CANVAS' });
  ok(e.altKey && e.code === 'Digit5', 'the Mac: ⌥5 on the picture (not a text field) still hides layer 5');
  e = k('keydown', { code: 'KeyT', key: '†', altKey: true });
  ok(e.altKey && e.code === 'KeyT', 'the Mac: ⌥T in the chat box stays "open every thinking block" (code KeyT)');
  e = k('keydown', { code: 'KeyN', key: 'Dead', altKey: true });
  ok(e.altKey, 'the Mac: ⌥N (a dead key) stays the Lab\'s code ⇄ nodes');
  e = k('keydown', { code: 'KeyY', key: 'z', metaKey: true });
  ok(e.ctrlKey && e.code === 'KeyZ', 'the Mac (German): ⌘Z is Ctrl+Z on the key that says Z');
  e = k('keydown', { code: 'KeyD', key: '∂', ctrlKey: true, altKey: true });
  ok(fires(e, 'KeyD'), 'the Mac: ⌃⌥D (the real Control; ⌥⌘D hides the Dock) is Duo');

  // ---------- 4. the AltGr-safe shortcut table ----------
  // every Ctrl+Alt shortcut in the app, against what AltGr types on each keyboard: typing wins with AltGr, the
  // shortcut stays on the left Ctrl+Alt (and its handler reads e.code: the scan's altgr-key rule is at 0)
  const ctrlAlt = [...new Set(lines.map((l) => l.keys).flatMap((x) => x.split(/\s+\/\s+|\s+·\s+/)).filter((x) => /^Ctrl(?:\/⌘)?\+Alt\+[^+\s]+$/.test(x)).map((x) => x.replace('Ctrl/⌘', 'Ctrl')))];
  for (const c of ['S', 'A', 'R', 'P', 'V', 'T']) ctrlAlt.push(`Ctrl+Alt+${c}`); // capture (capturemain.js KEYS)
  ok(ctrlAlt.length >= 12, `Ctrl+Alt shortcuts found (${ctrlAlt.length})`);
  const table = [];
  k = await shim('Win32', AZERTY);
  for (const keys of [...new Set(ctrlAlt)]) {
    for (const { layout, key, code, char } of KT.altGrTypes(keys)) {
      const typed = altGr(code, char);
      const left = k('keydown', { code, key: char, ctrlKey: true, altKey: true });
      ok(!typed.ctrlKey && !typed.altKey, `${layout}: AltGr+${key} types ${char} (not ${keys})`);
      ok(left.ctrlKey && left.altKey, `${layout}: the left ${keys} is still the shortcut`);
      table.push(`${keys} · ${layout} AltGr types ${char}`);
    }
  }
  ok(table.length >= 10, `AltGr-safe table: ${table.length} key / keyboard pairs where AltGr types (all typing-safe)`);
  if (process.argv.includes('--table')) console.log(table.join('\n'));

  // ---------- 5. main side under AltGr: the hub keys and the capture keys ----------
  const MAIN = read('main.js');
  ok(/before-input-event[\s\S]{0,400}if \(input\.alt\) return;[\s\S]{0,600}HUB_KEYS\.has/.test(MAIN), 'main.js: a website agent\'s hub keys skip Ctrl+Alt (AZERTY AltGr+8 is \\, not Ctrl+\\: the chats panel)');
  const CAP = read('capturemain.js');
  const fnSrc = /function captureKey\(event, input\) \{[\s\S]*?\n  \}/.exec(CAP)[0];
  const capture = (platform, input) => {
    const sent = [];
    const ctx = { process: { platform }, KEYS: { s: 'menu', a: 'region', r: 'record', p: 'pause', v: 'library', t: 'tour' }, send: (_t, x) => sent.push(x.key), event: { preventDefault() {} } };
    vm.runInNewContext(`${fnSrc}; captureKey(event, input);`, { ...ctx, input: { type: 'keyDown', ...input } });
    return sent[0] || null;
  };
  eq(capture('win32', { key: 'a', code: 'KeyQ', control: true, alt: true }), 'region', 'capture on Windows AZERTY: Ctrl+Alt+A (the key that says A) is the region shot');
  eq(capture('win32', { key: 'ś', code: 'KeyS', control: true, alt: true }), null, 'capture on Windows (Polish): AltGr+S types ś');
  eq(capture('win32', { key: 's', code: 'KeyS', control: true, alt: true }), 'menu', 'capture on Windows: Ctrl+Alt+S is the menu');
  eq(capture('darwin', { key: 'ß', code: 'KeyS', meta: true, alt: true }), 'menu', 'capture on the Mac: ⌥⌘S (⌥S types ß) is the menu');

  // ---------- 6. patch notes: "Ctrl/⌘" read this computer's way, one system's keys kept ----------
  for (const f of fs.readdirSync(path.join(ROOT, 'docs/patch-notes')).filter((x) => /^round-\d+\.md$/.test(x))) {
    const t = fs.readFileSync(path.join(ROOT, 'docs/patch-notes', f), 'utf8');
    const mac = W.keyLabel(t, { mac: true, both: true }); const win = W.keyLabel(t, { mac: false, both: true });
    ok(!/Ctrl\/⌘|⌘\/Ctrl/.test(mac + win), `patch notes ${f}: no "Ctrl/⌘" left on either`);
    ok(mac.length <= t.length && (t.match(/Ctrl\+W/g) || []).length === (mac.match(/Ctrl\+W/g) || []).length, `patch notes ${f}: Windows-only keys kept on the Mac`);
  }
  ok(/WinMac\.keyLabel\(String\(text\), \{ mac: [^}]*both: true \}\)/.test(read('patchnotes.js')), 'patchnotes.js reads them through keyLabel (both)');

  // ---------- 7. the scan's round-49 rules: zero, and they catch what they're for ----------
  const hits = scan();
  for (const rule of ['key-text-raw', 'mac-ctrl-click', 'os-clash', 'altgr-key', 'mac-alt-letter', 'dialog-both']) {
    const mine = hits.filter((h) => h.rule === rule);
    ok(!mine.length, `scan ${rule}: ${mine.length} hit(s)${mine.length ? `\n  ${mine.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text.slice(0, 120)}`).join('\n  ')}` : ''}`);
  }
  const planted = [
    "b.title = 'Undo (Ctrl+Z)';",
    "if (!e.shiftKey && !e.ctrlKey) { sel.clear(); }",
    "{ area: 'G', keys: 'Ctrl+H', what: 'x' }",
    "{ area: 'G', keys: 'Alt+Space', what: 'x' }",
    "if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'q') go();",
    "if (e.altKey && e.key.toLowerCase() === 'r') surprise();",
    "hub.openDialog({ properties: ['openFile', 'openDirectory'] });",
  ].join('\n');
  const caught = scanText(planted, 'planted.js').map((h) => `${h.rule}:${h.line}`);
  for (const want of ['key-text-raw:1', 'mac-ctrl-click:2', 'os-clash:3', 'os-clash:4', 'altgr-key:5', 'mac-alt-letter:6', 'dialog-both:7']) ok(caught.includes(want), `scan catches a planted ${want}`);
  ok(!scanText("b.title = macText('Undo (Ctrl+Z)'); if (!e.shiftKey && !e.ctrlKey && !e.metaKey) sel.clear(); { keys: 'Ctrl+Tab' } if (e.altKey && e.code === 'KeyR') x();", 'x.js').length, 'scan: the fixed forms pass');

  console.log(`winmac49-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log(`FAIL ${err.stack}`); process.exit(1); });
