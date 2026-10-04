import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { erosionReconstructionSource } from "../.cache/sketch-tests/tests/erosion-reconstruction-fixtures.js";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/erosion-reconstruction-ui", { recursive: true });
const sourcePath = resolve(".cache/erosion-reconstruction-ui/waist.makeshift");
const owner = new DocumentOwner();
try {
  await erosionReconstructionSource(owner);
  await writeFile(sourcePath, documentArchive(owner.view.data));
} finally {
  owner.close();
}

await withUiRuntimes(
  async (page, runtime) => {
    await openDocument(page, sourcePath);
    const source = (await inspect(page)).document;
    await cancelCalculation(page, source);
    await page
      .getByRole("button", { name: /^Select Body / })
      .first()
      .click();
    await chooseTool(page, "erode", "erode");
    await page.getByRole("combobox", { name: "Mesh detail", exact: true }).selectOption("standard");
    const state = await inspect(page);
    assert(state.preview, await page.locator(".status").textContent());
    assert.deepEqual(state.document, source);
    assert.equal(state.preview.bodies.length, 2);
    await page.screenshot({ path: `.cache/erosion-reconstruction-ui/${runtime}-preview.png` });
    await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
    const accepted = (await inspect(page)).document;
    const cavity = accepted.bodies[1];
    assert(cavity.faces.length <= 96 && cavity.volume > 700 && cavity.volume < 1500);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, source);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    const reopened = await editAndArchive(page, runtime, accepted);
    await subtractCavity(page, runtime, reopened);
    console.log(
      `PASS ${runtime}: freeform Erode, face selection/movement, history, Save/Open and cavity subtraction`,
    );
  },
  { timeout: 60000 },
);

async function editAndArchive(page, runtime, accepted) {
  const cavity = accepted.bodies[1];
  // The original remains hidden, so the pointer can reselect the interior surface.
  await page.keyboard.press("Escape");
  await orient(page, [0.3, -1, 0.5]);
  const center = (face) =>
    [0, 1, 2].map(
      (axis) =>
        face.vertices.reduce((s, v, i) => s + (i % 3 === axis ? v : 0), 0) /
        (face.vertices.length / 3),
    );
  const face = cavity.faces.reduce((a, b) => (center(a)[1] < center(b)[1] ? a : b));
  let state = await pick(page, center(face));
  assert.equal(state.modelingSelection[0]?.face, face.id);
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move faces Y", exact: true }).click();
  await page.locator(".face-move-gizmo .face-transform-value").fill("-0.1");
  state = await inspect(page);
  assert(state.preview, await page.locator(".status").textContent());
  assert(Math.abs(state.preview.bodies[1].volume - cavity.volume) > 0.01);
  await page.getByRole("button", { name: "Accept face movement", exact: true }).click();
  const edited = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, edited);
  const archive = resolve(`.cache/erosion-reconstruction-ui/${runtime}-edited.makeshift`);
  await saveDocument(page, archive);
  await openDocument(page, archive);
  const reopened = (await inspect(page)).document;
  for (const [i, body] of reopened.bodies.entries()) {
    assert.equal(body.brep, edited.bodies[i].brep);
    assert.equal(body.id, edited.bodies[i].id);
    assert.deepEqual(
      body.faces.map((face) => face.id),
      edited.bodies[i].faces.map((face) => face.id),
    );
    assert.deepEqual(
      body.edges.map((edge) => edge.id),
      edited.bodies[i].edges.map((edge) => edge.id),
    );
    assert(Math.abs(body.volume - edited.bodies[i].volume) < 1e-8);
  }
  return reopened;
}

async function subtractCavity(page, runtime, reopened) {
  // Final cavity subtraction uses the saved, edited freeform body.
  const buttons = page.getByRole("button", { name: /^Select Body / });
  await buttons.first().click();
  await buttons.last().click({ modifiers: ["Meta"] });
  await chooseTool(page, "subtract", "subtract");
  const state = await inspect(page);
  assert.equal(state.preview?.bodies.length, 1);
  const expected = reopened.bodies[0].volume - reopened.bodies[1].volume;
  assert(Math.abs(state.preview.bodies[0].volume - expected) < 1e-3);
  await page.keyboard.press("Enter");
  const wall = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, reopened);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, wall);
  await page.screenshot({ path: `.cache/erosion-reconstruction-ui/${runtime}-wall.png` });
  await saveDocument(page, resolve(`.cache/erosion-reconstruction-ui/${runtime}-wall.makeshift`));
}

async function cancelCalculation(page, original) {
  await page
    .getByRole("button", { name: /^Select Body / })
    .first()
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
  await page.locator('[data-command="erode"]').click();
  await page.getByRole("combobox", { name: "Mesh detail", exact: true }).selectOption("standard");
  await page.waitForFunction(() => window.makeshiftInspect().busy);
  const cancel = page.getByRole("button", { name: "Cancel calculation", exact: true });
  await cancel.waitFor({ state: "visible" });
  const start = performance.now();
  await cancel.click();
  const state = await inspect(page);
  assert(performance.now() - start < 2000, "Erode calculation cancellation remains prompt");
  assert.equal(state.interaction, null);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
}
