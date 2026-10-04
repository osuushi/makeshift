import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyErosion } from "../src/model/body.js";
import { planes } from "../src/sketch/planes.js";
import { box, combine, cylinder, sphere } from "./erosion-special-primitives.js";

test("Remesh is the default, recovers planar boxes, and Analytic supports zero allowance", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await box(owner, [0, 0, 0], [20, 20, 10]);
    const before = owner.view.data;
    const operation = { ids: [source.id], thickness: 1 };
    const fast = await owner.call({ kind: "erode", operation });
    assert.equal(fast.error, undefined);
    assert.equal(owner.view.data, before);
    const body = fast.view.candidate?.bodies?.find((b) => b.id !== source.id);
    assert(body && body.faces.length === 6 && body.faces.every((face) => face.plane));
    assert(Math.abs(body.volume - 18 ** 2 * 8) < 1e-6);
    assert.equal(fast.view.erosionQuality?.[0].faces, 6);
    assert.equal(fast.view.erosionQuality?.[0].sampledMinThickness, 1);
    assert.equal(fast.view.erosionQuality?.[0].sampledMaxThickness, 1);

    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    assert.equal(owner.view.erosionQuality, undefined);
    assert(!JSON.stringify(accepted).includes("sampledMinThickness"));
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    const invalid = await owner.call({
      kind: "erode",
      operation: { ...operation, method: "unknown" as BodyErosion["method"] },
    });
    assert.match(invalid.error ?? "", /Remesh or Analytic/);
    assert.equal(invalid.view.candidate, null);
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    await owner.call({ kind: "open", document: before });
    const zero = await owner.call({ kind: "erode", operation: { ...operation, allowance: 0 } });
    assert.equal(zero.error, undefined);
    assert.equal(zero.view.candidate?.bodies?.[1].volume, body.volume);
    const accurate = await owner.call({
      kind: "erode",
      operation: { ...operation, allowance: 0, method: "accurate" },
    });
    assert.equal(accurate.error, undefined);
    assert(Math.abs((accurate.view.candidate?.bodies?.[1].volume ?? 0) - 18 ** 2 * 8) < 1e-6);
  } finally {
    owner.close();
  }
});

test("Remesh reports empty sampled interiors and can replace a collapsed body with one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await box(owner, [0, 0, 0], [2, 2, 2]);
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 2, allowance: 1, keepOriginals: false },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.bodies?.length, 0);
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "accept" });
    assert.equal(owner.view.data.bodies?.length, 0);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("Remesh keeps both analytic interiors when a modeled connector disappears", async () => {
  const owner = new DocumentOwner();
  try {
    const left = await sphere(owner, 6, [-8, 0, 0]);
    const right = await sphere(owner, 6, [8, 0, 0]);
    const neck = await cylinder(owner, 1, 16, { ...planes.YZ, origin: [-8, 0, 0] });
    const source = await combine(owner, [left, right, neck], "union");
    assert.equal(owner.view.data.bodies?.length, 1);
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 1.5, allowance: 0.8, method: "fast" },
    });
    assert.equal(reply.error, undefined);
    const pieces = reply.view.candidate?.bodies?.filter((body) => body.id !== source.id);
    assert(pieces && pieces.length === 2);
    for (const body of pieces) {
      assert.equal(body.faces.length, 1);
      const radius = body.faces[0].sphere?.radius;
      assert(radius && Math.abs(radius - 4.5) < 0.1);
      assert(Math.abs(body.volume - (4 * Math.PI * radius ** 3) / 3) < 1e-5);
    }
    assert(pieces.some((body) => body.center[0] < -7));
    assert(pieces.some((body) => body.center[0] > 7));
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.map((body) => body.id),
      accepted.bodies?.map((body) => body.id),
    );
  } finally {
    owner.close();
  }
});
