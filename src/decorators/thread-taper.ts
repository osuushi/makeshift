import { type ThreadSettings, threadDepth } from "./thread-settings.js";

/** Linear cone envelope: the profile is clipped to this radius, never rescaled. */
export function threadTaperRadius(
  radius: number,
  z: number,
  settings: ThreadSettings,
  outward: 1 | -1,
  bounds: [number, number],
): number {
  const fraction = Math.max(
    0,
    Math.min(
      1,
      settings.startTaper ? (z - bounds[0]) / settings.startTaper : 1,
      settings.endTaper ? (bounds[1] - z) / settings.endTaper : 1,
    ),
  );
  const depth = threadDepth(settings);
  const minimum = radius + (settings.cut === "rod" ? -depth : 0);
  return (
    minimum +
    depth * (outward > 0 ? fraction : 1 - fraction) +
    (outward < 0 ? settings.clearance : 0)
  );
}
