import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Extrusion } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes, type Vector, worldPoint } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const near = (actual: number, expected: number, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
async function source(owner: DocumentOwner, plane = planes.XY) {
  const sketch = {
    ...emptySketch(plane),
    curves: [
      {
        id: "circle",
        kind: "circle" as const,
        center: { x: 2, y: 3 },
        radius: 10,
        construction: false,
      },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  return { sketch: sketch.id, profile: profilesFor(sketch)[0].key };
}
async function preview(owner: DocumentOwner, extrusion: Extrusion): Promise<Body> {
  const reply = await owner.call({ kind: "extrude", extrusion });
  assert.equal(reply.error, undefined);
  const body = reply.view.candidate?.bodies?.at(-1);
  assert.ok(body);
  return body;
}

test("centered circular twist uses the ordinary exact cylinder/draft on every plane", async () => {
  for (const plane of Object.values(planes)) {
    const owner = new DocumentOwner();
    try {
      const input = { sources: [await source(owner, plane)], distance: -20, mode: "new" as const };
      for (const offset of [0, 2]) {
        const draft = { mode: "offset" as const, value: offset };
        const ordinary = await preview(owner, { ...input, draft });
        const started = performance.now();
        const twisted = await preview(owner, {
          ...input,
          draft,
          twist: { angle: 450, origin: worldPoint(plane, { x: 2, y: 3 }) },
        });
        assert.ok(performance.now() - started < 2000, "Centered twist must finish promptly");
        assert.equal(twisted.brep, ordinary.brep, "The no-op retains ordinary exact topology");
        near(twisted.volume, (Math.PI * 20 * (100 + 10 * (10 + offset) + (10 + offset) ** 2)) / 3);
      }
    } finally {
      owner.close();
    }
  }
});

function checkSections(body: Body, angle: number, distance: number, offset: number): void {
  // Independent geometry: the original center orbits the displaced axis;
  // circular sections themselves do not spin. Check interpolated mesh skin.
  for (const t of [0.17, 0.39, 0.73]) {
    const radians = (angle * t * Math.PI) / 180;
    const center = [7 - 5 * Math.cos(radians), 3 - 5 * Math.sin(radians)];
    const z = distance * t;
    let samples = 0;
    for (const face of body.faces.filter((f) => !f.plane))
      for (let i = 0; i < face.vertices.length; i += 9)
        for (let e = 0; e < 3; ++e) {
          const a = i + e * 3,
            b = i + ((e + 1) % 3) * 3;
          const az = face.vertices[a + 2],
            bz = face.vertices[b + 2];
          if ((z - az) * (z - bz) > 0 || Math.abs(az - bz) < 1e-10) continue;
          const fraction = (z - az) / (bz - az);
          const x = face.vertices[a] + fraction * (face.vertices[b] - face.vertices[a]);
          const y = face.vertices[a + 1] + fraction * (face.vertices[b + 1] - face.vertices[a + 1]);
          near(Math.hypot(x - center[0], y - center[1]), 10 + offset * t, 0.1);
          ++samples;
        }
    assert.ok(samples > 20);
  }
}

test("off-center circular twist preserves orbit, radius, signed turns, draft and history", async () => {
  const owner = new DocumentOwner();
  try {
    const circle = await source(owner);
    for (const [angle, distance, offset] of [
      [90, 20, 0],
      [-90, -20, 2],
      [450, 20, -1],
    ]) {
      const started = performance.now();
      const body = await preview(owner, {
        sources: [circle],
        distance,
        mode: "new",
        draft: { mode: "offset", value: offset },
        twist: { angle, origin: [7, 3, 0] },
      });
      assert.ok(
        performance.now() - started < 8000,
        "Circular preview must avoid the slow full-circle polynomial loft",
      );
      near(
        body.volume,
        (Math.PI * Math.abs(distance) * (100 + 10 * (10 + offset) + (10 + offset) ** 2)) / 3,
      );
      assert.equal(
        body.faces.length,
        3,
        "One periodic wall and two caps, without extra wall splits",
      );
      assert.equal(body.edges.filter((e) => e.curve?.kind === "circle").length, 2);
      checkSections(body, angle, distance, offset);
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    assert.equal((await owner.call({ kind: "redo" })).error, undefined);
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const cap = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 20) < 1e-6);
    const rim = body.edges.find((e) => cap?.edges.includes(e.id) && e.curve?.kind === "circle");
    assert.ok(cap && rim?.curve?.kind === "circle");
    // Reselected rational cap retains radial detection in the kernel, too.
    const extended = await preview(owner, {
      sources: [{ face: cap.id }],
      distance: 5,
      mode: "new",
      twist: { angle: 90, origin: rim.curve.center as Vector },
    });
    near(extended.volume, Math.PI * 81 * 5);
    assert.equal(extended.faces.length, 3);
  } finally {
    owner.close();
  }
});
