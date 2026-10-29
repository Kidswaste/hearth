// (round 82, bigchat82) part of dev/bigchat82-test.js: the summaries a giant chat makes on the window's thread give the
// same text as before, faster. historylean's lighter history built from the END (only the rows that fit) = the whole
// build, on long chats with code blocks written again and again (stubs vs current versions), pictures, tool lists,
// huge pastes (the 'keep' rows over the cap), a compacted chat; context-core's local summary / handoff's brief and
// "earlier" (seen sets, the path search only around file extensions) on a 6,000-message chat in well under the old time.
'use strict';
const path = require('path');

module.exports = async function summaries({ ok, int, pick, rnd, ROOT }) {
  const HL = require(path.join(ROOT, 'historylean-core.js'));
  const HO = require(path.join(ROOT, 'handoff-core.js'));
  const code = (file, n, v) => `\`\`\`js\n// ${file}\n${Array.from({ length: n }, (_, i) => `const a${i} = ${v};`).join('\n')}\n\`\`\``;
  const files = ['src/orb.js', 'src/neon.js', 'shaders/glow.frag', 'scene.json', ''];
  function chat(n, o = {}) {
    const messages = [];
    for (let k = 0; k < n; k++) {
      if (k % 2 === 0) {
        const m = { role: 'user', text: `${pick(['make the', 'fix the', 'what about', 'try'])} ${pick(['orb', 'kick', 'glow', 'camera'])} ${k}?`, at: k * 1000 };
        if (rnd() < 0.1) m.text += `\n\n${code(pick(files), int(3, 40), k)}`;
        if (rnd() < 0.05) m.attachments = [{ kind: 'image', name: `p${k}.png` }];
        if (o.huge && k === n - 2) m.text = 'x'.repeat(60000);
        messages.push(m);
      } else {
        const m = { role: 'assistant', text: `Done ${k}.\n\n${rnd() < 0.4 ? code(pick(files), int(5, 160), k) : 'Words only. '.repeat(int(1, 80))}`, at: k * 1000 };
        if (rnd() < 0.3) m.tools = ['Read', 'Edit'].slice(0, int(1, 2));
        messages.push(m);
      }
    }
    if (o.first) messages[0].text = `the goal\n\n${code('src/orb.js', 30, 'first')}`;
    const c = { id: 'c', messages };
    if (o.compact) c.compact = { index: Math.floor(n / 3), summary: 'we did things' };
    return c;
  }
  let same = 0; let all = 0; let fast = 0; let slow = 0;
  for (const [n, o] of [[401, {}], [900, {}], [2000, {}], [1200, { first: true }], [800, { huge: true }], [1500, { compact: true }], [500, { first: true, huge: true }]]) {
    for (const chatTools of [false, true]) {
      const c = chat(n, o);
      const t0 = performance.now(); const a = HL.build(c, { chatTools }); const t1 = performance.now(); const b = HL.build(c, { chatTools, whole: true }); const t2 = performance.now();
      fast += t1 - t0; slow += t2 - t1; all += 1;
      if (JSON.stringify(a) === JSON.stringify(b)) same += 1; else console.log('   historylean differs', n, JSON.stringify(o), a.dropped, b.dropped, a.history.length, b.history.length);
    }
  }
  ok(same === all, `historylean from the end = the whole build (${same} / ${all}; ${Math.round(slow)} → ${Math.round(fast)} ms in all)`);
  // autocompact's decision from its kept index of the older messages' words = read again whole, reply after reply (and
  // after an older message changed)
  {
    const AC = require(path.join(ROOT, 'autocompact.js'));
    const c = chat(1400); c.messages.forEach((m) => { if (m.role === 'assistant') m.usage = { input: 90000, cached: 30000 }; });
    let same2 = 0; let n2 = 0; let tIx = 0; let tWhole = 0;
    for (let step = 0; step < 6; step++) {
      c.messages.push({ role: 'user', text: `step ${step} about the ${pick(['orb', 'kick', 'glow'])} and src/orb.js?`, at: 1e9 + step }, { role: 'assistant', text: `ok ${step}`, at: 1e9 + step, usage: { input: 120000 + step, cached: 1000 } });
      if (step === 3) c.messages[40].text += ' an edit in an older message';
      const input = AC.inputOf(c, { lighterAt: 40000 });
      const t0 = performance.now(); const a = AC.decide(input); const t1 = performance.now(); const b = AC.decide({ ...input, wholeWords: true }); const t2 = performance.now();
      if (step) { tIx += t1 - t0; tWhole += t2 - t1; }
      n2 += 1; if (JSON.stringify(a) === JSON.stringify(b)) same2 += 1; else console.log('   autocompact differs', step, JSON.stringify(a).slice(0, 160), JSON.stringify(b).slice(0, 160));
    }
    ok(same2 === n2, `autocompact: kept words index = read whole (${same2} / ${n2}; ${Math.round(tWhole)} → ${Math.round(tIx)} ms over 5 replies)`);
  }
  // a 6,000-message chat: the handoff brief in seconds, not half a minute (its text is the old one: checked against the
  // code before this round on the bigprofile fixture, docs/upgrades/bigchat82.md)
  const big = chat(6000).messages.map((m, i) => ({ ...m, text: `${m.text} see src/file${i % 50}.js and "Layer ${i % 9}" layer` }));
  const t0 = performance.now(); const b = HO.build(big); const ms = performance.now() - t0;
  ok(b.text.includes('Files touched') || b.text.includes('Key files') || b.files.length, 'handoff brief made');
  ok(ms < 8000, `handoff brief of 6,000 messages: ${Math.round(ms)} ms (was ≈ 30 s)`);
  return null;
};
