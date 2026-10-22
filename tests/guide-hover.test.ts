import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { guideCandidates } from "../src/guides/candidates.js";
import { hoverGuides } from "../src/guides/hover.js";
import { pickModel } from "../src/sketch/model-selection.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import type { Vector } from "../src/sketch/planes.js";
import { prism } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";

test("guide hover follows the ordinary face/edge hit without expanding a face into nearby edges", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
    const editor = pickingEditor([body]);
    Object.assign(editor, { modeling: new ModelSelection() });
    const probe = (point: Vector) => {
      const screen = editor.world.project(point);
      editor.modeling.hover = pickModel(editor, screen);
      return { guides: hoverGuides(editor, screen), hit: editor.modeling.hover };
    };
    const face = probe([2, 2, 10]);
    assert.deepEqual(face.guides, []);
    assert.ok(face.hit?.kind === "face");
    assert.ok(
      guideCandidates(editor.display, [face.hit]).length > 4,
      "explicit tool retains face boundary candidates",
    );
    const { guides: edge, hit } = probe([0, 2, 10]);
    assert.ok(hit?.kind === "edge");
    assert.equal(edge.length, 1);
    assert.ok(edge[0].anchor.kind === "body-edge");
    assert.equal(edge[0].anchor.edge, hit.edge);
    assert.equal(edge[0].anchor.feature, "midpoint");
    const { guides: corner } = probe([0, 0.6, 10]);
    assert.equal(corner.length, 1, "nearby endpoints and midpoint do not fire together");
    assert.equal(corner[0].anchor.kind, "body-junction");
    assert.deepEqual(corner[0].point, [0, 0, 10]);
    assert.deepEqual(probe([30, 30, 10]), { hit: null, guides: [] });
  } finally {
    owner.close();
  }
});
