// Each Lab scene owns its sequence (seq2, the owner: "also tie the sequences to each scene in the lab"): two Three
// Director chats with their own scenes; ▤ Sequence on chat A's scene opens A's own (made without asking); switching
// to chat B switches the view to B's sequence in the same page (no reload) and back; the director chat's scene is
// what three_sequence acts on (of: another scene's); a duplicated scene brings a copy of its sequence; the chat row
// tells about it; an old sequence that belonged to no scene is taken over by the scene it starts with; then the
// window reloads and everything is read back from disk (each scene finds its own sequence again).
//   node dev/smoke.js --fake-engines --wait 6000 --check-timeout 600000 --script dev/checks/seq2-scenes.js --shot /tmp/seq2-scenes.png
const { step, wait, until } = J;
const Q = ThreeSeq;
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'), 15000);
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director, 20000);
await wait(800);
const S = ThreeLab.scenes;
const chat = async (text) => {
  Native.newChat(agent.id);
  await until(() => S.get(S.currentId())?.name === 'New chat', 8000);
  await Native.send(agent.id, text);
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
  const id = H.activeChat[agent.id];
  return { chat: id, sk: ChatScenes.linkOf(id) };
};
const A = await chat('Scene A: gold rings');
const B = await chat('Scene B: violet mist');
step('two director chats, two scenes', A.sk && B.sk && A.sk !== B.sk, [S.get(A.sk)?.name, S.get(B.sk)?.name]);

// ---------- chat A: its own sequence, made without asking ----------
Native.open(agent.id, A.chat);
await until(() => S.currentId() === A.sk, 8000);
await wait(600);
await Q.enter();
step('▤ Sequence on chat A\'s scene: A\'s own sequence (made without asking)', Q.active && Q.owner === A.sk && Q.edit.seq.scene === A.sk, Q.status());
await Q.add({ sketch: A.sk }, { dur: 2, trans: null });
await Q.add({ sketch: B.sk }, { dur: 2, trans: null });
await Q.add({ text: 'A TITLE' }, { at: 0.2, dur: 1 });
const keyA = Q.key;
const nA = Q.edit.clips.length;
await wait(800);
const reloads0 = JSON.stringify(ThreeLab.live.counts().reloads);

// ---------- switching chats switches the sequence (same page) ----------
Native.open(agent.id, B.chat);
await until(() => S.currentId() === B.sk && Q.owner === B.sk, 10000);
await wait(800);
step('switch to chat B: the view shows B\'s own sequence', Q.active && Q.owner === B.sk && Q.key !== keyA && Q.edit.seq.scene === B.sk, { key: Q.key, owner: Q.owner });
const info = await SQL.sbx('return __seqInfo()');
step('…in the same page (no reload), the program on', JSON.stringify(ThreeLab.live.counts().reloads) === reloads0 && info?.on, { reloads: ThreeLab.live.counts().reloads, info });
const keyB = Q.key;
Native.open(agent.id, A.chat);
await until(() => S.currentId() === A.sk && Q.key === keyA, 10000);
step('back to chat A: A\'s sequence with its clips', Q.key === keyA && Q.edit.clips.length === nA, Q.status().clips);

// ---------- the director chat's scene / another scene ----------
const rB = await Q.handle('three_sequence', { op: 'status' }, { sketchId: B.sk });
step('three_sequence from chat B\'s director acts on B\'s sequence', rB.ok && rB.value.sequence === keyB.slice(4), rB.value?.sequence);
const rOf = await Q.handle('three_sequence', { op: 'status', of: S.get(A.sk).name });
step('…and "of" targets another scene\'s', rOf.ok && rOf.value.sequence === keyA.slice(4), rOf.value?.sequence);
await Native.open(agent.id, A.chat); await wait(400); await Q.enter();

// ---------- it travels with the scene ----------
const copy = S.duplicate(A.sk, 'Scene A copy');
await until(async () => (await Q.list()).some((x) => x.scene === copy.id), 8000);
const all = await Q.list();
const cs = all.find((x) => x.scene === copy.id);
const ce = cs ? await VideoCut.editFor(cs.key) : null;
step('a duplicated scene brings a copy of its sequence (its own clips now point at the copy)', Boolean(cs) && cs.clips === nA && ce.clips.some((c) => c.sketch === copy.id) && ce.clips.some((c) => c.sketch === B.sk), cs);
S.rename(A.sk, 'Scene A renamed');
await wait(300);
const stillA = await Q.keyForScene(A.sk, { make: false });
step('renaming the scene keeps its sequence', stillA === keyA, stillA);
await Q.list();
const sum = Q.summaryFor(A.sk);
step('the scene\'s sequence in a few words (scene menus)', sum?.key === keyA && sum.clips === nA, sum);
ChatScenes.paintAll?.();
await wait(500);
const row = document.querySelector(`#chat-groups .item[data-key="${CSS.escape(A.chat)}"] .chat-ident`);
step('the chat row\'s still tells about its sequence', Boolean(row) && /▤ its sequence/.test(row.title || ''), row?.title);

// an old sequence (made before scenes owned them) starting with B's scene: B takes it over when it has none
const legacy = { v: 1, clips: [{ id: 'legacy1', kind: 'scene', sketch: B.sk, name: 'B', dur: 2, in: 0, speed: 1, mute: true, fadeIn: 0, fadeOut: 0 }], markers: [], mark: null, seq: { w: 1080, h: 1920, fps: 30, lab: true, format: '9:16', name: 'Old one' } };
await VideoCut.storeEdit('seq:Old one', legacy, 'check');
VideoCut.deleteSequence(keyB);
const claimed = await Q.keyForScene(B.sk);
step('an old sequence that belonged to no scene goes to the scene it starts with', claimed === 'seq:Old one' && (await VideoCut.editFor('seq:Old one')).seq.scene === B.sk, claimed);
localStorage.setItem('seq2.check', JSON.stringify({ A, B, keyA, nA, copy: copy.id }));
await wait(1500); // (saves land)
return J.done();
//@@ reload
const { step, wait, until } = J;
const Q = ThreeSeq;
const st = JSON.parse(localStorage.getItem('seq2.check') || '{}');
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director, 20000);
await wait(1000);
const S = ThreeLab.scenes;
Native.open(agent.id, st.B.chat);
await until(() => S.currentId() === st.B.sk, 10000);
await wait(600);
await Q.enter();
step('after a reload: chat B\'s scene opens its sequence (the one it took over)', Q.key === 'seq:Old one' && Q.owner === st.B.sk, { key: Q.key, owner: Q.owner });
Native.open(agent.id, st.A.chat);
await until(() => S.currentId() === st.A.sk && Q.key === st.keyA, 10000);
step('…switching to chat A brings A\'s back, clips and title intact', Q.key === st.keyA && Q.edit.clips.length === st.nA && Q.edit.tracks.some((k) => k.items.some((x) => x.text === 'A TITLE')), Q.status().clips);
step('…the copy\'s sequence is still its own', (await Q.list()).some((x) => x.scene === st.copy));
return J.done();
