import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { advanceMarkerFade } from "../src/guides/marker-fade.js";
import { guideMarkerOccluded } from "../src/guides/marker-visibility.js";
import { guideVisibleThroughSolids } from "../src/guides/solid-visibility.js";
import { prism, square } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";

test("opaque solids occlude guides behind them but never their own surface points", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const editor = pickingEditor([body]);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 10]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), false);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 10 - 5e-5]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 10 - 2e-4]), false);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, -5]), false);
    assert.equal(guideVisibleThroughSolids(editor, [30, 10, -5]), true);
    Object.assign(editor.display, { bodyAppearances: [{ body: body.id, alpha: 0.99 }] });
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), true);
    Object.assign(editor.display, { bodyAppearances: [{ body: body.id, alpha: 0 }] });
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), true);
    Object.assign(editor.display, { bodyAppearances: [] });
    Object.assign(editor.visibility, { visible: () => false });
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), true);
    Object.assign(editor.visibility, { visible: () => true });
    editor.bodiesVisible = false;
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), true);
  } finally {
    owner.close();
  }
});

test("opaque section caps occlude material while respecting clipped points and transparent bodies", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const clipping = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 5)];
    const editor = pickingEditor([body], [0, 0, 100], clipping);
    Object.assign(editor.world, { crossSection: {} });
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 3]), false);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5 - 5e-5]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 5 - 2e-4]), false);
    assert.equal(guideVisibleThroughSolids(editor, [30, 10, 3]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 7]), false);
    Object.assign(editor.display, { bodyAppearances: [{ body: body.id, alpha: 0.5 }] });
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 3]), true);
    assert.equal(guideVisibleThroughSolids(editor, [10, 10, 7]), false);
  } finally {
    owner.close();
  }
});

test("section-cap parity leaves cavities open instead of treating a body bounds box as material", async () => {
  const owner = new DocumentOwner();
  try {
    const outer = await prism(owner, square);
    const inner = await prism(owner, [
      [2, 2],
      [18, 2],
      [18, 18],
      [2, 18],
    ]);
    const result = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [outer.id, inner.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(result.error, undefined);
    const hollow = result.view.candidate?.bodies?.[0];
    assert.ok(hollow);
    const editor = pickingEditor(
      [hollow],
      [0, 0, 100],
      [new THREE.Plane(new THREE.Vector3(0, 0, -1), 5)],
    );
    Object.assign(editor.world, { crossSection: {} });
    assert.equal(
      guideVisibleThroughSolids(editor, [10, 10, 3]),
      true,
      "cavity has even shell parity",
    );
    assert.equal(guideVisibleThroughSolids(editor, [1, 1, 3]), false, "wall has odd shell parity");
    assert.equal(
      guideVisibleThroughSolids(editor, [2 + 1e-4, 10, 3]),
      true,
      "inside the cavity rim stays open",
    );
    assert.equal(
      guideVisibleThroughSolids(editor, [2 - 1e-4, 10, 3]),
      false,
      "material beside the cavity rim stays capped",
    );
  } finally {
    owner.close();
  }
});

test("panel and solid occlusion immediately mask ghosts still inside their minimum dwell", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const editor = pickingEditor([body]);
    const fading = { desired: false, born: 0, opacity: 0.5, updated: 50 };
    assert.equal(advanceMarkerFade(fading, 60, false), true);
    assert.ok(fading.opacity > 0, "minimum dwell still preserves the visual fade");
    assert.equal(guideMarkerOccluded(editor, [10, 10, 5], []), true);
    const screen = editor.world.project([30, 10, 10]);
    const panel = {
      left: screen.x - 20,
      right: screen.x + 20,
      top: screen.y - 20,
      bottom: screen.y + 20,
    } as DOMRectReadOnly;
    assert.equal(guideMarkerOccluded(editor, [30, 10, 10], [panel]), true);
    assert.equal(guideMarkerOccluded(editor, [30, 10, 10], []), false);
  } finally {
    owner.close();
  }
});
