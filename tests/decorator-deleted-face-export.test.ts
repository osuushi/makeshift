import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exportGeometry } from "../src/backend/export-geometry.js";
import { MeshCalculator } from "../src/backend/mesh-calculator.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { nativeDecoratedMeshes } from "../src/decorators/native-export.js";
import { exportMesh, validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/thread-deleted-face.json", "utf8")) as {
  document: SketchDocument;
};

test("captured deleted-face threads export through native and portable mesh paths", async () => {
  const kernel = new SolidCalculator(),
    calculator = new MeshCalculator();
  const before = structuredClone(fixture.document);
  try {
    // Preserve captured descriptors; opening first regenerates them and can
    // change the floating-point case that failed in the editing session.
    const document = await exportGeometry(fixture.document, kernel);
    const prepared = structuredClone(document);
    const runtime = await initializeMeshRuntime();
    for (const rounded of [false, true]) {
      // Sub-modeling-tolerance variation exercises a float-collapse failure
      // without depending on the platform's exact cylinder tessellation.
      const input = {
        ...document,
        bodies: document.bodies?.map((body) => ({
          ...body,
          faces: body.faces.map((face) => ({
            ...face,
            vertices: rounded ? face.vertices.map((v) => +v.toFixed(7)) : face.vertices,
          })),
        })),
      };
      for (const body of input.bodies ?? []) validateMesh(exportMesh(body));
      const native = await nativeDecoratedMeshes(input, (bytes) => calculator.calculate(bytes));
      const portable = decoratedMeshes(runtime, input);
      for (const meshes of [native, portable]) {
        assert.equal(meshes.length, 1);
        validateMesh(meshes[0]);
        for (const format of ["stl", "3mf"] as const)
          assert.ok(encodeMeshes(meshes, format).length > 1000);
      }
    }
    assert.deepEqual(document, prepared);
    assert.deepEqual(fixture.document, before);
  } finally {
    kernel.close();
    await calculator.cancel();
  }
});
