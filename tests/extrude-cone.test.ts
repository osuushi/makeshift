import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { ExtrusionDraft } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

async function disk(owner: DocumentOwner) {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", center: { x: 3, y: -4 }, radius: 10, construction: false },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  return { sketch: sketch.id, profile: profilesFor(sketch)[0].key };
}

test("circular draft reaches an exact analytic apex in either direction and measurement", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await disk(owner);
    const accepted = owner.view.data;
    for (const distance of [20, -20]) {
      for (const draft of [
        { mode: "offset", value: -10 },
        { mode: "angle", value: (Math.atan(-10 / 20) * 180) / Math.PI },
      ] as ExtrusionDraft[]) {
        const reply = await owner.call({
          kind: "extrude",
          extrusion: { sources: [source], distance, draft, mode: "new" },
        });
        assert.equal(reply.error, undefined);
        const body = reply.view.candidate?.bodies?.[0];
        assert.ok(body);
        close(body.volume, (Math.PI * 100 * 20) / 3);
        assert.equal(
          body.faces.length,
          2,
          "Only the base and conical wall remain; no tiny top cap",
        );
        const wall = body.faces.find((face) => face.cone)?.cone;
        assert.ok(wall, "Wall must remain an exact analytic cone");
        wall.apex.forEach((value, i) => {
          close(value, [3, -4, distance][i]);
        });
        const base = body.faces.find((face) => face.plane)?.plane;
        assert.ok(base);
        close(base.origin[2], 0);
        assert.deepEqual(reply.view.data, accepted);
      }
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const saved = owner.view.data;
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "redo" })).error, undefined);
    assert.deepEqual(owner.view.data, saved);
    assert.equal((await owner.call({ kind: "open", document: saved })).error, undefined);
    close(owner.view.data.bodies?.[0].volume ?? 0, (Math.PI * 100 * 20) / 3);
  } finally {
    owner.close();
  }
});

test("draft rejects beyond the apex without changing accepted geometry and recovers to a frustum", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await disk(owner);
    const accepted = owner.view.data;
    for (const value of [-10.000001, -11]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [source],
          distance: 20,
          draft: { mode: "offset", value },
          mode: "new",
        },
      });
      assert.ok(reply.error);
      assert.deepEqual(reply.view.data, accepted);
    }
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [source],
        distance: 20,
        draft: { mode: "offset", value: -9 },
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    const body = reply.view.candidate?.bodies?.[0];
    assert.ok(body);
    close(body.volume, (Math.PI * 20 * (100 + 10 + 1)) / 3);
    assert.equal(body.faces.length, 3);
  } finally {
    owner.close();
  }
});
