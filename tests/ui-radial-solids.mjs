import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";

export async function radialSolids(page) {
  // New tools inherit the diameter selected in the sketch; chamfers stay distances.
  await plate(page);
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  const diameter = page.getByRole("textbox", { name: "Fillet diameter", exact: true });
  await diameter.fill("4");
  await previewActionReady(page, "Accept fillet");
  let state = await inspect(page);
  close(state.preview.bodies[0].faces.find((face) => face.blend).blend.radius, 2);
  const preview = state.preview;
  await page
    .getByRole("button", { name: "Switch to radius", exact: false })
    .filter({ visible: true })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "Fillet radius", exact: true }).inputValue(),
    "2",
  );
  assert.deepEqual((await inspect(page)).preview, preview);
  await page
    .getByRole("button", { name: "Switch to diameter", exact: false })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Switch to chamfer", exact: true }).click();
  await previewActionReady(page, "Accept chamfer");
  assert.equal(
    await page.getByRole("textbox", { name: "Chamfer distance", exact: true }).inputValue(),
    "2",
  );
  assert.equal(await page.locator(".body-edge-finish-widget .radial-toggle").isVisible(), false);
  await page.getByRole("button", { name: "Switch to fillet", exact: true }).click();
  await previewActionReady(page, "Accept fillet");
  assert.equal(await diameter.inputValue(), "4");
  // Restore R for the existing plate fixture, then switch its curved-face field.
  await page
    .getByRole("button", { name: "Switch to radius", exact: false })
    .filter({ visible: true })
    .click();
  await page.keyboard.press("Escape");
  await makePlate(page);
  await orient(page, [0, -Math.sin(0.35), Math.cos(0.35)]);
  await worldClick(page, [0, 1.5, 2.5]);
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch to diameter", exact: false })
    .filter({ visible: true })
    .click();
  const face = page.getByRole("textbox", { name: "Face diameter", exact: true });
  assert.equal(await face.inputValue(), "3");
  await face.fill("5");
  await previewActionReady(page, "Accept face offset");
  state = await inspect(page);
  close(state.preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  const extrusion = page.getByRole("textbox", { name: "Extrusion diameter", exact: true });
  assert.equal(await extrusion.inputValue(), "3");
  await extrusion.fill("5");
  await previewActionReady(page, "Accept extrusion");
  close((await inspect(page)).preview.bodies[0].volume, (400 - Math.PI * 2.5 ** 2) * 5);
  await page.keyboard.press("Escape");
  console.log("PASS diameter fillet, chamfer mode changes, curved-face offset and extrusion");
}
