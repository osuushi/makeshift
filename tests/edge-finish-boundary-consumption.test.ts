import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/chamfer-segmented-shelf.json", "utf8")) as {
  document: SketchDocument;
};
const rims = [
  "55ae351e-f9c8-41e8-88e7-d153b70b2e8a",
  "a1e796be-7a08-446e-bddf-86f9538cdeaa",
  "7876944f-4387-4579-8789-df0024e295a6",
  "994e20e4-4c5f-49c7-a90b-c829d09666c4",
];
async function restored(owner: DocumentOwner, radius: number) {
  assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
  const source = owner.view.data.bodies?.[0];
  const bevel = source?.faces.find((face) => face.chamfer)?.chamfer;
  assert.ok(source && bevel);
  const faces = bevel.faces.map((face) => ({ body: source.id, face }));
  assert.equal(
    (
      await owner.call({
        kind: "offset-faces",
        operation: { faces, radius, chamfer: true, distance: 0, limit: false },
      })
    ).error,
    undefined,
  );
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  return faces;
}
function noShelf(body: Body) {
  assert.ok(body.edges.every((edge) => edge.signature[2] >= 0.001));
  assert.equal(
    body.faces.filter((face) => face.plane).length,
    2,
    "Only the two remote caps remain",
  );
  assert.ok(body.faces.every((face) => face.vertices.length > 0));
}
// Integrate the exact parallel-section area P*t - pi*t². The captured smooth
// outline has total turning 2*pi; the 3.5 mm inner profile caps the removed area.
// This checks material independently of the kernel's temporary carrier/Booleans.
function removedVolume(perimeter: number, radius: number, chamfer: boolean, adding = false) {
  const curvature = adding ? -Math.PI : Math.PI;
  const width = Math.min(radius, 3.5);
  if (chamfer)
    return (
      perimeter * (width ** 2 / 2 + width * (radius - width)) -
      curvature * (width ** 3 / 3 + width ** 2 * (radius - width))
    );
  const z = Math.sqrt(radius ** 2 - (radius - width) ** 2);
  const integral =
    z * Math.sqrt(Math.max(0, radius ** 2 - z ** 2)) + radius ** 2 * Math.asin(z / radius);
  const first = radius * z - integral / 2 + width * (radius - z);
  const second = 2 * radius ** 2 * z - z ** 3 / 3 - radius * integral + width ** 2 * (radius - z);
  return perimeter * first - curvature * second;
}
async function history(owner: DocumentOwner, before: SketchDocument, body: Body) {
  assert.deepEqual(owner.view.data, before, "Preview must leave accepted geometry untouched");
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const accepted = owner.view.data;
  assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
  assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
  assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  assert.ok(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - body.volume) < 1e-7);
  assert.deepEqual(
    owner.view.data.bodies?.[0].edges.map((edge) => edge.id),
    body.edges.map((edge) => edge.id),
  );
}
for (const adding of [false, true])
  for (const mode of ["chamfer", "fillet"] as const)
    for (const size of mode === "fillet" ? [3.4999, 3.5, 3.6, 4] : [3.5, 3.6, 4])
      test(`${adding ? "Concave" : "Convex"} ${mode} ${size} consumes the shelf with exact material`, async () => {
        const owner = new DocumentOwner();
        try {
          await restored(owner, 0);
          const before = owner.view.data;
          const source = before.bodies?.[0];
          assert.ok(source);
          const spines = source.edges.filter((edge) =>
            adding
              ? Math.abs(edge.signature[5] - 25.5) < 1e-7 && !rims.includes(edge.id)
              : rims.includes(edge.id),
          );
          assert.equal(spines.length, 4);
          const perimeter = spines.reduce((sum, edge) => sum + edge.signature[2], 0);
          const reply = await owner.call({
            kind: "finish-edges",
            operation: {
              edges: spines.map((edge) => ({ body: source.id, edge: edge.id })),
              size,
              mode,
              limit: false,
            },
          });
          assert.equal(reply.error, undefined);
          assert.equal(reply.view.edgeSize, size);
          const body = reply.view.candidate?.bodies?.[0];
          assert.ok(body);
          noShelf(body);
          assert.ok(
            Math.abs(
              (source.volume - body.volume) * (adding ? -1 : 1) -
                removedVolume(perimeter, size === 3.4999 ? 3.5 : size, mode === "chamfer", adding),
            ) < 1e-6,
          );
          const cap = source.faces.find((face) => face.plane?.origin[2] === 52.5);
          assert.ok(cap && body.faces.some((face) => face.id === cap.id));
          for (const wall of source.faces.filter((face) => face.cylinder))
            assert.ok(
              body.faces.some((face) => face.id === wall.id),
              "Continuing wall selection keeps its identity",
            );
          await history(owner, before, body);
          if (mode === "chamfer" && size === 3.5) {
            const edges = body.edges.filter((edge) => Math.abs(edge.signature[5] - 25.5) < 1e-7);
            assert.equal(edges.length, 4);
            const rounded = await owner.call({
              kind: "finish-edges",
              operation: {
                edges: edges.map((edge) => ({ body: body.id, edge: edge.id })),
                size: 0.5,
                mode: "fillet",
                limit: false,
              },
            });
            assert.equal(
              rounded.error,
              undefined,
              "The consumed boundary supports a subsequent fillet",
            );
            const next = rounded.view.candidate?.bodies?.[0];
            assert.ok(next && (next.volume - body.volume) * (adding ? -1 : 1) > 0);
            noShelf(next);
            await history(owner, owner.view.data, next);
          }
        } finally {
          owner.close();
        }
      });

for (const radius of [3.5, 3.4999])
  test(`resizing to ${radius} consumes the exact 3.5 mm boundary atomically`, async () => {
    const owner = new DocumentOwner();
    try {
      const faces = await restored(owner, 3);
      const before = owner.view.data;
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces, radius, chamfer: true, distance: 0, limit: false },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      noShelf(body);
      const bottom = body.edges.filter((edge) => Math.abs(edge.signature[5] - 29) < 1e-7);
      assert.equal(bottom.length, 4, "The exact consumed chamfer has a 3.5 mm setback");
      await history(owner, before, body);
    } finally {
      owner.close();
    }
  });

for (const adding of [false, true])
  test(`a rotated, translated ${adding ? "concave" : "convex"} fillet crosses the same shelf`, async () => {
    const owner = new DocumentOwner();
    try {
      await restored(owner, 0);
      const original = owner.view.data.bodies?.[0];
      assert.ok(original);
      const spines = original.edges
        .filter((edge) =>
          adding
            ? Math.abs(edge.signature[5] - 25.5) < 1e-7 && !rims.includes(edge.id)
            : rims.includes(edge.id),
        )
        .map((edge) => edge.id);
      assert.equal(
        (
          await owner.call({
            kind: "transform-bodies",
            transform: {
              ids: [original.id],
              axis: [1, 2, 3],
              angle: 37,
              pivot: [0, 0, 0],
              translation: [2100, -900, 120],
              duplicate: false,
            },
          })
        ).error,
        undefined,
      );
      const before = owner.view.data;
      const source = before.bodies?.[0];
      assert.ok(source);
      const perimeter = source.edges
        .filter((edge) => spines.includes(edge.id))
        .reduce((sum, edge) => sum + edge.signature[2], 0);
      const reply = await owner.call({
        kind: "finish-edges",
        operation: {
          edges: spines.map((edge) => ({ body: source.id, edge })),
          size: 4,
          mode: "fillet",
          limit: false,
        },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      noShelf(body);
      assert.ok(
        Math.abs(
          (source.volume - body.volume) * (adding ? -1 : 1) -
            removedVolume(perimeter, 4, false, adding),
        ) < 1e-6,
      );
      await history(owner, before, body);
    } finally {
      owner.close();
    }
  });

test("a concave finish cannot add material past the actual wall's far cap", async () => {
  const owner = new DocumentOwner();
  try {
    await restored(owner, 0);
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert.ok(source);
    const edges = source.edges
      .filter((edge) => Math.abs(edge.signature[5] - 25.5) < 1e-7 && !rims.includes(edge.id))
      .map((edge) => ({ body: source.id, edge: edge.id }));
    const refused = await owner.call({
      kind: "finish-edges",
      operation: { edges, size: 100, mode: "chamfer", limit: false },
    });
    assert.ok(refused.error);
    assert.equal(refused.view.candidate, null);
    assert.deepEqual(owner.view.data, before);
    const corrected = await owner.call({
      kind: "finish-edges",
      operation: { edges, size: 4, mode: "chamfer", limit: false },
    });
    assert.equal(corrected.error, undefined);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
