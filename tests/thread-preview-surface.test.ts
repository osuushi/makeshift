import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cross, dot, subtract } from "../src/decorators/cylinder.js";
import { decoratorPreview, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { Vector } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

for (const sloping of [false, true])
  test(`thread previews omit closing facets at ${sloping ? "sloping" : "axial"} ends`, async () => {
    const owner = new DocumentOwner();
    try {
      let body = await roundBody(owner, [8, 6]);
      if (sloping)
        body = await retainHalf(
          owner,
          body,
          { origin: [0, 0, 7], u: [1, 0, 0], v: [0, 0.8, 0.6] },
          (candidate) => candidate.center[2] < 5,
        );
      const face = body.faces.find((face) => face.cylinder?.outward === -1);
      assert.ok(face);
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
      const instance = owner.view.data.decorators?.[0];
      assert.ok(instance);
      const before = JSON.stringify(owner.view.data);
      const mesh = decoratorPreview(await initializeMeshRuntime(), owner.view.data, instance);
      assert.ok(mesh.triangles.length > 100, "Thread profile is still drawable");
      for (const cap of body.faces.filter((face) => face.plane)) {
        assert.ok(cap.plane);
        const normal = cross(cap.plane.u, cap.plane.v);
        const origin = cap.plane.origin;
        assert.ok(
          mesh.triangles.every((triangle) =>
            triangle.some(
              (index) =>
                Math.abs(dot(normal, subtract(mesh.vertices[index] as Vector, origin))) > 1e-7,
            ),
          ),
          "No displayed triangle lies on an adjacent end face",
        );
      }
      assert.deepEqual(instance.settings.start, 0);
      assert.deepEqual(instance.settings.end, 0);
      assert.equal(JSON.stringify(owner.view.data), before);
    } finally {
      owner.close();
    }
  });
