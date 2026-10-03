function outlineDistance(p, points) {
  let inside = false,
    distance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
    );
    distance = Math.min(distance, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return inside ? 0 : distance;
}

// The supplied model has a 6 mm white backing and raised orange/violet silhouettes.
// Colour is render art direction; it does not claim a multi-material printer plan.
export function pathPalette(paths, baseHeight = 6) {
  const outlines = paths.filter((p) => p.z > baseHeight && p.type === "External perimeter");
  return paths.map((path) => {
    if (path.z <= baseHeight + 1e-6) return 0;
    const p = path.points[Math.floor(path.points.length / 2)];
    let nearest = null,
      best = Infinity;
    for (const outline of outlines.filter((outline) => outline.z === path.z)) {
      const distance = outlineDistance(p, outline.points);
      if (distance < best) {
        best = distance;
        nearest = outline;
      }
    }
    if (!nearest) throw new Error("Raised path has no exterior outline");
    const centerX = nearest.points.reduce((sum, p) => sum + p[0], 0) / nearest.points.length;
    // V5's detached right piece lies beyond X=13 mm and uses the orange material.
    const detachedRight = nearest.points.every(([x]) => x > 13);
    return centerX < 0 || detachedRight ? 1 : 2;
  });
}
