// 🔁 Keep going (round 41, routines): the plain part (routines-core.js): routines made safe, when the next round may
// go (pauses, quiet, typing, queues, the cap, limits, time), how a round's end is read (errors, usage limits, the AI
// saying it's done / stuck, permission asks), the owner writing, restarts, the words on the chip.
//   node dev/routines-test.js
const C = require('../routines-core.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info)); } else console.log(`✓ ${name}`); };
const T0 = new Date(2026, 9, 14, 12, 0, 0).getTime();
const MIN = 60000; const HOUR = 60 * MIN;
const mk = (o = {}) => C.normalize({ agentId: 'claude', chatId: 'c1', createdAt: T0, lastEnd: T0 - 10000, ...o }, T0);
const step = (r, ctx = {}) => C.nextStep(r, { now: T0, idleMs: 0, quietMs: 0, ...ctx });

// ---------- made safe ----------
ok('needs its chat', C.normalize({ agentId: 'a' }) === null && C.normalize({ chatId: 'c' }) === null);
const d = mk();
ok('defaults: the default words, until stopped, no pause, lighter on, wait for reset on, restart asks', d.prompt === C.DEFAULT_PROMPT && d.how.kind === 'forever' && d.pause === 'none' && d.lighter && d.waitReset && !d.afterRestart, d);
ok('forever always has a cap', d.cap === C.NO_LIMIT_CAP);
ok('rounds clamped 1..200', mk({ how: { kind: 'rounds', rounds: 999 } }).how.rounds === 200 && mk({ how: { kind: 'rounds', rounds: 0 } }).how.rounds === 5);
ok('a time sets its end', mk({ how: { kind: 'time', ms: 30 * MIN } }).endAt === T0 + 30 * MIN);
ok('unknown pause → none', mk({ pause: 'weird' }).pause === 'none');
ok('words capped at 4000', mk({ prompt: 'x'.repeat(5000) }).prompt.length === 4000);
ok('a short routine may go without a cap', mk({ how: { kind: 'rounds', rounds: 5 }, cap: 0 }).cap === 0);
ok('a long one may not', mk({ how: { kind: 'rounds', rounds: 20 }, cap: 0 }).cap > 0 && mk({ how: { kind: 'time', ms: 3 * HOUR }, cap: 0 }).cap > 0);
ok('needsCap: forever, ≥ 3 h, > 10 rounds', C.needsCap({ kind: 'forever' }) && C.needsCap({ kind: 'time', ms: 3 * HOUR }) && !C.needsCap({ kind: 'time', ms: HOUR }) && C.needsCap({ kind: 'rounds', rounds: 11 }) && !C.needsCap({ kind: 'rounds', rounds: 10 }));
ok('until 18:30 → today 18:30', C.untilAt('18:30', T0) === new Date(2026, 9, 14, 18, 30).getTime());
ok('until 09:00 (passed) → tomorrow', C.untilAt('9:00', T0) === new Date(2026, 9, 15, 9, 0).getTime());
ok('until: not a time', C.untilAt('25:00', T0) === null && C.untilAt('soon', T0) === null);
ok('an "until" routine with a bad time drops', C.normalize({ agentId: 'a', chatId: 'c', how: { kind: 'until', time: 'x' } }, T0) === null);

// ---------- the default cap from the weekly Spending limit ----------
ok('no weekly limit → 300k', C.defaultCap({}) === 300000);
ok('a quarter of the weekly limit', C.defaultCap({ limit: 2e6, tokens: 0 }) === 500000);
ok('never more than what is left this week', C.defaultCap({ limit: 2e6, tokens: 1.9e6 }) === 100000);
ok('at least 20k', C.defaultCap({ limit: 2e6, tokens: 3e6 }) === 20000);

// ---------- when the next round goes ----------
const r1 = mk({ how: { kind: 'rounds', rounds: 2 } });
ok('first round goes at once (kickoff skips the pause)', step(mk({ pause: '1m' })).act === 'send');
ok('not while a reply runs', step(r1, { busy: true }).act === 'none');
ok('not while you type there', step(r1, { draft: true }).act === 'wait');
ok('not while a message waits to go out (offline queue / the chat\'s own queue)', step(r1, { queued: true }).act === 'wait');
ok('a moment after a reply ends (your words, a hook go first)', step(mk({ lastEnd: T0 - 500 })).act === 'wait');
C.sent(r1);
ok('sent: round 1, in flight, the kickoff used', r1.round === 1 && r1.inFlight && !r1.kickoff);
ok('nothing while in flight', step(r1).act === 'none');
let e = C.roundEnded(r1, { type: 'done', text: 'Did five things.', tokens: 12000 }, T0);
ok('a round ends: continue, counted, costed', e.act === 'continue' && r1.done === 1 && r1.tokens === 12000 && r1.rounds[0].tokens === 12000, r1);
ok('the next round waits the settle moment', C.nextStep(r1, { now: T0 + 100 }).act === 'wait' && C.nextStep(r1, { now: T0 + 3000 }).act === 'send');
C.sent(r1); C.roundEnded(r1, { type: 'done', text: 'More.', tokens: 8000 }, T0 + 5000);
const fin = C.nextStep(r1, { now: T0 + 9000 });
ok('N rounds then stops (done)', fin.act === 'stop' && fin.status === 'done' && /2 rounds/.test(fin.why), fin);

const p1 = mk({ pause: '1m', kickoff: false, round: 1, lastEnd: T0 });
ok('pause 1 min between rounds', C.nextStep(p1, { now: T0 + 30000 }).act === 'wait' && C.nextStep(p1, { now: T0 + 61000 }).act === 'send');
const p2 = mk({ pause: 'idle10', round: 1, kickoff: false });
ok('until I\'m idle 10 min', step(p2, { idleMs: 3 * MIN }).act === 'wait' && step(p2, { idleMs: 11 * MIN }).act === 'send');
const p3 = mk({ pause: 'quiet60', round: 1, kickoff: false });
ok('when I haven\'t written for an hour', step(p3, { quietMs: 20 * MIN }).act === 'wait' && step(p3, { quietMs: 61 * MIN }).act === 'send');

// ---------- time limits ----------
const t1 = mk({ how: { kind: 'time', ms: 30 * MIN }, round: 3, kickoff: false });
ok('within its time: goes', C.nextStep(t1, { now: T0 + 20 * MIN }).act === 'send');
const tEnd = C.nextStep(t1, { now: T0 + 31 * MIN });
ok('time is up: done (no new round)', tEnd.act === 'stop' && tEnd.status === 'done' && /time is up/.test(tEnd.why));
const u1 = mk({ how: { kind: 'until', at: T0 + HOUR }, round: 1, kickoff: false });
ok('until a time: stops at that time', C.nextStep(u1, { now: T0 + HOUR + 1 }).act === 'stop');

// ---------- the spending cap ----------
const cap = mk({ how: { kind: 'forever' }, cap: 25000 });
for (let i = 0; i < 2; i++) { C.sent(cap); C.roundEnded(cap, { type: 'done', text: 'ok', tokens: 10000 }, T0); }
const cs = step(cap, { now: T0 + 5000 });
ok('forever with a cap: stops before a round that would pass it', cs.act === 'stop' && cs.status === 'stopped' && /cap/.test(cs.why) && cap.done === 2, cs);
const cap2 = mk({ cap: 10000, round: 1, done: 1, tokens: 12000, kickoff: false });
ok('past the cap: stops', /reached its spending cap/.test(step(cap2).why));

// ---------- errors, limits, sign-in ----------
const er = mk();
C.sent(er); e = C.roundEnded(er, { type: 'error', text: 'Something broke', kind: null }, T0);
ok('an error once: goes on', e.act === 'continue' && er.errors === 1 && er.status === 'running');
C.sent(er); e = C.roundEnded(er, { type: 'error', text: 'Something broke', kind: null }, T0);
ok('the same failure twice in a row: stops', e.act === 'stop' && er.status === 'stopped' && /2 times in a row/.test(er.why), er.why);
const er2 = mk();
C.sent(er2); C.roundEnded(er2, { type: 'error', text: 'x' }, T0); C.sent(er2); C.roundEnded(er2, { type: 'done', text: 'fine', tokens: 1 }, T0); C.sent(er2); C.roundEnded(er2, { type: 'error', text: 'x' }, T0);
ok('an answered round in between resets the count', er2.status === 'running' && er2.errors === 1);
const net = mk();
C.sent(net); e = C.roundEnded(net, { type: 'error', text: 'ENOTFOUND', kind: 'offline' }, T0);
ok('no internet: waits for offline.js to send it again (not an error)', e.act === 'wait' && net.status === 'running' && net.errors === 0 && /internet/.test(net.why));
for (let i = 0; i < 5; i++) C.roundEnded(net, { type: 'error', text: 'busy', kind: 'busy' }, T0);
ok('…but a connection failing 6 times pauses', net.status === 'paused');
const lim = mk();
C.sent(lim); e = C.roundEnded(lim, { type: 'error', text: 'limit', kind: 'limit', resetAt: T0 + 2 * HOUR }, T0);
ok('a usage limit with its reset: waits for it', e.act === 'continue' && lim.resetAt > T0 + 2 * HOUR && step(lim, { now: T0 + HOUR }).act === 'wait' && C.nextStep(lim, { now: T0 + 2 * HOUR + MIN }).act === 'send');
const lim2 = mk({ waitReset: false });
C.sent(lim2); e = C.roundEnded(lim2, { type: 'error', text: 'limit', kind: 'limit', resetAt: T0 + HOUR }, T0);
ok('…or stops when not allowed to wait', e.act === 'stop' && lim2.status === 'stopped');
const so = mk(); C.sent(so); C.roundEnded(so, { type: 'error', text: 'login', kind: 'signedout' }, T0);
ok('signed out: stops', so.status === 'stopped' && /signed out/.test(so.why));
const st = mk(); C.sent(st); e = C.roundEnded(st, { type: 'stopped' }, T0);
ok('you stopped the reply: paused', e.act === 'pause' && st.status === 'paused');

// ---------- the AI says it's done / stuck ----------
ok('done words', C.saysDone('Here is the summary.\n\nNothing left worth improving.') === 'done' && C.saysDone('I think we\'re done.') === 'done' && C.saysDone('There is nothing more to improve here.') === 'done');
ok('stuck words', C.saysDone('I\'m stuck: I need your decision on the palette.') === 'stuck' && C.saysDone('I can\'t proceed without your input.') === 'stuck');
ok('not done: ordinary text, "done" early on, in code', C.saysDone('Once I\'m done with the sliders I\'ll fix the colors.' + ' More words.'.repeat(60)) === null && C.saysDone('Done: added 5 tweaks.\n\nNext I will polish.') === null && C.saysDone('```\n// all done\n```\nNext steps follow.') === null);
const dn = mk();
C.sent(dn); C.roundEnded(dn, { type: 'done', text: 'Nothing left worth improving.', tokens: 10 }, T0);
ok('once: goes on', dn.status === 'running' && dn.saidDone === 1);
C.sent(dn); e = C.roundEnded(dn, { type: 'done', text: 'I\'m done, nothing left to improve.', tokens: 10 }, T0);
ok('twice in a row: stops (done)', e.act === 'stop' && dn.status === 'done' && /done twice/.test(dn.why));
const dn2 = mk();
C.sent(dn2); C.roundEnded(dn2, { type: 'done', text: 'Nothing left to do.' }, T0); C.sent(dn2); C.roundEnded(dn2, { type: 'done', text: 'Improved more things.' }, T0); C.sent(dn2); C.roundEnded(dn2, { type: 'done', text: 'Nothing left to do.' }, T0);
ok('not in a row: goes on', dn2.status === 'running');

// ---------- asking first ----------
const ac = mk(); C.sent(ac); e = C.roundEnded(ac, { type: 'done', text: 'I need to delete a file.', asked: true }, T0);
ok('a permission card during the round: paused (never answered by the routine)', e.act === 'pause' && ac.status === 'paused' && /OK/.test(ac.why));
const pl = mk(); C.sent(pl); e = C.roundEnded(pl, { type: 'done', text: 'The plan', plan: true }, T0);
ok('a plan waiting for ▶ Go ahead: paused', e.act === 'pause');
const sp = mk({ round: 1, kickoff: false });
const ask = step(sp, { askFirst: true });
ok('Spending asks before each message: paused', ask.act === 'pause');
C.pause(sp, ask.why); C.resume(sp, T0);
ok('…▶ after that question: it goes on without asking again', step(sp, { askFirst: true, now: T0 + 5000 }).act === 'send');

// ---------- the owner writes ----------
const ow = mk({ round: 1, kickoff: false });
C.ownerWrote(ow, T0);
ok('owner writes: paused until ▶', ow.status === 'paused' && /you wrote/.test(ow.why) && step(ow).act === 'none');
C.resume(ow, T0);
ok('▶: running again, the next round at once', ow.status === 'running' && step(ow, { now: T0 + 3000 }).act === 'send');
const oq = mk({ round: 1, kickoff: false, resumeAfter: 10 * MIN });
C.ownerWrote(oq, T0);
ok('or (chosen) goes on after 10 min quiet', oq.status === 'running' && C.nextStep(oq, { now: T0 + 5 * MIN }).act === 'wait' && C.nextStep(oq, { now: T0 + 11 * MIN }).act === 'send');
ok('writing again pushes the quiet further', (C.ownerWrote(oq, T0 + 9 * MIN), C.nextStep(oq, { now: T0 + 11 * MIN }).act === 'wait'));

// ---------- a restart ----------
const rs = mk({ round: 2, inFlight: true });
C.restarted(rs);
ok('restart: paused with a resume prompt, nothing in flight', rs.status === 'paused' && /restarted/.test(rs.why) && !rs.inFlight);
const rs2 = mk({ round: 2, afterRestart: true });
C.restarted(rs2);
ok('restart with "keep going after a restart": still running', rs2.status === 'running');
const back = C.normalize(JSON.parse(JSON.stringify(rs)));
ok('survives a save / load as it was', back.status === 'paused' && back.round === 2 && back.id === rs.id);
const stp = mk(); C.stop(stp);
ok('■ stop: stopped, not live', stp.status === 'stopped' && !C.live(stp) && C.resume(stp).status === 'stopped');

// ---------- words ----------
const w = mk({ how: { kind: 'rounds', rounds: 5 }, round: 3, tokens: 42000 });
ok('the chip: "🔁 3 of 5 · ≈ 42k tokens so far"', C.chipText(w) === '🔁 3 of 5 · ≈ 42k tokens so far', C.chipText(w));
ok('forever shows its cap', /of 300k$/.test(C.chipText(mk({ round: 1, tokens: 5000 }))));
ok('time shows what is left', /41 min left/.test(C.chipText(mk({ how: { kind: 'time', ms: HOUR }, round: 2 }), T0 + 19 * MIN)));
ok('paused shows ❚❚', C.chipText(Object.assign(mk(), { status: 'paused' })).startsWith('❚❚'));
ok('describe in plain words', C.describe(mk({ how: { kind: 'rounds', rounds: 5 }, pause: '1m', cap: 100000 })) === '🔁 Keep going 5 more rounds, 1 min between rounds, at most ≈ 100k tokens', C.describe(mk({ how: { kind: 'rounds', rounds: 5 }, pause: '1m', cap: 100000 })));
ok('the message is the owner\'s words, nothing added', C.message(mk({ prompt: 'Do 5 more' })) === 'Do 5 more');

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
