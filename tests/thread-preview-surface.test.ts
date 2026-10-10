import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cross, dot, subtract } from "../src/decorators/cylinder.js";
import { decoratorPreview, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadPreviewPlanes } from "../src/decorators/thread-preview-surface.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { SketchDocument } from "../src/sketch/document.js";
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
          // The lower piece retains the original bottom; its box center can be z=5.
          (candidate) => Math.abs(candidate.bounds[2] - body.bounds[2]) < 1e-6,
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

test("captured tube previews contain only the actual male and female thread envelopes", async () => {
  const { document } = JSON.parse(
    await readFile("tests/fixtures/thread-preview-rim.json", "utf8"),
  ) as { document: SketchDocument };
  const runtime = await initializeMeshRuntime();
  const before = JSON.stringify(document);
  for (const instance of document.decorators ?? []) {
    const body = document.bodies?.[0];
    assert.ok(body);
    const faces = body.faces.filter((face) =>
      instance.faces.some((reference) => reference.face === face.id),
    );
    const boundaries = threadPreviewPlanes(faces, body.faces);
    assert.equal(boundaries.length, 2, "Both end faces bound the displayed profile");
    assert.ok(boundaries.every(({ normal, constant }) => dot(normal, [0, 0, 13]) + constant > 0));
    assert.ok(boundaries.some(({ normal, constant }) => dot(normal, [0, 0, 26]) + constant < 0));
    const mesh = decoratorPreview(runtime, document, instance);
    const internal = instance.settings.cut === "rod";
    const [low, high] = internal ? [7.24, 8.26] : [13.9, 15.01];
    assert.ok(mesh.triangles.length > 100);
    for (const triangle of mesh.triangles)
      for (const index of triangle) {
        const [x, y] = mesh.vertices[index];
        const radius = Math.hypot(x, y);
        assert.ok(radius >= low && radius <= high, `Auxiliary preview skin at radius ${radius}`);
      }
  }
  assert.equal(JSON.stringify(document), before);
});
