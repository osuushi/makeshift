import { colorTheme } from "./theme.js";

// Unlit ink is independent of document materials and user grid palettes.
export const viewportPalettes = {
  light: {
    background: "#f8f9fb",
    ink: "#283d51",
    selected: "#155c9e",
    hover: "#946000",
    inactive: "#68788b",
    constrained: "#70419e",
    x: "#a52c36",
    y: "#21653d",
    z: "#155c9e",
  },
  dark: {
    background: "#161e29",
    ink: "#e4edf7",
    selected: "#87c5ff",
    hover: "#f2c16f",
    inactive: "#9babbe",
    constrained: "#d5afff",
    x: "#ffacb5",
    y: "#8ad6a3",
    z: "#87c5ff",
  },
} as const;
export function viewportPalette() {
  return viewportPalettes[colorTheme()];
}
