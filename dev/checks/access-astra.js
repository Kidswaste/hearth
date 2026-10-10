// Access (round 14) on Astra (Codex): the chat's level maps to Codex's sandbox (Read → read-only with its shell,
// Read & write → workspace-write on the chat's folders, no network, no approvals it can't show), its edits and commands
// land in the chat's activity log, and files it moves into .hearth-trash/ go to the Trash after its turn.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --lib dev/checks/journey-lib.js --script dev/checks/access-astra.js
const { step, wait, until } = J;
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const fsx = window.hub.fs;
const dir = `/tmp/hearth-access-astra-${Date.now().toString(36)}`;
const other = `${dir}-other`;
await fsx.write(`${dir}/old.txt`, 'old');
await fsx.write(`${other}/keep.txt`, 'keep');
activate(astra.id);
Native.newChat(astra.id);
await wait(300);
const run = async (calls) => { await Native.send(astra.id, `access: ${JSON.stringify(calls)}`); await wait(300); await until(() => !Native.isBusy(H.activeChat[astra.id]), 60000); await wait(800); return Native.chatOf(astra.id).messages.at(-1)?.text || ''; };

await Commands.tryRun('/access write', astra.id);
await Commands.tryRun(`/access add ${dir}`, astra.id);
await Commands.tryRun('/access remove 1', astra.id); // only the test folder
step('Read & write with one folder', Native.chatOf(astra.id).access.level === 'write' && Native.chatOf(astra.id).access.folders.join() === dir, Native.chatOf(astra.id).access);
let reply = await run([
  ['Write', { file_path: `${dir}/new.txt`, content: 'fresh' }],
  ['Write', { file_path: `${other}/sneaky.txt`, content: 'no' }],
  ['Bash', { command: `mkdir -p "${dir}/.hearth-trash" && mv "${dir}/old.txt" "${dir}/.hearth-trash/"` }],
]);
step('workspace-write on the chat folder, no network, approvals never', /sandbox: workspace-write; roots: /.test(reply) && reply.includes(dir) && /network: false/.test(reply) && /approvals: "never"/.test(reply), reply.match(/sandbox:[^\n]*/)?.[0]);
step('a write inside the folder works, outside it is blocked by the sandbox', await fsx.read(`${dir}/new.txt`) === 'fresh' && !(await fsx.stat(`${other}/sneaky.txt`)));
await until(async () => !(await fsx.list(`${dir}/.hearth-trash`).catch(() => [])).length, 5000);
step('what it moved into .hearth-trash/ went to the Trash after its turn', !(await fsx.list(`${dir}/.hearth-trash`).catch(() => [])).length && !(await fsx.stat(`${dir}/old.txt`)));
const log = await Access.entries(H.activeChat[astra.id]);
step('the log has its edit, its command and the Trash', log.some((e) => /Created new\.txt/.test(e.what)) && log.some((e) => e.action === 'run' && /mkdir/.test(e.what)) && log.some((e) => e.result === 'trashed' && /old\.txt/.test(e.what)), log.map((e) => `${e.result}:${e.what}`).slice(-6));

await Commands.tryRun('/access read', astra.id);
reply = await run([['Bash', { command: `touch "${dir}/nope.txt"` }], ['Bash', { command: `ls "${dir}"` }]]);
step('Read: a read-only sandbox, but its shell works for looking', /sandbox: read-only/.test(reply) && /shell: on/.test(reply) && /Bash: ran · new\.txt/.test(reply) && !(await fsx.stat(`${dir}/nope.txt`)), reply.match(/Access calls:[\s\S]*/)?.[0].slice(0, 300));

await Commands.tryRun('/access off', astra.id);
reply = await run([['Bash', { command: 'ls' }]]);
step('Off: no shell at all (as before round 14)', /shell: off/.test(reply) || /Bash: no shell tool/.test(reply), reply.slice(-160));
step('no errors in the window', !J.out.errors.length, J.out.errors.slice(0, 3));
return J.done();
