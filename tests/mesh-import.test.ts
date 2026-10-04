import assert from "node:assert/strict";
import test from "node:test";
import { readMeshFile } from "../src/model/mesh-import.js";
import { independentMesh, objFile, stlFile } from "./mesh-import-fixtures.js";

const encode = (text: string) => new TextEncoder().encode(text).buffer;
for (const name of ["OBJ", "ASCII STL", "binary STL"])
  test(`mesh import reads and welds ${name}`, () => {
    const mesh = independentMesh("uv");
    const bytes = name === "OBJ" ? encode(objFile(mesh)) : stlFile(mesh, name === "binary STL");
    const read = readMeshFile(name === "OBJ" ? "model.obj" : "model.stl", bytes);
    assert.equal(read.vertices.length, mesh.vertices.length);
    assert.equal(read.triangles.length, mesh.triangles.length);
  });
test("OBJ supports negative indexes and preserves polygon winding", () => {
  const input = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf -4 -3 -2 -1";
  const mesh = readMeshFile("model.obj", encode(input));
  assert.equal(mesh.triangles.length, 2);
  for (const [a, b, c] of mesh.triangles.map((f) => f.map((i) => mesh.vertices[i])))
    assert((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
});
for (const [name, bytes] of [
  ["bad.obj", encode("v NaN 1 2\nf 1 2 3")],
  ["bad.obj", encode("v 0 0 0\nf 0 1 2")],
  ["bad.stl", new ArrayBuffer(100)],
  ["bad.stl", encode("solid x\nfacet normal 0 0 0\nvertex 0 0 0\nendfacet\nendsolid")],
  ["model.txt", encode("hello")],
] as const)
  test(`reject malformed ${name}: ${bytes.byteLength} bytes`, () =>
    assert.throws(() => readMeshFile(name, bytes)));

test("ASCII STL does not silently discard a truncated trailing facet", () => {
  const bytes = stlFile(independentMesh("uv"), false);
  const text = new TextDecoder()
    .decode(bytes)
    .replace("endsolid", "facet normal 0 0 1\nouter loop\nvertex 1 2 3\nendsolid");
  assert.throws(() => readMeshFile("broken.stl", encode(text)), /Incomplete/);
});

test("OBJ polygon triangulation preserves outward winding on every cube side", () => {
  const points = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const text =
    points.map((p) => `v ${p.join(" ")}`).join("\n") +
    "\n" +
    faces.map((f) => `f ${f.map((i) => i + 1).join(" ")}`).join("\n");
  const mesh = readMeshFile("cube.obj", encode(text));
  const uses = new Map<string, number>();
  for (const f of mesh.triangles)
    for (let i = 0; i < 3; i++) {
      const a = f[i],
        b = f[(i + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join(",");
      uses.set(key, (uses.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  assert.equal(mesh.triangles.length, 12);
  assert(
    [...uses.values()].every((v) => v === 0),
    "Each shared edge must have opposite uses",
  );
});

test("ASCII STL solid names may contain the word facet", () => {
  const mesh = independentMesh("uv");
  const text = new TextDecoder().decode(stlFile(mesh)).replaceAll("solid test", "solid facet");
  assert.equal(readMeshFile("named.stl", encode(text)).triangles.length, mesh.triangles.length);
});
