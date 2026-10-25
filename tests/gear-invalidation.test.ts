import assert from "node:assert/strict";
import test from "node:test";
import { DecoratorSession } from "../src/backend/decorator-session.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { continueDecorators } from "../src/decorators/continuation.js";
import { refitGearGroups, unchangedGearGroup } from "../src/decorators/gear-group-fit.js";
import { continueGearGroups } from "../src/decorators/gear-support.js";
import { previewSignatures } from "../src/decorators/preview-signatures.js";
import { topologyOrigins } from "../src/model/body-correspondence.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { roundBody } from "./decorator-domain-fixtures.js";
import { captured } from "./gear-group-fixture.js";

test("sketch creation and unrelated native face edits retain gear configs and previews", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    const unrelated = await roundBody(owner);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.gear", faces },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const signatures = previewSignatures(before, "[]");
    const sketch = emptySketch(planes.XY);
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(owner.view.data.decorators, before.decorators);
    assert.deepEqual(previewSignatures(owner.view.data, "[]"), signatures);
    const face = unrelated.faces.find((f) => f.cylinder);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "offset-faces",
          operation: {
            faces: [{ body: unrelated.id, face: face.id }],
            distance: 0.1,
          },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(previewSignatures(owner.view.data, "[]"), signatures);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.deepEqual(owner.view.data.decorators, before.decorators);
    assert.deepEqual(previewSignatures(owner.view.data, "[]"), signatures);
    for (const kind of ["undo", "redo"] as const) {
      assert.equal((await owner.call({ kind })).error, undefined);
      assert.deepEqual(previewSignatures(owner.view.data, "[]"), signatures);
    }
  } finally {
    owner.close();
  }
});

test("unchanged selected geometry bypasses fitting, including same-body unrelated faces", async (context) => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: "freac.gear", faces },
    });
    const source = owner.view.data;
    const body = source.bodies?.[0];
    assert.ok(body);
    const extra = { ...body.faces[0], id: "unrelated", edges: [] };
    const changed = {
      ...body,
      center: [999, 0, 0] as [number, number, number],
      faces: [...body.faces, extra],
    };
    topologyOrigins.set(changed, {
      bodies: [body.id],
      copy: false,
      faces: new Map(body.faces.map((face) => [face.id, [face.id]])),
    });
    const candidate = { ...source, bodies: source.bodies?.map((b) => (b === body ? changed : b)) };
    const continued = continueDecorators(source, candidate);
    assert.ok(continued.decorators?.every((d, i) => d === source.decorators?.[i]));
    const sine = context.mock.method(Math, "sin");
    const session = new DecoratorSession();
    assert.equal(await session.continue(continued, source), continued);
    assert.equal(sine.mock.callCount(), 0, "no tooth fitting or profile diagnostics run");
    assert.deepEqual(previewSignatures(continued, "[]"), previewSignatures(source, "[]"));
    const members = source.decorators ?? [];
    const changedSettings = {
      ...source,
      decorators: members.map((d, i) =>
        i
          ? d
          : {
              ...d,
              settings: { ...d.settings, minimumTooth: 0.3 },
            },
      ),
    };
    assert.equal(unchangedGearGroup(source, changedSettings, changedSettings.decorators), false);
    continueGearGroups(changedSettings, source);
    assert.ok(sine.mock.callCount() > 0, "changed fitting limits still run fitting");
  } finally {
    context.mock.restoreAll();
    owner.close();
  }
});

test("gear preview keys track effective local geometry, state and fitted dimensions", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    await owner.call({
      kind: "decorator",
      edit: { action: "apply", definition: "freac.gear", faces },
    });
    const source = owner.view.data;
    const gear = source.decorators?.[0];
    const body = source.bodies?.find((b) => b.id === gear?.faces[0].body);
    assert.ok(gear && body);
    const signature = (document: SketchDocument) => previewSignatures(document, "[]").get(gear.id);
    const before = signature(source);
    assert.equal(
      signature(refitGearGroups(structuredClone(source))),
      before,
      "an equal refit preserves the preview key",
    );
    assert.equal(signature(structuredClone(source)), before);
    for (const patch of [
      { gearPitchRadius: (gear.gearPitchRadius ?? 13) + 0.01 },
      { state: { changed: true } },
      { settings: { ...gear.settings, phase: Number(gear.settings.phase) + 1 } },
      { frame: { ...gear.frame, origin: [1, 2, 3] as [number, number, number] } },
    ]) {
      assert.notEqual(
        signature({
          ...source,
          decorators: source.decorators?.map((d) => (d === gear ? { ...d, ...patch } : d)),
        }),
        before,
      );
    }
    assert.equal(
      signature({
        ...source,
        decorators: source.decorators?.map((d) => ({ ...d, presetId: "renamed" })),
      }),
      before,
    );
    const support = body.faces.find((f) => f.id === gear.faces[0].face);
    const neighbor = body.faces.find(
      (f) => f.id !== support?.id && f.edges.some((edge) => support?.edges.includes(edge)),
    );
    assert.ok(support && neighbor);
    const editedBody = {
      ...body,
      faces: body.faces.map((f) =>
        f === neighbor ? { ...f, vertices: f.vertices.map((v) => v + 0.1) } : f,
      ),
    };
    assert.notEqual(
      signature({ ...source, bodies: source.bodies?.map((b) => (b === body ? editedBody : b)) }),
      before,
    );
    assert.equal(
      unchangedGearGroup(source, { ...source, decorators: [gear] }, [gear]),
      false,
      "membership changes refit survivors",
    );
  } finally {
    owner.close();
  }
});

test("internal gear fitting tracks a nonadjacent outer wall", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [15, 10]);
    const inner = body.faces.find((face) => face.cylinder?.outward === -1);
    const outer = body.faces.find((face) => face.cylinder?.outward === 1);
    assert.ok(inner && outer?.cylinder);
    const outerCylinder = outer.cylinder;
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.gear",
            faces: [{ body: body.id, face: inner.id }],
          },
        })
      ).error,
      undefined,
    );
    const source = owner.view.data;
    const members = source.decorators ?? [];
    assert.equal(members.length, 1);
    assert.equal(members[0].problem, undefined);
    // Keep the selected face byte-identical to isolate the fitter's wall dependency.
    const changed = {
      ...body,
      faces: body.faces.map((face) =>
        face === outer ? { ...face, cylinder: { ...outerCylinder, radius: 10.2 } } : face,
      ),
    };
    const candidate = { ...source, bodies: [changed] };
    assert.equal(unchangedGearGroup(source, candidate, members), false);
    assert.match(continueGearGroups(candidate, source).decorators?.[0].problem ?? "", /cannot fit/);
    const missing = {
      ...members[0],
      faces: [{ body: body.id, face: "removed" }],
      problem: "Reassign the gear",
    };
    const unresolved = { ...source, decorators: [missing] };
    assert.equal(
      unchangedGearGroup(unresolved, { ...candidate, decorators: [missing] }, [missing]),
      false,
    );
  } finally {
    owner.close();
  }
});
