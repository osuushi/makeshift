import type { DecoratorInstance } from "./types.js";

/** Distinct hues first; further rounds vary lightness and saturation. */
export function gearPaletteColor(index: number): string {
  const hue = ((index % 12) * 137.508) % 360;
  const round = Math.floor(index / 12);
  const saturation = [0.65, 0.8, 0.5][Math.floor(round / 3) % 3];
  const lightness = [0.48, 0.62, 0.36][round % 3];
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function gearColor(
  instance: DecoratorInstance,
  decorators: readonly DecoratorInstance[],
): string {
  const saved =
    instance.gearColor ??
    (instance.gearGroup &&
      decorators.find((d) => d.gearGroup === instance.gearGroup && d.gearColor)?.gearColor);
  if (saved) return saved;
  const groups = [
    ...new Set(
      decorators.filter((d) => d.definition === "freac.gear").map((d) => d.gearGroup ?? d.id),
    ),
  ];
  return gearPaletteColor(Math.max(0, groups.indexOf(instance.gearGroup ?? instance.id)));
}

export function nextGearColor(decorators: readonly DecoratorInstance[]): string {
  const gears = decorators.filter((d) => d.definition === "freac.gear");
  const used = new Set(gears.map((d) => gearColor(d, decorators)));
  let index = 0;
  while (index < 108 && used.has(gearPaletteColor(index))) index++;
  return gearPaletteColor(index % 108);
}

/** Fill legacy colors on an ordinary edit; reading a drawing does not rewrite it. */
export function withGearColors(
  decorators: readonly DecoratorInstance[],
): readonly DecoratorInstance[] {
  return decorators.map((d) =>
    d.definition === "freac.gear" && !d.gearColor
      ? { ...d, gearColor: gearColor(d, decorators) }
      : d,
  );
}
