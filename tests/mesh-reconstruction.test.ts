import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { torusFit } from "./mesh-fit-fixtures.js";
import { independentMesh } from "./mesh-import-fixtures.js";

const cases: [string, (p: Vector) => Vector, number][] = [
  ["sphere", (p) => p.map((v) => v * 10) as Vector, (4 * Math.PI * 1000) / 3],
  ["ellipsoid", ([x, y, z]) => [16 * x, 10 * y, 6 * z], (4 * Math.PI * 16 * 10 * 6) / 3],
  [
    "strong bend",
    ([x, y, z]) => [6 * x + 12 * z * z, 6 * y, 20 * z],
    (4 * Math.PI * 6 * 6 * 20) / 3,
  ],
  [
    "scaled rotated bend",
    ([x, y, z]) => {
      const a = 0.37,
        bx = 6 * x + 12 * z * z;
      return [
        100 + 2 * (bx * Math.cos(a) - 20 * z * Math.sin(a)),
        -20 + 12 * y,
        8 + 2 * (bx * Math.sin(a) + 20 * z * Math.cos(a)),
      ];
    },
    (8 * (4 * Math.PI * 6 * 6 * 20)) / 3,
  ],
  [
    "mildly noisy sphere",
    ([x, y, z]) => {
      const r = 10 + 0.02 * Math.sin(81 * x + 49 * y + 17 * z);
      return [r * x, r * y, r * z];
    },
    (4 * Math.PI * 1000) / 3,
  ],
  ["waist", ([x, y, z]) => [10 * x * (0.6 + z * z), 10 * y * (0.6 + z * z), 16 * z], 0],
];
for (const [name, map, volume] of cases)
  test(`automatic layout from independent tessellation: ${name}`, async () => {
    const kernel = new SolidCalculator(),
      mesh = independentMesh("ico", map);
    try {
      const result = await kernel.calculate({
        kind: "fit-mesh",
        bodies: [],
        mesh,
        tolerance: 0.2,
        maxPatches: 96,
      });
      assert.equal(result.results.length, 1);
      assert(result.fit.patches <= 96);
      assert(
        result.fit.sampledSurfaceToMesh <= 0.2 &&
          result.fit.sampledMeshToSurface <= 0.2 &&
          result.fit.sampledSeamAngle <= 5,
      );
      assert.equal(result.fit.vertexErrors?.length, mesh.vertices.length);
      assert(result.fit.vertexErrors?.every((v) => v >= 0 && v <= 0.2));
      if (volume) assert(Math.abs(result.results[0].volume / volume - 1) < 0.035);
    } finally {
      kernel.close();
    }
  });
test("automatic layout rejects a hole instead of changing topology", async () => {
  const kernel = new SolidCalculator();
  try {
    await assert.rejects(
      kernel.calculate({
        kind: "fit-mesh",
        bodies: [],
        mesh: torusFit().mesh,
        tolerance: 0.2,
        maxPatches: 96,
      }),
      /without holes/,
    );
  } finally {
    kernel.close();
  }
});
test("manual reconstruction remains temporary, accepts once, and preserves history on failure and cancel", async () => {
  const owner = new DocumentOwner(),
    mesh = independentMesh("uv"),
    initial = owner.view.data;
  const request = {
    kind: "reconstruct-mesh" as const,
    input: { mesh, tolerance: 0.2, maxPatches: 24 },
  };
  try {
    const preview = await owner.call(request);
    assert.equal(preview.error, undefined);
    assert.equal(owner.view.data, initial);
    assert(owner.view.candidate);
    assert(owner.view.meshFit);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.equal(accepted.bodies?.length, 1);
    const { sketch } = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 2, y: 2 });
    const sketchPreview = await owner.call({ kind: "preview", sketch });
    assert.equal(sketchPreview.error, undefined);
    assert.equal(
      sketchPreview.view.meshFit,
      undefined,
      "Unrelated previews must not expose stale mesh distances",
    );
    await owner.call({ kind: "cancel-preview" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, initial);
    assert(owner.view.canRedo);
    const failed = await owner.call({
      ...request,
      input: { ...request.input, mesh: { ...mesh, triangles: mesh.triangles.slice(1) } },
    });
    assert.match(failed.error ?? "", /closed manifold/);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.meshFit, undefined);
    assert(owner.view.canRedo);
    const running = owner.call(request);
    await owner.call({ kind: "cancel-preview" });
    await running;
    assert.deepEqual(owner.view.data, initial);
    assert.equal(owner.view.candidate, null);
    assert(owner.view.canRedo);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    const second = await owner.call(request);
    assert.equal(second.error, undefined);
    assert.equal(second.view.candidate?.bodies?.length, 2);
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "accept" });
    assert.equal(owner.view.data.bodies?.length, 2);
    assert.equal(owner.view.data.bodies?.[0].id, accepted.bodies?.[0].id);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});
