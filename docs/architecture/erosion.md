# Eroded bodies

Erode creates independent, editable bodies inside selected whole bodies and optionally
retains the originals. Thin regions may disappear and a body may split. Accepted
results are ordinary materialized BReps with new stable IDs; no distance field,
reconstruction recipe, or relationship to the source is saved.

The founder's 2026-10-03 decision separates the methods: **Remesh targets a thickness
and reports approximation quality; Analytic guarantees minimum thickness and bounded
extra thickness.** Remesh no longer uses allowance as a construction bias or acceptance
threshold.

## Interaction and ownership

Select complete bodies and choose Erode from Tools. The local widget provides Method
with “Remesh (usually faster, more flexible)” and “Analytic (more accurate, often slower)”,
Erode by, Keep originals, and an inward drag handle. Remesh also shows Mesh detail
(Coarse, Standard, Fine) and CAD face budget (32–256 per source body). Analytic shows
Extra thickness allowance, expressed as a percentage of its minimum thickness. For Analytic, 4 mm at
50% permits 2 mm extra thickness; the geometry API receives millimeters.

Entering Erode starts a preview immediately with Remesh, 1 mm target thickness,
Standard detail, a 128-face budget, and Keep originals enabled. Analytic's allowance
starts at 50%. Switching methods preserves their separate controls within the
operation. A new invocation resets every setting. Inward dragging clamps at a
positive 0.001 mm.

Drag release retains the temporary preview. Enter, the check button, or completing
by switching tools accepts; Escape or either cancel button interrupts native work,
discards the candidate and returns to Select. The panel closes on acceptance or
cancellation. Changed numeric targets interrupt obsolete calculations and retain
only the latest requested values. Invalid parameters clear the candidate
and disable acceptance. Zero thickness is a no-op. Calculations use the shared
single-edit lease, busy state and native cancellation path.
While Erode is active, Undo/Redo restores completed thickness, allowance, mesh detail, face budget, method and Keep
originals tweaks through the same preview path. Acceptance remains one document
Undo step; cancellation discards the temporary parameter history.

With Keep originals enabled (the default), preview ghosts source bodies as display
state only. Acceptance selects the new bodies and hides their originals in the
per-window entity visibility state, so
results can be edited immediately. Originals remain in the entity list and can be
shown or selected for subtraction. An empty result leaves retained originals selected
and visible. Turning Keep originals off replaces the selected sources, including
removing them for an empty result under the selected method. Undo restores replaced originals.
An operation that changes the document is one Undo step; Undo restores the source view.
Appearance and exact source geometry are not changed by ghosting.

A cavity-making workflow is Erode, subtract rib solids from the new body, then
subtract its remaining pieces from the original. These pieces remain ordinary
positive bodies until the final Boolean operation creates the cavity.

## Remesh reconstruction and reporting

Remesh extracts the signed-distance level set at the requested target thickness.
It does not add allowance-dependent depth.
Mesh detail selects a geometry-sensitive sampling heuristic, not a fixed number
of cells. The initial Standard spacing is the smallest of longest bounding-box
span / 48, shortest span / 18, and Erode by / 2. Coarse multiplies that by 1.5;
Fine by 2/3. The source surface area then limits expected work: spacing is at least
sqrt(area / 6000), sqrt(area / 12000), or sqrt(area / 24000), respectively, and at
least longest span / 256. These are bounded quality heuristics, not feature-size
certificates. The widget reports the actual spacing in millimeters; finer detail
may still miss very small features. Source tessellation uses spacing/32 deflection.

An octree-style recursive sampler rejects blocks using the signed-distance bound
at their centers, then subdivides the remaining blocks. Samples are shared in a
cache; all surface leaves use one uniform lattice so adjacent tetrahedra agree.
This avoids scanning distant volume without pruning isolated interiors just because
the corners are outside. Closest-triangle queries use a BVH. Interior projections
onto oriented triangle faces supply the sign directly; edge/vertex projections use
ray parity, with CAD classification for ambiguous rays. Marching tetrahedra preserve
separate closed components at the sampled resolution. Remesh's empty result remains
sampled, not certified. Source normals are computed only when the fitting path needs
them, rather than for box or curved-section recovery.

Remesh uses six-plane box recovery, curved sections, analytic fitting, and radial
layouts feeding the shared bicubic fitter. The CAD face budget bounds the whole output for each
selected source, including all its components. The fitter refines within that budget
and can retain its best valid fit despite residual deviation. Public mesh import
retains its separate, strict fitting-tolerance contract.

An inward cylindrical source face can guide angular sections of a bent interior.
Open angular ranges use planar end caps; closed ranges form periodic rings. Closed
rings use nonnegative longitudinal cubic weights to avoid interpolation overshoot
at narrow necks. Every proposed surface still passes the ordinary closed-solid and
self-intersection checks, and its deviation is measured against the original mesh.
This is a bounded reconstruction family, not an arbitrary-topology surface mapper.

When radial fitting is unsuitable, direct planar contours of the same source field
can preserve through-holes. Large planar normals and principal axes supply distinct
candidate layouts. Thirty-two aligned sections use periodic cubic interpolation
around each loop and cubic interpolation along the axis. Loop controls and side-face
subdivision follow the CAD budget; holes remain inner wires in both planar caps.
After direct fitting fails, a mesh opening of radius spacing/2 removes sub-grid tips
before a simpler single-ring fit. This can split narrow connections; diagnostics
still compare against the original, unfiltered target mesh. No construction
silently changes the requested target to spend a thickness allowance.

Every result must still be an oriented, closed, valid CAD solid with valid topology
and no self-intersections. Remesh does not run the minimum-distance or interior-coverage
certificate. Its target is not a guaranteed minimum, and the fitted surface can
under- or overshoot it. Construction or topology failures remain errors; deviation
alone is reported rather than rejected.

Temporary per-source diagnostics include mesh spacing, triangle/face counts, sampled
thickness range and sampled fit deviation. Thickness samples measure signed distance
to the source tessellation; fit deviation samples distances in both directions between
the contour mesh and a tessellation of the fitted CAD. These are approximate samples,
not certified extrema. The model owner exposes them only while that erosion candidate
is current; accept, discard, failure and history navigation do not persist the report
in accepted bodies or the saved document.

## Analytic geometric contract

For original solid `S`, let `E_d(S)` denote its interior at least `d` from its boundary.
With minimum thickness `t` and extra allowance `e`, Analytic requires:

`E_(t+e)(S) ⊆ C ⊆ E_t(S)`.

Minimum thickness wins. The allowance limits extra material left behind; it is not
permission to make walls too thin or discard a spacious chamber. Display triangulation
is never an accepted representation. Both methods produce ordinary editable CAD,
but their thickness promises differ. Remesh describes its construction strategy and
does not guarantee a shorter runtime for every input.

Analytic tries a conservative simplification and native inward CAD offsets. Simplification proposes one batch of shallow protruding faces above
planar supports and heals them, spending at most half the allowance. It independently
checks containment and interior coverage before using that proposal. Failed
simplification falls back to the untouched source. Offset construction tries OCCT's
join modes on private copies and unifies coincident support surfaces. If a round
collapses at the requested depth, construction also tries half the extra allowance;
verification still uses the original requested bounds. Valid source pcurves are
preserved rather than forcibly reparameterized.

Additional Analytic construction proposals remove collapsed cylindrical branches and convex
toroidal rounds, retaining globally supporting planar caps. Every proposal is
verified against the untouched source. Separate closed inner shells are existing
voids: their enclosures expand outward while the outer enclosure shrinks, followed
by one Boolean cut. This permits cavity merging and breakthrough. Optional
same-domain cleanup is retained only if its topology remains valid.

Acceptance requires valid oriented closed solids, tight edge/vertex correspondence,
no self-intersections or orphan faces, containment in the original, whole-boundary
minimum separation, and coverage of all required interior regions. Coverage uses
adaptive cells with conservative distance bounds, not an unchecked sample grid.
Convex planar half-spaces and exact planar polygon triangles accelerate those
bounds; curved supports, indexed points on exact boundary curves and trimmed faces,
and exact kernel distances handle other regions. These points provide upper bounds
only. Nonrational Bézier and B-spline faces additionally use boxes enclosing subdivided control
hulls for conservative lower bounds and boundary-crossing exclusion. These boxes
are based on the actual surfaces, independent of display tessellation. Certified
interior/exterior distance balls and boundary-free spans reuse classifications
across neighboring cells. Recognized section solids use exact cubic cross-section
ray intersections. Uncertain roots, seams, nonmonotone heights and exterior answers
without sufficient boundary separation fall back to OCCT classification. Trimmed
surface witnesses provide upper bounds, with exact distance fallback for section
coverage. Unresolved cells, the finite work limit, or kernel errors
reject the proposal. An offset failure
alone never proves the interior empty; emptiness has its own coverage check.
Calculation coordinates follow a source surface frame so rigid placement does not
needlessly multiply Cartesian cells. Full concentric spherical shells additionally
have an exact radial-interval coverage certificate. These change verification cost,
not accepted geometry or distance budgets.

Cells with the largest unresolved clearance are checked first. Coverage
stops refining a cell's conservative distance bound as soon as that bound
certifies the requested depth, avoiding unnecessary boundary classifications.
Trimmed supports whose lower bound cannot improve an existing boundary witness
also skip classification. On the Analytic path, a coverage-limit failure stops
repeated construction attempts rather than spending the same limit again on similar
proposals. When a minimum-thickness-valid candidate supplies a
finite bound on its remaining uncovered regions, the failure includes a rounded,
conservative allowance suggestion with 32% headroom before rounding upward.
The UI rounds this upward to a multiple of 10%. The local **Try …% allowance** button
changes only the allowance and recalculates through the normal validation path.
It is guidance, not automatic acceptance or a guarantee for every selected body;
unsupported construction/precision failures may have no useful suggestion.

Generated offsets must also survive exact BRep storage and readback. If a private
stored result needs parameter correspondence repair, it is remeasured and must
survive another round trip before the usual solid, separation and coverage checks.
Source geometry and numerical budgets are unchanged.

## Complex cases

The Analytic matrix below uses millimeters. Each nonempty result is checked
with exact Boolean material/void probes, in addition to the full acceptance checks.
Known analytic volumes are asserted independently. All cases preserve the accepted
source through preview and exercise acceptance, Undo/Redo and document reopening.

| Case | Thickness / allowance | Expected behavior |
| --- | --- | --- |
| Long 1 mm thick planar fin | 1 / 0.25 | Fin disappears; broad block survives. |
| Radius 0.6 cylindrical branch on radius 6 body | 1 / 0.25 | Branch disappears; main cylindrical interior survives. |
| Torus, major radius 8 and minor radius 3 | 1 / 0.25 | Minor radius becomes 2; central hole stays open. |
| Two fused tori, centers 18 apart | 0.8 / 0.6 | Connected result preserves both holes and outer lobes. |
| Plate with two radius 2 through-bores | 1 / 0.25 | Planar exterior shrinks; both bores expand to radius 3. |
| Radius 8 sphere cut by a plane | 1 / 0.25 | Sphere radius becomes 7; planar bottom moves inward by 1. |
| Same hemisphere with radius 0.75 rim fillet | 1 / 0.5 | Collapsed rim is simplified; planar cap remains. |
| Radius 6 sphere joined to radius 3 cylinder | 0.8 / 0.3 | Both bulb and stem survive their sharp junction. |
| Same join with radius 0.75 fillet | 0.8 / 0.3 | Blended junction yields an editable connected interior. |
| 20 mm cube with radius 0.2 sealed void | 1 / 0.25 | Tiny void expands to radius 1.2; it is not filled. |
| Cube with two radius 0.4 sealed voids | 1 / 0.25 | Both voids expand independently to radius 1.4. |
| Two radius 0.5 voids, centers 4 apart | 1.7 / 0.25 | Expanded voids merge; intervening material disappears. |
| Radius 0.8 void centered 1.8 from cube side | 0.8 / 0.25 | Expanded void breaks through the eroded exterior. |
| Concentric spherical shell, radii 8 and 6 | 0.5 / 0.2 | Surviving shell has radii 7.5 and 6.5. |
| Same spherical shell beyond collapse | 1.1 / 0.2 | Verified empty result. |
| Torus near collapse | 2.8 / 0.1 | Thin but valid minor-radius 0.2 torus remains. |
| Torus beyond collapse | 3.1 / 0.2 | Verified empty result. |

Boundary regressions also cover exact zero-volume collapse (spherical shell at 1,
torus at 3, both with zero allowance), atomic rejection of the round branch with
zero allowance, and translated/rotated joined tori, filleted hemisphere and merging
cavities. Empty means no volumetric body; a residual mathematical surface or curve
at exact collapse is not retained as a solid.

## Current limits

Remesh supports up to 16 closed components. Radial fitting requires genus zero;
section fitting also supports through-holes whose ordered loops persist along a
usable axis. Sections with separate outer regions, nested islands or changing loop
counts are rejected on that axis. Enclosed voids and more general changing topology
still rely on Analytic or another certified proposal.
Each 3D field is limited to 300,000 samples and 12 seconds, and each contour to
100,000 vertices/200,000 triangles. Direct section sampling shares a 500,000-evaluation /
20-second budget across distinct axis proposals. Fitting honors the requested 32–256
CAD-face budget per source body. Larger budgets are maxima, not requested face counts;
analytic or already adequate fits can use fewer faces. Changing detail changes
sampling, while changing the face budget changes conversion complexity.

A waisted freeform body, an approximately spherical cubic source, the captured lobed
fillet and a plate with two through-bores are covered at a 1 mm target. At a 2 mm
target the older pierced-fillet capture still exceeds its reconstruction budgets;
that failure is not an empty result. At an explicit 3.8 mm target, resolution-based
filtering preserves both large chambers and two small pieces as four editable bodies.
Its former 2 mm / 3.6 mm allowance behavior included that extra construction depth;
Remesh no longer adds it implicitly.

Reconstructed cubic faces support ordinary face movement. Neighboring polynomial
four-sided faces use algebraic boundary interpolation before general plate filling,
keeping their requested rims within the existing geometric tolerance. This does
not guarantee tangent continuity after direct face movement. General face Offset
on a freeform patch can still stop at zero when the native offset cannot construct
a valid neighborhood; Move is the verified local-edit route for this checkpoint.
On Analytic, small allowances on complicated boundaries may exhaust the coverage work limit;
zero allowance is useful for certifiable cases such as convex polyhedra, but is not
a promise of exact erosion for every body. Increasing the allowance can help
verification and simplification but cannot guarantee construction. No dense faceted
BRep fallback or repeated primitive subtraction is used.

On Analytic, existing cavities always count as source boundaries, even when very small. Erode
expands them rather than filling or ignoring them. Thin protrusions can vanish,
but their thicker roots may require curved transition geometry; the current
construction rejects a zero-allowance round-branch case instead of silently
discarding that root. A disappearing fillet can leave a sharp result when it fits
the requested bounds. Increasing allowance can therefore change topology.

Older filleted bodies may carry curve/surface disagreement beyond the 1e-6 mm
source budget and still reject. New fillets use tighter fitting; Erode does not
silently relax precision for old files. General freeform repair remains separate.
Coverage has a 100,000-cell limit per check. Its time limit is 30 seconds for
recognized section solids and 8 seconds otherwise; the geometric tolerances and
required coverage are the same. A coverage-limit failure rejects that proposal;
Analytic ends its proposal search with guidance where available. Preparation and other
kernel work can add time; cancellation interrupts the native worker rather than
waiting for those calculations to finish.
These are bounded construction and verification limits, not proof that the desired
interior does not exist.

A source-construction limitation was found for two major-radius 8/minor-radius 3
tori fused at exactly 16 mm center separation: the Boolean union can retain only
one lobe despite passing topology validity. This precedes Erode. The 18 mm fixture
checks source volume and symmetry as well as material in both eroded lobes; the
16 mm union remains a known Boolean defect, not a passing double-torus case.
The valid 18 mm source also exceeded coverage limits with a 0.3 mm allowance;
0.6 mm allows it to be certified without reducing the 0.8 mm minimum thickness.

## Scripting and checks

`makeshift.erode({ids, thickness, method, meshDetail, maxFaces, allowance, keepOriginals})` uses the same calculation and script
atomicity as manual tools. Its result includes retained originals and any unaffected
bodies, plus newly generated bodies. Empty results introduce no new bodies. `keepOriginals`
defaults to true. `method` is `"fast"` (the default) or `"accurate"`. Remesh ignores legacy
`allowance`; Analytic ignores the Remesh conversion settings. Both APIs use the same
defaults and limits as the local widget.

Geometry/workflow regressions: `tests/body-erosion.test.ts` and the two captured
models in `tests/body-erosion-capture.test.ts`. Independent coverage
checks: `cmake -S native/kernel -B .build/kernel -DMAKESHIFT_KERNEL_TESTS=ON`, build, then
`ctest --test-dir .build/kernel -R erosion-coverage --output-on-failure`. UI acceptance:
`node tests/erosion-ui.mjs` runs owned headless Chromium/WebKit and hidden Electron,
including cavity rib cuts and final subtraction. Activate the repository's Node
version before Node commands, as described in the development process.
The complex matrix and boundary cases live in `tests/body-erosion-special.test.ts`
and `tests/body-erosion-special-boundaries.test.ts`, with shared fixture/probe files.
`node tests/erosion-special-ui.mjs` checks seven representative cases through actual
Open, selection, Erode fields, acceptance, Undo/Redo, movement and Save/Open in the
same three runtimes. Compile `tsconfig.test.json` before running this route.
The captured towers/plate responsiveness case is in `tests/erosion-responsiveness.test.ts`;
`node tests/erosion-responsiveness-ui.mjs` covers automatic entry, reset values,
all three cancellation routes and the allowance suggestion through acceptance,
history and Save/Open. `tests/document-failure.test.ts` checks feedback validation.
`node tests/erosion-history-ui.mjs` checks temporary parameter Undo/Redo, branching
after Undo and grouped document acceptance in all three runtimes.

Reconstruction acceptance: `tests/erosion-reconstruction.test.ts` checks a waisted
freeform source, independent volume bounds, a nonzero face edit, stable IDs, history,
reopening and final cavity subtraction; it also checks analytic sphere recovery.
`node tests/erosion-reconstruction-export.mjs` checks exact STEP readback and
closed oriented mesh export of the reconstructed interior and resulting wall.
`node tests/erosion-reconstruction-ui.mjs` runs the freeform route through real
pointer/keyboard controls in Chromium, WebKit and hidden Electron. Native
`erosion-field`, `mesh-fit-math` and `erosion-coverage` checks cover contour topology,
ray classification with voids, and conservative trimmed/transformed Bézier bounds.

`tests/erosion-methods.test.ts` covers default Remesh, explicit Analytic, analytic split
components, invalid methods, method-specific settings, and Analytic zero allowance. `tests/erosion-methods-capture.test.ts`
checks the captured split result and its final cavity at an explicit target depth. The corresponding
`erosion-methods-ui.mjs` and `erosion-methods-capture-ui.mjs` routes exercise method
history/cancellation and the captured workflow in Chromium, WebKit and hidden
Electron. `erosion-methods-export.mjs` checks independent STEP readback of all four pieces and the final wall.
Native `erosion-components` and `erosion-mesh-offset` checks cover component
remapping, refined contour roots and inward/outward mesh offset signs.

`tests/erosion-sections.test.ts` checks the captured lobed fillet at 1 mm thickness
with 32- and 128-face budgets, plus a plate with two through-bores and independent
material probes. It includes history, stable IDs, reopening, movement and final
subtraction. `node tests/erosion-sections-ui.mjs` exercises default Remesh through
ordinary controls in Chromium, WebKit and hidden Electron.
`node tests/erosion-sections-export.mjs` checks exact STEP readback and oriented
mesh export for the new interiors and final walls. Native
`erosion-section-classifier` compares section membership with independent OCCT
classification, including transformed, holed and near-boundary cases.

`tests/erosion-quality.test.ts` checks mesh-detail effects, ignored legacy Remesh allowance,
face-budget validation, transient diagnostics and scripting with the same Remesh settings.
The method UI route checks all controls, parameter history, method isolation, restart
defaults, cancellation and saved-document history in Chromium, WebKit and hidden Electron.

The `erosion-curved` captured regression exercises the 2 mm/Fine interior, local
face editing, history, Save/Open and final cavity subtraction. The sections UI and
export routes also include that body. Native `erosion-field` checks adaptive contour
closure, winding, independent sphere volume and retention of disconnected interiors
inside a much larger volume with substantially fewer samples.
