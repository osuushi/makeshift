import {
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
} from "three";
import type { ImportedMesh } from "../src/model/mesh-import.js";
import type { Vector } from "../src/sketch/planes.js";

/** Independent Three.js tessellations; no quad layout or shared cube-grid generator. */
export function independentMesh(
  kind: "uv" | "ico" = "ico",
  map: (p: Vector) => Vector = (p) => p.map((v) => v * 10) as Vector,
): ImportedMesh {
  const geometry: BufferGeometry =
    kind === "uv" ? new SphereGeometry(1, 48, 24) : new IcosahedronGeometry(1, 11);
  return geometryMesh(geometry, map);
}
export function primitiveMesh(
  kind: "cylinder" | "capsule",
  radius = 6,
  height = 20,
  map: (p: Vector) => Vector = (p) => p,
): ImportedMesh {
  return geometryMesh(
    kind === "cylinder"
      ? new CylinderGeometry(radius, radius, height, 64, 8)
      : new CapsuleGeometry(radius, height, 16, 64),
    map,
  );
}
function geometryMesh(geometry: BufferGeometry, map: (p: Vector) => Vector): ImportedMesh {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute("position"),
    vertices: Vector[] = [],
    triangles: ImportedMesh["triangles"] = [],
    ids = new Map<string, number>();
  for (let i = 0; i < positions.count; i += 3) {
    const face: number[] = [];
    for (let j = 0; j < 3; j++) {
      const p = [positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j)].map(
        (v) => Math.round(v * 1e7) / 1e7,
      ) as Vector;
      const key = p.join(",");
      let id = ids.get(key);
      if (id === undefined) {
        id = vertices.length;
        ids.set(key, id);
        vertices.push(map(p));
      }
      face.push(id);
    }
    if (new Set(face).size === 3) triangles.push(face as [number, number, number]);
  }
  geometry.dispose();
  if (source !== geometry) source.dispose();
  return { vertices, triangles };
}
export function objFile(mesh: ImportedMesh): string {
  return (
    mesh.vertices.map((p) => `v ${p.join(" ")}`).join("\n") +
    "\n" +
    mesh.triangles.map((f) => `f ${f.map((i) => i + 1).join(" ")}`).join("\n")
  );
}
export function stlFile(mesh: ImportedMesh, binary = false): ArrayBuffer {
  if (!binary)
    return new TextEncoder().encode(
      "solid test\n" +
        mesh.triangles
          .map(
            (f) =>
              "facet normal 0 0 0\nouter loop\n" +
              f.map((i) => `vertex ${mesh.vertices[i].join(" ")}`).join("\n") +
              "\nendloop\nendfacet",
          )
          .join("\n") +
        "\nendsolid test",
    ).buffer;
  const bytes = new ArrayBuffer(84 + 50 * mesh.triangles.length),
    view = new DataView(bytes);
  view.setUint32(80, mesh.triangles.length, true);
  for (const [i, face] of mesh.triangles.entries())
    for (const [j, id] of face.entries())
      for (const [k, value] of mesh.vertices[id].entries())
        view.setFloat32(84 + 50 * i + 12 + 12 * j + 4 * k, value, true);
  return bytes;
}
