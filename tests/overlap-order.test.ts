import assert from "node:assert/strict";
import test from "node:test";
import type { OverlapCandidate, OverlapTarget } from "../src/model/overlap-candidates.js";
import { orderOverlapChoices } from "../src/model/overlap-layout.js";
import { planes } from "../src/sketch/planes.js";

function choice(
  target: OverlapTarget,
  depth: number,
  key: string,
  label: string = target.kind,
): OverlapCandidate {
  return { target, depth, key, label };
}

test("overlap types stay together, ordered by minimum depth and then item depth", () => {
  const candidates = [
    choice({ kind: "face", body: "rear", face: "rear-face" }, 30, "rear-face"),
    choice({ kind: "edge", body: "rear", edge: "rear-edge" }, 40, "rear-edge"),
    choice({ kind: "body", body: "rear" }, 20, "rear"),
    choice({ kind: "edge", body: "front", edge: "front-edge" }, 5, "front-edge"),
    choice({ kind: "face", body: "front", face: "front-face" }, 10, "front-face"),
    choice({ kind: "plane", world: "XY", frame: planes.XY }, 15, "XY", "Plane · XY"),
    choice({ kind: "plane", world: "XZ", frame: planes.XZ }, 50, "XZ", "Plane · XZ"),
  ];
  const original = [...candidates];
  assert.deepEqual(
    orderOverlapChoices(candidates).map((c) => c.key),
    ["front-edge", "rear-edge", "front-face", "rear-face", "XY", "XZ", "rear"],
  );
  assert.deepEqual(candidates, original, "Presentation ordering leaves input candidates intact");
  assert.deepEqual(orderOverlapChoices([]), []);
});

test("equal depths retain existing type and item precedence", () => {
  const candidates = [
    choice({ kind: "face", body: "b", face: "z" }, 10, "z"),
    choice({ kind: "edge", body: "b", edge: "e" }, 10, "e"),
    choice({ kind: "face", body: "b", face: "a" }, 10, "a"),
  ];
  assert.deepEqual(
    orderOverlapChoices(candidates).map((c) => c.key),
    ["z", "a", "e"],
  );
});

test("sketch choices group by displayed geometry type", () => {
  const curve = (id: string): OverlapTarget => ({
    kind: "sketch-hit",
    sketch: "s",
    hit: { kind: "curve", curve: id, point: { x: 0, y: 0 } },
  });
  const candidates = [
    choice(curve("c1"), 0, "c1", "Circle"),
    choice(curve("l"), 0, "l", "Curve"),
    choice(curve("c2"), 0, "c2", "Circle"),
  ];
  assert.deepEqual(
    orderOverlapChoices(candidates).map((c) => c.key),
    ["c1", "c2", "l"],
  );
});
