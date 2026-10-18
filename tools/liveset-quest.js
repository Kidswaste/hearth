// (round 64, liveset64) The open-mic quest's way into the Live set: a "🎤 Rehearse your set" button on the quest's card in
// Sidequest Studio (Codex's journal; showprep62's detail-hook contract: fn({ quest, campaign, close, kit }) → a node).
// One click closes the card and opens the Live set over the Sound desk (tools/liveset.js, loaded with the creative group).
// Tiny on purpose: it lives in the questjournal lazy group and loads nothing until it is clicked.
(() => {
  function aside({ campaign, close, kit }) {
    if (campaign?.id !== 'c-pq-openmic') return null;
    const { E, button, p, label } = kit;
    return E('section', { class: 'qj-starting-note' }, label('YOUR SET'), p('Build a short set from your park loops, your song and your presets, rehearse it with big pads, and keep the recording as proof.'),
      button('🎤 Rehearse your set', async () => {
        close();
        try { await Lazy.load('creative'); await LiveSet.open(); } catch (err) { (typeof toast === 'function' ? toast : console.warn)(err.message, { type: 'error' }); }
      }, 'qj-primary'));
  }
  try { if (typeof QuestJournal !== 'undefined') QuestJournal.addDetailHook?.(aside); } catch (err) { console.warn('[liveset]', err); }
})();
