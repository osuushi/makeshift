import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { readArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import {
  erosionBores,
  lobedErosionSource,
} from "../.cache/sketch-tests/tests/erosion-sections-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { pickFace } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const curved = readArchive(readFileSync("tests/fixtures/erosion-curved-interior.json", "utf8"));
const owner = new DocumentOwner();
let bores;
try {
  await erosionBores(owner);
  bores = owner.view.data;
} finally {
  owner.close();
}
await withUiRuntimes(
  async (page, runtime) => {
    for (const [name, document] of [
      ["curved", curved],
      ["lobed", lobedErosionSource],
      ["bores", bores],
    ]) {
      const before = await previewSection(page, name, document);
      await page.screenshot({
        path: `.cache/sketch-review/${runtime}-erosion-${name}-preview.png`,
      });
      await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
      const accepted = (await inspect(page)).document;
      assert.equal(accepted.bodies.length, 2);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, before);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, accepted);
      await page
        .getByRole("button", { name: /^Select Body / })
        .nth(1)
        .click();
      await page.keyboard.press("m");
      await page.getByRole("button", { name: "Move body X", exact: true }).click();
      await page.locator(".body-transform-value").fill("0.2");
      await page.keyboard.press("Enter");
      let state = await inspect(page);
      assert(
        Math.abs(state.document.bodies[1].center[0] - accepted.bodies[1].center[0] - 0.2) < 1e-6,
      );
      await chooseTool(page, "undo", "undo");
      if (name === "curved") await editCurvedFace(page, runtime);
      await bodyArchiveRoute(page, `${runtime}-erosion-${name}`);
      const reopened = (await inspect(page)).document;
      const buttons = page.getByRole("button", { name: /^Select Body / });
      await buttons.nth(0).click();
      await buttons.nth(1).click({ modifiers: ["Meta"] });
      await chooseTool(page, "subtract", "subtract");
      state = await inspect(page);
      assert.equal(state.preview?.bodies.length, 1);
      assert(
        Math.abs(
          state.preview.bodies[0].volume - reopened.bodies[0].volume + reopened.bodies[1].volume,
        ) < 1e-3,
      );
      await page.keyboard.press("Enter");
      await inspect(page);
      await bodyArchiveRoute(page, `${runtime}-erosion-${name}-wall`);
      console.log(
        `${runtime}: ${name} default Remesh, history, reselect/move, Save/Open and final cavity passed`,
      );
    }
  },
  { timeout: 90000 },
);

async function previewSection(page, name, document) {
  await openDocument(page, {
    name: `${name}.makeshift`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
  });
  const before = (await inspect(page)).document;
  await page
    .getByRole("button", { name: /^Select Body / })
    .first()
    .click();
  await chooseTool(page, "erode", "erode");
  assert.equal(
    await page.getByRole("combobox", { name: "Erosion method", exact: true }).inputValue(),
    "fast",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Erode by", exact: true }).inputValue(),
    "1",
  );
  assert.equal(
    await page.getByRole("combobox", { name: "Mesh detail", exact: true }).inputValue(),
    "standard",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "CAD face budget", exact: true }).inputValue(),
    "128",
  );
  if (name === "curved") {
    await page.getByRole("textbox", { name: "Erode by", exact: true }).fill("2");
    await page.getByRole("combobox", { name: "Mesh detail", exact: true }).selectOption("fine");
    await inspect(page);
  }
  assert.match(await page.locator(".erosion-quality").textContent(), /Sampled thickness/);
  const state = await inspect(page);
  assert(state.preview, await page.locator(".erosion-status").textContent());
  assert.equal(state.preview.bodies.length, 2);
  assert(
    state.preview.bodies[1].volume > before.bodies[0].volume * (name === "curved" ? 0.35 : 0.5),
  );
  assert.deepEqual(state.document, before);
  return before;
}

async function editCurvedFace(page, runtime) {
  const before = (await inspect(page)).document;
  const cavity = before.bodies[1];
  const center = (face) =>
    [0, 1, 2].map(
      (axis) =>
        face.vertices.reduce((sum, v, i) => sum + (i % 3 === axis ? v : 0), 0) /
        (face.vertices.length / 3),
    );
  const face = cavity.faces.reduce((a, b) => (center(a)[1] < center(b)[1] ? a : b));
  await pickFace(page, face, true);
  await page.screenshot({ path: `.cache/sketch-review/${runtime}-erosion-curved-face.png` });
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move faces Y", exact: true }).click();
  await page.locator(".face-move-gizmo input").fill("-0.1");
  const preview = await inspect(page);
  assert(preview.preview, await page.locator(".status").textContent());
  assert(Math.abs(preview.preview.bodies[1].volume - cavity.volume) > 0.01);
  await page.getByRole("button", { name: "Accept face movement", exact: true }).click();
  const edited = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, edited);
}
