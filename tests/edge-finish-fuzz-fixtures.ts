import assert from "node:assert/strict";
import { kernelInput } from "../src/backend/kernel-input.js";
import { type KernelResult, materialize } from "../src/backend/kernel-result.js";
import { NativeCalculator } from "../src/backend/native-calculator.js";
import type { Body } from "../src/model/body.js";
import { exactBodies } from "../src/model/exact-body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

type Mode = "fillet" | "chamfer";
export interface FinishCase {
  hole: number;
  offset: number;
  angle: number;
  mouth: number;
  mouthMode: Mode;
  size: number;
  mode: Mode;
}
export const reportedFinish: FinishCase = {
  hole: 4,
  offset: 30,
  angle: -Math.PI / 2,
  mouth: 5.999,
  mouthMode: "fillet",
  size: 8.5,
  mode: "fillet",
};

export function finishCases(seed: number, count: number): FinishCase[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const cases = [reportedFinish];
  for (let i = 1; i < count; i++) {
    const hole = 1 + 7 * random(),
      mouth = 0.5 + 6 * random();
    const gap = [0.001, 0.01, 0.5, 3][i % 4];
    cases.push({
      hole,
      mouth,
      offset: 40 - hole - mouth - gap,
      angle: i % 3 ? 2 * Math.PI * random() : ((i % 4) * Math.PI) / 2,
      mouthMode: i % 4 < 2 ? "fillet" : "chamfer",
      size: 1 + 17 * random(),
      mode: i % 2 ? "fillet" : "chamfer",
    });
  }
  return cases;
}

function overlap(a: number, b: number, d: number) {
  if (d + b <= a) return Math.PI * b * b;
  if (d + a <= b) return Math.PI * a * a;
  if (d >= a + b) return 0;
  const acos = (x: number) => Math.acos(Math.max(-1, Math.min(1, x)));
  return (
    a * a * acos((d * d + a * a - b * b) / (2 * d * a)) +
    b * b * acos((d * d + b * b - a * a) / (2 * d * b)) -
    0.5 * Math.sqrt(Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)))
  );
}
export function finishVolume(c: FinishCase) {
  const area = (z: number) => {
    const t = Math.max(0, z - (24 - c.size));
    const outer =
      c.mode === "chamfer" ? 40 - t : 40 - c.size + Math.sqrt(Math.max(0, c.size * c.size - t * t));
    const m = Math.max(0, z - (24 - c.mouth));
    const hole =
      c.mouthMode === "chamfer"
        ? c.hole + m
        : c.hole + c.mouth - Math.sqrt(Math.max(0, c.mouth * c.mouth - m * m));
    return Math.PI * outer * outer - overlap(outer, hole, c.offset);
  };
  // Integrate each support interval independently, avoiding a grid-dependent
  // error at the two analytic surface transitions.
  const breaks = [...new Set([0, 24 - c.size, 24 - c.mouth, 24])].sort((a, b) => a - b);
  let volume = 0;
  for (let b = 1; b < breaks.length; b++) {
    const n = 12000,
      h = (breaks[b] - breaks[b - 1]) / n;
    let sum = area(breaks[b - 1]) + area(breaks[b]);
    for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * area(breaks[b - 1] + h * i);
    volume += (sum * h) / 3;
  }
  return volume;
}

export class FinishProbe {
  private kernel = new NativeCalculator<Record<string, unknown>, KernelResult>(
    ".build/kernel/bin/makeshift-kernel",
    "Finish fuzz case",
    5000,
  );
  async stock(c: FinishCase) {
    const sketch = {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "rim",
          kind: "circle" as const,
          center: { x: 0, y: 0 },
          radius: 40,
          construction: false,
        },
        {
          id: "hole",
          kind: "circle" as const,
          center: { x: c.offset * Math.cos(c.angle), y: c.offset * Math.sin(c.angle) },
          radius: c.hole,
          construction: false,
        },
      ],
    };
    const document = { units: "mm" as const, sketches: [sketch] };
    const profile = profilesFor(sketch).find((p) => p.holes.length === 1);
    assert.ok(profile);
    const result = await this.kernel.calculate(
      kernelInput(
        document,
        {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance: 24,
          mode: "new",
        },
        [],
      ),
    );
    return materialize([], result)[0];
  }
  async finish(body: Body, edgeRadius: number, size: number, mode: Mode) {
    const edges = body.edges.filter(
      (e) =>
        e.curve?.kind === "circle" &&
        Math.abs(e.curve.radius - edgeRadius) < 1e-6 &&
        Math.abs(e.curve.center[2] - 24) < 1e-6,
    );
    assert.equal(edges.length, 1);
    const result = await this.kernel.calculate({
      kind: "edge-finish",
      bodies: exactBodies([body]),
      edges: [{ body: body.id, edge: edges[0].id }],
      size,
      mode,
    });
    return materialize([body], result)[0];
  }
  async resize(body: Body, from: number, to: number, mode: Mode) {
    const face = body.faces.find((f) =>
      mode === "fillet"
        ? Math.abs((f.blend?.radius ?? 0) - from) < 1e-6
        : Math.abs((f.chamfer?.distance ?? 0) - from) < 1e-6,
    );
    assert.ok(face, "Finish remains recognizable for resizing");
    const result = await this.kernel.calculate({
      kind: "offset-faces",
      bodies: exactBodies([body]),
      faces: [{ body: body.id, face: face.id }],
      radius: to,
      distance: 0,
      chamfer: mode === "chamfer",
    });
    return materialize([body], result)[0];
  }
  async run(c: FinishCase) {
    const stock = await this.stock(c);
    const mouth = await this.finish(stock, c.hole, c.mouth, c.mouthMode);
    const body = await this.finish(mouth, 40, c.size, c.mode);
    return { stock, mouth, body };
  }
  async close() {
    await this.kernel.cancel();
    this.kernel.close();
  }
}
