import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { edgeFinishPrism, pickWorld, sizeInput } from "./ui-edge-finish-fixtures.mjs";
import { inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { cubeSettled } from "./ui-orientation-cube-clicks.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// These failures require real capture/replay and automatic card placement together.
await withUiRuntimes(async (page) => {
  await reset(page);
  await orient(page, [1, 1, 1]);
  await pickPlane(page, "XY");
  assert.ok((await inspect(page)).planeTargets.some((p) => p.selected));
  await page.getByRole("button", { name: "Right view", exact: true }).click();
  await cubeSettled(page);
  assert.ok((await inspect(page)).planeTargets.every((p) => !p.selected));
  await chooseTool(page, "cross section", "cross-section");
  const section = (await inspect(page)).crossSection;
  assert.equal(Math.abs(section.u[0]), 0);
  assert.equal(Math.abs(section.v[0]), 0);
  await page.keyboard.press("Escape");

  const original = await edgeFinishPrism(page);
  await pickWorld(page, [0, 0, 10]);
  await chooseTool(page, "fillet", "fillet");
  await sizeInput(page, "fillet").fill("1");
  await previewActionReady(page, "Accept fillet");
  const panel = page
    .locator(".draggable-parameter-panel")
    .filter({ has: sizeInput(page, "fillet") });
  const grip = panel.getByRole("button", { name: "Drag parameter panel" });
  const before = await panel.boundingBox();
  const handle = await grip.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 100, handle.y + handle.height / 2 + 80, {
    steps: 8,
  });
  const held = await panel.boundingBox();
  assert.ok(Math.hypot(held.x - before.x, held.y - before.y) > 30);
  await page.mouse.up();
  await page.mouse.move(40, 400);
  await page.waitForTimeout(200); // Outlast the automatic placement transition.
  const released = await panel.boundingBox();
  assert.ok(
    Math.hypot(released.x - held.x, released.y - held.y) < 2,
    "Manual placement survives release",
  );
  const point = await project(page, [10, 0, 5]);
  await page.keyboard.down("Meta");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Meta");
  assert.equal(
    (await inspect(page)).modelingSelection.length,
    7,
    "Command adds adjacent boundaries",
  );
  await previewActionReady(page, "Accept fillet");
  await page.mouse.click(40, 400);
  await modalCompleted(page);
  assert.ok((await inspect(page)).document.bodies[0].volume < original.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);

  await page.keyboard.press("Escape");
  await pickWorld(page, [0, 0, 10]);
  await chooseTool(page, "shell", "shell");
  await page.getByRole("textbox", { name: /Shell thickness/ }).fill("-1");
  await previewActionReady(page, "Accept shell");
  const face = await project(page, [10, 0, 5]);
  await page.keyboard.down("Meta");
  await page.mouse.click(face.x, face.y);
  await page.keyboard.up("Meta");
  await modalCompleted(page);
  const camera = (await inspect(page)).camera;
  await page.mouse.move(face.x + 60, face.y + 30, { steps: 5 });
  const after = await inspect(page);
  assert.equal(after.camera.orbitActive, false);
  assert.deepEqual(
    after.camera.position,
    camera.position,
    "Released Shell click cannot drag the camera",
  );
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  console.log(
    "PASS cube supersedes canonical plane, panel stays dragged, Command face addition, background acceptance/Undo and released Shell click",
  );
});
