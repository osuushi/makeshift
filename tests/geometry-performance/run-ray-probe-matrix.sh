#!/usr/bin/env bash
# Public SDK bit-equivalence diagnostic; owns compute lock, no latency claims.
# Requires build-ray-setup-preloads.sh VARIANT first. Linux SDK RPATH intentional.
set -euo pipefail
[[ $# == 1 && $1 =~ ^(control|reuse|minimal|range)$ ]] || exit 2
variant=$1
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$task_root"
exec 9>/tmp/makeshift-geometry-compute.lock
flock 9
sdk_dir=$task_root/.cache/kernel/sdk
module=$task_root/.cache/geometry-performance/ray-setup/lib/ray-$variant.so
results=$task_root/docs/research/geometry-performance/results
probe=$(mktemp /tmp/makeshift-ray-probe.XXXXXX)
trap 'rm -f "$probe"' EXIT
[[ -f $module ]]
c++ -O2 -std=c++20 -pthread -I"$sdk_dir/include/opencascade" \
  tests/geometry-performance/ray-setup-probe.cpp -L"$sdk_dir/lib" \
  -Wl,--disable-new-dtags -Wl,-rpath,"$sdk_dir/lib" \
  -lTKPrim -lTKTopAlgo -lTKGeomAlgo -lTKBRep -lTKGeomBase -lTKG3d \
  -lTKG2d -lTKMath -lTKernel -o "$probe"
for fixture in plain circle-offset-twist shell-bent-sweep-captured shell-notched-cylinder-captured; do
  fixture_args=()
  [[ $fixture == plain ]] || fixture_args=("$results/$fixture.brep")
  for mode in serial threads; do
    reference=$results/ray-probe-$fixture-$mode-sdk.jsonl
    candidate=$results/ray-probe-$fixture-$mode-$variant.jsonl
    temporary_reference=$(mktemp /tmp/makeshift-ray-reference.XXXXXX)
    env -u LD_PRELOAD "$probe" "$mode" "${fixture_args[@]}" > "$temporary_reference"
    if [[ -f $reference ]]; then
      cmp "$reference" "$temporary_reference"
      rm "$temporary_reference"
    else
      mv "$temporary_reference" "$reference"
    fi
    [[ ! -e $candidate ]] || { echo "Refusing to overwrite $candidate" >&2; exit 2; }
    env LD_PRELOAD="$module" "$probe" "$mode" "${fixture_args[@]}" > "$candidate"
    cmp "$reference" "$candidate"
    echo "Bit match: $fixture $mode $variant"
  done
done
