import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyErosion } from "../src/model/body.js";
import { box } from "./erosion-special-primitives.js";

test("Fast mesh detail changes sampling, ignores old allowance, and validates its own budget", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await box(owner, [0, 0, 0], [20, 20, 10]);
    const settings: BodyErosion = { ids: [source.id], thickness: 1, maxFaces: 32 };
    const reports = [];
    for (const meshDetail of ["coarse", "standard", "fine"] as const) {
      const reply = await owner.call({ kind: "erode", operation: { ...settings, meshDetail } });
      assert.equal(reply.error, undefined);
      const quality = reply.view.erosionQuality?.[0];
      assert(quality && quality.samples > 0);
      assert.equal(quality.faces, 6);
      reports.push(quality);
    }
    assert(reports[0].spacing > reports[1].spacing && reports[1].spacing > reports[2].spacing);
    assert(
      reports[0].triangles < reports[1].triangles && reports[1].triangles < reports[2].triangles,
    );
    const shallow = await owner.call({
      kind: "erode",
      operation: { ...settings, thickness: 0.25 },
    });
    assert.equal(shallow.error, undefined);
    assert((shallow.view.erosionQuality?.[0].spacing ?? Infinity) < reports[1].spacing);
    for (const allowance of [0, 100]) {
      const reply = await owner.call({ kind: "erode", operation: { ...settings, allowance } });
      assert.equal(reply.error, undefined);
      assert.deepEqual(reply.view.erosionQuality?.[0], reports[1]);
    }
    for (const invalid of [
      { maxFaces: 31 },
      { maxFaces: 257 },
      { maxFaces: 32.5 },
      { meshDetail: "invalid" as BodyErosion["meshDetail"] },
    ]) {
      const reply = await owner.call({ kind: "erode", operation: { ...settings, ...invalid } });
      assert.match(reply.error ?? "", /mesh detail|face budget/);
      assert.equal(reply.view.candidate, null);
      assert.equal(reply.view.erosionQuality, undefined);
    }
    const accurate = await owner.call({
      kind: "erode",
      operation: { ...settings, method: "accurate", allowance: 0, maxFaces: 1 },
    });
    assert.equal(accurate.error, undefined);
    assert.equal(accurate.view.erosionQuality, undefined);
    assert(Math.abs((accurate.view.candidate?.bodies?.[1].volume ?? 0) - 2592) < 1e-6);
  } finally {
    owner.close();
  }
});

test("script Fast erosion accepts conversion settings without an allowance and keeps one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await box(owner, [0, 0, 0], [20, 20, 10]);
    const before = owner.view.data;
    owner.beginScript("fast-interior.ts");
    await owner.scripts.step({
      kind: "erode",
      input: { ids: [source.id], thickness: 1, meshDetail: "fine", maxFaces: 32 },
    });
    assert.equal(owner.view.data, before);
    assert.equal(owner.scripts.finish(), true);
    const accepted = owner.view.data;
    assert.equal(accepted.bodies?.length, 2);
    assert(Math.abs((accepted.bodies?.[1].volume ?? 0) - 2592) < 1e-6);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal(owner.view.erosionQuality, undefined);
  } finally {
    owner.close();
  }
});
