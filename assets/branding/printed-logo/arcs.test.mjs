import assert from "node:assert/strict";
import test from "node:test";
import { parseGcode } from "./gcode.mjs";
import { arcMove } from "./gcode-arcs.mjs";
import { beadMesh } from "./surface.mjs";

test("clockwise and counterclockwise quarters preserve endpoints and circular shape", () => {
  for (const clockwise of [false, true]) {
    const end = [0, clockwise ? -1 : 1, 0.2];
    const arc = arcMove([1, 0, 0.2], end, { I: -1, J: 0 }, clockwise);
    assert.deepEqual(arc.points.at(-1), end);
    assert.ok(Math.abs(arc.length - Math.PI / 2) < 1e-12);
    for (const [x, y] of arc.points) assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-12);
    assert.ok(arc.points.every((p) => (clockwise ? p[1] <= 0 : p[1] >= 0)));
  }
});

test("Orca scope excludes machine priming and helical travel, preserves declared widths", () => {
  const text = `M83
G1 X50 Y70 Z.2 E10
T1000
G3 Z.4 I1 J0 P1
; LAYER_HEIGHT: 0.2
; start printing object, unique label id: 108
G1 X1 Y0 Z.2
; FEATURE: Outer wall
; LINE_WIDTH: 1.15
G3 X0 Y1 I-1 J0 E.14
; stop printing object, unique label id: 108
G1 X100 E5`;
  const paths = parseGcode(text);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].type, "External perimeter");
  assert.deepEqual(paths[0].points[0], [1, 0, 0.2]);
  assert.deepEqual(paths[0].points.at(-1), [0, 1, 0.2]);
  assert.ok(paths[0].widths.every((w) => w === 1.15));
  assert.ok(paths[0].volumeWidths.every((w) => w < 1.15));
});

test("the supplied rounded tip stays rounded through arc decoding", () => {
  // Exact source excerpt from the founder's Orca export, final orange outer wall.
  const text = `M83
G1 X123.667 Y126.421 Z8
; LAYER_HEIGHT: 0.2
; FEATURE: Outer wall
; LINE_WIDTH: 1.15
G3 X126.337 Y124.445 I4.766 J3.648 E.30361
G1 X127.165 Y124.209 E.07763
G1 X127.609 Y124.151 E.04045
G1 X128.025 Y124.229 E.03816
G1 X128.406 Y124.414 E.03818
G1 X128.705 Y124.712 E.03811
G1 X128.915 Y125.079 E.03813
G1 X129.002 Y125.636 E.05092
G1 X128.914 Y126.05 E.03814
G1 X128.705 Y126.45 E.04072`;
  const [path] = parseGcode(text);
  assert.deepEqual(path.points.at(-1), [128.705, 126.45, 8]);
  assert.equal(Math.max(...path.points.map((p) => p[0])), 129.002);
  const i = path.points.findIndex((p) => p[0] === 129.002);
  assert.ok(path.points[i - 1][1] < path.points[i][1] && path.points[i + 1][1] > path.points[i][1]);
  for (const point of path.points) {
    point[0] -= 128;
    point[1] -= 126;
  }
  const mesh = beadMesh([path]);
  // The former pointed perimeter reached X=2.236 before adding bead thickness.
  // This rounded tip's swept footprint must stay inside X=1.65, including miters.
  assert.ok(mesh.vertices.every((point) => point.every(Number.isFinite)));
  assert.ok(Math.max(...mesh.vertices.map((point) => point[0])) < 1.65);
});
