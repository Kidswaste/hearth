// Memory editor: shared notes plus one note per native agent, stored in data/memory.json.
const MemoryEditor = (() => {
  const dialog = $('memory-dialog');
  const form = $('memory-form');
  const list = $('memory-agents');

  function updateSize() {
    const chars = [...form.querySelectorAll('textarea')].reduce((n, t) => n + t.value.trim().length, 0);
    // Roughly 4 characters per token.
    $('memory-size').textContent = chars ? `About ${Math.ceil(chars / 4)} tokens added per message` : '';
  }

  async function open() {
    const memory = await window.hub.getMemory();
    form.shared.value = memory.shared || '';
    list.replaceChildren();
    for (const agent of H.agents().filter((a) => a.mode === 'native')) {
      const label = document.createElement('label');
      label.textContent = `${agent.name} only`;
      const area = document.createElement('textarea');
      area.rows = 4;
      area.dataset.agent = agent.id;
      area.value = memory.agents?.[agent.id] || '';
      area.placeholder = `Notes only ${agent.name} sees. It adds to these itself when you tell it something worth remembering.`;
      label.append(area);
      list.append(label);
    }
    updateSize();
    dialog.showModal();
  }

  form.addEventListener('input', updateSize);
  form.addEventListener('submit', async () => {
    const memory = await window.hub.getMemory();
    memory.shared = form.shared.value.trim();
    for (const area of list.querySelectorAll('textarea')) memory.agents[area.dataset.agent] = area.value.trim();
    await window.hub.saveMemory(memory);
  });
  $('cancel-memory').addEventListener('click', () => dialog.close());
  $('memory-btn').addEventListener('click', open);

  return { open };
})();
