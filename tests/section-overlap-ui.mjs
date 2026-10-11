import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { chooseWidget } from "./ui-modal-plane-widgets.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder capture: four bodies hashed to blue and their coplanar caps fought for depth.
// Screenshot samples verify actual GPU blending and sketch ink preservation.
await withUiRuntimes(async (page, name) => {
  await openDocument(page, resolve("tests/fixtures/section-overlap.makeshift"));
  await inspect(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("slider", { name: "Section front opacity", exact: true }).press("Home");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await orient(page, [0, -1, 0]);
  await page.getByRole("button", { name: "Hide Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 4", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
  const first = await samples(page);
  await page.getByRole("button", { name: "Show Body 2", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  const second = await samples(page);
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  const blended = await samples(page);
  assert.ok(
    first.some((v, i) => Math.abs(v - second[i]) > 20),
    "Bodies have distinct colors",
  );
  const delta = Math.max(...blended.map((v, i) => Math.abs(v - (first[i] + second[i]) / 2)));
  assert.ok(delta < 4, `Overlap blends both patterns uniformly: maximum RGB error ${delta}`);
  await chooseTool(page, "cross section", "cross-section");
  await chooseWidget(page, "XZ");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await chooseTool(page, "clear selection", "selection-clear");
  await regionTint(page, await samples(page));
  await profileTint(page);
  await pseudofaceChoice(page);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [-5, 8], [17, 8], ["Shift"]);
  await page.keyboard.press("Escape");
  const ink = await samples(page, [15, 0, 8], 3);
  await chooseTool(page, "hide bodies", "hide-bodies");
  const unobscured = await samples(page, [15, 0, 8], 3);
  assert.deepEqual(ink, unobscured, "Caps preserve sketch ink on their plane");
  await chooseTool(page, "show bodies", "show-bodies");
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 4", exact: true }).click();
  await orient(page, [1, -1, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-section-overlap.png` });
  console.log(
    `${name}: captured cap blending, sketch ink/tint and owning-body long-press selection passed`,
  );
});

async function samples(page, point = [15.3, 0, 27.2], size = 1, keepPointer = false) {
  if (!keepPointer) await page.mouse.move(1100, 80);
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
    const colors = Array.from({ length: image.width * image.height }, (_, i) => [
      ...pixels.slice(i * 4, i * 4 + 3),
    ]);
    return colors.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[0];
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
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Hide Sketch 2", exact: true }).click();
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
  await panel.locator(`button[data-kind="body"][data-key="${bodies[0]}"]`).hover();
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).modelingSelection, [{ kind: "body", body: bodies[0] }]);
  assert.deepEqual(
    (await inspect(page)).document,
    before.document,
    "Pseudoface selection does not edit geometry",
  );
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Show Sketch 2", exact: true }).click();
}

async function profileTint(page) {
  const point = [15.3, 0, 27.2];
  const base = await samples(page, point);
  const p = await project(page, point);
  await page.mouse.move(p.x, p.y);
  assert.equal((await inspect(page)).modelingHover, "profile");
  const hovered = await samples(page, point, 1, true);
  assert.ok(
    hovered[2] < base[2] - 15 && hovered[0] - hovered[2] > base[0] - base[2] + 15,
    `Amber hover overlays cap: ${hovered} / ${base}`,
  );
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  const selected = await samples(page, point);
  assert.ok(selected[0] < base[0] - 15, `Blue selection overlays cap: ${selected} / ${base}`);
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).waitFor({ state: "visible" });
  assert.equal((await inspect(page)).interaction?.kind, "extrude");
  const extrusion = await samples(page, point);
  assert.deepEqual(extrusion, selected, "Extrusion source preserves selection tint over caps");
  await page.keyboard.press("Escape");
  await chooseTool(page, "clear selection", "selection-clear");
}
