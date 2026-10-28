import assert from "node:assert/strict";
import test from "node:test";
import type { Body } from "../src/model/body.js";
import { refineSelection } from "../src/model/selection-refinement.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const body: Body = {
  id: "body",
  brep: "",
  volume: 1,
  center: [0, 0, 0],
  bounds: [],
  faces: [
    { id: "a", edges: ["shared", "seam", "seam"], signature: [], vertices: [], plane: planes.XY },
    { id: "b", edges: ["shared", "other"], signature: [], vertices: [], plane: planes.XY },
  ],
  edges: ["shared", "seam", "other"].map((id) => ({ id, curve: null, signature: [], points: [] })),
};
const document: SketchDocument = { units: "mm", sketches: [], bodies: [body] };

test("geometry reply retains explicit face tool; a fresh click restores Offset", () => {
  const selection = new ModelSelection();
  selection.sync(document);
  const face = { kind: "face", body: body.id, face: "a" } as const;
  selection.choose(face, false, false);
  selection.setTool("extrude");
  selection.sync(structuredClone(document));
  assert.equal(selection.tool, "extrude");
  selection.choose(face, false, false);
  assert.equal(selection.tool, "offset");
  selection.choose({ kind: "edge", body: body.id, edge: "shared" }, true, false);
  assert.equal(selection.tool, null);
  selection.targets = refineSelection(selection.targets, [body], "only-edges");
  assert.equal(selection.tool, "fillet");
  selection.setTool("chamfer");
  selection.sync(structuredClone(document));
  assert.equal(selection.tool, "chamfer");
  selection.sync({ ...document, bodies: [] });
  assert.deepEqual(selection.targets, []);
  assert.equal(selection.tool, null);
});

test("topology expansion preserves ordered inputs, includes both neighbors and deduplicates seams", () => {
  const edge = { kind: "edge", body: body.id, edge: "shared" } as const;
  const expanded = refineSelection([edge], [body], "add-faces");
  assert.deepEqual(expanded, [
    edge,
    { kind: "face", body: body.id, face: "a" },
    { kind: "face", body: body.id, face: "b" },
  ]);
  assert.deepEqual(refineSelection(expanded, [body], "add-faces"), expanded);
  const edges = refineSelection(expanded, [body], "add-edges");
  assert.deepEqual(edges.slice(0, 3), expanded);
  assert.deepEqual(edges.slice(3), [
    { kind: "edge", body: body.id, edge: "seam" },
    { kind: "edge", body: body.id, edge: "other" },
  ]);
});

test("unchanged regions survive previews; changed sketch geometry invalidates derived selections", () => {
  const { sketch } = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 });
  const doc: SketchDocument = { units: "mm", sketches: [sketch] };
  const selection = new ModelSelection();
  selection.sync(doc);
  selection.choose(
    { kind: "profile", sketch: sketch.id, profile: profilesFor(sketch)[0] },
    false,
    false,
  );
  selection.setTool("revolve");
  selection.sync(structuredClone(doc));
  assert.equal(selection.targets.length, 1);
  assert.equal(selection.tool, "revolve");
  selection.sync({ ...doc, sketches: [{ ...sketch, curves: [] }] });
  assert.deepEqual(selection.targets, []);
  assert.equal(selection.tool, null);
});

test("subtraction removes face coverage and never adds an absent target", () => {
  const selection = new ModelSelection();
  selection.sync(document);
  const first = { kind: "face", body: body.id, face: "a" } as const;
  const second = { kind: "face", body: body.id, face: "b" } as const;
  selection.targets = [{ kind: "body", body: body.id }];
  selection.choose(first, false, false, true);
  assert.deepEqual(selection.targets, [second]);
  selection.choose(first, false, false, true);
  assert.deepEqual(selection.targets, [second]);
  selection.choose(null, false, false, true);
  assert.deepEqual(selection.targets, [second]);
  selection.choose({ kind: "body", body: body.id }, false, false, true);
  assert.deepEqual(selection.targets, []);
});
