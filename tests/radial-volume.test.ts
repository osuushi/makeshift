import assert from "node:assert/strict";
import test from "node:test";
import { cylinderGrid } from "../src/decorators/radial-mesh.js";
import { radialVolume } from "../src/decorators/radial-volume.js";
import { validateMesh } from "../src/model/export-mesh.js";

test("bore caps share one axis vertex per end despite intersection roundoff", () => {
  const { coords, triangles } = cylinderGrid(8, 1, [12, 16]);
  coords[9].z += 4e-14;
  const mesh = radialVolume(
    { origin: [19, 0, 0], u: [0, 0, -1], v: [-1, 0, 0] },
    coords,
    triangles,
    () => 4,
  );
  assert.equal(mesh.vertices.length, coords.length + 2);
  validateMesh(mesh);
});
