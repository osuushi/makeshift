# Mesh surface fitting

`makeshift.fitMesh(input)` reconstructs one ordinary editable solid from a triangle
mesh and an explicitly supplied quad layout. It runs inside `makeshift run` and
uses the existing serialized script candidate. DocumentOwner accepts the complete
script once; cancellation or a failed CLI run leaves accepted geometry unchanged.
The mesh, layout, fit controls and correspondence samples are temporary calculation
data, not another application document or a persistent feature history.

## File import and automatic layout

Tools → **Import mesh** opens an STL/OBJ file picker in Modeling. The temporary
source preview offers source units (mm, cm, inches or meters), accuracy in mm,
face budget, and **Fit preview**. Source mesh, fitted solid and deviation views
share the normal navigable viewport. Accept adds one ordinary solid in one Undo;
Cancel/Escape discards the import. Enter fits or accepts the current valid preview.
Parameter changes invalidate the preview; local Undo restores parameters and refits.
Other geometry edits remain disabled while the import owns the interaction.

The manual `reconstruct-mesh` request first tries complete analytic reconstructions
(see below), then uses the same bicubic fitter with an automatic layout.
A conformalized mean-curvature flow produces an oriented spherical map,
then an area-balancing optimization gives narrow extremities more sampling space.
An inverse-mapped cube grid supplies 24, 54, 96, 150 or 216 initial quad patches.
The map must have positive oriented triangles covering the sphere once. Failure to
map or meet the unchanged fit checks produces an error, never a partial accepted body.
The area balancing is a Makeshift heuristic, not a claim of equal-area certification.

This route supports one closed, consistently oriented mesh **without holes**
(genus zero): recognized analytic primitives or smooth freeform bodies. Concavity
and bends are allowed; difficult shapes, unrecognized sharp features,
noise and poor tessellations can still fail. More patches do not guarantee success.
There is no general feature segmentation or mesh repair. STL repeated coordinates
are welded exactly; globally inward winding is reversed. OBJ polygon faces are
triangulated; nonplanar polygons do not retain a unique surface interpretation.
Open, disconnected, mixed-winding and degenerate meshes reject during validation.
File parsing runs in a worker and fitting in the cancellable native process.
Files are limited to 25 MiB, 100000 welded vertices and 200000 triangles.

Deviation colors use actual closest-surface distances at **source vertices**,
interpolated across the displayed triangles. Their scale runs from blue (zero) to
amber (the requested accuracy). This is distinct from the denser bidirectional
acceptance sampling and is not a continuous error certificate. The source mesh,
layout and per-vertex errors remain temporary; only the accepted B-rep is saved.

## Analytic recovery

Automatic import prefers one exact sphere face, a cylinder with two planar caps,
or a capsule with one cylindrical side and two spherical caps when the complete
candidate meets the original mesh allowance. The preview reports recovered face
types. Unsupported/distorted candidates continue through the bicubic route; there
is no partial analytic/freeform stitching in this checkpoint. Cones, arbitrary
regional segmentation and trimmed analytic-to-freeform joins remain unsupported.
Explicitly supplied quad layouts retain their original fitting contract.

Candidate parameters come from area-weighted least-squares fits to mesh vertices;
position and face-normal covariance provide possible cylinder axes. These are
recognition heuristics, not guarantees on noisy or unevenly tessellated scans.
Verification measures closest distances from every source vertex, triangle center
and edge midpoint to the complete analytic surface, plus dense analytic-to-triangle
samples and outward normal agreement. The allowance applies to the faceted source,
so exact sphere vertices alone cannot hide chord error between them. Sampling does
not certify a global Hausdorff bound.

Capsule equators share the exact axis, centers and radius and are tangent by
construction. Cylinder rims are intentional sharp circular boundaries. Kernel
sewing and solid validity checks are unchanged. Recovered supports are ordinary
planes, cylinders and spheres in saved B-reps and STEP exports; source meshes and
recognition parameters are not retained. Equal-radius spherical caps on a coaxial
cylinder use ordinary radius/offset editing rather than fillet resizing.

## Input and result

- `mesh`: world-space `vertices` in mm and indexed `triangles`.
- `layout`: world-space `vertices`, indexed `quads`, and optional `creases` given
  as pairs of layout vertex indexes. All other patch joins are treated as smooth.
- `tolerance`: maximum accepted **sampled** distance in either direction, in mm.
- `smoothAngle`: maximum sampled angle between normals across smooth seams,
  in degrees (default 5, supported range 0.1–30).
- `maxPatches`: patch budget, default and maximum 256. The initial layout must fit
  within this budget; each uniform refinement multiplies the count by four.

Both inputs must be one connected, consistently outward-oriented, closed manifold
of the same genus. The layout must already follow the target's shape and features.
Index and manifold checks reject open surfaces, unused vertices, disconnected
components, repeated vertices, degenerate faces and inconsistent winding.
The supplied-layout scripting route does not infer a layout or repair a mesh;
it supports holes when the supplied layout has matching topology. Separate
shells cannot be nested in either route. Input limits are 100000 vertices per mesh/layout,
200000 target triangles and 256 initial quads. Target diagonal must be between
0.0001 and 1000000 mm; tolerance is at least 0.000001 mm and at most 10% of that
diagonal. Coordinates have magnitude at most 1000000000 mm.

The result includes the ordinary full candidate body inventory and a `fit` object:
face/patch and control-point counts, optional `analyticFaces` counts for planes,
cylinders and spheres (zero Bézier control points), `sampledSurfaceToMesh`, `sampledMeshToSurface`,
`sampledRms`, `sampledSeamAngle`, and distance sample count. Measurements are not
stored as accepted model identities or a certificate attached to the solid.

## Construction and checks

The native calculator normalizes temporary coordinates, builds a triangle nearest
point index, and fits a shared bicubic Bézier control network. Boundary controls
are shared exactly between neighbors. A joint sparse least-squares solve combines
forward/reverse distance samples, normal alignment, tangent-frame regularization,
and mild fairness. Tangent regularization applies to each iteration rather than
anchoring the final shape to the initial layout. An additional signed-area penalty
resists collapse of initially independent parameter directions; normal residuals
balance long and short tangents. Bounded steps protect the sampled patch orientation.
Each refinement level receives up to three batches of 12 iterations, with the full
acceptance checks after each batch. Passing candidates stop immediately; extra
iterations and refinement never relax the distance, seam or B-rep requirements.
Declared crease edges omit the smoothness constraint. Shared de Casteljau
subdivision preserves the existing surface before another fit iteration.
Crease initialization uses the intersection of the incident target tangent planes;
this allows curved sharp boundaries such as cylinder rims.
Without declared creases, target vertex normals average all incident triangles,
including steep angles on thin rounded rims. With declared creases, target normal
estimation separates incident triangles more than 45 degrees apart; the final
sampled seam and distance checks still determine acceptance. Internal Erode
reconstruction may instead supply temporary smooth-source normal guidance. That
route can retain its best valid CAD fit at the selected face budget and report
remaining deviation; this is separate from file import's strict tolerance contract.
It linearizes the normalized angular residual so shrinking a parameter tangent
cannot improve alignment; file import retains its existing normal estimation.

Validation uses denser surface stations than the fit, every target vertex, and
each target triangle's centroid and edge midpoints. Smooth-seam angles are checked
at 33 stations per edge. Target-to-surface checks refine a tessellation-seeded
closest point on the actual bicubic surface. Singular/folded candidates and unmet
budgets reject. These checks are numerical samples: they do not certify global
Hausdorff distance or exact G1 continuity. Geometric self-intersection of the input
triangle mesh is not independently certified by its combinatorial manifold check.

OCCT builds the final faces and sews at 0.0000001 mm, independently of the fitting
allowance. Planar fitted supports are retained as planes. The result must pass
strict B-rep validity, positive volume, outward orientation, closed-shell,
topology-count, per-entity tolerance and self-interference checks. Larger fitting
allowances never enlarge the kernel sewing tolerance.

The accepted result uses ordinary body/face/edge IDs, selection, transforms,
Boolean operations, Undo and archive paths. A valid reconstructed solid does not
guarantee that every later fillet, shell or offset is feasible.

## Review route

For manual review, choose Import mesh with a sphere, capped cylinder, capsule or
closed smooth freeform STL/OBJ, set source
units and accuracy, fit, compare the three preview views, then accept. Reselect and
move the body, Undo/Redo, and save/reopen. After build and compiled unit tests,
`node tests/mesh-import-ui.mjs` checks this route in Chromium, WebKit and hidden
Electron, including binary STL unit conversion and parameter history.
`node tests/mesh-analytic-ui.mjs` checks analytic import, face editing, Undo/Redo
and save/reopen in the same three runtimes.


The [self-contained example](../examples/mesh-fitting.ts) reconstructs a sphere from
a dense triangle mesh and six coarse quads. Copy it into the open document's agent
workspace and run `makeshift run mesh-fitting.ts`. Inspect the printed measurements,
select the fitted faces/body, move it, Undo/Redo, then save and reopen.

After the normal repository setup and Node activation, `npm test` includes the
shape, invalid-input, document-ownership and cancellation matrix. `npm run build`
followed by `node tests/mesh-fit-ui.mjs` exercises the typed CLI route in headless
Chromium/WebKit and hidden Electron. For the focused numerical and export checks,
enable `MAKESHIFT_KERNEL_TESTS=ON` in the configured `.build/kernel` CMake build,
build `mesh-fit-math-test` and `step-readback`, then run
`.build/kernel/mesh-fit-math-test` and `node tests/mesh-fit-export.mjs`.
The export check uses the compiled test modules produced by `npm test`.

The first implementation uses uniform patch refinement to preserve a conforming
edge network. Local refinement, arbitrary open sheet
insertion and exact tangent continuity at all parameters for bicubic seams are
outside this operation's current contract.

Layout placement and parameter conditioning still matter: additional patches or
iterations do not guarantee a feasible fit for an arbitrary layout. The acceptance
matrix includes radii 6/6/20 mm with a 12 mm quadratic bend and 96 initial patches,
alongside the milder 4 mm bend. Thin shapes need an allowance chosen relative to
their thickness if volume accuracy matters; the 15/10/1.5 mm ellipsoid acceptance
uses a 0.05 mm allowance and 96 initial quads.
