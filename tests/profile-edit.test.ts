import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import {
  type Curve,
  emptySketch,
  type Sketch,
  type SketchDocument,
} from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { type Point, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism } from "./body-edge-fixtures.js";

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}

async function revolve(owner: DocumentOwner, outline: Sketch, center: number, target?: string) {
  await call(owner, { kind: "edit", sketch: outline });
  await call(owner, {
    kind: "revolve",
    revolution: {
      axis: { origin: [center, 0, 0], direction: [0, 0, 1] },
      angle: 360,
      height: 0,
      mode: target ? "subtract" : "new",
      targets: target ? [target] : undefined,
      sources: [{ sketch: outline.id, profile: profilesFor(outline)[0].key }],
    },
  });
  return call(owner, { kind: "accept" });
}

const point = (x: number, y: number): Point => ({ x, y });
const span = (id: string, a: Point, b: Point) => ({ id, a, b, construction: false });
const line = (...args: Parameters<typeof span>): Curve => ({ kind: "segment", ...span(...args) });
const arc = (id: string, a: Point, b: Point, bulge: number): Curve => ({
  kind: "arc",
  ...span(id, a, b),
  bulge,
});

async function makeTurnedBody(owner: DocumentOwner): Promise<string> {
  const a = point(0, 0),
    b = point(7, 0),
    c = point(10, 3),
    d = point(10, 17);
  const e = point(7, 20),
    f = point(0, 20);
  const quarter = Math.tan(Math.PI / 8);
  const { data } = await revolve(
    owner,
    {
      ...emptySketch(planes.XZ),
      curves: [
        line("bottom", a, b),
        arc("lower", b, c, quarter),
        line("side", c, d),
        arc("upper", d, e, quarter),
        line("cap", e, f),
        line("axis", f, a),
      ],
    },
    0,
  );
  const target = data.bodies?.[0].id;
  assert.ok(target);
  const start = point(12, 7),
    end = point(12, 13);
  await revolve(
    owner,
    {
      ...emptySketch(planes.XZ),
      curves: [arc("sphere", start, end, 1), line("axis", end, start)],
    },
    12,
    target,
  );
  return target;
}

function moveRadially(sketch: Sketch, distance: number): Sketch {
  const shift = ({ x, y }: Point) => ({ x: x === 0 ? 0 : x + distance, y });
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      if (curve.kind === "circle") return { ...curve, center: shift(curve.center) };
      const ends = { a: shift(curve.a), b: shift(curve.b) };
      return curve.kind === "bezier"
        ? { ...curve, ...ends, c1: shift(curve.c1), c2: shift(curve.c2) }
        : { ...curve, ...ends };
    }),
  };
}

const dimple = (body: Body) => body.faces.find((face) => face.sphere?.outward === -1);

async function grow(owner: DocumentOwner, profile: Sketch, original: SketchDocument, body: Body) {
  const draft = await call(owner, { kind: "preview", sketch: moveRadially(profile, 1) });
  assert.ok(draft.profileEdit?.draft);
  assert.equal(draft.profileEdit.preview, undefined);
  const grown = await call(owner, { kind: "accept" });
  const preview = grown.profileEdit?.preview;
  assert.ok(preview);
  assert.equal(preview.id, body.id);
  const pocket = dimple(body);
  const recut = dimple(preview);
  assert.ok(pocket?.bounds && recut?.bounds);
  assert.equal(recut.id, pocket.id);
  assert.equal(recut.sphere?.radius, 3);
  assert.ok(recut.bounds[3] > pocket.bounds[3] + 0.5);
  assert.equal(grown.data, original);
  return preview;
}

test("temporary profile recuts a stationary dimple, drops contact, and applies one body edit", async () => {
  const owner = new DocumentOwner();
  try {
    const bodyId = await makeTurnedBody(owner);
    const neighbor = await prism(
      owner,
      [
        [15, -4],
        [20, -4],
        [20, 4],
        [15, 4],
      ],
      10,
    );
    const { data: original } = await call(owner, {
      kind: "open",
      document: { ...owner.view.data, sketches: [] },
    });
    const [body, other] = original.bodies ?? [];
    assert.ok(body && other && other.id === neighbor.id);
    const selection = {
      body: bodyId,
      faces: body.faces.filter((face) => !face.plane && !face.sphere).map((face) => face.id),
    };
    const opened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.equal(opened.data, original);
    assert.equal(opened.canUndo, false);
    assert.deepEqual(
      opened.profileEdit?.sketch.curves.map((curve) => curve.kind),
      ["segment", "arc", "segment", "arc", "segment"],
    );
    const profile = opened.profileEdit?.sketch;
    assert.ok(profile);

    const preview = await grow(owner, profile, original, body);
    const sections = await owner.call({
      kind: "sections",
      frame: profile.plane,
      bodies: [other.id, bodyId],
    });
    assert.equal(sections.error, undefined);
    assert.ok(sections.sections?.some((section) => section.body === other.id));
    assert.ok(sections.sections?.some((section) => section.body === bodyId));

    const broken = await call(owner, {
      kind: "remove",
      sketchId: profile.id,
      ids: [profile.curves[2].id],
    });
    assert.match(broken.profileEdit?.error ?? "", /continuous chain/);
    assert.match(
      (await owner.call({ kind: "apply-profile-edit" })).error ?? "",
      /continuous chain/,
    );
    assert.equal(
      (await call(owner, { kind: "undo" })).profileEdit?.preview?.volume,
      preview.volume,
    );

    for (const radius of [9, 8, 9]) {
      const edited = await call(owner, {
        kind: "edit",
        sketch: moveRadially(profile, radius - 10),
      });
      assert.equal(edited.profileEdit?.error, undefined);
      assert.equal(edited.profileEdit?.removedDimples, 1);
      assert.ok(edited.profileEdit?.preview && !dimple(edited.profileEdit.preview));
      assert.equal(edited.data, original);
    }
    const applied = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(applied.profileEdit, undefined);
    assert.equal(applied.data.sketches.length, 0);
    assert.equal(applied.data.bodies?.[1], other);
    assert.equal(applied.data.bodies?.[0].id, bodyId);
    assert.equal(dimple(applied.data.bodies?.[0] as Body), undefined);
    const undone = await call(owner, { kind: "undo" });
    assert.equal(undone.data, original);
    assert.equal(undone.canUndo, false);
    assert.equal((await call(owner, { kind: "redo" })).data, applied.data);

    await call(owner, { kind: "begin-profile-edit", selection: { body: bodyId, faces: [] } });
    assert.equal((await call(owner, { kind: "cancel-profile-edit" })).data, applied.data);
    assert.equal((await call(owner, { kind: "undo" })).data, original);
  } finally {
    owner.close();
  }
});

test("an edited cubic meridian can be recovered when reopening the resulting body", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await makeTurnedBody(owner);
    const selection = { body, faces: [] };
    const opened = await call(owner, { kind: "begin-profile-edit", selection });
    const sketch = opened.profileEdit?.sketch;
    assert.ok(sketch);
    const curves = sketch.curves.map((curve): Curve => {
      if (curve.kind !== "segment" || curve.a.x === 0 || curve.b.x === 0) return curve;
      return {
        ...curve,
        kind: "bezier",
        c1: { x: curve.a.x + 2, y: curve.a.y + 4 },
        c2: { x: curve.b.x + 2, y: curve.b.y - 4 },
      };
    });
    const changed = await call(owner, { kind: "edit", sketch: { ...sketch, curves } });
    assert.equal(changed.profileEdit?.error, undefined);
    assert.ok(changed.profileEdit?.preview);
    const applied = await call(owner, { kind: "apply-profile-edit" });
    await call(owner, { kind: "open", document: applied.data });
    const recovered = await call(owner, { kind: "begin-profile-edit", selection });
    const meridian = recovered.profileEdit?.sketch.curves.find((curve) => curve.kind === "bezier");
    assert.ok(meridian);
    assert.ok(Math.abs(meridian.c1.x - 12) < 1e-7);
    assert.ok(Math.abs(meridian.c2.x - 12) < 1e-7);
    assert.equal((await call(owner, { kind: "apply-profile-edit" })).canUndo, false);
  } finally {
    owner.close();
  }
});
