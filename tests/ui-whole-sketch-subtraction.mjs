import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

const fixture = {
  format: "makeshift",
  version: 1,
  document: {
    units: "mm",
    sketches: [
      {
        id: "9c6f6beb-f232-4ffd-8595-cfca74239657",
        plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
        curves: [
          { id: "outer", kind: "circle", center: { x: 0, y: 0 }, radius: 10, construction: false },
          { id: "inner", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
          { id: "island", kind: "circle", center: { x: 22, y: 0 }, radius: 3, construction: false },
          {
            id: "open",
            kind: "segment",
            a: { x: -15, y: 15 },
            b: { x: 15, y: 15 },
            construction: false,
          },
        ],
        constraints: [],
        groups: [],
      },
    ],
  },
};
// Model tests cannot catch Option-click routing or stale whole-region highlighting.
export async function wholeSketchSubtraction(page) {
  await openDocument(page, {
    name: "whole-sketch.makeshift",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await orient(page, [0, 0, 1]);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const point = await project(page, [0, 0, 0]);
  await page.keyboard.down("Alt");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Alt");
  const state = await inspect(page);
  assert.equal(state.modelingSelection.filter((t) => t.kind === "profile").length, 2);
  await page.mouse.move(1100, 80);
  await page.screenshot({ path: ".cache/whole-sketch-subtract.png" });
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await input.fill("5");
  await inspect(page);
  await input.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const body = (await inspect(page)).document.bodies[0];
  assert.ok(Math.abs(body.volume - 375 * Math.PI) < 1e-6);
  assert.equal((await inspect(page)).document.bodies.length, 2);
}
