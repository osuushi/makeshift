import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import { readStep } from "./step-readback.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/erosion-pierced-fillet.json", "utf8"));
const owner = new DocumentOwner();
await mkdir(".cache/erosion-modes", { recursive: true });
try {
  assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
  const source = owner.view.data.bodies[0];
  const reply = await owner.call({
    kind: "erode",
    operation: { ids: [source.id], thickness: 3.8 },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  const pieces = owner.view.data.bodies.slice(1);
  assert.equal(pieces.length, 4);
  const cut = await owner.call({
    kind: "boolean-bodies",
    operation: {
      ids: [source.id, ...pieces.map((body) => body.id)],
      mode: "subtract",
      keepOriginals: false,
    },
  });
  assert.equal(cut.error, undefined);
  const wall = cut.view.candidate.bodies[0];
  assert(
    Math.abs(wall.volume - source.volume + pieces.reduce((sum, body) => sum + body.volume, 0)) <
      1e-3,
  );
  for (const [index, body] of [...pieces, wall].entries()) {
    assert(exportMesh(body).triangles.length > body.faces.length);
    const exported = await owner.call({ kind: "export-step", items: stepItems([body]) });
    assert.equal(exported.error, undefined);
    assert.match(exported.step, /B_SPLINE_SURFACE/);
    assert.doesNotMatch(exported.step, /TESSELLATED_SOLID/);
    const path = resolve(`.cache/erosion-modes/piece-${index}.step`);
    await writeFile(path, exported.step);
    const [readback] = readStep(path);
    assert(readback.valid);
    assert.equal(readback.exactFaces, body.faces.length);
    assert.equal(readback.meshFaces, 0);
    assert(Math.abs(readback.volume / body.volume - 1) < 1e-6);
  }
  console.log(
    "PASS captured split solids and final wall: closed oriented mesh export and independent exact STEP readback",
  );
} finally {
  owner.close();
}
