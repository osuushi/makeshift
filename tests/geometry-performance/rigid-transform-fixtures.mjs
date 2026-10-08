import assert from "node:assert/strict";
import { square } from "./cases.mjs";
import { operand } from "./client.mjs";

export const extrude = (profile, distance = 20) => ({
  kind: "extrude",
  mode: "new",
  bodies: [],
  normal: [0, 0, 1],
  distance,
  profiles: [profile],
});
export async function prepare(client) {
  const profiles = [
    ["box", square(0, 0, 20)],
    [
      "cylinder",
      {
        outer: [
          { kind: "circle", center: [0, 0, 0], radius: 10, normal: [0, 0, 1], axis: [1, 0, 0] },
        ],
        holes: [],
      },
    ],
    [
      "cubic",
      {
        outer: [
          { kind: "line", a: [0, 0, 0], b: [40, 0, 0] },
          { kind: "line", a: [40, 0, 0], b: [40, 40, 0] },
          { kind: "bezier", a: [40, 40, 0], c1: [30, 43, 0], c2: [10, 43, 0], b: [0, 40, 0] },
          { kind: "line", a: [0, 40, 0], b: [0, 0, 0] },
        ],
        holes: [],
      },
    ],
  ];
  const stocks = [];
  for (const [name, profile] of profiles) {
    const request = extrude(profile),
      measurement = await client.request(request);
    assert.ok(!measurement.reply.error, `Construction failed: ${measurement.reply.error}`);
    assert.equal(measurement.reply.results.length, 1);
    stocks.push({
      name,
      request,
      reply: measurement.reply,
      trace: measurement.phases,
      body: operand(measurement.reply.results[0], name),
    });
  }
  return stocks;
}
export function transforms(stock) {
  const rigid = {
    kind: "transform",
    pivot: [0, 0, 0],
    axis: [0, 0, 1],
    angle: 0,
    translation: [0, 0, 0],
    duplicate: false,
  };
  const matrix = [
    ["identity", rigid],
    ["translate", { ...rigid, translation: [23, -17, 8] }],
    ["rotate-offpivot", { ...rigid, angle: 37, pivot: [5, 3, -2], axis: [1, 2, 3] }],
    ["negative-angle", { ...rigid, angle: -53, translation: [-12, 7, -3], pivot: [3, -4, 1] }],
    ["large-duplicate", { ...rigid, translation: [1e6, -1e6, 2000], duplicate: true }],
    [
      "mirror-control",
      { kind: "mirror", plane: { origin: [2, -1, 3], normal: [1, 0, 0] }, keepOriginal: true },
    ],
    ["uniform-scale-control", { kind: "scale", pivot: [3, -2, 1], factor: 2 }],
    ["affine-scale-control", { kind: "scale", pivot: [3, -2, 1], factor: 1, factors: [2, 1, 0.5] }],
  ];
  return matrix.map(([operation, input]) => ({
    name: `${stock.name}-${operation}`,
    operation,
    stock,
    input: { ...input, ids: [stock.body.id], bodies: [stock.body] },
    volumeFactor:
      input.kind === "scale"
        ? input.factors
          ? input.factors.reduce((a, b) => a * b, 1)
          : input.factor ** 3
        : 1,
    followup: ["translate", "rotate-offpivot"].includes(operation),
  }));
}
