import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  decoratorLivePreview,
  decoratorPreview,
  initializeMeshRuntime,
} from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { placedDocument } from "../src/model/body-placement.js";
import type { ExportMesh } from "../src/model/export-mesh.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("rigid operation previews move, rotate and copy their thread geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [5], 10);
    const face = body.faces.find((f) => f.cylinder);
    assert.ok(face?.cylinder);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: [{ body: body.id, face: face.id }],
          },
        })
      ).error,
      undefined,
    );
    const original = owner.view.data;
    const runtime = await initializeMeshRuntime();
    const instance = original.decorators?.[0];
    assert.ok(instance);
    const originalMesh = decoratorPreview(runtime, original, instance);
    assertAdaptiveResolution(runtime, original, instance, originalMesh.triangles.length);
    const edit = {
      ids: [body.id],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
      translation: [12, 3, 0] as [number, number, number],
      duplicate: false,
    };
    const moved = placedDocument(original, edit);
    assert.ok(moved.bodies?.every((preview) => !("brep" in preview)));
    assert.ok(original.bodies?.every((accepted) => typeof accepted.brep === "string"));
    const movedFace = moved.bodies?.[0].faces.find((f) => f.id === face.id);
    assert.ok(movedFace?.cylinder);
    assert.equal(movedFace.cylinder.origin[0] - face.cylinder.origin[0], 12);
    assert.equal(movedFace.cylinder.origin[1] - face.cylinder.origin[1], 3);
    assert.equal(moved.decorators?.[0].problem, undefined);
    assert.deepEqual(moved.decorators?.[0].frame.origin, [12, 3, 0]);
    const movedInstance = moved.decorators?.[0];
    assert.ok(movedInstance);
    const movedMesh = decoratorPreview(runtime, moved, movedInstance);
    assertTranslatedSurface(movedMesh, originalMesh, edit.translation);
    const rotated = placedDocument(original, {
      ...edit,
      axis: [1, 0, 0],
      angle: 90,
    });
    assert.equal(rotated.decorators?.[0].problem, undefined);
    assert.ok(
      Math.abs(rotated.bodies?.[0].faces.find((f) => f.id === face.id)?.cylinder?.axis[1] ?? 0) >
        0.99,
    );
    const rotatedInstance = rotated.decorators?.[0];
    assert.ok(rotatedInstance);
    assert.ok(decoratorPreview(runtime, rotated, rotatedInstance).triangles.length);
    const duplicated = placedDocument(original, { ...edit, duplicate: true });
    assert.equal(duplicated.bodies?.length, 2);
    assert.equal(duplicated.bodies[0], body, "Retained exact geometry is still the source object");
    assert.equal("brep" in duplicated.bodies[1], false, "A temporary copy has no exact shape");
    assert.equal(duplicated.decorators?.length, 2);
    assert.equal(duplicated.decorators[0].id, original.decorators?.[0].id);
    assert.equal(duplicated.decorators[0].faces[0].body, body.id);
    assert.equal(duplicated.decorators[1].faces[0].body, `copy-preview/${body.id}`);
    assert.equal(duplicated.decorators[1].problem, undefined);
    assert.ok(decoratorPreview(runtime, duplicated, duplicated.decorators[1]).triangles.length);
    assert.equal(owner.view.data, original);
    const rejected = await owner.call({
      kind: "open",
      document: JSON.parse(JSON.stringify(moved)),
    });
    assert.ok(rejected.error, "Serialized presentation cannot replace accepted exact geometry");
    assert.equal(owner.view.data, original);
  } finally {
    owner.close();
  }
});

function assertAdaptiveResolution(
  runtime: Parameters<typeof decoratorPreview>[0],
  document: Parameters<typeof decoratorPreview>[1],
  instance: Parameters<typeof decoratorPreview>[2],
  originalTriangles: number,
): void {
  const firstLive = decoratorLivePreview(runtime, document, instance, {
    targetMs: 100,
    history: [],
  });
  assert.ok(firstLive.state);
  const higher = decoratorLivePreview(runtime, document, instance, {
    targetMs: 100,
    history: [{ durationMs: 25, state: { segments: 20, samples: 10 } }],
  });
  assert.ok(higher.state);
  const adaptive = decoratorLivePreview(runtime, document, instance, {
    targetMs: 100,
    history: [{ durationMs: 400, state: higher.state }],
  });
  assert.ok(adaptive.state);
  assert.ok(firstLive.mesh.triangles.length < originalTriangles);
  assert.ok(adaptive.state.segments < higher.state.segments);
  assert.ok(adaptive.state.samples < higher.state.samples);
  assert.ok(adaptive.mesh.triangles.length < higher.mesh.triangles.length);
  assert.equal(decoratorPreview(runtime, document, instance).triangles.length, originalTriangles);
}

/** Boolean output may reorder vertices; compare geometry rather than renderer indexes. */
function assertTranslatedSurface(actual: ExportMesh, expected: ExportMesh, translation: number[]) {
  const tolerance = 1e-4;
  const cells = new Map<string, number[][]>();
  for (const point of expected.vertices) {
    const key = point.map((value) => Math.round(value / tolerance)).join(",");
    const points = cells.get(key) ?? [];
    points.push(point);
    cells.set(key, points);
  }
  assert.equal(actual.vertices.length, expected.vertices.length);
  for (const point of actual.vertices) {
    const local = point.map((value, axis) => value - translation[axis]);
    const cell = local.map((value) => Math.round(value / tolerance));
    let matched = false;
    for (let x = -1; x <= 1 && !matched; x++)
      for (let y = -1; y <= 1 && !matched; y++)
        for (let z = -1; z <= 1 && !matched; z++)
          matched = (cells.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) ?? []).some(
            (candidate) =>
              Math.hypot(...candidate.map((value, axis) => value - local[axis])) < tolerance,
          );
    assert.ok(matched, `Translated preview vertex has no source counterpart: ${point}`);
  }
}
