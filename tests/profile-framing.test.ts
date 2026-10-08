import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyCameraPose, planeCameraPose } from "../src/sketch/camera-motion.js";
import { emptySketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes, worldPoint } from "../src/sketch/planes.js";
import { profileFraming } from "../src/sketch/profile-framing.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("profile framing fits all plane sides and quarter turns without cropping or changing center", () => {
  const aspect = 1280 / 850;
  for (const frame of Object.values(planes)) {
    const sketch = rectangle(emptySketch(frame), { x: 24, y: 18 }, { x: 36, y: 26 }).sketch;
    const profile = profilesFor(sketch)[0];
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const normal = u.clone().cross(v);
    for (const side of [-1, 1])
      for (const turn of [0, 1, 2, 3]) {
        const camera = new THREE.OrthographicCamera(-40 * aspect, 40 * aspect, 40, -40, 0.1, 10000);
        const angle = (turn * Math.PI) / 2;
        camera.position
          .copy(normal)
          .multiplyScalar(side * 120)
          .addScaledVector(u, 1);
        camera.up.copy(v).multiplyScalar(Math.cos(angle)).addScaledVector(u, Math.sin(angle));
        camera.lookAt(new THREE.Vector3());
        const world = {
          camera,
          target: new THREE.Vector3(),
          height: 80,
          canvas: { clientWidth: 1280, clientHeight: 850 },
        };
        const framing = profileFraming({ world } as unknown as SketchEditor, sketch, profile);
        const expectedHeight = turn % 2 ? 18 : 12;
        assert.ok(Math.abs((framing.height ?? 0) - expectedHeight) < 1e-10);
        assert.deepEqual(framing.target, worldPoint(frame, { x: 30, y: 22 }));
        applyCameraPose(world, planeCameraPose(world, frame, framing));
        camera.left = (-expectedHeight * aspect) / 2;
        camera.right = -camera.left;
        camera.top = expectedHeight / 2;
        camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        for (const x of [24, 36])
          for (const y of [18, 26]) {
            const p = new THREE.Vector3(...worldPoint(frame, { x, y })).project(camera);
            assert.ok(
              Math.abs(p.x) <= 2 / 3 + 1e-10 && Math.abs(p.y) <= 2 / 3 + 1e-10,
              "Every corner retains the requested viewport margin",
            );
          }
      }
  }
});
