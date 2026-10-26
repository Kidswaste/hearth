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
// (sweep67) Windows' own PowerShell by its full path (a PATH without System32\WindowsPowerShell still works), and the
// script as -EncodedCommand (UTF-16LE base64): no cmd.exe quoting of a multi-line script, whatever the argument holds.
const PS_EXE = () => require('path').win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64');
async function attributes(paths, { platform = process.platform, execFile = cp.execFile } = {}) {
  const unique = [...new Set(paths)];
  if (!unique.length || platform !== 'win32') return new Map(unique.map(p => [p, 0]));
  return new Promise(resolve => {
    const unknown = () => new Map(unique.map(p => [p, null]));
    try {
      const child = execFile(PS_EXE(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED],
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
