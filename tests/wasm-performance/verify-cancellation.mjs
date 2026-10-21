import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { openDocument } from "../native-documents.mjs";
import { project } from "../ui-blend-edit.mjs";
import { inspect, modalCompleted, settled } from "../ui-helpers.mjs";
import { serve } from "./browser.mjs";
import { fixturePath } from "./cases.mjs";
import { instrumentDrag } from "./drag-instrumentation.mjs";

// Browser integration regression: explicit discard must still stop a WASM
// calculation when ordinary drag targets keep its worker alive.
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const server = await serve();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const action of ["invalid", "escape"]) await verify(browser, action);
      console.log(`${name}: invalid input and Escape discard pending work; next edit recovers`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

async function verify(browser, action) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.addInitScript(instrumentDrag);
    await page.goto(server.url);
    await settled(page);
    await openDocument(page, {
      name: "cancel-extrude.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    const point = await project(page, [1, 0, 0]);
    await page.mouse.click(point.x, point.y);
    const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
    await handle.click();
    const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
    const twist = page.getByRole("textbox", { name: "Extrusion twist", exact: true });
    // A real twisted sweep stays in flight long enough to exercise interruption,
    // even when the plain extrusion finishes before a second UI command arrives.
    await twist.fill("90");
    await page.evaluate(() => {
      window.kernelDragStats.events = [];
    });
    await distance.fill("20");
    await page.waitForFunction(() =>
      window.kernelDragStats.events.some((e) => e.event === "request"),
    );
    if (action === "invalid") await distance.fill("0");
    else await page.keyboard.press("Escape");
    await settled(page);
    if (action === "escape") await modalCompleted(page);
    const discarded = await inspect(page);
    assert.equal(discarded.preview, null);
    assert.equal(discarded.document.bodies?.length ?? 0, 0);
    const events = await page.evaluate(() => window.kernelDragStats.events);
    assert.ok(
      events.some((e) => e.event === "terminate"),
      "Discard interrupted an actual worker request",
    );
    if (action === "invalid")
      assert.equal(
        await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled(),
        true,
      );
    else await handle.click();
    await twist.fill("0");
    await distance.fill("10");
    await settled(page);
    assert.ok(Math.abs((await inspect(page)).preview.bodies[0].volume - 8355.855205765696) < 1e-5);
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
    await modalCompleted(page);
    assert.equal((await inspect(page)).document.bodies.length, 1);
  } finally {
    await context.close();
  }
}
