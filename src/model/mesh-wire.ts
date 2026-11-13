import type { MeshNode, MeshPlan } from "../decorators/mesh-plan.js";
import type { Vector } from "../sketch/planes.js";
import { type ExportMesh, validateMesh } from "./export-mesh.js";
import type { ExportTiming } from "./export-timing.js";
import { packedMesh } from "./packed-mesh.js";

const magic = 0x46524d31;
const replyMagic = 0x46524d32;
export const meshWireLimit = 512 * 1024 * 1024;
const opcodes = { mesh: 0, add: 1, subtract: 2, intersect: 3, trim: 4, cylinder: 5, transform: 6 };
function nodeBytes(node: MeshNode): number {
  switch (node.kind) {
    case "mesh":
      return 12 + 12 * (node.mesh.vertices.length + node.mesh.triangles.length);
    case "add":
    case "subtract":
    case "intersect":
      return 12;
    case "trim":
      return 40;
    case "cylinder":
      return 24;
    case "transform":
      return 136;
  }
}

/** Little-endian packed mesh buffers avoid JSON number expansion across the host boundary. */
export function encodeMeshPlan(plan: MeshPlan, result: number, precision: number): ArrayBuffer {
  const size = 20 + plan.nodes.reduce((sum, node) => sum + nodeBytes(node), 0);
  if (size > meshWireLimit) throw new Error("Decorated export exceeds the native transfer budget");
  const buffer = new ArrayBuffer(size),
    view = new DataView(buffer);
  let offset = 0;
  const u32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const f64 = (value: number) => {
    view.setFloat64(offset, value, true);
    offset += 8;
  };
  u32(magic);
  u32(plan.nodes.length);
  u32(result);
  f64(precision);
  for (const node of plan.nodes) {
    u32(opcodes[node.kind]);
    switch (node.kind) {
      case "mesh":
        u32(node.mesh.vertices.length);
        u32(node.mesh.triangles.length);
        for (const point of node.mesh.vertices)
          for (let i = 0; i < 3; i++) {
            view.setFloat32(offset, point[i] - plan.origin[i], true);
            offset += 4;
          }
        for (const triangle of node.mesh.triangles) for (const index of triangle) u32(index);
        break;
      case "add":
      case "subtract":
      case "intersect":
        u32(node.a);
        u32(node.b);
        break;
      case "trim":
        u32(node.a);
        node.normal.forEach(f64);
        f64(node.offset);
        break;
      case "cylinder":
        f64(node.height);
        f64(node.radius);
        u32(node.segments);
        break;
      case "transform":
        u32(node.a);
        node.matrix.forEach(f64);
        break;
    }
  }
  return buffer;
}

export function decodeNativeMesh(
  buffer: ArrayBuffer,
  origin: Vector,
  precision: number,
  timing?: ExportTiming,
): ExportMesh {
  if (buffer.byteLength < 20 || buffer.byteLength > meshWireLimit)
    throw new Error("Invalid native export reply");
  const view = new DataView(buffer);
  const vertices = view.getUint32(4, true),
    triangles = view.getUint32(8, true);
  const rounding = view.getFloat64(12, true);
  if (
    view.getUint32(0, true) !== replyMagic ||
    buffer.byteLength !== 20 + 24 * vertices + 12 * triangles
  )
    throw new Error("Invalid native export reply");
  if (!Number.isFinite(rounding) || rounding < 0 || rounding > precision)
    throw new Error("This body's extent exceeds the thread mesh precision budget");
  const mesh: ExportMesh = { vertices: [], triangles: [] };
  let offset = 20;
  for (let i = 0; i < vertices; i++) {
    const point = [0, 1, 2].map((axis) => view.getFloat64(offset + 8 * axis, true) + origin[axis]);
    if (!point.every(Number.isFinite)) throw new Error("Invalid native mesh coordinates");
    mesh.vertices.push(point);
    offset += 24;
  }
  for (let i = 0; i < triangles; i++) {
    const triangle = [0, 1, 2].map((axis) => view.getUint32(offset + 4 * axis, true));
    if (triangle.some((index) => index >= vertices)) throw new Error("Invalid native mesh index");
    mesh.triangles.push(triangle);
    offset += 12;
  }
  timing?.mark("wireDecode");
  const packed = packedMesh(mesh, rounding);
  timing?.mark("meshPacking");
  validateMesh(packed);
  timing?.mark("meshValidation");
  return { ...packed, precision };
}
