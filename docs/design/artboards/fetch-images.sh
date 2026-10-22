#!/bin/sh
# Re-download the artboard images into img/ (not committed).
# Wallhaven SFW toplist thumbnails plus three full images, and the brand mark.
cd "$(dirname "$0")" && mkdir -p img
for id in jelye5 9okkr1 vp22dm zpvdzv xekje3 yqk2q7 zpv5zj lygg6r pomm99 jelv1w jelyoq vp2d98 9oke91 9ok8q8 jelrzq d8vvlo; do
  curl -sf "https://th.wallhaven.cc/orig/${id%????}/$id.jpg" -o "img/wh-$id.jpg" || echo "missing $id"
done
curl -sf https://w.wallhaven.cc/full/zp/wallhaven-zpvdzv.jpg -o img/full-zpvdzv.jpg && sips -Z 1800 img/full-zpvdzv.jpg >/dev/null
cp ../../../brand/logo/mark-red.svg img/
