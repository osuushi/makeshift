import { readFileSync, writeFileSync } from "node:fs";
import { materialize } from "../../../src/backend/kernel-result.js";
import { SolidCalculator } from "../../../src/backend/solid-calculator.js";
import { exportMesh, validateMesh } from "../../../src/model/export-mesh.js";
import { encodeMeshes } from "../../../src/model/mesh-export.js";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw new Error("Usage: export <document.makeshift> <output.3mf>");
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
  // Current fillets tessellate closed directly; preserve native coordinates.
  const precision = 0;
  const bodies = inspected.map((body) => ({
    ...body,
    faces: body.faces.map((face) => ({
      ...face,
      vertices: face.vertices.map((value, i) => value + (i % 3 === 2 ? zShift : 0)),
    })),
  }));
  const meshes = bodies.map(exportMesh);
  // Binary STL's float32 packing collapses a valid tiny fillet facet. 3MF retains
  // native coordinates. One object keeps the three validated solids in assembly
  // placement when Orca arranges the plate, rather than arranging them separately.
  let vertexOffset = 0;
  const triangles = meshes.flatMap((mesh) => {
    const shifted = mesh.triangles.map((triangle) => triangle.map((i) => i + vertexOffset));
    vertexOffset += mesh.vertices.length;
    return shifted;
  });
  const assembly = { vertices: meshes.flatMap((mesh) => mesh.vertices), triangles };
  validateMesh(assembly);
  writeFileSync(output, encodeMeshes([assembly], "3mf"));
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
            return points.every((point) => Math.abs(point[2] - bodyBounds[i][2][1]) < 1e-6)
              ? [points.flatMap((point) => point.slice(0, 2))]
              : [];
          }),
        ),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ bounds, triangles: triangles.length }));
} finally {
  kernel.close();
}
