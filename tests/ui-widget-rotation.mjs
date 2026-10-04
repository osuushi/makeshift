import assert from "node:assert/strict";
import * as THREE from "three";
import { inspect } from "./ui-helpers.mjs";
import { centerOf, dragPixels } from "./ui-widget-reachability.mjs";

// Request and expected actual rotation use an independent Node Three.js camera,
// the delivered browser clients and the display correction frozen at press.
export async function rotateDocked(page, handle, pivot, axis, degrees) {
  const { camera } = await inspect(page),
    bounds = await page.locator("#world canvas").boundingBox();
  const h = camera.height / 2,
    w = (h * bounds.width) / bounds.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const displayed = await centerOf(handle);
  const offset = await handle.evaluate((element) => {
    const values = getComputedStyle(element).translate.split(" ").map(Number.parseFloat);
    return {
      x: Number(element.dataset.displayOffsetX) || values[0] || 0,
      y: Number(element.dataset.displayOffsetY) || values[1] || 0,
    };
  });
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      (2 * (displayed.x - offset.x - bounds.x)) / bounds.width - 1,
      1 - (2 * (displayed.y - offset.y - bounds.y)) / bounds.height,
    ),
    view,
  );
  const origin = new THREE.Vector3(...pivot),
    normal = new THREE.Vector3(...axis);
  const hit = ray.ray.intersectPlane(
    new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin),
    new THREE.Vector3(),
  );
  assert.ok(hit);
  const end = hit
    .sub(origin)
    .applyAxisAngle(normal, (degrees * Math.PI) / 180)
    .add(origin)
    .project(view);
  const target = {
    x: bounds.x + ((end.x + 1) * bounds.width) / 2 + offset.x,
    y: bounds.y + ((1 - end.y) * bounds.height) / 2 + offset.y,
  };
  const state = await dragPixels(
    page,
    handle,
    { x: target.x - displayed.x, y: target.y - displayed.y },
    ["Shift"],
  );
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
  const points = [state.widgetGesture[0], state.widgetGesture.at(-1)].map((point) => {
    ray.setFromCamera(
      new THREE.Vector2(
        (2 * (point.x - offset.x - bounds.x)) / bounds.width - 1,
        1 - (2 * (point.y - offset.y - bounds.y)) / bounds.height,
      ),
      view,
    );
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    assert.ok(hit);
    return hit.sub(origin).normalize();
  });
  const deliveredAngle =
    (Math.atan2(points[0].clone().cross(points[1]).dot(normal), points[0].dot(points[1])) * 180) /
    Math.PI;
  return { ...state, rotationInput: { camera, bounds, pivot, axis, offset, deliveredAngle } };
}

export function assertRotatedFrame(actual, before, degrees, tolerance = 0.001) {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const expected = { ...before };
  for (const axis of ["u", "v"]) {
    const [x, y, z] = before[axis];
    expected[axis] = [x * c - y * s, x * s + y * c, z];
  }
  assertFrameComponents(actual, expected, tolerance);
}

export function assertTranslatedFrame(actual, before, axis, amount, tolerance = 0.001) {
  const origin = before.origin.map((value, i) => value + (i === axis ? amount : 0));
  assertFrameComponents(actual, { ...before, origin }, tolerance);
}

function assertFrameComponents(actual, expected, tolerance) {
  for (const key of ["origin", "u", "v"])
    actual[key].forEach((value, i) => {
      assert.ok(
        Math.abs(value - expected[key][i]) < tolerance,
        `Frame ${key}[${i}] actual${value} expected${expected[key][i]}`,
      );
    });
}
