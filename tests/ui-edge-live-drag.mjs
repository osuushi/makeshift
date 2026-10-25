import assert from "node:assert/strict";
import { deliveryGate, holdReply, waitForDelivery } from "./preview-delivery.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real pointer + native previews: a completed older candidate must not rewind the field.
export async function edgeLiveDrag(page) {
  await plate(page);
  await chooseTool(page, "grid", "sketch-grid");
  const panel = page.getByRole("dialog", { name: "View options", exact: true });
  const minor = panel.getByLabel("Minor grid (mm)", { exact: true });
  await minor.fill("0.25");
  await minor.dispatchEvent("change");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  const handle = page.getByRole("button", { name: "Fillet edges", exact: true });
  await handle.click();
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  await input.fill("1");
  const state = await inspect(page);
  const scale = state.camera.height / page.viewportSize().height;
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((el) => ({
    x: Number(el.dataset.directionX),
    y: Number(el.dataset.directionY),
  }));
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const gates = [deliveryGate(), deliveryGate()];
  await page.route("**/sketch-api", async (route) => {
    const request = route.request().postDataJSON();
    const gate = gates.find((gate) => !gate.assigned);
    if (request.kind === "finish-edges" && gate) return holdReply(route, gate);
    return route.continue();
  });
  try {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.keyboard.down("Shift");
    await page.mouse.move(
      start.x + (direction.x * 1.25) / scale,
      start.y + (direction.y * 1.25) / scale,
    );
    await waitForDelivery(gates[0]);
    assert.equal(Number(await input.inputValue()), 2.25);
    await page.mouse.move(
      start.x + (direction.x * 2.5) / scale,
      start.y + (direction.y * 2.5) / scale,
    );
    assert.equal(Number(await input.inputValue()), 3.5);
    gates[0].release.resolve();
    await waitForDelivery(gates[1]);
    assert.equal(
      Number(await input.inputValue()),
      3.5,
      "Older geometry must not rewind requested size",
    );
    gates[1].release.resolve();
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await inspect(page);
    assert.equal(Number(await input.inputValue()), 3.5);
    await page.getByRole("button", { name: "Accept fillet", exact: true }).click();
    assert.ok((await inspect(page)).document.bodies[0].volume < state.document.bodies[0].volume);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, state.document);
  } finally {
    for (const gate of gates) gate.release.resolve();
    await Promise.all(gates.filter((gate) => gate.assigned).map((gate) => gate.delivered.promise));
    await page.unroute("**/sketch-api");
  }
}
