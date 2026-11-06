// 🧩 Blocks (round 134, blocks134): what loads with the Lab. The card (tools/three-blocks*.js, lazy group "blocks")
// loads on first use; this gives it its ways in, folded behind menus (no toolbar row):
//   · 🧩 Blocks in the toolbar's ⋯ (This Lab) and in ✦ More (the preview's right-click)
//   · /blocks [list | add <block> | combine <mood> | undo]
const LabBlocksHook = (() => {
  async function card(fn = (B) => B.open()) {
    if (typeof LabBlocks === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('blocks');
    if (typeof LabBlocks === 'undefined') throw new Error('The blocks did not load');
    return fn(LabBlocks);
  }
  const openIt = () => card().catch((e) => toast(e.message, { type: 'error' }));
  const item = () => ({ label: '🧩 Blocks', hint: 'combine ready-made effects into a look', cmd: 'blocks', action: openIt });
  const toolbarRow = () => ['🧩 Blocks', 'Ready-made effects to combine into a look, by hand or ✦ for you', openIt, false, 'Blocks'];
  if (typeof Commands !== 'undefined' && !Commands.get?.('blocks')) {
    Commands.register({
      name: 'blocks', area: 'Three.js Lab', args: '[list | add <block> | combine <mood> | undo]',
      desc: '🧩 Effect building blocks: noise field, bloom, trails, kaleidoscope, particles, displacement, chromatic split, grain, pixelate, mirror, colour ramp, beat strobe and your own. A click adds one above the selected layer (one undo); ✦ Combine for me builds 3–5 for a mood (cost first). Alone: the card',
      keywords: 'blocks effects chain combine mood bloom glow trails kaleidoscope particles noise displace chromatic grain film pixelate mirror ramp strobe palette',
      examples: ['/blocks', '/blocks add bloom', '/blocks combine dreamy underwater pulse'],
      complete: (a) => ['list', 'add ', 'combine ', 'undo'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const s = String(args || '').trim(); const w = s.split(/\s+/)[0].toLowerCase(); const rest = s.slice(w.length).trim();
        if (w === 'list') return card(async (B) => { const mine = await B.mineList(); return [...BlocksCore.BLOCKS.map((b) => `- ${b.id}: ${b.name} — ${b.desc}`), ...mine.map((m) => `- ${m.id}: ${m.name} (mine)`)].join('\n'); });
        if (w === 'add') return card(async (B) => `Added ${(await B.add(rest)).layers.join(', ')} (one undo).`);
        if (w === 'combine') return card(async (B) => ((await B.combine(rest)) ? 'Sent to the Three Director.' : 'Not sent.'));
        if (w === 'undo') return card((B) => (B.undo() ? 'Undone.' : 'Nothing to undo.'));
        await card();
        return '';
      },
    });
  }
  return { item, toolbarRow, card };
})();
