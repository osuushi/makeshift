import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { defaultSketchGrid } from "../src/sketch/grid-settings.js";
import type { ModelReply, ModelRequest } from "../src/sketch/model-api.js";
import { ModelClient } from "../src/sketch/model-client.js";
import { type Point, planes } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";
import { profileCall } from "./profile-fixtures.js";

async function openCylinder(owner: DocumentOwner) {
  const cylinder = await lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      { id: "disk", kind: "circle", center: { x: 0, y: 0 }, radius: 4, construction: false },
    ],
  });
  const wall = cylinder.faces.find((face) => face.cylinder);
  assert.ok(wall);
  const { data } = await profileCall(owner, {
    kind: "open",
    document: { ...owner.view.data, sketches: [] },
  });
  const selection = { body: cylinder.id, faces: [wall.id] };
  const { profileEdit } = await profileCall(owner, { kind: "begin-profile-edit", selection });
  assert.ok(profileEdit);
  return { data, selection, sketch: profileEdit.sketch };
}

function withRadius(sketch: Sketch, radius: number): Sketch {
  const move = (point: Point) => ({ ...point, x: Math.abs(point.x) < 1e-7 ? 0 : radius });
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      assert.equal(curve.kind, "segment");
      return { ...curve, a: move(curve.a), b: move(curve.b) };
    }),
  };
}

function gate() {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

test("profile gestures continue during a rebuild and Apply commits only the latest shape", {
  timeout: 12000,
}, async (context) => {
  const owner = new DocumentOwner();
  const first = gate(),
    latest = gate(),
    latestStarted = gate();
  const calculate = SolidCalculator.prototype.calculate;
  let rebuilds = 0;
  context.mock.method(
    SolidCalculator.prototype,
    "calculate",
    function (this: SolidCalculator, input: KernelRequest) {
      const result = calculate.call(this, input);
      if (input.kind !== "replace-revolved-profile") return result;
      if (++rebuilds === 1) return Promise.all([result, first.wait]).then(([reply]) => reply);
      latestStarted.release();
      return Promise.all([result, latest.wait]).then(([reply]) => reply);
    },
  );
  try {
    const { data, sketch, selection } = await openCylinder(owner);
    const edited = await owner.call({ kind: "edit", sketch: withRadius(sketch, 5) });
    assert.equal(edited.error, undefined);
    assert.ok(edited.view.profileEdit?.pending);
    assert.equal(edited.view.data, data);

    const next = await owner.call({ kind: "preview", sketch: withRadius(sketch, 6) });
    assert.equal(next.error, undefined);
    assert.ok(next.view.profileEdit?.draft);
    const released = await owner.call({ kind: "accept" });
    assert.equal(released.error, undefined);
    assert.ok(released.view.profileEdit?.pending);
    assert.deepEqual(released.view.profileEdit.sketch.curves, next.view.profileEdit.draft.curves);
    const final = await owner.call({ kind: "edit", sketch: withRadius(sketch, 7) });
    assert.equal(final.error, undefined);
    assert.ok(final.view.profileEdit?.pending && final.view.profileEdit.canUndo);
    assert.equal(rebuilds, 1);

    const applying = owner.call({ kind: "apply-profile-edit" });
    first.release();
    await latestStarted.wait;
    assert.equal(owner.view.data, data);
    assert.equal(owner.view.profileEdit?.preview, undefined);
    latest.release();
    const reply = await applying;
    assert.equal(reply.error, undefined);
    assert.equal(rebuilds, 2);
    assert.equal(reply.view.profileEdit, undefined);
    const wall = reply.view.data.bodies?.[0].faces.find((face) => face.id === selection.faces[0]);
    assert.ok(wall?.cylinder && Math.abs(wall.cylinder.radius - 7) < 1e-7);
    assert.equal(reply.appliedProfile?.body, selection.body);
    const undone = await profileCall(owner, { kind: "undo" });
    assert.equal(undone.data, data);
    assert.equal(undone.canUndo, false);
  } finally {
    first.release();
    latest.release();
    owner.close();
  }
});

test("an open sketch prevents applying an older pending profile and Cancel discards the job", {
  timeout: 12000,
}, async (context) => {
  const owner = new DocumentOwner();
  const first = gate();
  const calculate = SolidCalculator.prototype.calculate;
  context.mock.method(
    SolidCalculator.prototype,
    "calculate",
    function (this: SolidCalculator, input: KernelRequest) {
      const result = calculate.call(this, input);
      return input.kind === "replace-revolved-profile"
        ? Promise.all([result, first.wait]).then(([reply]) => reply)
        : result;
    },
  );
  try {
    const { data, sketch } = await openCylinder(owner);
    const edited = await owner.call({ kind: "edit", sketch: withRadius(sketch, 5) });
    assert.ok(edited.view.profileEdit?.pending);
    const cleared = await owner.call({ kind: "clear", sketchId: sketch.id });
    assert.equal(cleared.error, undefined);
    assert.equal(cleared.view.profileEdit?.pending, false);
    assert.match((await owner.call({ kind: "apply-profile-edit" })).error ?? "", /close a region/i);
    assert.equal((await profileCall(owner, { kind: "cancel-profile-edit" })).data, data);
    first.release();
    assert.equal(
      (await profileCall(owner, { kind: "read-profile-preview" })).profileEdit,
      undefined,
    );
    assert.equal(owner.view.canUndo, false);
  } finally {
    first.release();
    owner.close();
  }
});

test("Reopen restores the applied sketch and exact solid, with Cancel and Redo on the original branch", async () => {
  const owner = new DocumentOwner();
  try {
    const { data, selection, sketch } = await openCylinder(owner);
    const resized = withRadius(sketch, 5);
    const widened: Sketch = {
      ...resized,
      curves: [
        ...resized.curves,
        {
          id: "reference",
          kind: "segment",
          a: { x: 2, y: 1 },
          b: { x: 2, y: 8 },
          construction: true,
        },
      ],
    };
    const { profileEdit } = await profileCall(owner, { kind: "edit", sketch: widened });
    assert.ok(profileEdit?.preview);
    const applied = await profileCall(owner, { kind: "apply-profile-edit" });
    assert.deepEqual(applied.reopenOperation?.request, { kind: "begin-profile-edit", selection });

    const reopened = await profileCall(owner, { kind: "reopen" });
    assert.equal(reopened.data, data);
    assert.equal(reopened.candidate, null);
    assert.deepEqual(reopened.profileEdit?.sketch, profileEdit.sketch);
    assert.equal(reopened.profileEdit?.preview, applied.data.bodies?.[0]);
    assert.equal(reopened.profileEdit.canUndo, false);
    assert.equal(reopened.profileEdit.pending, false);
    assert.equal((await profileCall(owner, { kind: "cancel-profile-edit" })).data, data);
    assert.equal((await profileCall(owner, { kind: "redo" })).data, applied.data);

    await profileCall(owner, { kind: "reopen" });
    const recopied = await profileCall(owner, { kind: "apply-profile-edit" });
    assert.deepEqual(recopied.data, applied.data);
    const resumed = await profileCall(owner, { kind: "reopen" });
    assert.ok(resumed.profileEdit);
    await owner.call({ kind: "edit", sketch: withRadius(resumed.profileEdit.sketch, 6) });
    const replaced = await profileCall(owner, { kind: "apply-profile-edit" });
    assert.ok((replaced.data.bodies?.[0].volume ?? 0) > (applied.data.bodies?.[0].volume ?? 0));
    const undone = await profileCall(owner, { kind: "undo" });
    assert.equal(undone.data, data);
    assert.equal(undone.canUndo, false);
  } finally {
    owner.close();
  }
});

test("the renderer publishes the latest solid without adopting an older sketch or error", async (context) => {
  const first = gate(),
    latest = gate(),
    latestStarted = gate(),
    published = gate();
  const initial = emptySketch(planes.XY);
  const edited: Sketch = {
    ...initial,
    curves: [
      {
        id: "extra",
        kind: "segment",
        a: { x: 0, y: 0 },
        b: { x: 1, y: 1 },
        construction: true,
      },
    ],
  };
  const response = (sketch: Sketch, pending: boolean, removedDimples = 0): ModelReply => ({
    view: {
      data: { units: "mm", sketches: [], sketchGrid: defaultSketchGrid },
      candidate: null,
      canUndo: false,
      canRedo: false,
      solveCount: 0,
      solveMs: 0,
      profileEdit: {
        body: "stock",
        sketch,
        height: 10,
        endGuides: false,
        pending,
        canUndo: sketch === edited,
        canRedo: false,
        removedDimples,
      },
    },
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let reads = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      makeshiftModel: async (request: ModelRequest) => {
        if (request.kind === "edit") return response(request.sketch, true);
        assert.equal(request.kind, "read-profile-preview");
        if (++reads === 1) {
          await first.wait;
          return { ...response(initial, false), error: "Obsolete result" };
        }
        latestStarted.release();
        await latest.wait;
        return response(edited, false, 1);
      },
    },
  });
  context.after(() => {
    first.release();
    latest.release();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const errors: string[] = [];
  const client = new ModelClient(
    () => {
      if (client.profileEdit?.removedDimples === 1) published.release();
    },
    (message) => {
      if (message) errors.push(message);
    },
  );
  assert.ok(await client.request({ kind: "edit", sketch: initial }));
  assert.ok(client.profileEdit?.pending && !client.busy);
  assert.ok(await client.request({ kind: "edit", sketch: edited }));
  assert.ok(client.profileEdit?.pending && client.canUndo && !client.busy);
  first.release();
  await latestStarted.wait;
  assert.deepEqual(client.profileEdit.sketch, edited);
  latest.release();
  await published.wait;
  assert.equal(client.profileEdit.pending, false);
  assert.deepEqual(client.profileEdit.sketch, edited);
  assert.deepEqual(errors, []);
});
