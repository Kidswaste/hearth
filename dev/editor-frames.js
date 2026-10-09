// Reads the frame-number code that dev/make-editor-videos.js burns into its test clips: 12 bands across the top
// 12 % of the picture, band k bright when bit k of the frame number is set. Works on RGBA pixel rows (a canvas
// ImageData in the page, raw RGB from ffmpeg in Node). Returns the number, or null when the code isn't there.
//   decode(pixels, width, height, { channels: 4, x0: 0, y0: 0, w: width, h: height })  (a sub-rectangle: x0…h)
function decodeFrameCode(px, width, height, { channels = 4, x0 = 0, y0 = 0, w = width, h = height } = {}) {
  const y = Math.round(y0 + h * 0.05);
  let n = 0;
  let bright = 0; let dark = 0;
  for (let k = 0; k < 12; k += 1) {
    const x = Math.round(x0 + (w * (k + 0.5)) / 12);
    const i = (y * width + x) * channels;
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (l > 150) { n |= 1 << k; bright += 1; } else if (l < 70) dark += 1; else return null;
  }
  return bright + dark === 12 ? n : null;
}
if (typeof module !== 'undefined') module.exports = { decodeFrameCode };
