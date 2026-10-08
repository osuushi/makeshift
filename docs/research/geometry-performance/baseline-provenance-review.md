# Application baseline provenance correction

2026-10-08; source/documentation and bounded metadata audit only. No native runs,
compilation or benchmarks. This audit read at most the first 20 small records of
each relevant uncompressed benchmark stream, small summaries/build scripts and
starting-source presentation. It did not decompress large JSONL archives or scan
complete raw measurement streams. A label named `baseline` is not a revision.

## Established discrepancy and its limits

The orchestrator identifies `/tmp/makeshift-kernel-baseline` as a copy of the
**startup prebuilt application executable**, not a fresh build from the starting
checkout. Its build commit is unknown. SDK receipt verification does not establish
the application executable's source revision.

[Starting source 7861122 presentation](https://github.com/osuushi/makeshift/blob/7861122fb791c71692d7b48a70bfcb3a381fc95a/native/kernel/presentation.cpp#L99)
already emits a `chamfer` field for every face and calls `recognizeChamfers`.
This was independently checked with `git show 7861122:native/kernel/presentation.cpp`.
The URL matches the inspected repository remote; local commit/path/line are the
authoritative source evidence even if the hosted repository is not publicly readable.

[combined-application-full-output.json](results/combined-application-full-output.json)
directly records missing `chamfer` in the compared face-object keys for nine
completed cases, including ordinary extrusion, Cut, Fuse and captured shells.
The comparison script checks object keys before field values. This is an observed
metadata/schema mismatch, not evidence of a material geometry change or a guessed
older build commit. The summary itself omits executable paths and hashes; identity
of its startup reference comes from the orchestrator's invocation, not the JSON.

Consequently, attributing the startup binary or its early timings to source
`7861122fb791c71692d7b48a70bfcb3a381fc95a` is invalid. It also invalidates a
claim that the early parallel-only comparison isolates one source change against
that commit. Fresh exact-source baseline compilation is owned by main; no new
run/result is claimed here.

## Which benchmark controls were actually used

Paths below are directly present in the first records, not inferred from filenames.
All application paths abbreviate `/tmp/makeshift-kernel-` with `K:`.

| Evidence | Recorded control → candidate | Provenance consequence |
| --- | --- | --- |
| [smoke.jsonl](results/smoke.jsonl) | `K:baseline` alone | Startup artifact observations; cannot call starting-source timings. |
| [thread-baseline.jsonl](results/thread-baseline.jsonl) | `K:baseline`, serial/pool2/pool4 | Same artifact across configurations: thread effects remain observations for that executable, not proof of starting-source thread policy. |
| [shell-parallel.jsonl](results/shell-parallel.jsonl) | `K:baseline` → `K:shell-parallel` | Startup versus rebuilt candidate; single-change/source-pinned attribution must be retracted or retested. |
| [volume-reuse.jsonl](results/volume-reuse.jsonl) | `K:shell-parallel` → `K:volume-reuse` | Rebuilt intermediate control, not startup reference. Incremental volume reuse comparison remains distinct from the contaminated first transition. |
| [ray-reuse.jsonl](results/ray-reuse.jsonl) | `K:volume-reuse` → `K:ray-reuse` | Rebuilt intermediate control; no direct startup-baseline comparison. |
| [uv-reuse.jsonl](results/uv-reuse.jsonl) | `K:volume-reuse` → `K:uv-reuse` | Likewise; the UV candidate includes its ray reuse relative to this control. |
| [construction-reuse.jsonl](results/construction-reuse.jsonl) | `K:uv-reuse` → `K:construction-reuse` | Rebuilt intermediate incremental construction comparison. |
| [pave-reuse.jsonl](results/pave-reuse.jsonl), multitarget pilot/confirmation metadata | `K:construction-reuse` → `K:pave-reuse` | Rebuilt intermediate; metadata also names construction-reuse as fixture constructor. |
| [projector-reuse.jsonl](results/projector-reuse.jsonl) | `K:construction-reuse` → `K:projector-reuse` | Separate rebuilt candidate/control pair. |
| [face-chain-reuse.jsonl](results/face-chain-reuse.jsonl) | `K:pave-reuse` → `K:face-chain-reuse` | Rebuilt intermediate comparison. |
| [shell-validation-reuse.jsonl](results/shell-validation-reuse.jsonl) | `K:face-chain-reuse` → `K:shell-validation-reuse` | Rebuilt intermediate comparison. |
| Mass recenter pilot/confirmation | `K:shell-validation-reuse` → `K:mass-recenter-solids` | Rebuilt incremental experiment, not a startup comparison. |
| Twist-axis pilot/confirmation/control retest/scales | `K:shell-validation-reuse` → `K:twist-volume-axis` | Rebuilt control; later axis evidence is not automatically invalidated by startup provenance. |
| Streaming focused/Auto/memory controls | `K:twist-volume-axis` retained; `K:construction-reuse` noReuse → `K:streaming-cuts` | Explicit metadata paths and some hashes; neither reference is startup baseline. |

The first-build log narrative in README says the provisioned application objects
needed a complete rebuild on the first invocation. Thus `shell-parallel` is the
first rebuilt control in this chain. This audit does not elevate any bare path to
an exact source/build receipt: immutable hashes, source diffs and build commands
should accompany final attribution. The startup mismatch alone does **not** prove
that later rebuilt pairs are stale or that their measured incremental effects are
wrong. It prevents combining them with the first transition as a clean
starting-source end-to-end speedup.

## Independent kernel experiments and later wrappers

The standalone Boolean pilot/confirmation, primitive volume diagnostics, D1
equivalence tests and GK scalar tests run their own compiled harnesses. Their
`baseline` labels designate algorithm/SDK controls and are not evidence of use of
the startup Makeshift executable. Their own source/API/error limitations remain.

`fixed-v-application.jsonl` uses `K:uv-reuse`; the with-axis confirmation uses
`K:twist-volume-axis`. Dedicated `fixed-v-paired*.jsonl` configuration records
name `/tmp/geometry-volume-kernel` and its fixed-V counterpart. These are different
controls from `K:baseline`.

[build-ray-setup-preloads.sh](../../../tests/geometry-performance/build-ray-setup-preloads.sh)
wraps fixed `K:streaming-cuts` with independently built control/reuse/minimal/range
OCCT preload modules. Their benchmark first records name
`.cache/geometry-performance/ray-setup/bin/makeshift-control` and the corresponding
variant. Ray count/constructor records also carry the underlying application hash.
This is a controlled kernel-module comparison on a rebuilt application snapshot,
not a startup-versus-current application comparison.

[build-kronrod-preloads.sh](../../../tests/geometry-performance/build-kronrod-preloads.sh)
similarly wraps a standalone volume binary and fixed application snapshot.
The interval application confirmation names
`.cache/geometry-performance/kronrod/bin/makeshift-control` and `makeshift-interval`;
volume comparisons name `volume-control` and their variant. The build script
source/header hashes and OCCT notices address module provenance separately from
the app snapshot. No claim of exact starting application source follows from those
kernel hashes.

Large archived streaming-shell repeat/fresh raw streams were not decompressed.
The first 40 lines of their saved summaries retain input provenance: both use
`K:twist-volume-axis` (SHA-256 `bae92a96e28acfeab31f1ed52090246d8129b59ee21660e719e1df150b99cad3`)
against `K:streaming-cuts` (`a73a4deeab12ba8655bf031dbc1d28ec29e612a25235919ccfba381809afbecb`).
These diagnostic comparisons therefore do not use the startup executable.
Archived latency raw data was likewise not decompressed, but its compact summary
does not contain executable metadata. Confirm that specific invocation before
final attribution; its filename alone is insufficient. This bounded-audit gap is
not evidence of startup use.

## Corrections and retest priorities

1. Correct startup executable provenance everywhere: unknown older prebuilt
   artifact, with the observed missing field; do not assign it an inferred commit.
2. Retest exact Shell parallel APIs against a fresh `7861122` build if retaining
   that isolated performance claim. Keep early raw observations, clearly marked
   confounded across application builds.
3. Repeat combined current-versus-starting-source ordered-output checks and paired
   timings using the fresh baseline. Do not ignore `chamfer` to make stale-schema
   comparisons pass; source already requires that field.
4. Treat startup failure reproductions similarly. In particular
   [regression-erosion-original-baseline.log](results/regression-erosion-original-baseline.log)
   records sphere-plane-fillet rejection but no executable identity in its header.
   If that invocation used startup baseline, it proves an existing artifact failure,
   not a failure at commit 7861122. The intermediate baseline log is likewise
   evidence only for its actual invoked executable. Main should confirm invocation
   paths and rerun the fresh source control before using this to classify a source
   regression as pre-existing.
5. Preserve rebuilt incremental measurements with their actual controls. Do not
   retract ray/UV/volume-axis or independent kernel experiments wholesale solely
   because the first application baseline was stale. Report their narrower scope
   and obtain a clean combined baseline rather than multiplying historical ratios.

For new summaries record resolved executable path/hash, source commit plus dirty
diff or snapshot receipt, build flags, SDK receipt and ordered schema check. A
compact manifest alongside raw rows would have exposed this mismatch earlier;
the present audit adds no new benchmark/build framework.
