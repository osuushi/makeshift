import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

async function erode(owner: DocumentOwner, body: Body, thickness: number, allowance = 0.1) {
  const before = owner.view.data;
  const result = await owner.call({
    kind: "erode",
    operation: { method: "accurate", ids: [body.id], thickness, allowance },
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.view.data, before);
  assert.deepEqual(
    result.view.candidate?.bodies?.find((b) => b.id === body.id),
    body,
  );
  const previous = new Set(before.bodies?.map((b) => b.id));
  return result.view.candidate?.bodies?.filter((b) => !previous.has(b.id)) ?? [];
}

test("erosion creates independent editable solids with an exact zero-allowance box result", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await prism(owner, square);
    const before = owner.view.data;
    const [cavity] = await erode(owner, original, 1, 0);
    assert.ok(cavity);
    assert.ok(Math.abs(cavity.volume - 18 * 18 * 8) < 1e-7);
    assert.equal(cavity.faces.length, 6);
    assert.ok(cavity.faces.every((face) => face.plane));
    assert.ok(cavity.faces.every((face) => !original.faces.some((f) => f.id === face.id)));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const face = cavity.faces.find((face) => face.plane?.origin[2] === 9);
    assert.ok(face);
    const offset = await owner.call({
      kind: "offset-faces",
      operation: {
        faces: [{ body: cavity.id, face: face.id }],
        distance: -0.2,
      },
    });
    assert.equal(offset.error, undefined);
    assert.equal(offset.view.offsetDistance, -0.2);
    await owner.call({ kind: "discard" });
    const rib = await prism(owner, [
      [9, -1],
      [11, -1],
      [11, 21],
      [9, 21],
    ]);
    const carved = await owner.call({
      kind: "boolean-bodies",
      operation: {
        ids: [cavity.id, rib.id],
        mode: "subtract",
        keepOriginals: false,
      },
    });
    assert.equal(carved.error, undefined);
    await owner.call({ kind: "accept" });
    const cavities = owner.view.data.bodies?.filter((body) => body.id !== original.id) ?? [];
    assert.equal(cavities.length, 2);
    const hollowed = await owner.call({
      kind: "boolean-bodies",
      operation: {
        ids: [original.id, ...cavities.map((body) => body.id)],
        mode: "subtract",
        keepOriginals: false,
      },
    });
    assert.equal(hollowed.error, undefined);
    assert.equal(hollowed.view.candidate?.bodies?.length, 1);
    assert.ok(
      Math.abs((hollowed.view.candidate?.bodies?.[0].volume ?? 0) - (4000 - 16 * 18 * 8)) < 1e-6,
    );
  } finally {
    owner.close();
  }
});

test("erosion keeps both disconnected cavities after a narrow neck disappears", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [10, 0],
      [10, 4],
      [20, 4],
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 6],
      [10, 6],
      [10, 10],
      [0, 10],
    ]);
    const connected = await erode(owner, body, 0.8, 0.2);
    assert.equal(connected.length, 1);
    await owner.call({ kind: "discard" });
    const split = await erode(owner, body, 1.2, 0.2);
    assert.equal(split.length, 2);
    assert.ok(Math.abs(split[0].volume - split[1].volume) < 1e-5);
    assert.ok(split.every((cavity) => cavity.volume > 7.6 ** 3));
    assert.ok(split.every((cavity) => cavity.faces.length < 20));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 3);
  } finally {
    owner.close();
  }
});

test("extra thickness simplifies a shallow protrusion while retaining the original", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 20],
      [14, 20],
      [14, 20.2],
      [6, 20.2],
      [6, 20],
      [0, 20],
    ]);
    const [accurate] = await erode(owner, body, 1, 0.05);
    assert.ok(accurate);
    assert.ok(accurate.faces.length > 6);
    await owner.call({ kind: "discard" });
    const [simple] = await erode(owner, body, 1, 0.5);
    assert.ok(simple);
    assert.equal(simple.faces.length, 6);
    assert.ok(simple.faces.every((face) => face.plane));
    assert.ok(Math.abs(simple.volume - 18 * 18 * 8) < 1e-6);
    assert.ok(simple.volume < accurate.volume);
  } finally {
    owner.close();
  }
});

test("verified disappearance is valid and invalid requests cannot reuse a stale cavity", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [2, 0],
      [2, 10],
      [0, 10],
    ]);
    assert.equal((await erode(owner, body, 1.2)).length, 0);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    await erode(owner, body, 0.4);
    for (const operation of [
      { ids: [body.id], thickness: -1, allowance: 0.1 },
      { ids: [body.id], thickness: 0.4, allowance: -1 },
      { ids: [body.id], thickness: NaN, allowance: 0.1 },
      { ids: [body.id, body.id], thickness: 0.4, allowance: 0.1 },
      { ids: ["missing"], thickness: 0.4, allowance: 0.1 },
    ]) {
      const rejected = await owner.call({
        kind: "erode",
        operation: { ...operation, method: "accurate" },
      });
      assert.ok(rejected.error);
      assert.equal(rejected.view.candidate, null);
      assert.deepEqual(rejected.view.data, before);
      assert.ok((await owner.call({ kind: "accept" })).error);
    }
  } finally {
    owner.close();
  }
});

test("script erosion creates ordinary copies atomically and invalid input preserves Redo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    owner.beginScript("cavity.ts");
    await owner.scripts.step({
      kind: "erode",
      input: { ids: [body.id], thickness: 1, allowance: 0, method: "accurate" },
    });
    assert.equal(owner.view.data, before);
    assert.equal(owner.scripts.finish(), true);
    const accepted = owner.view.data;
    assert.equal(accepted.bodies?.length, 2);
    assert.deepEqual(accepted.bodies[0], body);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    owner.beginScript("invalid-cavity.ts");
    await assert.rejects(() =>
      owner.scripts.step({
        kind: "erode",
        input: { ids: [body.id], thickness: 1, allowance: -1, method: "accurate" },
      }),
    );
    await owner.scripts.cancel();
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("erosion eliminates thin appendages and preserves simple cylindrical supports", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 9],
      [30, 9],
      [30, 11],
      [20, 11],
      [20, 20],
      [0, 20],
    ]);
    const [cavity] = await erode(owner, body, 1.2, 0.2);
    assert.ok(cavity);
    assert.ok(cavity.bounds[3] < 20);
    assert.ok(cavity.volume > 17.6 * 17.6 * 7.6);
    await owner.call({ kind: "discard" });
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 40, y: 0 }, radius: 8, construction: false },
      ],
    });
    const [round] = await erode(owner, cylinder, 1, 0.2);
    assert.ok(round);
    assert.equal(round.faces.length, 3);
    assert.ok(Math.abs(round.volume - Math.PI * 49 * 8) < 1e-6);
    assert.equal(round.faces.find((face) => face.cylinder)?.cylinder?.radius, 7);
  } finally {
    owner.close();
  }
});

test("erosion can replace originals, including a verified empty result, in one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await prism(owner, square);
    const before = owner.view.data;
    for (const thickness of [1, 6]) {
      const reply = await owner.call({
        kind: "erode",
        operation: {
          method: "accurate",
          ids: [source.id],
          thickness,
          allowance: 0.1,
          keepOriginals: false,
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.data, before);
      assert.equal(reply.view.candidate?.bodies?.length, thickness === 1 ? 1 : 0);
      assert.ok(!reply.view.candidate?.bodies?.some((body) => body.id === source.id));
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      await owner.call({ kind: "undo" });
    }
  } finally {
    owner.close();
  }
});
