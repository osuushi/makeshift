import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { hoveredCandidates } from "../src/guides/discovery-sources.js";
import { hoverGuides } from "../src/guides/hover.js";
import { guideKey } from "../src/guides/types.js";
import { pickModel } from "../src/sketch/model-selection.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { prism } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";

test("selected off-face centroid obeys pointer range without mutating hover", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [60, 0],
      [60, 10],
      [10, 10],
      [10, 60],
      [0, 60],
    ]);
    const editor = pickingEditor([body]);
    Object.assign(editor, { modeling: new ModelSelection() });
    const pointer = editor.world.project([9, 9, 10]);
    const hit = pickModel(editor, pointer);
    assert.ok(hit?.kind === "face");
    editor.modeling.hover = hit;
    const raw = hoveredCandidates(editor);
    const centroid = raw.find(
      (p) => p.anchor.kind === "body-faces" && p.anchor.feature === "area-center",
    );
    assert.ok(centroid);
    const key = guideKey(centroid.anchor);
    const includes = (guides: typeof raw) => guides.some((p) => guideKey(p.anchor) === key);
    assert.equal(pickModel(editor, editor.world.project(centroid.point)), null);
    assert.equal(includes(hoverGuides(editor, pointer)), false);
    assert.deepEqual(
      editor.modeling.hover,
      hit,
      "destination probing must not replace actual hover",
    );
    assert.deepEqual(editor.modeling.targets, []);

    editor.modeling.targets = [hit];
    editor.modeling.hover = null;
    assert.equal(includes(hoverGuides(editor, pointer)), true);
    assert.equal(includes(hoverGuides(editor, null)), false);
    assert.equal(includes(hoverGuides(editor, { x: -1000, y: -1000 })), false);
    Object.assign(editor.display, {
      guidePoints: [{ id: "saved", name: "Centroid", hidden: false, anchor: centroid.anchor }],
    });
    assert.equal(
      includes(hoverGuides(editor, pointer)),
      false,
      "saved definitions do not duplicate",
    );
    Object.assign(editor.display, { guidePoints: [] });
    Object.assign(editor.visibility, { visible: () => false });
    assert.equal(hoverGuides(editor, null).length, 0);
    Object.assign(editor.visibility, { visible: () => true });
    editor.modeling.targets = [];
    assert.equal(
      hoverGuides(editor, null).length,
      0,
      "clearing selection removes off-face candidates",
    );
  } finally {
    owner.close();
  }
});
