#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
revision=814a210978b7faafd65affbe70a2e25679921b23
cache="$root/.cache/openrti"
if [ ! -d "$cache/source/.git" ]; then
  mkdir -p "$cache"
  git clone https://github.com/onox/OpenRTI.git "$cache/source"
fi
git -C "$cache/source" checkout --detach "$revision"
if [ "$(git -C "$cache/source" rev-parse HEAD)" != "$revision" ]; then exit 1; fi
if [ -n "$(git -C "$cache/source" status --porcelain)" ]; then
  printf '%s\n' 'Refusing modified upstream RTI source' >&2
  exit 1
fi
cmake -S "$cache/source" -B "$cache/build" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$cache/install" \
  -DOPENRTI_ENABLE_RTI13=OFF -DOPENRTI_ENABLE_RTI1516=OFF \
  -DOPENRTI_ENABLE_PYTHON_BINDINGS=OFF
cmake --build "$cache/build" --target rti1516e fedtime1516e rtinode -j 4
cmake --install "$cache/build"
cmake -S "$root/native" -B "$root/build/native" -DOPENRTI_ROOT="$cache/install"
cmake --build "$root/build/native" -j 2
