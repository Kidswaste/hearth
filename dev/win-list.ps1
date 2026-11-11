# (Nov 10, labplayer2) The visible top-level windows, front first (z-order), as JSON lines: place in the order, process
# id, class, rectangle (physical px), extended style; the title only for the given process ids (other apps' titles are
# nobody's business here). For dev/checks that must know which window is really in front (the Lab player over Hearth).
#   powershell -File dev/win-list.ps1 <pid> [<pid>…]
param([Parameter(ValueFromRemainingArguments = $true)][int[]]$Pids)
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public class HearthWinList {
  public delegate bool P(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  public static List<string> List(HashSet<uint> mine) {
    SetProcessDPIAware();
    var o = new List<string>(); int z = 0;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint p; GetWindowThreadProcessId(h, out p); R r; GetWindowRect(h, out r);
      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      var c = new StringBuilder(80); GetClassName(h, c, 80); var t = new StringBuilder(120); if (mine.Contains(p)) GetWindowText(h, t, 120);
      o.Add("{\"z\":" + (z++) + ",\"pid\":" + p + ",\"cls\":\"" + c.ToString().Replace("\\", "/").Replace("\"", "'") + "\",\"x\":" + r.L + ",\"y\":" + r.T + ",\"w\":" + (r.Rt - r.L) + ",\"h\":" + (r.B - r.T) + ",\"ex\":" + GetWindowLong(h, -20) + ",\"min\":" + (IsIconic(h) ? "true" : "false") + ",\"cloaked\":" + cloaked + ",\"title\":\"" + t.ToString().Replace("\\", "/").Replace("\"", "'") + "\"}");
      return true;
    }, IntPtr.Zero);
    return o;
  }
}
"@
$set = New-Object 'System.Collections.Generic.HashSet[uint32]'
foreach ($p in $Pids) { [void]$set.Add([uint32]$p) }
[HearthWinList]::List($set) | ForEach-Object { Write-Output $_ }
