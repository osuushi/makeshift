import assert from "node:assert/strict";
import { at, close, drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function calculatorRecovery(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  try {
    const page = await context.newPage();
    // Downloads now happen behind startup, before drawing controls are available.
    // Real worker failures must reach the loading screen and recover through Reload.
    for (const pattern of ["**/*solver*.js", "**/*solver*.wasm", "**/makeshift-kernel-*.wasm"]) {
      await context.route(pattern, (route) => route.abort());
      await page.goto(url);
      const reload = page.getByRole("button", { name: "Reload", exact: true });
      await reload.waitFor({ state: "visible" });
      assert.match(await page.locator(".startup-error").innerText(), /could not start/);
      await context.unroute(pattern);
      await reload.click();
      await settled(page);
      const state = await inspect(page);
      assert.equal(state.document.sketches.length, 0);
      assert.equal(state.document.bodies?.length ?? 0, 0);
    }
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-15, -10], [15, 10]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
    await recoveredSolid(page);
  } finally {
    await context.close();
  }
}

async function recoveredSolid(page) {
  const point = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("6");
  await page.keyboard.press("Enter");
  close((await inspect(page)).preview.bodies[0].volume, 3600);
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 3600);
}
