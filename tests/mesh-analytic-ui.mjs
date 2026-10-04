import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  independentMesh,
  objFile,
  primitiveMesh,
} from "../.cache/sketch-tests/tests/mesh-import-fixtures.js";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/mesh-analytic-ui", { recursive: true });
const paths = {};
for (const name of ["sphere", "cylinder", "capsule"]) {
  paths[name] = resolve(`.cache/mesh-analytic-ui/${name}.obj`);
  await writeFile(
    paths[name],
    objFile(name === "sphere" ? independentMesh("uv") : primitiveMesh(name)),
  );
}
await withUiRuntimes(
  async (page, runtime) => {
    for (const name of ["sphere", "cylinder", "capsule"]) {
      await reset(page);
      await importAnalytic(page, paths[name]);
      const status = await page.locator('.mesh-import-widget [role="status"]').innerText();
      assert.match(
        status,
        new RegExp(`${name === "sphere" ? "1 analytic face" : "3 analytic faces"}`),
      );
      await page.screenshot({ path: `.cache/mesh-analytic-ui/${runtime}-${name}.png` });
      await page.getByRole("button", { name: "Accept mesh", exact: true }).click();
      await settled(page);
      await editFace(page, name, runtime);
      console.log(
        `PASS ${runtime} ${name}: file import, analytic preview, face offset, Undo/Redo and archive`,
      );
    }
  },
  { timeout: 30000 },
);
async function importAnalytic(page, path) {
  const chooser = page.waitForEvent("filechooser");
  await chooseTool(page, "import mesh", "import-mesh");
  await (await chooser).setFiles(path);
  const fit = page.getByRole("button", { name: "Fit mesh preview", exact: true });
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Fit mesh preview"]');
    return b && !b.disabled;
  });
  await page.getByLabel("Accuracy (mm)", { exact: true }).fill("0.07");
  await fit.click();
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Accept mesh"]').disabled,
  );
}
async function editFace(page, name, runtime) {
  const before = (await inspect(page)).document.bodies[0];
  assert.equal(before.faces.length, name === "sphere" ? 1 : 3);
  await page.keyboard.press("Escape");
  await orient(page, [0, -0.25, 1]);
  const selection = await pick(page, [0, 0, name === "sphere" ? 10 : 6]);
  assert.equal(selection.modelingSelection[0]?.kind, "face");
  await chooseTool(page, "offset faces", "offset");
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Face radius", exact: true })
    .fill(name === "sphere" ? "11" : "7");
  await page.waitForFunction(
    () =>
      !window.makeshiftInspect().busy &&
      !document.querySelector('button[aria-label="Accept face offset"]')?.disabled,
  );
  assert(Math.abs(Number(await (await relativeOffsetInput(page)).inputValue()) - 1) < 1e-5);
  const expected =
    name === "sphere"
      ? (4 * Math.PI * 11 ** 3) / 3
      : Math.PI * 49 * 20 + (name === "capsule" ? (4 * Math.PI * 343) / 3 : 0);
  const preview = (await inspect(page)).preview.bodies[0];
  assert(Math.abs(preview.volume / expected - 1) < 1e-5);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  assert(Math.abs((await inspect(page)).document.bodies[0].volume / expected - 1) < 1e-5);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies[0].brep, before.brep);
  await chooseTool(page, "redo", "redo");
  const archive = resolve(`.cache/mesh-analytic-ui/${runtime}-${name}.makeshift`);
  await saveDocument(page, archive);
  await openDocument(page, archive);
  const after = (await inspect(page)).document.bodies[0];
  assert.equal(after.id, before.id);
  assert(Math.abs(after.volume / expected - 1) < 1e-5);
}
