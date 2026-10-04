export const meshFitGuide = `
## Reconstruct a mesh as CAD geometry

await makeshift.fitMesh({mesh,layout,tolerance,smoothAngle:5,maxPatches:256}) creates
one ordinary editable solid. mesh contains vertices ([x,y,z] in mm) and triangle
index triples. layout contains vertices, quad index quadruples and optional creases
(pairs of layout vertex indexes). Both are one outward-oriented closed manifold
of the same genus; supply a layout positioned near the target and following its
features. This call does not generate a quad layout or import a mesh file.

Shared bicubic patches are fitted jointly; declared crease edges may remain sharp.
tolerance limits sampled distance in both directions. smoothAngle limits sampled
normal mismatch across other seams (degrees, 0.1–30). Neither is a global distance
or exact smoothness certificate. The native kernel independently checks solid
validity and self-interference without increasing its sewing tolerance.

The returned fit contains patches, controlPoints, sampledSurfaceToMesh,
sampledMeshToSurface, sampledRms, sampledSeamAngle and samples. bodies is the entire
candidate inventory, including existing bodies. Compare IDs to identify the new
body. The complete script accepts once; an error or cancellation discards it.
Default/maximum patch budget is 256; refinement multiplies the count by four.
An unmet tolerance rejects instead of silently accepting an inaccurate result.
`;
