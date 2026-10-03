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
  const bodies = materialize([], result);
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
    JSON.stringify({ bounds, bodyBounds, bodies: bodies.length }, null, 2),
  );
  console.log(
    JSON.stringify({ bounds, triangles: bodies.flatMap((b) => exportMesh(b).triangles).length }),
  );
} finally {
  kernel.close();
}
