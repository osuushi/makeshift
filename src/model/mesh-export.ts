import { strToU8, zipSync } from "three/addons/libs/fflate.module.js";
import type { Body } from "./body.js";
import { retriangulateCollinear } from "./collinear-facets.js";
import { type ExportMesh, exportMesh, triangleNormal, validateMesh } from "./export-mesh.js";
import type { ExportTiming } from "./export-timing.js";
import { packedMesh } from "./packed-mesh.js";

export type ExportFormat = "stl" | "3mf";
export function exportBodies(
  bodies: readonly Body[],
  format: ExportFormat,
): Uint8Array<ArrayBuffer> {
  if (!bodies.length) throw new Error("Create a solid body before exporting");
  return encodeMeshes(bodies.map(exportMesh), format);
}

export function encodeMeshes(
  meshes: ExportMesh[],
  format: ExportFormat,
  timing?: ExportTiming,
): Uint8Array<ArrayBuffer> {
  if (!meshes.length) throw new Error("Create a solid body before exporting");
  return format === "stl" ? stl(meshes) : threeMF(meshes, timing);
}

function stlMesh(mesh: ExportMesh): ExportMesh {
  const vertices = mesh.vertices.map((p) => p.map(Math.fround));
  if (mesh.precision === undefined) {
    // Float32 can make tangent-circle facets exactly collinear. Reuse their
    // vertices in adjacent triangles without moving or welding coordinates.
    const result = retriangulateCollinear({ ...mesh, vertices }, 0);
    validateMesh(result);
    return result;
  }
  let rounding = 0;
  for (let i = 0; i < vertices.length; i++)
    rounding = Math.max(
      rounding,
      Math.hypot(...vertices[i].map((v, axis) => v - mesh.vertices[i][axis])),
    );
  if (!Number.isFinite(rounding) || rounding >= mesh.precision)
    throw new Error("Coordinates exceed STL precision; export 3MF to retain this placement");
  const result = packedMesh({ vertices, triangles: mesh.triangles }, mesh.precision - rounding);
  validateMesh(result);
  return result;
}

function stl(source: ExportMesh[]): Uint8Array<ArrayBuffer> {
  const meshes = source.map(stlMesh);
  const count = meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0);
  const bytes = new Uint8Array(84 + 50 * count),
    view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("Makeshift binary STL; coordinates in millimeters"));
  view.setUint32(80, count, true);
  let offset = 84;
  for (const mesh of meshes)
    for (const triangle of mesh.triangles) {
      const points = triangle.map((index) => mesh.vertices[index].map(Math.fround));
      if (!points.flat().every(Number.isFinite))
        throw new Error("Coordinates exceed STL precision");
      // Validate after conversion too: binary STL stores only float32 coordinates.
      for (const value of [...triangleNormal(points), ...points.flat()]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      offset += 2;
    }
  return bytes;
}

function threeMF(meshes: ExportMesh[], timing?: ExportTiming): Uint8Array<ArrayBuffer> {
  const objects = meshes
    .map((mesh, index) => {
      const vertices = mesh.vertices
        .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
        .join("");
      const triangles = mesh.triangles
        .map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`)
        .join("");
      return `<object id="${index + 1}" type="model" name="Body ${index + 1}"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object>`;
    })
    .join("");
  const build = meshes.map((_, index) => `<item objectid="${index + 1}"/>`).join("");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  // Core OPC package; no slicer-specific project settings or required extensions.
  timing?.mark("threeMfXml");
  const files = {
    "[Content_Types].xml": strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(
      `${xml}<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects}</resources><build>${build}</build></model>`,
    ),
  };
  timing?.mark("threeMfUtf8");
  // Level 3 keeps lossless geometry while avoiding expensive high-compression searches.
  const bytes = new Uint8Array(zipSync(files, { level: 3 }));
  timing?.mark("threeMfZip");
  return bytes;
}
