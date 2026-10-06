import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { extrude } from "./face-cut-fixtures.js";

for (const kind of ["cone", "spline"] as const) {
  test(`${kind}: exact curved support cuts and imprints through script candidates`, async () => {
    const owner = new DocumentOwner();
    try {
      const target = await extrude(
        owner,
        rectangle(
          emptySketch(planes.XY),
          kind === "cone" ? { x: -10, y: -10 } : { x: 8, y: -5 },
          kind === "cone" ? { x: 10, y: 10 } : { x: 12, y: 5 },
        ).sketch,
        kind === "cone" ? 20 : 10,
      );
      const source =
        kind === "cone"
          ? await extrude(
              owner,
              {
                ...emptySketch({ ...planes.XY, origin: [0, 0, 30] }),
                curves: [
                  {
                    id: "circle",
                    kind: "circle",
                    center: { x: 0, y: 0 },
                    radius: 5,
                    construction: false,
                  },
                ],
              },
              5,
              { draft: { mode: "angle", value: 2 } },
            )
          : await extrude(
              owner,
              rectangle(emptySketch(planes.XY), { x: -10, y: -10 }, { x: 10, y: 10 }).sketch,
              20,
              { twist: { angle: 90, origin: [0, 0, 0] } },
            );
      const face = source.faces.find((face) =>
        kind === "cone"
          ? face.cone
          : !face.plane &&
            source.edges.some(
              (edge) =>
                face.edges.includes(edge.id) &&
                edge.points.length >= 6 &&
                edge.points.every((value, index) =>
                  index % 3 === 0
                    ? Math.abs(value - 10) < 1e-6
                    : index % 3 === 2
                      ? Math.abs(value) < 1e-6
                      : true,
                ),
            ),
      );
      const cap = target.faces.find(
        (face) => face.plane?.origin[2] === (kind === "cone" ? 20 : 10),
      );
      assert.ok(face && cap);
      const before = owner.view.data;
      for (const mode of ["splitBody", "imprint"] as const) {
        owner.beginScript(mode);
        await owner.scripts.step({
          kind: mode,
          input: {
            targets: [{ body: target.id, ...(mode === "imprint" ? { faces: [cap.id] } : {}) }],
            surface: { body: source.id, face: face.id },
          },
        });
        owner.scripts.finish();
        const result = owner.view.data.bodies?.filter((body) => body.id !== source.id);
        assert.ok(result);
        assert.equal(result.length, mode === "imprint" ? 1 : 2);
        assert.ok(
          Math.abs(result.reduce((sum, body) => sum + body.volume, 0) - target.volume) < 1e-6,
        );
        if (mode === "imprint") assert.equal(result[0].faces.length, 7);
        else if (kind === "cone") {
          const slope = Math.tan((2 * Math.PI) / 180),
            a = 5 - 30 * slope,
            b = 5 - 10 * slope;
          const expected = ((Math.PI * 20) / 3) * (a * a + a * b + b * b);
          assert.ok(result.some((body) => Math.abs(body.volume - expected) < 1e-6));
        }
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data, before);
      }
    } finally {
      owner.close();
    }
  });
}
