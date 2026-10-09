# Robust (round 9): Hearth against your real Claude Code and Codex

Tonight's real Mac runs went wrong in one way after another. An old Claude Code (2.1.1) rejected Hearth's options. Sign-in
opened no window. The model then refused with "version 2.1.280 or newer is required". Codex cancelled every Lab tool
call ("Lab access was blocked"), and a shared tool file was deleted under a retry ("Invalid MCP configuration").
Each of those was fixed on the spot. This stream makes the whole class work: Hearth reads your installs up front, picks
the copy that works, heals what a second try can fix, and when it can't, it says exactly what to do and does it in a
window you can see. It runs on Mac, Windows and Linux. Nothing here adds tokens: prompts and flags of normal runs are
unchanged (`dev/director-cost.js` reports the same numbers as before).

## Your installs, known up front
1. **Engine check at startup**: once the window is idle, the main process reads the version of the Claude Code and Codex Hearth will use (`--version`). It reads each program once and remembers it by path, size and date, so the next start costs nothing until that program changes.
2. **Every copy is found**: all PATH folders, Homebrew (`/opt/homebrew`, `/usr/local`), npm global (`~/.npm-global`, nvm, Volta, Bun, Windows' `%APPDATA%\npm` Codex), the native installer's `~/.local/bin` and `~/.claude/local`, the Claude desktop app's bundled claude-code (Mac and Windows, the 3 newest versions), Codex.app / ChatGPT.app (also in `~/Applications`), `Application Support/Codex` and the Windows Codex app folder. A program reached through two links counts once.
3. **The newest working copy is used automatically**, and remembered so the next start uses it straight away. A program set in Settings → Engines still wins.
4. A version check never starts the Codex or Claude **desktop app** itself (an app bundle's own `Contents/MacOS` program is skipped).
5. **Hearth knows the minimum**: Claude Code 2.1.280 (from tonight's error). A newer minimum named by any later error ("version X or newer is required") is learned and kept.
6. **Signed in?** is checked up front: Codex with `login status`. Claude Code is asked `auth status` only when its `--help` lists `auth`, because an older copy would have taken "auth status" as a prompt.
7. **One calm notice** (a toast) when an engine one of your agents uses is missing, too old, not answering, signed out, or pinned in Settings to an older copy than one installed. It shows one problem at a time ("+1 more: /doctor") and the same problem at most once a day. It shows nothing when all is well or no agent uses that engine.
8. **One-click fix in that notice**: Update Claude Code, Install Codex, Sign in to Codex, or "Use 2.1.400" (unpins the older copy).
9. **The fix runs in a window you can see**: on a Mac a Terminal window (a `.command` file), on Windows a PowerShell window (the command is passed encoded, so paths with spaces or apostrophes can't break it), on Linux the first terminal found. Hearth never sees your password.
10. **The right update for the way it was installed**: `claude update`, `brew upgrade claude-code` / `brew upgrade codex`, `npm i -g @anthropic-ai/claude-code@latest` / `@openai/codex@latest`, `bun add -g …`. The desktop app's bundled copy, or no copy at all, gets the official installer (`curl -fsSL https://claude.ai/install.sh | bash`, on Windows `irm https://claude.ai/install.ps1 | iex`). Hearth then prefers that newer copy by itself.
11. **Checked again when the window is done**: "Claude Code 2.1.400 is ready and signed in ✓", or the problem that's left with its button. Open chats redraw.
12. After an update, the options an older Claude Code rejected are learned again for the new program.
13. If no window can open, the notice gives the exact command with a **Copy** button.
14. **Sign-in everywhere**: the error's sign-in button, `/login` and `/astra-login` now use the same visible window on Mac, Windows (PowerShell, falling back to `/login` for a Claude Code without `auth login`) and Linux (before, Linux opened nothing). Hearth checks the engine again afterwards.

## Runs that heal themselves
15. **Too old for the model**: the minimum is learned and the reply continues on a newer copy found on this computer, with a note in the thinking fold ("continuing with the newer copy Hearth found (2.1.500)"). This doesn't happen when Settings → Engines pins a program.
16. Otherwise the error has an **Update Claude Code** (or Update Codex) button under it, and its fix line names the exact command.
17. **"Invalid MCP configuration"** (the tool file went missing): one more run with a freshly written file. If it comes back, the error says Hearth already tried and points to /doctor.
18. **Codex cancelling Hearth's tool calls**: the run is stopped before the model writes "Lab access was blocked", then run once more with approvals off (`approval_policy="never"`; the sandbox stays as it was). This catches Codex versions that ignore the pre-approval setting.
19. If Codex still cancels, the error says so precisely ("Codex cancelled Hearth's tool call three · three_screenshot") and offers Update, instead of the model's vague apology.
20. **A dropped connection** (ENOTFOUND, ECONNRESET, "stream disconnected"…): one more try after 3 s, with a note. Stop works during the pause. If it's still down, the fix says Hearth already tried.
21. An unknown-option error Hearth can't work around gets **Update** under it. "Couldn't start the engine" gets **Run /doctor**.
22. **Engine not found**: the error offers **Install** at once (the official installer, or npm for Codex).

## /doctor
23. **`/doctor`**: one card for both engines. It shows the version, where the copy came from (Homebrew, npm, installer, desktop app or Settings → Engines), its path, whether it's signed in, the minimum, too old or not, and every other copy with its version.
24. **The fixes are buttons on the card** (Update, Install, Sign in, Use the newer copy), plus **Check again**.
25. **Test both (a few tokens)**: one lean "Reply with just: OK" to a Claude agent and an Astra agent, with how long each took. This is the end-to-end proof of sign-in, model, version and network.
26. The card refreshes itself when a fix it started is done.
27. **`/astra-doctor` is the same card** (the old name works, `--run` still sends Astra a test). Astra's own details (its settings, tool servers, prompt size per message) are included without repeating the engine lines.
28. **`/engines`** now lists every copy with its version. `/engines claude <path>` pins one, `/engines claude auto` goes back to the newest.
29. **`/engine-update [claude|codex]`** updates (or installs) in a visible window, then checks again.

## The black Lab preview
30. Fixed: **the Lab preview went black after `/director-engine astra`**. Every config save put every surface back into the page, and moving a frame restarts it, so the Lab's sandbox came back up empty and nobody ran the sketch. Surfaces now move only when they are out of order, so the engine switch (or any setting) leaves the Lab drawing on the same page.
31. Same cause, also fixed: website agents and the other tools' frames are no longer moved, and so restarted, by every config save.
32. Safety net: a Lab preview the browser restarts by itself runs its sketch again (the shader tab recompiles) instead of staying black.

## Fakes that act like the real CLIs (for development)
33. `dev/fake-claude.js` / `dev/fake-codex.js` failure switches, set from the environment or from `data/kv/fake-switches.json`: an old version, a minimum the model needs, signed out, network drop (once or always), MCP config missing, Codex cancelling tools (`new` / `old` / `always`), no `auth` command. `claude update`, `auth login` and `codex login` change the fake's state the way the real ones would.
34. Checks: `dev/robust-engine-test.js` (22 Node tests, in the unit group), `dev/checks/robust.js` (the notice, the fix windows, errors, healing and /doctor clicked like a user) and `dev/checks/robust-lab.js` (the preview through an engine switch, a config save and a forced restart). Run them with `sh dev/run-checks.sh robust unit`.
35. Test copies of Hearth (`dev/smoke.js`) never pick up the machine's real Claude Code or Codex, and fix windows run headless there: brew, npm and the installers are only echoed, never run.
