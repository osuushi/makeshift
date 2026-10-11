import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function shellRoute(page, name, electron) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 30, center.y + 30);
  const initial = await inspect(page);
  assert.equal(initial.modelingSelection[0].kind, "face");
  const original = initial.document;
  await chooseTool(page, "shell", "shell");
  let input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await input.fill("-1");
  let state = await inspect(page);
  assert.equal(state.interaction.kind, "shell");
  assert.deepEqual(state.document, original);
  close(state.preview.bodies[0].volume, 4000 - 18 * 18 * 9);
  await input.fill("-30");
  state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
  assert.equal(await input.inputValue(), "-30");
  assert.equal(
    await page.getByRole("button", { name: "Accept shell", exact: true }).isEnabled(),
    false,
  );
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original);
  const failed = (await page.evaluate(() => window.makeshiftHistory())).findLast(
    (e) => e.operation.kind === "shell",
  );
  assert.equal(failed.outcome, "failed");
  await input.fill("-1");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shell-open.png` });
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.deepEqual(state.modelingSelection, initial.modelingSelection);
  await shellDragAndOutward(page, original);
  await input.fill("-1");
  await inspect(page);
  await page.getByRole("button", { name: "Accept shell", exact: true }).click();
  state = await inspect(page);
  close(state.document.bodies[0].volume, 1084);
  const accepted = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-shell`, electron);
  // Reselect the preserved bottom and use the ordinary offset path after reopening.
  await worldClick(page, [-4, 4, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-shell-reselect.png` });
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  await page.keyboard.press("o");
  const offset = await relativeOffsetInput(page);
  await offset.fill("0.2");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).document.bodies[0].volume > accepted.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  // Whole coverage creates a sealed cavity; switching tools completes one edit.
  await plate(page);
  input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("s");
  await input.fill("-1");
  close((await inspect(page)).preview.bodies[0].volume, 1408);
  await input.press("Tab");
  await chooseTool(page, "transform", "transform");
  state = await inspect(page);
  close(state.document.bodies[0].volume, 1408);
  assert.equal(state.modelingTool, "move");
  console.log(
    `${name}: Shell openings, strict failure/recovery, cancel, accept, history, Undo/Redo, Save/Open, re-edit and tool switching passed`,
  );
}

async function shellDragAndOutward(page, original) {
  const input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await input.fill("1");
  close((await inspect(page)).preview.bodies[0].volume, 22 * 22 * 11 - 4000);
  await page.getByRole("button", { name: "Cancel shell", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, original);
  // Actual directional dragging must leave its result temporary after release.
  const handle = page.getByRole("button", { name: "Shell thickness handle", exact: true });
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((b) => ({
    x: Number(b.dataset.directionX),
    y: Number(b.dataset.directionY),
  }));
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - direction.x * 18, y - direction.y * 18, { steps: 5 });
  await page.mouse.up();
  const state = await inspect(page);
  assert.ok(state.preview?.bodies[0].volume > 0);
  assert.ok(state.preview.bodies[0].volume < original.bodies[0].volume);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
