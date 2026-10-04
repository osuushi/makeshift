import { readFileSync, writeFileSync } from "node:fs";
import { materialize } from "../../../src/backend/kernel-result.js";
import { SolidCalculator } from "../../../src/backend/solid-calculator.js";
import { exportMesh } from "../../../src/model/export-mesh.js";
import { exportBodies } from "../../../src/model/mesh-export.js";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw new Error("Usage: export <document.makeshift> <output.stl>");
const saved = JSON.parse(readFileSync(source, "utf8"));
if (saved.format !== "makeshift" || saved.version !== 1)
  throw new Error("Expected a Makeshift version 1 document");
const kernel = new SolidCalculator();
try {
  const result = await kernel.calculate({
    kind: "inspect",
    bodies: saved.document.bodies,
    deflection: 0.01,
  });
  const inspected = materialize([], result);
  const sourcePoints = inspected.flatMap((body) => body.faces.flatMap((face) => face.vertices));
  const zShift = -Math.min(...sourcePoints.filter((_, i) => i % 3 === 2));
  // A 1 nm export grid collapses numerical seam slivers. The unmodified closed/
  // oriented mesh validator still checks every body after rounding and bed placement.
  const precision = 1e-6;
  const bodies = inspected.map((body) => ({
    ...body,
    faces: body.faces.map((face) => ({
      ...face,
      vertices: face.vertices.map(
        (value, i) => Math.round((value + (i % 3 === 2 ? zShift : 0)) / precision) * precision,
      ),
    })),
  }));
  writeFileSync(output, exportBodies(bodies, "stl"));
  const meshes = bodies.map(exportMesh);
  const boundsFor = (vertices: number[][]) =>
    [0, 1, 2].map((axis) => [
      Math.min(...vertices.map((point) => point[axis])),
      Math.max(...vertices.map((point) => point[axis])),
    ]);
  const bounds = boundsFor(meshes.flatMap((mesh) => mesh.vertices));
  const bodyBounds = meshes.map((mesh) => boundsFor(mesh.vertices));
  writeFileSync(
    `${output}.json`,
    JSON.stringify(
      {
        bounds,
        bodyBounds,
        bodies: bodies.length,
        zShift,
        precision,
        bodyIds: bodies.map((body) => body.id),
        topTriangles: meshes.map((mesh, i) =>
          mesh.triangles.flatMap((triangle) => {
            const points = triangle.map((index) => mesh.vertices[index]);
            return points.every((point) => Math.abs(point[2] - bodyBounds[i][2][1]) < precision)
              ? [points.flatMap((point) => point.slice(0, 2))]
              : [];
          }),
        ),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ bounds, triangles: bodies.flatMap((b) => exportMesh(b).triangles).length }),
  );
} finally {
  kernel.close();
}
