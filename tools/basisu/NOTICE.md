# Basis Universal encoder (WebAssembly), vendored for ▶ Play's Optimize for play (round 53, gametex)

`basis_encoder.mjs` + `basis_encoder.wasm` are the precompiled Basis Universal encoder shipped in the npm package
`ktx2-encoder@0.5.4` (MIT, © 2020 HU SONG; `dist/basis/basis_encoder.js`, renamed `.mjs` so Node / Electron load it as
the ES module it is). Unmodified. SHA-256: `.wasm` dea2778b6d1705b4fdf12053e94cda0ac1cc4340a7e06911778a003ba785808a,
`.mjs` 20981cb951a6d2951061baa886204f4e65903b9f7e04e61cba9398472cf9be48.

Hearth loads them only in a worker thread of the main process, only when Optimize for play compresses textures
(gametexmain.js → tools/gametex-worker.js). Nothing of it is on the first screen.

## Basis Universal
- Project: https://github.com/BinomialLLC/basis_universal — Apache License 2.0
  (https://www.apache.org/licenses/LICENSE-2.0)
- Basis Universal™ Supercompressed GPU Texture Compression Library. Copyright © 2016–2026 Binomial LLC. All rights
  reserved except as granted under the Apache 2.0 license. "Basis Universal" is a trademark of Binomial LLC.
- It links Zstandard (BSD-3-Clause, © Meta Platforms, Inc.) for KTX2 supercompression.
