import assert from "node:assert/strict";
import { deliveryGate, holdReply, waitForDelivery } from "./preview-delivery.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function revolveLiveDrag(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, 0], [7, 2]);
  await page.keyboard.press("l");
  await drag(page, [2, -6], [2, 4]);
  const center = await at(page, 6, 1),
    axis = await at(page, 2, -4);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "revolve", "revolve");
  await page.mouse.click(axis.x, axis.y);
  await inspect(page);
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("90");
  const original = (await inspect(page)).document;
  const handle = await page
    .getByRole("button", { name: "Drag revolution height", exact: true })
    .boundingBox();
  const input = page.getByRole("textbox", { name: "Revolution height", exact: true });
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const gates = [deliveryGate(), deliveryGate()];
  await page.route("**/sketch-api", async (route) => {
    const gate = gates.find((gate) => !gate.assigned);
    if (route.request().postDataJSON().kind === "revolve" && gate) return holdReply(route, gate);
    return route.continue();
  });
  try {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y - 20);
    await waitForDelivery(gates[0]);
    const first = Number(await input.inputValue());
    assert.ok(first > 0);
    await page.mouse.move(start.x, start.y - 40);
    const latest = Number(await input.inputValue());
    assert.ok(latest > first, "Revolve height follows the pointer while native preview is held");
    gates[0].release.resolve();
    await waitForDelivery(gates[1]);
    assert.equal(Number(await input.inputValue()), latest);
    gates[1].release.resolve();
    await page.mouse.up();
    await inspect(page);
    await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
    assert.equal((await inspect(page)).document.bodies.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  } finally {
    for (const gate of gates) gate.release.resolve();
    await Promise.all(gates.filter((gate) => gate.assigned).map((gate) => gate.delivered.promise));
    await page.unroute("**/sketch-api");
  }
}
