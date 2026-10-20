// Real module downloads once; then a new sandbox with the renderer network offline.
// No real chats, scenes, files, or AI replies are used.
const assert = (ok, label) => { if (!ok) throw new Error(label); console.log(`PASS ${label}`); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
await hub.kvSet('projects', { v: 1, list: [{ id: 'offline-test', name: 'Train test', items: [{ type: 'scene', ref: 'trip-scene' }] }] });
await hub.kvSet('three-sketches', [{ id: 'trip-scene', name: 'Train scene', code: "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';" }]);
await hub.kvSet('three-lab-extras', {});
await hub.kvSet('three-refs', {});
await hub.kvSet('video-cuts', {});
const before = await hub.net.prepareProject({ projectId: 'offline-test' });
assert(!before.libraries.ready, 'new computer needs a download');
const done = await hub.net.prepareProject({ projectId: 'offline-test', download: true });
assert(done.ready, JSON.stringify(done.libraries));
const dialog = await Offline.prepare({ id: 'offline-test', name: 'Train test' });
for (let i = 0; i < 100 && !dialog.textContent.includes('Files and scene libraries are local'); i++) await wait(100);
assert(dialog.textContent.includes('Files and scene libraries are local'), 'dialog shows this computer readiness');
await smoke({ shot: `${window.SMOKE_SAVES}/offline-ready.png` });
dialog.close();
await smoke({ cdp: 'Network.enable' });
await smoke({ cdp: 'Network.emulateNetworkConditions', params: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } });
const iframe = document.createElement('iframe');
iframe.src = 'tools/three-sandbox.html?v=0.186.1&offlineTest=1';
document.body.append(iframe);
await new Promise((resolve, reject) => { iframe.onload = resolve; iframe.onerror = reject; setTimeout(() => reject(Error('sandbox load timed out')), 20000); });
// Import from within the real sandbox, using its import map and renderer shim.
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { removeEventListener('message', message); reject(Error('offline render timed out')); }, 30000);
  const message = event => { if (event.source === iframe.contentWindow && event.data?.offlineProof) { clearTimeout(timer); removeEventListener('message', message); resolve(event.data); } };
  addEventListener('message', message);
  const code = `try {
    const THREE = await import('three');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(160, 160);
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
    camera.position.z = 3;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()));
    renderer.render(scene, camera);
    parent.postMessage({ offlineProof: true, ok: true, revision: THREE.REVISION, addon: typeof mergeGeometries }, '*');
    renderer.dispose();
  } catch(e) { parent.postMessage({ offlineProof: true, ok: false, error: e.message }, '*'); }`;
  iframe.contentWindow.postMessage({ target: 'three-sandbox', type: 'run', code }, '*');
});
assert(result.ok && result.addon === 'function', `fresh sandbox renders offline: ${JSON.stringify(result)}`);
iframe.remove();
await smoke({ cdp: 'Network.emulateNetworkConditions', params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } });
console.log('OFFLINE PROJECT PASS');
