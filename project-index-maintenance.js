// Storage-worker-only repair: preserve an immutable source copy before compacting exact
// project-reference duplicates. No linked file, chat, scene or quest is changed.
const path = require('path');
const C = require('./projects-core');
const stamp = s => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(':');
function compactRead(fs, file, result, before) {
  if (path.basename(file) !== 'projects.json' || result?.state !== 'ok' || result.from !== 'file') return result;
  const value = C.compact(result.value);
  if (value === result.value) return result;
  const same = () => stamp(fs.statSync(file)) === stamp(before);
  if (!same()) throw Error('Project index changed while being read; retry the read.');
  const dir = path.join(path.dirname(file), '.project-recovery');
  fs.mkdirSync(dir, { recursive: true });
  const suffix = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const backup = path.join(dir, `projects-before-compaction-${suffix}.json`);
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  if (!same()) throw Error('Project index changed during backup; no repair written.');
  const tmp = `${file}.${suffix}.tmp`;
  try {
    const fd = fs.openSync(tmp, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!same()) throw Error('Project index changed during repair; no repair written.');
    fs.renameSync(tmp, file);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  return { ...result, value };
}
module.exports = { compactRead };
