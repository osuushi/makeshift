import assert from "node:assert/strict";
import test from "node:test";
import type { DecoratorSession } from "../src/backend/decorator-session.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";
import { feature, selected } from "./face-movement-fixtures.js";

function gate() {
  let enter = () => {},
    release = () => {};
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    async pause() {
      enter();
      await released;
    },
  };
}

async function redoBaseline(owner: DocumentOwner, body: string) {
  await owner.call({
    kind: "selection",
    changes: {
      baseline: { workspace: null, sketch: [], modeling: [{ kind: "body", body }] },
      steps: [],
    },
  });
  await owner.call({ kind: "construction-plane", plane: { id: "datum", frame: planes.XY } });
  await owner.call({ kind: "undo" });
  assert.equal(owner.view.canRedo, true);
  return owner.view;
}

for (const kind of ["transform-bodies", "delete-entities", "delete-topology"] as const) {
  test(`cancel ${kind} after real geometry completes preserves publication and Redo`, async (context) => {
    const owner = new DocumentOwner(),
      pause = gate();
    try {
      let body = await prism(owner, square);
      if (kind === "delete-topology") body = await feature(owner, "hole");
      const before = await redoBaseline(owner, body.id);
      const count = (await owner.call({ kind: "read-history" })).history?.length;
      const session = Reflect.get(owner, "decorators") as DecoratorSession;
      const continuation = session.continue.bind(session);
      context.mock.method(session, "continue", async (document: SketchDocument) => {
        const result = await continuation(document);
        assert.notDeepEqual(result, before.data, "real calculation produced changed geometry");
        await pause.pause();
        return result;
      });
      const request: ModelRequest =
        kind === "transform-bodies"
          ? {
              kind,
              transform: {
                ids: [body.id],
                translation: [5, 0, 0],
                pivot: [0, 0, 0],
                axis: [0, 0, 1],
                angle: 0,
                duplicate: false,
              },
            }
          : kind === "delete-entities"
            ? { kind, bodyIds: [body.id], sketchIds: [] }
            : {
                kind,
                selection: [
                  {
                    body: body.id,
                    whole: false,
                    faces: selected(body, "hole").map((t) => t.face),
                    edges: [],
                  },
                ],
              };
      const pending = owner.call(request);
      await pause.entered;
      const cancelling = owner.call({ kind: "cancel-preview" });
      pause.release();
      assert.match((await pending).error ?? "", /cancelled/);
      assert.equal((await cancelling).error, undefined);
      assert.equal(owner.view.data, before.data);
      assert.equal(owner.view.candidate, null);
      assert.deepEqual(owner.view.historySelection, before.historySelection);
      assert.equal(owner.view.canUndo, before.canUndo);
      assert.equal(owner.view.canRedo, true);
      const history = (await owner.call({ kind: "read-history" })).history;
      assert.equal(history?.length, (count ?? 0) + 1);
      assert.equal(history?.at(-1)?.outcome, "cancelled");
      context.mock.restoreAll();
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data.constructionPlanes?.[0].id, "datum");
    } finally {
      pause.release();
      owner.close();
    }
  });
}

test("cancel Open after native inspection retains the old document, selection and history", async (context) => {
  const owner = new DocumentOwner(),
    pause = gate();
  try {
    const body = await prism(owner, square);
    const before = await redoBaseline(owner, body.id);
    const count = (await owner.call({ kind: "read-history" })).history?.length;
    const kernel = Reflect.get(owner, "kernel") as SolidCalculator;
    const calculate = kernel.calculate.bind(kernel);
    context.mock.method(kernel, "calculate", async (...args: Parameters<typeof calculate>) => {
      const result = await calculate(...args);
      await pause.pause();
      return result;
    });
    const pending = owner.call({
      kind: "open",
      document: { units: "mm", sketches: [], bodies: [body] },
    });
    await pause.entered;
    const cancelling = owner.call({ kind: "cancel-preview" });
    pause.release();
    assert.match((await pending).error ?? "", /cancelled/);
    assert.equal((await cancelling).error, undefined);
    assert.equal(owner.view.data, before.data);
    assert.deepEqual(owner.view.historySelection, before.historySelection);
    assert.equal(owner.view.canRedo, true);
    const history = (await owner.call({ kind: "read-history" })).history;
    assert.equal(history?.length, (count ?? 0) + 1);
    assert.equal(history?.at(-1)?.outcome, "cancelled");
    context.mock.restoreAll();
    assert.equal((await owner.call({ kind: "open", document: before.data })).error, undefined);
  } finally {
    pause.release();
    owner.close();
  }
});

test("explicit Accept completes while cancellation is rejected", async (context) => {
  const owner = new DocumentOwner(),
    pause = gate();
  try {
    const body = await prism(owner, square),
      before = owner.view.data;
    const face = body.faces.find((f) => f.vertices.every((v, i) => i % 3 !== 2 || v === 10));
    assert.ok(face);
    await owner.call({
      kind: "extrude",
      extrusion: { sources: [{ face: face.id }], distance: 2, mode: "union" },
    });
    const session = Reflect.get(owner, "decorators") as DecoratorSession;
    const continuation = session.continue.bind(session);
    context.mock.method(session, "continue", async (document: SketchDocument) => {
      const result = await continuation(document);
      await pause.pause();
      return result;
    });
    const pending = owner.call({ kind: "accept" });
    await pause.entered;
    assert.match((await owner.call({ kind: "cancel-preview" })).error ?? "", /current edit/);
    pause.release();
    assert.equal((await pending).error, undefined);
    assert.ok(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - 4800) < 1e-6);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
  } finally {
    pause.release();
    owner.close();
  }
});
