/** Temporary sampled diagnostics, never a thickness certificate or saved feature. */
export interface ErosionQuality {
  body: string;
  spacing: number;
  triangles: number;
  faces: number;
  samples: number;
  sampledMinThickness: number;
  sampledMaxThickness: number;
  sampledFitDeviation: number;
}
export function erosionQualityText(quality: readonly ErosionQuality[]): string {
  const measured = quality.filter((item) => item.samples > 0);
  const spacing = Math.max(...quality.map((item) => item.spacing));
  const faces = quality.reduce((sum, item) => sum + item.faces, 0);
  const format = (value: number) => Number(value.toPrecision(3));
  const mesh = `Mesh spacing ≤ ${format(spacing)} mm · ${faces} CAD faces`;
  if (!measured.length) return `${mesh} · No interior at this mesh detail`;
  const min = Math.min(...measured.map((item) => item.sampledMinThickness));
  const max = Math.max(...measured.map((item) => item.sampledMaxThickness));
  const error = Math.max(...measured.map((item) => item.sampledFitDeviation));
  return `${mesh} · Sampled thickness ${format(min)}–${format(max)} mm · Sampled fit deviation ${format(error)} mm`;
}
