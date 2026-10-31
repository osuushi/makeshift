import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { featureEdges } from "../src/model/feature-edges.js";
import {
  selectedRevealGeometry,
  selectionPreviewGeometry,
} from "../src/model/selection-preview-geometry.js";
import { SelectionXray } from "../src/model/selection-xray.js";
import type { VisualBody } from "../src/model/visual-preview.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { pickingEditor } from "./body-picking-fixtures.js";

type Fixture = {
  document: SketchDocument;
  modelingSelection: Extract<ModelingTarget, { kind: "face" }>[];
};

const fixture = JSON.parse(
  readFileSync("tests/fixtures/internal-selection-xray.json", "utf8"),
) as Fixture;

test("real deferred hole resize preserves its shaded neighborhood before metadata", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const before = owner.view.data;
    const selected = fixture.modelingSelection[0];
    const result = await owner.call({
      kind: "offset-faces",
      presentation: "deferred",
      operation: { faces: [{ body: selected.body, face: selected.face }], distance: -1 },
    });
    assert.equal(result.error, undefined);
    const preview = result.view.visualPreview;
    assert.ok(preview);
    const editor = pickingEditor(owner.view.data.bodies ?? [], [100, 70, 110]);
    Object.assign(editor, {
      store: { data: owner.view.data },
      modeling: { targets: fixture.modelingSelection },
      interactions: { current: { visualPreview: preview } },
    });
    const reveal = new SelectionXray().read(editor);
    assert.ok(reveal);
    const drawing = selectionPreviewGeometry(preview.bodies[0], owner.view.data.bodies ?? []);
    assert.equal(reveal.masks[0].body, drawing.id);
    const selectedSlot: number | undefined = preview.bodies[0].sourceFaces?.findIndex((ids) =>
      ids.includes(selected.face),
    );
    assert.ok(selectedSlot !== undefined && selectedSlot >= 0);
    assert.deepEqual(reveal.masks[0].geometry, [preview.bodies[0].faces[selectedSlot]]);
    assert.equal(reveal.faces.has(`${drawing.id}/${selectedSlot}`), false);
    assert.ok(
      reveal.faces.has(`${selected.body}/${before.bodies?.[0].faces[0].id}`),
      "Faded preview faces also suppress decorators on their accepted supports",
    );
    assert.equal(owner.view.data, before, "Drawing does not accept the edit");
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const sourceFace = body.faces.find((face) => face.id === selected.face);
    assert.ok(sourceFace);
    for (const neighbor of body.faces.filter(
      (face) =>
        face.id !== selected.face && face.edges.some((edge) => sourceFace.edges.includes(edge)),
    )) {
      const slot: number | undefined = preview.bodies[0].sourceFaces?.findIndex((ids) =>
        ids.includes(neighbor.id),
      );
      assert.ok(slot !== undefined && slot >= 0);
      assert.equal(
        reveal.faces.has(`${drawing.id}/${slot}`),
        false,
        "Bordering faces stay with the early mesh",
      );
    }
    const rim = body.edges.find(
      (edge) => edge.curve?.kind === "circle" && sourceFace.edges.includes(edge.id),
    );
    assert.ok(rim);
    assert.deepEqual(
      selectedRevealGeometry(body, [{ kind: "edge", body: body.id, edge: rim.id }]),
      [rim.points],
      "Edge aperture uses the edge, not its potentially large support faces",
    );
  } finally {
    owner.close();
  }
});

// The captured presentation supplies real face meshes and source correspondences;
// this checks their view mapping, without claiming an enclosed-cavity kernel edit.
test("closed cavity mesh presentation retains both caps through source correspondence", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/enclosed-selection-xray.json", "utf8"),
  ) as Fixture;
  const body = fixture.document.bodies?.[0];
  assert.ok(body);
  const edges = featureEdges(body);
  const drawing: VisualBody = {
    sourceBodies: [body.id],
    sourceFaces: body.faces.map((face) => [face.id]),
    sourceEdges: edges.map((edge) => [edge.id]),
    bounds: body.bounds as VisualBody["bounds"],
    faces: body.faces.map((face) => face.vertices),
    planes: body.faces.map((face) => face.plane),
    edges: edges.map((edge) => edge.points),
  };
  const editor = pickingEditor([body]);
  Object.assign(editor, {
    store: { data: fixture.document },
    modeling: { targets: fixture.modelingSelection },
    interactions: { current: { visualPreview: { bodies: [drawing], replaces: [body.id] } } },
  });
  const reveal = new SelectionXray().read(editor);
  assert.ok(reveal);
  const geometry = selectionPreviewGeometry(drawing, [body]);
  for (const index of [3, 4, 5]) assert.equal(reveal.faces.has(`${geometry.id}/${index}`), false);
  for (const index of [0, 1, 2]) assert.equal(reveal.faces.has(`${geometry.id}/${index}`), true);
});
