import { motion } from "./gcode-motion.mjs";

const features = {
  "Outer wall": "External perimeter",
  "Inner wall": "Perimeter",
  "Top surface": "Top solid infill",
  "Bottom surface": "Solid infill",
  "Internal solid infill": "Solid infill",
  "Sparse infill": "Internal infill",
};

function comment(state, raw) {
  const height = raw.match(/^;\s*(?:HEIGHT|LAYER_HEIGHT):\s*([\d.]+)/);
  if (height) {
    state.height = Number(height[1]);
    state.path = null;
  }
  const width = raw.match(/^;\s*(?:WIDTH|LINE_WIDTH):\s*([\d.]+)/);
  if (width) state.width = Number(width[1]);
  const feature = raw.match(/^;\s*(?:TYPE|FEATURE):\s*(.*)/);
  if (feature) {
    state.type = features[feature[1]] ?? feature[1];
    state.path = null;
  }
  if (/^;\s*start printing object/.test(raw)) {
    state.active = true;
    state.path = null;
  }
  if (/^;\s*stop printing object/.test(raw)) {
    state.active = false;
    state.path = null;
  }
}

// Parse motion only: printer commands are never executed. Orca object markers
// exclude startup purges, calibration moves, timelapse and printer shutdown.
export function parseGcode(text, diameter = 1.75) {
  const scoped = /^;\s*start printing object/m.test(text);
  const state = {
    xyz: [0, 0, 0],
    e: 0,
    absolute: true,
    relativeE: false,
    height: 0.2,
    width: null,
    type: "",
    debt: 0,
    path: null,
    paths: [],
    active: !scoped,
    plane: "G17",
    absoluteArcCenter: false,
  };
  for (const raw of text.split(/\r?\n/)) {
    comment(state, raw);
    const code = raw.split(";")[0].trim();
    if (!code) continue;
    const command = code.split(/\s/)[0];
    const values = Object.fromEntries(
      [...code.matchAll(/([XYZEFIJKRP])(-?(?:\d+\.?\d*|\.\d+))/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
    if (state.active && (["G20", "G10", "G11"].includes(command) || /^T\d/.test(command)))
      throw new Error(`Unsupported motion/units/tool: ${command}`);
    if (command === "G90") state.absolute = true;
    if (command === "G91") state.absolute = false;
    if (command === "G90.1") state.absoluteArcCenter = true;
    if (command === "G91.1") state.absoluteArcCenter = false;
    if (["G17", "G18", "G19"].includes(command)) state.plane = command;
    if (command === "M82") state.relativeE = false;
    if (command === "M83") state.relativeE = true;
    if (command === "G92") {
      if (values.E !== undefined) state.e = values.E;
      state.xyz = state.xyz.map((v, i) => values["XYZ"[i]] ?? v);
    }
    if (["G0", "G1", "G2", "G3"].includes(command)) motion(state, values, diameter, command);
  }
  if (!state.paths.length) throw new Error("No deposited toolpaths");
  return state.paths;
}
