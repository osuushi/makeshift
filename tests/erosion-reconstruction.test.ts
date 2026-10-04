import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  erosionReconstructionSource,
  waistInteriorVolume,
} from "./erosion-reconstruction-fixtures.js";

test("freeform erosion reconstructs an editable cavity and preserves document history", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await erosionReconstructionSource(owner);
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 1, keepOriginals: true },
    });
    assert.equal(reply.error, undefined);
    assert.equal(owner.view.data, before);
    const cavity = reply.view.candidate?.bodies?.find((body) => body.id !== source.id);
    assert(cavity);
    assert(cavity.faces.length <= 96);
    // Include the source construction's 0.15 mm fitting allowance in the
    // independent ideal-shape volume envelope; Fast targets the same 1 mm inward surface.
    assert(cavity.volume > waistInteriorVolume(1.95));
    assert(cavity.volume < waistInteriorVolume(0.85));
    assert(cavity.faces.every((face) => !source.faces.some((old) => old.id === face.id)));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const reopened = owner.view.data;
    const front = cavity.faces.reduce((a, b) => {
      const y = (face: typeof a) =>
        face.vertices.reduce((sum, v, i) => sum + (i % 3 === 1 ? v : 0), 0) /
        (face.vertices.length / 3);
      return y(b) < y(a) ? b : a;
    });
    const moved = await owner.call({
      kind: "move-faces",
      operation: {
        faces: [{ body: cavity.id, face: front.id }],
        translation: [0, -0.1, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
      },
    });
    assert.equal(moved.error, undefined);
    const edited = moved.view.candidate?.bodies?.find((body) => body.id === cavity.id);
    assert(edited && Math.abs(edited.volume - cavity.volume) > 0.01);
    assert.deepEqual(
      edited.faces.map((face) => face.id).sort(),
      cavity.faces.map((face) => face.id).sort(),
    );
    await owner.call({ kind: "accept" });
    const editedDocument = owner.view.data;
    assert.equal((await owner.call({ kind: "open", document: editedDocument })).error, undefined);
    assert.equal((await owner.call({ kind: "open", document: reopened })).error, undefined);

    const cut = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [source.id, cavity.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(cut.error, undefined);
    const wall = cut.view.candidate?.bodies?.[0];
    assert(wall);
    assert(Math.abs(wall.volume - (source.volume - cavity.volume)) < 1e-3);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, reopened);
  } finally {
    owner.close();
  }
});

test("erosion recovers an analytic spherical cavity from cubic source faces", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await erosionReconstructionSource(owner, "sphere");
    assert(source.faces.every((face) => !face.sphere));
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 1, keepOriginals: false },
    });
    assert.equal(reply.error, undefined);
    const result = reply.view.candidate?.bodies?.[0];
    assert(result);
    assert.equal(result.faces.length, 1);
    const face = result.faces[0];
    assert(face.sphere && Math.abs(face.sphere.radius - 9) < 0.2);
    assert(Math.abs(result.volume - (4 * Math.PI * face.sphere.radius ** 3) / 3) < 1e-5);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    const edit = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: result.id, face: face.id }], distance: -0.1 },
    });
    assert.equal(edit.error, undefined);
    assert(
      Math.abs(
        (edit.view.candidate?.bodies?.[0].volume ?? 0) -
          (4 * Math.PI * (face.sphere.radius - 0.1) ** 3) / 3,
      ) < 1e-5,
    );
  } finally {
    owner.close();
  }
});
