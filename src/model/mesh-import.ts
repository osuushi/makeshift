import { ShapeUtils, Vector2, Vector3 } from "three";
import type { Vector } from "../sketch/planes.js";
import type { MeshFitInput } from "./mesh-fit.js";

export type ImportedMesh = MeshFitInput["mesh"];
export const meshImportLimit = 25 * 1024 * 1024;

/** File coordinates remain in source units until the preview's unit choice is applied. */
export function readMeshFile(name: string, bytes: ArrayBuffer): ImportedMesh {
  if (!bytes.byteLength || bytes.byteLength > meshImportLimit)
    throw new Error("Choose an STL or OBJ file smaller than 25 MB");
  const mesh = name.toLowerCase().endsWith(".stl")
    ? stl(bytes)
    : name.toLowerCase().endsWith(".obj")
      ? obj(new TextDecoder().decode(bytes))
      : null;
  if (!mesh) throw new Error("Choose an STL or OBJ mesh file");
  return weld(mesh);
}
function stl(bytes: ArrayBuffer): ImportedMesh {
  const data = new DataView(bytes),
    vertices: Vector[] = [],
    triangles: ImportedMesh["triangles"] = [];
  if (bytes.byteLength >= 84 && 84 + data.getUint32(80, true) * 50 === bytes.byteLength) {
    const count = data.getUint32(80, true);
    if (count > 200000) throw new Error("Mesh import supports up to 200000 triangles");
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 3; j++) {
        const offset = 84 + i * 50 + 12 + j * 12;
        vertices.push([
          data.getFloat32(offset, true),
          data.getFloat32(offset + 4, true),
          data.getFloat32(offset + 8, true),
        ]);
      }
      triangles.push([i * 3, i * 3 + 1, i * 3 + 2]);
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    if (!/^\s*solid\b/i.test(text)) throw new Error("Invalid or truncated STL file");
    let parsedFacets = 0;
    const facets = text.matchAll(/^\s*facet\s+normal\s+[^\r\n]+([\s\S]*?)endfacet/gim);
    for (const facet of facets) {
      parsedFacets++;
      const points = [...facet[1].matchAll(/\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi)];
      if (points.length !== 3) throw new Error("Each STL facet must contain three vertices");
      const base = vertices.length;
      for (const p of points) vertices.push([Number(p[1]), Number(p[2]), Number(p[3])]);
      triangles.push([base, base + 1, base + 2]);
      if (triangles.length > 200000) throw new Error("Mesh import supports up to 200000 triangles");
    }
    if (!/endsolid\b/i.test(text) || parsedFacets !== [...text.matchAll(/^\s*facet\b/gim)].length)
      throw new Error("Incomplete ASCII STL file");
  }
  return { vertices, triangles };
}
function polygon(points: Vector[], face: number[]): number[][] {
  if (face.length === 3) return [face];
  const normal = new Vector3();
  for (let i = 0; i < face.length; i++) {
    const a = new Vector3(...points[face[i]]),
      b = new Vector3(...points[face[(i + 1) % face.length]]);
    normal.add(a.cross(b));
  }
  if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0)
    throw new Error("Degenerate OBJ polygon");
  const n = normal.toArray().map(Math.abs),
    axis = n.indexOf(Math.max(...n));
  const uv = face.map(
    (i) => new Vector2(...(points[i].filter((_, d) => d !== axis) as [number, number])),
  );
  const result = ShapeUtils.triangulateShape(uv, []);
  if (result.length !== face.length - 2) throw new Error("Could not triangulate an OBJ polygon");
  return result.map((triangle) => {
    const indexes = triangle.map((i) => face[i]);
    const [a, b, c] = indexes.map((i) => new Vector3(...points[i]));
    if (b.sub(a).cross(c.sub(a)).dot(normal) < 0)
      [indexes[1], indexes[2]] = [indexes[2], indexes[1]];
    return indexes;
  });
}
function obj(text: string): ImportedMesh {
  const vertices: Vector[] = [],
    triangles: ImportedMesh["triangles"] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [kind, ...values] = raw.split("#")[0].trim().split(/\s+/);
    if (kind === "v") {
      if (values.length < 3) throw new Error("Invalid OBJ vertex");
      const p = values.slice(0, 3).map(Number) as Vector;
      const w = values.length === 4 ? Number(values[3]) : 1;
      if (!Number.isFinite(w) || w === 0) throw new Error("Invalid OBJ vertex weight");
      const position = p.map((v) => v / w) as Vector;
      if (position.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9))
        throw new Error("Mesh contains invalid coordinates");
      vertices.push(position);
      if (vertices.length > 600000) throw new Error("OBJ vertex count exceeds the import limit");
    } else if (kind === "f") {
      if (values.length < 3 || values.length > 256) throw new Error("Invalid OBJ polygon size");
      const face = values.map((v) => {
        const n = Number(v.split("/")[0]);
        const index = n < 0 ? vertices.length + n : n - 1;
        if (!Number.isInteger(n) || n === 0 || index < 0 || index >= vertices.length)
          throw new Error("Invalid OBJ vertex index");
        return index;
      });
      if (new Set(face).size !== face.length) throw new Error("Repeated OBJ polygon vertex");
      triangles.push(...(polygon(vertices, face) as ImportedMesh["triangles"]));
      if (triangles.length > 200000) throw new Error("Mesh import supports up to 200000 triangles");
    }
  }
  return { vertices, triangles };
}
function weld(mesh: ImportedMesh): ImportedMesh {
  const vertices: Vector[] = [],
    indexes = new Map<string, number>();
  const remap = mesh.vertices.map((p) => {
    if (p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e9))
      throw new Error("Mesh contains invalid coordinates");
    const key = p.join(",");
    let id = indexes.get(key);
    if (id === undefined) {
      id = vertices.length;
      indexes.set(key, id);
      vertices.push(p);
    }
    return id;
  });
  const triangles = mesh.triangles.map((f) => f.map((i) => remap[i]) as [number, number, number]);
  if (vertices.length < 4 || vertices.length > 100000 || !triangles.length)
    throw new Error("Mesh import requires 4–100000 vertices and at least one triangle");
  if (triangles.some((f) => new Set(f).size !== 3))
    throw new Error("Mesh contains collapsed triangles");
  // A consistently inward file is unambiguous; mixed winding remains a native validation error.
  const origin = vertices[0];
  let volume = 0;
  for (const f of triangles) {
    const [a, b, c] = f.map((i) => new Vector3(...vertices[i]).sub(new Vector3(...origin)));
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) for (const f of triangles) [f[1], f[2]] = [f[2], f[1]];
  return { vertices, triangles };
}
