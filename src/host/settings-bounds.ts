interface Size {
  width: number;
  height: number;
}
interface Bounds extends Size {
  x: number;
  y: number;
}

// Content sizes at 100% interface scale. Small preference panes stay compact;
// Toolbox keeps enough working space for the expanded editable tree.
const tabs = {
  Interface: { preferred: [760, 250], min: [720, 250], max: [1000, 360] },
  "Sketch Grid": { preferred: [760, 400], min: [720, 320], max: [1100, 680] },
  View: { preferred: [760, 620], min: [720, 480], max: [1200, 900] },
  Decorators: { preferred: [760, 660], min: [720, 460], max: [1200, 1000] },
  Experimental: { preferred: [760, 300], min: [720, 240], max: [1000, 500] },
  Toolbox: { preferred: [760, 720], min: [720, 500], max: [1400, 1200] },
} as const;

/** Native outer-window limits and one preferred placement, never a resize loop. */
export function settingsTabBounds(
  tab: unknown,
  scale: unknown,
  current: Bounds,
  frame: Size,
  work: Bounds,
): { preferred: Bounds; min: Size; max: Size } {
  if (typeof tab !== "string" || !Object.hasOwn(tabs, tab)) throw new Error("Unknown Settings tab");
  if (typeof scale !== "number" || ![0.8, 0.9, 1, 1.1, 1.25, 1.5].includes(scale))
    throw new Error("Invalid Settings interface scale");
  const policy = tabs[tab as keyof typeof tabs];
  const size = ([width, height]: readonly [number, number]): Size => ({
    width: Math.min(work.width, Math.ceil(width * scale + frame.width)),
    height: Math.min(work.height, Math.ceil(height * scale + frame.height)),
  });
  const min = size(policy.min),
    max = size(policy.max),
    preferred = size(policy.preferred);
  return {
    min,
    max,
    preferred: {
      ...preferred,
      x: Math.max(work.x, Math.min(current.x, work.x + work.width - preferred.width)),
      y: Math.max(work.y, Math.min(current.y, work.y + work.height - preferred.height)),
    },
  };
}
