import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { guideCandidates } from "../src/guides/candidates.js";
import { guidePosition, resolvedGuides } from "../src/guides/evaluate.js";
import type { GuideAnchor } from "../src/guides/types.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { finish, prism, square, vertical } from "./body-edge-fixtures.js";

const check = (reply: { error?: string }) => assert.equal(reply.error, undefined);
const near = (actual: Vector | null, expected: Vector) => {
  assert.ok(actual);
  assert.ok(
    Math.hypot(...actual.map((v, i) => v - expected[i])) < 1e-6,
    `${actual} != ${expected}`,
  );
};
async function save(owner: DocumentOwner, anchor: GuideAnchor) {
  check(await owner.call({ kind: "guide-point", edit: { action: "create", anchor } }));
  const point = owner.view.data.guidePoints?.at(-1);
  assert.ok(point);
  return point;
}

test("native face centroid follows offset rather than body center and survives archive and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) => Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(face);
    const guide = await save(owner, {
      kind: "body-faces",
      body: body.id,
      faces: [face.id],
      feature: "area-center",
    });
    near(guidePosition(owner.view.data, guide.anchor), [10, 10, 10]);
    const bound = await save(owner, {
      ...guide.anchor,
      kind: "body-faces",
      body: body.id,
      faces: [face.id],
      feature: "bounds-center",
    });
    near(guidePosition(owner.view.data, bound.anchor), [10, 10, 10]);
    check(
      await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: face.id }], distance: 4 },
      }),
    );
    check(await owner.call({ kind: "accept" }));
    near(resolvedGuides(owner.view.data)[0].point, [10, 10, 14]);
    check(await owner.call({ kind: "undo" }));
    near(resolvedGuides(owner.view.data)[0].point, [10, 10, 10]);
    check(await owner.call({ kind: "redo" }));
    const saved = documentArchive(owner.view.data);
    assert.ok(!saved.includes('"vertices"'));
    check(await owner.call({ kind: "open", document: readArchive(saved) }));
    near(resolvedGuides(owner.view.data)[0].point, [10, 10, 14]);
    assert.equal(owner.view.data.guidePoints?.[0].id, guide.id);
    check(await owner.call({ kind: "delete-entities", bodyIds: [body.id], sketchIds: [] }));
    assert.equal(owner.view.data.guidePoints?.length, 0);
    check(await owner.call({ kind: "undo" }));
    assert.equal(owner.view.data.guidePoints?.length, 2);
  } finally {
    owner.close();
  }
});

test("imprint continues face centroid over coplanar descendants and cleanup merges references", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) => Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(face);
    const guide = await save(owner, {
      kind: "body-faces",
      body: body.id,
      faces: [face.id],
      feature: "area-center",
    });
    owner.beginScript("Imprint guide face");
    await owner.scripts.step({
      kind: "imprint",
      input: {
        targets: [{ body: body.id, faces: [face.id] }],
        frame: { ...planes.YZ, origin: [6, 0, 0] },
      },
    });
    owner.scripts.finish();
    const continued = owner.view.data.guidePoints?.[0];
    assert.ok(continued?.anchor.kind === "body-faces");
    assert.equal(continued.id, guide.id);
    assert.equal(continued.anchor.faces.length, 2);
    near(guidePosition(owner.view.data, continued.anchor), [10, 10, 10]);
    const after = owner.view.data;
    check(await owner.call({ kind: "undo" }));
    assert.deepEqual(owner.view.data.guidePoints?.[0], guide);
    check(await owner.call({ kind: "redo" }));
    assert.deepEqual(owner.view.data, after);
    check(
      await owner.call({
        kind: "cleanup",
        selection: [
          { body: body.id, faces: continued.anchor.faces.slice(), edges: [], whole: false },
        ],
      }),
    );
    check(await owner.call({ kind: "accept" }));
    const merged = owner.view.data.guidePoints?.[0];
    assert.ok(merged?.anchor.kind === "body-faces");
    assert.equal(merged.anchor.faces.length, 1);
    near(guidePosition(owner.view.data, merged.anchor), [10, 10, 10]);
  } finally {
    owner.close();
  }
});

test("fillet arc circle center, junction, copy and rotation retain semantic anchors", async () => {
  const owner = new DocumentOwner();
  try {
    const initial = await prism(owner, square);
    await finish(owner, initial, [vertical(initial, 0, 0)], 2);
    check(await owner.call({ kind: "accept" }));
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const candidates = guideCandidates(owner.view.data, [{ kind: "body", body: body.id }]);
    const arc = candidates.find(
      (p) =>
        p.anchor.kind === "body-edge" &&
        p.anchor.feature === "circle-center" &&
        Math.abs(p.point[2] - 10) < 1e-7,
    );
    assert.ok(arc);
    near(arc.point, [2, 2, 10]);
    const guide = await save(owner, arc.anchor);
    const junction = candidates.find(
      (p) =>
        p.anchor.kind === "body-junction" &&
        p.point.every((v, i) => Math.abs(v - [20, 20, 10][i]) < 1e-7),
    );
    assert.ok(junction);
    await save(owner, junction.anchor);
    owner.beginScript("Split the fillet arc");
    await owner.scripts.step({
      kind: "imprint",
      input: {
        targets: [
          {
            body: body.id,
            faces: body.faces.filter((f) => Math.abs(f.signature[5] - 10) < 1e-7).map((f) => f.id),
          },
        ],
        frame: { ...planes.YZ, origin: [1, 0, 0] },
      },
    });
    owner.scripts.finish();
    const splitGuide = owner.view.data.guidePoints?.[0];
    assert.ok(splitGuide);
    near(guidePosition(owner.view.data, splitGuide.anchor), [2, 2, 10]);
    assert.equal(splitGuide.id, guide.id);
    check(
      await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 90,
          translation: [50, 4, 0],
          duplicate: true,
        },
      }),
    );
    assert.equal(owner.view.data.guidePoints?.length, 4);
    near(guidePosition(owner.view.data, splitGuide.anchor), [2, 2, 10]);
    const copied = resolvedGuides(owner.view.data).find(
      (g) => g.guide.id !== guide.id && g.guide.anchor.kind === "body-edge",
    );
    assert.ok(copied);
    near(copied.point, [48, 6, 10]);
    const copyJunction = resolvedGuides(owner.view.data).find(
      (g) => g.guide.anchor.kind === "body-junction" && g.guide.anchor.body !== body.id,
    );
    assert.ok(copyJunction);
    near(copyJunction.point, [30, 24, 10]);
    check(await owner.call({ kind: "undo" }));
    assert.equal(owner.view.data.guidePoints?.length, 2);
  } finally {
    owner.close();
  }
});

test("asymmetric native face has distinct area and bounding-box centers", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [30, 0],
      [0, 12],
    ]);
    const face = body.faces.find((f) => Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(face);
    const anchor = {
      kind: "body-faces" as const,
      body: body.id,
      faces: [face.id],
      feature: "area-center" as const,
    };
    near(guidePosition(owner.view.data, anchor), [10, 4, 10]);
    near(guidePosition(owner.view.data, { ...anchor, feature: "bounds-center" }), [15, 6, 10]);
  } finally {
    owner.close();
  }
});

test("destroying a referenced face removes its guide and Undo restores it", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const face = body.faces.find((f) => Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(face);
    const guide = await save(owner, {
      kind: "body-faces",
      body: body.id,
      faces: [face.id],
      feature: "area-center",
    });
    check(
      await owner.call({
        kind: "shell",
        operation: { selection: [{ body: body.id, faces: [face.id] }], thickness: -1 },
      }),
    );
    check(await owner.call({ kind: "accept" }));
    assert.equal(owner.view.data.guidePoints?.length, 0);
    check(await owner.call({ kind: "undo" }));
    assert.deepEqual(owner.view.data.guidePoints?.[0], guide);
  } finally {
    owner.close();
  }
});
