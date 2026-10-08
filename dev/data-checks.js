// Import / backup / restore / trash checks (throwaway copy only):
//   node dev/smoke.js --eval "window.__export='/abs/claude-export.zip'" --script dev/data-checks.js
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickOk = async (label) => {
  for (let i = 0; i < 40; i += 1) {
    const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.startsWith(label));
    if (b) { b.click(); return true; }
    await sleep(100);
  }
  return false;
};
// import: check first (dry run), confirm, import
const imp = Addons.importChats(window.__export);
await sleep(400);
out.previewText = document.querySelector('dialog[open] .modal-text')?.textContent;
out.clicked = await clickOk('Import ');
const r = await imp;
out.imported = `${r?.imported} imported · ${r?.empty} empty · ${r?.duplicates} dup`;
out.chats = H.chats.length;
// importing again: nothing new
const again = Addons.importChats(window.__export);
await sleep(400);
out.againText = document.querySelector('dialog[open] .modal-text')?.textContent?.split('\n')[0];
document.querySelectorAll('dialog[open]').forEach((d) => d.close());
await again;
// backup, then delete a chat, then restore it from the backup
H.config.settings = { ...H.config.settings, backupDir: '/tmp/hearth-smoke-backups-data' };
await saveConfig(); await sleep(400);
const b = await AppUI.backupNow();
out.backup = b ? `${b.path} ${b.size}` : 'failed';
const victim = H.chats[0];
await window.hub.deleteChat(victim.id);
H.chats = await window.hub.listChats();
out.afterDelete = H.chats.length;
const trash = await window.hub.listChatTrash();
out.trash = trash.length;
const restore = AppUI.restoreBackup(b.path);
await sleep(500);
out.restoreText = document.querySelector('dialog[open] .modal-text')?.textContent?.slice(0, 200);
out.restoreClicked = await clickOk('Restore');
const done = await restore;
out.restored = done ? `chats +${done.chats.add}` : 'none';
out.afterRestore = H.chats.length;
// trash dialog: the deleted chat is still in the trash (restore copied it back); delete it for good
const dlg = await AppUI.trashDialog();
await sleep(200);
out.trashRows = dlg.querySelectorAll('.download-row').length;
dlg.close();
await window.hub.fs.list('/tmp/hearth-smoke-backups-data').then((l) => { out.backupFiles = l.length; });
return JSON.stringify(out, null, 1);
