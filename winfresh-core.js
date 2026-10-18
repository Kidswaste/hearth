// A fresh Windows install (round 60, winfresh60): Hearth unzipped anywhere (%USERPROFILE%\Hearth from Hearth-Windows.zip,
// an older %USERPROFILE%\agent-hub, a folder whose path has spaces) and started once with "Start Hearth.cmd". Plain
// Node, no Electron (dev/winfresh-test.js runs it as is); appshell.js does the Windows parts with these answers.
//   loginItemArgs(appDir, platform)  the arguments of "Start with Windows": Electron joins them with spaces WITHOUT
//                                    quotes, so a folder like C:\Users\Jane Doe\Hearth must be quoted here
//   shortcutArgs(appDir)             the Start menu / Desktop "Hearth.lnk" arguments: "<folder>" --restart
//   folderOf(link)                   the Hearth folder a shortcut starts ({ target, args } from shell.readShortcutLink)
//   shortcutPlan(o)                  on the first start of a copy: make the shortcuts, keep them, or leave another
//                                    copy's alone (said once) → { action: 'done' | 'create' | 'keep' | 'elsewhere', other? }
const path = require('path');

const P = path.win32;
const quote = (p) => `"${String(p).replace(/"/g, '')}"`;
function loginItemArgs(appDir, platform = process.platform) {
  return platform === 'win32' ? [quote(appDir)] : [appDir];
}
const shortcutArgs = (appDir) => `${quote(appDir)} --restart`;

// Windows paths compare without case, slashes either way, no trailing separator or "\." (Start Hearth.cmd passes "%~dp0.")
function sameDir(a, b) {
  const n = (p) => P.normalize(String(p || '')).replace(/[\\/]+\.?$/, '').toLowerCase();
  return Boolean(a && b) && n(a) === n(b);
}
// the folder a Hearth shortcut opens: its first argument (quoted or not), else the folder around electron\electron.exe
function folderOf(link) {
  if (!link) return '';
  const args = String(link.args || '').trim();
  const m = /^"([^"]+)"/.exec(args) || /^(\S+)/.exec(args);
  if (m && !/^--/.test(m[1])) return P.normalize(m[1]).replace(/[\\/]+\.?$/, '');
  return link.target ? P.dirname(P.dirname(link.target)) : '';
}
// o = { marker: { appDir } | null (this data folder's note), existing: { target, args } | null (the Start menu
// Hearth.lnk), execPath, appDir, exists(dir) → bool }
function shortcutPlan({ marker = null, existing = null, execPath = '', appDir = '', exists = () => false } = {}) {
  if (marker && sameDir(marker.appDir, appDir)) return { action: 'done' };
  if (!existing) return { action: 'create' };
  const other = folderOf(existing);
  if (sameDir(other, appDir) && (!existing.target || !execPath || sameDir(existing.target, execPath))) return { action: 'keep' };
  // another copy's shortcut (an older agent-hub folder…): kept while that copy is still there (its data lives there);
  // re-pointed here when that folder is gone
  if (other && exists(other) && !sameDir(other, appDir)) return { action: 'elsewhere', other };
  return { action: 'create', replaced: other || existing.target || '' };
}

module.exports = { loginItemArgs, shortcutArgs, sameDir, folderOf, shortcutPlan };
