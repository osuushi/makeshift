import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { type Affine, affinePoint, identityAffine } from "../src/model/affine.js";
import type { Body } from "../src/model/body.js";
import { archivedDrawing, drawingArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import type { SmartObjectEdit } from "../src/model/smart-object.js";
import { emptySketch, newId } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes, worldPoint } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

async function apply(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined, JSON.stringify(request));
  return reply.view;
}
const smart = (owner: DocumentOwner, edit: SmartObjectEdit) =>
  apply(owner, { kind: "smart-object", edit });
const openBench = (owner: DocumentOwner, id: string) =>
  apply(owner, { kind: "bench", edit: { action: "switch", id } });
const addBench = (owner: DocumentOwner) =>
  apply(owner, { kind: "bench", edit: { action: "create" } });

async function stock(owner: DocumentOwner) {
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 8, y: 6 }).sketch;
  await apply(owner, { kind: "edit", sketch });
  await apply(owner, {
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 4,
      mode: "new",
    },
  });
  const view = await apply(owner, { kind: "accept" });
  const body = view.data.bodies?.[0];
  assert.ok(body);
  return { sketch, body, id: owner.drawing.activeBench };
}

function checkDetachedBody(body: Body | undefined, source: Body): void {
  assert.ok(body);
  assert.notEqual(body.id, source.id);
  assert.ok(Math.abs(body.volume - 2 * source.volume) < 1e-6);
  const bounds = [14, -3, 0, 33, 4, 4];
  for (const [i, actual] of body.bounds.entries())
    assert.ok(Math.abs(actual - bounds[i]) < 1e-5, `Expected ${bounds[i]}, got ${actual}`);
}

test("linked placements share source edits and detach to fresh exact geometry at a general affine placement", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await stock(owner);
    await addBench(owner);
    const parent = owner.drawing.activeBench;
    await smart(owner, { action: "insert", source: source.id });
    const first = owner.view.data.smartObjects?.[0];
    assert.ok(first);
    await smart(owner, { action: "insert", source: source.id });
    const matrix: Affine = [-2, 0.5, 0, 30, 0, 1, 0.25, -3, 0, 0, 1, 0];
    const transformed = await smart(owner, {
      action: "transform",
      ids: [first.id],
      transform: matrix,
      absolute: true,
    });
    assert.deepEqual(
      transformed.data.smartObjects?.map(({ transform }) => transform),
      [matrix, identityAffine],
    );
    assert.equal(transformed.data.bodies?.length ?? 0, 0);
    assert.equal(transformed.linkedBenches?.length, 1);
    const exported = await owner.call({
      kind: "export-geometry",
      bodyIds: [],
      smartObjectIds: [first.id],
    });
    assert.equal(exported.error, undefined);
    assert.equal(exported.exportDocument?.bodies?.length, 1);
    assert.ok(
      Math.abs((exported.exportDocument?.bodies?.[0].volume ?? 0) - 2 * source.body.volume) < 1e-6,
    );
    assert.equal(owner.view.data, transformed.data);

    const inside = await smart(owner, { action: "enter", id: first.id });
    assert.equal(inside.activeBench, parent);
    assert.equal(inside.editingBench, source.id);
    assert.equal(inside.inline?.[0].placement.id, first.id);
    assert.ok(inside.linkedBenches?.some(({ id }) => id === parent));
    const added = rectangle(emptySketch(planes.XZ), { x: 2, y: 1 }, { x: 4, y: 3 }).sketch;
    await apply(owner, { kind: "edit", sketch: added });
    await apply(owner, { kind: "undo" });
    assert.equal(owner.view.data.sketches.length, 1);
    await apply(owner, { kind: "redo" });
    await smart(owner, { action: "exit" });
    assert.equal(owner.view.linkedBenches?.[0].display.sketches.length, 2);
    await smart(owner, { action: "source", id: first.id });
    assert.equal(owner.drawing.activeBench, source.id);
    assert.equal(owner.view.data.sketches[1].id, added.id);
    await openBench(owner, parent);

    const detached = await smart(owner, { action: "detach", ids: [first.id] });
    checkDetachedBody(detached.data.bodies?.[0], source.body);
    const original = source.sketch.curves[0];
    const copy = detached.data.sketches[0];
    const edge = copy.curves[0];
    assert.equal(original.kind, "segment");
    assert.equal(edge.kind, "segment");
    const corner = affinePoint(matrix, worldPoint(source.sketch.plane, original.a));
    const mapped = worldPoint(copy.plane, edge.a);
    assert.ok(Math.hypot(...mapped.map((value, i) => value - corner[i])) < 1e-8);
    assert.equal(detached.data.smartObjects?.length, 1);
    await apply(owner, { kind: "undo" });
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    assert.deepEqual(owner.view.data.smartObjects?.[0].transform, matrix);

    const archive = drawingArchive(owner.drawing);
    assert.equal(JSON.parse(archive).version, 5);
    const portable = readPortableArchive(
      writePortableArchive(archive, { "workspace/notes": new Uint8Array([1]) }),
    );
    await apply(owner, { kind: "open", drawing: archivedDrawing(portable) });
    assert.equal(owner.drawing.activeBench, parent);
    assert.deepEqual(owner.view.data.smartObjects?.[0].transform, matrix);
    assert.equal(owner.view.linkedBenches?.[0].display.bodies?.[0].id, source.body.id);
  } finally {
    owner.close();
  }
});

test("converting a mixed selection opens its source and Undo restores the parent selection's geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const parent = await stock(owner);
    const other = (await addBench(owner)).activeBench ?? "";
    await openBench(owner, parent.id);
    await smart(owner, { action: "insert", source: other });
    const object = owner.view.data.smartObjects?.[0];
    assert.ok(object);
    const inside = await smart(owner, {
      action: "convert",
      selection: { bodies: [parent.body.id], sketches: [parent.sketch.id], instances: [object.id] },
    });
    assert.notEqual(inside.activeBench, parent.id);
    assert.equal(inside.data.bodies?.[0].id, parent.body.id);
    assert.equal(inside.data.sketches[0].id, parent.sketch.id);
    assert.deepEqual(inside.data.smartObjects, [object]);
    const source = inside.activeBench;
    await openBench(owner, parent.id);
    assert.equal(owner.view.data.bodies?.length, 0);
    assert.equal(owner.view.data.sketches.length, 0);
    const wrapper = owner.view.data.smartObjects?.[0];
    assert.ok(wrapper);
    assert.equal(wrapper.source, source);
    await smart(owner, { action: "enter", id: wrapper.id });
    const nested = await smart(owner, { action: "enter", id: object.id });
    assert.equal(nested.activeBench, parent.id);
    assert.equal(nested.editingBench, other);
    assert.equal((await smart(owner, { action: "exit" })).editingBench, source);
    assert.equal((await smart(owner, { action: "exit" })).editingBench, parent.id);
    await apply(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data.smartObjects, [object]);
    assert.equal(owner.view.data.bodies?.[0].id, parent.body.id);
    await apply(owner, { kind: "redo" });
    assert.equal(owner.view.data.smartObjects?.[0].source, source);
  } finally {
    owner.close();
  }
});

test("converting a region with one of its entire curves moves each selected span once", async () => {
  const owner = new DocumentOwner();
  try {
    const parent = owner.drawing.activeBench;
    const rect = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 8, y: 6 }).sketch;
    const bottom = rect.curves.find(
      (curve) => curve.kind === "segment" && curve.a.y === 0 && curve.b.y === 0,
    );
    assert.ok(bottom?.kind === "segment");
    const full = { ...bottom, a: { x: -3, y: 0 }, b: { x: 10, y: 0 } };
    const outside = { ...bottom, id: newId(), a: { x: 12, y: 2 }, b: { x: 14, y: 2 } };
    const sketch = {
      ...rect,
      curves: [...rect.curves.map((curve) => (curve.id === bottom.id ? full : curve)), outside],
      constraints: [],
      groups: [],
    };
    await apply(owner, { kind: "edit", sketch });
    const [profile] = profilesFor(sketch);
    assert.ok(profile);
    const source = await smart(owner, {
      action: "convert",
      selection: {
        bodies: [],
        sketches: [],
        instances: [],
        curves: [{ sketch: sketch.id, ids: [full.id] }],
        profiles: [{ sketch: sketch.id, profile: profile.key }],
      },
    });
    const [moved] = source.data.sketches;
    assert.equal(moved.curves.length, 4);
    assert.equal(profilesFor(moved).length, 1);
    await openBench(owner, parent);
    assert.deepEqual(owner.view.data.sketches[0].curves, [outside]);
  } finally {
    owner.close();
  }
});

test("cycle and singular transform rejection preserves both accepted benches and their history", async () => {
  const owner = new DocumentOwner();
  try {
    const first = owner.drawing.activeBench;
    const second = (await addBench(owner)).activeBench ?? "";
    await smart(owner, { action: "insert", source: first });
    await openBench(owner, first);
    const before = owner.drawing;
    const cycle = await owner.call({
      kind: "smart-object",
      edit: { action: "insert", source: second },
    });
    assert.match(cycle.error ?? "", /own bench/);
    assert.deepEqual(owner.drawing, before);
    await openBench(owner, second);
    const instance = owner.view.data.smartObjects?.[0];
    assert.ok(instance);
    const singular: Affine = [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0];
    const transform = await owner.call({
      kind: "smart-object",
      edit: {
        action: "transform",
        ids: [instance.id],
        transform: singular,
      },
    });
    assert.match(transform.error ?? "", /independent axes/);
    assert.deepEqual(owner.view.data.smartObjects, [instance]);
    const repeated = await smart(owner, {
      action: "transform",
      ids: [instance.id],
      transform: identityAffine,
      duplicate: true,
    });
    const copy = repeated.data.smartObjects?.[1];
    assert.ok(copy);
    assert.notEqual(copy.id, instance.id);
    assert.equal(copy.source, instance.source);
    await apply(owner, {
      kind: "delete-entities",
      bodyIds: [],
      sketchIds: [],
      smartObjectIds: [instance.id, copy.id],
    });
    await openBench(owner, first);
    await smart(owner, { action: "insert", source: second });
    await openBench(owner, second);
    const undo = await owner.call({ kind: "undo" });
    assert.match(undo.error ?? "", /own bench/);
    assert.deepEqual(owner.view.data.smartObjects, []);
    assert.equal(owner.view.canUndo, true);
  } finally {
    owner.close();
  }
});
