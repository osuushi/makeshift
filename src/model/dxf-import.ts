import { type Curve, emptySketch, newId, type Sketch } from "../sketch/document.js";
import { type Point, planes } from "../sketch/planes.js";

export type DxfPair = readonly [number, string];
export const dxfLimit = 25 * 1024 * 1024;
const scales = [
  1,
  25.4,
  304.8,
  1609344,
  1,
  10,
  1000,
  1e6,
  0.0000254,
  0.0254,
  914.4,
  1e-7,
  1e-6,
  0.001,
  100,
  1e4,
  1e5,
  1e12,
  1.495978707e14,
  9.4607304725808e18,
  3.085677581491367e19,
  1200000 / 3937,
  100000 / 3937,
  3600000 / 3937,
  6336000000 / 3937,
];

export function dxfNumber(pairs: readonly DxfPair[], code: number, fallback?: number): number {
  const raw = pairs.find(([key]) => key === code)?.[1];
  const value = raw === undefined ? fallback : raw.trim() ? Number(raw) : NaN;
  if (value === undefined || !Number.isFinite(value))
    throw new Error(`Invalid DXF value (${code})`);
  return value;
}

/** ASCII exchange subset; unsupported geometry fails before any document mutation. */
export function readDxf(text: string): { sketch: Sketch; unitless: boolean; skipped: number } {
  if (!text.length || text.length > dxfLimit || text.includes("\0"))
    throw new Error("Choose an ASCII DXF file smaller than 25 MB");
  const lines = text
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r\n|\n|\r/);
  if (lines.length % 2) throw new Error("Truncated DXF group pair");
  const pairs: DxfPair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) throw new Error("Invalid DXF group code");
    if (Number(lines[i]) !== 999) pairs.push([Number(lines[i]), lines[i + 1].trim()]);
  }
  let section = "",
    units = 0,
    ended = false,
    entities = false;
  const records: DxfPair[][] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 0 && value === "SECTION") {
      if (section || pairs[i + 1]?.[0] !== 2) throw new Error("Invalid DXF section");
      section = pairs[++i][1];
      if (section === "ENTITIES") entities = true;
    } else if (code === 0 && value === "ENDSEC") section = "";
    else if (code === 0 && value === "EOF") {
      ended = !section;
      break;
    } else if (section === "HEADER" && code === 9 && value === "$INSUNITS") {
      units = dxfNumber(pairs.slice(i + 1, i + 2), 70);
      i++;
    } else if (section === "ENTITIES") {
      if (code === 0) records.push([]);
      const record = records.at(-1);
      if (!record) throw new Error("Invalid DXF entity");
      record.push(pairs[i]);
    }
  }
  if (!ended || !entities) throw new Error("DXF needs a complete ENTITIES section and EOF");
  const scale = scales[units];
  if (scale === undefined) throw new Error("Unsupported DXF drawing units");
  return { ...readEntities(records, scale), unitless: units === 0 };
}

function readEntities(records: DxfPair[][], scale: number): { sketch: Sketch; skipped: number } {
  let skipped = 0;
  const curves: Curve[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i],
      kind = record[0][1];
    if (["TEXT", "MTEXT", "DIMENSION", "POINT"].includes(kind)) {
      skipped++;
      continue;
    }
    planar(record);
    if (kind === "POLYLINE") {
      if (dxfNumber(record, 70, 0) & ~129)
        throw new Error("Only ordinary 2D DXF polylines are supported");
      const vertices: DxfPair[][] = [];
      while (records[i + 1]?.[0][1] === "VERTEX") {
        const vertex = records[++i];
        planar(vertex);
        if (dxfNumber(vertex, 70, 0)) throw new Error("Fitted and 3D DXF vertices are unsupported");
        vertices.push(vertex);
      }
      if (records[++i]?.[0][1] !== "SEQEND") throw new Error("Unterminated DXF polyline");
      curves.push(...polyline(record, vertices, scale));
    } else curves.push(...entity(kind, record, scale));
    if (curves.length > 10000) throw new Error("DXF exceeds the 10,000 curve limit");
  }
  if (!curves.length) throw new Error("DXF contains no supported sketch curves");
  return { sketch: { ...emptySketch(planes.XY), curves }, skipped };
}

function planar(record: DxfPair[]): void {
  for (const code of [30, 31, 38, 39, 210, 220])
    if (dxfNumber(record, code, 0) !== 0)
      throw new Error("DXF sketch geometry must lie in XY with no thickness");
  if (dxfNumber(record, 230, 1) !== 1) throw new Error("Unsupported DXF extrusion direction");
  if (dxfNumber(record, 67, 0)) throw new Error("Import model-space DXF geometry only");
}
function point(record: DxfPair[], scale: number, code = 10): Point {
  return { x: dxfNumber(record, code) * scale, y: dxfNumber(record, code + 10) * scale };
}
function edge(a: Point, b: Point, bulge = 0): Curve {
  if (
    ![a.x, a.y, b.x, b.y, bulge].every(Number.isFinite) ||
    Math.hypot(b.x - a.x, b.y - a.y) < 1e-8
  )
    throw new Error("DXF contains a degenerate or invalid curve");
  const base = { id: newId(), a, b, construction: false };
  return bulge ? { ...base, kind: "arc", bulge } : { ...base, kind: "segment" };
}
function polyline(record: DxfPair[], vertices: DxfPair[][], scale: number): Curve[] {
  if (vertices.length < 2) throw new Error("DXF polyline needs at least two vertices");
  if (vertices.length > 10000) throw new Error("DXF exceeds the 10,000 curve limit");
  const closed = !!(dxfNumber(record, 70, 0) & 1);
  return vertices
    .slice(0, closed ? vertices.length : -1)
    .map((vertex, i) =>
      edge(
        point(vertex, scale),
        point(vertices[(i + 1) % vertices.length], scale),
        dxfNumber(vertex, 42, 0),
      ),
    );
}
function entity(kind: string, record: DxfPair[], scale: number): Curve[] {
  if (kind === "LINE") return [edge(point(record, scale), point(record, scale, 11))];
  if (kind === "LWPOLYLINE") {
    const vertices: DxfPair[][] = [];
    for (const pair of record) {
      if (pair[0] === 10) vertices.push([]);
      vertices.at(-1)?.push(pair);
    }
    if (dxfNumber(record, 90) !== vertices.length) throw new Error("Incorrect DXF vertex count");
    return polyline(record, vertices, scale);
  }
  if (kind !== "CIRCLE" && kind !== "ARC")
    throw new Error(
      `Unsupported DXF entity: ${kind}. Explode blocks and convert splines to polylines before importing.`,
    );
  const center = point(record, scale),
    radius = dxfNumber(record, 40) * scale;
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Invalid DXF radius");
  if (kind === "CIRCLE")
    return [{ id: newId(), kind: "circle", center, radius, construction: false }];
  const start = dxfNumber(record, 50),
    end = dxfNumber(record, 51);
  const sweep = (((end - start) % 360) + 360) % 360;
  if (!sweep) throw new Error("DXF arc has zero sweep");
  const at = (angle: number) => ({
    x: center.x + radius * Math.cos((angle * Math.PI) / 180),
    y: center.y + radius * Math.sin((angle * Math.PI) / 180),
  });
  return [edge(at(start), at(end), Math.tan((sweep * Math.PI) / 720))];
}
