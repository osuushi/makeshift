#!/usr/bin/env bash
# Linux-only source-pinned research modules. No source/header/SDK mutations.
# Owns compute lock; do not wrap in another flock. Optional control|reuse|minimal|range.
# Upstream LGPL-2.1 + OCCT exception notices preserved in copied sources.
set -euo pipefail
[[ $(uname -s) == Linux && $# -le 1 ]] || exit 2
variants=${1:-'control reuse minimal'}
[[ $# == 0 || $variants =~ ^(control|reuse|minimal|range)$ ]] || exit 2
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$task_root"
exec 9>/tmp/makeshift-geometry-compute.lock
flock 9
sdk_dir=$task_root/.cache/kernel/sdk
source_file=$task_root/.cache/kernel/source/src/IntCurvesFace/IntCurvesFace_Intersector.cxx
header_file=$sdk_dir/include/opencascade/IntCurvesFace_Intersector.hxx
output_dir=$task_root/.cache/geometry-performance/ray-setup
printf '%s  %s\n' \
  88e2c0b6891ef15a3eaf7d954975e2ba2c153771dd7144669cbeb4a8e98c35b2 "$source_file" \
  48bcc09fabf86eac4dc30db3125dc1dcd0c53859c6cd03a0c2ffb5235aa67810 "$header_file" | sha256sum --check
temporary_dir=$(mktemp -d /tmp/makeshift-ray-setup.XXXXXX)
trap 'rm -rf "$temporary_dir"' EXIT
mkdir -p "$output_dir/lib" "$output_dir/bin" "$output_dir/source"
for variant in $variants; do
  variant_root=$temporary_dir/$variant
  mkdir -p "$variant_root/src/IntCurvesFace"
  candidate_file=$variant_root/src/IntCurvesFace/IntCurvesFace_Intersector.cxx
  cp "$source_file" "$candidate_file"
  if [[ $variant != control ]]; then
    patch_file=docs/research/geometry-performance/patches/intcurvesface-ray-setup-reuse.patch
    if [[ $variant == minimal ]]; then
      patch_file=docs/research/geometry-performance/patches/intcurvesface-ray-setup-reuse-minimal.patch
    elif [[ $variant == range ]]; then
      patch_file=docs/research/geometry-performance/patches/intcurvesface-early-hit-range.patch
    fi
    patch --batch --fuzz=0 -d "$variant_root" -p1 \
      < "$patch_file"
  fi
  c++ -O3 -DNDEBUG -std=c++20 -fPIC -shared \
    -I"$sdk_dir/include/opencascade" "$candidate_file" -L"$sdk_dir/lib" \
    -Wl,--disable-new-dtags -Wl,-rpath,"$sdk_dir/lib" \
    -lTKTopAlgo -lTKGeomAlgo -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel \
    -o "$output_dir/lib/ray-$variant.so"
  cp "$candidate_file" "$output_dir/source/ray-$variant.cxx"
  # Fixed immutable application revision, independent of future native builds.
  printf '#!/usr/bin/env bash\nexec env LD_PRELOAD=%q %q "$@"\n' \
    "$output_dir/lib/ray-$variant.so" /tmp/makeshift-kernel-streaming-cuts \
    > "$output_dir/bin/makeshift-$variant"
  chmod +x "$output_dir/bin/makeshift-$variant"
done
sha256sum "$source_file" "$header_file" "$output_dir"/lib/*.so \
  "$output_dir"/source/*.cxx > "$output_dir/build-hashes.txt"
echo "Built isolated modules in $output_dir/lib; SDK untouched."
