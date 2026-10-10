import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { readClipboard, writeClipboard } from "../src/clipboard/geometry.js";
import { exactBodies } from "../src/model/exact-body.js";
import { copySelection } from "../src/sketch/copy-selection.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const rectangleSketch = () =>
  rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 5 }).sketch;

test("clipboard subsets paste onto a different plane with internal relationships and atomic Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = rectangleSketch();
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const subset = copySelection(sketch, new Set(sketch.curves.slice(0, 2).map((c) => c.id)));
    const text = writeClipboard({ sketches: [subset], bodies: [] });
    const before = owner.view.data;
    const target = { id: "target", plane: planes.XZ };
    assert.equal((await owner.call({ kind: "paste-geometry", text, target })).error, undefined);
    const pasted = owner.view.data.sketches[1];
    assert.deepEqual(pasted.plane, planes.XZ);
    assert.equal(pasted.curves.length, 2);
    assert.equal(pasted.constraints.length, subset.constraints.length);
    assert.equal(pasted.groups.length, 0);
    const first = owner.view.data;
    assert.equal((await owner.call({ kind: "paste-geometry", text, target })).error, undefined);
    const twice = owner.view.data;
    assert.equal(twice.sketches[1].curves.length, 4);
    assert.equal(new Set(twice.sketches[1].curves.map((c) => c.id)).size, 4);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, first);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, first);
  } finally {
    owner.close();
  }
});

test("body sets transfer exact geometry, names, appearance and tags across documents", async () => {
  const source = new DocumentOwner(),
    destination = new DocumentOwner();
  try {
    const { sketch, body, bodies } = await bodySet(source);
    const text = writeClipboard({
      sketches: [sketch],
      bodies: exactBodies(bodies),
      bodyAppearances: [{ body: body.id, color: "#123456", alpha: 0.7 }],
      entityPresentation: [{ id: body.id, name: "Plate" }],
      taggedGroups: [
        {
          id: "tag",
          body: body.id,
          name: "Cap",
          problems: [],
          members: [{ kind: "face", id: body.faces[0].id }],
        },
      ],
    });
    assert.ok(!text.includes('"vertices"'), "Clipboard omits display derivatives");
    const before = destination.view.data;
    assert.equal((await destination.call({ kind: "paste-geometry", text })).error, undefined);
    const pasted = destination.view.data;
    assert.equal(pasted.bodies?.length, 2);
    const ids = new Set(
      bodies.flatMap((b) => [b.id, ...b.faces.map((f) => f.id), ...b.edges.map((e) => e.id)]),
    );
    for (const [i, copy] of (pasted.bodies ?? []).entries()) {
      assert.ok(
        [copy.id, ...copy.faces.map((f) => f.id), ...copy.edges.map((e) => e.id)].every(
          (id) => !ids.has(id),
        ),
      );
      assert.ok(Math.abs(copy.volume - bodies[i].volume) < 1e-7);
      assert.deepEqual(
        copy.bounds.map((v) => Math.round(v * 1e6)),
        bodies[i].bounds.map((v) => Math.round(v * 1e6)),
      );
    }
    const copiedBody = pasted.bodies?.[0];
    assert.equal(pasted.bodyAppearances?.[0].body, copiedBody?.id);
    assert.equal(pasted.entityPresentation?.[0].name, "Plate");
    assert.equal(pasted.taggedGroups?.[0].members[0].id, copiedBody?.faces[0].id);
    await destination.call({ kind: "undo" });
    assert.deepEqual(destination.view.data, before);
    await destination.call({ kind: "redo" });
    assert.deepEqual(destination.view.data, pasted);
    assert.equal(
      (
        await destination.call({
          kind: "transform-bodies",
          transform: {
            ids: pasted.bodies?.map((b) => b.id) ?? [],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            translation: [0, 10, 0],
            duplicate: false,
          },
        })
      ).error,
      undefined,
      "Pasted bodies support ordinary exact edits",
    );
  } finally {
    source.close();
    destination.close();
  }
});

test("invalid clipboard input leaves accepted geometry and Undo intact", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = rectangleSketch();
    await owner.call({ kind: "edit", sketch });
    const before = owner.view.data;
    const duplicate = { ...sketch, curves: [sketch.curves[0], sketch.curves[0]] };
    for (const text of [
      "hello",
      "null",
      writeClipboard({ sketches: [duplicate], bodies: [] }),
      writeClipboard({
        sketches: [],
        bodies: [{ id: "bad", brep: "invalid", faces: [], edges: [] }],
      }),
    ]) {
      assert.ok((await owner.call({ kind: "paste-geometry", text })).error);
      assert.deepEqual(owner.view.data, before);
    }
    assert.throws(() =>
      readClipboard(JSON.stringify({ format: "makeshift-geometry", version: 3, geometry: {} })),
    );
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.sketches.length, 0);
  } finally {
    owner.close();
  }
});

async function bodySet(source: DocumentOwner) {
  const sketch = rectangleSketch();
  assert.equal((await source.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await source.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: 3,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await source.call({ kind: "accept" });
  const body = source.view.data.bodies?.[0];
  assert.ok(body);
  assert.equal(
    (
      await source.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
          translation: [20, 0, 0],
          duplicate: true,
        },
      })
    ).error,
    undefined,
  );
  return { sketch, body, bodies: source.view.data.bodies ?? [] };
}
