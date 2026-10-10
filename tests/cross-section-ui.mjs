import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function placement(page, rotate, axis, value) {
  await button(page, `${rotate ? "Rotate" : "Move"} plane ${axis}`).click();
  await page
    .getByRole("textbox", {
      name: `Plane ${rotate ? "rotation" : "translation"} ${axis}`,
      exact: true,
    })
    .fill(String(value));
}
async function dragHandle(page, name) {
  const handle = await button(page, name).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2 + 20, {
    steps: 8,
  });
  await page.mouse.up();
}
async function caps(page) {
  await page.waitForFunction(() => {
    const s = window.makeshiftInspect();
    return !s.sectionCalculating && s.sectionSurfaces > 0;
  });
}
async function route(page, name) {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const original = await makePlate(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [6, 6, 5]);
  let s = await inspect(page);
  assert.equal(s.modelingSelection[0]?.kind, "face");
  const source = original.bodies[0].faces.find((f) => f.id === s.modelingSelection[0].face).plane;
  const history = await page.evaluate(() => window.makeshiftHistory());
  await chooseTool(page, "cross section", "cross-section");
  s = await inspect(page);
  assert.deepEqual(
    s.crossSection.origin,
    source.origin,
    "Preselected face supplies the section plane",
  );
  await placement(page, false, "Z", -2.5);
  await caps(page);
  s = await inspect(page);
  assert.equal(s.crossSection.origin[2], 2.5);
  assert.equal(s.sectionSurfaces, 1, "Exact section cap supports a hole");
  const beforeFlip = s.crossSection,
    equation = s.clipping[0];
  await button(page, "Flip side").click();
  await caps(page);
  s = await inspect(page);
  assert.deepEqual(s.crossSection.origin, beforeFlip.origin);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(s.clipping[0][i] + equation[i]) < 1e-8);
  assert.ok(Math.abs(s.clipping[0][3] + equation[3] - 0.0002) < 1e-8);
  await button(page, "Flip side").focus();
  await page.keyboard.press("Enter");
  assert.deepEqual(
    (await inspect(page)).crossSection,
    beforeFlip,
    "Keyboard activates the focused Flip side button",
  );
  await button(page, "Flip side").click();
  await page.screenshot({ path: `.cache/cross-section/${name}-flipped.png` });
  await button(page, "Done").click();
  const retained = (await inspect(page)).crossSection;
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    history,
    "Section placement and flip create no Undo entries",
  );
  await adjustmentRoute(page, retained, original);
  await referenceRoutes(page, name, source);
  await savedPlaneRoute(page, name);
  assert.deepEqual(errors, []);
  console.log(
    name,
    "cross-section face/plane entry, placement, flip, caps, cancel, history and file lifecycle passed",
  );
}
async function adjustmentRoute(page, retained, original) {
  // Camera movement never reverses the chosen clipping direction.
  const fixedEquation = (await inspect(page)).clipping;
  await orient(page, [-1, 1, -1]);
  assert.deepEqual((await inspect(page)).clipping, fixedEquation);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [0, -10, 0]);
  assert.equal(
    (await inspect(page)).modelingSelection.length,
    0,
    "Clipped bottom edge and sketch cannot be selected",
  );
  await worldClick(page, [6, 6, 5]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.kind,
    "face",
    "Retained top face remains selectable",
  );
  const history = await page.evaluate(() => window.makeshiftHistory());
  await button(page, "Adjust section").click();
  assert.deepEqual(
    (await inspect(page)).crossSection,
    retained,
    "Adjust preserves the placed plane",
  );
  await dragHandle(page, "Rotate plane X");
  assert.notDeepEqual((await inspect(page)).crossSection.v, retained.v);
  await page.keyboard.press("Escape");
  await button(page, "Adjust section").click();
  await placement(page, true, "X", 30);
  const rotated = (await inspect(page)).crossSection;
  assert.deepEqual(rotated.origin, retained.origin);
  assert.notDeepEqual(rotated.v, retained.v);
  await page.keyboard.press("Escape");
  assert.deepEqual(
    (await inspect(page)).crossSection,
    retained,
    "Escape restores the retained view",
  );
  await button(page, "Adjust section").click();
  await placement(page, false, "X", "bad");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).interaction.kind, "cross-section");
  await page.keyboard.press("Escape");
  await button(page, "Flip side").click();
  assert.notDeepEqual(
    (await inspect(page)).crossSection.v,
    retained.v,
    "Cancel invalid entry re-enables flip",
  );
  await button(page, "Flip side").click();
  await button(page, "Adjust section").click();
  await dragHandle(page, "Move plane X");
  assert.notDeepEqual((await inspect(page)).crossSection.origin, retained.origin);
  await button(page, "Cancel").click();
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    history,
    "Re-adjustment and cancellation create no Undo entries",
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await settled(page);
  assert.deepEqual((await inspect(page)).crossSection, retained);
  await chooseTool(page, "return to modeling", "modeling");
  assert.deepEqual((await inspect(page)).clipping, fixedEquation);
  assert.deepEqual((await inspect(page)).document, original);
}
async function referenceRoutes(page, name, source) {
  // World-plane selection after activation, then rotation and a second flip.
  await button(page, "Turn off section").click();
  if ((await inspect(page)).modelingSelection.length)
    await chooseTool(page, "clear selection", "selection-clear");
  await chooseTool(page, "cross section", "cross-section");
  await orient(page, [1, -1, 1]);
  await pickPlane(page, "XZ");
  assert.ok((await inspect(page)).crossSection);
  await placement(page, true, "X", 30);
  const oblique = (await inspect(page)).crossSection;
  await button(page, "Flip side").click();
  assert.deepEqual((await inspect(page)).crossSection.origin, oblique.origin);
  await page.keyboard.press("Enter");
  await caps(page);
  await page.screenshot({ path: `.cache/cross-section/${name}-oblique.png` });
  await button(page, "Adjust section").click();
  await button(page, "Choose section plane").click();
  await page.keyboard.press("Escape");
  assert.ok((await inspect(page)).crossSection, "Cancel replacement restores section");
  await button(page, "Turn off section").click();
  assert.deepEqual((await inspect(page)).clipping, []);
  // New command with no selection accepts a planar face picked afterward.
  await chooseTool(page, "cross section", "cross-section");
  // The front half is exposed; the XZ reference patch covers the back half.
  await worldClick(page, [6, -6, 5]);
  assert.deepEqual((await inspect(page)).crossSection.origin, source.origin);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).crossSection, null);
}
async function savedPlaneRoute(page, name) {
  // Saved-plane preselection, and selection via Entities after activation.
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "YZ");
  await page.keyboard.press("Enter");
  const saved = (await inspect(page)).document;
  await chooseTool(page, "cross section", "cross-section");
  assert.deepEqual(
    (await inspect(page)).crossSection.origin,
    saved.constructionPlanes[0].frame.origin,
  );
  await page.keyboard.press("Enter");
  await button(page, "Turn off section").click();
  await chooseTool(page, "cross section", "cross-section");
  await button(page, "Choose section plane").click();
  await button(page, "Use Plane 1").click();
  assert.deepEqual(
    (await inspect(page)).crossSection.origin,
    saved.constructionPlanes[0].frame.origin,
  );
  await page.keyboard.press("Enter");
  const file = resolve(`.cache/cross-section/${name}.makeshift`);
  await saveDocument(page, file);
  await openDocument(page, file);
  assert.equal((await inspect(page)).crossSection, null, "Open resets the view-only section");
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, saved.sketches);
  assert.deepEqual(reopened.constructionPlanes, saved.constructionPlanes);
  // Open regenerates body presentation from the serialized BRep, with roundoff.
  assert.equal(reopened.bodies.length, saved.bodies.length);
  for (let i = 0; i < saved.bodies.length; i++) {
    const actual = reopened.bodies[i],
      expected = saved.bodies[i];
    assert.equal(actual.id, expected.id);
    assert.ok(Math.abs(actual.volume - expected.volume) < 1e-6);
    assert.deepEqual(
      actual.faces.map((f) => f.id),
      expected.faces.map((f) => f.id),
    );
    assert.deepEqual(
      actual.edges.map((e) => e.id),
      expected.edges.map((e) => e.id),
    );
    actual.bounds.forEach((n, j) => {
      assert.ok(Math.abs(n - expected.bounds[j]) < 1e-6);
    });
  }
  await chooseTool(page, "cross section", "cross-section");
  await pickPlane(page, "XY");
  await page.keyboard.press("Enter");
  await reset(page);
  assert.equal((await inspect(page)).crossSection, null);
}
await mkdir(".cache/cross-section", { recursive: true });
const names = runtimeNames(["chromium", "webkit", "electron"]);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    if (process.env.MAKESHIFT_TEST_BROWSER && process.env.MAKESHIFT_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await route(page, name);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.MAKESHIFT_TEST_BROWSER || process.env.MAKESHIFT_TEST_BROWSER === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_TEST_HIDDEN: "1",
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
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
