// (round 136, phone136) 📱 See it on my phone: the phone's side (phoneview-page.html). No framework, no storage.
//   render  the video, full screen, looping (starts muted so it can start by itself: 🔇 Sound turns it on)
//   live    the Lab's preview as a stream of JPEGs (one long response the <img> keeps showing), with
//           "live from Hearth · 1080×1920"; the song plays on the computer
// Every request carries this page's token (it's in the address) and a random id for this phone.
// One phone at a time (round 148b): opening the page claims the view; when another phone opens the link, this one is
// told (409) and shows "Viewing moved to another phone · Tap to take it back"; a tap claims it back (same rule).
(() => {
  const $ = (id) => document.getElementById(id);
  const cid = Math.random().toString(36).slice(2, 12);
  const q = `?c=${cid}`;
  const stage = $('stage'); const what = $('what'); const note = $('note'); const bar = $('bar');
  const P = (window.__phone = { mode: null, ok: false, stopped: false, moved: false, frames: 0, playing: false, info: null });
  const say = (t) => { note.textContent = t || ''; note.hidden = !t; };
  let media = null; let misses = 0;

  function ended(text) {
    if (P.stopped) return;
    P.stopped = true;
    if (media?.tagName === 'IMG') media.removeAttribute('src');
    if (media?.tagName === 'VIDEO') media.pause();
    say(text || 'Stopped on the computer. Scan the new code to watch again.');
    bar.classList.remove('hide');
  }
  // another phone has the view: let go of the picture (the computer has closed our stream already) and offer it back
  function moved() {
    if (P.stopped || P.moved) return;
    P.moved = true;
    if (media?.tagName === 'IMG') media.removeAttribute('src');
    if (media?.tagName === 'VIDEO') media.pause();
    say('Viewing moved to another phone · Tap to take it back');
    bar.classList.remove('hide');
  }
  async function takeBack() {
    if (!P.moved || P.stopped) return;
    try {
      const r = await fetch(`claim${q}`, { cache: 'no-store' });
      if (r.status === 403 || r.status === 410) { ended(); return; }
      if (!r.ok) return;
    } catch { say('The computer can\'t be reached (same Wi-Fi?).'); return; }
    P.moved = false;
    if (media?.tagName === 'IMG') { say('Waiting for the first picture…'); media.src = `live${q}&n=${Date.now()}`; }
    if (media?.tagName === 'VIDEO') { say(''); media.play().catch(() => say('Tap to play')); }
  }
  addEventListener('click', () => { if (P.moved) takeBack(); }, true);
  async function ping() {
    if (P.stopped || P.moved) return;
    try {
      const r = await fetch(`ping${q}`, { cache: 'no-store' });
      if (r.status === 403 || r.status === 410) { ended(); return; }
      if (r.status === 409) { moved(); return; }
      misses = 0;
    } catch { misses += 1; if (misses >= 3) ended('The computer can\'t be reached (same Wi-Fi?). It may have stopped.'); else setTimeout(ping, 1500); } // (a Wi-Fi hiccup gets two quick retries)
  }

  function render(info) {
    const v = document.createElement('video');
    v.src = `video${q}`; v.loop = true; v.muted = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    v.addEventListener('playing', () => { P.playing = true; say(''); });
    v.addEventListener('error', async () => {
      if (P.stopped || P.moved) return;
      try { const r = await fetch(`ping${q}`, { cache: 'no-store' }); if (r.status === 409) { moved(); return; } } catch { /* said below */ }
      say('This video doesn\'t play on this phone (try an MP4 render).');
    });
    stage.append(v); media = v;
    v.play().catch(() => say('Tap to play'));
    const sound = $('sound'); sound.hidden = false;
    sound.onclick = () => { v.muted = !v.muted; sound.textContent = v.muted ? '🔇 Sound' : '🔊 Sound'; v.play().catch(() => {}); };
    stage.onclick = () => { if (v.paused && !P.moved) v.play().catch(() => {}); };
    what.textContent = info.title || 'Hearth';
  }
  function live(info) {
    const img = document.createElement('img');
    img.alt = 'Live from Hearth';
    img.addEventListener('load', () => { P.frames += 1; if (P.frames === 1) say(''); });
    img.addEventListener('error', () => { if (!P.stopped && !P.moved) ping(); });
    img.src = `live${q}`;
    stage.append(img); media = img;
    const paint = (i) => { what.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot', textContent: '● ' }), document.createTextNode(`live from Hearth${i.label ? ` · ${i.label}` : ''}`)); };
    paint(info);
    say('Waiting for the first picture…');
    setInterval(async () => { if (P.stopped || P.moved) return; try { const r = await fetch(`info${q}`, { cache: 'no-store' }); if (r.status === 409) { moved(); return; } const i = await r.json(); P.info = i; paint(i); } catch { /* the ping says */ } }, 4000);
  }

  $('full').onclick = () => {
    const v = media;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
    else if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };
  // the bar fades after a moment; a tap brings it back
  let hideT = 0;
  const showBar = () => { bar.classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => { if (!P.stopped && !P.moved) bar.classList.add('hide'); }, 3500); };
  addEventListener('pointerdown', showBar); showBar();

  (async () => {
    try {
      const r = await fetch(`claim${q}`, { cache: 'no-store' }); // (opening the link takes the view: the newest phone wins)
      if (!r.ok) { ended('This link has ended. Scan the new code on the computer.'); return; }
      const info = await r.json(); P.info = info; P.mode = info.mode; P.ok = true;
      document.title = info.mode === 'live' ? 'Live from Hearth' : `${info.title} · Hearth`;
      if (info.mode === 'live') live(info); else render(info);
      setInterval(ping, 5000);
    } catch { ended('The computer can\'t be reached (same Wi-Fi?).'); }
  })();
})();
