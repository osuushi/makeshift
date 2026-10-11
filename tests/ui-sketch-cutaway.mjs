import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { pixels } from "./ui-fill.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cutawayRoute(page, name, plane = "XY") {
  await reset(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("checkbox", { name: "Global X-ray vision" }).check();
  const opacity = page.getByRole("slider", { name: "X-ray front opacity", exact: true });
  await opacity.press("Home");
  await opacity.press("PageUp");
  await opacity.press("PageUp");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [-18, -18], [18, 18]);
  assert.equal((await inspect(page)).document.sketches.length, 1, "Rectangle accepted");
  const pick = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  // Lift the body clear of the plane so only the foreground pass can show it.
  // A large selected body covers the turntable helper's center-band press points.
  // Clear through Select, orbit, then reselect its visible cap with the new projection.
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, { XY: [0, 0, 10], XZ: [0, -10, 0], YZ: [10, 0, 0] }[plane]);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await chooseTool(page, "transform", "transform");
  const axis = { XY: "Z", XZ: "Y", YZ: "X" }[plane];
  await page.getByRole("button", { name: `Move body ${axis}`, exact: true }).click();
  await page.locator(".body-transform-value").fill(plane === "XZ" ? "-2" : "2");
  await page.keyboard.press("Enter");
  const body = (await inspect(page)).document.bodies;
  await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
  const blank = await pixels(page, [[3.4, 4]]);
  await chooseTool(page, "line", "line");
  await drag(page, [-8, 4], [8, 4]);
  await page.keyboard.press("Escape");
  const ink = await pixels(page, [[3.4, 4]]);
  assert.ok(ink[0][0] < blank[0][0] - 30, `Sketch visible through solid: ${blank} -> ${ink}`);
  const tinted = await pixels(page, [[3.4, 6.4]]);
  await chooseTool(page, "Hide bodies", "hide-bodies");
  const unobscured = await pixels(page, [[3.4, 6.4]]);
  assert.ok(
    Math.abs(tinted[0][0] - unobscured[0][0]) > 5,
    `Foreground body remains visible over empty sketch space: ${unobscured} -> ${tinted}`,
  );
  await chooseTool(page, "Show bodies", "show-bodies");
  assert.deepEqual(await pixels(page, [[3.4, 4]]), ink, "Body visibility restores overlay");
  assert.deepEqual((await inspect(page)).document.bodies, body);
  await page.screenshot({ path: `.cache/sketch-review/${name}-${plane}-sketch-cutaway.png` });
  // Exit with the same camera pose: the front face must cover the new line again.
  const point = await at(page, 3.4, 4);
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  const png = await page.screenshot({ scale: "css" });
  const restored = await page.evaluate(
    async ({ data, point }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return [0, 4].map(
        (dy) => context.getImageData(Math.round(point.x), Math.round(point.y) + dy, 1, 1).data[0],
      );
    },
    { data: png.toString("base64"), point },
  );
  assert.ok(
    Math.abs(restored[0] - restored[1]) <= 2,
    `Opaque body covers the line like the adjacent surface: ${restored}`,
  );
  assert.deepEqual((await inspect(page)).document.bodies, body);
  console.log(
    `${name} ${plane}: real extrusion, visible sketch line through solid, unchanged body and exit restoration pass`,
  );
}
