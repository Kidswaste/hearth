// Commands page previews (round 11): a small looping animation for every command, light enough for ≈ 930 of them.
// - One SVG mini-scene per kind of action (a frame morphing to 9:16, a REC dot and a growing timeline, cards snapping
//   into a grid, a message bubble typing, sliders moving…), parameterised per command: its area's color, icon, a short
//   label (its first value: "9:16") and a seed that varies the details, so two commands of a kind don't look the same.
// - Every movement is a CSS animation of transform / opacity (compositor only, cmdpage.css) and is paused unless the
//   preview is "on": the list turns it on while you point at a command, the big view while it is visible.
// - The principal commands also have real recorded clips of Hearth doing it (assets/cmd-clips, made by
//   dev/make-command-clips.js, listed in cmdpage-clips.js); a missing or broken clip falls back to the SVG.
const CmdPreviews = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const W = 120; const H = 72;
  // the scenes: (p, r) → inner SVG; p = { color, icon, label }, r = seeded random 0…1
  const S = {
    frame: (p) => `<rect x="10" y="8" width="100" height="56" rx="5" class="pv-dim"/>
      <g class="pv-a pv-morph"><rect x="22" y="14" width="76" height="44" rx="3" class="pv-stroke"/><rect x="26" y="18" width="68" height="36" rx="2" class="pv-fill" opacity=".25"/></g>
      <text x="60" y="40" class="pv-t pv-big pv-a pv-fadein">${esc(p.label)}</text>`,
    rec: (p, r) => `<rect x="10" y="10" width="100" height="40" rx="4" class="pv-dim"/>
      <circle cx="22" cy="21" r="4.5" fill="#ff3b4e" class="pv-a pv-blink"/><text x="31" y="24.5" class="pv-t pv-s" text-anchor="start">REC</text>
      <rect x="10" y="56" width="100" height="6" rx="3" class="pv-dim"/><rect x="10" y="56" width="100" height="6" rx="3" class="pv-fill pv-a pv-grow"/>
      ${[0, 1, 2].map((i) => `<rect x="${40 + i * 22 + Math.round(r() * 6)}" y="${30 - i * 3}" width="14" height="${10 + i * 3}" rx="2" class="pv-fill" opacity=".35"/>`).join('')}`,
    shot: (p) => `<rect x="14" y="10" width="92" height="52" rx="4" class="pv-dim"/>
      <path d="M20 22v-8h8M100 22v-8h-8M20 50v8h8M100 50v8h-8" class="pv-stroke pv-a pv-pulse" fill="none"/>
      <circle cx="60" cy="36" r="9" class="pv-stroke" fill="none"/><rect x="14" y="10" width="92" height="52" rx="4" fill="#fff" class="pv-a pv-flash"/>`,
    freeze: (p) => `<rect x="10" y="12" width="100" height="40" rx="4" class="pv-dim"/>
      <g class="pv-a pv-slidestop">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${12 + i * 18}" y="18" width="10" height="28" rx="2" class="pv-fill" opacity="${0.25 + (i % 3) * 0.2}"/>`).join('')}</g>
      <g class="pv-a pv-fadein2"><rect x="53" y="24" width="5" height="16" rx="1.5" fill="#fff"/><rect x="62" y="24" width="5" height="16" rx="1.5" fill="#fff"/></g>
      <text x="60" y="64" class="pv-t pv-s">${esc(p.label)}</text>`,
    beat: (p) => `<circle cx="36" cy="34" r="16" class="pv-fill pv-a pv-thump" opacity=".9"/>
      ${[0, 1, 2, 3].map((i) => `<circle cx="${66 + i * 12}" cy="34" r="4" class="pv-fill pv-a pv-step" style="animation-delay:${i * 0.25}s"/>`).join('')}
      <text x="36" y="38" class="pv-t pv-s" fill="#000">${esc(p.label)}</text>`,
    sliders: (p, r) => [0, 1, 2].map((i) => `<rect x="16" y="${16 + i * 18}" width="88" height="3" rx="1.5" class="pv-dim2"/>
      <circle cx="${30 + Math.round(r() * 20)}" cy="${17.5 + i * 18}" r="5" class="pv-fill pv-a pv-knob" style="animation-delay:${(i * 0.31 + r() * 0.3).toFixed(2)}s;--dx:${30 + Math.round(r() * 30)}px"/>`).join(''),
    grid: (p, r) => [0, 1, 2, 3, 4, 5].map((i) => { const x = 16 + (i % 3) * 31; const y = 12 + Math.floor(i / 3) * 26; return `<rect x="${x}" y="${y}" width="26" height="21" rx="3" class="pv-fill pv-a pv-snap" opacity="${0.45 + (i % 2) * 0.3}" style="--dx:${Math.round((r() - 0.5) * 40)}px;--dy:${Math.round((r() - 0.5) * 30)}px;--rot:${Math.round((r() - 0.5) * 40)}deg"/>`; }).join(''),
    board: (p, r) => `${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * 25 + Math.round(r() * 4)}" y="${14 + (i % 2) * 14 + Math.round(r() * 6)}" width="${22 + Math.round(r() * 6)}" height="${18 + Math.round(r() * 8)}" rx="3" class="pv-fill pv-a pv-float" opacity="${0.4 + (i % 3) * 0.2}" style="animation-delay:${(i * 0.4).toFixed(1)}s"/>`).join('')}
      <text x="60" y="66" class="pv-t pv-s">${esc(p.icon)} ${esc(p.label)}</text>`,
    timeline: (p, r) => { let x = 10; const clips = []; for (let i = 0; i < 4 && x < 100; i++) { const w = 16 + Math.round(r() * 14); clips.push(`<rect x="${x}" y="26" width="${Math.min(w, 110 - x)}" height="16" rx="2" class="pv-fill" opacity="${0.35 + (i % 2) * 0.35}"/>`); x += w + 3; } return `<rect x="10" y="14" width="100" height="6" rx="2" class="pv-dim"/>${clips.join('')}<rect x="10" y="46" width="100" height="10" rx="2" class="pv-dim"/>
      <g class="pv-a pv-sweep"><rect x="10" y="10" width="2" height="50" fill="#fff"/></g>`; },
    frames: (p) => `<g class="pv-a pv-film">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${6 + i * 26}" y="18" width="22" height="30" rx="2" class="pv-fill" opacity="${0.3 + (i % 3) * 0.2}"/>`).join('')}</g>
      <rect x="0" y="12" width="${W}" height="3" class="pv-dim2"/><rect x="0" y="51" width="${W}" height="3" class="pv-dim2"/><rect x="47" y="14" width="26" height="38" rx="2" class="pv-stroke" fill="none"/>`,
    play: (p) => `<rect x="14" y="10" width="92" height="52" rx="5" class="pv-dim pv-a pv-grow2"/><path d="M53 24 L71 36 L53 48 Z" class="pv-fill pv-a pv-thump"/>`,
    layers: (p) => [0, 1, 2].map((i) => `<path d="M${30 - i * 2} ${44 - i * 12} L60 ${34 - i * 12} L${92 + i * 2} ${44 - i * 12} L60 ${54 - i * 12} Z" class="pv-fill pv-a pv-lift" opacity="${0.3 + i * 0.25}" style="animation-delay:${i * 0.3}s"/>`).join(''),
    palette: (p, r) => { const h0 = Math.round(r() * 360); return [0, 1, 2, 3, 4].map((i) => `<rect x="${12 + i * 20}" y="18" width="16" height="36" rx="3" fill="hsl(${(h0 + i * 47) % 360} 80% 60%)" class="pv-a pv-swatch" style="animation-delay:${i * 0.2}s"/>`).join(''); },
    motion: (p) => `${[...String(p.label || 'type').slice(0, 6)].map((ch, i) => `<text x="${30 + i * 12}" y="42" class="pv-t pv-big pv-a pv-letter" style="animation-delay:${i * 0.12}s">${esc(ch)}</text>`).join('')}
      <rect x="18" y="52" width="84" height="2" class="pv-fill pv-a pv-grow"/>`,
    nodes: (p) => `<path d="M30 24 C48 24 48 48 66 48 M30 24 C52 24 72 22 92 26" class="pv-stroke" fill="none" opacity=".6"/>
      <rect x="12" y="16" width="20" height="16" rx="3" class="pv-fill"/><rect x="64" y="40" width="22" height="16" rx="3" class="pv-fill" opacity=".7"/><rect x="88" y="18" width="20" height="16" rx="3" class="pv-fill" opacity=".55"/>
      <circle cx="30" cy="24" r="3" fill="#fff" class="pv-a pv-travel"/>`,
    duo: (p) => `<g class="pv-a pv-talk1"><rect x="10" y="12" width="58" height="20" rx="8" class="pv-fill"/><text x="39" y="26" class="pv-t pv-s" fill="#000">✦</text></g>
      <g class="pv-a pv-talk2"><rect x="52" y="38" width="58" height="20" rx="8" fill="#7cd992"/><text x="81" y="52" class="pv-t pv-s" fill="#000">✧</text></g>`,
    meter: (p, r) => [0, 1, 2, 3, 4, 5].map((i) => { const h = 12 + Math.round(r() * 34); return `<rect x="${16 + i * 15}" y="${60 - h}" width="10" height="${h}" rx="2" class="pv-fill pv-a pv-bar" opacity="${0.45 + (i % 3) * 0.2}" style="animation-delay:${i * 0.12}s"/>`; }).join('') + '<rect x="12" y="60" width="96" height="1.5" class="pv-dim2"/>',
    timer: (p) => `<circle cx="60" cy="36" r="22" class="pv-stroke" fill="none"/><g class="pv-a pv-spin"><rect x="59" y="18" width="2" height="18" rx="1" class="pv-fill"/></g><circle cx="60" cy="36" r="2.5" class="pv-fill"/>
      <text x="96" y="64" class="pv-t pv-s">${esc(p.label)}</text>`,
    undo: (p) => `<g class="pv-a pv-unspin"><path d="M44 26 A16 16 0 1 1 44 46" class="pv-stroke" fill="none" stroke-width="3"/><path d="M36 22 L46 26 L40 34 Z" class="pv-fill"/></g>`,
    save: (p) => `<path d="M38 46 v10 h44 v-10" class="pv-stroke" fill="none" stroke-width="3"/><g class="pv-a pv-drop"><rect x="57" y="14" width="6" height="18" class="pv-fill"/><path d="M50 30 L60 42 L70 30 Z" class="pv-fill"/></g>`,
    search: (p) => `${[0, 1, 2, 3].map((i) => `<rect x="14" y="${14 + i * 12}" width="${60 + (i % 2) * 24}" height="5" rx="2.5" class="pv-dim2"/>`).join('')}
      <g class="pv-a pv-scan"><circle cx="30" cy="30" r="9" class="pv-stroke" fill="none" stroke-width="3"/><rect x="36" y="36" width="10" height="4" rx="2" transform="rotate(45 36 36)" class="pv-fill"/></g>`,
    doc: (p) => `<rect x="30" y="8" width="60" height="58" rx="4" class="pv-dim"/>${[0, 1, 2, 3].map((i) => `<rect x="38" y="${18 + i * 11}" width="${44 - (i === 3 ? 18 : 0)}" height="4" rx="2" class="pv-fill pv-a pv-write" style="animation-delay:${i * 0.35}s"/>`).join('')}`,
    gear: (p) => `<g class="pv-a pv-spin"><circle cx="60" cy="36" r="15" class="pv-stroke" fill="none" stroke-width="5" stroke-dasharray="6 4"/><circle cx="60" cy="36" r="7" class="pv-fill"/></g><text x="96" y="64" class="pv-t pv-s">${esc(p.icon)}</text>`,
    forge: (p) => `<path d="M34 46 h52 l-8 -10 h-36 z" class="pv-fill"/><rect x="52" y="46" width="16" height="12" class="pv-fill" opacity=".7"/>
      ${[0, 1, 2, 3].map((i) => `<circle cx="${56 + i * 4}" cy="34" r="1.6" fill="#ffd75e" class="pv-a pv-spark" style="animation-delay:${i * 0.18}s;--dx:${(i - 1.5) * 14}px"/>`).join('')}`,
    chat: (p) => `<rect x="12" y="12" width="70" height="24" rx="10" class="pv-dim"/><text x="20" y="28" class="pv-t pv-s" text-anchor="start">/${esc(String(p.name || '').slice(0, 10))}</text>
      <g class="pv-a pv-pop"><rect x="38" y="40" width="70" height="22" rx="10" class="pv-fill"/>${[0, 1, 2].map((i) => `<circle cx="${62 + i * 10}" cy="51" r="3" fill="#000" class="pv-a pv-dot" style="animation-delay:${i * 0.15}s"/>`).join('')}</g>`,
  };
  const KINDS = Object.keys(S);
  // the SVG markup for a command (paused until its host gets .on)
  function svg(def) {
    const p = { ...CmdPageData.previewOf(def), name: def.name };
    const draw = S[p.kind] || S.chat;
    return `<svg class="pv pv-${p.kind}" viewBox="0 0 ${W} ${H}" style="--c:${p.color}" aria-hidden="true">${draw(p, rnd(p.seed))}</svg>`;
  }
  const clipOf = (name) => (typeof CmdClips !== 'undefined' && CmdClips[name]) || null;
  // Fills host with the preview: the SVG (always, as the poster), plus the clip on top when there is one and it may
  // play now (opts.clip). Returns { play(on) }.
  function mount(host, def, { clip = false } = {}) {
    host.classList.add('pv-host');
    host.innerHTML = svg(def);
    let video = null;
    const src = clip && clipOf(def.name);
    function play(on) {
      host.classList.toggle('on', Boolean(on));
      if (!src) return;
      if (on && !video) {
        video = document.createElement('video');
        Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto', src: src.file || src });
        video.className = 'pv-clip';
        video.addEventListener('error', () => { video?.remove(); video = null; host.classList.remove('has-clip'); host.dataset.clip = 'failed'; }, { once: true });
        video.addEventListener('playing', () => { host.classList.add('has-clip'); host.dataset.clip = 'playing'; }, { once: true });
        host.append(video);
      }
      if (video) { if (on) video.play().catch(() => {}); else video.pause(); }
    }
    return { play, get video() { return video; }, hasClip: Boolean(src) };
  }
  return { svg, mount, KINDS, clipOf };
})();
