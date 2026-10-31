import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  selectedRevealGeometry,
  selectionPreviewGeometry,
} from "../src/model/selection-preview-geometry.js";
import { SelectionXray } from "../src/model/selection-xray.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { pickingEditor } from "./body-picking-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/internal-selection-xray.json", "utf8")) as {
  document: SketchDocument;
  modelingSelection: Extract<ModelingTarget, { kind: "face" }>[];
};

test("real deferred hole resize uses its new mesh and source correspondence before exact metadata", async () => {
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
    const selectedSlot = preview.bodies[0].sourceFaces?.findIndex((ids) =>
      ids.includes(selected.face),
    );
    assert.notEqual(selectedSlot, undefined);
    assert.deepEqual(reveal.masks[0].geometry, [preview.bodies[0].faces[selectedSlot ?? -1]]);
    assert.equal(reveal.faces.has(`${drawing.id}/${selectedSlot}`), false);
    assert.ok(
      reveal.faces.has(`${selected.body}/${before.bodies?.[0].faces[0].id}`),
      "Faded preview faces also suppress decorators on their accepted supports",
    );
    assert.equal(owner.view.data, before, "Drawing does not accept the edit");
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const rim = body.edges.find((edge) => edge.curve?.kind === "circle" && edge.curve.radius === 5);
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
