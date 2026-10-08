# Geometry performance research results

Research branch: `research/geometry-performance`, 2026-10-08.
Authority: [overnight brief](../../planning/geometry-performance-research-brief.md).
Detailed methods and raw evidence: [investigation log](README.md).

## Direct measurement of the application changes together

The exact starting commit `7861122fb791c71692d7b48a70bfcb3a381fc95a` was rebuilt
in a detached checkout against the unchanged installed OCCT 7.9.3 SDK. Its
executable was compared with the application changes through `27a797d`.
Both use four OCCT threads on this four-CPU-quota virtual machine. Forty
randomized paired blocks per workload follow one recorded warmup; substantial
builds and all measurements hold the shared exclusive compute lock.

| Workload | Starting median | Current median | Paired median speedup | Bootstrap 95% interval |
| --- | ---: | ---: | ---: | ---: |
| Perforated extrusion | 104.0 ms | 99.8 ms | 1.064× | 1.008–1.090 |
| Perforated Cut | 115.6 ms | 109.9 ms | 1.046× | 1.028–1.082 |
| Perforated Fuse | 522.5 ms | 453.6 ms | 1.146× | 1.130–1.167 |
| Open perforated Shell | 941.9 ms | 592.0 ms | 1.611× | 1.581–1.642 |
| Cubic implicit subtraction | 43.9 ms | 33.7 ms | 1.332× | 1.304–1.369 |
| Captured notched Shell | 559.4 ms | 403.1 ms | 1.392× | 1.359–1.409 |
| Captured bent Shell | 1108.5 ms | 813.8 ms | 1.355× | 1.326–1.386 |
| Offset-circle twisted extrusion, New | 4976.3 ms | 59.9 ms | 82.370× | 80.013–84.070 |
| Same twist, neutral Auto | 4941.0 ms | 57.0 ms | 85.597× | 83.993–87.817 |

These are measured combined results, not products of isolated speedups. The
large twist effect is a pathological integration workload, not a general
82× kernel acceleration. Paired median ratios need not equal the ratio of the
two separately reported medians. Intervals are exploratory and pointwise.

All nine summary geometry/predecessor multisets match. Eight stable workloads
also match ordered full metadata/display output at the full comparator's
1e-9 relative-with-unit-floor threshold. Captured notched Shell has ordering
and thickness-index variability within the starting baseline as well; its
ordered output is not claimed identical. The full comparator excludes BRep
strings; separate component experiments retain byte-level BRep, material,
precision, threshold and downstream controls. These checks do not certify
arbitrary fitted-surface accuracy or proprietary-kernel parity.

Raw evidence:

- `results/combined-source-application-confirmation.jsonl`
- `results/combined-source-application-confirmation-summary.json`
- `results/combined-source-application-full-output.json`
- `results/source-baseline-build.log` and `source-baseline-build-hashes.txt`

## What accounts for the improvements

Application work is a major part of the problem. Perforated Fuse spends about
23 ms calculating the Boolean but hundreds of milliseconds producing exact
thickness and topology metadata. Reusing body-level ray preparation, exact UV
samples and tangent-face adjacency avoids substantial repeat work. Shell also
benefits from parallel strict checks and avoiding duplicate validation of an
unchanged source. Implicit extrusion Intersect reuses the already constructed
Common; implicit Cut reuses its intersection preprocessing and releases it
pair by pair rather than retaining every pair's data.

The worst twisted extrusion spends millions of evaluations integrating
near-cancelling local fluxes along an unsuitable axis. A transverse global
reference axis integrates the same closed solid with the same method and
tolerance, avoiding most of that work. Reusing the identical final solid's
already calculated exact volume removes another repeated integration.
Additional invariant, placed, scale/slender and byte-identical BRep controls
are documented in the volume research notes. Reported quadrature error alone
is not an accuracy certificate; remaining numerical-policy gaps are explicit.

## Kernel experiments and negative results

The installed SDK is unchanged. These are isolated research candidates:

- **Early exact ray-range filtering:** skips classification of support hits
  that cannot enter the caller's interval. Independent 120-pair confirmation
  gives 1.015× Cut, 1.027× Fuse and 1.027× open Shell, with resolved intervals.
  All 6,900 public query rows match bit for bit; thirty native cases pass.
  Thirty-six isolated low-level configurations match outputs and process exits,
  including eight malformed configurations crashing all three versions.
  Skipping irrelevant classification can still suppress exceptions on other
  inputs; this is not adopted as a generic exception-compatible backport.
- **Fixed-V spline evaluator reuse:** matching isolated TKMath/TKG3d builds
  preserve tested evaluator/mass/error bits. After the application axis fix,
  forty pairs give about 3.4% captured bent-Shell improvement; circle's smaller
  effect remains uncertain. Integration requires the matching library pair.
- **Boolean batching:** forty kernel pairs show dense sixteen-tool Fuse 3.72×
  and Cut 2.84×, with material controls. Application history, intermediate fuzzy
  tolerances and topology semantics still require an implementation and tests.
- **Contiguous quadrature interval storage:** small isolated integration gains
  preserve scalar/mass/error bits, but forty application pairs resolve no gain.
  A small Fuse slowdown is recorded and not yet localized. Not adopted.
- **Ray line/adaptor allocation reuse:** large constructor reductions do not
  produce a consistent request gain across two forty-block confirmations.
  The minimal variant resolves no gain in eight workloads. Not adopted.
- **Prepared quadrature tables, roundoff-floor tuning, projection setup reuse,
  and broad mass-only recentering:** negative or inconclusive performance
  evidence is preserved; none is presented as a production speedup.

## Follow-up priorities

1. Review the application changes and remaining exceptional/repair, source-state
   and mass-threshold gates before integration. Early isolated Shell-parallel
   timings require a source-pinned retest; the direct combined result above is
   source-pinned and does not depend on those early attribution claims.
2. Test the prepared private-copy parallel thickness prototype with three modes:
   original serial, serial copy and parallel copy. OCCT copyGeom=true does not
   guarantee all basis geometry is private: offset pcurves can share a spline
   basis. The source-only patch checks ownership and restores mapped face
   orientations; it has not been compiled or benchmarked.
3. Bring measured Boolean batching into application semantics, preserving
   entity history and testing fuzzy/multiple-solid/ordering behavior.
4. Decide whether the modest ray-range and fixed-V kernel gains justify their
   integration and maintenance cost after the remaining contract checks.
5. Continue numerical conditioning work with actual relative references and
   whole-solid error budgets rather than trusting a local reported estimate.

The startup prebuilt executable was discovered to omit metadata present in the
starting source. Its revision is unknown; it is not a source-pinned baseline.
Affected early observations and unaffected later rebuilt-intermediate comparisons
are enumerated in [the provenance correction](baseline-provenance-review.md).
The failed combined check is retained. The fresh starting-source rebuild above
corrects the final combined measurement without erasing that finding.
