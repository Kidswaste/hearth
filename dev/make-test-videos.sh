#!/bin/sh
# Makes small throwaway test videos (all social aspect ratios, with a beat track) for the Video Review smoke test.
#   sh dev/make-test-videos.sh <folder>
set -e
OUT="${1:-/tmp/hearth-test-videos}"
mkdir -p "$OUT"
AUDIO="aevalsrc='0.6*sin(2*PI*60*t)*exp(-12*mod(t\,0.5))+0.15*sin(2*PI*880*t)*exp(-30*mod(t+0.25\,0.5))':s=44100"
mk() { ffmpeg -loglevel error -y -f lavfi -i "$1" -f lavfi -i "$AUDIO:d=$3" -t "$3" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/$2"; }
mk "testsrc2=s=540x960:r=30:d=6" "neon_tunnel_v1.mp4" 6
mk "testsrc2=s=540x960:r=30:d=6,hue=h=90" "neon_tunnel_v2.mp4" 6
mk "mandelbrot=s=960x540:r=25" "drop_visual_16x9.mp4" 5
mk "mandelbrot=s=960x540:r=25,hue=s=0" "drop_visual_16x9_v2.mp4" 5
mk "testsrc=s=544x680:r=24:d=4" "cover_feed 1080x1350.mp4" 4
mk "smptebars=s=540x540:r=60:d=3" "square_loop.mp4" 3
ls -la "$OUT"
