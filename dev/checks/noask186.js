// (round 186, noask186) An AI that works without asking, and the "Show full reply" button under the folded text.
//   1. before: a push, a delete for good, an install and a network command each show an approval card
//   2. with "Work without asking": they go ahead (logged "by: trust"); what still asks still asks; refusals stay
//   3. a long reply with a picture after its text: the button sits right under the text, and a click on the text opens it
//   node dev/smoke.js --fake-engines --script dev/checks/noask186.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
try {
  await until(() => typeof Lazy !== 'undefined' && typeof Native !== 'undefined', 20000);
  await Lazy.load('access');
  const claude = H.claudeAgent();
  const dir = `${(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '')}/noask186-work`.replace(/\\/g, '/');
  await window.hub.fs.write(`${dir}/a.txt`, 'a\n');
  await Access.setAiLevel(claude.id, 'full');
  await Access.addAiFolder(claude.id, dir);
  out.info.dir = dir;

  // the approval card is answered by whoever is watching: here, a card that appears is noted and denied
  let cards = 0;
  const watch = new MutationObserver(() => { for (const b of document.querySelectorAll('.access-card button, .access-ask button')) if (/^deny$/i.test(b.textContent.trim()) && !b.dataset.seen) { b.dataset.seen = '1'; cards += 1; b.click(); } });
  watch.observe(document.body, { childList: true, subtree: true });
  const run = async (command) => { const before = cards; const r = await Access.check({ tool: 'Bash', input: { command }, id: `t${Math.random()}`, agentId: claude.id, chatId: null, cwd: dir }); await wait(50); return { allow: r.value.behavior === 'allow', asked: cards > before, msg: r.value.message || '' }; };
  const CMDS = { push: 'git push', reset: 'git reset --hard', install: 'npm install left-pad', net: 'curl https://example.com' };

  // ---------- 1. before ----------
  const b1 = {}; for (const [k, c] of Object.entries(CMDS)) b1[k] = await run(c);
  ok(Object.values(b1).every((r) => r.asked && !r.allow), 'before: each of them shows a card', b1);

  // ---------- 2. without asking ----------
  ok(await Access.setNoAsk(claude.id, true, { confirm: false }) && H.agent(claude.id).noAsk === true, 'the AI is set to work without asking');
  const a1 = {}; for (const [k, c] of Object.entries(CMDS)) a1[k] = await run(c);
  ok(Object.values(a1).every((r) => !r.asked && r.allow), 'after: none of them asks, all go ahead', a1);
  const still = { secrets: await run(`cat ${dir}/.env`), outside: await run('rm -rf /somewhere/else/entirely'), system: await run('shutdown now') };
  ok(still.secrets.asked && still.outside.asked, 'a file that holds keys and a delete outside its folders still ask', still);
  const sudo = await run('sudo apt install x');
  ok(!sudo.allow && !sudo.asked, 'what needs a password is still refused', sudo);
  const R = AccessRules;
  ok(Access.stillAsks({ action: 'system', why: 'x' }) && Access.stillAsks({ action: 'run', why: 'a command Hearth can\'t read (unclosed quote)' }) && !Access.stillAsks({ action: 'publish', why: 'pushes to a remote' }) && R, 'the rule: system changes and unreadable commands ask; a push does not');
  await Access.setNoAsk(claude.id, false);
  const back = await run(CMDS.push);
  ok(back.asked && !H.agent(claude.id).noAsk, 'turned off: it asks again', back);

  watch.disconnect();

  // ---------- 3. the fold button sits under the text ----------
  const now = Date.now();
  const long = Array.from({ length: 90 }, (_, i) => `Paragraph ${i + 1}: a line of a long reply that goes on for a while so the reply folds.`).join('\n\n');
  await window.hub.saveChat({ id: 'na-fold', agentId: claude.id, title: 'fold', updatedAt: now, messages: [
    { role: 'user', text: 'one', at: now }, { role: 'assistant', text: long, at: now, suggest: ['next'], lastReply: true, remembered: ['a fact'] },
    { role: 'user', text: 'two', at: now }, { role: 'assistant', text: 'short', at: now }] });
  H.chats = await window.hub.listChats();
  await Native.open(claude.id, 'na-fold');
  const node = await until(() => document.querySelector('.msg.assistant.collapsed'), 10000);
  if (ok(Boolean(node), 'the long reply is folded')) {
    const btn = node.querySelector('.show-more-msg');
    ok(btn && btn.previousElementSibling === node.querySelector(':scope > .body'), 'the button is right under the folded text, before what follows it', [...node.children].map((c) => c.className));
    ok(btn && btn.getBoundingClientRect().width > node.getBoundingClientRect().width * 0.8, 'and as wide as the reply', btn && [btn.getBoundingClientRect().width, node.getBoundingClientRect().width]);
    node.querySelector(':scope > .body p').click();
    await wait(150);
    ok(!node.classList.contains('collapsed') && !node.querySelector('.show-more-msg'), 'a click on the folded text opens the reply');
  }
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
