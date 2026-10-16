// (round 49, winmac49) What the two computers keep for themselves, and what AltGr types on the owner's possible
// keyboards. Read by dev/winmac-scan.js (rule os-clash) and dev/winmac-test.js (the AltGr-safe shortcut table).
// Keys are written Hearth's way ("Ctrl+Shift+K"; on a Mac Ctrl is ⌘ unless WinMac.MAC_REAL_CTRL says the real ⌃).
'use strict';

// macOS: what ⌘ / ⌥⌘ combinations the system or every app's menus take before Hearth sees them (Hearth's Ctrl = ⌘)
const MAC_TAKEN = {
  'ctrl+q': 'Quit (⌘Q)', 'ctrl+h': 'Hide Hearth (⌘H)', 'ctrl+alt+h': 'Hide Others (⌥⌘H)', 'ctrl+m': 'Minimise (⌘M)',
  'ctrl+`': 'next window (⌘`)', 'ctrl+tab': 'app switcher (⌘Tab)', 'ctrl+space': 'Spotlight (⌘Space)', 'ctrl+alt+space': 'Finder search (⌥⌘Space)',
  'ctrl+alt+d': 'Dock hiding on / off (⌥⌘D)', 'ctrl+alt+esc': 'Force Quit (⌥⌘Esc)', 'ctrl+shift+3': 'screenshot (⇧⌘3)',
  'ctrl+shift+4': 'screenshot of a part (⇧⌘4)', 'ctrl+shift+5': 'screenshot / recording tools (⇧⌘5)', 'ctrl+shift+/': 'Help menu search (⇧⌘/)',
  'ctrl+alt+i': 'Developer tools (⌥⌘I, the View menu)', 'ctrl+alt+m': null, // (Minimise All only while ⌥ is held in a menu: free)
};
// Windows: what the system keeps (Win+ keys never reach an app at all)
const WIN_TAKEN = {
  'alt+tab': 'app switcher', 'alt+esc': 'next window', 'alt+space': 'the window menu', 'ctrl+esc': 'Start', 'ctrl+shift+esc': 'Task Manager',
  'ctrl+alt+del': 'security screen', 'ctrl+alt+delete': 'security screen', 'alt+f4': 'close the window', 'f11': 'full screen (the View menu)',
  'ctrl+shift+i': 'Developer tools (the View menu)', 'f10': 'the menu bar', 'alt+shift': 'switch keyboard layout', 'ctrl+shift': 'switch keyboard layout (when set)',
};
// what AltGr types (Windows, by physical key = e.code), on the keyboards a French / Swiss / Belgian / German owner may
// use, plus Polish, Spanish, Italian, UK and Nordic for good measure. On Windows AltGr is Ctrl+Alt.
const ALTGR = {
  'fr-azerty': { Digit2: '~', Digit3: '#', Digit4: '{', Digit5: '[', Digit6: '|', Digit7: '`', Digit8: '\\', Digit9: '^', Digit0: '@', Minus: ']', Equal: '}', KeyE: '€', BracketRight: '¤' },
  'be-azerty': { Digit1: '|', Digit2: '@', Digit3: '#', Digit6: '^', Digit9: '{', Digit0: '}', KeyE: '€', BracketLeft: '[', BracketRight: ']', Quote: '´', Backslash: '`', IntlBackslash: '\\', Slash: '~' },
  'de-qwertz': { Digit2: '²', Digit3: '³', Digit7: '{', Digit8: '[', Digit9: ']', Digit0: '}', Minus: '\\', KeyQ: '@', KeyE: '€', KeyM: 'µ', BracketRight: '~', IntlBackslash: '|' },
  'ch-qwertz': { Digit1: '¦', Digit2: '@', Digit3: '#', Digit6: '¬', Digit7: '|', Digit8: '¢', Minus: '´', Equal: '~', KeyE: '€', BracketLeft: '[', BracketRight: ']', Quote: '{', Backslash: '}', IntlBackslash: '\\' },
  'pl-programmer': { KeyA: 'ą', KeyC: 'ć', KeyE: 'ę', KeyL: 'ł', KeyN: 'ń', KeyO: 'ó', KeyS: 'ś', KeyX: 'ź', KeyZ: 'ż', KeyU: '€' },
  es: { Digit1: '|', Digit2: '@', Digit3: '#', Digit4: '~', Digit6: '¬', KeyE: '€', BracketLeft: '[', BracketRight: ']', Quote: '{', Backslash: '}', Backquote: '\\' },
  it: { KeyE: '€', BracketLeft: '[', BracketRight: ']', Semicolon: '@', Quote: '#' },
  uk: { Digit4: '€', Backquote: '¦', KeyA: 'á', KeyE: 'é', KeyI: 'í', KeyO: 'ó', KeyU: 'ú' },
  'se-nordic': { Digit2: '@', Digit3: '£', Digit4: '$', Digit7: '{', Digit8: '[', Digit9: ']', Digit0: '}', Minus: '\\', KeyE: '€', KeyM: 'µ', BracketRight: '~', IntlBackslash: '|' },
};
// the physical key (e.code, US names) of a key name as Hearth writes it
const CODE = (k) => (/^[A-Z]$/i.test(k) ? `Key${k.toUpperCase()}` : /^\d$/.test(k) ? `Digit${k}` : { '\\': 'Backslash', '/': 'Slash', '[': 'BracketLeft', ']': 'BracketRight', ';': 'Semicolon', "'": 'Quote', '=': 'Equal', '-': 'Minus', '`': 'Backquote', ',': 'Comma', '.': 'Period' }[k] || null);
// "Ctrl+Alt+M" → which keyboards type a character with AltGr on that key: [{ layout, char }]
function altGrTypes(keys) {
  const m = /^Ctrl\+Alt\+(.+)$/i.exec(String(keys).trim());
  if (!m) return [];
  const keyNames = m[1].includes('…') ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : [m[1]];
  const out = [];
  for (const k of keyNames) {
    const code = CODE(k);
    for (const [layout, map] of Object.entries(ALTGR)) if (code && map[code]) out.push({ layout, key: k, code, char: map[code] });
  }
  return out;
}
const norm = (k) => String(k).replace(/\s+/g, '').toLowerCase().replace(/^cmd\+|^ctrl\/⌘\+/, 'ctrl+');
// the OS reason a key line clashes on that system ('' = free)
function clash(keys, os) {
  const k = norm(keys);
  if (os === 'mac') return MAC_TAKEN[k] || '';
  return WIN_TAKEN[k] || (/^win\+/.test(k) ? 'Windows key' : '');
}

module.exports = { MAC_TAKEN, WIN_TAKEN, ALTGR, CODE, altGrTypes, clash, norm };
