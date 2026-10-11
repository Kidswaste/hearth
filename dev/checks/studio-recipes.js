// Studio (round 15): two pipelines end to end with the fake engines and the fake Meshy / Poly Haven server, like the
// owner would start them. "Song → visualizer" from the Commands page's code path (a song file given up front): a make
// with a Lab room and its steps, the song loaded and analysed in the room's scene, the Three Director's one lean ask
// in its own chat, ✦ Arrange on that scene, every social size in the render queue, the run done and the make's parts
// done. "Idea → 3D hero" from chat (/studio idea-3d a chrome dragon skull): Meshy's cost asked first (said yes), the
// model lands in the Lab, a Poly Haven sky, a camera move, a loop, a render. A declined one ends with nothing spent.
// The picker (six cards, costs, what's missing with its fix), the Commands-page section, /studio list | status.
//   node dev/smoke.js --fake-engines --fake-meshy --wait 6000 --check-timeout 900000 --script dev/checks/studio-recipes.js --shot /tmp/hearth-studio/end.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(200); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra.slice(0, 220) : JSON.stringify(extra).slice(0, 220)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id = H.claudeAgent().id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = String(t); }, note: (t) => { msg = String(t); }, error: (t) => { msg = `Error: ${t}`; } }); return msg; };
const SHOTS = '/tmp/hearth-studio';
const shot = async (n) => { try { await smoke({ shot: `${SHOTS}/${n}.png` }); } catch { /* optional */ } };
const errs = []; addEventListener('error', (e) => errs.push(e.message));
const SONG = '/tmp/hearth-test-song.wav';
const ended = (run) => until(() => ['done', 'hung', 'stopped'].includes(Flows.run(run.id)?.status) && Flows.run(run.id), 300000);
const stepsOf = (run) => (Flows.run(run.id)?.steps || []).map((e) => `${e.node}:${e.status}${e.error ? `(${e.error.slice(0, 80)})` : ''}`).join(' ');
const answerCost = async (yes) => {
  const d = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /Spend Meshy credits|credits/i.test(x.textContent)), 20000);
  if (!d) return null;
  const text = d.textContent;
  [...d.querySelectorAll('button')].find((b) => (yes ? /Make it|Allow|Yes/.test(b.textContent) : /Cancel|Deny|No\b|Don/.test(b.textContent)))?.click();
  return text;
};
try {
  // ---- 0. the entries: /studio list, the picker, the Commands page ----
  const list = await say('/studio list');
  step(/Board → video/.test(list) && /Song → visualizer/.test(list) && /Idea → 3D hero/.test(list) && /Scene → website/.test(list) && /Still → Photoshop/.test(list) && /Vibe → song/.test(list), '/studio list names the six pipelines');
  step(/Meshy ≈ \d+ credits/.test(list), 'Idea → 3D hero shows its Meshy cost', list.match(/Meshy ≈[^\n·]*/)?.[0]);
  const have = await Studio.needsNow(true);
  const absent = StudioData.RECIPES.find((r) => [...r.needs, ...(r.soft || [])].some((n) => !have[n]));
  out.needs = await say('/studio needs');
  step(!absent || list.includes(StudioData.NEEDS[[...absent.needs, ...(absent.soft || [])].find((n) => !have[n])].fix), 'what is missing here is named with its fix', out.needs);
  await say('/studio');
  const dlg = await until(() => document.querySelector('dialog.studio-pick[open]'), 8000);
  step(dlg && dlg.querySelectorAll('.studio-card').length === 6, 'the picker: one card per pipeline', dlg?.querySelectorAll('.studio-card').length);
  step(!absent || dlg?.querySelector(`.studio-card[data-recipe="${absent.id}"] .studio-need button`), 'a card says what is missing, with Fix', absent?.id);
  await shot('picker');
  dlg?.close();
  step(typeof AppUI === 'undefined' || !AppUI.actions || AppUI.actions().some?.((a) => /^Studio/.test(a.label || a)), 'Ctrl/⌘+K has a Studio entry');
  if (typeof CmdPage !== 'undefined') {
    await CmdPage.open?.();
    const row = await until(() => document.querySelector('.cp-row.studio-row[data-ext="studio:song-viz"]'), 8000);
    step(row, 'the Commands page has a Studio section');
    if (row) { row.click(); step(await until(() => document.querySelector('.studio-detail')?.textContent.includes('Start'), 5000), 'a Studio row shows its steps and ▶ Start'); }
    await shot('cmdpage');
  }

  // ---- 1. Song → visualizer (a song given up front: no question) ----
  const a = await Studio.start('song-viz', { vars: { song: SONG }, source: 'check' });
  step(a.make && a.run, 'Song → visualizer: a make and a run', a.make?.name);
  const kinds = a.make.parts.map((p) => p.label || p.kind);
  step(kinds.join(',') === 'Song,lab,Sequence,Render', 'its parts: Song, a Lab room, Sequence, Render', kinds);
  const labPart = a.make.parts.find((p) => p.kind === 'lab');
  step(labPart?.chatId && H.chats.find((c) => c.id === labPart.chatId)?.title === `${a.make.name} · Lab`, 'the Lab room is made ahead of time', H.chats.find((c) => c.id === labPart?.chatId)?.title);
  step(Flows.active().some((r) => r.id === a.run.id) || Flows.run(a.run.id)?.status === 'done', 'the run is going (Commands page "Going now")', Flows.run(a.run.id)?.status);
  const ra = await ended(a.run);
  step(ra?.status === 'done', 'Song → visualizer runs to the end', `${ra?.status} ${stepsOf(a.run)}`);
  step(/BPM/.test(ra?.vars?.music || ''), 'the song is analysed (tempo, sections)', ra?.vars?.music);
  const dirMsg = H.chats.find((c) => c.id === labPart.chatId);
  const asked = (await Native.loadChat?.(labPart.chatId).catch?.(() => null)) || dirMsg;
  const firstUser = (asked?.messages || []).find((m) => m.role === 'user')?.text || ra?.steps?.find((e) => e.node === 'scene')?.input || '';
  step(/Studio: a scene that reacts/.test(firstUser) && firstUser.length < 900, 'the director got one lean ask in the room', `${firstUser.length} chars`);
  step(/clips/.test(ra?.vars?.seqout || ''), 'a sequence was cut on the song', ra?.vars?.seqout);
  const jobsA = Renders.list().filter((j) => (j.created || 0) >= (ra?.vars?.watch?.at || Date.now()));
  step(jobsA.length >= 4, 'every social size is in the render queue', jobsA.map((j) => j.title));
  const mk = Makes.get(a.make.id);
  step(['Song', 'Sequence'].every((l) => mk.parts.find((p) => p.label === l)?.status === 'done') && mk.parts.find((p) => p.kind === 'lab')?.status === 'done', 'the make\'s parts are done (its bars filled)', mk.parts.map((p) => `${p.label || p.kind}:${p.status}`));
  step(/visualizer/.test(await say('/studio status')), '/studio status lists the run');
  await say('/renders cancel all');
  await shot('song');

  // ---- 2. Idea → 3D hero, from chat, Meshy asked first ----
  const KEY = 'msy_fake_owner_key_42424242';
  const set = await hub.apps.key('meshy', 'set', KEY);
  step(set?.ok, 'a Meshy key (the fake server)');
  const C = H.claudeAgent();
  const p = say('/studio idea-3d a chrome dragon skull', C.id);
  const q = await answerCost(true);
  step(q && /credits/.test(q) && /chrome dragon skull/.test(q), 'Meshy\'s cost is shown and asked first', q?.replace(/\s+/g, ' ').slice(0, 160));
  const said = await p;
  step(/started/.test(said), 'the chat says it started', said);
  const rb = Flows.runs().find((r) => r.flow?.studio === 'idea-3d');
  const mb = Makes.get(rb?.vars?.make);
  step(/Dragon Skull/.test(mb?.name || ''), 'the make is named from the words', mb?.name);
  const rbe = rb && await ended(rb);
  step(rbe?.status === 'done' && /orbiting/.test(rbe.result || ''), 'Idea → 3D hero runs to the end', `${rbe?.status} ${rb && stepsOf(rb)}`);
  step(rbe?.vars?.sky, 'a Poly Haven sky lights it', rbe?.vars?.sky);
  const models = (await AppsMeshy.models()).length;
  step(models >= 1 && ThreeLab.director.layers().layers.some((l) => /🧊|Dragon Skull/i.test(l.name)), 'the model is a layer in the Lab', ThreeLab.director.layers().layers.map((l) => l.name));
  await say('/renders cancel all');
  await shot('hero');

  // ---- 3. declined: nothing spent, the run ends cleanly ----
  const p2 = say('/studio idea-3d a plain cube', C.id);
  const q2 = await answerCost(false);
  await p2;
  const rc = Flows.runs().find((r) => r.flow?.studio === 'idea-3d' && r.id !== rb?.id);
  const rce = rc && await ended(rc);
  step(q2 && rce?.status === 'done' && /nothing was spent/i.test(rce.result || ''), 'declined: the run ends with nothing spent', `${rce?.status} ${rce?.result}`);
  step((await AppsMeshy.models()).length === models, 'no new model');
} catch (err) {
  step(false, `threw: ${err.message}`, err.stack?.split('\n').slice(0, 3).join(' | '));
}
step(!errs.length, 'no page errors', errs.slice(0, 3));
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
