import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

import { cap, shell } from "./shell-fixtures.js";

test("shell box inward, outward, closed and multiple openings", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    for (const [faces, thickness, expected] of [
      [[], -1, 4000 - 18 * 18 * 8],
      [[cap(body, 10)], -1, 4000 - 18 * 18 * 9],
      [[cap(body, 0), cap(body, 10)], -1, (400 - 324) * 10],
      [[cap(body, 10)], 1, 22 * 22 * 11 - 4000],
      [[], 1, 22 * 22 * 12 - 4000],
    ] as const) {
      const result = await shell(owner, body, thickness, [...faces]);
      assert.equal(result.faces.length, faces.length === 0 ? 12 : faces.length === 1 ? 11 : 10);
      assert.ok(
        result.faces.every((face) => face.plane),
        "Box shell must keep sharp planar corners",
      );
      assert.ok(Math.abs(result.volume - expected) < 1e-6, `${result.volume} vs ${expected}`);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});

test("shell supports curved and concave walls and adjacent openings with exact requested thickness", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const side = box.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 0 || Math.abs(v - 20) < 1e-6),
    );
    assert.ok(side);
    const adjacent = await shell(owner, box, -1, [cap(box, 10), side.id]);
    assert.ok(Math.abs(adjacent.volume - (4000 - 19 * 18 * 9)) < 1e-6);
    await owner.call({ kind: "discard" });
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 40, y: 0 }, radius: 8, construction: false },
      ],
    });
    for (const t of [-1, 1]) {
      const cup = await shell(owner, cylinder, t, [cap(cylinder, 10)]);
      const expected = t < 0 ? Math.PI * (64 * 10 - 49 * 9) : Math.PI * (81 * 11 - 64 * 10);
      assert.ok(Math.abs(cup.volume - expected) < 1e-5, `${cup.volume} vs ${expected}`);
      const radii = cup.faces.flatMap((f) => (f.cylinder ? [f.cylinder.radius] : []));
      assert.ok(radii.some((r) => Math.abs(r - (8 + t)) < 1e-7));
      await owner.call({ kind: "discard" });
    }
    const concave = await prism(owner, [
      [60, 0],
      [80, 0],
      [80, 10],
      [70, 10],
      [70, 20],
      [60, 20],
    ]);
    const open = await shell(owner, concave, -1, [cap(concave, 10)]);
    assert.ok(Math.abs(open.volume - (3000 - 224 * 9)) < 1e-6);
    assert.ok(
      open.faces.every((face) => face.plane),
      "Concave corners must also stay sharp",
    );
    await owner.call({ kind: "discard" });
    const rounded = await finish(owner, box, [vertical(box, 0, 0)], 2);
    await owner.call({ kind: "accept" });
    assert.ok((await shell(owner, rounded, -0.5, [cap(rounded, 10)])).volume < rounded.volume);
  } finally {
    owner.close();
  }
});

test("shell respects through-holes and rejects wall collision instead of closing them", async () => {
  const owner = new DocumentOwner();
  try {
    const tube = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [8, 3].map((radius) => ({
        id: `circle${radius}`,
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    });
    const hollow = await shell(owner, tube, -1, [cap(tube, 10)]);
    assert.ok(Math.abs(hollow.volume - Math.PI * (55 * 10 - 33 * 9)) < 1e-5);
    await owner.call({ kind: "discard" });
    for (const thickness of [-2.5, -3, 3.1]) {
      const reply = await owner.call({
        kind: "shell",
        operation: {
          thickness,
          selection: [{ body: tube.id, faces: [cap(tube, 10)] }],
        },
      });
      assert.ok(reply.error, `Tube must reject collapsing offset ${thickness}`);
      assert.equal(reply.view.candidate, null);
    }
  } finally {
    owner.close();
  }
});

test("closed spherical and toroidal shells preserve analytic distance and reject radius inversion", async () => {
  const owner = new DocumentOwner();
  try {
    for (const kind of ["sphere", "torus"] as const) {
      const sketch = {
        ...emptySketch(planes.XZ),
        curves:
          kind === "torus"
            ? [
                {
                  id: "circle",
                  kind: "circle" as const,
                  center: { x: 8, y: 0 },
                  radius: 2,
                  construction: false,
                },
              ]
            : [
                {
                  id: "arc",
                  kind: "arc" as const,
                  a: { x: 0, y: -4 },
                  b: { x: 0, y: 4 },
                  bulge: 1,
                  construction: false,
                },
                {
                  id: "axis",
                  kind: "segment" as const,
                  a: { x: 0, y: 4 },
                  b: { x: 0, y: -4 },
                  construction: false,
                },
              ],
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "revolve",
            revolution: {
              sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
              axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
              angle: 360,
              height: 0,
              mode: "new",
            },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "accept" });
      const body = owner.view.data.bodies?.at(-1);
      assert.ok(body);
      for (const thickness of [-1, 1]) {
        const result = await shell(owner, body, thickness);
        if (kind === "sphere") {
          assert.equal(result.faces.length, 2);
          for (const face of result.faces) {
            assert.ok(face.offsetHandle);
            assert.ok(face.thickness);
            assert.ok(Math.abs(face.thickness.distance - 1) < 1e-7);
            assert.equal(face.thickness.slope, 1);
            assert.equal(face.thickness.face, result.faces.find((f) => f.id !== face.id)?.id);
          }
        }
        const expected =
          kind === "sphere"
            ? ((4 * Math.PI) / 3) * Math.abs((4 + thickness) ** 3 - 64)
            : 16 * Math.PI ** 2 * Math.abs((2 + thickness) ** 2 - 4);
        assert.ok(
          Math.abs(result.volume - expected) < 1e-5,
          `${kind}: ${result.volume} vs ${expected}`,
        );
        await owner.call({ kind: "discard" });
      }
      assert.ok(
        (
          await owner.call({
            kind: "shell",
            operation: {
              selection: [{ body: body.id, faces: [] }],
              thickness: -5,
            },
          })
        ).error,
      );
    }
  } finally {
    owner.close();
  }
});

test("conical shell uses normal distance rather than radial shrink", async () => {
  const owner = new DocumentOwner();
  try {
    const points = [
      [0, 0],
      [8, 0],
      [6, 10],
      [0, 10],
    ];
    const sketch = {
      ...emptySketch(planes.XZ),
      curves: points.map(([x, y], i) => ({
        id: `side${i}`,
        kind: "segment" as const,
        a: { x, y },
        b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
        construction: false,
      })),
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "revolve",
          revolution: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
            angle: 360,
            height: 0,
            mode: "new",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const result = await shell(owner, body, -1, [cap(body, 10)]);
    const r0 = 7.8 - Math.sqrt(1.04),
      r1 = 6 - Math.sqrt(1.04);
    const expected = (1480 * Math.PI) / 3 - 3 * Math.PI * (r0 ** 2 + r0 * r1 + r1 ** 2);
    assert.ok(Math.abs(result.volume - expected) < 1e-5);
  } finally {
    owner.close();
  }
});
