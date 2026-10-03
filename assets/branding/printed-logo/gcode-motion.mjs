import { arcMove } from "./gcode-arcs.mjs";

function addDeposit(state, points, width, volumeWidth) {
  if (!state.path) {
    state.path = {
      z: points.at(-1)[2],
      height: state.height,
      type: state.type,
      points: [[...state.xyz]],
      widths: [],
      volumeWidths: [],
    };
    state.paths.push(state.path);
  }
  for (const point of points) {
    state.path.points.push(point);
    state.path.widths.push(width);
    state.path.volumeWidths.push(volumeWidth);
  }
}

export function motion(state, values, diameter, command) {
  const next = state.xyz.map((v, i) =>
    values["XYZ"[i]] === undefined ? v : state.absolute ? values["XYZ"[i]] : v + values["XYZ"[i]],
  );
  const deltaE = values.E === undefined ? 0 : state.relativeE ? values.E : values.E - state.e;
  if (values.E !== undefined) state.e = state.relativeE ? state.e + values.E : values.E;
  let deposited = Math.max(0, deltaE);
  if (deltaE < 0) state.debt -= deltaE;
  else {
    const repaid = Math.min(state.debt, deposited);
    state.debt -= repaid;
    deposited -= repaid;
  }
  const isArc = command === "G2" || command === "G3";
  const active = state.active && state.type !== "Custom";
  let move = { points: [next], length: Math.hypot(next[0] - state.xyz[0], next[1] - state.xyz[1]) };
  if (active && deposited > 0 && isArc) {
    if (state.plane !== "G17" || state.absoluteArcCenter)
      throw new Error("Only XY arcs with relative centers are supported");
    move = arcMove(state.xyz, next, values, command === "G2");
  }
  if (active && deposited > 0 && move.length > 1e-6) {
    if (next[2] !== state.xyz[2]) throw new Error("Non-planar extrusion is unsupported");
    const area = (deposited * Math.PI * (diameter / 2) ** 2) / move.length;
    const volumeWidth = area / state.height + state.height * (1 - Math.PI / 4);
    const width = state.width ?? volumeWidth;
    if (!(state.height > 0 && width >= state.height && width < 3))
      throw new Error(`Invalid bead dimensions: ${width} × ${state.height}`);
    addDeposit(state, move.points, width, volumeWidth);
  } else if (move.length > 0 || isArc || deltaE < 0 || next[2] !== state.xyz[2]) state.path = null;
  state.xyz = next;
}
