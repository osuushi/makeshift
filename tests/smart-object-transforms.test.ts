import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  affinePoint,
  identityAffine,
  scaleAffine,
  translationAffine,
} from "../src/model/affine.js";
import type { BodyTransform } from "../src/model/body.js";
import type { MirrorOperation } from "../src/model/mirror.js";
import type { ScaleOperation } from "../src/model/scale.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import type { ModelRequest, ModelView } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

async function extrudeFixture(apply: (request: ModelRequest) => Promise<ModelView>): Promise<void> {
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 8, y: 6 }).sketch;
  await apply({ kind: "edit", sketch });
  await apply({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 4,
      mode: "new",
    },
  });
  await apply({ kind: "accept" });
}

test("ordinary model transforms publish linked placements and exact solids together", async () => {
  const owner = new DocumentOwner();
  const apply = async (request: ModelRequest) => {
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    return reply.view;
  };
  try {
    const source = owner.drawing.activeBench;
    await apply({ kind: "bench", edit: { action: "create" } });
    await extrudeFixture(apply);
    const before = (await apply({ kind: "smart-object", edit: { action: "insert", source } })).data;
    const body = before.bodies?.[0],
      object = before.smartObjects?.[0];
    assert.ok(body && object);

    const selected = { ids: [body.id], smartObjectIds: [object.id] };
    const transform: BodyTransform = {
      ...selected,
      pivot: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 0,
      translation: [12, 0, 0],
      duplicate: false,
    };
    const rejected = await owner.call({
      kind: "transform-bodies",
      transform: { ...transform, ids: ["missing"] },
    });
    assert.ok(rejected.error);
    assert.equal(owner.view.data, before);
    const moved = (await apply({ kind: "transform-bodies", transform })).data;
    assert.deepEqual(moved.smartObjects?.[0].transform, translationAffine(transform.translation));
    assert.ok(Math.abs((moved.bodies?.[0].center[0] ?? 0) - body.center[0] - 12) < 1e-6);
    await apply({ kind: "undo" });
    assert.deepEqual(owner.view.data.smartObjects?.[0].transform, identityAffine);
    assert.equal(owner.view.data.bodies?.[0], body);
    await apply({ kind: "redo" });
    assert.equal(owner.view.data, moved);

    const scaling: ScaleOperation = {
      kind: "solids",
      ...selected,
      faces: [],
      edges: [],
      factors: [2, 1, 1],
      pivot: [1, 0, 0],
      factor: 1,
    };
    const preview = await apply({ kind: "scale", operation: scaling });
    assert.equal(preview.data, moved);
    const candidate = preview.candidate?.smartObjects?.[0].transform;
    assert.ok(candidate);
    assert.deepEqual(
      affinePoint(candidate, [0, 0, 0]),
      affinePoint(scaleAffine([2, 1, 1], [1, 0, 0]), [12, 0, 0]),
    );
    await apply({ kind: "discard" });
    assert.equal(owner.view.data, moved);
    assert.equal(owner.view.candidate, null);
    await apply({ kind: "scale", operation: scaling });
    const scaled = (await apply({ kind: "accept" })).data;
    assert.ok(Math.abs((scaled.bodies?.[0].volume ?? 0) - 2 * body.volume) < 1e-6);
    assert.deepEqual(scaled.smartObjects?.[0].transform, candidate);

    const mirror: MirrorOperation = {
      kind: "bodies",
      ...selected,
      keepOriginal: true,
      plane: { origin: [0, 0, 0], normal: [1, 0, 0] },
    };
    await apply({ kind: "mirror", operation: mirror });
    const reflected = (await apply({ kind: "accept" })).data;
    assert.equal(reflected.bodies?.length, 2);
    assert.equal(reflected.smartObjects?.length, 2);
    assert.equal(reflected.smartObjects?.[1].source, source);
    assert.notEqual(reflected.smartObjects?.[1].id, object.id);
    assert.deepEqual(affinePoint(reflected.smartObjects[1].transform, [0, 0, 0]), [-23, 0, 0]);
    await apply({ kind: "undo" });
    assert.equal(owner.view.data, scaled);
  } finally {
    owner.close();
  }
});
