import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import { stepItems } from "../src/model/step-export.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

async function source(owner: DocumentOwner): Promise<string> {
  await prism(owner, square);
  await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", center: { x: 40, y: -10 }, radius: 5, construction: false },
    ],
  });
  const reply = await owner.call({
    kind: "export-step",
    items: stepItems(owner.view.data.bodies ?? []),
  });
  assert.equal(reply.error, undefined);
  assert.ok(reply.step);
  return reply.step;
}

test("STEP imports exact separate bodies atomically, preserves placement, supports editing and reopen", async () => {
  const owner = new DocumentOwner();
  try {
    const step = await source(owner);
    const originals = structuredClone(owner.view.data.bodies ?? []);
    const before = structuredClone(owner.view.data);
    const preview = await owner.call({ kind: "import-step", step });
    assert.equal(preview.error, undefined);
    assert.deepEqual(owner.view.data, before);
    assert.equal(preview.view.candidate?.bodies?.length, 4);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = structuredClone(owner.view.data);
    const imported = (accepted.bodies ?? []).slice(2);
    for (const [i, body] of imported.entries()) {
      assert.notEqual(body.id, originals[i].id);
      assert.ok(Math.abs(body.volume - originals[i].volume) < 1e-5);
      body.bounds.forEach((value, j) => {
        assert.ok(Math.abs(value - originals[i].bounds[j]) < 1e-5);
      });
      assert.equal(body.faces.length, originals[i].faces.length);
    }
    assert.ok(imported[1].faces.some((face) => face.cylinder != null));
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    const moved = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: imported.map((body) => body.id),
        duplicate: false,
        translation: [10, 0, 0],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
      },
    });
    assert.equal(moved.error, undefined);
    assert.ok(
      Math.abs((owner.view.data.bodies ?? [])[2].bounds[0] - imported[0].bounds[0] - 10) < 1e-5,
    );
    const saved = structuredClone(owner.view.data);
    await owner.call({ kind: "new" });
    assert.equal((await owner.call({ kind: "open", document: saved })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 4);
    assert.ok(Math.abs((owner.view.data.bodies ?? [])[3].volume - imported[1].volume) < 1e-5);
  } finally {
    owner.close();
  }
});

test("STEP converts meter units to millimeters and rejects malformed input without acceptance", async () => {
  const owner = new DocumentOwner();
  try {
    const step = await source(owner);
    const meters = step.replaceAll("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT($,.METRE.)");
    assert.notEqual(meters, step);
    const result = await owner.call({ kind: "import-step", step: meters });
    assert.equal(result.error, undefined);
    const imported = (result.view.candidate?.bodies ?? []).slice(2);
    assert.ok(Math.abs(imported[0].volume / (owner.view.data.bodies ?? [])[0].volume - 1e9) < 1);
    await owner.call({ kind: "cancel-preview" });
    const before = structuredClone(owner.view.data);
    const missingPoint = step.replace(/#\d+ = CARTESIAN_POINT\([^;]*;\s*/, "");
    assert.notEqual(missingPoint, step);
    for (const step of ["", "not STEP", "ISO-10303-21;\nEND-ISO-10303-21;", missingPoint]) {
      assert.ok((await owner.call({ kind: "import-step", step })).error);
      assert.deepEqual(owner.view.data, before);
    }
    assert.equal((await owner.call({ kind: "import-step", step })).error, undefined);
    await owner.call({ kind: "cancel-preview" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("STEP rejects mixed surface and tessellated imports and recovers after cancellation", async () => {
  const owner = new DocumentOwner();
  try {
    const step = await source(owner);
    const before = structuredClone(owner.view.data);
    const surface = step.replace(
      /MANIFOLD_SOLID_BREP\(([^,]*),(#\d+)\)/,
      "SHELL_BASED_SURFACE_MODEL($1,($2))",
    );
    assert.notEqual(surface, step);
    assert.match(
      (await owner.call({ kind: "import-step", step: surface })).error ?? "",
      /solid bodies/,
    );
    assert.deepEqual(owner.view.data, before);
    const bodies = owner.view.data.bodies ?? [];
    const meshStep = await owner.call({
      kind: "export-step",
      items: stepItems(bodies, bodies.map(exportMesh)),
    });
    assert.ok(meshStep.step);
    assert.ok((await owner.call({ kind: "import-step", step: meshStep.step })).error);
    assert.deepEqual(owner.view.data, before);
    const pending = owner.call({ kind: "import-step", step });
    await owner.call({ kind: "cancel-preview" });
    await pending;
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
    assert.equal((await owner.call({ kind: "import-step", step })).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 4);
  } finally {
    owner.close();
  }
});
