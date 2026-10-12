// The shader workbench's starter library (round 23, labshader): fragment shaders in Shadertoy's form
// (mainImage + iTime / iResolution / iChannel0–3) using the Lab's extras (uKick, uBass… and slider hints:
// `uniform float uGlow; // [Group] 0..2, 1 Label`). Each becomes a ◇ layer through ShaderLib.layerCode (/shader new,
// the FX picker's "Shaders" category, three_do shader add). buffers: passes drawn before the image (feedback);
// channels: what iChannel0–3 read ('audio', 'self', 'A'…, 'below' = the layers under it, 'noise').
const ShaderData = (() => {
  const NOISE = `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }`;
  const PAL = 'vec3 pal(float t, vec3 a) { return 0.5 + 0.5 * cos(6.2831 * (t + a)); }';
  const ROT = 'mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }';
  const S = [];
  const add = (id, name, cat, desc, image, more = {}) => S.push({ id, name, cat, desc, image: image.trim(), ...more });

  // ---------- noise & organic ----------
  add('plasma', 'Plasma', 'Noise', 'Classic sine plasma, tinted, a punch on the kick', `
uniform float uSpeed; // [Motion] 0..3, 1 Speed
uniform float uScale; // [Shape] 1..12, 4 Scale
uniform vec3 uTint; // [Color] #ff8c42 Tint
uniform float uPunch; // [Music] 0..1, 0.3 Kick punch
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * uScale;
  float t = iTime * uSpeed;
  float v = sin(uv.x + t) + sin(uv.y * 1.3 - t * 0.7) + sin(length(uv) * 1.7 + t * 1.3) + sin((uv.x + uv.y) * 0.8 + t * 0.4);
  vec3 col = 0.5 + 0.5 * cos(v * 1.5 + vec3(0.0, 2.1, 4.2));
  col = mix(col, col * uTint * 1.6, 0.5);
  col *= 1.0 + uKick * uPunch;
  fragColor = vec4(col, 1.0);
}`);
  add('marble', 'Liquid marble', 'Noise', 'Domain-warped noise flowing like ink in water', `
uniform float uSpeed; // [Motion] 0..2, 0.4 Speed
uniform float uWarp; // [Shape] 0..4, 2 Warp
uniform vec3 uDeep; // [Color] #101030 Deep
uniform vec3 uGlow; // [Color] #ff8c42 Glow
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y * 3.0;
  float t = iTime * uSpeed;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + uWarp * q + vec2(1.7, 9.2) + 0.15 * t), fbm(uv + uWarp * q + vec2(8.3, 2.8) - 0.12 * t));
  float f = fbm(uv + uWarp * r);
  vec3 col = mix(uDeep, uGlow, clamp(f * f * 2.0, 0.0, 1.0));
  col = mix(col, vec3(1.0), clamp(length(q) * 0.3 * f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`);
  add('clouds', 'Clouds', 'Noise', 'Soft drifting fbm clouds over a sky gradient', `
uniform float uSpeed; // [Motion] 0..2, 0.3 Wind
uniform float uCover; // [Shape] 0..1, 0.5 Cover
uniform vec3 uSky; // [Color] #3a6fd8 Sky
uniform vec3 uHorizon; // [Color] #ffd7a8 Horizon
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = vec2(uv.x * iResolution.x / iResolution.y, uv.y) * 3.0 + vec2(iTime * uSpeed, 0.0);
  float c = smoothstep(1.0 - uCover, 1.15 - uCover * 0.5, fbm(p) + 0.25 * fbm(p * 3.0 - iTime * uSpeed));
  vec3 sky = mix(uHorizon, uSky, pow(uv.y, 0.7));
  fragColor = vec4(mix(sky, vec3(1.0), c * 0.9), 1.0);
}`);
  add('voronoi', 'Voronoi cells', 'Noise', 'Moving cells with glowing borders', `
uniform float uScale; // [Shape] 2..20, 6 Cells
uniform float uSpeed; // [Motion] 0..3, 0.8 Speed
uniform float uEdge; // [Shape] 0..1, 0.5 Border glow
uniform vec3 uColor; // [Color] #48ddff Color
vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y * uScale;
  vec2 i = floor(uv); vec2 f = fract(uv);
  float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.5 + 0.5 * sin(iTime * uSpeed + 6.2831 * h2(i + g));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float edge = 1.0 - smoothstep(0.0, 0.08 + uEdge * 0.2, d2 - d1);
  vec3 col = uColor * (0.15 + 0.6 * d1) + edge * mix(uColor, vec3(1.0), 0.5) * (1.0 + uKick);
  fragColor = vec4(col, 1.0);
}`);
  add('aurora', 'Aurora', 'Noise', 'Northern lights curtains over a night sky', `
uniform float uSpeed; // [Motion] 0..2, 0.5 Speed
uniform float uHeight; // [Shape] 0..1, 0.55 Height
uniform vec3 uGreen; // [Color] #30ffa0 Curtain
uniform vec3 uViolet; // [Color] #bd8bff Fringe
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = mix(vec3(0.01, 0.02, 0.06), vec3(0.02, 0.05, 0.14), uv.y);
  float t = iTime * uSpeed;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * (2.0 + fi) + t * (0.2 + fi * 0.1);
    float band = uHeight + 0.12 * sin(x * 1.7 + fi) + 0.1 * (fbm(vec2(x, fi * 3.0)) - 0.5);
    float d = uv.y - band;
    float a = exp(-max(d, 0.0) * 9.0) * smoothstep(-0.25, 0.0, d) * (0.6 + 0.4 * noise(vec2(uv.x * 40.0, t)));
    col += mix(uGreen, uViolet, smoothstep(0.0, 0.25, d)) * a * 0.55;
  }
  col += step(0.997, fract(sin(dot(floor(fragCoord * 0.5), vec2(12.9898, 78.233))) * 43758.5453)) * (1.0 - uv.y) * 0.6;
  fragColor = vec4(col, 1.0);
}`);
  add('lava', 'Lava lamp', 'Noise', 'Metaballs rising and merging, bass makes them swell', `
uniform float uSpeed; // [Motion] 0..2, 0.6 Speed
uniform float uSize; // [Shape] 0.05..0.4, 0.16 Blob size
uniform vec3 uHot; // [Color] #ff5a36 Hot
uniform vec3 uCool; // [Color] #2b0b3f Background
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(0.45 * sin(fi * 1.7 + iTime * uSpeed * (0.3 + fi * 0.07)), 0.5 * sin(iTime * uSpeed * (0.2 + fi * 0.05) + fi * 2.3));
    float r = uSize * (1.0 + 0.4 * uBass);
    f += r * r / dot(uv - c, uv - c);
  }
  float m = smoothstep(0.9, 1.1, f);
  vec3 col = mix(uCool, uHot, m) + uHot * smoothstep(0.4, 1.0, f) * 0.25;
  fragColor = vec4(col, 1.0);
}`);
  add('caustics', 'Caustics', 'Noise', 'Underwater light dancing on the floor', `
uniform float uSpeed; // [Motion] 0..2, 0.5 Speed
uniform float uScale; // [Shape] 1..10, 4 Scale
uniform vec3 uWater; // [Color] #0a4d68 Water
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.y * uScale;
  float t = iTime * uSpeed;
  vec2 i = p; float c = 1.0;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c = 1.17 - pow(c / 5.0, 1.4);
  vec3 col = uWater + vec3(pow(abs(c), 8.0));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`);

  // ---------- patterns ----------
  add('kaleido', 'Kaleidoscope', 'Pattern', 'Mirrored slices of a turning pattern', `
uniform float uSlices; // [Shape] 2..16, 6 Slices
uniform float uSpin; // [Motion] -2..2, 0.3 Spin
uniform float uZoom; // [Shape] 0.5..6, 2 Zoom
uniform float uHue; // [Color] 0..1, 0 Hue shift
${PAL}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = atan(uv.y, uv.x) + iTime * uSpin; float r = length(uv);
  float k = 6.2831 / floor(uSlices);
  a = abs(mod(a, k) - k * 0.5);
  vec2 p = vec2(cos(a), sin(a)) * r * uZoom;
  float v = sin(p.x * 6.0 + iTime) * sin(p.y * 6.0 - iTime * 0.7) + sin(r * 10.0 - iTime * 2.0);
  vec3 col = pal(v * 0.25 + r + uHue, vec3(0.0, 0.33, 0.67)) * smoothstep(1.2, 0.2, r);
  fragColor = vec4(col * (1.0 + uBeat * 0.3), 1.0);
}`);
  add('tunnel', 'Tunnel', 'Pattern', 'Flying down an endless striped tunnel', `
uniform float uSpeed; // [Motion] 0..4, 1 Speed
uniform float uTwist; // [Shape] -3..3, 0.5 Twist
uniform float uStripes; // [Shape] 2..24, 8 Stripes
uniform vec3 uColor; // [Color] #ff8c42 Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(uv); float a = atan(uv.y, uv.x) / 6.2831;
  float z = 0.3 / max(r, 0.001) + iTime * uSpeed;
  float u = a + z * uTwist * 0.1;
  float v = step(0.5, fract(u * uStripes)) * 0.6 + step(0.5, fract(z)) * 0.4;
  vec3 col = mix(uColor * 0.2, uColor, v) * smoothstep(0.0, 0.45, r) * (1.0 + uKick * 0.5);
  fragColor = vec4(col, 1.0);
}`);
  add('hexgrid', 'Hex pulse', 'Pattern', 'A honeycomb lighting up in waves', `
uniform float uScale; // [Shape] 3..30, 10 Cells
uniform float uSpeed; // [Motion] 0..4, 1.5 Wave speed
uniform vec3 uColor; // [Color] #ffd75e Color
float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * uScale;
  vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = uv - g;
  float edge = smoothstep(0.42, 0.5, hexDist(g));
  float wave = 0.5 + 0.5 * sin(length(id) * 0.6 - iTime * uSpeed);
  vec3 col = uColor * (wave * wave * 0.8 + edge * 0.6) * (1.0 + uKick * 0.6);
  fragColor = vec4(col, 1.0);
}`);
  add('truchet', 'Truchet tiles', 'Pattern', 'Quarter-circle maze tiles that flip on the beat', `
uniform float uScale; // [Shape] 3..30, 9 Tiles
uniform float uWidth; // [Shape] 0.02..0.3, 0.1 Line width
uniform vec3 uColor; // [Color] #bd8bff Lines
uniform vec3 uBack; // [Color] #0b0b12 Background
float h1(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y * uScale + vec2(iTime * 0.2, 0.0);
  vec2 id = floor(uv); vec2 f = fract(uv);
  if (h1(id + floor(iTime * 0.5)) > 0.5) f.x = 1.0 - f.x;
  float d = min(abs(length(f) - 0.5), abs(length(f - 1.0) - 0.5));
  float l = smoothstep(uWidth, uWidth * 0.5, d);
  fragColor = vec4(mix(uBack, uColor, l), 1.0);
}`);
  add('moire', 'Moiré rings', 'Pattern', 'Two sets of rings drifting into interference', `
uniform float uRings; // [Shape] 10..120, 50 Rings
uniform float uDrift; // [Motion] 0..1, 0.3 Drift
uniform vec3 uColor; // [Color] #f4efe6 Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec2 o = vec2(sin(iTime * 0.7), cos(iTime * 0.5)) * uDrift;
  float a = step(0.5, fract(length(uv - o) * uRings));
  float b = step(0.5, fract(length(uv + o) * uRings));
  fragColor = vec4(uColor * abs(a - b), 1.0);
}`);
  add('starfield', 'Warp stars', 'Pattern', 'Stars streaking past at warp speed', `
uniform float uSpeed; // [Motion] 0..5, 1.5 Speed
uniform float uDensity; // [Shape] 0.5..3, 1 Density
uniform vec3 uColor; // [Color] #cfe8ff Stars
float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float z = fract(float(i) * 0.25 + iTime * uSpeed * 0.1);
    float s = mix(20.0, 0.5, z) * uDensity;
    vec2 p = uv * s + float(i) * 7.3;
    vec2 id = floor(p); vec2 f = fract(p) - 0.5;
    float n = h1(id);
    float d = length(f - (vec2(h1(id + 1.3), h1(id + 2.7)) - 0.5) * 0.7);
    col += uColor * smoothstep(0.08 * z, 0.0, d) * step(0.6, n) * z * 2.0;
  }
  fragColor = vec4(col * (1.0 + uBeat * 0.4), 1.0);
}`);
  add('sunrays', 'Sun rays', 'Pattern', 'God rays fanning from a glowing sun', `
uniform vec2 uSun; // [Shape] 0..1 = 0.5 0.7 Sun
uniform float uRays; // [Shape] 4..40, 14 Rays
uniform vec3 uColor; // [Color] #ffd75e Light
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 d = (uv - uSun) * vec2(iResolution.x / iResolution.y, 1.0);
  float a = atan(d.y, d.x); float r = length(d);
  float rays = 0.5 + 0.5 * sin(a * uRays + iTime) * sin(a * uRays * 0.37 - iTime * 0.6);
  vec3 col = uColor * (0.08 / max(r, 0.01) + rays * exp(-r * 2.0) * 0.8) * (1.0 + uLevel * 0.5);
  fragColor = vec4(col, 1.0);
}`);
  add('synthgrid', 'Synthwave grid', 'Pattern', 'Neon grid rolling to a striped sun on the horizon', `
uniform float uSpeed; // [Motion] 0..4, 1 Speed
uniform vec3 uGrid; // [Color] #ff3cac Grid
uniform vec3 uSun; // [Color] #ffd75e Sun
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = mix(vec3(0.05, 0.0, 0.12), vec3(0.3, 0.0, 0.3), uv.y + 0.5);
  if (uv.y < -0.05) {
    float z = 0.25 / (-0.05 - uv.y);
    vec2 g = vec2(uv.x * z, z + iTime * uSpeed);
    vec2 l = abs(fract(g) - 0.5) / fwidth(g);
    float line = 1.0 - min(min(l.x, l.y), 1.0);
    col = mix(vec3(0.02, 0.0, 0.05), uGrid, line * exp(-z * 0.08)) * (1.0 + uKick * 0.6);
  } else {
    float d = length(uv - vec2(0.0, 0.18));
    float stripes = step(0.0, sin((uv.y - 0.18) * 90.0 + 1.5) + (uv.y - 0.05) * 18.0);
    col += uSun * smoothstep(0.26, 0.25, d) * stripes + uSun * 0.25 * exp(-d * 4.0);
  }
  fragColor = vec4(col, 1.0);
}`);
  add('rings', 'Neon rings', 'Pattern', 'Glowing rings that ripple out on every kick', `
uniform float uCount; // [Shape] 1..12, 5 Rings
uniform float uGlow; // [Look] 0..2, 1 Glow
uniform vec3 uColor; // [Color] #ff8c42 Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(uv); vec3 col = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uCount) break;
    float rr = fract(float(i) / uCount + iTime * 0.12) * 0.7 + uKick * 0.03;
    col += uColor * 0.004 * uGlow / max(abs(r - rr), 0.002) * (1.0 - rr);
  }
  fragColor = vec4(col, 1.0);
}`);
  add('gradient', 'Flowing gradient', 'Pattern', 'A slow cosine-palette gradient, calm background', `
uniform float uSpeed; // [Motion] 0..1, 0.1 Speed
uniform float uAngle; // [Shape] 0..6.28, 0.8 Angle
uniform float uHue; // [Color] 0..1, 0.1 Hue
${PAL}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float x = dot(uv - 0.5, vec2(cos(uAngle), sin(uAngle)));
  vec3 col = pal(x * 0.6 + iTime * uSpeed + uHue, vec3(0.0, 0.1, 0.2));
  fragColor = vec4(col * 0.9, 1.0);
}`);

  // ---------- raymarching ----------
  add('blobs', 'Raymarched blobs', 'Raymarch', 'Glossy spheres melting together, lit and shaded', `
uniform float uBlend; // [Shape] 0.05..1, 0.4 Melt
uniform float uSpeed; // [Motion] 0..2, 0.7 Speed
uniform vec3 uColor; // [Color] #ff5a36 Color
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float map(vec3 p) {
  float t = iTime * uSpeed; float d = 1e5;
  for (int i = 0; i < 4; i++) { float fi = float(i); d = smin(d, length(p - vec3(sin(t + fi * 1.7), cos(t * 1.3 + fi), sin(t * 0.7 + fi * 2.1)) * 0.9) - 0.55 - 0.1 * uBass, uBlend); }
  return d;
}
vec3 nrm(vec3 p) { vec2 e = vec2(0.002, 0.0); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 4.0); vec3 rd = normalize(vec3(uv, -1.6));
  float t = 0.0; float hit = 0.0;
  for (int i = 0; i < 64; i++) { float d = map(ro + rd * t); if (d < 0.002) { hit = 1.0; break; } t += d; if (t > 10.0) break; }
  vec3 col = vec3(0.04, 0.03, 0.06) + 0.05 * uv.y;
  if (hit > 0.0) {
    vec3 p = ro + rd * t; vec3 n = nrm(p); vec3 l = normalize(vec3(0.6, 0.8, 0.5));
    float dif = max(dot(n, l), 0.0); float spe = pow(max(dot(reflect(rd, n), l), 0.0), 32.0); float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col = uColor * (0.15 + 0.85 * dif) + spe + fre * 0.4;
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`);
  add('columns', 'Infinite columns', 'Raymarch', 'Flying through an endless repeated field of boxes', `
uniform float uSpeed; // [Motion] 0..4, 1 Speed
uniform float uFog; // [Look] 0.01..0.3, 0.08 Fog
uniform vec3 uColor; // [Color] #48ddff Light
${ROT}
float box(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float map(vec3 p) { p.xy *= rot(p.z * 0.05); vec3 q = mod(p, 2.0) - 1.0; return box(q, vec3(0.18, 0.18, 0.6)); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, iTime * uSpeed); vec3 rd = normalize(vec3(uv, 1.0));
  float t = 0.0; int steps = 0;
  for (int i = 0; i < 80; i++) { float d = map(ro + rd * t); steps = i; if (d < 0.001 || t > 40.0) break; t += d; }
  float glow = float(steps) / 80.0;
  vec3 col = uColor * glow * 1.5 * exp(-t * uFog) + uColor * uKick * 0.15;
  fragColor = vec4(col, 1.0);
}`);
  add('gyroid', 'Gyroid caves', 'Raymarch', 'Inside a slowly turning gyroid surface', `
uniform float uScale; // [Shape] 1..8, 3 Scale
uniform float uSpeed; // [Motion] 0..2, 0.4 Speed
uniform vec3 uColor; // [Color] #bd8bff Color
float map(vec3 p) { p *= uScale; return abs(dot(sin(p), cos(p.zxy))) / uScale - 0.03; }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, iTime * uSpeed); vec3 rd = normalize(vec3(uv, 1.0));
  float t = 0.0;
  for (int i = 0; i < 70; i++) { float d = map(ro + rd * t); if (d < 0.001 || t > 12.0) break; t += d * 0.8; }
  vec3 p = ro + rd * t;
  vec3 col = uColor * (0.6 + 0.4 * sin(p * 2.0)) * exp(-t * 0.25);
  fragColor = vec4(col, 1.0);
}`);
  add('julia', 'Julia fractal', 'Raymarch', 'A Julia set breathing with the music', `
uniform float uZoom; // [Shape] 0.5..4, 1.3 Zoom
uniform int uIter; // [Shape] 16..160, 80 Detail
uniform float uHue; // [Color] 0..1, 0.6 Hue
${PAL}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 z = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 3.0 / uZoom;
  vec2 c = vec2(-0.8 + 0.1 * sin(iTime * 0.3), 0.156 + 0.05 * cos(iTime * 0.23) + 0.02 * uBass);
  float n = 0.0;
  for (int i = 0; i < 160; i++) { if (i >= uIter) break; z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c; if (dot(z, z) > 16.0) break; n += 1.0; }
  float s = n / float(uIter);
  vec3 col = s >= 1.0 ? vec3(0.0) : pal(s * 2.0 + uHue, vec3(0.0, 0.1, 0.2)) * sqrt(s);
  fragColor = vec4(col, 1.0);
}`);

  // ---------- music ----------
  add('spectrum', 'Spectrum bars', 'Music', 'The song\'s spectrum as glowing bars (iChannel0 = audio)', `
uniform float uBars; // [Shape] 8..128, 48 Bars
uniform float uGain; // [Music] 0.5..3, 1.2 Gain
uniform vec3 uLow; // [Color] #ff5a36 Low
uniform vec3 uHigh; // [Color] #48ddff High
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float b = floor(uv.x * uBars) / uBars;
  float v = texture(iChannel0, vec2(pow(b, 1.6) * 0.8 + 0.01, 0.25)).x * uGain;
  float inBar = step(fract(uv.x * uBars), 0.8);
  float bar = step(uv.y, v) * inBar;
  vec3 col = mix(uLow, uHigh, b) * (bar + 0.25 * exp(-abs(uv.y - v) * 30.0) * inBar);
  fragColor = vec4(col, 1.0);
}`, { channels: { iChannel0: 'audio' } });
  add('scope', 'Oscilloscope', 'Music', 'The waveform as a glowing scope line (iChannel0 = audio)', `
uniform float uAmp; // [Music] 0.2..2, 0.8 Height
uniform float uWidth; // [Look] 0.002..0.03, 0.008 Line width
uniform vec3 uColor; // [Color] #30ffa0 Line
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float w = texture(iChannel0, vec2(uv.x, 0.75)).x - 0.5;
  float d = abs(uv.y - 0.5 - w * uAmp);
  vec3 col = uColor * (smoothstep(uWidth, 0.0, d) + 0.004 / max(d, 0.001) * 0.3);
  col += 0.03 * step(0.98, fract(uv.x * 10.0)) + 0.03 * step(0.98, fract(uv.y * 8.0));
  fragColor = vec4(col, 1.0);
}`, { channels: { iChannel0: 'audio' } });
  add('kickring', 'Kick shockwave', 'Music', 'A ring bursting out on every kick', `
uniform float uSize; // [Shape] 0.1..1, 0.5 Reach
uniform float uThick; // [Shape] 0.005..0.1, 0.03 Thickness
uniform vec3 uColor; // [Color] #ffd75e Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float age = 1.0 - uKick;
  float r = age * uSize;
  float ring = smoothstep(uThick, 0.0, abs(length(uv) - r)) * uKick;
  vec3 col = uColor * (ring * 2.0 + 0.02 / max(length(uv), 0.02) * uBeat);
  fragColor = vec4(col, 1.0);
}`);
  add('bassblob', 'Bass blob', 'Music', 'A wobbling organic blob that swells with the bass', `
uniform float uSize; // [Shape] 0.1..0.6, 0.28 Size
uniform float uWobble; // [Shape] 0..0.2, 0.06 Wobble
uniform vec3 uColor; // [Color] #ff3cac Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = atan(uv.y, uv.x);
  float r = uSize * (1.0 + 0.5 * uBass) + uWobble * (sin(a * 5.0 + iTime * 2.0) * 0.6 + sin(a * 9.0 - iTime * 3.0) * 0.4 * uMid);
  float d = length(uv) - r;
  vec3 col = uColor * (smoothstep(0.01, 0.0, d) * (0.7 + 0.3 * sin(length(uv) * 40.0 - iTime * 4.0)) + 0.02 / max(abs(d), 0.004));
  fragColor = vec4(col, 1.0);
}`);

  // ---------- feedback (multi-pass) ----------
  add('trails', 'Feedback trails', 'Feedback', 'Orbiting dots leaving long fading trails (Buffer A feeds itself)', `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(texture(iChannel0, fragCoord / iResolution.xy).rgb, 1.0);
}`, { buffers: { A: { code: `
uniform float uFade; // [Look] 0.8..0.995, 0.96 Trail length
uniform float uDots; // [Shape] 1..12, 5 Dots
uniform vec3 uColor; // [Color] #ff8c42 Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 prev = texture(iChannel0, uv).rgb * uFade;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 add = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uDots) break;
    float fi = float(i); float t = iTime * (0.6 + fi * 0.13);
    vec2 c = vec2(cos(t + fi), sin(t * 1.3 + fi * 2.0)) * (0.25 + 0.1 * fi / uDots + 0.05 * uKick);
    add += uColor * 0.0006 / max(dot(p - c, p - c), 0.0001);
  }
  fragColor = vec4(min(prev + add, vec3(4.0)), 1.0);
}`.trim(), iChannel0: 'A' } }, channels: { iChannel0: 'A' } });
  add('zoomfeedback', 'Zoom feedback', 'Feedback', 'The last frame zooms and turns into the next: an infinite tunnel of echoes', `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec3 c = texture(iChannel0, fragCoord / iResolution.xy).rgb;
  fragColor = vec4(c / (1.0 + c * 0.25), 1.0);
}`, { buffers: { A: { code: `
uniform float uZoom; // [Motion] 0.9..1.1, 0.97 Zoom
uniform float uTurn; // [Motion] -0.1..0.1, 0.02 Turn
uniform float uFade; // [Look] 0.8..1, 0.95 Fade
uniform vec3 uColor; // [Color] #48ddff Color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float c = cos(uTurn); float s = sin(uTurn);
  vec2 q = mat2(c, -s, s, c) * p * uZoom;
  vec2 uv = q * vec2(iResolution.y / iResolution.x, 1.0) + 0.5;
  vec3 prev = texture(iChannel0, uv).rgb * uFade;
  float shape = smoothstep(0.01, 0.0, abs(max(abs(p.x), abs(p.y)) - 0.15 - 0.05 * uKick));
  vec3 col = prev + shape * (0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0))) * uColor * 2.0;
  fragColor = vec4(col, 1.0);
}`.trim(), iChannel0: 'A' } }, channels: { iChannel0: 'A' } });
  add('reaction', 'Reaction-diffusion', 'Feedback', 'Gray-Scott chemistry growing coral and spots (Buffer A simulates)', `
uniform vec3 uColorA; // [Color] #0b0b12 Background
uniform vec3 uColorB; // [Color] #ffd75e Pattern
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 v = texture(iChannel0, fragCoord / iResolution.xy).xy;
  fragColor = vec4(mix(uColorA, uColorB, smoothstep(0.1, 0.5, v.y * 2.0)), 1.0);
}`, { buffers: { A: { code: `
uniform float uFeed; // [Shape] 0.01..0.08, 0.037 Feed
uniform float uKill; // [Shape] 0.04..0.07, 0.06 Kill
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 px = 1.0 / iResolution.xy; vec2 uv = fragCoord * px;
  vec2 c = texture(iChannel0, uv).xy;
  if (iFrame < 3) { float s = step(length(fragCoord - 0.5 * iResolution.xy), 0.05 * iResolution.y) + step(0.995, fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453)); fragColor = vec4(1.0, s, 0.0, 1.0); return; }
  vec2 lap = texture(iChannel0, uv + vec2(px.x, 0.0)).xy + texture(iChannel0, uv - vec2(px.x, 0.0)).xy + texture(iChannel0, uv + vec2(0.0, px.y)).xy + texture(iChannel0, uv - vec2(0.0, px.y)).xy - 4.0 * c;
  float a = c.x; float b = c.y; float abb = a * b * b;
  a += 1.0 * lap.x * 0.2 - abb + uFeed * (1.0 - a);
  b += 0.5 * lap.y * 0.2 + abb - (uKill + uFeed) * b;
  if (iMouse.z > 0.0 && length(fragCoord - iMouse.xy) < 12.0) b = 1.0;
  b += uKick * 0.02 * step(0.998, fract(sin(dot(fragCoord + iTime, vec2(12.9898, 78.233))) * 43758.5453));
  fragColor = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
}`.trim(), iChannel0: 'A', scale: 0.5 } }, channels: { iChannel0: 'A' } });
  add('smear', 'Paint smear', 'Feedback', 'The layers below smeared like wet paint along flowing noise', `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(texture(iChannel0, fragCoord / iResolution.xy).rgb, 1.0);
}`, { buffers: { A: { code: `
uniform float uFlow; // [Motion] 0..6, 2 Flow
uniform float uKeep; // [Look] 0.5..0.99, 0.9 Wetness
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 dir = vec2(noise(uv * 4.0 + iTime * 0.2), noise(uv * 4.0 - iTime * 0.2 + 9.0)) - 0.5;
  vec3 prev = texture(iChannel0, uv - dir * uFlow / iResolution.y * 4.0).rgb;
  vec3 now = texture(iChannel1, uv).rgb;
  fragColor = vec4(mix(now, prev, uKeep * (1.0 - 0.5 * uKick)), 1.0);
}`.trim(), iChannel0: 'A', iChannel1: 'below' } }, channels: { iChannel0: 'A' } });
  add('echo', 'Motion echo', 'Feedback', 'Everything below leaves colored echoes as it moves', `
uniform float uMix; // [Look] 0..1, 0.7 Echo amount
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 now = texture(iChannel1, uv).rgb;
  vec3 echo = texture(iChannel0, uv).rgb;
  fragColor = vec4(max(now, echo * uMix), 1.0);
}`, { buffers: { A: { code: `
uniform float uDecay; // [Look] 0.7..0.99, 0.92 Decay
uniform float uHueStep; // [Color] 0..0.2, 0.03 Color drift
vec3 hueShift(vec3 c, float h) { const vec3 k = vec3(0.57735); float ca = cos(h * 6.2831); return c * ca + cross(k, c) * sin(h * 6.2831) + k * dot(k, c) * (1.0 - ca); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 prev = hueShift(texture(iChannel0, uv).rgb, uHueStep) * uDecay;
  fragColor = vec4(max(prev, texture(iChannel1, uv).rgb), 1.0);
}`.trim(), iChannel0: 'A', iChannel1: 'below' } }, channels: { iChannel0: 'A', iChannel1: 'below' } });

  // ---------- filters (the layers below, iChannel0 = below) ----------
  add('kaleidobelow', 'Kaleido (layers below)', 'Filter', 'Your scene below folded into a kaleidoscope', `
uniform float uSlices; // [Shape] 2..16, 6 Slices
uniform float uSpin; // [Motion] -1..1, 0.1 Spin
uniform float uZoom; // [Shape] 0.3..2, 1 Zoom
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = atan(p.y, p.x) + iTime * uSpin; float r = length(p) * uZoom;
  float k = 6.2831 / floor(uSlices); a = abs(mod(a, k) - k * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  fragColor = vec4(texture(iChannel0, q * vec2(iResolution.y / iResolution.x, 1.0) + 0.5).rgb, 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('chroma', 'Chromatic split', 'Filter', 'Red and blue pulled apart from the center, harder on kicks', `
uniform float uAmount; // [Look] 0..0.05, 0.008 Split
uniform float uKickPush; // [Music] 0..0.05, 0.015 Kick push
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy; vec2 d = (uv - 0.5) * (uAmount + uKick * uKickPush);
  fragColor = vec4(texture(iChannel0, uv + d).r, texture(iChannel0, uv).g, texture(iChannel0, uv - d).b, 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('ripple', 'Ripple', 'Filter', 'Water ripples through the picture below (click to drop one)', `
uniform float uStrength; // [Look] 0..0.05, 0.012 Strength
uniform float uWaves; // [Shape] 5..80, 30 Waves
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 c = iMouse.z > 0.0 ? iMouse.zw / iResolution.xy : vec2(0.5);
  vec2 d = uv - c; float r = length(d * vec2(iResolution.x / iResolution.y, 1.0));
  vec2 off = normalize(d + 1e-5) * sin(r * uWaves - iTime * 4.0) * uStrength * exp(-r * 2.0) * (1.0 + uBass);
  fragColor = vec4(texture(iChannel0, uv + off).rgb, 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('hexpixel', 'Hex mosaic', 'Filter', 'The picture below as hexagonal tiles', `
uniform float uSize; // [Shape] 4..80, 24 Tile size
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / uSize; vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 center = (uv - g) * uSize / iResolution.xy;
  fragColor = vec4(texture(iChannel0, center).rgb * (0.85 + 0.15 * smoothstep(0.5, 0.3, length(g))), 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('neonedges', 'Neon edges', 'Filter', 'Edges of the picture below glowing in neon', `
uniform float uGain; // [Look] 1..10, 4 Edge gain
uniform float uKeep; // [Look] 0..1, 0.15 Original
uniform vec3 uColor; // [Color] #48ddff Neon
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 px = 1.0 / iResolution.xy; vec2 uv = fragCoord * px;
  float l = dot(texture(iChannel0, uv - vec2(px.x, 0.0)).rgb, vec3(0.333)); float r = dot(texture(iChannel0, uv + vec2(px.x, 0.0)).rgb, vec3(0.333));
  float d = dot(texture(iChannel0, uv - vec2(0.0, px.y)).rgb, vec3(0.333)); float u = dot(texture(iChannel0, uv + vec2(0.0, px.y)).rgb, vec3(0.333));
  float e = clamp(length(vec2(r - l, u - d)) * uGain, 0.0, 1.0);
  fragColor = vec4(texture(iChannel0, uv).rgb * uKeep + uColor * e * (1.0 + uKick), 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('dither', '1-bit dither', 'Filter', 'Ordered dithering to two colors, like an old Mac', `
uniform float uScale; // [Shape] 1..6, 2 Pixel size
uniform vec3 uInk; // [Color] #14161d Ink
uniform vec3 uPaper; // [Color] #f4efe6 Paper
float bayer(vec2 p) { p = mod(p, 4.0); float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0); return m[int(p.y) * 4 + int(p.x)] / 16.0; }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 cell = floor(fragCoord / uScale);
  float l = dot(texture(iChannel0, (cell * uScale + 0.5) / iResolution.xy).rgb, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(mix(uInk, uPaper, step(bayer(cell), l)), 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('glitchshift', 'Glitch slices', 'Filter', 'Horizontal slices of the picture below jump on hits', `
uniform float uAmount; // [Look] 0..0.3, 0.06 Shift
uniform float uSlices; // [Shape] 4..80, 24 Slices
float h1(float x) { return fract(sin(x * 91.17) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float row = floor(uv.y * uSlices); float seed = floor(iTime * 12.0);
  float on = step(0.7, h1(row + seed)) * (0.3 + uKick + uHit);
  uv.x += (h1(row * 3.1 + seed) - 0.5) * uAmount * on;
  vec3 c = vec3(texture(iChannel0, uv + vec2(0.004 * on, 0.0)).r, texture(iChannel0, uv).g, texture(iChannel0, uv - vec2(0.004 * on, 0.0)).b);
  fragColor = vec4(c, 1.0);
}`, { channels: { iChannel0: 'below' } });
  add('vignettepulse', 'Beat vignette', 'Filter', 'Dark edges over the layers below that breathe on the beat', `
uniform float uAmount; // [Look] 0..1, 0.6 Darkness
uniform float uPulse; // [Music] 0..1, 0.4 Beat pulse
uniform vec3 uColor; // [Color] #000000 Edge color
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy; vec2 d = uv - 0.5;
  float v = smoothstep(0.8, 0.2 + uBeat * uPulse * 0.2, length(d * vec2(iResolution.x / iResolution.y, 1.0)));
  fragColor = vec4(mix(uColor, texture(iChannel0, uv).rgb, mix(1.0, v, uAmount)), 1.0);
}`, { channels: { iChannel0: 'below' } });

  return { STARTERS: S, NOISE, PAL, ROT };
})();
if (typeof window !== 'undefined') window.ShaderData = ShaderData;
