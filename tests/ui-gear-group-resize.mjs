import assert from "node:assert/strict";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function resizeGroupedGear(page) {
  const before = (await inspect(page)).document;
  await offsetRadius(page, "0.02");
  const groups = page.getByRole("region", { name: "Gear groups", exact: true });
  if (!(await groups.getByRole("list", { name: "Gear group members" }).count()))
    await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
  assert.match(await groups.getByRole("list").textContent(), /target Ø26.04 mm/);
  await chooseTool(page, "undo", "undo");
  await offsetRadius(page, "0.27");
  const resized = (await inspect(page)).document;
  assert.ok(
    resized.decorators.every((d) => !d.problem),
    "Resizing no longer enforces the old axis spacing",
  );
  const tolerance = page.getByRole("spinbutton", { name: "Pitch diameter tolerance", exact: true });
  await tolerance.fill("1");
  await tolerance.press("Enter");
  await modalCompleted(page);
  const fitted = (await inspect(page)).document;
  assert.ok(fitted.decorators.every((d) => !d.problem));
  assert.deepEqual(
    fitted.bodies.map((b) => b.brep),
    resized.bodies.map((b) => b.brep),
  );
  const module = fitted.decorators.map((d) => (2 * d.gearPitchRadius) / d.settings.teeth);
  assert.ok(Math.abs(module[0] - module[1]) < 1e-10);
  assert.equal(fitted.bodies[1].brep, before.bodies[1].brep);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, resized.decorators);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}

async function offsetRadius(page, distance) {
  await worldClick(page, [10, -23, 2]);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await (await relativeOffsetInput(page)).fill(distance);
  await previewActionReady(page, "Accept face offset");
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await modalCompleted(page);
}
