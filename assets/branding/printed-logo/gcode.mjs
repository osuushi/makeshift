function motion(state, values, diameter) {
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
  const length = Math.hypot(next[0] - state.xyz[0], next[1] - state.xyz[1]);
  if (deposited > 0 && length > 1e-6) {
    if (next[2] !== state.xyz[2]) throw new Error("Non-planar extrusion is unsupported");
    const area = (deposited * Math.PI * (diameter / 2) ** 2) / length;
    // Stadium section: A = h(w-h) + pi h²/4.
    const width = area / state.height + state.height * (1 - Math.PI / 4);
    if (!(state.height > 0 && width >= state.height && width < 3))
      throw new Error(`Invalid bead dimensions: ${width} × ${state.height}`);
    if (!state.path) {
      state.path = {
        z: next[2],
        height: state.height,
        type: state.type,
        points: [[...state.xyz]],
        widths: [],
      };
      state.paths.push(state.path);
    }
    state.path.points.push([...next]);
    state.path.widths.push(width);
  } else if (length > 0 || deltaE < 0 || next[2] !== state.xyz[2]) state.path = null;
  state.xyz = next;
}

// Reconstruct deposited volume, ignoring travel and repayment of retraction.
export function parseGcode(text, diameter = 1.75) {
  const state = {
    xyz: [0, 0, 0],
    e: 0,
    absolute: true,
    relativeE: false,
    height: 0.2,
    type: "",
    debt: 0,
    path: null,
    paths: [],
  };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith(";HEIGHT:")) state.height = Number(raw.slice(8));
    if (raw.startsWith(";TYPE:")) {
      state.type = raw.slice(6);
      state.path = null;
    }
    const code = raw.split(";")[0].trim();
    if (!code) continue;
    const command = code.split(/\s/)[0];
    const values = Object.fromEntries(
      [...code.matchAll(/([XYZEF])(-?(?:\d+\.?\d*|\.\d+))/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
    if (["G20", "G2", "G3", "G10", "G11"].includes(command) || /^T\d/.test(command))
      throw new Error(`Unsupported motion/units/tool: ${command}`);
    if (command === "G90") state.absolute = true;
    if (command === "G91") state.absolute = false;
    if (command === "M82") state.relativeE = false;
    if (command === "M83") state.relativeE = true;
    if (command === "G92") {
      if (values.E !== undefined) state.e = values.E;
      state.xyz = state.xyz.map((v, i) => values["XYZ"[i]] ?? v);
    }
    if (command === "G0" || command === "G1") motion(state, values, diameter);
  }
  if (!state.paths.length) throw new Error("No deposited toolpaths");
  return state.paths;
}
