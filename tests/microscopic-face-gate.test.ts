import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/chamfer-annular-shelf.json", "utf8")) as {
  document: SketchDocument;
};
const outer = "e031c299-9574-491d-82f6-563a72c9d156";
const inner = "84d42d96-1b39-4fd8-8dc1-70951ec420a3";
const chamfer = "d82654f7-b0c2-422c-a41d-42a9692ec3ea";

function expectedFilletVolume(radius: number): number {
  // Independent meridian integral of the captured R4 base, R2 stem and
  // 45-degree shoulder, with its corner replaced by a radius-r circular arc.
  const join = -0.0011;
  const setback = radius * Math.tan(Math.PI / 8);
  const centerZ = join - setback;
  const rise = radius / Math.sqrt(2);
  const endZ = centerZ + rise;
  const centerR = 4 - radius;
  const rounded =
    (centerR ** 2 + radius ** 2) * rise -
    rise ** 3 / 3 +
    centerR * (rise * Math.sqrt(radius ** 2 - rise ** 2) + (radius ** 2 * Math.PI) / 4);
  const unrounded = 16 * setback + (4 ** 3 - (3.9989 - endZ) ** 3) / 3;
  const healed = Math.PI * (16 * (9.5 + join) + (2 * (16 + 8 + 4)) / 3 + 4 * (10 - 1.9989));
  return healed - Math.PI * (unrounded - rounded);
}

for (const transformed of [false, true]) {
  test(`shared face gate repairs captured shelf before fillet; transformed=${transformed}`, async () => {
    const owner = new DocumentOwner();
    const kernel = new SolidCalculator();
    try {
      let document = fixture.document;
      let selectedRim = outer;
      if (transformed) {
        const bodies = document.bodies ?? [];
        const result = await kernel.calculate({
          kind: "transform",
          bodies,
          ids: bodies.map((body) => body.id),
          pivot: [0, 0, 0],
          axis: [1, 0, 0],
          angle: 37,
          translation: [130, -81, 24],
          duplicate: false,
        });
        const rimIndex = result.results[0].edges.findIndex((edge) =>
          edge.predecessors.includes(outer),
        );
        assert.ok(rimIndex >= 0);
        assert.ok(result.results[0].edges[rimIndex].predecessors.includes(inner));
        document = { ...document, bodies: materialize(bodies, result) };
        selectedRim = document.bodies?.[0].edges[rimIndex].id ?? "";
      }
      assert.equal((await owner.call({ kind: "open", document })).error, undefined);
      const before = owner.view.data;
      const source = before.bodies?.[0];
      assert.ok(source);
      // Either old rim, or both, must continue through the repaired intersection.
      assert.ok(source.edges.some((edge) => edge.id === selectedRim));
      const edges = transformed ? [selectedRim] : [outer, inner];
      const reply = await owner.call({
        kind: "finish-edges",
        operation: {
          edges: edges.map((edge) => ({ body: source.id, edge })),
          size: 0.5,
          mode: "fillet",
          limit: false,
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.edgeSize, 0.5);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      assert.ok(body.volume < source.volume);
      assert.ok(body.faces.filter((face) => face.plane).every((face) => face.signature[2] > 1));
      assert.ok(
        Math.abs(body.volume - expectedFilletVolume(0.5)) < 1e-5,
        `${body.volume} != ${expectedFilletVolume(0.5)}`,
      );
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
      assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.equal(owner.view.data.bodies?.[0].faces.length, body.faces.length);
    } finally {
      owner.close();
      kernel.close();
    }
  });
}

test("general near-threshold candidates require the whole-solid material bound", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert.ok(source);
    for (const size of [1.9985, 1.9995]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: source.id, face: chamfer }],
          radius: size,
          chamfer: true,
          distance: 0,
          limit: false,
        },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      const ledges = body.faces.filter((face) => face.plane && face.signature[2] < 1);
      assert.equal(ledges.length, size < 1.999 ? 1 : 0);
      const cone = body.faces.find((face) => face.cone)?.cone;
      assert.ok(cone);
      assert.ok(Math.abs(cone.apex[2] - (2 + size)) < 1e-6, "Requested support stays exact");
      assert.deepEqual(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});
