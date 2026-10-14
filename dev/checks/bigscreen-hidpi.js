// Big screen (round 38, bigscreen) on a 4K monitor at 200 % (Retina-like: 1920 × 1080 points at scale 2): Auto keeps
// 100 % (the system already scales it), the pages at twice the pixels, the Lab crisp at the screen's ratio, the size of
// everything per screen, ⛶ full screen. The body is dev/checks/bigscreen-lib.js (BS).
//   node dev/smoke.js --fake-engines --screen 3840x2160 --dpr 2 --check-timeout 300000 --script dev/checks/bigscreen-hidpi.js
return BS.run('hidpi');
