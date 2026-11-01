import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { applyCameraPose, planeCameraPose } from "../src/sketch/camera-motion.js";
import { emptySketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { selectedFaceWorkspace } from "../src/sketch/face-workspace.js";
import { rectangle } from "../src/sketch/geometry.js";
import { type PlaneFrame, planes, worldPoint } from "../src/sketch/planes.js";
import { profileFraming } from "../src/sketch/profile-framing.js";
import { profilesFor } from "../src/sketch/profiles.js";

function faceFixture(world: unknown, frame: PlaneFrame): SketchEditor {
  return {
    world,
    modeling: {
      targets: [
        { kind: "face", body: "body", face: "a" },
        { kind: "face", body: "body", face: "b" },
      ],
    },
    display: {
      bodies: [
        {
          id: "body",
          faces: [
            {
              id: "a",
              plane: frame,
              vertices: [
                [24, 18],
                [28, 18],
                [28, 26],
              ].flatMap(([x, y]) => worldPoint(frame, { x, y })),
            },
            {
              id: "b",
              plane: frame,
              vertices: [
                [28, 18],
                [36, 18],
                [36, 26],
              ].flatMap(([x, y]) => worldPoint(frame, { x, y })),
            },
          ],
        },
      ],
    },
  } as unknown as SketchEditor;
}

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
        const faceEditor = faceFixture(world, frame);
        const faceFraming = selectedFaceWorkspace(faceEditor)?.framing;
        assert.deepEqual(faceFraming?.target, framing.target);
        assert.ok(Math.abs((faceFraming?.height ?? 0) - (framing.height ?? 0)) < 1e-10);
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

test("close profile and face entry keeps the point under the viewport center on offset planes", () => {
  for (const basis of Object.values(planes)) {
    const frame = { ...basis, origin: [7, -4, 12] as [number, number, number] };
    const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
    const anchor = new THREE.Vector3(...worldPoint(frame, { x: 25, y: 19 }));
    const sketch = rectangle(emptySketch(frame), { x: 24, y: 18 }, { x: 36, y: 26 }).sketch;
    for (const side of [-1, 1]) {
      const direction = normal
        .clone()
        .multiplyScalar(side * 100)
        .addScaledVector(new THREE.Vector3(...frame.u), 25)
        .addScaledVector(new THREE.Vector3(...frame.v), -15);
      const camera = new THREE.OrthographicCamera(-5, 5, 2.5, -2.5);
      camera.position.copy(anchor).add(direction);
      camera.up.fromArray(frame.v);
      const world = {
        camera,
        target: anchor.clone().addScaledVector(direction, 0.1),
        height: 5,
        canvas: { clientWidth: 1280, clientHeight: 850 },
      };
      camera.lookAt(world.target);
      camera.updateMatrixWorld();
      const before = anchor.clone().project(camera);
      const profile = profileFraming(
        { world } as unknown as SketchEditor,
        sketch,
        profilesFor(sketch)[0],
      );
      const face = selectedFaceWorkspace(faceFixture(world, frame))?.framing;
      for (const framing of [profile, face]) {
        const pose = planeCameraPose(world, frame, framing);
        assert.ok(
          pose.target.distanceTo(anchor) < 1e-10,
          "The viewed face corner remains the pivot",
        );
        assert.equal(pose.height, 5);
      }
      applyCameraPose(world, planeCameraPose(world, frame, face));
      const after = anchor.clone().project(camera);
      assert.ok(Math.hypot(before.x, before.y, after.x, after.y) < 1e-10);
    }
  }
});
