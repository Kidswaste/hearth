// Apply through the scene API: the original source remains in scene history.
function cachePaper(code) {
  if(code.includes('CLINK_PAPER_CACHE_V1'))return code;
  const start='function paperBG(C, t, a = 1) {';
  const loop='for (let y = 0, r = 0; y < H + u; y += u, r++) for (let x = (r % 2) * u / 2; x < W + u; x += u) { const d = Math.hypot(x / W - 0.5, y / H - 0.5); const s = u * 0.32 * cl(d * 1.6); if (s > 0.4) { g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); } }';
  if(!code.includes(start)||!code.includes(loop))throw Error('The expected Clink paper renderer was not found.');
  return code.replace(start,'// CLINK_PAPER_CACHE_V1: reusable vectors, original full-resolution colours and fades.\nlet paperDots, paperDotsSize;\n'+start).replace(loop,`if(paperDotsSize!==W+':'+H){
    paperDots=new Path2D();paperDotsSize=W+':'+H;
    for(let y=0,r=0;y<H+u;y+=u,r++)for(let x=(r%2)*u/2;x<W+u;x+=u){const d=Math.hypot(x/W-.5,y/H-.5),s=u*.32*cl(d*1.6);if(s>.4){paperDots.moveTo(x+s,y);paperDots.arc(x,y,s,0,TAU);}}
  }
  g.fill(paperDots);`);
}
if(typeof module==='object')module.exports={cachePaper};
