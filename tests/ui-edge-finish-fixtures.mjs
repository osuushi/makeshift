import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function edgeFinishPrism(page, concave = false) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  if (concave) {
    const polygon = [
      [-10, -10],
      [10, -10],
      [10, 0],
      [0, 0],
      [0, 10],
      [-10, 10],
    ];
    await page.keyboard.press("l");
    for (let i = 0; i < polygon.length; i++)
      await drag(page, polygon[i], polygon[(i + 1) % polygon.length]);
  } else {
    await page.keyboard.press("r");
    await drag(page, [-10, -10], [10, 10]);
  }
  const pick = await at(page, -5, -5);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  assert.ok(Math.abs(original.bodies[0].volume - (concave ? 3000 : 4000)) < 1e-6);
  await page.keyboard.press("Escape");
  await orient(page, [1, 1, 1]);
  return original;
}

export async function pickWorld(page, xyz, shift = false) {
  const p = await project(page, xyz);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  return inspect(page);
}

export function sizeInput(page, mode) {
  return page.getByRole("textbox", {
    name: mode === "fillet" ? "Fillet radius" : "Chamfer distance",
    exact: true,
  });
}

export async function dragSize(page, mode, distance = 20) {
  const handle = page.getByRole("button", {
    name: mode === "fillet" ? "Fillet edges" : "Chamfer edges",
    exact: true,
  });
  const direction = [
    Number(await handle.getAttribute("data-direction-x")),
    Number(await handle.getAttribute("data-direction-y")),
  ];
  assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-6);
  const box = await handle.boundingBox(),
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + direction[0] * distance, y + direction[1] * distance, { steps: 4 });
  await page.mouse.up();
  return inspect(page);
}

export async function finishHistory(page, mode, original) {
  await page.getByRole("button", { name: `Accept ${mode}`, exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.notDeepEqual(accepted, original);
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.bodies[0].id },
  ]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "One Undo reverses the entire finish");
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  return accepted;
}
