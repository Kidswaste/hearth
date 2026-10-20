// Windows cloud placeholders expose readiness through attributes, not Node's stat.
// Read metadata in one bounded, hidden subprocess; never read/hydrate file contents.
const cp = require('child_process');
const NEEDS_DOWNLOAD = 0x1000 | 0x40000 | 0x400000;
const pending = attributes => !Number.isInteger(attributes) || Boolean(attributes & NEEDS_DOWNLOAD);
const SCRIPT = `[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$paths = ConvertFrom-Json ([Console]::In.ReadToEnd())
$result = @(foreach ($p in $paths) {
  $a = $null
  try { $a = [int][IO.File]::GetAttributes([string]$p) } catch { }
  @{ path = [string]$p; attributes = $a }
})
ConvertTo-Json -InputObject $result -Compress`;
async function attributes(paths, { platform = process.platform, execFile = cp.execFile } = {}) {
  const unique = [...new Set(paths)];
  if (!unique.length || platform !== 'win32') return new Map(unique.map(p => [p, 0]));
  return new Promise(resolve => {
    const unknown = () => new Map(unique.map(p => [p, null]));
    try {
      const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
        { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
          if (err) return resolve(unknown());
          try {
            const rows = JSON.parse(String(out).replace(/^\uFEFF/, ''));
            const result = unknown();
            for (const row of Array.isArray(rows) ? rows : [rows]) if (result.has(row?.path)) result.set(row.path, row.attributes);
            resolve(result);
          } catch { resolve(unknown()); }
        });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(unique));
    } catch { resolve(unknown()); }
  });
}
module.exports = { attributes, pending };
