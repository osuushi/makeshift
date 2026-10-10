/** Circular viewport-space ramp: clear central eighth, full strength at the nearest edge. */
export function gridFillGradient(x: number, y: number, width: number, height: number): number {
  const radius = Math.hypot(x - width / 2, y - height / 2) / (Math.min(width, height) / 2);
  const t = Math.min(1, Math.max(0, (radius - 0.125) / 0.875));
  return t * t * (3 - 2 * t);
}

export const gridFillGradientFragment = `
  uniform vec2 gridViewport;
  float gridFillGradient() {
    float radius = length(gl_FragCoord.xy - gridViewport * 0.5) /
      (min(gridViewport.x, gridViewport.y) * 0.5);
    return smoothstep(0.125, 1.0, radius);
  }`;
