# Check this AI (round 32): "what's wrong, and what do I press?"

You lost an hour on Windows: Astra's commands said "blocked by policy", Claude's too until a fix, and nothing told you
what was wrong or what to press. Now one button runs a short real test through the AI's own engine and shows a plain
checklist, with a fix on each line that fails.

## What shipped
**The check**
1. **Check this AI**: ⋯ AI setup → What it can use, right under Files on this computer, for the AI picked at the top
   (Claude or Astra). Its tooltip says it uses a few tokens.
2. **Found and signed in**: the engine is there, its version is new enough, it's signed in. This part uses no tokens
   (the same check as /doctor).
3. **Answers a message**: one tiny real run. It's lean: no Hearth tools, the cheapest model and the least thinking
   (Haiku for Claude, Luna for Astra; if your account can't use that model, it tries once more with the AI's own
   model), and the line says how long it took and about how many tokens it used.
4. **Reads its folder**: Hearth puts a small file with a code in the AI's first folder, and the AI has to read it back.
   The line passes only if the code comes back.
5. **Writes a file there**: the AI creates a new file, and Hearth looks for it on disk.
6. **Runs a command**: the AI lists the folder (ls / Get-ChildItem). The line passes only if the command really ran
   and came back fine.
7. Hearth judges every line from what actually happened (the code, the file, the command's own result), not from what
   the AI says. Both test files then go to the Trash, so nothing is deleted for good.
8. If the engine is missing, too old or signed out, the file lines aren't tested (no tokens spent on a test that
   can't work). They say "fix the line above first".

**The fixes (one button per failing line)**
9. **Install / Update Claude Code or Codex**: runs in a visible Terminal / PowerShell window. The command is in the
   button's tooltip, and Hearth checks again when the window's work ends. Nothing installs until you click.
10. **Sign in to …**: opens the engine's own sign-in window. Hearth never sees your password.
11. **Allow edits**: sets Files on this computer to Read & write for this AI (every chat with it).
12. **Allow commands**: sets Files to Full (risky things still ask you first).
13. **Run without its sandbox…** (Astra on Windows): the existing warned opt-in, with its warning first. One button
    even when reading and commands both failed for that reason.
14. **Read & write, without its sandbox…** (Astra on Windows at Read): both steps, and it still asks first.
15. **Update Claude Code** when Claude Code blocked its own command tool at Full (an old version or a policy).
16. **Open AI setup** when the folder is missing, and **Check again** after any fix. A fixed line says "changed: check
    again". Hearth doesn't re-run the test on its own, so you decide when to spend the tokens.

**Where else**
17. **The last result stays readable**: the row shows "7 of 7 ok · 14:02" or "2 to fix · 14:02". Click it to show or
    hide the list. It's kept per computer, because engines are per computer.
18. **The chat's one-line refusal notes** (can't change a file, can't run a command, Astra's sandbox, Claude Code
    blocking its tool) offer **Check this AI** next to their fix. It opens AI setup on that AI with the check running.
19. `/check-ai` runs it from a chat (the command stays in the background, like all of them).

Token cost: nothing is added to normal prompts. The check is one tiny run, only when you press the button. On the fake
engines it took ≈ 900 tokens for Claude and ≈ 4.5k for Astra, mostly cached (Codex's fixed overhead).

## Files
- New: `aicheck.js` and `aicheck.css`, loaded with ⋯ AI setup (the `options` lazy group in `lazy-data.js`; the
  manifest was regenerated for `/check-ai`).
- Small hooks:
  - `options.js`: one row.
  - `access.js`: the "Check this AI" button on refusal notes.
  - `engines.js`: `options.accessCheck`, a lean run that keeps the AI's file access. Lean runs dropped it before.
  - `dev/fake-common.js`: the fake engines follow the check's three steps. Codex reads with `cat`, like the real one.
- Check: `dev/checks/aicheck.js` (group `aicheck` in `dev/run-checks.js`).

## Tested
- `dev/checks/aicheck.js` (fake engines), with these results:
  - Claude at Read: found, version, signed in, answers and reads pass; writes fails with Allow edits, and runs fails
    with Allow commands. Both buttons work (the AI goes to Read & write, then Full). Check again: 7 of 7 pass, and
    the test files are gone from the folder.
  - The row shows "7 of 7 ok · time" after the panel is reopened.
  - On a simulated Windows PC (fake-switches `windows`), Astra at Read & write: reads and runs fail with "its sandbox
    blocks commands on Windows (blocked by policy)" and one "Run without its sandbox…" button. The warning appears,
    the setting saves, and Check again passes every line.
  - A refusal note in an Astra chat has "Check this AI". It opens AI setup on Astra with the check running and the fix
    shown.
  - Claude signed out: "Not signed in" with Sign in, and nothing else is tested. Sign in runs the fake's own sign-in,
    and Check again passes every line.
  - No errors in the window, no duplicate commands.
- `sh dev/run-checks.sh options access-chat aicheck lazy tokens-test astra-engine-test access-test`: 7/7 passed.
- Not tested: the real Claude Code and Codex on a real Windows PC (none here). A real model may word its reply
  differently, but the lines don't depend on its words.

## For the patch notes
1. New: **Check this AI** in ⋯ AI setup → What it can use. One button runs a short real test of the AI you picked and
   shows a plain checklist: found, up to date, signed in, answers, can read its folder, can write a file there, can
   run a command.
2. Every line that fails has its own fix button: Install / Update / Sign in, Allow edits, Allow commands, and on
   Windows, Astra's "Run without its sandbox…". Installs and sign-ins only happen after you click, in their own window.
3. It uses a few tokens: one tiny message on the cheapest model, only when you press it. Normal messages don't change.
4. The test file it writes goes to the Trash afterwards, so it's recoverable.
5. The last result and its time stay on the row ("7 of 7 ok · 14:02"), so you can read it later.
6. When a chat says it couldn't change a file or run a command, its note now has **Check this AI** too: one obvious
   next step.
7. Caveat: tested with simulated engines (including a simulated Windows PC), not yet on a real Windows install.
