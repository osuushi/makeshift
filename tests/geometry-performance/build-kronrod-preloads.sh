#!/usr/bin/env bash
# Isolated Linux research modules; leaves OCCT source, headers and SDK unchanged.
# Usage: bash tests/geometry-performance/build-kronrod-preloads.sh [VARIANT]
# Owns the shared compute lock; do not wrap in another flock.
# Original OCCT LGPL-2.1 + exception notices remain in each copied source.
# These modules preserve the installed class ABI. They are not production builds.
set -euo pipefail
[[ $(uname -s) == Linux ]] || { echo 'Linux only' >&2; exit 2; }
[[ $# -le 1 ]] || { echo 'Expected optional control|floor|table|interval' >&2; exit 2; }
variants=${1:-'control floor table interval'}
[[ $# == 0 || $variants =~ ^(control|floor|table|interval)$ ]] || exit 2
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$task_root"
exec 9>/tmp/makeshift-geometry-compute.lock
flock 9
sdk_dir=$task_root/.cache/kernel/sdk
source_file=$task_root/.cache/kernel/source/src/math/math_KronrodSingleIntegration.cxx
header_file=$sdk_dir/include/opencascade/math_KronrodSingleIntegration.hxx
output_dir=$task_root/.cache/geometry-performance/kronrod
patch_dir=$task_root/docs/research/geometry-performance/patches
printf '%s  %s\n' \
  2490173f1ff9fe92300abbd2fe64fffba1c8691bf185cae45ec978e531fdb467 "$source_file" \
  51cbbc87fe53b1e525a31013445dddf3b0352ae952a62d48e1fb947d3884904b "$header_file" | sha256sum --check
temporary_dir=$(mktemp -d /tmp/makeshift-kronrod.XXXXXX)
trap 'rm -rf "$temporary_dir"' EXIT
mkdir -p "$output_dir/lib" "$output_dir/bin" "$output_dir/source"
for variant in $variants; do
  variant_root=$temporary_dir/$variant
  mkdir -p "$variant_root/src/math"
  candidate_file=$variant_root/src/math/math_KronrodSingleIntegration.cxx
  cp "$source_file" "$candidate_file"
  case "$variant" in
    floor) patch_file=$patch_dir/kronrod-roundoff-floor.patch ;;
    table) patch_file=$patch_dir/kronrod-table-cache.patch ;;
    interval) patch_file=$patch_dir/kronrod-contiguous-intervals.patch ;;
    control) patch_file='' ;;
  esac
  if [[ -n "$patch_file" ]]; then
    patch --batch --fuzz=0 -d "$variant_root" -p1 < "$patch_file"
  fi
  c++ -O3 -DNDEBUG -std=c++20 -fPIC -shared \
    -I"$sdk_dir/include/opencascade" "$candidate_file" -L"$sdk_dir/lib" \
    -Wl,--disable-new-dtags -Wl,-rpath,"$sdk_dir/lib" -lTKMath -lTKernel \
    -o "$output_dir/lib/kronrod-$variant.so"
  cp "$candidate_file" "$output_dir/source/kronrod-$variant.cxx"
  volume_binary=$task_root/.cache/geometry-performance/bspline-cache/bin/volume-kernel-baseline
  printf '#!/usr/bin/env bash\nexec env LD_PRELOAD=%q %q "$@"\n' \
    "$output_dir/lib/kronrod-$variant.so" "$volume_binary" > "$output_dir/bin/volume-$variant"
  chmod +x "$output_dir/bin/volume-$variant"
done
sha256sum "$source_file" "$header_file" "$output_dir"/lib/*.so \
  "$output_dir"/source/*.cxx > "$output_dir/build-hashes.txt"
echo "Built isolated modules in $output_dir/lib; original source/header verified."
