import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function rename(page, from, to, key = "Enter") {
  await page
    .locator(".entity-viewer")
    .getByRole("button", { name: `Select ${from}`, exact: true })
    .dblclick();
  assert.equal((await inspect(page)).activePlane, null);
  await page.getByRole("textbox", { name: `Name for ${from}`, exact: true }).fill(to);
  await page.keyboard.press(key);
  await inspect(page);
}
async function reorder(page, from, to, { after = true, cancel = false, snapshot } = {}) {
  const row = (name) =>
    page.locator(".entity-viewer").getByRole("button", { name: `Select ${name}`, exact: true });
  const a = await row(from).boundingBox(),
    b = await row(to).boundingBox();
  assert.ok(a && b);
  const original = (await inspect(page)).document;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + (after ? b.height - 2 : 2), { steps: 10 });
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Dragging does not mutate accepted state",
  );
  if (snapshot) {
    assert.equal(await page.locator(".entity-drop-before, .entity-drop-after").count(), 1);
    await page.screenshot({ path: snapshot });
  }
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  await inspect(page);
  if (cancel) assert.deepEqual((await inspect(page)).document, original);
}
async function route(page, name) {
  page.setDefaultTimeout(12000);
  await plate(page);
  await page.keyboard.press("Escape");
  const before = (await inspect(page)).document;
  await rename(page, "Body 1", "Housing");
  assert.equal(await page.getByRole("button", { name: "Select Housing", exact: true }).count(), 1);
  assert.deepEqual((await inspect(page)).document.bodies, before.bodies);
  await rename(page, "Sketch 1", "Cancelled", "Escape");
  assert.equal(await page.getByRole("button", { name: "Select Sketch 1", exact: true }).count(), 1);
  await rename(page, "Sketch 1", "Profile", "Tab");
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [20, 20], [30, 30]);
  await chooseTool(page, "return to modeling", "modeling");
  await reorder(page, "Profile", "Sketch 2", { cancel: true });
  const beforeCrossGroup = (await inspect(page)).document;
  await reorder(page, "Profile", "Housing");
  assert.deepEqual((await inspect(page)).document, beforeCrossGroup);
  await reorder(page, "Profile", "Sketch 2");
  await inspect(page);
  const labels = () =>
    page.locator(".entity-viewer .entity-row > button:first-child").allTextContents();
  assert.deepEqual(await labels(), ["Housing", "Sketch 2", "Profile"]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.deepEqual(await labels(), ["Housing", "Profile", "Sketch 2"]);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  assert.deepEqual(await labels(), ["Housing", "Sketch 2", "Profile"]);
  await page.getByRole("button", { name: "Select Profile", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  await chooseTool(page, "return to modeling", "modeling");
  await page.keyboard.press("Escape");
  await orient(page, [1, 1, 1]);
  for (const plane of ["XY", "XZ"]) {
    await chooseTool(page, "Construction plane", "construction-plane");
    await pickPlane(page, plane);
    await inspect(page);
    await page.keyboard.press("Escape");
  }
  await rename(page, "Plane 1", "Datum");
  await reorder(page, "Datum", "Plane 2");
  await inspect(page);
  assert.deepEqual((await labels()).slice(-2), ["Plane 2", "Datum"]);
  const saved = (await inspect(page)).document.entityPresentation;
  const directory = await mkdtemp(join(tmpdir(), "makeshift-organization-"));
  try {
    const path = join(directory, "organized.makeshift");
    await saveDocument(page, path);
    await openDocument(page, path);
    assert.deepEqual((await inspect(page)).document.entityPresentation, saved);
    assert.deepEqual(await labels(), ["Housing", "Sketch 2", "Profile", "Plane 2", "Datum"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  await page
    .locator(".entity-viewer")
    .getByRole("button", { name: "Select Datum", exact: true })
    .click();
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane, "Select + Enter opens a renamed saved plane");
  await chooseTool(page, "return to modeling", "modeling");
  await longDragRoute(page, name);
  assert.equal(await page.locator(".entity-menu").count(), 0);
  console.log(
    `${name}: double-click rename, cancellation, drag order, history, Enter and Save/Open pass`,
  );
}
async function longDragRoute(page, name) {
  await chooseTool(page, "Sketch on YZ", "sketch-yz");
  await page.keyboard.press("l");
  await drag(page, [20, 20], [30, 30]);
  await chooseTool(page, "return to modeling", "modeling");
  const before = (await inspect(page)).document;
  await reorder(page, "Sketch 3", "Sketch 2", {
    after: false,
    snapshot: `.cache/sketch-review/${name}-entity-drop.png`,
  });
  assert.deepEqual(
    await page
      .locator('.entity-row[data-entity-group="sketch"] > button:first-child')
      .allTextContents(),
    ["Sketch 3", "Sketch 2", "Profile"],
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before, "One Undo restores a multi-row drag");
  await page.getByRole("button", { name: "Hide Profile", exact: true }).click();
  await page.getByRole("button", { name: "Select Profile", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activeSketch);
  await chooseTool(page, "return to modeling", "modeling");
  const label = page.getByRole("button", { name: "Select Housing", exact: true });
  await label.dblclick();
  await page.screenshot({ path: `.cache/sketch-review/${name}-entity-rename.png` });
  await page.keyboard.press("Escape");
}
await mkdir(".cache/sketch-review", { recursive: true });
const names = runtimeNames(["chromium", "webkit", "electron"]);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, type] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
  if (names.includes("electron")) {
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
      await route(page, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
