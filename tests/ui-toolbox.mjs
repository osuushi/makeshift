import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function toolboxRoute(page, name) {
  await reset(page);
  const toolbox = page.locator(".toolbox");
  assert.equal(await toolbox.getAttribute("data-mode"), "modeling");
  const entities = await page.getByRole("complementary", { name: "Entities" }).boundingBox();
  const initialBounds = await toolbox.boundingBox();
  assert.ok(entities && initialBounds && initialBounds.y > entities.y + entities.height);
  for (const id of [
    "select",
    "start-sketch",
    "cube",
    "cylinder",
    "sphere",
    "cone",
    "drill",
    "extrude",
    "offset",
  ]) {
    const button = page.locator(`.toolbox-item[data-tool="${id}"]`);
    assert.equal(await button.count(), 1, id);
    assert.equal(await button.locator("svg").count(), 1, `${id} icon`);
  }

  await page.setViewportSize({ width: 1280, height: 520 });
  const bounds = await toolbox.boundingBox();
  const panelHeight = await toolbox.evaluate((element) => element.clientHeight);
  const panelScrollHeight = await toolbox.evaluate((element) => element.scrollHeight);
  assert.ok(bounds && bounds.y + bounds.height <= 520, "The toolbox must stay in the viewport");
  assert.ok(panelHeight < panelScrollHeight, "A short window must scroll the toolbox");

  const cube = page.locator('.toolbox-item[data-tool="cube"]');
  await cube.click();
  await page.waitForFunction(() => window.makeshiftInspect().interaction?.kind === "cube");
  assert.equal(await cube.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.makeshiftInspect().interaction);

  const more = page.getByRole("button", { name: "More tools", exact: true });
  assert.ok(await more.locator("kbd").textContent());
  await more.scrollIntoViewIfNeeded();
  await more.click();
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await page.keyboard.press("Escape");
  await page.locator('.toolbox-item[data-tool="start-sketch"]').click();
  await page.waitForFunction(() => document.querySelector(".toolbox")?.dataset.mode === "sketch");
  await chooseTool(page, "return to modeling", "modeling");
  await page.waitForFunction(() => document.querySelector(".toolbox")?.dataset.mode === "modeling");

  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => document.querySelector(".toolbox")?.dataset.mode === "sketch");
  const line = page.locator('.toolbox-item[data-tool="line"]');
  assert.equal(await line.locator("kbd").textContent(), "L");
  await line.click();
  assert.equal(await line.getAttribute("aria-pressed"), "true");
  await drag(page, [-10, 0], [0, 0]);
  const sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 1);
  console.log(
    `${name}: compact panel tools, active state, sketch shortcut and real geometry passed`,
  );
}
