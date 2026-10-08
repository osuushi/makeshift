import { readFile } from "node:fs/promises";
import { operand } from "./client.mjs";

export const square = (x, y, size, z = 0) => ({
  outer: [
    [x, y, z],
    [x + size, y, z],
    [x + size, y + size, z],
    [x, y + size, z],
  ].map((a, i, points) => ({ kind: "line", a, b: points[(i + 1) % 4] })),
  holes: [],
});
const circle = (x, y, radius) => ({
  kind: "circle",
  center: [x, y, 0],
  radius,
  normal: [0, 0, 1],
  axis: [1, 0, 0],
});
const extrude = (profile, distance = 20) => ({
  kind: "extrude",
  normal: [0, 0, 1],
  profiles: [profile],
  distance,
  mode: "new",
  bodies: [],
});

async function cubicOperand(client) {
  const cubicProfile = {
    outer: [
      { kind: "line", a: [0, 0, 0], b: [40, 0, 0] },
      { kind: "line", a: [40, 0, 0], b: [40, 40, 0] },
      { kind: "bezier", a: [40, 40, 0], c1: [30, 43, 0], c2: [10, 43, 0], b: [0, 40, 0] },
      { kind: "line", a: [0, 40, 0], b: [0, 0, 0] },
    ],
    holes: [],
  };
  const cubicReply = (await client.request(extrude(cubicProfile, 20))).reply;
  if (cubicReply.error) throw new Error(cubicReply.error);
  return operand(cubicReply.results[0], "cubic-stock");
}

export async function cases(client) {
  const profile = square(0, 0, 60);
  for (let x = 10; x <= 50; x += 10)
    for (let y = 10; y <= 50; y += 10) profile.holes.push([circle(x, y, 2)]);
  const stockReply = (await client.request(extrude(profile))).reply;
  if (stockReply.error) throw new Error(stockReply.error);
  const stock = operand(stockReply.results[0], "perforated");
  const topFace = stockReply.results[0].faces.findIndex(
    (face) => face.plane && Math.abs(face.plane.origin[2] - 20) < 1e-7,
  );
  if (topFace < 0) throw new Error("Perforated stock has no top planar face");
  const boxReply = (await client.request(extrude(square(25, 25, 20), 25))).reply;
  if (boxReply.error) throw new Error(boxReply.error);
  const box = operand(boxReply.results[0], "tool");
  // Generated fixtures are constructed once, before filtering or measured blocks.
  // Every executable receives the same serialized operands from this client.
  const cubicStock = await cubicOperand(client);
  const list = [
    ["extrude-perforated", extrude(profile)],
    ["extrude-symmetric-perforated", { ...extrude(profile), symmetric: true }],
    ["extrude-symmetric-box", { ...extrude(square(0, 0, 20)), symmetric: true }],
    [
      "boolean-cut-perforated",
      { kind: "boolean", mode: "subtract", ids: [stock.id, box.id], bodies: [stock, box] },
    ],
    [
      "boolean-union-perforated",
      { kind: "boolean", mode: "union", ids: [stock.id, box.id], bodies: [stock, box] },
    ],
  ];
  for (const open of [false, true])
    list.push([
      `shell-perforated-${open ? "open" : "closed"}`,
      {
        kind: "shell",
        bodies: [stock],
        selection: [{ body: stock.id, faces: open ? [stock.faces[topFace].id] : [] }],
        thickness: -0.75,
      },
    ]);
  for (const mode of ["auto", "subtract", "intersect"])
    for (const explicit of [false, true])
      list.push([
        `cubic-${mode}-${explicit ? "explicit" : "implicit"}`,
        {
          ...extrude(square(15, 30, 15), 25),
          mode,
          bodies: [cubicStock],
          ...(explicit ? { targets: [cubicStock.id] } : {}),
        },
      ]);
  for (const mode of ["union", "auto", "subtract", "intersect"])
    for (const explicit of [false, true])
      list.push([
        `extrude-${mode}-${explicit ? "explicit" : "implicit"}`,
        {
          ...extrude(square(25, 25, 20), 25),
          mode,
          bodies: [stock],
          ...(explicit ? { targets: [stock.id] } : {}),
        },
      ]);
  for (const name of ["shell-cylindrical-splines", "shell-notched-cylinder", "shell-bent-sweep"]) {
    const fixture = JSON.parse(await readFile(`tests/fixtures/${name}.json`, "utf8"));
    const body = fixture.document.bodies[0];
    const opening = fixture.opening ?? fixture.openings?.[0];
    for (const open of opening ? [false, true] : [false])
      list.push([
        `${name}-${open ? "open" : "closed"}`,
        {
          kind: "shell",
          bodies: [body],
          selection: [{ body: body.id, faces: open ? [opening] : [] }],
          thickness: name === "shell-cylindrical-splines" ? -4 : -1,
        },
      ]);
    if (fixture.operation || fixture.selection)
      list.push([
        `${name}-captured`,
        {
          kind: "shell",
          bodies: [body],
          thickness: -1,
          selection: fixture.selection,
          ...fixture.operation,
        },
      ]);
  }
  list.push([
    "circle-offset-twist",
    {
      ...extrude({ outer: [circle(0, 0, 10)], holes: [] }),
      twist: { angle: 90, origin: [5, 0, 0] },
    },
  ]);
  return list;
}
