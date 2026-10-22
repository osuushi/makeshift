import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function route(page, name) {
  page.setDefaultTimeout(15000);
  await plate(page);
  const exitButton = page.getByRole("button", { name: "Exit isolation", exact: true });
  assert.equal(await exitButton.isVisible(), false, "Exit button is hidden outside isolation");
  assert.ok(
    (await inspect(page)).modelingSelection.every((target) => target.kind === "edge"),
    "Plate leaves body edges selected",
  );
  await chooseTool(page, "isolate selection", "isolate");
  const cube = await page.locator(".orientation-cube").boundingBox();
  const exitBounds = await exitButton.boundingBox();
  assert.ok(cube && exitBounds && exitBounds.y >= cube.y + cube.height);
  assert.ok(Math.abs(exitBounds.x + exitBounds.width / 2 - (cube.x + cube.width / 2)) < 2);
  assert.equal(await page.getByRole("button", { name: "Hide Body 1", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Show Sketch 1", exact: true }).count(), 1);
  // New gesture owners must enter isolation before the editor paints/picks them.
  // Visibility unit tests cannot verify this editor-to-renderer notification boundary.
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [20, 20], [30, 30]);
  assert.equal(await page.getByRole("button", { name: "Hide Sketch 2", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Show Sketch 1", exact: true }).count(), 1);
  await page.keyboard.press("Escape");
  const createdMidpoint = await at(page, 25, 25);
  await page.mouse.click(createdMidpoint.x, createdMidpoint.y);
  assert.ok((await inspect(page)).selectionTargets.length, "New isolated sketch is pickable");
  await exitButton.click();
  assert.equal(await exitButton.isVisible(), false);
  await chooseTool(page, "return to modeling", "modeling");
  const before = (await inspect(page)).document;
  const button = (label) => page.getByRole("button", { name: label, exact: true });
  await button("Hide Body 1").click();
  await button("Select Body 1").click();
  await chooseTool(page, "isolate selection", "isolate");
  assert.equal(await button("Hide Body 1").count(), 1, "Hidden selected body is revealed");
  assert.equal(await button("Show Sketch 1").count(), 1);
  assert.equal(await button("Show Sketch 2").count(), 1);
  await button("Show Sketch 1").click();
  await button("Show Sketch 2").click();
  await chooseTool(page, "exit isolation", "end-isolation");
  for (const label of ["Body 1", "Sketch 1", "Sketch 2"])
    assert.equal(await button(`Hide ${label}`).count(), 1, `${label} remains visible`);
  assert.deepEqual((await inspect(page)).document, before, "Isolation leaves geometry unchanged");
  await button("Select Body 1").click();
  await button("Select Sketch 2").click({ modifiers: ["Meta"] });
  await chooseTool(page, "isolate selection", "isolate");
  assert.equal(await button("Hide Body 1").count(), 1);
  assert.equal(await button("Hide Sketch 2").count(), 1);
  assert.equal(await button("Show Sketch 1").count(), 1, "Other owner is isolated");
  await chooseTool(page, "exit isolation", "end-isolation");
  await button("Select Sketch 2").click();
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activeSketch, "Revealed sketch remains editable");
  const midpoint = await at(page, 25, 25);
  await page.mouse.click(midpoint.x, midpoint.y);
  assert.ok((await inspect(page)).selectionTargets.length, "Sketch curve is selected");
  await chooseTool(page, "isolate selection", "isolate");
  assert.equal(await button("Hide Sketch 2").count(), 1);
  assert.equal(await button("Show Body 1").count(), 1);
  await chooseTool(page, "exit isolation", "end-isolation");
  console.log(`${name}: isolate, reveal, exit and re-enter sketch passed`);
}

const runtime = process.env.MAKESHIFT_TEST_BROWSER;
const names = runtimeNames(["chromium", "webkit", "electron"]);
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, type] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    if (runtime && runtime !== name) continue;
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
  if (!runtime || runtime === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
        MAKESHIFT_TEST_HIDDEN: "1",
      },
    });
    try {
      const page = await app.firstWindow();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      await route(page, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
