import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openDocument } from "./native-documents.mjs";
import { closeSettings, settingsSurface } from "./settings-surface.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { holdCompletion } from "./ui-deferred-preview.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/internal-selection-xray.json", import.meta.url), "utf8"),
);
const probe = [-4.5355, -3.0355, -10.1];
const exterior = [-6, -6, 13.5];

// CPU tests cannot observe the GPU captures, batched early preview or pointer delivery.
export async function internalSelectionXrayRoute(page, runtime) {
  await prepare(page);
  const original = (await inspect(page)).document;
  const normal = await pixels(page, [probe, exterior]);
  const point = await project(page, probe);
  await hold(page, point);
  const choice = page.locator(
    `[data-kind="face"][data-key="${fixture.modelingSelection[0].face}"]`,
  );
  await choice.waitFor({ state: "visible" });
  await choice.hover();
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).modelingSelection, fixture.modelingSelection);
  const revealed = await pixels(page, [probe, exterior]);
  assert.ok(
    delta(normal[0], revealed[0]) > 15,
    "Selected internal wall is visible through its shell",
  );
  assert.ok(delta(normal[1], revealed[1]) < 3, "Exterior beyond the aperture stays opaque");
  assert.equal(
    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
    "CANVAS",
    "Reselection reaches geometry rather than its edit control",
  );
  await page.mouse.click(point.x, point.y);
  assert.deepEqual(
    (await inspect(page)).modelingSelection,
    fixture.modelingSelection,
    "Revealed wall is directly reselectable",
  );
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Face radius", exact: true });
  await holdCompletion(page);
  let early;
  try {
    await input.fill("6");
    await page.waitForFunction(() => window.deferredPresentation.reached);
    // Metadata is intentionally pending; capture the real native drawing now.
    early = await pixelsAt(page, [point]);
    assert.ok(delta(normal[0], early[0]) > 15, "Mesh-first radius preview retains the reveal");
    await page.screenshot({ path: `.cache/sketch-review/${runtime}-selection-xray-early.png` });
  } finally {
    await page.evaluate(() => {
      window.deferredPresentation.release();
      window.deferredPresentation.restore();
      delete window.deferredPresentation;
    });
  }
  const candidate = await inspect(page);
  assert.equal(
    candidate.preview.bodies[0].faces.find((f) => f.id === fixture.modelingSelection[0].face)
      .cylinder.radius,
    6,
  );
  const complete = await pixels(page, [probe]);
  await page.screenshot({ path: `.cache/sketch-review/${runtime}-selection-xray.png` });
  assert.ok(
    delta(early[0], complete[0]) < 4,
    `Mesh and metadata presentations agree: ${JSON.stringify({ early, complete, point })}`,
  );
  await input.press("Enter");
  await modalCompleted(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Radius edit remains one ordinary Undo",
  );
  await chooseTool(page, "clear selection", "selection-clear");
  const cleared = await pixels(page, [probe, exterior]);
  assert.deepEqual(cleared, normal, "Deselect restores the ordinary opaque presentation");
  console.log(
    `${runtime}: captured internal selection, local shell fade, picking, mesh-first radius edit and Undo passed`,
  );
  await enclosedCavityPixels(page, runtime);
}

async function enclosedCavityPixels(page, runtime) {
  const enclosed = JSON.parse(
    await readFile(new URL("./fixtures/enclosed-selection-xray.json", import.meta.url), "utf8"),
  );
  const module = `/@fs/${fileURLToPath(new URL("./selection-xray-render.ts", import.meta.url))
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")}`;
  const caps = await page.evaluate(
    async ({ module, enclosed }) => {
      const { selectionXrayRenderChecks } = await import(module);
      return selectionXrayRenderChecks(enclosed);
    },
    { module, enclosed },
  );
  console.log(`${runtime}: enclosed cavity caps and continuous shell GPU pixels passed`, caps);
}

async function prepare(page) {
  await page.setViewportSize({ width: 1280, height: 850 });
  await openDocument(page, {
    name: "internal-selection.makeshift",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  for (let i = 1; i <= 2; i++)
    await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).click();
  await orient(page, [1, 0.7, 1.1]);
  await page.getByRole("button", { name: "Application settings" }).click();
  const settings = await settingsSurface(page, "View");
  await settings.getByRole("checkbox", { name: "Global X-ray vision" }).uncheck();
  for (const [name, value] of [
    ["Body X-ray opacity", 25],
    ["Bleed", 15],
    ["Radius", 10],
  ]) {
    const slider = settings.getByRole("slider", { name, exact: true });
    await slider.press("Home");
    for (let i = 0; i < value; i++) await slider.press("ArrowRight");
  }
  await closeSettings(settings);
}

async function pixels(page, points) {
  await page.mouse.move(1150, 80);
  const locations = await Promise.all(points.map((point) => project(page, point)));
  return pixelsAt(page, locations);
}

async function pixelsAt(page, locations) {
  const png = await page.screenshot();
  return page.evaluate(
    async ({ data, locations }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return locations.map((p) =>
        [...context.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data].slice(0, 3),
      );
    },
    { data: png.toString("base64"), locations },
  );
}
function delta(a, b) {
  return Math.max(...a.map((value, i) => Math.abs(value - b[i])));
}
