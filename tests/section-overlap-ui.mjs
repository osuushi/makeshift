import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { closeSettings, settingsSurface } from "./settings-surface.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseWidget } from "./ui-modal-plane-widgets.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { sectionGrid } from "./ui-section-grid.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder capture: four bodies hashed to blue and their coplanar caps fought for depth.
// Screenshot samples verify actual GPU blending and sketch ink preservation.
await withUiRuntimes(async (page, name) => {
  await openDocument(page, resolve("tests/fixtures/section-overlap.makeshift"));
  await inspect(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  const settings = await settingsSurface(page, "View");
  await settings.getByRole("checkbox", { name: "Global X-ray vision" }).check();
  await settings.getByRole("slider", { name: "X-ray front opacity", exact: true }).press("Home");
  await closeSettings(settings);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await orient(page, [0, -1, 0]);
  await page.getByRole("button", { name: "Hide Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 4", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
  const capPoint = [15.3, 0, 27.2];
  const first = await pixelPatch(page, capPoint, 21);
  await page.getByRole("button", { name: "Show Body 2", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  const second = await pixelPatch(page, capPoint, 21);
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  const blended = await pixelPatch(page, capPoint, 21);
  assert.ok(
    first.some((pixel, i) => pixel.some((v, channel) => Math.abs(v - second[i][channel]) > 20)),
    "Bodies have distinct colors",
  );
  const delta = Math.max(
    ...blended.flatMap((pixel, i) =>
      pixel.map((v, channel) => Math.abs(v - (first[i][channel] + second[i][channel]) / 2)),
    ),
  );
  assert.ok(delta < 4, `Overlap blends both patterns uniformly: maximum RGB error ${delta}`);
  await centerOrigin(page);
  await chooseTool(page, "cross section", "cross-section");
  await page.getByRole("button", { name: "Choose section plane", exact: true }).click();
  await chooseWidget(page, "XZ");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const section = (await inspect(page)).crossSection;
  assert.ok(
    section && Math.abs(section.v[2]) === 1,
    "The visible XZ plane cue establishes the cut",
  );
  await chooseTool(page, "clear selection", "selection-clear");
  await regionTint(page, await samples(page));
  await profileTint(page);
  await pseudofaceChoice(page);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await centerOrigin(page);
  await sectionGrid(page);
  await page.keyboard.press("l");
  await drag(page, [-5, 8], [17, 8], ["Shift"]);
  await page.keyboard.press("Escape");
  // The thin stroke's antialiased pixels mix with the surface underneath.
  // Check its contrast against the neighboring surface with and without caps.
  await sketchInkContrast(page, "section cap");
  await chooseTool(page, "hide bodies", "hide-bodies");
  await sketchInkContrast(page, "sketch plane");
  await chooseTool(page, "show bodies", "show-bodies");
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 4", exact: true }).click();
  await orient(page, [1, -1, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-section-overlap.png` });
  console.log(
    `${name}: captured cap blending, sketch grid/ink/tint and owning-body long-press selection passed`,
  );
});

async function centerOrigin(page) {
  // The captured camera can put the world origin behind a dock. Use a real pan
  // to bring the plane cues into the viewport while retaining the captured zoom.
  const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  assert.ok(canvas);
  const origin = await project(page, [0, 0, 0]);
  const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  const start = { x: canvas.x + canvas.width * 0.8, y: center.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(start.x + center.x - origin.x, start.y + center.y - origin.y, { steps: 8 });
  await page.mouse.up({ button: "right" });
  const positioned = await project(page, [0, 0, 0]);
  assert.ok(Math.hypot(positioned.x - center.x, positioned.y - center.y) < 5);
}

async function sketchInkContrast(page, surface) {
  const ink = await samples(page, [15, 0, 8], 3);
  const background = await samples(page, [15, 0, 8.5], 3);
  assert.ok(
    background.slice(0, 3).every((value, i) => value - ink[i] > 30),
    `Sketch ink stays legible over the ${surface}: ${ink} / ${background}`,
  );
}

async function samples(page, point = [15.3, 0, 27.2], size = 1, keepPointer = false) {
  const colors = await pixelPatch(page, point, size, keepPointer);
  return colors.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[0];
}

async function pixelPatch(page, point, size, keepPointer = false) {
  if (!keepPointer) {
    const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
    await page.mouse.move(canvas.x + 16, canvas.y + canvas.height * 0.16);
  }
  const p = await project(page, point);
  const png = await page.screenshot({
    clip: {
      x: Math.round(p.x) - Math.floor(size / 2),
      y: Math.round(p.y) - Math.floor(size / 2),
      width: size,
      height: size,
    },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    return Array.from({ length: image.width * image.height }, (_, i) => [
      ...pixels.slice(i * 4, i * 4 + 3),
    ]);
  }, png.toString("base64"));
}

async function regionTint(page, filled) {
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  const bare = await samples(page);
  assert.ok(filled[0] < bare[0] - 5, `Sketch region tint overlays caps: ${filled} / ${bare}`);
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  assert.deepEqual(await samples(page), filled, "Restoring the sketch restores its cap tint");
}

async function pseudofaceChoice(page) {
  const before = await inspect(page);
  await orient(page, [1, -1, 0.5]);
  const bare = await samples(page);
  // Sample inside the removed half of Body 1, clear of the chooser and section controls.
  const removedPoint = [10, 5, 10];
  const removedBare = await samples(page, removedPoint);
  await hold(page, await project(page, [15.3, 0, 27.2]));
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  const bodies = await panel
    .locator('button[data-kind="body"]')
    .evaluateAll((buttons) => buttons.map((b) => b.dataset.key));
  assert.deepEqual(
    new Set(bodies),
    new Set(before.document.bodies.slice(0, 2).map((b) => b.id)),
    "Every overlapping pseudoface offers its owning body",
  );
  await panel
    .locator(`button[data-kind="body"][data-key="${before.document.bodies[0].id}"]`)
    .hover();
  const highlighted = await samples(page, undefined, 1, true);
  assert.ok(
    highlighted[0] - highlighted[2] > bare[0] - bare[2] + 20,
    `Disambiguation amber overlays section patterns: ${highlighted} / ${bare}`,
  );
  await page.screenshot({ path: ".cache/sketch-review/section-unclipped-choice.png" });
  const removedHighlight = await samples(page, removedPoint, 1, true);
  assert.ok(
    removedHighlight[0] - removedHighlight[2] > removedBare[0] - removedBare[2] + 20,
    `Whole orange body survives on removed side: ${removedHighlight} / ${removedBare}`,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await samples(page, removedPoint), removedBare);
  assert.deepEqual(
    await samples(page),
    bare,
    "Dismissing disambiguation restores section patterns",
  );
  // The body selection opens transform controls near the chooser anchor.
  const tintPoint = [10, 0, 25];
  const tintBare = await samples(page, tintPoint);
  await hold(page, await project(page, [15.3, 0, 27.2]));
  await panel.locator(`button[data-kind="body"][data-key="${bodies[0]}"]`).hover();
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).modelingSelection, [{ kind: "body", body: bodies[0] }]);
  const selected = await samples(page, tintPoint);
  assert.ok(
    selected[2] - selected[0] > tintBare[2] - tintBare[0] + 10,
    `Selected body tints its section pattern blue: ${selected} / ${tintBare}`,
  );
  await chooseTool(page, "clear selection", "selection-clear");
  assert.deepEqual(
    await samples(page, tintPoint),
    tintBare,
    "Deselecting restores the section pattern",
  );
  assert.deepEqual(
    (await inspect(page)).document,
    before.document,
    "Pseudoface selection does not edit geometry",
  );
  await orient(page, [0, -1, 0]);
}

async function profileTint(page) {
  // Sample inside the closed region, clear of the antialiased boundary ink after panning.
  const point = [15, 0, 26.5];
  const base = await pixelPatch(page, point, 13);
  const p = await project(page, point);
  await page.mouse.move(p.x, p.y);
  assert.equal((await inspect(page)).modelingHover, "profile");
  const hovered = await pixelPatch(page, point, 13, true);
  assert.ok(
    hovered.some(([r, , b], i) => r - b > base[i][0] - base[i][2] + 15),
    "Amber hover grid overlays the cap",
  );
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  const selected = await pixelPatch(page, point, 13);
  const blueShift = selected.map(([r, , b], i) => b - r - (base[i][2] - base[i][0]));
  assert.ok(
    Math.min(...blueShift) > 10,
    `Selected hex cells have a blue tint: ${Math.min(...blueShift)} to ${Math.max(...blueShift)}`,
  );
  assert.ok(
    Math.max(...blueShift) - Math.min(...blueShift) > 15,
    "Blue hex lines stand out over the tinted cells",
  );
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).waitFor({ state: "visible" });
  assert.equal((await inspect(page)).interaction?.kind, "extrude");
  const extrusion = await pixelPatch(page, point, 13);
  assert.deepEqual(extrusion, selected, "Extrusion source preserves selection tint over caps");
  await page.keyboard.press("Escape");
  await chooseTool(page, "clear selection", "selection-clear");
}
