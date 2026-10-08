import { readFile } from "node:fs/promises";
import { operand } from "./client.mjs";

export const square = (x, y, size, z = 0) => ({
  outer: [[x, y, z], [x + size, y, z], [x + size, y + size, z], [x, y + size, z]]
    .map((a, i, points) => ({ kind: "line", a, b: points[(i + 1) % 4] })),
  holes: [],
});
const circle = (x, y, radius) => ({
  kind: "circle", center: [x, y, 0], radius, normal: [0, 0, 1], axis: [1, 0, 0],
});
const extrude = (profile, distance = 20) => ({
  kind: "extrude", normal: [0, 0, 1], profiles: [profile], distance, mode: "new", bodies: [],
});

export async function cases(client) {
  const profile = square(0, 0, 60);
  for (let x = 10; x <= 50; x += 10)
    for (let y = 10; y <= 50; y += 10) profile.holes.push([circle(x, y, 2)]);
  const stockReply = (await client.request(extrude(profile))).reply;
  if (stockReply.error) throw new Error(stockReply.error);
  const stock = operand(stockReply.results[0], "perforated");
  const boxReply = (await client.request(extrude(square(25, 25, 20), 25))).reply;
  if (boxReply.error) throw new Error(boxReply.error);
  const box = operand(boxReply.results[0], "tool");
  const list = [
    ["extrude-perforated", extrude(profile)],
    ["boolean-cut-perforated", { kind: "boolean", mode: "subtract", ids: [stock.id, box.id], bodies: [stock, box] }],
    ["boolean-union-perforated", { kind: "boolean", mode: "union", ids: [stock.id, box.id], bodies: [stock, box] }],
  ];
  for (const mode of ["union", "auto", "subtract", "intersect"])
    for (const explicit of [false, true]) list.push([
      `extrude-${mode}-${explicit ? "explicit" : "implicit"}`,
      { ...extrude(square(25, 25, 20), 25), mode, bodies: [stock], ...(explicit ? { targets: [stock.id] } : {}) },
    ]);
  for (const name of ["shell-cylindrical-splines", "shell-notched-cylinder", "shell-bent-sweep"]) {
    const fixture = JSON.parse(await readFile(`tests/fixtures/${name}.json`, "utf8"));
    const body = fixture.document.bodies[0];
    const opening = fixture.opening ?? fixture.openings?.[0];
    for (const open of opening ? [false, true] : [false]) list.push([
      `${name}-${open ? "open" : "closed"}`,
      { kind: "shell", bodies: [body], selection: [{ body: body.id, faces: open ? [opening] : [] }],
        thickness: name === "shell-cylindrical-splines" ? -4 : -1 },
    ]);
  }
  list.push(["circle-offset-twist", {
    ...extrude({ outer: [circle(0, 0, 10)], holes: [] }),
    twist: { angle: 90, origin: [5, 0, 0] },
  }]);
  return list;
}
