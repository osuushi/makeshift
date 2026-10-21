// Shared exact inputs for native and browser performance experiments.
const polygon = (points) => ({
  outer: points.map((a, i) => ({ kind: "line", a, b: points[(i + 1) % points.length] })),
  holes: [],
});
const square = polygon([
  [-10, -10, 0],
  [10, -10, 0],
  [10, 10, 0],
  [-10, 10, 0],
]);
const triangle = polygon([
  [5.9, 0, -0.5],
  [7, 0, 0],
  [5.9, 0, 0.5],
]);
const cubic = {
  outer: [
    { kind: "bezier", a: [0, 0, 0], c1: [0, 10, 0], c2: [10, 10, 0], b: [10, 0, 0] },
    { kind: "line", a: [10, 0, 0], b: [0, 0, 0] },
  ],
  holes: [],
};
const revolve = (angle, height) => ({
  kind: "revolve",
  profiles: [triangle],
  angle,
  height,
  axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  mode: "new",
  bodies: [],
});
const twist = (angle, profile = square, offset = 0) => ({
  kind: "extrude",
  profiles: [profile],
  distance: 20,
  normal: [0, 0, 1],
  twist: { angle, origin: [0, 0, 0] },
  draft: { mode: "offset", value: offset },
  mode: "new",
  bodies: [],
});
const circle = {
  outer: [{ kind: "circle", center: [0, 0, 0], radius: 10, normal: [0, 0, 1], axis: [1, 0, 0] }],
  holes: [],
};
// Four exact quarter circles with short straight joins, as from sketch fillets.
const roundedSquare = {
  outer: [
    { kind: "line", a: [-1, -10, 0], b: [1, -10, 0] },
    {
      kind: "arc",
      a: [1, -10, 0],
      mid: [1 + 9 / Math.sqrt(2), -1 - 9 / Math.sqrt(2), 0],
      b: [10, -1, 0],
    },
    { kind: "line", a: [10, -1, 0], b: [10, 1, 0] },
    {
      kind: "arc",
      a: [10, 1, 0],
      mid: [1 + 9 / Math.sqrt(2), 1 + 9 / Math.sqrt(2), 0],
      b: [1, 10, 0],
    },
    { kind: "line", a: [1, 10, 0], b: [-1, 10, 0] },
    {
      kind: "arc",
      a: [-1, 10, 0],
      mid: [-1 - 9 / Math.sqrt(2), 1 + 9 / Math.sqrt(2), 0],
      b: [-10, 1, 0],
    },
    { kind: "line", a: [-10, 1, 0], b: [-10, -1, 0] },
    {
      kind: "arc",
      a: [-10, -1, 0],
      mid: [-1 - 9 / Math.sqrt(2), -1 - 9 / Math.sqrt(2), 0],
      b: [-1, -10, 0],
    },
  ],
  holes: [],
};
const circularTwist = (profile, origin) => ({
  ...twist(90, profile),
  twist: { angle: 90, origin },
});
export const sweepCases = [
  ["circle-centered", circularTwist(circle, [0, 0, 0])],
  ["circle-offset", circularTwist(circle, [5, 0, 0])],
  ["rounded-square-offset", circularTwist(roundedSquare, [5, 0, 0])],
  ["revolve-360", revolve(360, 0)],
  ["helix-2", revolve(720, 2)],
  ["helix-18", revolve(6480, 18)],
  ["twist-90", twist(90)],
  ["twist-450", twist(450)],
  ["twist-draft", twist(90, square, 2)],
  ["twist-cubic", twist(90, cubic)],
  ["twist-cubic-draft", twist(90, cubic, 0.5)],
];

export { revolve };
