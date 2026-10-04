import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { exportMesh } from "../.cache/sketch-tests/src/model/export-mesh.js";
import { stepItems } from "../.cache/sketch-tests/src/model/step-export.js";
import { erosionReconstructionSource } from "../.cache/sketch-tests/tests/erosion-reconstruction-fixtures.js";
import { readStep } from "./step-readback.mjs";

await mkdir(".cache/erosion-reconstruction-export", { recursive: true });
const owner = new DocumentOwner();
try {
  const source = await erosionReconstructionSource(owner);
  assert.equal(
    (
      await owner.call({
        kind: "erode",
        operation: {
          ids: [source.id],
          thickness: 1,
          keepOriginals: true,
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const cavity = owner.view.data.bodies[1];
  await verify(cavity, "cavity");
  assert.equal(
    (
      await owner.call({
        kind: "boolean-bodies",
        operation: {
          ids: [source.id, cavity.id],
          mode: "subtract",
          keepOriginals: false,
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  await verify(owner.view.data.bodies[0], "wall");
} finally {
  owner.close();
}

async function verify(body, name) {
  const mesh = exportMesh(body);
  assert(mesh.triangles.length > body.faces.length);
  const exported = await owner.call({ kind: "export-step", items: stepItems([body]) });
  assert.equal(exported.error, undefined);
  assert.match(exported.step, /B_SPLINE_SURFACE/);
  assert.doesNotMatch(exported.step, /TESSELLATED_SOLID/);
  const path = resolve(`.cache/erosion-reconstruction-export/${name}.step`);
  await writeFile(path, exported.step);
  const [readback] = readStep(path);
  assert(readback.valid);
  assert.equal(readback.exactFaces, body.faces.length);
  assert.equal(readback.meshFaces, 0);
  assert(Math.abs(readback.volume / body.volume - 1) < 1e-6);
  console.log(
    `PASS reconstructed ${name}: oriented closed export mesh and independent exact STEP readback`,
  );
}
