// Big screen (round 38, bigscreen): Hearth on a 4K monitor at 100 % (a 3840 × 2160 virtual screen): Auto sizes
// everything 150 % before the first frame; chats, the grid view, AI setup and the Lab at full-screen size (pictures in
// /tmp/hearth-bigscreen/), no sideways scrolling, the Lab's frame times and its resolution stepping down on a slow huge
// preview; the size of everything per screen (100 %, Ctrl + / 0, the Appearance row) with the Lab crisp after it;
// ⛶ full screen (the first-time hint, Esc while typing doesn't leave, the rail peek, /fullscreen); then an ultrawide
// 3440 × 1440 window. The body is dev/checks/bigscreen-lib.js (BS).
//   node dev/smoke.js --fake-engines --screen 3840x2160 --check-timeout 300000 --script dev/checks/bigscreen.js
return BS.run('4k');
