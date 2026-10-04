// MCP server for the Three Director: Claude writes and runs three.js sketches in the hub's Lab
// from the user's descriptions, checks the console and looks at the result.
const { serve } = require('./common');

const GUIDE = `The user describes scenes in words; you build them as three.js sketches in the hub's Three.js Lab, which they watch live next to this chat.
Sketches are ES modules: import * as THREE from 'three' and addons from 'three/addons/...' (e.g. 'three/addons/controls/OrbitControls.js'). Create your own WebGLRenderer, append renderer.domElement to document.body, size it to innerWidth/innerHeight, handle resize, and animate with renderer.setAnimationLoop((now) => …) (time in ms). Don't use THREE.Clock (deprecated).
Workflow: three_set_code with a complete sketch → read the console/errors it returns → three_screenshot to see the result → refine. Keep going until it matches the request.`;

const TOOLS = [
  { name: 'three_get_code', description: 'Current sketch name and code in the Lab.', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_set_code', description: 'Replace the current sketch with complete code and run it. Returns console output, errors (with line numbers) and performance stats after it starts. The previous code is kept in the sketch history.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, wait: { type: 'number', description: 'Seconds to let it run before reporting (default 2.5)' } }, required: ['code'] } },
  { name: 'three_new_sketch', description: 'Create a new named sketch with this code, open it and run it (keeps the user\'s other sketches untouched).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' } }, required: ['name', 'code'] } },
  { name: 'three_screenshot', description: 'Image of what the sketch shows right now.', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_console', description: 'Recent console lines and errors from the running sketch, plus fps/draw-call stats.', inputSchema: { type: 'object', properties: {} } },
];

serve({ name: 'three-lab', instructions: GUIDE, tools: TOOLS });
