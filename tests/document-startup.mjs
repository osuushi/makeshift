import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { settled } from "./ui-helpers.mjs";

const animated = (page) => page.evaluate(() => window.makeshiftStartup.animate);
async function menuWindow(app, label) {
  const opening = app.waitForEvent("window");
  await app.evaluate(({ Menu }, label) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === label)
      .click();
  }, label);
  const page = await opening;
  await settled(page);
  assert.equal(await animated(page), false, `${label} uses the quick logo`);
  return page;
}
async function closeAll(app) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.close();
  });
  for (let i = 0; i < 100; i++) {
    if (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 0))
      return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Clean document windows did not close");
}

// Native preload/application lifetime cannot be proved by the loading-script unit tests.
// In particular, no document window survives to remember that the movie already ran.
export async function startupWindows(app, first, root) {
  assert.equal(await animated(first), true, "First preload consumes this launch's animation");
  await first.reload();
  await settled(first);
  assert.equal(await animated(first), false, "Reload does not replay the full animation");
  const second = await menuWindow(app, "New");
  if (process.platform !== "darwin") {
    await second.close();
    return first; // Other platforms quit after closing their final window.
  }
  await closeAll(app);
  await menuWindow(app, "New");
  await closeAll(app);
  const path = join(root, "Startup.makeshift");
  await writeFile(
    path,
    JSON.stringify({
      format: "makeshift",
      version: 1,
      document: { units: "mm", sketches: [] },
    }),
  );
  await app.evaluate((_, path) => {
    globalThis.openPaths = [path];
  }, path);
  await menuWindow(app, "Open…");
  await closeAll(app);
  return menuWindow(app, "New");
}
