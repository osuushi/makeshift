import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { createStack } from "./ui-cleanup.mjs";
import { undoToDocument } from "./ui-cleanup-controls.mjs";
import { makeFeature, pickFeatureFace } from "./ui-face-move-fixtures.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function frameReopenedStock(page, height) {
  // Pocket fixtures zoom into the opening; restore room to pick the outer cap.
  const viewport = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  assert.ok(viewport);
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, Math.log(40 / height) / 0.01);
  await page.keyboard.up("Control");
  await inspect(page);
}

export async function deleteFeatureRoute(page, name, electron, kind) {
  const pocket = kind !== "boss";
  const { body, faces } = await makeFeature(page, pocket, kind === "hole" ? 0 : 4, kind === "hole");
  for (let i = 0; i < faces.length; i++)
    await pickFeatureFace(page, faces[i], i > 0, pocket, kind === "hole");
  const before = (await inspect(page)).document;
  await page.keyboard.press("Delete");
  let state = await inspect(page);
  assert.equal(state.preview, null);
  assert.equal(state.interaction, null);
  assert.equal(state.document.bodies[0].faces.length, 6);
  close(state.document.bodies[0].volume, 2000);
  assert.equal(state.document.bodies[0].id, body.id);
  assert.equal(await page.getByRole("button", { name: "Accept deletion", exact: true }).count(), 0);
  let history = await page.evaluate(() => window.makeshiftHistory());
  assert.equal(history.at(-1).operation.kind, "delete-topology");
  assert.equal(history.at(-1).outcome, "changed");
  assert.deepEqual(
    history.at(-1).operation.parameters.selection[0].faces,
    faces.map((f) => f.id),
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Escape");
  await inspect(page);
  for (let i = 0; i < faces.length; i++)
    await pickFeatureFace(page, faces[i], i > 0, pocket, kind === "hole");
  await chooseTool(page, "delete", "delete");
  const accepted = (await inspect(page)).document;
  assert.equal((await inspect(page)).interaction, null);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-delete-${kind}`, electron);
  state = await inspect(page);
  const top = state.document.bodies[0].faces.find((f) =>
    f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 5) < 1e-6),
  );
  assert.ok(top);
  await frameReopenedStock(page, state.camera.height);
  await pickFeatureFace(page, top);
  // Deleting a box cap cannot heal; error must not accept or open the shell.
  const reopened = (await inspect(page)).document;
  await page.keyboard.press("Backspace");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, reopened);
  assert.equal(state.interaction, null);
  assert.ok(state.modelingSelection.some((t) => t.face === top.id));
  history = await page.evaluate(() => window.makeshiftHistory());
  const failure = history.at(-1);
  assert.equal(failure.outcome, "failed");
  assert.equal(failure.operation.kind, "delete-topology");
  assert.deepEqual(failure.operation.parameters.selection[0].faces, [top.id]);
  assert.ok(failure.error.length > 0);
  // Reopened healed geometry is still editable through the normal face tool.
  await (await relativeOffsetInput(page)).fill("1");
  state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  close(state.preview.bodies[0].volume, 2400);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await inspect(page);
  history = await page.evaluate(() => window.makeshiftHistory());
  assert.deepEqual(
    history.find((entry) => entry.id === failure.id),
    failure,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, reopened);
  console.log(
    `${name}: delete ${kind}, immediate keys/button, history, archive, retained failure and re-edit passed`,
  );
}

export async function deleteEdgeRoute(page, name) {
  await createStack(page);
  for (let i = 1; i <= 3; i++)
    await page
      .getByRole("button", { name: `Select Body ${i}`, exact: true })
      .click({ modifiers: i > 1 ? ["Shift"] : [] });
  await chooseTool(page, "union", "union");
  await inspect(page);
  await page.getByRole("button", { name: "Accept Boolean", exact: true }).click();
  const before = (await inspect(page)).document;
  await page.keyboard.press("Escape");
  await orient(page, [0.3, -1, 0.5]);
  const point = await project(page, [0, -10, 20]);
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  await page.keyboard.press("Backspace");
  let state = await inspect(page);
  assert.equal(state.preview, null);
  assert.equal(state.interaction, null);
  assert.equal(state.document.bodies[0].faces.length, 13);
  close(state.document.bodies[0].volume, before.bodies[0].volume);
  const after = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await page.keyboard.press("Escape");
  const sharp = await project(page, [0, -10, 30]);
  await page.mouse.click(sharp.x, sharp.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "edge");
  await page.keyboard.press("Delete");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, after);
  assert.match(await page.getByRole("status").textContent(), /two surviving closed boundary loops/);
  const history = await page.evaluate(() => window.makeshiftHistory());
  const failure = history.at(-1);
  assert.equal(failure.outcome, "failed");
  assert.match(failure.error, /two surviving closed boundary loops/);
  await undoToDocument(page, before);
  assert.deepEqual((await inspect(page)).document, before, "Undo skips the rejected deletion");
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  assert.equal((await page.evaluate(() => window.makeshiftHistory())).at(-1).error, failure.error);
  console.log(
    `${name}: immediate edge dissolve, Undo/Redo skip failure, retained sharp-edge diagnostic passed`,
  );
}
