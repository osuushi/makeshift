import assert from "node:assert/strict";
import { at, close, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function extrusionPreviewRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const gates = Array.from({ length: 4 }, () => ({
    reached: Promise.withResolvers(),
    release: Promise.withResolvers(),
  }));
  const requests = [],
    superseded = [];
  await page.route("**/sketch-api", async (route) => {
    const request = route.request().postDataJSON();
    if (request.kind === "supersede-preview") superseded.push(request);
    if (request.kind !== "extrude") return route.continue();
    const gate = gates[requests.length];
    requests.push(request.extrusion);
    const response = await route.fetch(); // Real native geometry; delay only its delivery.
    gate?.reached.resolve();
    await gate?.release.promise;
    await route.fulfill({ response });
  });
  try {
    const handle = await page
      .getByRole("button", { name: "Drag extrusion", exact: true })
      .boundingBox();
    assert.ok(handle);
    const x = handle.x + handle.width / 2,
      y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 50);
    await reachedPreview(gates[0], "first drag");
    close(
      Number(
        await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).inputValue(),
      ),
      requests[0].distance,
    );
    gates[0].release.resolve();
    await settled(page);
    close((await inspect(page)).preview.bodies[0].volume, requests[0].distance * 600);
    await page.mouse.move(x, y - 100);
    await reachedPreview(gates[1], "second drag");
    const intermediate = await page.evaluate(() => window.makeshiftInspect());
    assert.ok(
      intermediate.preview,
      "Completed geometry must display even while another target is pending",
    );
    assert.equal(intermediate.document.bodies?.length ?? 0, 0);
    close(intermediate.preview.bodies[0].volume, requests[0].distance * 600);
    await queuedExtrusion(page, gates, requests, superseded, x, y);
    await page.mouse.up();
    await page.keyboard.press("Enter");
    close((await inspect(page)).document.bodies[0].volume, requests[2].distance * 600);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
    await invalidatedPreview(page, pick, gates[3]);
  } finally {
    for (const gate of gates) gate.release.resolve();
    await page.mouse.up();
    await page.unroute("**/sketch-api");
  }
}
// Real native replies are held at the transport boundary so an older successful
// target can arrive while a newer drag target is waiting in the controller.
async function queuedExtrusion(page, gates, requests, superseded, x, y) {
  for (let i = 0; i < 5; i++) await page.mouse.move(x + i, y - 100);
  assert.equal(requests.length, 2, "Unchanged snapped distance must not recompute");
  await page.mouse.move(x, y - 150);
  await page.mouse.move(x, y - 200);
  const requested = Number(
    await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).inputValue(),
  );
  assert.ok(requested > requests[1].distance, "The field follows the latest queued drag target");
  assert.equal(requests.length, 2, "Waiting targets stay in the serial controller slot");
  assert.deepEqual(superseded, [], "Drag changes keep the initialized worker alive");
  gates[1].release.resolve();
  await reachedPreview(gates[2], "latest queued drag");
  close(
    Number(
      await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).inputValue(),
    ),
    requested,
  );
  const intermediate = await page.evaluate(() => window.makeshiftInspect());
  close(intermediate.preview.bodies[0].volume, requests[1].distance * 600);
  assert.equal(intermediate.document.bodies?.length ?? 0, 0);
  assert.equal(
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled(),
    true,
    "An intermediate successful target cannot be accepted",
  );
  assert.equal(requests.length, 3, "Only the latest waiting target reaches native geometry");
  gates[2].release.resolve();
  await settled(page);
  close((await inspect(page)).preview.bodies[0].volume, requests[2].distance * 600);
}
async function invalidatedPreview(page, pick, gate) {
  await page.mouse.click(pick.x, pick.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await reachedPreview(gate, "invalidated preview");
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("0");
  gate.release.resolve();
  await settled(page);
  assert.equal(
    (await inspect(page)).preview,
    null,
    "Late geometry must not resurrect an invalidated target",
  );
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
}

// Delay delivery after real native calculation: cancellation must cross the host
// boundary while a preview reply is outstanding, then retire that late reply.
export async function extrusionCancelRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const reached = Promise.withResolvers(),
    release = Promise.withResolvers();
  let cancelled = false;
  await page.route("**/sketch-api", async (route) => {
    const { kind } = route.request().postDataJSON();
    if (kind === "cancel-preview") cancelled = true;
    if (kind !== "extrude") return route.continue();
    const response = await route.fetch();
    reached.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
    await reachedPreview({ reached }, "cancel preview");
    await page.keyboard.press("Escape");
    for (let i = 0; i < 50 && !cancelled; i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(cancelled, "Escape must send cancellation without waiting for the preview reply");
    release.resolve();
    await settled(page);
    const result = await inspect(page);
    assert.equal(result.preview, null);
    assert.equal(result.document.bodies?.length ?? 0, 0);
  } finally {
    release.resolve();
    await page.unroute("**/sketch-api");
  }
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("7");
  await settled(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 4200);
}

async function reachedPreview(gate, label) {
  let timer;
  try {
    await Promise.race([
      gate.reached.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`No extrusion request: ${label}`)), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
