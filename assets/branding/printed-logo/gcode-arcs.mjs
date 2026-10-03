// XY center-format arcs. I/J are offsets from the starting point (G91.1).
// Independently authored from documented G2/G3 semantics; no upstream code copied.
export function arcMove(start, end, values, clockwise, tolerance = 0.005) {
  if (values.R !== undefined || (values.I === undefined && values.J === undefined))
    throw new Error("Expected an XY arc with I/J center offsets");
  if (Math.abs(start[2] - end[2]) > 1e-8)
    throw new Error("Non-planar deposited arcs are unsupported");
  const center = [start[0] + (values.I ?? 0), start[1] + (values.J ?? 0)];
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const endRadius = Math.hypot(end[0] - center[0], end[1] - center[1]);
  if (!radius || Math.abs(radius - endRadius) > 0.02)
    throw new Error("Arc endpoints disagree with the declared center");
  const from = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const to = Math.atan2(end[1] - center[1], end[0] - center[0]);
  const sign = clockwise ? -1 : 1;
  let sweep = sign * (to - from);
  while (sweep <= 1e-12) sweep += 2 * Math.PI;
  const turns = values.P ?? 1;
  if (!Number.isInteger(turns) || turns < 1) throw new Error("Invalid arc turns");
  sweep += (turns - 1) * 2 * Math.PI;
  const step = Math.min(Math.PI / 36, 2 * Math.acos(Math.max(-1, 1 - tolerance / radius)));
  const count = Math.max(1, Math.ceil(sweep / step));
  const points = Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / count;
    const angle = from + sign * sweep * t;
    // Rounded G-code endpoints can differ slightly in radius; retain both endpoints.
    const r = radius + (endRadius - radius) * t;
    return [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle), end[2]];
  });
  points[count - 1] = [...end];
  return { points, length: (sweep * (radius + endRadius)) / 2 };
}
