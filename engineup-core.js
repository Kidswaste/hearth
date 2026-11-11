// (round 177, engine177) The engine update's rules, in one place (Node: engineupmain.js, dev/checks/engine177.js; the
// window: engineup.js reads the words). The engine is Electron, the copy of Chrome Hearth runs on. Hearth's own updates
// (⬆ Update, git) never change it; this offers a newer one only when the repo's engine.json approves it, only on a click.
//   parseManifest(text)            engine.json → { version, files: { 'win32-x64': { url, sha256, size } … }, why } (throws
//                                  a plain sentence on anything it doesn't trust: only Electron's own GitHub releases)
//   layoutOf({ platform, execPath, appDir, home, exists })   'win-folder' (electron\electron.exe beside Agent Hub.cmd) ·
//                                  'mac-app' (Hearth.app made by mac/install-mac.sh, the folder in Application Support) · 'other'
//   offer({ manifest, running, platform, arch, layout })     { running, next | null, why }
//   sha256File(fs, crypto, file)   the file's SHA-256 (streamed) · same(a, b): two checksums equal
//   Windows, beside the app folder (the same steps as Agent Hub.cmd, which does them on the computer itself):
//     electron\  the engine in use · electron-next\  a verified new one waiting · electron-old\  the one before, kept for
//     one start · electron\.hearth-trial  "this engine's first start hasn't reached its first screen yet" ·
//     electron-failed\  a new engine whose first start never got there (Hearth went back; nothing deleted)
//   winState(fs, path, appDir)     what's there now
//   winLaunch(fs, path, appDir)    Agent Hub.cmd's start: roll back a trial that never got to its first screen, or swap
//                                  a waiting electron-next in (marking the trial); else nothing. → 'rolled-back' | 'swapped' | 'busy' | 'as-is'
//   winAfterStart(fs, path, appDir)   Hearth's first screen is up: a trial start is confirmed (its mark goes, the old engine
//                                  stays for this start); on a later start the old engine goes → { confirmed, removedOld }
const EngineUpCore = (() => {
  const RELEASE = /^https:\/\/github\.com\/electron\/electron\/releases\/download\/v(\d+\.\d+\.\d+)\/electron-v(\d+\.\d+\.\d+)-(win32|darwin|linux)-(x64|arm64)\.zip$/;
  const KEYS = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];
  const W = { CUR: 'electron', NEXT: 'electron-next', PART: 'electron-next.partial', OLD: 'electron-old', FAILED: 'electron-failed', TRIAL: '.hearth-trial', EXE: 'electron.exe' };

  const semver = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim()); return m ? m.slice(1).map(Number) : null; };
  function cmp(a, b) {
    const x = semver(a); const y = semver(b);
    if (!x || !y) return NaN;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }
  const bad = (why) => Object.assign(new Error(why), { code: 'EENGINEMANIFEST' });
  function parseManifest(text) {
    let j;
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw bad('engine.json isn\'t readable JSON.'); }
    if (!j || typeof j !== 'object') throw bad('engine.json is empty.');
    const version = String(j.version || '');
    if (!semver(version)) throw bad(`engine.json names no plain version (${version || 'none'}).`);
    const files = {};
    for (const [key, f] of Object.entries(j.files || {})) {
      if (!KEYS.includes(key)) continue; // a platform Hearth doesn't run on is left out
      const m = RELEASE.exec(String(f?.url || ''));
      if (!m || m[1] !== version || m[2] !== version || `${m[3]}-${m[4]}` !== key) throw bad(`engine.json: the ${key} file isn't Electron ${version}'s own release zip.`);
      const sha = String(f.sha256 || '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(sha)) throw bad(`engine.json: the ${key} file has no SHA-256.`);
      const size = Number(f.size);
      if (!Number.isFinite(size) || size < 1e6 || size > 1e9) throw bad(`engine.json: the ${key} file has no believable size.`);
      files[key] = { url: m[0], sha256: sha, size };
    }
    if (!Object.keys(files).length) throw bad('engine.json lists no file.');
    return { version, files, why: typeof j.why === 'string' ? j.why.slice(0, 300) : '' };
  }

  const low = (s) => String(s || '').replace(/[\\/]+$/, '').toLowerCase();
  function layoutOf({ platform, execPath, appDir, home, exists = () => false, sep }) {
    if (platform === 'win32') {
      const s = sep || '\\';
      const dir = String(execPath || '').split(/[\\/]/).slice(0, -1).join(s);
      const want = `${String(appDir || '').replace(/[\\/]+$/, '')}${s}${W.CUR}`;
      if (low(dir).replace(/\//g, '\\') === low(want).replace(/\//g, '\\') && /electron\.exe$/i.test(execPath) && exists(`${String(appDir).replace(/[\\/]+$/, '')}${s}Agent Hub.cmd`)) return 'win-folder';
      return 'other';
    }
    if (platform === 'darwin') {
      const dest = `${String(home || '').replace(/\/+$/, '')}/Library/Application Support/Hearth`;
      if (/\/Hearth\.app\/Contents\/MacOS\/[^/]+$/.test(String(execPath || '')) && String(appDir || '').replace(/\/+$/, '') === dest && exists(`${dest}/mac/install-mac.sh`)) return 'mac-app';
      return 'other';
    }
    return 'other';
  }
  const mb = (size) => `≈ ${Math.max(1, Math.round(size / 1048576 / 10) * 10)} MB`;
  function offer({ manifest, running, platform, arch, layout }) {
    const out = { running: String(running || ''), next: null, why: '' };
    if (!manifest) { out.why = 'no-manifest'; return out; }
    const c = cmp(manifest.version, running);
    if (!(c > 0)) { out.why = Number.isNaN(c) ? 'unknown-running' : 'current'; return out; }
    const f = manifest.files[`${platform}-${arch}`];
    if (!f) { out.why = 'no-file'; return out; }
    if (layout !== 'win-folder' && layout !== 'mac-app') { out.why = 'not-managed'; out.newer = manifest.version; return out; }
    out.next = { version: manifest.version, url: f.url, sha256: f.sha256, size: f.size, mb: mb(f.size), why: manifest.why };
    return out;
  }

  // ---------- checksums ----------
  function sha256File(fs, crypto, file) {
    return new Promise((res, rej) => {
      const h = crypto.createHash('sha256');
      const s = fs.createReadStream(file);
      s.on('error', rej); s.on('data', (d) => h.update(d)); s.on('end', () => res(h.digest('hex')));
    });
  }
  const same = (a, b) => /^[0-9a-f]{64}$/i.test(String(a || '')) && String(a).toLowerCase() === String(b || '').toLowerCase();

  // ---------- Windows: the folders beside the app ----------
  const has = (fs, p) => { try { fs.statSync(p); return true; } catch { return false; } };
  function winState(fs, path, appDir) {
    const j = (...a) => path.join(appDir, ...a);
    return {
      next: has(fs, j(W.NEXT, W.EXE)), partial: has(fs, j(W.PART)), old: has(fs, j(W.OLD, W.EXE)),
      trial: has(fs, j(W.CUR, W.TRIAL)), failed: has(fs, j(W.FAILED)),
    };
  }
  function winLaunch(fs, path, appDir) {
    const j = (...a) => path.join(appDir, ...a);
    const st = winState(fs, path, appDir);
    if (st.trial && st.old) {
      if (st.failed) fs.renameSync(j(W.FAILED), j(`${W.FAILED}-${Date.now().toString(36)}`)); // (an earlier failed copy stays too)
      fs.renameSync(j(W.CUR), j(W.FAILED));
      fs.renameSync(j(W.OLD), j(W.CUR));
      return 'rolled-back';
    }
    if (st.next && !has(fs, j(W.OLD))) {
      try { fs.renameSync(j(W.CUR), j(W.OLD)); } catch { return 'busy'; } // the engine still running: Agent Hub.cmd waits and tries again
      try { fs.renameSync(j(W.NEXT), j(W.CUR)); } catch { fs.renameSync(j(W.OLD), j(W.CUR)); return 'busy'; }
      fs.writeFileSync(j(W.CUR, W.TRIAL), 'trial\r\n');
      return 'swapped';
    }
    return 'as-is';
  }
  function winAfterStart(fs, path, appDir) {
    const j = (...a) => path.join(appDir, ...a);
    const st = winState(fs, path, appDir);
    if (st.trial) { fs.rmSync(j(W.CUR, W.TRIAL), { force: true }); return { confirmed: true, removedOld: false }; }
    if (has(fs, j(W.OLD))) { fs.rmSync(j(W.OLD), { recursive: true, force: true }); return { confirmed: false, removedOld: true }; }
    return { confirmed: false, removedOld: false };
  }

  // ---------- the words (Settings) ----------
  function line(s) {
    if (!s) return '';
    const run = `Engine: Electron ${s.running}${s.chrome ? ` (Chromium ${s.chrome.split('.')[0]})` : ''}.`;
    if (s.failedBack) return `${run} The engine update didn't start, so Hearth went back to this one; the new copy is in ${W.FAILED} (nothing was deleted).`;
    if (s.phase === 'ready') return `${run} Electron ${s.next.version} is downloaded and checked: it starts with Hearth's next start.`;
    if (s.next) return `${run} Electron ${s.next.version} is approved for Hearth${s.next.why ? `: ${s.next.why.replace(/\.$/, '')}` : ''}.`;
    if (s.why === 'not-managed' && s.newer) return `${run} Electron ${s.newer} is approved, but this copy's engine isn't one Hearth set up, so it can't update it.`;
    return `${run} Up to date.`;
  }

  return { KEYS, W, semver, cmp, parseManifest, layoutOf, offer, mb, sha256File, same, winState, winLaunch, winAfterStart, line };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EngineUpCore;
if (typeof window !== 'undefined') window.EngineUpCore = EngineUpCore;
