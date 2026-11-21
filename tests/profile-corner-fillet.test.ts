import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import type { Segment, Sketch } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { coplanar } from "../src/sketch/planes.js";
import { finish, prism, square, vertical } from "./body-edge-fixtures.js";

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);

function assertStationaryPlanes(before: Body, after: Body) {
  for (const face of before.faces) {
    if (!face.plane) continue;
    const continued = after.faces.find(({ id }) => id === face.id)?.plane;
    assert.ok(continued && coplanar(face.plane, continued));
  }
  for (const [i, bound] of before.bounds.entries()) close(after.bounds[i], bound);
}

function setRadii(sketch: Sketch, side: Segment, low: number, high: number): Sketch {
  return { ...sketch, curves: [{ ...side, a: { ...side.a, x: low }, b: { ...side.b, x: high } }] };
}

test("Edit Profile replaces a partial corner fillet while retaining the surrounding extrusion", async () => {
  const owner = new DocumentOwner();
  try {
    const block = await prism(owner, square, 42);
    await finish(owner, block, [vertical(block, 20, 20)], 4);
    await call(owner, { kind: "accept" });
    const { data } = await call(owner, {
      kind: "open",
      document: { ...owner.view.data, sketches: [] },
    });
    const body = data.bodies?.[0];
    const wall = body?.faces.find((face) => face.cylinder);
    assert.ok(body && wall);
    const selection = { body: body.id, faces: [wall.id] };
    const open = async () =>
      (await call(owner, { kind: "begin-profile-edit", selection })).profileEdit;
    const entered = await open();
    const side = entered?.sketch.curves[0];
    assert.ok(entered?.endGuides && entered.region && entered.sketch.curves.length === 1);
    assert.ok(side?.kind === "segment");
    close(side.a.x, 4);
    close(side.b.x, 4);
    close(side.b.y - side.a.y, 42);
    assert.equal((await call(owner, { kind: "apply-profile-edit" })).data, data);

    for (const [low, high] of [
      [3, 3],
      [5, 5],
      [4, 4.75],
      [3.1, 4.8],
    ]) {
      const current = await open();
      assert.ok(current);
      const segment = current.sketch.curves[0];
      assert.ok(segment.kind === "segment");
      const drafted = await call(owner, {
        kind: "edit",
        sketch: setRadii(current.sketch, segment, low, high),
      });
      const preview = drafted.profileEdit?.preview;
      assert.ok(preview, drafted.profileEdit?.error);
      assert.equal(drafted.data, data);
      assertStationaryPlanes(body, preview);
      if (low === high)
        close(preview.faces.find((face) => face.id === wall.id)?.cylinder?.radius ?? 0, low);
      if (low === 3) close(body.volume - preview.volume, (7 * Math.PI * 42) / 4);
      if (low === 5) assert.equal(preview.faces.length, body.faces.length);
      assert.equal(Math.sign(preview.volume - body.volume), low < 4 ? -1 : 1);

      assert.equal((await call(owner, { kind: "apply-profile-edit" })).data.bodies?.[0], preview);
      const reopened = (await open())?.sketch.curves[0];
      assert.ok(reopened?.kind === "segment");
      close(reopened.a.x, low);
      close(reopened.b.x, high);
      await call(owner, { kind: "cancel-profile-edit" });
      const undone = await call(owner, { kind: "undo" });
      assert.equal(undone.data, data);
      assert.equal(undone.canUndo, false);
    }
  } finally {
    owner.close();
  }
});
