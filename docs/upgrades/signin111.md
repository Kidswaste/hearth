# signin111 (round 111): every "you're signed out" ends in a working Sign in, on Windows, Mac and Linux

The owner, on Windows, got "Failed to authenticate: OAuth session expired and could not be refreshed" from Claude. Round
110 taught `friendlyError` that wording and sent the sign-in window through cmd's `start`, untested on Windows. This round
covers every wording both engines print, every way to Sign in, the window itself (built by a pure function, tested,
with a fallback, logged), and a last resort that needs no window at all.

## 1. The wordings

Read from the engines' own sources, not guessed: Claude Code 2.1.42's `cli.js` (the copy in this container's
node_modules) and Codex's `codex-rs` (login/src/auth/manager.rs, cli/src/login.rs, protocol/src/error.rs from GitHub).

| Engine | What it prints |
| --- | --- |
| Claude Code | `Not logged in · Please run /login` · `Invalid API key · Please run /login` · `OAuth token revoked · Please run /login` · `OAuth token has expired…` · `API Error: 401 {…authentication_error…} · Please run /login` · `Failed to authenticate. API Error: 401 …` · `Failed to authenticate: OAuth session expired and could not be refreshed` · `Your account does not have access to Claude Code. Please run /login.` · `Your account / organization does not have access to Claude. Please login again…` · `Session expired. Please run /login to sign in again.` · `Your session has expired. Please run /login…` · `Please run /login and sign in with your Claude.ai account` · `Not logged in. Run claude auth login to authenticate.` |
| Codex | the five "Your access token could not be refreshed …" lines (expired / already used / revoked / unknown / another account) · `Your refresh token has already been used… Please try signing in again.` · `Not signed in. Please run 'codex login'` · `Not logged in` · `Run codex login again…` · `Fix auth storage access or run codex login again.` · `ChatGPT auth is missing a refresh / access token` · `Missing sign-in credentials` · `Token data is not available.` · `ChatGPT login is required…` · `Failed to refresh token: …` · `unexpected status 401 Unauthorized: … auth error code: token_expired` · `exceeded retry limit, last status: 401 Unauthorized` |

**Before:** two regexes that disagreed. `engines.js` (round 110's list) and `offline-core.js` (the chat's "Signed out —"
line) each had their own. Both matched any `\b401\b` and any "unauthorized", so a file path with a `401` folder, a
PowerShell `UnauthorizedAccess` error, or an MCP server's own 401 got a Sign in button that couldn't help.

**After:** one test, `OfflineCore.signedOut(text)`, used by both. It has strong words (the engine's own "sign in again"
wordings, which count whatever else the line says) and weak words (401 after "error / status / HTTP", "401 Unauthorized",
`authentication_error`, "token expired", "please log in"). Weak words don't count when the line is about something else
that signs in: an MCP server or connector, git / GitHub, Bedrock / AWS / Vertex / Azure, or a proxy (407). "Invalid API key
· Fix external API key" (a key set in the environment) is not a sign-in either: the fix says to remove ANTHROPIC_API_KEY /
OPENAI_API_KEY. The fix line names `/astra-login` only for Codex.

The other places that decide "signed out":
- `installs.js signedIn()` (the doctor, the engine check, AI setup's "Found and signed in"): **a real bug.** Claude Code
  2.1's `auth status` answers JSON (`{ "loggedIn": false, … }`, exit code 1). Hearth looked for "not logged in" in words,
  found none, saw exit code 1 and answered "can't tell". A signed-out Claude Code **never** showed as signed out in
  /doctor or AI setup. It now reads `loggedIn`.
- `engines.js doctor()` (Codex's `login status`): unchanged, its words match.
- `aicheck.js`, `astra.js` (`needsLogin` from the run's error), `engine-health.js` (`signedIn === false`): unchanged,
  they read the two above.

`dev/signin111-test.js` checks 16 Claude Code and 21 Codex wordings on Windows, Mac and Linux (and the chat's line), and
23 ordinary errors that must never get Sign in.

## 2. Every path to Sign in

All of them now go through one function, `EngineHealth.signIn(engine, { agentId })` (or `Native.signIn`, which loads
engine-health first when needed). It returns `{ ok, how, text }`, and the caller shows `text`.

| Path | Before | After |
| --- | --- | --- |
| The chat's error card (`native.js .login-btn`, also in offline.js's "Signed out — Sign in" line) | `hub.login` → true/false. "Finish signing in in the window that opened (it may be behind Hearth), then press Retry", or "couldn't open, open the doctor". Not found and "couldn't open" looked the same. | The card's line says which of three things happened: **a window opened** ("it may be behind Hearth… Hearth notices by itself and sends your message again", with a **No window?** button for the link), **no window could be opened** (the link dialog opens by itself), or **not found** ("Install it first", with an Install button in the toast). |
| Ctrl+K → "sign in" (`chat-cmds.js` login) | "Finish signing in in the window that opened." or "Couldn't find the engine". "Couldn't open" was reported as "not found". | The same three answers as the card, as the command's reply. |
| The doctor's fix, AI setup / "Check this computer" (`EngineHealth.fix(e, 'login')`) | `engineFix` → a toast "Signing in in the PowerShell window…", or "Couldn't open a window… run this yourself". | `fix(e, 'login')` is `signIn(e)`: the same three answers, the link dialog when no window opens. |
| Astra (`astra.js`: the collab card's Sign in, the "Codex isn't signed in" link, /astra-login, the palette action) | `hub.login('codex')` with no word back (except /astra-login's two cases). | `Native.signIn('codex')` (4 small marked edits, see "For Codex"). |

**After the sign-in**, Hearth notices by itself:
- The window writes its marker file when its work ends (as before). The link's engine reports when it exits.
- Either way, the engine is checked again. If it isn't signed out, every chat whose last message is "isn't signed in"
  gets one of two things:
  - **Sent again by itself** when that is safe: the sign-in was started from that chat less than 30 minutes ago; the
    failed turn wrote nothing (the message before the error is the owner's own); the engine said "signed in" (not
    "can't tell"); and nothing runs in that chat. It goes through offline.js's Retry, so it uses the same chat and the
    same engine session, and nothing the engine already has is sent again.
  - **A Retry toast** otherwise.
- If the engine is still signed out, the existing "isn't signed in" toast comes back with its Sign in button.

## 3. The Windows window

`installs.js` now has a pure builder, `terminalPlan({ platform, title, script, file, env, has, terms })`, and
`tryAll()`, which tries each way in turn.

**Windows**, first try:
`<ComSpec> /d /s /c "start "<title>" "<SystemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NoExit -ExecutionPolicy Bypass -EncodedCommand <base64>"`
- **Quoting.** With `/s` and outer quotes, cmd takes everything between the first and last quote as the line. This is
  what Node's own `shell: true` does. Round 110 had no outer quotes, which works too, but only by luck of the first
  character.
- **The title.** It keeps only letters, digits and `. , : ( ) + -`. Round 110 turned `"` into `'` but kept `%` (cmd
  expands `%NAME%` even inside quotes) and `^ & | < >`. Hearth's titles have none of these today. The test feeds all of
  them in.
- **The base64.** It holds only `A–Z a–z 0–9 + / =`, which cmd never reads. The test decodes it back to the script.
- **cmd's 8191-character limit.** If the whole line (`"<cmd>" /d /s /c "start …"`) would come within 64 characters of
  it, the same script runs from a `.ps1` file (UTF-8 with BOM, for Windows PowerShell 5) with `-File "<file>"`. A sign-in
  line is about 1.5–2 k characters, so this is only a guard.
- **ComSpec.** It is used only when it names a `cmd.exe` with no quote and no `%`. Otherwise Hearth uses
  `%SystemRoot%\System32\cmd.exe`. PowerShell is called by its full path when it's there, else `powershell.exe`.
- **Why the window was missing.** Before round 110, the detached `powershell.exe` was started straight from Electron.
  Detached on Windows means `DETACHED_PROCESS`, so there was no console: an invisible PowerShell, which is the owner's
  "nothing opens". Now cmd is detached (it has no console, so nothing flashes) and `windowsHide` is off. `start` always
  gives PowerShell its own new, visible console. Round 110 set `windowsHide: true` on cmd. Whether cmd's `start` passes
  that hidden flag on to the window is not documented, so it is off now.
- **How a failure is seen.** cmd's exit code: `start` returns non-zero when it can't start the program.

Then, if that fails: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Start-Process -FilePath '<powershell.exe>' -ArgumentList '<same arguments>'"`
(the single quotes inside are doubled, for a user name like O'Brien).

**Mac:** `/usr/bin/open -a Terminal <file>.command`, then `/usr/bin/open <file>.command` (the app that opens .command
files, such as iTerm, when Terminal isn't there).

**Linux:** each terminal found on PATH, in order: x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal, kitty,
alacritty, foot, xterm. A terminal counts as opened when it's still running 1.5 s later or exited 0. The `sh -c` line
quotes the script's path. The test runs it for real from a folder named `it's here $HOME \`x\``.

**Logs.** Every attempt goes to `data/engine.log`: `terminal: start: C:\…\cmd.exe /d /s /c "start … -EncodedCommand VwBy…(1868 chars)" → opened`.
Long arguments are cut in the log. The callers that don't wait (ffmpeg, gltfpack, the updater) keep their quick
`runInTerminal()`. It answers at once and runs the same attempts in the background. Sign-in and the engine fixes use
`openTerminal()`, which waits for the answer.

## 4. Sign-in without any window

`claude auth login` (Claude Code 2.1) and `codex login` both work with their output captured, no terminal needed. From
their sources:
- Claude Code prints "Opening browser to sign in… If the browser didn't open, visit: <https://claude.ai/oauth/authorize?…>",
  waits on its own localhost page, then prints "Login successful." (exit 0) or "Login failed: …" (exit 1).
- Codex prints "…navigate to this URL to authenticate: <https://auth.openai.com/oauth/authorize?…>", then
  "Successfully logged in".

Both open the browser themselves. `engines.signInByLink(engine)` runs that command. It takes **only the link** from the
output: an `https` page of the engine's own service (claude.ai / claude.com / anthropic.com / openai.com / chatgpt.com,
no user:password in it). Hearth shows it in a dialog with **Open in browser** and **Copy link**, and reports how it ended.
Then the engine is checked again, as after a window.

**Never `setup-token`.** It prints a long-lived token, and Hearth never handles tokens or passwords. The output stays in
memory and only the link's host goes to the log. The test checks that no link, `state` or `client_id` reaches the log.

**When it is used:**
- by itself, when no window could be opened (every attempt failed, or no terminal on Linux);
- from **No window?** (on the card and in the toast), when a window "opened" but nothing showed (the owner's case).

It runs one at a time per engine, and asking again gives the same link. **Cancel** stops the engine waiting. It gives up
after 30 s without a link and after 15 min without the browser coming back. A Claude Code without `auth login` gets "too
old to sign in from Hearth: update it". The dialog's "didn't finish" state shows the terminal command with Copy.

## Tests and checks
- `node dev/signin111-test.js` (unit, added to `release`): the wordings, the exact argv per platform, the attempts in
  order and logged, the link (Claude and Codex fakes speak the real words: dev/fake-claude.js / fake-codex.js, switches
  `loginFails`, `loginMs`), Claude Code's JSON `auth status`. Fake engines only. A "not found" run was left out on
  purpose: a path that isn't there makes Hearth look for the engine elsewhere, and this computer has a real Claude Code.
- `dev/robust-engine-test.js`: `fix()` / `login()` now answer once the window opened (async).
- `dev/checks/robust.js`: the card says a window opened. After the sign-in, the message goes out again by itself, once,
  and is answered.
- `docs/windows-test-plan.md` §17: the six paths on the PC, with what engine.log should say.

## For Codex
`astra.js` (yours), four one-line edits, each marked `signin111`. Astra's Sign in buttons now go through
`Native.signIn(engine)` instead of `window.hub.login(engine)`, so they say what happened (window / link / not found) and
the chat is sent again after the sign-in. Each keeps `window.hub.login` as a fallback.
- the collab card's Sign in (`p.needsLogin ? el('button', …)`)
- the "Codex isn't signed in" link in Astra's status line
- `/astra-login` (returns `Native.signIn`'s text)
- the palette action "Astra: sign in with ChatGPT"

## For the patch notes
- **Signing in works however it's asked.** Every message Claude Code or Codex gives when you're signed out (expired,
  revoked, "please run /login", "could not be refreshed", "401 Unauthorized"…) now shows a Sign in button. Ordinary
  errors no longer show one by mistake.
- **Sign in tells you what happened.** You see one of three things: a window opened (it may be behind Hearth), the
  window couldn't open (Hearth shows the sign-in link instead), or the engine isn't on this computer (with Install).
- **No window? Sign in from Hearth.** A dialog shows the engine's own sign-in link, with Open in browser and Copy link.
  You sign in in your browser, and Hearth never sees your password.
- **Your message goes out again by itself** once you've signed in, when nothing of the reply had started. Otherwise
  Hearth offers Retry.
- **The doctor and AI setup now notice a signed-out Claude Code.** Before, they couldn't tell.
- **Windows:** the sign-in window opens in front. If the first way fails, Hearth tries a second, and each try is noted
  in the engine log.
