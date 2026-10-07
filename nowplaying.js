// What Spotify (or any media app) is playing, without a Spotify login: Windows' media controls (the same ones
// the volume flyout shows) through a small PowerShell loop, or Spotify's AppleScript on a Mac. Gives the title,
// artist, album, position, play state and the cover, and play / pause / next / previous.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { DATA_DIR } = require('./store');

const COVER = path.join(DATA_DIR, 'now-playing-cover.jpg');
let proc = null; let timer = null; let listener = null; let last = '';

// Windows: one PowerShell process that prints a JSON line every 1.5 s (the cover is saved when the track changes).
const PS_LOOP = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastKey = ''
while ($true) {
  $sessions = @($mgr.GetSessions())
  $s = $sessions | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $tl = $s.GetTimelineProperties(); $pi = $s.GetPlaybackInfo()
    $key = "$($p.Title)|$($p.Artist)"
    $cover = $false
    if ($key -ne $lastKey -and $p.Thumbnail) {
      try {
        $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
        $ms = New-Object System.IO.MemoryStream; $net.CopyTo($ms)
        [System.IO.File]::WriteAllBytes($env:NP_COVER, $ms.ToArray()); $cover = $true
      } catch {}
    }
    $lastKey = $key
    $o = [ordered]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds; playing = ($pi.PlaybackStatus -eq 'Playing'); coverChanged = $cover }
  } else { $o = [ordered]@{ app = $null } }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`;
const PS_CONTROL = String.raw`
$cmd = $args[0]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = @($mgr.GetSessions()) | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
if (-not $s) { $s = $mgr.GetCurrentSession() }
if ($s) { Await ($s.$cmd()) ([bool]) | Out-Null }`;

// Mac: Spotify's own AppleScript (title, artist, position, artwork URL).
const OSA = `tell application "System Events" to set running to (exists process "Spotify")
if not running then return "{}"
tell application "Spotify"
  set t to current track
  return "{\\"app\\":\\"Spotify\\",\\"title\\":" & my q(name of t) & ",\\"artist\\":" & my q(artist of t) & ",\\"album\\":" & my q(album of t) & ",\\"position\\":" & (player position as text) & ",\\"duration\\":" & ((duration of t) / 1000 as text) & ",\\"playing\\":" & ((player state is playing) as text) & ",\\"coverUrl\\":" & my q(artwork url of t) & "}"
end tell
on q(s)
  set AppleScript's text item delimiters to "\\""
  set parts to text items of (s as text)
  set AppleScript's text item delimiters to "\\\\\\""
  set s to parts as text
  set AppleScript's text item delimiters to ""
  return "\\"" & s & "\\""
end q`;

function emit(info) {
  const key = JSON.stringify({ ...info, position: Math.round(info.position || 0) });
  if (key === last && !info.coverChanged) return;
  last = key;
  listener?.({ ...info, cover: info.coverChanged || info.coverUrl ? (info.coverUrl || COVER) : undefined, coverAt: info.coverChanged ? Date.now() : undefined });
}

function start(onUpdate) {
  listener = onUpdate;
  if (proc || timer) return true;
  if (process.platform === 'win32') {
    // a script file (PowerShell reads piped scripts line by line, which breaks the loop)
    const file = path.join(DATA_DIR, 'now-playing.ps1');
    fs.writeFileSync(file, PS_LOOP);
    proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true, env: { ...process.env, NP_COVER: COVER } });
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (line.startsWith('{')) { try { emit(JSON.parse(line)); } catch { /* partial line */ } }
      }
    });
    proc.on('exit', () => { proc = null; });
    return true;
  }
  if (process.platform === 'darwin') {
    const poll = () => execFile('osascript', ['-e', OSA], (err, out) => { if (!err) { try { emit(JSON.parse(out.trim() || '{}')); } catch { /* Spotify closed */ } } });
    poll();
    timer = setInterval(poll, 1500);
    return true;
  }
  return false;
}
function stop() {
  listener = null; last = '';
  if (proc) { proc.kill(); proc = null; }
  if (timer) { clearInterval(timer); timer = null; }
}
// cmd: 'toggle' | 'next' | 'prev'
function control(cmd) {
  if (process.platform === 'win32') {
    const m = { toggle: 'TryTogglePlayPauseAsync', next: 'TrySkipNextAsync', prev: 'TrySkipPreviousAsync' }[cmd];
    if (!m) return;
    const file = path.join(DATA_DIR, 'now-playing-control.ps1');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== PS_CONTROL) fs.writeFileSync(file, PS_CONTROL);
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, m], { windowsHide: true });
  } else if (process.platform === 'darwin') {
    const a = { toggle: 'playpause', next: 'next track', prev: 'previous track' }[cmd];
    if (a) execFile('osascript', ['-e', `tell application "Spotify" to ${a}`], () => {});
  }
}

module.exports = { start, stop, control, COVER };
