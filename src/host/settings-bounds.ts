interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fit content without letting a taller tab grow below the display's work area. */
export function settingsBounds(
  current: Bounds,
  contentHeight: number,
  frameHeight: number,
  work: Bounds,
): Bounds {
  const width = Math.min(current.width, work.width);
  const height = Math.min(Math.max(240, contentHeight) + frameHeight, work.height);
  return {
    x: Math.max(work.x, Math.min(current.x, work.x + work.width - width)),
    y: Math.max(work.y, Math.min(current.y, work.y + work.height - height)),
    width,
    height,
  };
}
