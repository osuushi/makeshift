import assert from "node:assert/strict";
import test from "node:test";
import { editDecorators, prepareBuiltinApplication } from "../src/decorators/edits.js";
import { prepareThreadGeometry } from "../src/decorators/export-body.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { Body } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

// Analytic descriptors test validation boundaries; the UI route supplies real BReps.
function cylinder(id: string, radius: number): Body {
  return {
    id,
    brep: "descriptor-only",
    volume: Math.PI * radius ** 2 * 10,
    center: [0, 0, 5],
    bounds: [-radius, -radius, 0, radius, radius, 10],
    edges: [],
    faces: [
      {
        id: "side",
        edges: [],
        signature: [],
        vertices: [radius, 0, 0, radius, 0, 10],
        plane: null,
        cylinder: { radius, origin: [0, 0, 0], axis: [0, 0, 1], outward: 1 },
      },
    ],
  };
}

test("invalid default proposal cannot bypass accepted edit or export validation", () => {
  const document: SketchDocument = { units: "mm", sketches: [], bodies: [cylinder("tiny", 0.5)] };
  const original = structuredClone(document);
  const edit = {
    action: "apply" as const,
    definition: threadDefinition,
    faces: [{ body: "tiny", face: "side" }],
  };
  const proposal = prepareBuiltinApplication(document, edit);
  assert.equal(proposal.length, 1);
  assert.equal(proposal[0].settings.profile, "triangle");
  assert.deepEqual(document, original);
  assert.throws(() => editDecorators(document, edit), /too deep/);
  assert.throws(() => prepareThreadGeometry(document, proposal[0], "preview"), /too deep/);
  assert.throws(() => prepareThreadGeometry(document, proposal[0], "export"), /too deep/);
  const corrected = editDecorators(document, { ...edit, settings: { preset: "metric" } });
  assert.equal(corrected.decorators?.[0].settings.pitch, 0.25);
  assert.equal(corrected.decorators?.[0].settings.profile, "metric");
  assert.deepEqual(corrected.bodies, document.bodies);
  assert.deepEqual(document, original);
});

test("multi-cylinder correction keeps per-diameter defaults and applies atomically", () => {
  const document: SketchDocument = {
    units: "mm",
    sketches: [],
    bodies: [cylinder("tiny", 0.5), cylinder("large", 5)],
  };
  const faces = document.bodies?.map((body) => ({ body: body.id, face: "side" })) ?? [];
  const edit = { action: "apply" as const, definition: threadDefinition, faces };
  assert.throws(() => editDecorators(document, edit), /too deep/);
  assert.equal(document.decorators, undefined);
  const corrected = editDecorators(document, {
    ...edit,
    settings: { preset: "metric", hand: "left", clearance: 0.15 },
  });
  assert.deepEqual(
    corrected.decorators?.map((d) => d.settings.pitch),
    [0.25, 1.5],
  );
  assert.ok(
    corrected.decorators?.every((d) => d.settings.hand === "left" && d.settings.clearance === 0.15),
  );
  assert.equal(document.decorators, undefined);
});

test("settings repair a resized thread without replacing its attachment or analytic body", () => {
  const document: SketchDocument = { units: "mm", sketches: [], bodies: [cylinder("body", 10)] };
  const threaded = editDecorators(document, {
    action: "apply",
    definition: threadDefinition,
    faces: [{ body: "body", face: "side" }],
  });
  const instance = threaded.decorators?.[0];
  assert.ok(instance);
  const resized = {
    ...threaded,
    bodies: [cylinder("body", 0.5)],
    decorators: [{ ...instance, problem: "Thread profile is too deep for this cylinder" }],
  };
  const corrected = editDecorators(resized, {
    action: "settings",
    ids: [instance.id],
    patch: { preset: "metric" },
  });
  assert.equal(corrected.decorators?.[0].problem, undefined);
  assert.equal(corrected.decorators?.[0].id, instance.id);
  assert.deepEqual(corrected.decorators?.[0].faces, instance.faces);
  assert.equal(corrected.bodies, resized.bodies);
  const ambiguous = {
    ...resized,
    decorators: [{ ...instance, problem: "A face merged with other geometry" }],
  };
  assert.equal(
    editDecorators(ambiguous, {
      action: "settings",
      ids: [instance.id],
      patch: { preset: "metric" },
    }).decorators?.[0].problem,
    "A face merged with other geometry",
  );
});
