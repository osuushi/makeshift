import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { roundedFixture } from "./body-blend-fixtures.js";
import { lift } from "./body-edge-fixtures.js";

test("zero radius cannot consume a standalone cylinder or partially heal a multi-body edit", async () => {
  const owner = new DocumentOwner();
  try {
    await roundedFixture(owner, "convex");
    const rounded = owner.view.data.bodies?.[0];
    assert.ok(rounded);
    const blend = rounded.faces.find((face) => face.blend);
    assert.ok(blend);
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "circle",
          kind: "circle",
          center: { x: 40, y: 0 },
          radius: 8,
          construction: false,
        },
      ],
    });
    const side = cylinder.faces.find((face) => face.cylinder);
    assert.ok(side);
    const before = owner.view.data;
    const failed = await owner.call({
      kind: "offset-faces",
      operation: {
        faces: [
          { body: rounded.id, face: blend.id },
          { body: cylinder.id, face: side.id },
        ],
        distance: 2,
        radius: 0,
      },
    });
    assert.match(failed.error ?? "", /constant-radius fillet/);
    assert.equal(owner.view.data, before);
    const offset = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: cylinder.id, face: side.id }], distance: -8 },
    });
    assert.equal(offset.error, undefined);
    assert.ok((offset.view.offsetDistance ?? -8) > -8);
    const candidate = offset.view.candidate?.bodies?.find((body) => body.id === cylinder.id);
    assert.ok(candidate && candidate.volume > 0);
    assert.ok(candidate.faces.some((face) => face.cylinder));
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});
