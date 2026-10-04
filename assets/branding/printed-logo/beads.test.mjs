import assert from "node:assert/strict";
import test from "node:test";
import { beadMesh, parseGcode } from "./beads.mjs";

test("absolute and relative E reconstruct the same deposited volume after retraction", () => {
  const absolute = "G90\nM82\nG1 Z.2\nG1 X10 E.34\nG1 E-.46\nG1 X20\nG1 E.34\nG1 X30 E.68";
  const relative = "G90\nM83\nG1 Z.2\nG1 X10 E.34\nG1 E-.8\nG1 X20\nG1 E.8\nG1 X30 E.34";
  const a = parseGcode(absolute),
    b = parseGcode(relative);
  assert.equal(a.length, 2);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i].points, b[i].points);
    assert.ok(Math.abs(a[i].widths[0] - b[i].widths[0]) < 1e-12);
  }
  const area = (a[0].widths[0] - 0.2) * 0.2 + Math.PI * 0.1 ** 2;
  assert.ok(Math.abs(area * 10 - 0.34 * Math.PI * 0.875 ** 2) < 1e-12);
});

test("E reset and relative XYZ preserve geometry while stationary priming adds no path", () => {
  const paths = parseGcode("M82\nG1 Z.2\nG1 E2\nG92 E0\nG91\nG1 X10 E.34\nG1 Y10 E.68");
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].points, [
    [0, 0, 0.2],
    [10, 0, 0.2],
    [10, 10, 0.2],
  ]);
});

test("unsupported motion fails explicitly", () => {
  for (const code of ["G20", "G10", "T1"]) assert.throws(() => parseGcode(code), /Unsupported/);
  assert.throws(() => parseGcode("M83\nG1 Z.2\nG2 X3 E1"), /I\/J/);
});

test("sub-layer-width strands retain a convex footprint at the declared width", () => {
  const paths = parseGcode("M83\n; WIDTH: .02\nG1 Z.2\nG1 X10 E.001");
  assert.equal(paths[0].widths[0], 0.02);
  const mesh = beadMesh(paths, 6, 0.35);
  assert.ok(mesh.vertices.flat().every(Number.isFinite));
  const ring = mesh.vertices.slice(0, 32);
  assert.ok(Math.abs(Math.max(...ring.map((v) => v[1])) - 0.01) < 1e-12);
  assert.ok(Math.abs(Math.min(...ring.map((v) => v[1])) + 0.01) < 1e-12);
  assert.ok(mesh.vertices.every(([, , z]) => z >= 0 && z <= 0.2));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % 32],
      c = ring[(i + 2) % 32];
    const cross = (b[1] - a[1]) * (c[2] - b[2]) - (b[2] - a[2]) * (c[1] - b[1]);
    assert.ok(cross > 0, "section must remain convex and consistently oriented");
  }
  assert.throws(() => parseGcode("M83\n; WIDTH: 0\nG1 Z.2\nG1 X10 E.001"), /Invalid bead/);
});

for (const profile of ["stadium", "ellipse"])
  test(`acute return strokes form closed, oriented ${profile} shells`, () => {
    const paths = parseGcode("M83\nG1 Z.2\nG1 X10 E.34\nG1 X0 Y.1 E.34\nG1 X10 E.34");
    const mesh = beadMesh(paths, 6, 0.04, [], profile);
    assert.ok(mesh.vertices.flat().every(Number.isFinite));
    assert.equal(mesh.faces.length, mesh.materials.length);
    const edges = new Map();
    for (const face of mesh.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length];
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        const edge = edges.get(key) ?? { count: 0, direction: 0 };
        edge.count++;
        edge.direction += a < b ? 1 : -1;
        edges.set(key, edge);
      }
    }
    assert.ok([...edges.values()].every((edge) => edge.count === 2 && edge.direction === 0));
    assert.ok(
      mesh.vertices.every(([x, y, z]) => x > -1 && x < 11 && y > -1 && y < 1 && z >= 0 && z <= 0.2),
    );
  });

test("rounded icon beads preserve slicer widths and bed/top bounds for wide and narrow strands", () => {
  for (const width of [0.02, 2]) {
    const paths = parseGcode(`M83\n; WIDTH: ${width}\nG1 Z.2\nG1 X10 E.34`);
    const mesh = beadMesh(paths, 6, 0, [], "ellipse");
    assert.ok(mesh.vertices.flat().every(Number.isFinite));
    const ring = mesh.vertices.slice(0, 32);
    assert.ok(Math.abs(Math.max(...ring.map((v) => v[1])) - width / 2) < 1e-12);
    assert.ok(Math.abs(Math.min(...ring.map((v) => v[1])) + width / 2) < 1e-12);
    assert.ok(mesh.vertices.every(([, , z]) => z >= 0 && z <= 0.2));
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % 32],
        c = ring[(i + 2) % 32];
      const cross = (b[1] - a[1]) * (c[2] - b[2]) - (b[2] - a[2]) * (c[1] - b[1]);
      assert.ok(cross > 0, "rounded section must have no flat or folded roof segments");
    }
  }
});

test("coarse icon domes deepen into earlier layers without raising the model top", () => {
  const paths = parseGcode("M83\n; HEIGHT: .2\n; WIDTH: 2\nG1 Z1\nG1 X10 E.34");
  const mesh = beadMesh(paths, 6, 0, [], "ellipse");
  const zs = mesh.vertices.map((p) => p[2]);
  assert.equal(Math.max(...zs), 1);
  assert.ok(Math.min(...zs) >= 0);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 0.6, "wide beads need visible rounded depth");
});
