import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DecoratorSession } from "../src/backend/decorator-session.js";
import type { MovementRequest } from "../src/backend/deferred-edit.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { prism, square } from "./body-edge-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/face-move-perforated.json", "utf8")) as {
  document: SketchDocument;
  request: MovementRequest;
};

test("captured face move draws the exact mesh before metadata and accepts only its completion", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const complete = await owner.call(fixture.request);
    assert.equal(complete.error, undefined);
    const expected = complete.view.candidate?.bodies?.[0];
    assert.ok(expected);
    const drawn = await owner.call({ ...fixture.request, presentation: "deferred" });
    assert.equal(drawn.error, undefined);
    const preview = drawn.view.visualPreview;
    assert.ok(preview);
    assert.equal(drawn.view.candidate, null);
    assert.equal(drawn.view.data, before);
    assert.deepEqual(preview.replaces, [expected.id]);
    assert.deepEqual(
      preview.bodies[0].faces,
      expected.faces.map((face) => face.vertices),
    );
    assert.deepEqual(
      preview.bodies[0].sourceFaces?.flat().sort(),
      expected.faces.map((face) => face.id).sort(),
    );
    assert.equal("volume" in preview.bodies[0], false);
    assert.equal("brep" in preview.bodies[0], false);
    assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
    assert.ok(owner.view.visualPreview, "A rejected premature Accept preserves the drawing");
    const finished = await owner.call({ kind: "complete-preview" });
    assert.equal(finished.error, undefined);
    assert.deepEqual(finished.view.candidate?.bodies?.[0], expected);
    assert.equal(finished.view.visualPreview, undefined);
    assert.equal(finished.view.data, before);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    const history = (await owner.call({ kind: "read-history" })).history ?? [];
    assert.equal(history.filter((entry) => entry.outcome === "changed").length, 1);
    assert.equal(
      history.find((entry) => entry.outcome === "changed")?.operation.kind,
      "move-faces",
    );
  } finally {
    owner.close();
  }
});

test("a newer box movement replaces uncompleted geometry; discard and rejection invalidate it", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) =>
      f.vertices.every((n, i) => i % 3 !== 2 || Math.abs(n - 10) < 1e-6),
    );
    assert.ok(face);
    const operation = {
      faces: [{ body: body.id, face: face.id }],
      translation: [2, 0, 0] as [number, number, number],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
    };
    const request = { kind: "move-faces", operation, presentation: "deferred" } as const;
    assert.equal((await owner.call(request)).error, undefined);
    assert.equal(
      (await owner.call({ ...request, operation: { ...operation, translation: [4, 0, 0] } })).error,
      undefined,
    );
    const finished = await owner.call({ kind: "complete-preview" });
    assert.equal(finished.error, undefined);
    const moved = finished.view.candidate?.bodies?.[0];
    assert.ok(moved);
    assert.ok(Math.abs(moved.bounds[3] - body.bounds[3] - 4) < 1e-6);
    assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
    assert.match((await owner.call({ kind: "complete-preview" })).error ?? "", /No preview/);
    assert.equal((await owner.call(request)).error, undefined);
    await owner.call({ kind: "discard" });
    assert.match((await owner.call({ kind: "complete-preview" })).error ?? "", /No preview/);
    assert.equal((await owner.call(request)).error, undefined);
    assert.ok(
      (await owner.call({ ...request, operation: { ...operation, translation: [0, 0, -10] } }))
        .error,
    );
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.visualPreview, undefined);
    assert.ok((await owner.call({ kind: "complete-preview" })).error);
  } finally {
    owner.close();
  }
});

test("superseding after native completion cancels late decorator publication", async (context) => {
  const owner = new DocumentOwner();
  let release = () => {},
    enter = () => {};
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const before = owner.view.data;
    await owner.call({ ...fixture.request, presentation: "deferred" });
    const decorators = Reflect.get(owner, "decorators") as DecoratorSession;
    const original = decorators.continue.bind(decorators);
    context.mock.method(decorators, "continue", async (document: SketchDocument) => {
      const result = await original(document);
      enter();
      await released;
      return result;
    });
    const completing = owner.call({ kind: "complete-preview" });
    await entered;
    const replacing = owner.call({ kind: "supersede-preview", interrupt: true });
    release();
    assert.match((await completing).error ?? "", /Preview superseded/);
    await replacing;
    assert.equal(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
    context.mock.restoreAll();
    assert.equal(
      (await owner.call({ ...fixture.request, presentation: "deferred" })).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "complete-preview" })).error, undefined);
  } finally {
    release();
    owner.close();
  }
});

test("edge movement completion reuses the drawn geometry and preserves exact topology", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((face) =>
      face.vertices.every((n, i) => i % 3 !== 2 || Math.abs(n - 10) < 1e-6),
    );
    assert.ok(face);
    const request = {
      kind: "move-edges" as const,
      operation: {
        edges: face.edges.map((edge) => ({ body: body.id, edge })),
        translation: [2, 0, 0] as [number, number, number],
        pivot: [0, 0, 0] as [number, number, number],
        axis: [0, 0, 1] as [number, number, number],
        angle: 0,
      },
    };
    const expected = await owner.call(request);
    assert.equal(expected.error, undefined);
    assert.ok(expected.view.candidate);
    const visual = await owner.call({ ...request, presentation: "deferred" });
    assert.equal(visual.error, undefined);
    assert.ok(visual.view.visualPreview);
    const completed = await owner.call({ kind: "complete-preview" });
    assert.equal(completed.error, undefined);
    assert.deepEqual(completed.view.candidate, expected.view.candidate);
  } finally {
    owner.close();
  }
});
