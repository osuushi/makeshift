import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cross, cylinderCoordinates } from "../src/decorators/cylinder.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

async function decoratedCylinder(owner: DocumentOwner) {
  const body = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "circle",
        kind: "circle",
        radius: 5,
        center: { x: 0, y: 0 },
        construction: false,
      },
    ],
  });
  const face = body.faces.find((f) => f.cylinder);
  assert.ok(face);
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: threadDefinition,
          faces: [{ body: body.id, face: face.id }],
        },
      })
    ).error,
    undefined,
  );
  return body;
}
const instances = (owner: DocumentOwner) => owner.view.data.decorators ?? [];
const approximate = (a: number[], b: number[]) =>
  assert.ok(
    a.every((v, i) => Math.abs(v - b[i]) < 1e-7),
    `${a} != ${b}`,
  );

test("radius recovery revalidates invalid threads in preview and acceptance without changing settings", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await decoratedCylinder(owner);
    const original = instances(owner)[0];
    const offset = async (distance: number) => {
      const response = await owner.call({
        kind: "offset-faces",
        operation: { faces: [...original.faces], distance },
      });
      assert.equal(response.error, undefined);
      return response.view.candidate;
    };
    assert.match((await offset(-4.5))?.decorators?.[0].problem ?? "", /too deep/);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const invalid = documentArchive(owner.view.data);
    assert.match(instances(owner)[0].problem ?? "", /too deep/);
    const candidate = await offset(5);
    assert.equal(candidate?.decorators?.[0].problem, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const restored = instances(owner)[0];
    assert.equal(restored.problem, undefined);
    assert.equal(restored.id, original.id);
    assert.deepEqual(restored.settings, original.settings);
    assert.equal(owner.view.data.bodies?.[0].id, body.id);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), invalid);
    await owner.call({ kind: "redo" });
    assert.equal(instances(owner)[0].problem, undefined);
    for (const factor of [0.1, 10]) {
      const scaled = await owner.call({
        kind: "scale",
        operation: {
          kind: "solids",
          ids: [body.id],
          faces: [],
          edges: [],
          pivot: [0, 0, 0],
          factor,
        },
      });
      assert.equal(scaled.error, undefined);
      if (factor === 10) assert.equal(scaled.view.candidate?.decorators?.[0].problem, undefined);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      if (factor === 0.1) assert.match(instances(owner)[0].problem ?? "", /too deep/);
    }
    assert.equal(instances(owner)[0].problem, undefined);
    assert.deepEqual(instances(owner)[0].settings, original.settings);
  } finally {
    owner.close();
  }
});

test("moving and copying threads transports the helix frame while copies get independent identities", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await decoratedCylinder(owner);
    const before = documentArchive(owner.view.data);
    const old = instances(owner)[0];
    const transform = {
      ids: [body.id],
      pivot: [0, 0, 0] as Vector,
      axis: [1, 0, 0] as Vector,
      angle: 90,
      translation: [20, 30, 40] as Vector,
      duplicate: false,
    };
    assert.equal((await owner.call({ kind: "transform-bodies", transform })).error, undefined);
    const moved = instances(owner)[0];
    assert.equal(moved.id, old.id);
    assert.equal(moved.problem, undefined);
    approximate(moved.frame.origin, [20, 30, 40]);
    approximate(cross(moved.frame.u, moved.frame.v), [0, -1, 0]);
    approximate(moved.frame.u, [0, 0, 1]);
    assert.deepEqual(moved.settings, old.settings);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), before);
    await owner.call({ kind: "redo" });
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ...transform,
            angle: 0,
            translation: [50, 0, 0],
            duplicate: true,
          },
        })
      ).error,
      undefined,
    );
    const [original, copy] = instances(owner);
    assert.notEqual(copy.id, original.id);
    assert.notEqual(copy.faces[0].face, original.faces[0].face);
    assert.deepEqual(original.frame, moved.frame);
    approximate(copy.frame.origin, [70, 30, 40]);
    assert.equal(copy.problem, undefined);
    const archive = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(archive) })).error,
      undefined,
    );
    assert.equal(instances(owner).length, 2);
  } finally {
    owner.close();
  }
});

test("mirror keeps hand, uniform scale keeps pitch/clearance, and a lost cylinder is unresolved", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await decoratedCylinder(owner);
    const settings = instances(owner)[0].settings;
    assert.equal(
      (
        await owner.call({
          kind: "mirror",
          operation: {
            kind: "bodies",
            ids: [body.id],
            plane: { origin: [10, 0, 0], normal: [1, 0, 0] },
            keepOriginal: true,
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const copy = instances(owner)[1];
    assert.deepEqual(copy.settings, settings);
    assert.equal(copy.problem, undefined);
    approximate(copy.frame.origin, [20, 0, 0]);
    assert.equal(
      (
        await owner.call({
          kind: "scale",
          operation: {
            kind: "solids",
            ids: [copy.faces[0].body],
            faces: [],
            edges: [],
            pivot: [0, 0, 0],
            factor: 2,
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const scaled = instances(owner)[1];
    assert.deepEqual(scaled.settings, settings);
    assert.equal(scaled.problem, undefined);
    approximate(scaled.frame.origin, [40, 0, 0]);
    assert.equal(
      (
        await owner.call({
          kind: "scale",
          operation: {
            kind: "solids",
            ids: [body.id],
            faces: [],
            edges: [],
            pivot: [0, 0, 0],
            factor: 1,
            factors: [2, 1, 1],
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    assert.match(instances(owner)[0].problem ?? "", /cylindrical/);
    await owner.call({ kind: "undo" });
    assert.equal(instances(owner)[0].problem, undefined);
  } finally {
    owner.close();
  }
});

test("imprinted and split cylinder descendants retain one helix; removal and continuation preserve its phase", async () => {
  const runtime = await initializeMeshRuntime();
  const owner = new DocumentOwner();
  try {
    const body = await decoratedCylinder(owner);
    const original = instances(owner)[0];
    const frame = { ...planes.XY, origin: [0, 0, 5] as Vector };
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "imprint",
            targets: [{ body: body.id, faces: original.faces.map((f) => f.face) }],
            frame,
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const split = instances(owner)[0];
    assert.equal(split.faces.length, 2);
    assert.equal(split.problem, undefined);
    assert.deepEqual(split.frame, original.frame);
    assert.equal(decoratedMeshes(runtime, owner.view.data).length, 1);
    const removed = split.faces[0];
    await owner.call({ kind: "decorator", edit: { action: "remove", faces: [removed] } });
    assert.equal(instances(owner)[0].faces.length, 1);
    assert.deepEqual(instances(owner)[0].frame, original.frame);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "continue", id: split.id, faces: [removed] },
        })
      ).error,
      undefined,
    );
    assert.equal(instances(owner)[0].faces.length, 2);
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: [{ body: body.id }],
            frame,
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    assert.equal(instances(owner).length, 2);
    for (const instance of instances(owner)) {
      assert.equal(instance.problem, undefined);
      assert.deepEqual(instance.frame, original.frame);
      assert.equal(cylinderCoordinates(instance.frame, [5, 0, 7]).z, 7);
    }
    assert.equal(decoratedMeshes(runtime, owner.view.data).length, 2);
  } finally {
    owner.close();
  }
});
