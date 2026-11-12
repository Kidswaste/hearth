# (Nov 10, labplayer2) Shows a test copy's main window without giving it the focus. dev/smoke.js starts its copy hidden
# (windowsHide: Windows then ignores the app's own first show); a check that needs a window really on screen (the Lab
# player lays its window over Hearth's) asks for this with --show.   powershell -File dev/win-show.ps1 <pid>
param([int]$TargetPid)
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class HearthWinShow {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  public static int Show(uint pid) {
    int n = 0;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || IsWindowVisible(h) || GetWindowTextLength(h) == 0 || GetWindow(h, 4) != IntPtr.Zero) return true;
      var s = new StringBuilder(64); GetClassName(h, s, 64);
      if (s.ToString() != "Chrome_WidgetWin_1") return true;
      ShowWindow(h, 4); n++; return true; // SW_SHOWNOACTIVATE
    }, IntPtr.Zero);
    return n;
  }
}
"@
Write-Output ([HearthWinShow]::Show([uint32]$TargetPid))
