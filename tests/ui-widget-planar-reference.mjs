import assert from "node:assert/strict";

// These rectangle fixtures use every selected segment endpoint as an independent
// reference. Delivered creation can move their bounds center away from the origin.
export function planarReference(sketch) {
  const points = sketch.curves.flatMap((curve) => {
    assert.equal(curve.kind, "segment");
    return [curve.a, curve.b];
  });
  const center = Object.fromEntries(
    ["x", "y"].map((axis) => [
      axis,
      (Math.min(...points.map((p) => p[axis])) + Math.max(...points.map((p) => p[axis]))) / 2,
    ]),
  );
  const { origin, u, v } = sketch.plane;
  const world = origin.map((value, i) => value + u[i] * center.x + v[i] * center.y);
  return { center, world };
}

export function rotatedPlanarPoint(point, center, degrees) {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = point.x - center.x,
    y = point.y - center.y;
  return { x: center.x + x * c - y * s, y: center.y + x * s + y * c };
}

export function assertPlanarRotation(actual, before, center, degrees) {
  assert.deepEqual(actual.plane, before.plane);
  assert.equal(actual.id, before.id);
  assert.equal(actual.curves.length, before.curves.length);
  before.curves.forEach((curve, i) => {
    const changed = actual.curves[i];
    assert.equal(changed.id, curve.id);
    for (const key of ["a", "b"]) {
      const expected = rotatedPlanarPoint(curve[key], center, degrees);
      assert.ok(
        Math.hypot(changed[key].x - expected.x, changed[key].y - expected.y) < 1e-5,
        JSON.stringify({ key, actual: changed[key], expected, center, degrees, curve: curve.id }),
      );
    }
  });
}
