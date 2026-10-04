import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { readArchive } from "../src/model/document-archive.js";
import { exportMesh } from "../src/model/export-mesh.js";

const curvedErosionSource = readArchive(
  readFileSync("tests/fixtures/erosion-curved-interior.json", "utf8"),
);

test("Remesh captures the bent interior, keeps editable CAD, and subtracts a reopened cavity", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal(
      (await owner.call({ kind: "open", document: curvedErosionSource })).error,
      undefined,
    );
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert(source);
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 2, meshDetail: "fine" },
    });
    assert.equal(reply.error, undefined);
    assert.equal(owner.view.data, before);
    const cavity = reply.view.candidate?.bodies?.[1];
    assert(cavity && cavity.faces.length <= 128);
    const mesh = exportMesh(cavity);
    assert.equal(
      mesh.vertices.length - mesh.triangles.length / 2,
      0,
      "The closed interior retains its through-hole",
    );
    assert(cavity.volume > 9000 && cavity.volume < 12000);
    assert(cavity.bounds[0] < -18 && cavity.bounds[3] > 18);
    const quality = reply.view.erosionQuality?.[0];
    assert(quality && quality.sampledMinThickness > 1.5 && quality.sampledMaxThickness < 3);
    assert(quality.sampledFitDeviation < 1.5);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.[1].faces.map((f) => f.id),
      cavity.faces.map((f) => f.id),
    );
    const front = cavity.faces.reduce((a, b) => {
      const y = (face: typeof a) =>
        face.vertices.reduce((sum, value, i) => sum + (i % 3 === 1 ? value : 0), 0) /
        (face.vertices.length / 3);
      return y(b) < y(a) ? b : a;
    });
    const edit = await owner.call({
      kind: "move-faces",
      operation: {
        faces: [{ body: cavity.id, face: front.id }],
        translation: [0, -0.1, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
      },
    });
    assert.equal(edit.error, undefined);
    const edited = edit.view.candidate?.bodies?.[1];
    assert(edited && Math.abs(edited.volume - cavity.volume) > 0.01);
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    const cut = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [source.id, cavity.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(cut.error, undefined);
    const wall = cut.view.candidate?.bodies?.[0];
    assert(wall);
    assert(Math.abs(wall.volume - source.volume + edited.volume) < 1e-3);
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    assert(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - wall.volume) < 1e-3);
  } finally {
    owner.close();
  }
});
