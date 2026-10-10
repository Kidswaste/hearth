// Commands page: runs in "Going now" leave by themselves after a while untouched (6 h by default, right-click → Leave
// "Going now" after…) and can be removed: × on the row, Delete on a focused row, right-click → Remove it / Clear
// every finished run. A removed run is gone for good (Flows.forget), a run still going is stopped first.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/commands-page-runs.js --shot /tmp/commands-page-runs.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const row = (id) => document.querySelector(`.cp-runrow[data-run="${id}"]`);
const refresh = async () => { CmdPage.refreshList?.(); document.querySelector('.cp-search')?.dispatchEvent(new Event('input')); await wait(400); };
async function halfRun() {
  CmdPage.open('calc'); await wait(300);
  document.querySelector('.cp-use').click();
  await until(() => CmdPage.state.runId && Flows.run(CmdPage.state.runId)?.status === 'waiting-you', 6000);
  return Flows.run(CmdPage.state.runId);
}
try {
  store.set('cmdpage.goingHours', 6);
  const a = await halfRun(); const b = await halfRun(); const c = await halfRun();
  CmdPage.open(); await wait(300); await refresh();
  ok(row(a.id) && row(b.id) && row(c.id), 'three runs under Going now');

  // × on a row (a run still waiting: stopped, then removed)
  const x = row(a.id).querySelector('.cp-rx');
  x.click(); await wait(300);
  ok(!row(a.id) && !Flows.run(a.id), '× removes it (gone from the list and from the runs)');

  // Delete on a focused row
  row(b.id).focus(); row(b.id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await wait(300);
  ok(!row(b.id) && !Flows.run(b.id), 'Delete removes the focused run');

  // untouched for 7 hours: leaves by itself, still kept
  Flows.run(c.id).updated = Date.now() - 7 * 3600e3;
  await refresh();
  ok(!row(c.id) && Flows.run(c.id), 'a run untouched for 7 h left "Going now" (kept under its flow)');
  store.set('cmdpage.goingHours', 24); await refresh();
  ok(row(c.id), 'with "after 1 day" it shows again');

  // right-click → Clear every finished run
  Flows.stop(c.id); await refresh();
  const r = row(c.id).getBoundingClientRect();
  row(c.id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 5 })); await wait(200);
  out.menu = [...document.querySelectorAll('#menu button')].map((m) => m.textContent.trim());
  ok(out.menu.some((t) => /Remove it/.test(t)) && out.menu.some((t) => /Clear every finished run/.test(t)) && out.menu.some((t) => /Leave "Going now" after/.test(t)), `the run's menu (${out.menu.slice(0, 4)})`);
  [...document.querySelectorAll('#menu button')].find((m) => /Clear every finished run/.test(m.textContent)).click(); await wait(300);
  ok(!Flows.run(c.id), 'Clear every finished run removes the stopped one');
  store.set('cmdpage.goingHours', 6);
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
