import assert from "node:assert/strict";
import test from "node:test";
import type { MeshFitResult, SketchResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sharpBox, sphereFit } from "./mesh-fit-fixtures.js";

test("fitted solid accepts once, retains identities on reopen, moves and participates in a Boolean", async () => {
  const owner = new DocumentOwner();
  try {
    const original = owner.view.data;
    owner.beginScript("mesh-fit.ts");
    const fit = (await owner.scripts.step({ kind: "fitMesh", input: sharpBox() })) as MeshFitResult;
    assert.equal(fit.fit.patches, 6);
    assert.equal(owner.view.data, original);
    assert.match((await owner.call({ kind: "new" })).error ?? "", /running script/);
    assert(owner.scripts.finish());
    const accepted = owner.view.data,
      body = accepted.bodies?.[0];
    assert(body);
    assert.equal(body.faces.length, 6);
    assert(
      body.faces.every((f) => f.plane),
      "Planar reconstructed faces remain usable as sketch/extrusion supports",
    );
    assert(Math.abs(body.volume - 8000) < 1e-6);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal(
      (await owner.call({ kind: "open", document: structuredClone(accepted) })).error,
      undefined,
    );
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      body.faces.map((f) => f.id),
    );
    owner.beginScript("continued-edit.ts");
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [body.id],
        translation: [30, 0, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        duplicate: false,
      },
    });
    const sketch = (await owner.scripts.step({
      kind: "createSketch",
      input: { plane: "XY", curves: [{ kind: "circle", center: { x: 30, y: 0 }, radius: 3 }] },
    })) as SketchResult;
    await owner.scripts.step({
      kind: "extrude",
      input: {
        sources: sketch.profiles,
        distance: 20,
        symmetric: true,
        mode: "subtract",
        targets: [body.id],
      },
    });
    owner.scripts.finish();
    const drilled = owner.view.data.bodies?.[0];
    assert(drilled);
    assert(Math.abs(drilled.volume - (8000 - Math.PI * 9 * 20)) < 1e-4);
    assert(Math.abs(drilled.center[0] - 30) < 1e-5);
    await owner.call({ kind: "undo" });
    assert(Math.abs((owner.view.data.bodies?.[0].volume ?? NaN) - 8000) < 1e-6);
  } finally {
    owner.close();
  }
});

test("a fitted freeform body reopens, can be duplicated and scaled, and preserves the existing body", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("existing.ts");
    await owner.scripts.step({ kind: "fitMesh", input: sharpBox() });
    owner.scripts.finish();
    const existing = owner.view.data.bodies?.[0];
    assert(existing);
    owner.beginScript("sphere.ts");
    const result = (await owner.scripts.step({
      kind: "fitMesh",
      input: sphereFit(),
    })) as MeshFitResult;
    assert.equal(result.bodies.length, 2);
    owner.scripts.finish();
    const accepted = owner.view.data,
      sphere = accepted.bodies?.[1];
    assert(sphere);
    assert.equal(accepted.bodies?.[0], existing);
    assert.equal(
      new Set(
        accepted.bodies?.flatMap((b) => [
          b.id,
          ...b.faces.map((f) => f.id),
          ...b.edges.map((e) => e.id),
        ]),
      ).size,
      accepted.bodies?.reduce((sum, b) => sum + 1 + b.faces.length + b.edges.length, 0),
    );
    assert.equal(
      (await owner.call({ kind: "open", document: structuredClone(accepted) })).error,
      undefined,
    );
    owner.beginScript("scale.ts");
    await owner.scripts.step({
      kind: "scale",
      input: {
        kind: "solids",
        ids: [sphere.id],
        faces: [],
        edges: [],
        pivot: [0, 0, 0],
        factor: 2,
      },
    });
    await owner.scripts.step({
      kind: "transformBodies",
      input: {
        ids: [sphere.id],
        translation: [50, 0, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 30,
        duplicate: true,
      },
    });
    owner.scripts.finish();
    const bodies = owner.view.data.bodies;
    assert(bodies && bodies.length === 3);
    assert(Math.abs(bodies[1].volume / sphere.volume - 8) < 1e-6);
    assert(Math.abs(bodies[2].volume / sphere.volume - 8) < 1e-6);
    assert.deepEqual(bodies[0], existing);
  } finally {
    owner.close();
  }
});

test("fitting cancellation and rejected tolerance preserve accepted geometry and Redo", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("first.ts");
    await owner.scripts.step({ kind: "fitMesh", input: sharpBox() });
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    owner.beginScript("cancelled.ts");
    const pending = owner.scripts.step({ kind: "fitMesh", input: sphereFit() });
    const rejected = assert.rejects(pending, /cancelled/);
    await owner.scripts.cancel();
    await rejected;
    assert.equal(owner.view.data, original);
    assert(owner.view.canRedo);
    owner.beginScript("failed.ts");
    await owner.scripts.step({ kind: "fitMesh", input: sharpBox() });
    await assert.rejects(
      owner.scripts.step({
        kind: "fitMesh",
        input: { ...sphereFit(), tolerance: 1e-5, maxPatches: 6 },
      }),
      /exceeds requested tolerance/,
    );
    await owner.scripts.cancel("Requested fit tolerance could not be met");
    assert.equal(owner.view.data, original);
    assert(owner.view.canRedo);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data.bodies?.length, 1);
  } finally {
    owner.close();
  }
});
