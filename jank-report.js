// /smooth (round 20, jankwatch): what the jank watch (jank.js) saw on this computer, in plain words, and a summary to
// paste into a Claude dev session so the next speed pass works from real numbers. Loaded on first use (lazy group
// 'jankwatch').
//   /smooth [day|week]   per area: input → paint p50 / p95, long frames, frames dropped while something moved; the 5
//                        scripts that cost the most (file:line, what it is, what called it); why frames ran long; the
//                        Lab preview's frames; the main process; GPU trouble; what was held back while you worked
//   /smooth copy [week]  the summary for Claude, straight to the clipboard · /smooth reset · /smooth off · /smooth on
//   /smooth profile [s]  watch closely for a few seconds (jankmain.js samples the page) and name what ran long
const JankReport = (() => {
  const DAY = 864e5;
  // what a file is, in the owner's words
  const PLAIN = [
    [/^native\.js$/, 'the chat view'], [/^panel\.js$/, 'the side panel'], [/^md\.js$/, 'reply formatting (Markdown)'], [/^meter\.js$/, 'the token meter'],
    [/^renderer\.js$/, 'the app shell (rail, menus, windows)'], [/^ui\.js$/, 'shared pieces (dialogs, toasts, lists)'], [/^tools\.js$/, 'tool tabs and docked chats'],
    [/^appui\.js$/, 'the Ctrl/⌘+K palette and settings'], [/^cmdbar/, 'the command bar'], [/^commands\.js$/, 'chat commands'], [/^chat-scenes/, 'chat scenes'],
    [/^chat-/, 'chat extras'], [/^director-dock/, 'the docked director chat'], [/^tools\/three-seq/, 'the Lab sequence'], [/^tools\/three-media/, 'the Lab music timeline'],
    [/^tools\/three-tweaks/, 'the Lab sliders'], [/^tools\/three-layers/, 'Lab layers'], [/^tools\/three-sandbox/, 'the Lab preview page'], [/^tools\/three/, 'the Lab'],
    [/^nodes/, 'the node editor'], [/^board/, 'the mood board'], [/^cmdpage/, 'the Commands page'], [/^flows/, 'flows'], [/^apps/, 'app windows'],
    [/^capture|^framereader/, 'capture'], [/^sync/, 'cloud sync'], [/^habits/, 'habits and the weekly tidy'], [/^lazy/, 'feature loading'], [/^start\.js$/, 'startup'],
    [/^(declutter|simplify|polish)/, 'decluttering'], [/^keys/, 'the keys sheet'], [/^usage/, 'usage counts'], [/^juice|^look/, 'the look (effects)'], [/^jank/, 'the jank watch itself'],
    [/^tools\/forge/, 'Forgeheart'], [/^astra/, 'Astra'], [/^progress/, 'progress bars'], [/^makes/, 'makes'], [/^access/, 'chat access'],
  ];
  const plainFile = (f) => { for (const [re, s] of PLAIN) if (re.test(f)) return s; return f ? f.replace(/\.js$/, '') : 'the browser itself'; };
  function plainCall(it, inv) {
    const s = String(inv || '');
    if (it === 'event-listener') { const ev = s.split('.on').pop(); return ev && ev !== s ? `on ${ev}` : 'an event'; }
    if (it === 'user-callback') return /AnimationFrame/i.test(s) ? 'an animation frame' : /Idle/i.test(s) ? 'an idle callback' : /Timeout|Interval|Timer/i.test(s) ? 'a timer' : /Observer/i.test(s) ? 'an observer' : 'a callback';
    if (/promise/.test(it)) return 'a promise (an answer arriving)';
    if (/script/.test(it)) return 'the script loading';
    if (it === 'profiled') return s ? `work started from ${s}` : 'work found by a profile';
    return it || 'unknown';
  }
  const ms = (v) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
  const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '–');
  // input → paint percentile from the bins (bin 0: every interaction faster than 16 ms)
  function pct(r, p) {
    const E = Jank.EDGES;
    const slow = r.h.slice(1).reduce((a, x) => a + x, 0);
    const total = Math.max(r.n, slow);
    if (!total) return null;
    let need = Math.ceil(total * p) - (total - slow);
    if (need <= 0) return '< 16 ms';
    for (let i = 1; i < r.h.length; i += 1) { need -= r.h[i]; if (need <= 0) return E[i] === Infinity ? '> 1 s' : `≤ ${E[i]} ms`; }
    return '> 1 s';
  }

  async function gather(span = 'day') {
    const L = await Jank.data();
    const from = Date.now() - (span === 'week' ? 7 : 1) * DAY;
    const hours = L.hours.filter((h) => h.t + 3600e3 > from);
    const sum = hours.reduce((acc, h) => Jank.merge(acc, { ...h, c: {} }), { a: {}, c: {}, ad: {}, ev: [] });
    // culprits across the whole span (an hour keeps its 12 costliest; merge keeps 12 too, so they're summed here)
    const cul = {};
    for (const h of hours) for (const [k, c] of Object.entries(h.c || {})) { const d = cul[k]; if (!d) cul[k] = { ...c, k }; else { d.n += c.n; d.ms += c.ms; d.fl = (d.fl || 0) + (c.fl || 0); d.worst = Math.max(d.worst, c.worst); } }
    const top = Object.values(cul).sort((x, y) => y.ms - x.ms).slice(0, 5);
    let lines = [];
    try { lines = await window.hub.jank.lines(top.map((c) => [c.f, c.l ? -1 : c.p])); } catch { /* old main.js */ }
    top.forEach((c, i) => { c.line = c.l || lines[i] || null; c.plain = plainFile(c.f); c.call = plainCall(c.it, c.inv); c.where = c.f ? `${c.f}${c.line ? `:${c.line}` : c.p >= 0 ? ` @${c.p}` : ''}` : '(no script: browser work)'; });
    // a script that keeps causing long frames: ≥ 5 in the last day (or a third of all long frames in the span)
    const allLf = Object.values(sum.a).reduce((a, r) => a + r.lf, 0);
    const dayFrom = Date.now() - DAY;
    const daily = {};
    for (const h of L.hours.filter((x) => x.t + 3600e3 > dayFrom)) for (const [k, c] of Object.entries(h.c || {})) daily[k] = (daily[k] || 0) + c.n;
    for (const c of top) { c.repeat = (daily[c.k] || 0) >= 5 || (allLf >= 6 && c.n >= allLf / 3); }
    const areas = Object.entries(sum.a).map(([name, r]) => ({ name, r, p50: pct(r, 0.5), p95: pct(r, 0.95), slow: r.h.slice(3).reduce((a, x) => a + x, 0) }))
      .sort((x, y) => (y.r.lf + y.slow) - (x.r.lf + x.slow) || y.r.n - x.r.n);
    return { L, span, hours: hours.length, sum, top, areas, allLf, env: Jank.env(), since: L.since || L.hours[0]?.t || Date.now() };
  }

  const AD_WORDS = { 'feature load': 'feature loads', 'weekly tidy': 'weekly tidies', 'board pictures': 'board pictures', 'chat thumbnails': 'chat thumbnails', 'engine check': 'engine checks', 'sync pass': 'sync passes' };
  function adapted(ad) {
    const held = Object.entries(ad).filter(([k]) => !/Light mode|^profile/.test(k));
    const prof = (ad['profile (automatic)'] || 0) + (ad['profile (asked)'] || 0);
    const out = [];
    if (held.length) out.push(`held ${held.reduce((a, [, v]) => a + v, 0)} background jobs until you paused (${held.map(([k, v]) => `${AD_WORDS[k] || k} ${v}`).join(', ')})`);
    if (prof) out.push(`took ${prof} short profile${prof === 1 ? '' : 's'} to name the code behind repeated long frames`);
    if (ad['Light mode suggested']) out.push(`suggested the Lab's Light mode${ad['Light mode turned on'] ? ' (you turned it on)' : ''}`);
    return out;
  }
  const machine = (env) => [env.platform === 'darwin' ? 'Mac' : env.platform === 'win32' ? 'Windows' : env.platform || 'this computer', env.hz ? `${env.hz} Hz` : '', env.gpu || ''].filter(Boolean).join(' · ');

  function text(g) {
    const { sum, areas, top, env } = g;
    const out = [`**Smoothness, last ${g.span}** on this computer (${machine(env)})${Jank.isOff() ? ' · ⏸ the watch is off (`/smooth on`)' : ''}`];
    if (!areas.length && !sum.lab && !sum.main) { out.push('Nothing recorded yet: use Hearth a little and ask again. The watch costs nothing while nothing is slow.'); return out.join('\n'); }
    if (areas.length) {
      out.push('', '| Area | Inputs | Input → paint p50 | p95 | Slowest | Long frames | Dropped while moving |', '|---|---:|---:|---:|---:|---:|---:|');
      for (const a of areas.slice(0, 10)) out.push(`| ${a.name} | ${a.r.n} | ${a.p50 || '–'} | ${a.p95 || '–'} | ${a.r.wi ? ms(a.r.wi) : '–'} | ${a.r.lf}${a.r.worst ? ` (worst ${ms(a.r.worst)})` : ''} | ${a.r.drop || 0} |`);
    }
    if (top.length) {
      out.push('', '**What costs the most**');
      top.forEach((c, i) => out.push(`${i + 1}. \`${c.where}\`${c.fn ? ` ${c.fn}()` : ''}: ${c.plain}, on ${c.call}. ${c.n} long frame${c.n === 1 ? '' : 's'}, ${ms(c.ms)} in all, worst ${ms(c.worst)}${c.fl ? `, ${ms(c.fl)} of it re-measuring the page` : ''}${c.repeat ? ' · **keeps doing it**' : ''}`));
    }
    const t = Object.values(sum.a).reduce((a, r) => ({ s: a.s + r.s, f: a.f + r.f, r: a.r + r.r, o: a.o + r.o }), { s: 0, f: 0, r: 0, o: 0 });
    const all = t.s + t.f + t.r + t.o;
    if (all) out.push('', `**Why frames ran long**: scripts ${pctOf(t.s, all)} · layout forced by scripts ${pctOf(t.f, all)} · style, layout & paint ${pctOf(t.r, all)} · other browser work ${pctOf(t.o, all)}`);
    if (sum.lab?.n) { const l = sum.lab; out.push(`**Lab preview**: ${Math.round(l.fps / l.n)} fps on average, frames dropped in ${pctOf(l.bad, l.n)} of the time (≈ ${l.drop} frames), worst frame ${ms(l.worst)}, drawing p95 ${ms(l.p95)}${l.q < 1 ? `, resolution lowered to ${Math.round(l.q * 100)} % at times` : ''}${l.light ? ', Light mode on part of the time' : ''}`); }
    if (sum.main) out.push(`**Main process**: event loop late by ${ms(sum.main.p50)} typically, ${ms(sum.main.p99)} at p99, worst ${ms(sum.main.max)}`);
    const ev = sum.ev || [];
    out.push(ev.length ? `**GPU and crashes**: ${ev.slice(-4).map((e) => `${new Date(e.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} ${e.what}`).join(' · ')}` : '**GPU and crashes**: none');
    const ad = adapted(sum.ad || {});
    out.push(`**Adapted**: ${ad.length ? ad.join('; ') : 'nothing needed'}`);
    return out.join('\n');
  }

  // the summary a Claude dev session can act on: numbers, files and lines, no prose
  function forClaude(g) {
    const { sum, areas, top, env } = g;
    const o = [`Hearth jank report (real machine, measured in the running app by jank.js) — last ${g.span}, ${g.hours} active hour(s).`,
      `Machine: ${machine(env)} · Electron ${env.electron || '?'} · Hearth ${env.version || '?'}`, '',
      'Per area (inputs counted; input→next paint p50/p95 from Event Timing bins; long frames ≥50 ms from Long Animation Frames; dropped = frames lost while an animation ran or the owner scrolled/dragged):'];
    for (const a of areas) o.push(`- ${a.name}: inputs ${a.r.n}, p50 ${a.p50 || '-'}, p95 ${a.p95 || '-'}, slowest input ${a.r.wi || 0} ms, long frames ${a.r.lf} (total ${a.r.ms} ms, worst ${a.r.worst} ms), dropped ${a.r.drop}; split ms: script ${a.r.s}, forced style/layout ${a.r.f}, style/layout/paint ${a.r.r}, other ${a.r.o}`);
    o.push('', 'Top culprits (largest script of each long frame, by total ms):');
    if (!top.length) o.push('- none recorded');
    top.forEach((c, i) => o.push(`${i + 1}. ${c.where} ${c.fn || '(anonymous)'} — ${c.plain}; invoker: ${c.it || '?'} ${c.inv || ''}; ${c.n} long frames, script ${c.ms} ms total, worst frame ${c.worst} ms, forced layout ${c.fl || 0} ms${c.repeat ? ' — REPEAT OFFENDER' : ''}`));
    if (sum.lab?.n) { const l = sum.lab; o.push('', `Lab preview (sandbox stats, 0.5 s windows): ${l.n} windows, avg ${Math.round(l.fps / l.n)} fps, ${l.bad} windows dropping frames, ≈${l.drop} frames dropped, worst frame ${l.worst} ms, draw p95 ${l.p95} ms, lowest adaptive quality ${l.q}, Light mode windows ${l.light}`); }
    if (sum.main) o.push(`Main process event-loop delay: p50 ${sum.main.p50} ms, p99 ${sum.main.p99} ms, max ${sum.main.max} ms`);
    o.push(`GPU / crash events: ${(sum.ev || []).length ? sum.ev.map((e) => `${new Date(e.t).toISOString()} ${e.kind}: ${e.what}`).join(' | ') : 'none'}`);
    o.push(`Adapted live: ${Object.entries(sum.ad || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || 'nothing'}`);
    o.push('', top[0] ? `Suggested first target: ${top[0].where} ${top[0].fn || ''} (${top[0].plain}).` : 'No script culprit: look at the areas with the slowest p95.');
    o.push('Rules: no per-frame DOM writes, compare before write, no layout reads after writes, transform/opacity animations only, defer background work while Jank.busy().');
    return o.join('\n');
  }

  async function run(args, ctx) {
    const [w0 = '', w1 = ''] = String(args || '').trim().toLowerCase().split(/\s+/);
    if (w0 === 'off') { Jank.setOff(true); return '⏸ Jank watch off: nothing is measured or held back. `/smooth on` brings it back.'; }
    if (w0 === 'on') { Jank.setOff(false); return '▶ Jank watch on: long frames, input delays and the Lab preview are measured on this computer (`/smooth` shows them).'; }
    if (w0 === 'reset') {
      if (ctx?.source !== 'code' && !(await Modal.confirm('Reset the smoothness log?', 'Forgets everything the jank watch recorded on this computer.', { ok: 'Reset', danger: true }))) return 'Kept.';
      await Jank.reset(); return '🧹 Smoothness log cleared: it starts over from now.';
    }
    if (w0 === 'profile') {
      const sec = Math.max(2, Math.min(20, Number(w1) || 8));
      if (Jank.isOff()) return 'The jank watch is off: `/smooth on` first.';
      ctx?.say?.(`🔎 Watching closely for ${sec} s: do what feels slow now.`);
      const r = await Jank.profile(sec * 1000, 'asked');
      if (r?.error) return `Couldn't profile: ${r.error}.`;
      const st = (r.stretches || []).sort((a, b) => b.ms - a.ms);
      if (!st.length) return `Nothing ran long in those ${sec} s: smooth. (\`/smooth\` for the whole day)`;
      return [`**${st.length} long stretch${st.length === 1 ? '' : 'es'}** in ${sec} s (longest first):`,
        ...st.slice(0, 6).map((x) => `- ${ms(x.ms)}: ${x.where ? `\`${x.where.f}:${x.where.line}\`${x.where.fn ? ` ${x.where.fn}()` : ''}, ${plainFile(x.where.f)} (${ms(x.where.ms)} there)${x.entry ? `, started from ${x.entry.fn || 'anonymous'} (${x.entry.f}:${x.entry.line})` : ''}` : 'no app code on the stack (the browser\'s own work, or a built-in it called)'} · browser work ${ms(x.prog)}${x.gc ? `, memory clean-up ${ms(x.gc)}` : ''}`),
        'They\'re in `/smooth` and its Copy for Claude now.'].join('\n');
    }
    const span = [w0, w1].includes('week') ? 'week' : 'day';
    const g = await gather(span);
    if (w0 === 'copy') { await copyText(forClaude(g), 'Copied for Claude: paste it into a dev session'); return 'Copied the smoothness summary for Claude.'; }
    const body = text(g);
    const actions = [
      { label: '📋 Copy for Claude', run: () => copyText(forClaude(g), 'Copied for Claude: paste it into a dev session') },
      { label: span === 'week' ? 'Last day' : 'Last week', run: () => Commands.exec(`/smooth ${span === 'week' ? 'day' : 'week'}`, ctx?.agentId) },
    ];
    if (ctx?.note) { ctx.note(body, { actions, id: 'smooth' }); return undefined; }
    return body;
  }

  if (typeof Commands !== 'undefined' && !Commands.get('smooth')) {
    Commands.register({
      name: 'smooth', aliases: ['jank'], area: 'App', args: '[day|week|copy|profile [s]|reset|off|on]',
      desc: 'How smooth Hearth runs on this computer: input delay and long frames per area, the 5 worst scripts, the Lab preview, what was held back; Copy for Claude',
      keywords: 'jank lag stutter slow frames fps smoothness performance laggy choppy',
      examples: ['/smooth', '/smooth week', '/smooth copy'],
      complete: () => [['day', 'the last 24 hours'], ['week', 'the last 7 days'], ['copy', 'the summary for a Claude dev session, to the clipboard'], ['profile', 'watch closely for 8 s and name the code that runs long'], ['reset', 'forget the log'], ['off', 'stop measuring'], ['on', 'measure again']].map(([value, hint]) => ({ value, hint })),
      run,
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Smoothness report (jank watch)', () => Commands.exec('/smooth'));

  return { gather, text, forClaude, pct, plainFile, plainCall };
})();
