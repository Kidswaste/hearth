// On-demand proof collection. No model calls, project scan or background indexing.
(function(root, make) { if (typeof module === 'object') module.exports = make(require('./quest-review')); else root.QuestProof = make(root.QuestReview); })(typeof self !== 'undefined' ? self : this, R => {
  const cap = (x, n) => String(x || '').slice(0, n);
  const time = x => typeof x === 'number' ? x : Date.parse(x) || 0;
  const words = x => (String(x || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2);
  const stop = new Set(words('the this that with from into your for and one more before after show test keep make improve polish normal game speed stop move quest project work actual result small change version what have has was were then when only can now use using first last single scene chat file saved'));
  function chatIds(q, p) {
    if (!p || p.id !== q.projectId) return [];
    const linked = new Set([p.workspace?.chatId, ...(p.items || []).filter(i => i.type === 'chat').map(i => i.ref)].filter(Boolean));
    return [...new Set([q.projectTask?.chatId, p.workspace?.chatId, ...linked].filter(id => linked.has(id)))].slice(0, 3);
  }
  function select(q, p, chats, since = 0) {
    const allowed = new Set(chatIds(q, p)), target = words(q.projectTask?.target), terms = [...new Set(words(q.title + ' ' + q.done + ' ' + target.join(' ')).filter(w => !stop.has(w) && !words(p.name).includes(w)))];
    const candidates = [], cutoff = time(since);
    for (const chat of chats.filter(c => c && allowed.has(c.id))) {
      const messages = chat.messages || [];
      for (let i = Math.max(0, messages.length - 60); i < messages.length; i++) {
        const m = messages[i], text = cap(m.text || m.content, 12000), linked = R.chatFiles(m), media = linked.length;
        // A short upload reply can inherit relevance from the immediately preceding
        // discussion. The actual proof remains the upload, not that request's claims.
        const context = media && text.length < 30 ? messages.slice(Math.max(0, i - 2), i).map(m => cap(m.text || m.content, 2000)).join(' ') : '';
        const tokens = new Set(words(text + ' ' + linked.join(' ') + ' ' + context));
        if (!['assistant', 'user'].includes(m.role) || (text.trim().length < 30 && !media)) continue;
        const hits = terms.filter(w => tokens.has(w)).length, named = target.some(w => tokens.has(w));
        const tested = /\b(tested|tried|observed|expected|actual|passed|failed|reworked|changed|built|exported)\b/i.test(text);
        if (!hits || (!named && hits < 2) || (m.role === 'user' && !media && !tested)) continue;
        candidates.push({ chat, index: i, at: time(m.at), text, older: Boolean(cutoff && time(m.at) < cutoff), score: hits + (named ? 3 : 0) + (media ? 4 : 0) + (tested ? 2 : 0) });
      }
    }
    const recent = candidates.filter(x => !x.older).sort((a, b) => b.at - a.at || b.index - a.index);
    if (!recent.length) return [];
    const best = [...recent].sort((a, b) => b.score - a.score || b.at - a.at);
    const chosen = [recent[0], ...best.filter(x => x !== recent[0]).slice(0, 2)];
    // A prior named result may explain a rename or provide a baseline. Label it explicitly.
    const old = candidates.filter(x => x.older && target.some(w => words(x.text).includes(w))).sort((a, b) => b.at - a.at)[0];
    if (old) chosen.push(old);
    return chosen.slice(0, 4);
  }
  async function collect(q, p, { since = 0, getChat, busy = () => false, cancelled = () => false, progress = () => {}, review = R } = {}) {
    const ids = chatIds(q, p), check = () => { if (cancelled()) throw Error('Collection cancelled.'); if (ids.some(busy)) throw Error('Your project chat is still working. Finish its reply, then try again.'); };
    check(); if (!ids.length) return { proof: null, reason: 'This project has no linked chat yet. You can attach your result below.' };
    progress('Finding the work in your project chat…');
    const loaded = await Promise.allSettled(ids.map(getChat)); check();
    const chats = loaded.flatMap((r, i) => r.status === 'fulfilled' && r.value?.id === ids[i] ? [r.value] : []), selected = select(q, p, chats, since);
    if (!selected.length) return { proof: null, reason: 'I couldn’t confidently match recent chat work to this quest. Choose one message or export below.' };
    const parts = [], sources = [], files = [], images = [], notes = [], usedFiles = new Set(); let bytesLeft = 40 * 1024 * 1024;
    // Select current artifacts first, then contextual messages. Never run submitted code.
    for (const x of selected) {
      check(); progress('Keeping proof from ' + cap(x.chat.title || 'your project chat', 80) + '…');
      const proof = await review.chat(x.chat, x.index, { maxImages: 4 - images.length }); check();
      images.push(...proof.images); parts.push(proof);
      sources.push({ chatId: x.chat.id, agentId: x.chat.agentId, messageId: proof.messageId, title: cap(x.chat.title || 'Project chat', 200), at: x.at, older: x.older });
      notes.push(proof.analysis);
      const m = x.chat.messages[x.index];
      for (const path of review.chatFiles(m).filter(path => !/\.(png|jpe?g|webp|gif)$/i.test(path))) {
        check(); if (usedFiles.has(path)) continue;
        if (usedFiles.size >= 2 || bytesLeft < 1) { notes.push('Linked export omitted by collection limit: ' + path.split(/[\\/]/).pop()); continue; }
        usedFiles.add(path);
        if (/\.(mp4|webm|mov)$/i.test(path) && images.length > 1) { notes.push('Clip not sampled: image limit reached. ' + path.split(/[\\/]/).pop()); continue; }
        try {
          const part = await review.localFile(path, Math.min(bytesLeft, 20 * 1024 * 1024)); check();
          parts.push(part); images.push(...part.images); bytesLeft -= part.bytes;
          files.push({ path: part.path, title: part.title, kind: part.kind, bytes: part.bytes }); notes.push(part.title + ': ' + part.analysis + ' ' + part.coverage);
        } catch (err) { check(); notes.push('Linked file not inspected: ' + path.split(/[\\/]/).pop() + ' (' + cap(err.message, 180) + ')'); }
      }
    }
    check();
    const excerptParts = [];
    // Source labels distinguish a report of testing from the actual contents of an export.
    for (const part of parts) {
      const s = sources.find(s => s.chatId === part.chatId && s.messageId === part.messageId);
      const label = s ? `${s.older ? 'Earlier reference' : 'Quest-period message'} · ${s.title} · message ${s.messageId}` : `File contents · ${part.title}`;
      if (part.excerpt) excerptParts.push(label + '\n' + cap(part.excerpt, 4500));
    }
    const excerpt = cap(excerptParts.join('\n\n'), 20000), lead = parts[0];
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.map(p => p.fingerprint).join('|')));
    const fingerprint = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
    const proof = { ...lead, title: cap(p.name + ' · gathered quest proof', 200), fingerprint, excerpt, images: images.slice(0, 4), sources, attachments: files,
      analysis: cap(notes.filter(Boolean).join('\n'), 6000),
      coverage: cap(`Gathered from ${sources.length} relevant messages in this project’s linked chats: ${images.length} saved image/frame(s), ${files.length} exported file(s). Excerpts capped at 20,000 characters; earlier references are labeled. Tests are reported, not independently verified. Audio is measured, not heard; video uses sampled stills. Unavailable/omitted media is listed in analysis.`, 600) };
    return { proof, sources, reason: '' };
  }
  return { chatIds, select, collect };
});
