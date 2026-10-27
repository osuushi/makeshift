import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { kernelInput } from "../src/backend/kernel-input.js";
import { readKernelReply } from "../src/backend/kernel-reply-validation.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Extrusion } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/extrude-detailed-body.json", "utf8")) as {
  document: SketchDocument;
  extrusion: Extrusion;
};

test("captured detailed body: visual Boolean targets match exact results across direction and mode changes", async () => {
  const kernel = new SolidCalculator();
  try {
    for (const [mode, distance, symmetric] of [
      ["union", 32.5, false],
      ["auto", 8, false],
      ["auto", -4, false],
      ["intersect", -4, false],
      ["union", 8, true],
      ["new", 8, false],
    ] as const) {
      const input = kernelInput(
        fixture.document,
        { ...fixture.extrusion, mode, distance, symmetric },
        fixture.document.bodies ?? [],
      );
      const full = await kernel.calculate(input);
      const visual = await kernel.calculate({ ...input, presentation: "visual" });
      assert.equal(visual.mode, full.mode);
      assert.deepEqual(visual.participants, full.participants);
      assert.deepEqual(visual.tools, full.tools);
      assert.equal(visual.results.length, full.results.length);
      for (const [index, body] of visual.results.entries()) {
        const complete = full.results[index];
        assert.deepEqual(body.bounds, complete.bounds);
        assert.deepEqual(
          body.faces,
          complete.faces.map((face) => face.vertices),
        );
        assert.deepEqual(
          body.normals,
          complete.faces.map((face) => face.normals),
        );
        assert.deepEqual(body.sourceBodies, complete.predecessorBodies);
      }
      assert.throws(() =>
        readKernelReply(
          { ...input, presentation: "visual" },
          {
            ...visual,
            participants: ["unknown-body"],
          },
        ),
      );
    }
  } finally {
    kernel.close();
  }
});

test("New extrusion omits unrelated bodies, preserves face sources and matches an empty document", async () => {
  const owner = new DocumentOwner();
  const kernel = new SolidCalculator();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const operation = { ...fixture.extrusion, mode: "new" as const };
    const input = kernelInput(original, operation, original.bodies ?? []);
    assert.deepEqual(
      input.bodies,
      [],
      "No existing BRep crosses the native boundary in New sketch mode",
    );
    const empty = await kernel.calculate(kernelInput({ ...original, bodies: [] }, operation, []));
    const populated = await kernel.calculate(input);
    assert.deepEqual(populated, empty);
    const body = original.bodies?.[0];
    assert.ok(body);
    const face = body.faces.find((face) => face.plane);
    assert.ok(face);
    const faceInput = kernelInput(original, { ...operation, sources: [{ face: face.id }] }, [body]);
    assert.equal(faceInput.bodies.length, 1, "Face extrusion still loads its source body");
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: operation, presentation: "visual" })).error,
      undefined,
    );
    assert.deepEqual(owner.view.visualPreview?.replaces, []);
    assert.equal(owner.view.candidate, null);
    assert.ok((await owner.call({ kind: "accept" })).error);
    const union = { ...operation, mode: "auto" as const };
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: union, presentation: "visual" })).error,
      undefined,
    );
    assert.deepEqual(owner.view.visualPreview?.replaces, [body.id]);
    assert.equal(owner.view.booleanMode, "union");
    const cut = { ...union, distance: -4 };
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: cut, presentation: "visual" })).error,
      undefined,
    );
    assert.equal(owner.view.booleanMode, "subtract");
    assert.equal(owner.view.booleanTools?.length, 1, "Reversed Auto retains its visible cutter");
    assert.equal((await owner.call({ kind: "extrude", extrusion: union })).error, undefined);
    assert.equal(owner.view.visualPreview, undefined);
    assert.equal(owner.view.booleanTools?.length, 0, "Union clears the previous cutter");
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 1);
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.deepEqual(owner.view.data, original);
    assert.equal((await owner.call({ kind: "redo" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 1);
  } finally {
    kernel.close();
    owner.close();
  }
});

test("visual subtraction and explicit disjoint intersection can replace a body with no solids", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = fixture.document.sketches[0];
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const operation = { ...fixture.extrusion, mode: "new" as const, distance: 10 };
    assert.equal((await owner.call({ kind: "extrude", extrusion: operation })).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const original = owner.view.data;
    const id = original.bodies?.[0].id;
    assert.ok(id);
    for (const [mode, distance] of [
      ["subtract", 20],
      ["intersect", -10],
    ] as const) {
      const extrusion = { ...operation, mode, distance, targets: [id], eligibleTargets: [id] };
      const result = await owner.call({ kind: "extrude", extrusion, presentation: "visual" });
      assert.equal(result.error, undefined);
      assert.deepEqual(result.view.visualPreview?.bodies, []);
      assert.deepEqual(result.view.visualPreview?.replaces, [id]);
      assert.equal(result.view.booleanTools?.length, 1);
      assert.deepEqual(result.view.data, original);
      const full = await owner.call({ kind: "extrude", extrusion });
      assert.equal(full.error, undefined);
      assert.deepEqual(full.view.candidate?.bodies, []);
    }
  } finally {
    owner.close();
  }
});
