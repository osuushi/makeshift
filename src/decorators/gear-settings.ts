import type { DecoratorDefinition } from "./definition.js";
import { definitionSettings } from "./definition.js";
import type { Settings } from "./types.js";

export const gearDefinition = "freac.gear";
export const gearManifest: DecoratorDefinition = {
  id: gearDefinition,
  version: 1,
  name: "Gear",
  source: "",
  preview: true,
  dependencies: { continuation: "faces", preview: "adjacent-faces" },
  fields: [
    {
      key: "diameterTolerance",
      label: "Pitch diameter tolerance",
      type: "number",
      unit: "mm",
      default: 0.2,
      min: 0,
      max: 10,
    },
    {
      key: "minimumTooth",
      label: "Minimum printable width",
      type: "number",
      unit: "mm",
      default: 0.4,
      min: 0.05,
      max: 10,
    },
    {
      key: "module",
      label: "Rack normal module",
      type: "number",
      unit: "mm",
      default: 1,
      min: 0.05,
      max: 100,
    },
    {
      key: "direction",
      label: "Rack travel direction",
      type: "number",
      unit: "°",
      default: 0,
      min: -360,
      max: 360,
    },
    {
      key: "rackPhase",
      label: "Rack phase",
      type: "number",
      unit: "mm",
      default: 0,
      min: -10000,
      max: 10000,
    },
    { key: "addendum", label: "Fitted tooth depth", type: "number", default: 1, min: 0.6, max: 1 },
    {
      key: "rootClearance",
      label: "Tooth root clearance",
      type: "number",
      unit: "mm",
      default: -1,
      min: -1,
      max: 10,
    },
    { key: "teeth", label: "Teeth per revolution", type: "number", default: 40, min: 6, max: 400 },
    {
      key: "pressure",
      label: "Normal pressure angle",
      type: "number",
      unit: "°",
      default: 20,
      min: 14.5,
      max: 35,
    },
    { key: "helix", label: "Helix angle", type: "number", unit: "°", default: 0, min: 0, max: 45 },
    {
      key: "hand",
      label: "Handedness",
      type: "enum",
      default: "right",
      options: [
        { value: "right", label: "Right" },
        { value: "left", label: "Left" },
      ],
    },
    {
      key: "phase",
      label: "Tooth phase",
      type: "number",
      unit: "°",
      default: 0,
      min: -360,
      max: 360,
    },
    {
      key: "thinning",
      label: "Normal tooth thinning",
      type: "number",
      unit: "mm",
      default: 0,
      min: 0,
      max: 10,
    },
    {
      key: "clearance",
      label: "Root clearance",
      type: "number",
      unit: "module",
      default: 0.25,
      min: 0.05,
      max: 1,
    },
    {
      key: "shift",
      label: "Profile shift",
      type: "number",
      unit: "module",
      default: 0,
      min: -0.5,
      max: 0.5,
    },
  ],
};

export interface GearSettings extends Settings {
  addendum: number;
  rootClearance: number;
  teeth: number;
  pressure: number;
  helix: number;
  hand: string;
  phase: number;
  thinning: number;
  clearance: number;
  shift: number;
  module: number;
  direction: number;
  rackPhase: number;
  diameterTolerance: number;
  minimumTooth: number;
}
export const radians = (degrees: number) => (degrees * Math.PI) / 180;
export const involute = (angle: number) => Math.tan(angle) - angle;

export function gearSettings(input: Settings): GearSettings {
  const settings = definitionSettings(gearManifest, input) as GearSettings;
  if (settings.rootClearance < 0 && settings.rootClearance !== -1)
    throw new Error("Tooth root clearance must be nonnegative");
  if (!Number.isInteger(settings.teeth)) throw new Error("Gear tooth count must be an integer");
  return settings;
}

/** Normal-system dimensions; reference surface and integer count remain authoritative. */
export function gearDimensions(radius: number, settings: GearSettings, outward: 1 | -1) {
  const beta = radians(settings.helix),
    alpha = radians(settings.pressure);
  const transverseModule = (2 * radius) / settings.teeth;
  const normalModule = transverseModule * Math.cos(beta);
  const transversePressure = Math.atan(Math.tan(alpha) / Math.cos(beta));
  const baseRadius = radius * Math.cos(transversePressure);
  const tipRadius =
    radius + outward * normalModule * (settings.addendum + outward * settings.shift);
  const rootRadius =
    radius -
    outward *
      (normalModule * (settings.addendum - outward * settings.shift) +
        (settings.rootClearance >= 0 ? settings.rootClearance : normalModule * settings.clearance));
  const halfWidth =
    Math.PI / (2 * settings.teeth) +
    (2 * settings.shift * Math.tan(alpha)) / settings.teeth -
    (outward * settings.thinning) / (2 * radius * Math.cos(beta));
  return {
    pitchRadius: radius,
    normalModule,
    transverseModule,
    transversePressure,
    baseRadius,
    tipRadius,
    rootRadius,
    halfWidth,
    lead: settings.helix ? (2 * Math.PI * radius) / Math.tan(beta) : null,
  };
}

export function gearRadiusForModule(module: number, teeth: number, helix = 0): number {
  if (
    !Number.isFinite(module) ||
    module <= 0 ||
    !Number.isInteger(teeth) ||
    teeth < 6 ||
    !Number.isFinite(helix) ||
    Math.abs(helix) > 45
  )
    throw new Error("Invalid gear dimensions");
  return (module * teeth) / (2 * Math.cos(radians(helix)));
}
