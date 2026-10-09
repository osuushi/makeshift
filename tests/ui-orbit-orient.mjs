import assert from "node:assert/strict";
import * as THREE from "three";
import { levelOrientation } from "../src/sketch/camera-orbit.ts";
import { inspect } from "./ui-helpers.mjs";

/** Reach a viewing direction through ordinary center-band Command drags. */
export async function orientWithTurntable(page, normal) {
  const desired = new THREE.Vector3(...normal).normalize();
  const box = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  assert.ok(box);
  const radius = Math.min(box.width, box.height) / 2;
  for (let step = 0; step < 12; step++) {
    const { camera } = await inspect(page);
    const target = new THREE.Vector3(...camera.target);
    const direction = new THREE.Vector3(...camera.position).sub(target).normalize();
    if (direction.angleTo(desired) < 0.01) return;
    const view = new THREE.PerspectiveCamera();
    view.position.fromArray(camera.position);
    view.up.fromArray(camera.up);
    view.lookAt(target);
    const upAxis = uprightAxis(view, target);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(view.quaternion);
    const elevation = (vector) => Math.asin(THREE.MathUtils.clamp(vector.dot(upAxis), -1, 1));
    const pitch = THREE.MathUtils.clamp(elevation(direction) - elevation(desired), -0.7, 0.7);
    const pitched = direction.clone().applyAxisAngle(right, pitch);
    const horizontal = (vector) => vector.clone().addScaledVector(upAxis, -vector.dot(upAxis));
    const a = horizontal(pitched),
      b = horizontal(desired);
    const yaw =
      a.lengthSq() * b.lengthSq() < 1e-12
        ? 0
        : THREE.MathUtils.clamp(Math.atan2(upAxis.dot(a.clone().cross(b)), a.dot(b)), -0.7, 0.7);
    const start = await safePress(page, box, radius);
    const end = { x: start.x - (yaw * radius) / 2, y: start.y - (pitch * radius) / 2 };
    await page.keyboard.down("Meta");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    if (Math.hypot(end.x - start.x, end.y - start.y) <= 4)
      await page.mouse.move(start.x + 8, start.y, { steps: 2 });
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
  }
  const { camera } = await inspect(page);
  const direction = new THREE.Vector3(...camera.position).sub(new THREE.Vector3(...camera.target));
  assert.ok(direction.angleTo(desired) < 0.01, "Turntable reaches the requested viewing direction");
}

function uprightAxis(camera, target) {
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const candidates = (orientation) => {
    const inverse = orientation.clone().invert();
    return axes
      .map((axis) => {
        const p = axis.clone().applyQuaternion(inverse);
        const sign = p.y < 0 ? -1 : 1;
        return { axis: axis.clone().multiplyScalar(sign), p, depth: p.z * sign };
      })
      .filter(({ p }) => Math.abs(p.x) < 1e-10 && Math.abs(p.y) > 1e-12)
      .sort((a, b) => b.depth - a.depth);
  };
  // This is fixture steering, not the release-snap assertion: follow the actual
  // snapped upright axis, using production leveling only for an unleveled pose.
  return (candidates(camera.quaternion)[0] ?? candidates(levelOrientation({ camera, target }))[0])
    .axis;
}

async function safePress(page, box, radius) {
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    candidates.push({ x: 0.5 * Math.cos(angle), y: 0.5 * Math.sin(angle) });
  }
  candidates.push({ x: 0, y: 0 });
  for (const candidate of candidates) {
    const point = {
      x: box.x + box.width / 2 + candidate.x * radius,
      y: box.y + box.height / 2 - candidate.y * radius,
    };
    if (
      await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        const canvas = document.querySelector("canvas");
        const overlay = document.querySelector("#overlay");
        if (!element || (element !== canvas && element !== overlay && !overlay?.contains(element)))
          return false;
        if (element.closest("button, input, .scale-card")) return false;
        const handles = [...document.querySelectorAll(".transform-box-handle")]
          .map((handle) => handle.getBoundingClientRect())
          .filter((rect) => rect.width && rect.height);
        if (!handles.length) return true;
        const left = Math.min(...handles.map((rect) => rect.left)) - 20;
        const right = Math.max(...handles.map((rect) => rect.right)) + 20;
        const top = Math.min(...handles.map((rect) => rect.top)) - 20;
        const bottom = Math.max(...handles.map((rect) => rect.bottom)) + 20;
        return x < left || x > right || y < top || y > bottom;
      }, point)
    )
      return point;
  }
  throw new Error("No unobstructed center-band orbit press");
}
