# Round 119 · datalock119: Hearth's data folder gets a real lock

Goal: a chat given Hearth's own folder (to change Hearth's code) must not be able to read or change the owner's data
folder, on either engine. Reading and editing Hearth's source keeps working.

## What was open
- Hearth's data folder is `data/` inside Hearth's folder: `store.js` `DATA_DIR = path.join(__dirname, 'data')`. There is
  no separate userData location for it. It holds the chats, `config.json` (keys and tokens), `memory.json`, `kv/`
  stores, sync state, `mcp-runs/`, `prompts/`, `engine.log`, and also `workspace/` (where both engines run) and
  `attachments/` (what the owner attached).
- Giving a chat Hearth's folder therefore also gave it all of `data/`:
  - **Claude**: the folder was an `--add-dir`. Claude Code reads files in its folders without asking anyone, and
    `access-rules.js` allowed edits and commands inside the folders silently.
  - **Astra**: the folder was a sandbox writable root, so `apply_patch` and shell commands could change `data/`. Reads
    are never limited by Codex's sandbox.
- Only one line of the prompt said "never edit data/".

## What is locked now
Which data folders are locked (`engines.js` `dataLocksOf`): `<folder>/data` for every chat folder that is a Hearth
source folder (`isHearthSource`), plus the running copy's `DATA_DIR` whenever a chat folder contains it (for example a
chat given the home folder). Real paths are added too, so a symlinked data folder is also covered. Two parts stay open:
`workspace/` (read and write: both engines run there, and it holds no owner data) and `attachments/` (read only: Claude
opens attached pictures from there).

**Hearth's check** (`access-rules.js` `classify({ …, locked })`, used for both engines) refuses these outright. There
is no card and no "allow more access" note:
- Read / Glob / Grep of a path in the data folder; Write / Edit / MultiEdit / NotebookEdit into it.
- Bash and PowerShell commands that touch it. This covers delete, move, copy and write targets (including inside the
  folders, which before only asked when they were outside), `>` / `>>` / `<` redirects, `cd` into it, and any
  path-like piece of any word, which includes inline code such as `node -e "fs.writeFileSync('data/config.json')"`.
  Relative paths are resolved from where the command runs, so `rm ../config.json` from `data/workspace` is caught.
  `echo` / `printf` / `git` words are not scanned, so that a commit message naming `data/x` still works.
- The refusal is one line: **"Hearth's data folder is off limits: your chats and settings live there."**

**Claude**
- The permission tool now gets the locked folders: `engines.js` passes `HUB_ACCESS_LOCKED` to `mcp/access-mcp.js`, which
  forwards them to `access.js` `check`. `access.js` also adds its own data folder whenever the chat's folders contain
  it. A locked call is denied with the line above, and nothing is shown to the owner except the activity log entry.
- Claude Code reads its folders without asking, so Hearth also passes Claude's own deny rules (`datalock.js`
  `claudeRules`, in `--disallowedTools`):
  - `Read(//…/data/<folder>/**)` and `Edit(…)` for every folder in the data folder except `workspace/`;
  - `Read` / `Edit` for its files, one rule per extension (`*.json` …);
  - `Edit` only for `attachments/`;
  - `Bash(*<data path>*)` and `PowerShell(*<data path>*)`.
  Windows paths are written `//c/…`. The rules apply in every mode, including the older Claude Code without the
  permission tool (acceptEdits).

**Astra (Codex)**: the sandbox can't keep one subfolder of a writable root read-only. Listing every other entry of
Hearth's folder as its own writable root would be about 600 entries, too long for a Windows command line, and new files
couldn't be made. So:
- **app-server (the default transport)**: for a chat whose folders hold a locked data folder (at Read & write or
  Full), the approval policy becomes `untrusted` (thread, turn and `-c`). Codex then asks before every patch and every
  command that isn't a known-safe read. `codex-server.js` answers at once through the plan's `decide` (`datalock.js`
  `codexDecider`):
  - a patch is accepted only if every file is inside the chat's folders and not in the data folder. The paths come from
    the request or from the `item/started` fileChange item, and a patch whose files Hearth can't see is declined;
  - a command is accepted only when Hearth's check would allow it silently for Claude at Full: inside the folders, no
    network, installs, deletes or system changes, and nothing naming the data folder.
  - A declined request shows its one-line reason in the thinking text. The source stays a writable root, so self-edit
    works. Read-only chats keep Codex's read-only sandbox and approval `never`. Without the sandbox (the Windows opt-in),
    the same answers apply, because `untrusted` asks for patches even then.
- **`codex exec` (the fallback transport)** can't ask. There, a folder that holds a locked data folder is left out of
  the writable roots, so Astra can read Hearth's source but not change it, and the data folder is not writable.
- Both engines get one prompt line (part `datalock`) naming the data folder as off limits.

## Limits (honest)
- **Astra's reads**: Codex's sandbox never limits reads, and known-safe commands (`cat`, `ls`, `rg`, `sed -n` …) run
  without asking. Astra can still read files in the data folder with them. Only the prompt line asks it not to.
  Commands that are not on Codex's safe list and name the data folder are declined.
- **Indirect writes**: a program the AI runs (a script in the source, `node dev/x.js`) can still write anywhere its
  process can, on both engines. Hearth checks the command line, not what the program does. Inline code that names the
  data folder is caught; a script file that builds the path itself is not.
- **Claude's whole-folder searches**: a Grep or Glob over Hearth's folder relies on Claude Code honouring its Read deny
  rules while it walks (it does for its own file tools). Data files created after the chat started that have a new
  extension or are in a new folder are not in that run's deny rules; their writes still ask Hearth and are refused.
- **`codex exec` without the sandbox** (Windows opt-in plus the exec transport) has neither the sandbox nor approvals.
  The lock there is the prompt line only.
- Codex's own approval message to the model is a plain "declined". The reason is in the prompt line and in the
  thinking text the owner sees.
- `attachments/` stays readable, including other chats' attachments, because the folder is already readable to every
  chat for attached pictures. `workspace/` stays open.

## Tests
`dev/datalock119-test.js` (in UNIT) uses its own temp folder: a copy of `engines.js` & co plus `mcp/`, holding a fake
`data/` with a config containing a fake key, another chat's file and an attachment. It checks:
- Claude's check refuses Write / Edit / MultiEdit into data; `rm` (absolute, `../`, `cd .. && rm -rf *`); `>` redirects;
  inline `node -e`; `Remove-Item`; `Copy-Item` into data; `Get-Content` of the config; reading the config and another
  chat (Read, `cat`). It allows editing / writing / reading the source, reading an attachment, a test run and a copy
  inside the source. It checks the deny rules (data folder covered, workspace open, attachments readable). A plain
  folder locks nothing.
- Astra's plan: approval `untrusted` with Hearth's `decide` and the source still writable; through a real
  `codex-server.js` Connection, patches and commands into data are declined (v2 and the older protocol); patches to
  `engines.js` and a test run are accepted; a patch with no visible files is declined; other folders are unchanged;
  `codex exec` leaves the Hearth folder out of its writable roots.
- The refusal line, and one `datalock` prompt line for both engines.

Run: `datalock119-test`, `access-test`, `astraparity116-test`, `selfmap118-test`, `robust-engine-test` and
`node dev/boot-test.js` all passed.

## For the patch notes
- When you give a chat Hearth's own folder so the AI can work on Hearth, your chats, settings, memory and keys (Hearth's
  data folder) are now locked. The AI can still read and change Hearth's code. It can no longer read or change your
  data, and it is told so in one plain line. You won't see a permission card for this: it is simply refused.
- The same lock applies to any chat whose folder contains Hearth's data folder.
- Astra on Hearth's folder now asks Hearth before each edit and command, and Hearth answers instantly, so nothing
  changes for you.

## For Codex
Minimal edits, each marked `// (round 119, datalock119)`:
- `codex-server.js`:
  - `Connection.read` keeps the last 64 `item/started` items by id (`this.items`).
  - `Connection.serverRequest`: when `this.decide` is set, the four approval requests (`item/commandExecution|fileChange/requestApproval`,
    `execCommandApproval`, `applyPatchApproval`) are answered by it: `accept` / `decline`, or `approved` / `denied` for
    the older ones. A refusal passes its reason to `onRequest`.
  - `Pool.run` takes `decide` and sets `conn.decide`; `onRequest(method, why)` shows `why` when given.
- Nothing else of Codex's changed. The decision lives in `datalock.js` (new, shared) and `engines.js`
  `codexServerPlan` (`approvalPolicy`, `decide`) / `codexArgs` (`options._server`; exec drops locked folders from the
  writable roots).
