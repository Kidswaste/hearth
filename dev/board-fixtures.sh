#!/bin/sh
# Throwaway media for the mood board checks (dev/checks/board*.js): a big picture, a small one, an animated gif,
# a clip with hard cuts (3 shots), a calm clip and a local web page for the website-card path (no network here).
#   sh dev/board-fixtures.sh [folder]      (default /tmp/hearth-board-fixtures)
set -e
OUT="${1:-/tmp/hearth-board-fixtures}"
mkdir -p "$OUT"
ff() { ffmpeg -loglevel error -y "$@"; }
# a big dark-neon picture (2400×1600) and a small warm one
ff -f lavfi -i "gradients=s=2400x1600:c0=0x0b0f1a:c1=0x1b1f3a:x0=0:y0=0:x1=2400:y1=1600,drawbox=x=1500:y=300:w=600:h=500:color=0xff2e88:t=fill,drawbox=x=300:y=1000:w=400:h=300:color=0x2de2e6:t=fill" -frames:v 1 "$OUT/neon big.png"
ff -f lavfi -i "gradients=s=640x800:c0=0xf2b880:c1=0xe07a3f:x0=0:y0=0:x1=0:y1=800,drawbox=x=0:y=560:w=640:h=240:color=0x7c3a2d:t=fill" -frames:v 1 "$OUT/golden-hour.jpg"
# an animated gif (rotating hue)
ff -f lavfi -i "testsrc2=s=320x240:r=10:d=2,hue=h=t*90" "$OUT/loop.gif"
# a clip with three hard cuts (red → blue → bright), 6 s, and a calm slow one
ff -f lavfi -i "color=c=0xd1495b:s=480x270:r=25:d=2" -f lavfi -i "color=c=0x0077b6:s=480x270:r=25:d=2" -f lavfi -i "testsrc2=s=480x270:r=25:d=2" \
  -filter_complex "[0][1][2]concat=n=3:v=1:a=0,format=yuv420p" -c:v libx264 -pix_fmt yuv420p "$OUT/cuts.mp4"
ff -f lavfi -i "gradients=s=480x270:speed=0.002:c0=0x1b263b:c1=0x415a77:d=4:r=25" -c:v libx264 -pix_fmt yuv420p "$OUT/calm.mp4"
# a local page (title, theme color, fonts) for the website card
cat > "$OUT/page.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>Neon Type Studio</title><meta name="theme-color" content="#ff2e88">
<meta name="description" content="A test page for Hearth's mood board"><style>body{margin:0;background:#0b0f1a;color:#f6f5ae;font-family:Georgia,serif}
h1{font:900 96px/1 Impact,sans-serif;color:#ff2e88;margin:60px}p{margin:0 60px;font-size:24px}.b{position:absolute;right:80px;top:200px;width:300px;height:300px;background:#2de2e6;border-radius:50%}</style></head>
<body><h1>NEON TYPE</h1><p>Glow, grain and big letters.</p><div class="b"></div></body></html>
HTML
ls -la "$OUT"
