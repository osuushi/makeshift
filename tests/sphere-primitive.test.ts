import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sphereAxisDirection, sphereSketch } from "../src/model/sphere-sketch.js";
import { type PlaneFrame, planes, worldPoint } from "../src/sketch/planes.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

test("sphere diameter projects away from camera and remains stable head-on", () => {
  assert.deepEqual(sphereAxisDirection(planes.XY, [0, 0, -1]), { x: 0, y: 1 });
  const direction = sphereAxisDirection(planes.XY, [3, -4, -5]);
  near(direction.x, 0.6);
  near(direction.y, -0.8);
});

test("ordinary circle and diameter produce one exact sphere from either half-region", async () => {
  const owner = new DocumentOwner();
  try {
    const tilted: PlaneFrame = {
      origin: [12, -7, 3],
      u: [Math.SQRT1_2, Math.SQRT1_2, 0],
      v: [0, 0, 1],
    };
    for (const plane of [planes.XY, planes.XZ, tilted]) {
      const placement = { plane, center: { x: 4, y: -2 }, radius: 3, symmetric: false };
      const { sketch, axis, probe } = sphereSketch(placement, [-1, 2, -3]);
      assert.equal(sketch.curves.length, 2);
      assert.equal(sketch.curves[0].kind, "circle");
      assert.equal(sketch.curves[1].kind, "segment");
      assert.ok(sketch.curves.every((curve) => !curve.construction));
      const reply = await owner.call({ kind: "edit", sketch });
      assert.equal(reply.error, undefined);
      const accepted = owner.view.data.sketches.find((item) => item.id === sketch.id);
      assert.ok(accepted);
      const regions = profilesFor(accepted);
      assert.equal(regions.length, 2);
      assert.ok(profileAt(accepted, probe));
      const before = owner.view.data;
      for (const profile of regions) {
        near(profile.area, (Math.PI * 9) / 2);
        for (const angle of [360, 180]) {
          const revolution = {
            sources: [{ sketch: sketch.id, profile: profile.key }],
            axis,
            angle,
            height: 0,
            mode: "new" as const,
          };
          const preview = await owner.call({ kind: "revolve", revolution });
          assert.equal(preview.error, undefined);
          const body = preview.view.candidate?.bodies?.at(-1);
          assert.ok(body);
          near(body.volume, (36 * Math.PI * angle) / 360);
          if (angle === 360) {
            const center = worldPoint(plane, placement.center);
            center.forEach((value, i) => {
              near(body.center[i], value);
            });
            assert.ok(body.faces.some((face) => face.sphere));
          }
          assert.deepEqual(owner.view.data, before);
        }
      }
      const chosen = profileAt(accepted, probe);
      assert.ok(chosen);
      const preview = await owner.call({
        kind: "revolve",
        revolution: {
          sources: [{ sketch: sketch.id, profile: chosen.key }],
          axis,
          angle: 360,
          height: 0,
          mode: "new",
        },
      });
      assert.equal(preview.error, undefined);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const solid = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, solid);
    }
  } finally {
    owner.close();
  }
});
