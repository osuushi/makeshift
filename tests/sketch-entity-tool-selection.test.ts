import assert from "node:assert/strict";
import test from "node:test";
import { deleteEntities } from "../src/backend/delete-entities.js";
import { clipboardSelection } from "../src/clipboard/selection.js";
import type { Operation } from "../src/model/operation-selection.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { ToolSelection } from "../src/tools/tool-selection.js";

function fixture(openOnly = false) {
  const base: SketchDocument = {
    units: "mm",
    sketches: [
      {
        id: "s",
        plane: planes.XY,
        groups: [],
        constraints: [],
        curves: [
          { id: "outer", kind: "circle", construction: false, center: { x: 0, y: 0 }, radius: 10 },
          { id: "inner", kind: "circle", construction: false, center: { x: 0, y: 0 }, radius: 5 },
          {
            id: "open",
            kind: "segment",
            construction: false,
            a: { x: 20, y: 0 },
            b: { x: 30, y: 0 },
          },
        ],
      },
    ],
  };
  const data: SketchDocument = openOnly
    ? { ...base, sketches: [{ ...base.sketches[0], curves: base.sketches[0].curves.slice(2) }] }
    : base;
  const modeling = new ModelSelection();
  modeling.sync(data);
  modeling.targets = [{ kind: "sketch", sketch: "s" }];
  modeling.setTool(null);
  const editor = { world: { active: false }, modeling, store: { data } } as unknown as SketchEditor;
  const selection = (id: Operation) =>
    new ToolSelection(editor, id, () => {
      const result = modeling.resolve(id);
      return result.available ? null : result.reason;
    });
  return { data, modeling, editor, selection };
}

for (const operation of ["extrude", "revolve", "loft"] as const) {
  test(`${operation} refines a whole sketch to all its regions without changing inspection state`, () => {
    const { data, modeling, selection } = fixture();
    const original = [...modeling.targets];
    const profiles = profilesFor(data.sketches[0]);
    assert.equal(profiles.length, 2);
    const narrowed = selection(operation).narrow();
    assert.deepEqual(
      narrowed,
      profiles.map((profile) => ({ kind: "profile", sketch: "s", profile })),
    );
    assert.deepEqual(modeling.targets, original);
    assert.equal(modeling.tool, null);
    assert.ok(narrowed);
    selection(operation).targets = narrowed;
    const result = modeling.resolve(operation);
    assert.equal(result.available, true);
    if (result.available) assert.equal(result.inputs.length, 2);
  });
}

test("explicit regions are deduplicated and unrelated edges undergo ordinary refinement", () => {
  const { data, modeling, selection } = fixture();
  const profile = profilesFor(data.sketches[0])[1];
  const explicit = { kind: "profile" as const, sketch: "s", profile };
  modeling.targets = [explicit, ...modeling.targets, { kind: "edge", body: "b", edge: "e" }];
  const narrowed = selection("extrude").narrow();
  assert.equal(narrowed?.length, 2);
  assert.deepEqual(narrowed?.[0], explicit);
});

test("open sketches need input collection; whole-entity tools preserve the sketch token", () => {
  const { modeling, editor } = fixture();
  for (const id of ["move", "copy", "delete", "edit-sketch"]) {
    const tool = new ToolSelection(editor, id, () => null);
    assert.deepEqual(tool.narrow(), modeling.targets);
  }
  assert.equal(fixture(true).selection("extrude").narrow(), null);
});

test("Option-subtracting an inner region expands whole-sketch coverage before subtraction", () => {
  const { data, modeling, selection } = fixture();
  const profiles = profilesFor(data.sketches[0]);
  const inner = profiles.find((profile) => profile.holes.length === 0);
  assert.ok(inner);
  modeling.choose({ kind: "profile", sketch: "s", profile: inner }, false, false, true);
  assert.deepEqual(
    selection("extrude").narrow(),
    profiles
      .filter((p) => p !== inner)
      .map((profile) => ({ kind: "profile", sketch: "s", profile })),
  );
});

test("refining a sketch preserves its open curves for copy and delete", () => {
  const { data, modeling, editor } = fixture();
  const inner = profilesFor(data.sketches[0]).find((p) => !p.holes.length);
  assert.ok(inner);
  modeling.choose({ kind: "profile", sketch: "s", profile: inner }, false, false, true);
  assert.ok(modeling.targets.some((t) => t.kind === "sketch" && t.curves?.includes("open")));
  const copied = clipboardSelection(editor).sketches[0];
  assert.equal(copied.curves.filter((c) => c.kind === "segment").length, 1);
  assert.equal(profilesFor(copied).length, 2, "Copied annulus retains both boundaries");
  const deletion = modeling.resolve("delete");
  assert.ok(deletion.available);
  if (!deletion.available) return;
  const next = deleteEntities(data, { kind: "delete-entities", ...deletion.inputs });
  assert.ok(next.sketches.every((s) => s.curves.every((c) => c.id !== "open")));
  modeling.chooseProfiles("s", [inner], false, true);
  assert.equal(modeling.targets.filter((t) => t.kind === "profile").length, 2);
  modeling.chooseProfiles("s", [inner], false, false, true);
  assert.equal(modeling.targets.filter((t) => t.kind === "profile").length, 1);
});
