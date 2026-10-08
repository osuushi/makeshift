# Geometry performance research brief

## Goal

Investigate how to make Makeshift’s exact geometry operations substantially faster
using OCCT, prioritizing better application usage of the existing kernel and
improvements to the kernel itself.

This document is the durable brief for a subsequent `/goal` run. Saving it does
not start the overnight investigation.

## Objective

Conduct an overnight research and experimentation effort focused on slow shelling,
extrusion, and Boolean operations as geometry becomes more complex. Determine
which bottlenecks come from Makeshift’s use of OCCT and which come from OCCT’s
implementation.

Aim for substantial, reproducible improvements while preserving geometric
accuracy, valid B-REP topology, and application semantics. Performance comparable
to proprietary kernels such as Parasolid is an aspiration; claims of comparison
require measurements on comparable workloads and hardware.

## Work in scope

Pursue two main avenues, prioritizing application-level improvements first:

- **Use OCCT more effectively:** Investigate operation choices, configuration,
  tolerances, unnecessary work, repeated calculations, shape preparation,
  batching, caching, simplification, and CPU parallelism where relevant.
- **Improve OCCT itself:** Profile expensive kernel paths, study algorithms and
  implementation choices, and experiment with patches or alternative
  implementations. A maintained OCCT fork is acceptable if justified by results.
  Record version, licensing, source-distribution, integration, and maintenance
  implications.

Follow evidence wherever it leads within these avenues. Do not assume that OCCT
is fundamentally slow or that application misuse explains the problem.

## Work outside scope

Do not spend this effort implementing:

- Faster previews that defer the real operation, such as displaying an extrusion
  separately before computing its union.
- Mesh-based previews or other ways to mask calculation time.
- Mesh operations followed by reconstruction into B-REP/CSG, remeshing fallbacks,
  or intentional compromises in accuracy or topology.
- GPU acceleration or hardware-specific GPU paths.
- Product flows for communicating approximation or topology trade-offs.

These may be valuable later, but this investigation targets the actual cost of
exact geometry computation on ordinary CPU hardware, including the baseline for
machines without substantial GPU compute.

## Investigation approach

Start by mapping Makeshift’s geometry pipeline, OCCT version and build
configuration, and the implementation of shelling, extrusion, and Booleans.
Identify representative slow cases and create reproducible benchmarks, including
small cases that expose the same underlying bottlenecks.

Measure kernel execution separately from surrounding work where possible.
Profile before making substantial changes, then form explicit hypotheses and
test them.

Consult OCCT source, documentation, issue discussions, and relevant computational
geometry literature. Connect research findings to concrete experiments.
Distinguish measured results from hypotheses and untested proposals. Record
commit-pinned source references for source-derived claims.

Favor improvements that generalize across workloads. Include difficult and
regression-prone cases, not just examples chosen to demonstrate a speedup.

## Benchmark discipline

The available Codex Cloud machine may be modest and its resources may fluctuate
significantly. Design benchmarks accordingly:

- Record hardware, available resources, compiler settings, OCCT version, and
  relevant environment conditions.
- Use warmups, repeated measurements, and enough samples to distinguish
  improvements from noise.
- Interleave or randomize baseline and candidate runs where practical to reduce
  drift bias.
- Report sample counts, absolute timings, relative changes, variability, and
  uncertainty.
- Retest surprising or inconsistent results with larger sample sizes.
- Separate cold-start behavior from steady-state performance when relevant.
- Validate geometry alongside timing. Check shape validity, expected dimensions
  or volume, and relevant topology and downstream behavior.

Do not accept a faster result that silently changes the operation’s meaning,
loses required topology, or introduces unacceptable robustness problems.

## Concurrency and resource ownership

The user explicitly authorizes subagents and separate worktrees for research,
source inspection, and independent implementation exploration for this effort.

All workers share one machine. Centralize benchmarking with the main orchestrator
by default. Establish a shared, exclusive resource lock for benchmarks,
substantial compilation, and other compute-intensive work. Every worker must
honor it.

Never run competing benchmarks, or run benchmarks while another worker compiles
OCCT or consumes significant compute. Record benchmark interruptions or suspected
contention.

## Branch and research record

Work on a dedicated research branch and keep copious, durable notes throughout
the investigation. Commit useful checkpoints so the work remains reviewable and
recoverable. Preserve unrelated user work.

Maintain:

- An investigation log with hypotheses, experiments, findings, failed approaches,
  and next steps.
- Reproducible benchmark cases, commands, configuration, and raw measurements.
- Profiles and analysis identifying where time is spent.
- Candidate changes with their rationale, correctness evidence, and performance
  results.
- Research references and notes on how they apply to Makeshift.
- A ranked opportunity list covering expected impact, evidence strength,
  implementation effort, robustness risks, and maintenance cost.

Preserve negative results; they help prevent repeated dead ends. These research
records and delegated exploration are explicitly requested for this effort,
superseding general repository preferences against progress ledgers and
subagents within this scope.

## Persistence and desired outcome

Continue through the authorized overnight working period, pursuing successive
hypotheses rather than stopping after an initial survey or one promising result.
If an avenue stalls, document why and move to the next useful experiment.

The outcome should be an evidence-backed explanation of the main bottlenecks,
reproducible benchmarks, validated improvements where feasible, and a prioritized
path for further work. Clearly separate changes ready for integration, promising
prototypes, and ideas that still require investigation.
