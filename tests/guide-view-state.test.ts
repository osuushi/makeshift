import assert from "node:assert/strict";
import test from "node:test";
import { visibleGuides } from "../src/guides/snapping.js";
import { editingGuides, toggleGuideEditing } from "../src/guides/view-state.js";
import { guideOverlapsWidget } from "../src/guides/widget-clearance.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { pickingEditor } from "./body-picking-fixtures.js";

test("editing toggle leaves non-hidden saved guides visible and respects their eye control", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "circle",
        kind: "circle" as const,
        construction: false,
        center: { x: 0, y: 0 },
        radius: 10,
      },
    ],
  };
  const guide = {
    id: "saved",
    name: "Center",
    hidden: false,
    anchor: {
      kind: "sketch-curve" as const,
      sketch: sketch.id,
      curve: "circle",
      feature: "circle-center" as const,
    },
  };
  const editor = pickingEditor([]);
  Object.assign(editor, { refresh: () => {} });
  Object.assign(editor.display, { sketches: [sketch], guidePoints: [guide] });
  assert.equal(editingGuides(editor), true);
  assert.equal(visibleGuides(editor).length, 1);
  toggleGuideEditing(editor);
  assert.equal(editingGuides(editor), false);
  assert.equal(visibleGuides(editor).length, 1);
  Object.assign(editor.display, { guidePoints: [{ ...guide, hidden: true }] });
  assert.equal(visibleGuides(editor).length, 0);
  Object.assign(editor.world, { active: true });
  assert.equal(editingGuides(editor), false, "sketch editing starts off");
  toggleGuideEditing(editor);
  assert.equal(editingGuides(editor), true);
  Object.assign(editor.world, { active: false });
  assert.equal(editingGuides(editor), false, "3D remembers its own previous setting");
  Object.assign(editor.world, { active: true });
  assert.equal(editingGuides(editor), true, "sketch remembers its own previous setting");
});

test("guide footprint clears every visible orientable control hit rectangle", () => {
  const box = { left: 40, top: 40, right: 60, bottom: 60 } as DOMRectReadOnly;
  assert.equal(guideOverlapsWidget({ x: 50, y: 50 }, [box]), true);
  assert.equal(guideOverlapsWidget({ x: 31, y: 50 }, [box]), true);
  assert.equal(guideOverlapsWidget({ x: 30, y: 50 }, [box]), false);
  assert.equal(guideOverlapsWidget({ x: 50, y: 30 }, [box]), false);
  assert.equal(guideOverlapsWidget({ x: 50, y: 50 }, []), false);
});
