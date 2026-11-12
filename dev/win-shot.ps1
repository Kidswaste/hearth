# (Nov 10, labplayer2) A picture of what is really on screen in a rectangle (physical pixels), for dev/checks that
# must see what the desktop shows (the Lab player's window laid over Hearth's).   powershell -File dev/win-shot.ps1 x y w h out.png|none   → {"lit","mean","colours"} of a grid of its pixels
param([int]$X, [int]$Y, [int]$W, [int]$H, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System.Runtime.InteropServices;
public class HearthDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[void][HearthDpi]::SetProcessDPIAware()
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size $W, $H))
if ($Out -and $Out -ne 'none') { $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png) }
# a 24 x 24 grid of its pixels, counted: lit (not near black) share, mean brightness, how many different colours
$lit = 0; $sum = 0; $n = 0; $cols = @{}
for ($i = 0; $i -lt 24; $i++) { for ($j = 0; $j -lt 24; $j++) {
  $c = $bmp.GetPixel([int](($i + 0.5) * $W / 24), [int](($j + 0.5) * $H / 24)); $v = $c.R + $c.G + $c.B
  $n++; $sum += $v; if ($v -gt 30) { $lit++ }; $cols[(($c.R -shr 4) * 256 + ($c.G -shr 4) * 16 + ($c.B -shr 4))] = 1
} }
$g.Dispose(); $bmp.Dispose()
Write-Output ('{"lit":' + [math]::Round($lit / $n, 3).ToString([cultureinfo]::InvariantCulture) + ',"mean":' + [math]::Round($sum / $n / 3, 1).ToString([cultureinfo]::InvariantCulture) + ',"colours":' + $cols.Count + '}')
