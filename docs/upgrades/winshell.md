# Winshell (round 32): "the command tool is blocked by policy" on Windows

You set Full file access on your Windows PC, and a chat answered: "the tool still refuses to launch PowerShell, returning
'blocked by policy' before it even checks the folder".

## What was wrong
- **Claude:** on Windows, Claude Code runs commands through a tool named **PowerShell** (always when Git Bash isn't
  installed, and more and more often when it is). At Full, Hearth switched on only `Bash`. A tool left out of the list
  doesn't exist for that run, so Claude Code refused it ("No such tool available: PowerShell") before Hearth's own
  check saw it. The AI retold that as "blocked by policy". (Checked on Claude Code 2.1.296: a tool name it doesn't
  have, e.g. PowerShell on a Mac, is quietly ignored, so switching it on everywhere is safe.)
- **Astra (Codex):** at Read & write / Full it runs commands in Codex's sandbox with no approvals (`codex exec` can't
  show one). On Windows that sandbox is limited, and it can refuse every command "by policy". Hearth said nothing.
- Either way the refusal came before Hearth's check, so the round 31/32 one-line "why" note never appeared.

## What changed
1. **Full now switches on Claude Code's PowerShell tool too** (next to Bash): commands on Windows go through Hearth's
   check like on the Mac (silent inside the folders, a card for risky things, deletes to the Trash).
2. **PowerShell commands are read the PowerShell way:** backslashes are path characters, `''` inside quotes, `;` and
   `&&`, script blocks `{ … }`, `( … )` and `$( … )` are checked too.
3. **PowerShell verbs and aliases are classified:** Get-ChildItem / gci / ls / dir, Get-Content / gc / cat, Set-Location
   / cd / sl, Select-String, Test-Path, Get-Item, Resolve-Path… read silently in the folders; New-Item / ni / md,
   Set-Content, Add-Content, Copy-Item / cpi, Out-File, Expand-Archive write (outside the folders: a card); Move-Item /
   Rename-Item move (a card); Remove-Item / ri / del / rd become **the Trash** (Hearth does it) when they name plain
   paths, otherwise a careful card.
4. **Risky PowerShell asks like Bash:** Invoke-WebRequest / irm (network), winget / Install-Module (installs),
   Stop-Process / Set-ItemProperty / Restart-Computer (system), Start-Process (starts a program), .NET file calls
   (`[IO.File]::Delete(…)`), Invoke-Expression, an `-EncodedCommand` Hearth can't read; `Start-Process -Verb RunAs`
   and Get-Credential are refused (Hearth never handles passwords / admin prompts). `$HOME` / `$env:USERPROFILE` count
   as your home folder.
5. **The activity log shows PowerShell commands** as "Run: …" (like Bash).
6. **A command an engine refused by its own policy gets the one-line note**, never silence:
   - Claude below Full: "Claude couldn't run a command: … not run commands" with **Allow commands**;
   - Claude at Full (a policy or an old Claude Code): "Claude Code blocked its command tool (PowerShell) before Hearth
     could check it… update Claude Code" with **Open AI setup**;
   - Astra: "Astra couldn't run a command: its sandbox blocks commands on Windows (blocked by policy)" with
     **Run without its sandbox…** and **Open AI setup**.
7. **Astra on Windows: Run commands without its sandbox** (⋯ AI setup → Files on this computer, a switch shown on
   Windows at Read & write / Full; also the note's button). Turning it on asks first and says plainly what it means:
   commands run like your own, it starts in its first folder and is told to stay in its folders, but nothing enforces
   it, and a delete it runs itself can't go to the Trash. Read always keeps the sandbox. Off by default.
8. The engines' error line for a "blocked by policy" failure names the fix (Claude: Full switches on Bash and
   PowerShell, else Update; Astra: the opt-in on Windows).
9. The log names the reason: "refused by Claude Code before Hearth's check" / "its sandbox (blocked by policy)", with the
   engine's own words.

Token cost: none added (the tool name in the CLI flags; Astra's prompt line is swapped, not grown, when the opt-in is on).

## Tested
- `node dev/access-test.js`: 15 PowerShell commands that run silently, 16 that ask (with the right kind), Remove-Item →
  the Trash (one path and a list), RunAs / Get-Credential refused, `powershell -Command` from Bash read as PowerShell;
  Full's `--tools` has Bash and PowerShell; Astra's opt-in flags (danger-full-access, first folder as `-C`, Read keeps
  its sandbox); "No such tool available" / "blocked by policy" become access events (and Hearth's own refusals don't);
  a simulated Windows run (`FAKE_WINDOWS=1`): Claude's PowerShell command goes through Hearth's check and Remove-Item
  goes to the Trash; below Full the CLI refuses PowerShell and it's reported; Astra is refused by policy, then runs
  after the opt-in in its folder.
- `dev/checks/access-chat.js` part 8 (fake-switches `windows`): Astra's refusal note with Run without its sandbox… →
  the warning → saved → the command runs; the AI setup switch; Claude at Full runs a PowerShell command through
  Hearth's check; below Full the note says why with Allow commands.
- options, lazy, astra-engine-test, tokens-test, boot-test.
- Not tested: the real Claude Code / Codex on a real Windows PC (none here). The fake engines simulate what they do.

## For the patch notes
1. Fixed on Windows: with **Full** file access, Claude can run commands again. Claude Code runs them through PowerShell there, and Hearth only switched on Bash, so they were refused ("blocked by policy") before Hearth could check them.
2. PowerShell commands get the same care as on the Mac: reading and building in its folders just happen, Remove-Item goes to the Trash, risky things ask you first.
3. Astra on Windows: if its sandbox blocks every command, the chat now says so, with **Run without its sandbox…** (also in ⋯ AI setup → Files on this computer). It asks first: without the sandbox nothing stops a command outside its folders, and its own deletes can't go to the Trash.
4. Whenever an AI's command is refused before Hearth's check, the chat says why in one line with the fix, instead of nothing.
5. To check it: ⋯ AI setup → Files on this computer → Full, then ask the chat "run Get-ChildItem in your folder".
