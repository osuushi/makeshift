import assert from "node:assert/strict";

// Independent screen-to-plane fixture math uses delivered browser coordinates;
// it never reads the product gesture result or its projection helper.
export function deliveredAxisDelta(gesture, unit) {
  const down = gesture[0],
    up = gesture.at(-1);
  return ((up.x - down.x) * unit.x + (up.y - down.y) * unit.y) / (unit.x ** 2 + unit.y ** 2);
}

export function deliveredPlaneDelta(gesture, origin, u, v) {
  const down = gesture[0],
    up = gesture.at(-1);
  const ux = u.x - origin.x,
    uy = u.y - origin.y;
  const vx = v.x - origin.x,
    vy = v.y - origin.y;
  const det = ux * vy - uy * vx;
  assert.ok(Math.abs(det) > 1e-6, "Fixture plane must have a nonsingular projection");
  const x = up.x - down.x,
    y = up.y - down.y;
  return { x: (x * vy - y * vx) / det, y: (ux * y - uy * x) / det };
}

export function deliveredRotation(gesture, origin, offset) {
  const [down, up] = [gesture[0], gesture.at(-1)];
  const a = { x: down.x - offset.x - origin.x, y: down.y - offset.y - origin.y };
  const b = { x: up.x - offset.x - origin.x, y: up.y - offset.y - origin.y };
  return (Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) / Math.PI;
}
