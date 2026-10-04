import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  independentMesh,
  objFile,
  stlFile,
} from "../.cache/sketch-tests/tests/mesh-import-fixtures.js";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/mesh-import-ui", { recursive: true });
const path = resolve(".cache/mesh-import-ui/independent-sphere.obj");
await writeFile(path, objFile(independentMesh("uv")));
const stl = resolve(".cache/mesh-import-ui/independent-centimeter-sphere.stl");
await writeFile(
  stl,
  Buffer.from(
    stlFile(
      independentMesh("uv", (p) => p),
      true,
    ),
  ),
);
await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    const original = (await inspect(page)).document;
    await importFile(page, name === "webkit" ? stl : path);
    if (name === "webkit")
      await page.getByLabel("Source units", { exact: true }).selectOption("10");
    await page.getByLabel("Accuracy (mm)", { exact: true }).fill("0.2");
    await page.getByLabel("Face budget", { exact: true }).selectOption("24");
    await page.getByRole("button", { name: "Fit mesh preview", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept mesh", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Accept mesh"]').disabled,
      {},
      { timeout: 120000 },
    );
    assert.deepEqual((await inspect(page)).document, original, "Preview must not accept geometry");
    await page.getByLabel("Preview", { exact: true }).selectOption("error");
    assert(await page.locator(".mesh-import-legend").isVisible());
    await orient(page, [0.2, -1, 0.4]);
    if (name === "webkit") await page.setViewportSize({ width: 768, height: 1024 });
    const panel = await page.locator(".mesh-import-widget").boundingBox();
    assert(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= page.viewportSize().width);
    await page.screenshot({ path: `.cache/mesh-import-ui/${name}-deviation.png` });
    if (name === "webkit") await page.setViewportSize({ width: 1280, height: 850 });
    await parameterHistory(page);
    await page.getByLabel("Preview", { exact: true }).selectOption("source");
    await page.getByLabel("Preview", { exact: true }).selectOption("fit");
    await page.getByRole("button", { name: "Accept mesh", exact: true }).click();
    await settled(page);
    const accepted = (await inspect(page)).document;
    assert.equal(accepted.bodies.length, 1);
    assert(Math.abs(accepted.bodies[0].volume / ((4 * Math.PI * 1000) / 3) - 1) < 0.035);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await reselectAndMove(page, accepted);
    const archive = resolve(`.cache/mesh-import-ui/${name}.makeshift`);
    await saveDocument(page, archive);
    await openDocument(page, archive);
    const reopened = (await inspect(page)).document;
    assert.equal(reopened.bodies[0].id, accepted.bodies[0].id);
    await page.keyboard.press("Escape");
    const selection = (await pick(page, [3, -9, 2])).modelingSelection;
    await importFile(page, path);
    await page.getByRole("button", { name: "Fit mesh preview", exact: true }).click();
    await page.getByRole("button", { name: "Cancel mesh import", exact: true }).click();
    await page.locator(".mesh-import-widget").waitFor({ state: "hidden" });
    await settled(page);
    assert.deepEqual((await inspect(page)).document, reopened);
    assert.deepEqual((await inspect(page)).modelingSelection, selection);
    await rejectedFile(page, reopened);
    console.log(
      `PASS ${name}: file import, automatic layout, deviation/source/fit preview, acceptance, Undo/Redo, reselection, archive and cancellation`,
    );
  },
  { timeout: 30000 },
);
async function importFile(page, path) {
  const chooser = page.waitForEvent("filechooser");
  await chooseTool(page, "import mesh", "import-mesh");
  await (await chooser).setFiles(path);
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Fit mesh preview"]');
    return b && !b.disabled;
  });
}

async function reselectAndMove(page, accepted) {
  await page.keyboard.press("Escape");
  await orient(page, [0.3, -1, 0.35]);
  const selected = await pick(page, [3, -9, 2]);
  assert.equal(selected.modelingSelection[0]?.kind, "face");
  await page.keyboard.press("Escape");
  assert.equal(
    (await pick(page, [3, -9, 2])).modelingSelection[0].face,
    selected.modelingSelection[0].face,
  );
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("12");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document.bodies[0];
  assert(Math.abs(moved.center[0] - accepted.bodies[0].center[0] - 12) < 1e-5);
  assert.equal(moved.id, accepted.bodies[0].id);
  await chooseTool(page, "undo", "undo");
  assert(
    JSON.stringify((await inspect(page)).document) === JSON.stringify(accepted),
    "Movement Undo must restore the accepted body",
  );
  await page.keyboard.press("Escape");
}

async function parameterHistory(page) {
  await page.getByLabel("Face budget", { exact: true }).selectOption("54");
  assert(await page.getByRole("button", { name: "Accept mesh", exact: true }).isDisabled());
  await chooseTool(page, "undo", "undo");
  await settled(page);
  assert.equal(await page.getByLabel("Face budget", { exact: true }).inputValue(), "24");
  assert(await page.getByRole("button", { name: "Accept mesh", exact: true }).isEnabled());
}

async function rejectedFile(page, before) {
  const mesh = independentMesh("uv");
  mesh.triangles.pop();
  const invalid = resolve(".cache/mesh-import-ui/open.obj");
  await writeFile(invalid, objFile(mesh));
  await importFile(page, invalid);
  await page.keyboard.press("Enter");
  await page
    .locator('.mesh-import-widget [role="status"]')
    .filter({ hasText: "closed manifold" })
    .waitFor();
  assert(await page.getByRole("button", { name: "Accept mesh", exact: true }).isDisabled());
  assert(JSON.stringify((await inspect(page)).document) === JSON.stringify(before));
  await page.keyboard.press("Escape");
  await page.locator(".mesh-import-widget").waitFor({ state: "hidden" });
}
