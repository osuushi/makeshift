import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { independentMesh, objFile } from "./mesh-import-fixtures.ts";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function webMeshTools(page, name) {
  await reset(page);
  const original = (await inspect(page)).document;
  const path = `.cache/web-review/${name}-sphere.obj`;
  await writeFile(path, objFile(independentMesh("uv")));
  const chooser = page.waitForEvent("filechooser");
  await chooseTool(page, "import mesh", "import-mesh");
  await (await chooser).setFiles(path);
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Fit mesh preview"]');
    return button && !button.disabled;
  });
  await page.getByLabel("Accuracy (mm)", { exact: true }).fill("0.2");
  await page.getByRole("button", { name: "Fit mesh preview", exact: true }).click();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Accept mesh"]');
    return button && !button.disabled;
  });
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Accept mesh", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  assert(Math.abs(accepted.bodies[0].volume / ((4 * Math.PI * 1000) / 3) - 1) < 0.035);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  console.log(`${name}: WASM mesh import, preview and history passed`);
  await plate(page);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  const before = (await inspect(page)).document;
  await chooseTool(page, "erode", "erode");
  close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
  assert.deepEqual((await inspect(page)).document, before);
  const method = page.getByRole("combobox", { name: "Erosion method", exact: true });
  await method.selectOption("accurate");
  close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
  await method.selectOption("fast");
  close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
  await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
  const eroded = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, eroded);
  console.log(`${name}: WASM Remesh/Analytic previews, acceptance and history passed`);
}
