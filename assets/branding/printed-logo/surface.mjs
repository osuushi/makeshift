import { pathPalette } from "./palette.mjs";

const ringSize = 32;

function section(width, height, crownRatio) {
  // Artistic thin strands can be narrower than a layer. An ellipse keeps their
  // section convex; the usual rounded rectangle would fold inside out.
  if (width < height)
    return Array.from({ length: ringSize }, (_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ringSize;
      return [(width / 2) * Math.cos(angle), (height / 2) * Math.sin(angle)];
    });
  const radius = height / 2,
    flat = (width - height) / 2,
    crown = height * crownRatio,
    ring = [];
  for (const side of [1, -1]) {
    for (let i = 0; i <= 8; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 8 + (side === -1 ? Math.PI : 0);
      ring.push([side * flat + radius * Math.cos(angle), (radius - crown) * Math.sin(angle)]);
    }
    // Crowned deposited surfaces avoid overlapping coplanar roofs
    // at joins. Width uses slicer metadata or volume; footprint is a render approximation.
    for (let i = 1; i < 8; i++) {
      const t = 1 - i / 4;
      ring.push([side * flat * t, side * (radius - crown * t * t)]);
    }
  }
  return ring;
}

function appendCaps(mesh, path, offset, material, crownRatio) {
  const { vertices, faces, materials } = mesh;
  for (const end of [0, path.points.length - 1]) {
    const p = path.points[end],
      neighbor = path.points[end === 0 ? 1 : end - 1];
    const angle = Math.atan2(p[1] - neighbor[1], p[0] - neighbor[0]);
    const start = offset + end * ringSize,
      cap = vertices.length;
    const width = path.widths[Math.min(end, path.widths.length - 1)];
    const direction = end === 0 ? -1 : 1;
    // Rounded endpoint footprint approximates deposition, without pressure/thermal physics.
    for (const [lateral, vertical] of section(width, path.height, crownRatio)) {
      const step = (width * Math.SQRT1_2) / 2;
      vertices.push([
        p[0] + Math.cos(angle) * step - direction * Math.sin(angle) * lateral * Math.SQRT1_2,
        p[1] + Math.sin(angle) * step + direction * Math.cos(angle) * lateral * Math.SQRT1_2,
        p[2] - path.height / 2 + vertical * Math.SQRT1_2,
      ]);
    }
    const tip = vertices.length;
    vertices.push([
      p[0] + (Math.cos(angle) * width) / 2,
      p[1] + (Math.sin(angle) * width) / 2,
      p[2] - path.height / 2,
    ]);
    for (let j = 0; j < ringSize; j++) {
      const k = (j + 1) % ringSize;
      const quad = [start + j, start + k, cap + k, cap + j];
      const triangle = [cap + j, cap + k, tip];
      faces.push(
        end === 0 ? quad.toReversed() : quad,
        end === 0 ? triangle.toReversed() : triangle,
      );
      materials.push(material, material);
    }
  }
}

function sweep(mesh, path, material, crownRatio) {
  const { vertices, faces, materials } = mesh,
    offset = vertices.length;
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i],
      prev = path.points[Math.max(0, i - 1)];
    const next = path.points[Math.min(path.points.length - 1, i + 1)];
    const before = Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    const after = Math.atan2(next[1] - p[1], next[0] - p[0]);
    const angle =
      i === 0
        ? after
        : i === path.points.length - 1
          ? before
          : Math.atan2(Math.sin(before) + Math.sin(after), Math.cos(before) + Math.cos(after));
    const miter = i === 0 || i === path.points.length - 1 ? 1 : 1 / Math.cos(angle - before);
    const width = path.widths[Math.min(i, path.widths.length - 1)];
    for (const [lateral, vertical] of section(width, path.height, crownRatio))
      vertices.push([
        p[0] - Math.sin(angle) * lateral * miter,
        p[1] + Math.cos(angle) * lateral * miter,
        p[2] - path.height / 2 + vertical,
      ]);
  }
  for (let i = 0; i < path.points.length - 1; i++) {
    for (let j = 0; j < ringSize; j++) {
      const a = offset + i * ringSize + j,
        b = offset + i * ringSize + ((j + 1) % ringSize);
      faces.push([a, b, b + ringSize, a + ringSize]);
      materials.push(material);
    }
  }
  appendCaps(mesh, path, offset, material, crownRatio);
}

// Split acute turns before sweeping: overlapping rounded deposits avoid folded miters.
function smoothPieces(path) {
  const pieces = [];
  let start = 0;
  for (let i = 1; i < path.points.length - 1; i++) {
    const a = path.points[i - 1],
      b = path.points[i],
      c = path.points[i + 1];
    const u = [b[0] - a[0], b[1] - a[1]],
      v = [c[0] - b[0], c[1] - b[1]];
    const cosine = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    if (cosine >= Math.SQRT1_2) continue;
    pieces.push({
      ...path,
      points: path.points.slice(start, i + 1),
      widths: path.widths.slice(start, i),
    });
    start = i;
  }
  pieces.push({ ...path, points: path.points.slice(start), widths: path.widths.slice(start) });
  return pieces;
}

export function beadMesh(paths, baseHeight = 6, crownRatio = 0.04) {
  if (!(crownRatio >= 0 && crownRatio < 0.5)) throw new Error("Invalid bead crown ratio");
  const mesh = { vertices: [], faces: [], materials: [] };
  const palette = pathPalette(paths, baseHeight);
  for (const [i, path] of paths.entries())
    for (const piece of smoothPieces(path)) sweep(mesh, piece, palette[i], crownRatio);
  return mesh;
}
