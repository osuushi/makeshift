import assert from "node:assert/strict";
import test from "node:test";
import type { BodyTransform } from "../src/model/body.js";
import { ErosionParameters } from "../src/model/erosion-parameters.js";
import { reopenBodyTransform } from "../src/model/reopen-body-transform.js";
import { reopenOperation } from "../src/sketch/reopen-operation.js";

const body: BodyTransform = {
  ids: ["b", "a"],
  pivot: [2, 3, 4],
  axis: [0, 0, 1],
  angle: 0,
  translation: [0, 7, 0],
  duplicate: true,
};
test("ordinary body gestures hydrate canonical axes while composites fail eligibility before rollback", () => {
  assert.deepEqual(reopenBodyTransform(body), { axis: "Y", value: 7, rotate: false });
  assert.deepEqual(reopenBodyTransform({ ...body, translation: [0, 0, 0], angle: -30 }), {
    axis: "Z",
    value: -30,
    rotate: true,
  });
  assert.deepEqual(
    reopenBodyTransform({ ...body, translation: [0, 0, 0], axis: [0, 0, -1], angle: 30 }),
    { axis: "Z", value: -30, rotate: true },
  );
  for (const transform of [
    { ...body, translation: [1, 2, 0] as [number, number, number] },
    { ...body, angle: 2 },
  ]) {
    assert.equal(reopenBodyTransform(transform), null);
    assert.equal(
      reopenOperation({ kind: "transform-bodies", parameters: { transform } }),
      undefined,
    );
  }
});
test("erosion reentry restores active options including zero allowance and uses canonical inactive defaults", () => {
  const values = new ErosionParameters();
  for (const allowance of [0, 0.625]) {
    const operation = {
      ids: ["input"],
      thickness: 2.5,
      method: "accurate" as const,
      allowance,
      keepOriginals: false,
    };
    values.restore(operation);
    assert.deepEqual(values.operation(operation.ids), operation);
    assert.equal(values.meshDetail, "standard");
    assert.equal(values.maxFaces, 128);
  }
  const operation = {
    ids: ["input"],
    thickness: 2.5,
    method: "fast" as const,
    meshDetail: "fine" as const,
    maxFaces: 96,
    keepOriginals: true,
  };
  values.restore(operation);
  assert.deepEqual(values.operation(operation.ids), operation);
  assert.equal(values.allowancePercent, 50);
});
test("unsupported gesture ancestry and summarized imports block reentry; construction plane frame is copied exactly", () => {
  for (const kind of [
    "place-sketch",
    "reconstruct-mesh",
    "script",
    "rename-entity",
    "preview",
  ] as const)
    assert.equal(reopenOperation({ kind, parameters: {} }), undefined);
  const plane = { id: "stable", frame: { origin: [2, 3, 4], u: [1, 0, 0], v: [0, 1, 0] } };
  const reopened = reopenOperation({ kind: "construction-plane", parameters: { plane } });
  assert.ok(reopened && reopened.request.kind === "construction-plane");
  assert.deepEqual(reopened.request.plane, plane);
  reopened.request.plane.frame.origin[0] = 999;
  assert.equal(plane.frame.origin[0], 2);
});
