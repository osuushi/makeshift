import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { startScale } from "./ui-scale.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let fixture;
try {
  await prism(owner, [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ]);
  fixture = { ...owner.view.data, sketches: [] };
} finally {
  owner.close();
}

async function openBody(page) {
  await inspect(page);
  await openDocument(page, {
    name: "entry.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: fixture })),
  });
  await orient(page, [0, 0, 1]);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  return inspect(page);
}

async function scaleBoundary(page, value) {
  const before = (await openBody(page)).document;
  await startScale(page);
  const input = page.getByRole("textbox", { name: "Transform scale X", exact: true });
  if (value !== null) await input.fill(value);
  const state = await inspect(page);
  assert.equal(state.interaction?.kind, "scale");
  assert.equal(await toolEnabled(page, "Sketch on XZ", "sketch-xz"), false);
  const margin = await project(page, [13, 4, 0]);
  await page.mouse.dblclick(margin.x, margin.y);
  let after = await inspect(page);
  assert.equal(after.activePlane, null);
  assert.equal(after.interaction?.kind, "scale");
  assert.deepEqual(after.document, before);
  assert.deepEqual(after.modelingSelection, state.modelingSelection);
  await page.mouse.move(1100, 720);
  await page.mouse.wheel(0, 20);
  after = await inspect(page);
  assert.notDeepEqual(after.camera.target, state.camera.target, "released tool still pans");
  await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  assert.equal((await inspect(page)).activePlane, "XZ");
}

async function sweepBoundary(page, kind) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [3, -5], [13, 5]);
  const pick = await at(page, 8, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (kind === "revolve") await chooseTool(page, "revolve", "revolve");
  else {
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("-");
  }
  const before = await inspect(page);
  assert.equal(before.interaction?.kind, kind);
  assert.equal(await toolEnabled(page, "Sketch on YZ", "sketch-yz"), false);
  if (kind === "extrude") await page.mouse.dblclick(pick.x + 160, pick.y + 100);
  await page.keyboard.press("Enter");
  const after = await inspect(page);
  assert.equal(after.activePlane, null);
  assert.equal(
    after.interaction?.kind,
    kind === "extrude" ? kind : undefined,
    "invalid Extrude retains input; untouched axis picking completes without an edit",
  );
  assert.deepEqual(after.document, before.document);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).interaction, null);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activeSketch, before.document.sketches[0].id);
}

async function pendingScale(page) {
  const before = (await openBody(page)).document;
  await startScale(page);
  const margin = await project(page, [13, 4, 0]);
  const reached = Promise.withResolvers(),
    release = Promise.withResolvers(),
    delivered = Promise.withResolvers();
  let requested = false;
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "scale") return route.continue();
    requested = true;
    const response = await route.fetch();
    reached.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });
  try {
    await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.4");
    let timer;
    try {
      await Promise.race([
        reached.promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Native Scale delivery not reached")), 30000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    assert.equal(await toolEnabled(page, "Sketch on YZ", "sketch-yz"), false);
    await page.mouse.dblclick(margin.x, margin.y);
    assert.equal(await page.evaluate(() => window.makeshiftInspect().activePlane), null);
    release.resolve();
    assert.equal((await inspect(page)).activePlane, null);
    await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
    assert.deepEqual((await inspect(page)).document, before);
  } finally {
    release.resolve();
    if (requested) await delivered.promise;
    await page.unroute("**/sketch-api");
  }
}

async function faceEntry(page) {
  const before = (await openBody(page)).document;
  await page.keyboard.press("Escape");
  const p = await project(page, [0, 0, 10]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "Sketch", "start-sketch");
  const entered = await navigationIdle(page);
  assert.equal(entered.activePlane, "Face sketch");
  assert.ok(Math.abs(entered.camera.height - 30) < 1e-6, "Face entry fits with profile margin");
  assert.ok(Math.hypot(...entered.camera.target.map((v, i) => v - [0, 0, 10][i])) < 1e-6);

  assert.equal((await inspect(page)).document.sketches.length, 0, "entry alone saves no sketch");
  await page.keyboard.press("l");
  await drag(page, [-3, 0], [3, 0]);
  const after = (await inspect(page)).document;
  assert.equal(after.sketches.length, 1);
  assert.equal(after.sketches[0].curves.length, 1);
  assert.deepEqual(after.bodies, before.bodies);
}

await withUiRuntimes(async (page, name) => {
  for (const value of [null, "1.5", "0"]) await scaleBoundary(page, value);
  if (name !== "electron") await pendingScale(page);
  await sweepBoundary(page, "extrude");
  await sweepBoundary(page, "revolve");
  await faceEntry(page);
  console.log(
    `${name}: identity/valid/invalid Scale, ${name === "electron" ? "" : "pending delivery, "}invalid Extrude and untouched Revolve preserve entry/completion rules; canonical/selected face drawing and released pan pass`,
  );
});
