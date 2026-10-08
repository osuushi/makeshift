#!/usr/bin/env bash
# Linux-only, isolated research prototype; never installs or edits the SDK.
# Usage: bash tests/geometry-performance/build-fixed-v.sh [--relink-app]
# This script acquires its own compute lock. Do not wrap it in another flock.
# Activate Node 24.15.0 first (this cloud: source /workspace/.tools/activate-makeshift.sh).
# Requires the existing pinned SDK/source/CMake build made by setup-kernel.mjs.
# OCCT 7.9.3 baseline: a016080bf6738d6aeae020badee4e888ad1540a5.
# LGPL-2.1 with OCCT exception: preserve upstream notices and distribute matching
# modified sources/patch with redistributed binaries. This script publishes nothing.
# BSplSLib_Cache's private size changes: rebuild BOTH TKMath and its TKG3d consumer.
# Do not mix those two libraries from different variants or construct the private
# cache class in clients built against the unpatched SDK header.
# RPATH is deliberate for transitive dependencies; LD_LIBRARY_PATH does not
# override legacy DT_RPATH. Compare the separately linked baseline/fork executables.
# Source files are restored byte-for-byte to ENTRY state, including prepatched
# entry state. Build-tree objects remain experimental afterward; do not install
# that tree as baseline without a clean rebuild. SDK libraries stay untouched.
set -euo pipefail
[[ $(uname -s) == Linux ]] || { echo 'Linux only' >&2; exit 2; }
[[ $# == 0 || ($# == 1 && $1 == --relink-app) ]] || { echo 'Expected [--relink-app]' >&2; exit 2; }
relink_app=${1:-}
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$task_root"
exec 9>/tmp/makeshift-geometry-compute.lock
flock 9
source_dir=$task_root/.cache/kernel/source
build_dir=$task_root/.cache/kernel/build
sdk_dir=$task_root/.cache/kernel/sdk
experiment_dir=$task_root/.cache/geometry-performance/bspline-cache
patch_file=$task_root/docs/research/geometry-performance/patches/bspline-fixed-v-cache.patch
header=src/BSplSLib/BSplSLib_Cache.hxx
implementation=src/BSplSLib/BSplSLib_Cache.cxx
[[ -f $build_dir/CMakeCache.txt && -f $sdk_dir/include/opencascade/BSplSLib_Cache.hxx ]]
[[ -f $source_dir/$header && -f $source_dir/$implementation && -f $patch_file ]]
backup_dir=$(mktemp -d /tmp/makeshift-fixed-v.XXXXXX)
mkdir -p "$backup_dir/entry/src/BSplSLib" "$backup_dir/normalized/src/BSplSLib"
cp -p "$source_dir/$header" "$backup_dir/entry/$header"
cp -p "$source_dir/$implementation" "$backup_dir/entry/$implementation"
restore() {
  local status=$?
  trap - EXIT
  cp -p "$backup_dir/entry/$header" "$source_dir/$header"
  cp -p "$backup_dir/entry/$implementation" "$source_dir/$implementation"
  rm -rf "$backup_dir"
  exit "$status"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cp -p "$backup_dir/entry/$header" "$backup_dir/normalized/$header"
cp -p "$backup_dir/entry/$implementation" "$backup_dir/normalized/$implementation"
already_patched=false
# Prevent git apply from discovering Makeshift's ancestor repository and treating
# source-relative patch paths as repository-relative paths (silently skipping them).
source_apply() {
  (cd "$source_dir" && GIT_CEILING_DIRECTORIES="$source_dir" git apply "$@" "$patch_file")
}
if source_apply --reverse --check; then
  already_patched=true
  (cd "$backup_dir/normalized" && git apply --reverse "$patch_file")
else
  source_apply --check
fi
# These hashes certify only the TWO normalized files, not the entire source tree.
# The source directory is an unpacked archive: NEVER git rev-parse its provenance.
node --input-type=module - "$task_root/scripts/occt-recipe.json" "$backup_dir/normalized" <<'JS'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
assert.equal(process.version, 'v24.15.0', 'Activate the repository Node version first');
const recipe = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(recipe.version, '7.9.3');
assert.equal(recipe.commit, 'a016080bf6738d6aeae020badee4e888ad1540a5');
const expected = {
  'src/BSplSLib/BSplSLib_Cache.hxx': '2273cd8c55495645083419bf81bbbf4bcb7014dcbfdf5a0ff9046a232fc934c0',
  'src/BSplSLib/BSplSLib_Cache.cxx': 'e952080b8e9730de2aa64ade53a0858b9cdcdd2b596009c6d26fb0b2e1faa57b',
};
for (const [name, checksum] of Object.entries(expected)) {
  const actual = createHash('sha256').update(readFileSync(join(process.argv[3], name))).digest('hex');
  assert.equal(actual, checksum, `Unexpected baseline contents: ${name}`);
}
JS
if [[ $already_patched == false ]]; then
  source_apply
fi
# No configure/install, link-flag workarounds, compiler changes, or baseline SDK edits.
cmake --build "$build_dir" --target TKMath TKG3d --parallel 4
mkdir -p "$experiment_dir/lib" "$experiment_dir/bin"
build_lib=$build_dir/lin64/gcc/lib
cp -a "$build_lib"/libTKMath.so* "$build_lib"/libTKG3d.so* "$experiment_dir/lib/"
compiler=${CXX:-c++}
for variant in baseline fork; do
  library_path=$sdk_dir/lib
  if [[ $variant == fork ]]; then library_path=$experiment_dir/lib:$sdk_dir/lib; fi
  for harness in volume-kernel surface-evaluator; do
    "$compiler" -O3 -DNDEBUG -std=c++20 -pthread -I"$sdk_dir/include/opencascade" \
      "$task_root/tests/geometry-performance/$harness.cpp" -L"$sdk_dir/lib" \
      -Wl,--disable-new-dtags "-Wl,-rpath,$library_path" \
      -lTKTopAlgo -lTKBRep -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel \
      -o "$experiment_dir/bin/$harness-$variant"
  done
done
if [[ $relink_app == --relink-app ]]; then
  # Reuse the existing application objects; avoid rebuilding application sources.
  app_build=$task_root/.build/kernel
  python3 "$task_root/tests/geometry-performance/relink-fixed-v.py" \
    "$app_build" "$experiment_dir" "$sdk_dir"
fi
printf 'Prototype binaries: %s/bin\n' "$experiment_dir"
