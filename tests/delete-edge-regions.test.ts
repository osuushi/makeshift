import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Edge } from "../src/model/body.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism, square, vertical } from "./body-edge-fixtures.js";
import { feature } from "./face-movement-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/delete-shoulder.json", "utf8")) as {
  document: SketchDocument;
  selection: { body: string; whole: boolean; faces: string[]; edges: string[] }[];
};
const outer = fixture.selection[0].edges[0];
const inner = "137e260b-09e4-4d7a-af3a-ec98bb740239";

for (const edges of [[outer], [inner], [outer, inner], [inner, outer]])
  test(`delete captured shoulder boundaries ${edges.join(",")}`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const original = before.bodies?.[0];
      assert.ok(original);
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [{ ...fixture.selection[0], edges }],
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.candidate, null);
      const body = reply.view.data.bodies?.[0];
      assert.ok(body);
      assert.equal(body.id, original.id);
      const frustum = (height: number) => (Math.PI * height * (400 + 220 + 121)) / 3;
      const expected =
        edges.length === 2
          ? frustum(93)
          : edges[0] === outer
            ? frustum(44) + Math.PI * 121 * 49
            : Math.PI * 400 * 44 + frustum(49);
      assert.ok(Math.abs(body.volume - expected) < 1e-5, `${body.volume} != ${expected}`);
      assert.ok(edges.every((id) => !body.edges.some((e) => e.id === id)));
      const rimIds = [
        "2383d366-077f-40e0-982d-648fdd9e414d",
        "a1af30a9-bd77-490f-91f5-edb08f4e2c40",
      ];
      for (const id of rimIds) {
        const rim: Edge | undefined = body.edges.find((e) => e.id === id);
        const old: Edge | undefined = original.edges.find((e) => e.id === id);
        assert.ok(rim && old);
        assert.deepEqual(rim.curve, old.curve);
      }
      assert.equal(body.faces.length, original.faces.length - edges.length);
      const after = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, after);
      // Ordinary cap offset remains available on the materialized result.
      const cap = body.faces.find((f) => f.bounds?.[2] === 93 && f.bounds?.[5] === 93);
      assert.ok(cap);
      assert.equal(
        (
          await owner.call({
            kind: "offset-faces",
            operation: { faces: [{ body: body.id, face: cap.id }], distance: 1 },
          })
        ).error,
        undefined,
      );
    } finally {
      owner.close();
    }
  });

test("delete rejects unsupported open-edge and boundaryless regions atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    const edge = vertical(body, 0, 0).id;
    const reply = await owner.call({
      kind: "delete-topology",
      selection: [{ body: body.id, whole: false, faces: [], edges: [edge] }],
    });
    assert.match(reply.error ?? "", /two surviving closed boundary loops/);
    assert.deepEqual(owner.view.data, before);
    const rejected = await owner.call({
      kind: "delete-topology",
      selection: [{ body: body.id, whole: false, faces: [], edges: body.edges.map((e) => e.id) }],
    });
    assert.ok(rejected.error);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("delete four rectangular shoulder edges together preserves the boss and exact boundary loops", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    const body = await feature(owner, "boss");
    const edges = body.edges.filter(
      (e) =>
        e.points.every((v, i) => i % 3 !== 2 || v === 10) &&
        e.points.some((v, i) => i % 3 !== 2 && (v === 0 || v === 20)),
    );
    assert.equal(edges.length, 4);
    const before = owner.view.data;
    for (const ordered of [edges, [...edges].reverse()]) {
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [{ body: body.id, whole: false, faces: [], edges: ordered.map((e) => e.id) }],
      });
      assert.equal(reply.error, undefined);
      const next = reply.view.data.bodies?.[0];
      assert.ok(next);
      // Integral of (20 - 16t)(20 - 14t) over the 10 mm lower loft, plus 4*6*6 boss.
      assert.ok(Math.abs(next.volume - (10 * (400 - 300 + 224 / 3) + 144)) < 1e-5);
      assert.ok(edges.every((edge) => !next.edges.some((e) => e.id === edge.id)));
      for (const face of body.faces.filter(
        (f) => (f.bounds?.[2] ?? 0) >= 10 && (f.bounds?.[5] ?? 0) > 10,
      ))
        assert.ok(
          next.faces.some((f) => f.id === face.id),
          "Boss faces retain identity",
        );
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});

test("separate deletion regions retain their shared boundary", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const sketch = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, 93] }),
      curves: [
        {
          id: "tip",
          kind: "circle" as const,
          center: { x: 0, y: 0 },
          radius: 6,
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            distance: 20,
            mode: "union",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    const upper = body.edges.find(
      (e) => e.curve?.kind === "circle" && e.curve.radius === 11 && e.curve.center[2] === 93,
    );
    assert.ok(upper);
    const reply = await owner.call({
      kind: "delete-topology",
      selection: [{ ...fixture.selection[0], edges: [outer, upper.id] }],
    });
    assert.equal(reply.error, undefined);
    const next = reply.view.data.bodies?.[0];
    assert.ok(next);
    const expected =
      Math.PI * ((44 * (400 + 220 + 121)) / 3 + (49 * (121 + 66 + 36)) / 3 + 20 * 36);
    assert.ok(Math.abs(next.volume - expected) < 1e-5);
    assert.ok(
      next.edges.some((e) => e.id === inner),
      "Shared stationary rim retains its ID",
    );
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("same-support dissolution composes with loft deletion; mixed invalid selections stay atomic", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "delete-topology",
      selection: [
        { ...fixture.selection[0], edges: [outer, "3b95a20f-f7c3-4404-8924-67e8313d71e9"] },
      ],
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.data.bodies?.[0].faces.length, 4);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    const invalid = await owner.call({
      kind: "delete-topology",
      selection: [
        { ...fixture.selection[0], edges: [outer, "a0c964c9-627b-45d0-b584-201524b4e5fc"] },
      ],
    });
    assert.ok(invalid.error);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
