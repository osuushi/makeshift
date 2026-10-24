import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cross, cylinderCoordinates, dot, subtract } from "../src/decorators/cylinder.js";
import { prepareThreadGeometry } from "../src/decorators/export-body.js";
import {
  decoratedMeshes,
  decoratorPreview,
  initializeMeshRuntime,
} from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import { threadPreviewFaces } from "../src/decorators/thread-preview-surface.js";
import { threadSettings } from "../src/decorators/thread-settings.js";
import { exportMesh, validateMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { prism } from "./body-edge-fixtures.js";
import { retainHalf, roundBody, threadedExport } from "./decorator-domain-fixtures.js";

for (const offset of [4, 5.2])
  test(`cutting threads into a rod flattened at ${offset} mm equals flattening the finished thread`, async () => {
    const owner = new DocumentOwner();
    const scope = new MeshScope(await initializeMeshRuntime());
    try {
      const rod = await roundBody(owner, [5.5]);
      const full = scope.from(await threadedExport(owner, rod, 5.5, "rod"));
      await retainHalf(
        owner,
        rod,
        { ...planes.YZ, origin: [offset, 0, 0] },
        (b) => b.center[0] < offset,
      );
      const prepared = await owner.call({ kind: "export-geometry" });
      assert.ok(prepared.exportDocument, prepared.error);
      const actual = scope.from(decoratedMeshes(scope.runtime, prepared.exportDocument)[0]);
      const expected = scope.keep(full.trimByPlane([-1, 0, 0], -offset));
      const excess = scope.keep(actual.subtract(expected)).volume();
      const missing = scope.keep(expected.subtract(actual)).volume();
      assert.ok(excess + missing < 0.001, `Symmetric difference ${excess + missing} mm³`);
    } finally {
      scope.close();
      owner.close();
    }
  });

test("a threaded cylindrical ridge leaves its supporting block intact", async () => {
  const owner = new DocumentOwner();
  const scope = new MeshScope(await initializeMeshRuntime());
  try {
    const rod = await roundBody(owner, [5.5]);
    const block = await prism(owner, [
      [-8, -8],
      [8, -8],
      [8, 0],
      [-8, 0],
    ]);
    assert.equal(
      (
        await owner.call({
          kind: "boolean-bodies",
          operation: {
            ids: [rod.id, block.id],
            mode: "union",
            keepOriginals: false,
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const actual = scope.from(await threadedExport(owner, body, 5.5, "rod"));
    const support = scope.from(exportMesh(block));
    assert.ok(
      scope.keep(support.subtract(actual)).volume() < 0.00001,
      "No buried grooves in the block",
    );
    const before = scope.from(exportMesh(body));
    const removed = scope.keep(before.subtract(actual));
    assert.ok(removed.volume() > 10, "The exposed ridge really is threaded");
    assert.ok(removed.boundingBox().min[1] > -0.00001, "Removal stops at the support plane");
  } finally {
    scope.close();
    owner.close();
  }
});

// Focused rod/decorator from the founder's 2026-10-24 Capture fixture.
test("captured tilted rod notches its flat in export and preview", async () => {
  const { document } = JSON.parse(
    readFileSync("tests/fixtures/thread-flat-boundary.json", "utf8"),
  ) as { document: SketchDocument };
  const owner = new DocumentOwner();
  const runtime = await initializeMeshRuntime();
  try {
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const result = await owner.call({ kind: "export-geometry" });
    assert.ok(result.exportDocument, result.error);
    const instance = result.exportDocument.decorators?.[0];
    assert.ok(instance);
    const prepared = prepareThreadGeometry(result.exportDocument, instance, "export");
    assert.ok(prepared);
    const flat = prepared.body.faces.find(
      (face) => face.id === "5f0f6107-e957-4888-87c7-2bc04ee5bceb",
    );
    assert.ok(flat?.plane);
    const flatOrigin = flat.plane.origin;
    const normal = cross(flat.plane.u, flat.plane.v);
    const settings = threadSettings(instance.settings);
    const before = JSON.stringify(owner.view.data);
    const mesh = decoratedMeshes(runtime, result.exportDocument)[0];
    validateMesh(mesh);
    let notches = 0;
    for (const index of new Set(mesh.triangles.flat())) {
      const point = mesh.vertices[index];
      if (Math.abs(dot(normal, subtract(point as Vector, flat.plane.origin))) > 1e-5) continue;
      const { angle, z } = cylinderCoordinates(instance.frame, point as Vector);
      const delta = subtract(point as Vector, instance.frame.origin);
      const radius = Math.hypot(dot(delta, instance.frame.u), dot(delta, instance.frame.v));
      // Ignore end rims and the mounting flange; inspect the middle of the rod.
      if (Math.abs(z) > 25 || radius < 4.49) continue;
      const target = threadRadius(5.5, angle, z, settings, 1, [-35, 35]);
      assert.ok(
        radius <= target + 0.005,
        `Uncut flat material at radius ${radius}, target ${target}`,
      );
      if (radius < 5.3) notches++;
    }
    assert.ok(notches > 20, "Flat contains the groove intersections");
    const preview = decoratorPreview(runtime, owner.view.data, instance);
    assert.ok(threadPreviewFaces(owner.view.data, instance).some((face) => face.face === flat.id));
    assert.equal(instance.faces.length, 1, "Display support does not expand decorator membership");
    const touching = preview.triangles
      .flat()
      .filter(
        (i) => Math.abs(dot(normal, subtract(preview.vertices[i] as Vector, flatOrigin))) < 1e-5,
      );
    assert.ok(touching.length > 20, "Visible thread surface reaches the flat");
    assert.equal(
      JSON.stringify(owner.view.data),
      before,
      "Generation does not edit accepted geometry",
    );
  } finally {
    owner.close();
  }
});
