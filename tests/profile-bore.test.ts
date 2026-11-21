import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}

async function piercedStock(owner: DocumentOwner, through = true) {
  const corners = [
    [0, -12],
    [10, -12],
    [7, 4],
    [5, 8],
    [0, 8],
  ];
  const outline: Sketch = {
    ...emptySketch(planes.XZ),
    curves: corners.map(([x, y], index) => {
      const [nextX, nextY] = corners[(index + 1) % corners.length];
      return {
        id: `span-${index}`,
        kind: "segment",
        a: { x, y },
        b: { x: nextX, y: nextY },
        construction: false,
      };
    }),
  };
  await call(owner, { kind: "edit", sketch: outline });
  await call(owner, {
    kind: "revolve",
    revolution: {
      sources: [{ sketch: outline.id, profile: profilesFor(outline)[0].key }],
      axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
      angle: 360,
      height: 0,
      mode: "new",
    },
  });
  const { data } = await call(owner, { kind: "accept" });
  const stock = data.bodies?.[0];
  assert.ok(stock);
  const bore: Sketch = {
    ...emptySketch(planes.XZ),
    curves: [
      { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 2.5, construction: false },
    ],
  };
  await call(owner, { kind: "edit", sketch: bore });
  await call(owner, {
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: bore.id, profile: profilesFor(bore)[0].key }],
      distance: 30,
      symmetric: through,
      mode: "subtract",
      targets: [stock.id],
    },
  });
  await call(owner, { kind: "accept" });
  return (
    await call(owner, {
      kind: "open",
      document: { ...owner.view.data, sketches: [] },
    })
  ).data;
}

function radialMove(sketch: Sketch, amount: number, lastAmount = amount): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      assert.equal(curve.kind, "segment");
      return {
        ...curve,
        a: { ...curve.a, x: curve.a.x + amount },
        b: { ...curve.b, x: curve.b.x + lastAmount },
      };
    }),
  };
}

function boreWall(body: Body) {
  const wall = body.faces.find((face) => face.cylinder?.outward === -1);
  assert.ok(wall?.cylinder);
  return { id: wall.id, cylinder: wall.cylinder };
}

test("Edit Profile enlarges, fills and tapers a through-bore while retaining the turned stock", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await piercedStock(owner);
    const [body] = original.bodies ?? [];
    assert.ok(body);
    const bore = boreWall(body);
    const selection = { body: body.id, faces: [bore.id] };
    const started = await call(owner, { kind: "begin-profile-edit", selection });
    const profile = started.profileEdit?.sketch;
    assert.ok(profile && profile.curves.length === 1);
    for (const shift of [-1, 1]) {
      const result = await call(owner, { kind: "edit", sketch: radialMove(profile, shift) });
      const changed = result.profileEdit?.preview;
      assert.ok(changed, result.profileEdit?.error);
      assert.equal(boreWall(changed).id, bore.id);
      assert.ok(Math.abs(boreWall(changed).cylinder.radius - (2.5 + shift)) < 1e-7);
      assert.equal(Math.sign(body.volume - changed.volume), shift);
      assert.deepEqual(
        changed.faces
          .filter((face) => face.cone)
          .map((face) => face.id)
          .sort(),
        body.faces
          .filter((face) => face.cone)
          .map((face) => face.id)
          .sort(),
      );
      assert.equal(result.data, original);
    }
    const changed = await call(owner, { kind: "edit", sketch: radialMove(profile, -0.4, 0.4) });
    assert.ok(changed.profileEdit?.preview, changed.profileEdit?.error);
    const conicalBore = changed.profileEdit.preview.faces.find((face) => face.id === bore.id);
    assert.equal(conicalBore?.cone?.outward, -1);
    const applied = await call(owner, { kind: "apply-profile-edit" });
    assert.equal(applied.data.sketches.length, 0);
    assert.equal((await call(owner, { kind: "undo" })).data, original);
    const redone = await call(owner, { kind: "redo" });
    await call(owner, { kind: "open", document: redone.data });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    const line = reopened.profileEdit?.sketch.curves[0];
    assert.ok(line?.kind === "segment");
    assert.ok(Math.abs(Math.abs(line.a.x - line.b.x) - 0.8) < 1e-6);
  } finally {
    owner.close();
  }
});

test("selecting a face of the turned exterior recuts the original stationary through-bore", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await piercedStock(owner);
    const [body] = original.bodies ?? [];
    assert.ok(body);
    const bore = boreWall(body);
    const seed = body.faces.find((face) => face.cone?.outward === 1);
    assert.ok(seed);
    const opened = await call(owner, {
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: [seed.id] },
    });
    const profile = opened.profileEdit?.sketch;
    assert.ok(profile);
    assert.equal(profile.curves.length, 2);
    const changed = await call(owner, { kind: "edit", sketch: radialMove(profile, 1) });
    const preview = changed.profileEdit?.preview;
    assert.ok(preview, changed.profileEdit?.error);
    const continued = boreWall(preview);
    assert.equal(continued.id, bore.id);
    assert.ok(Math.abs(continued.cylinder.radius - bore.cylinder.radius) < 1e-7);
    assert.ok(Math.abs(Math.abs(continued.cylinder.axis[1]) - 1) < 1e-7);
    assert.ok(Math.hypot(continued.cylinder.origin[0], continued.cylinder.origin[2]) < 1e-7);
    assert.ok(preview.volume > body.volume);
    assert.equal((await call(owner, { kind: "apply-profile-edit" })).data.bodies?.[0].id, body.id);
    assert.equal((await call(owner, { kind: "undo" })).data, original);
  } finally {
    owner.close();
  }
});

test("reselecting one face recovers both spans of an edited through-bore", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await piercedStock(owner);
    const [body] = original.bodies ?? [];
    assert.ok(body);
    const selection = { body: body.id, faces: [boreWall(body).id] };
    const opened = await call(owner, { kind: "begin-profile-edit", selection });
    const profile = opened.profileEdit?.sketch;
    const span = profile?.curves[0];
    assert.ok(profile && span?.kind === "segment");
    const middle = { x: 3.2, y: (span.a.y + span.b.y) / 2 };
    const changed = await call(owner, {
      kind: "edit",
      sketch: {
        ...profile,
        curves: [
          { ...span, b: middle },
          { ...span, id: "upper-bore", a: middle },
        ],
      },
    });
    assert.ok(changed.profileEdit?.preview, changed.profileEdit?.error);
    await call(owner, { kind: "apply-profile-edit" });
    const reopened = await call(owner, { kind: "begin-profile-edit", selection });
    assert.equal(reopened.profileEdit?.sketch.curves.length, 2);
  } finally {
    owner.close();
  }
});

test("a blind bore cannot be opened with the through-bore profile recipe", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await piercedStock(owner, false);
    const [body] = original.bodies ?? [];
    assert.ok(body);
    const reply = await owner.call({
      kind: "begin-profile-edit",
      selection: { body: body.id, faces: [boreWall(body).id] },
    });
    assert.ok(reply.error);
    assert.equal(reply.view.profileEdit, undefined);
    assert.equal(reply.view.data, original);
  } finally {
    owner.close();
  }
});
