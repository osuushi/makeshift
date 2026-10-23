import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { settingsSurface } from "./settings-surface.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseWidget } from "./ui-modal-plane-widgets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { emptyXrayRoute } from "./ui-xray-empty.mjs";
import { assertCachedXrayWork } from "./ui-xray-work.mjs";

// Captured twisted body with only its circle sketch visible: the body extends well
// outside sketch contents. GPU samples prove the aperture, rather than just mask math.
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/section-distant-camera.makeshift", import.meta.url), "utf8"),
);
fixture.document.sketches[1].curves = fixture.document.sketches[1].curves.filter(
  (c) => c.kind === "circle",
);
fixture.document.sketches[1].constraints = [];
const probes = [
  [-8, 0, 10],
  [12, 0, 25],
  [8.4, 0, 25],
];
await withUiRuntimes(async (page, name) => {
  let preferences;
  await prepareXray(page, name);
  const original = (await inspect(page)).document;
  const normal = await samples(page);
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  preferences = await settings(page);
  await assertDefaults(page);
  await preferences.getByRole("checkbox", { name: "Global X-ray vision" }).check();
  await preferences.getByRole("slider", { name: "X-ray front opacity", exact: true }).press("Home");
  assert.equal(
    await preferences.getByRole("slider", { name: "Bleed", exact: true }).isDisabled(),
    true,
  );
  await preferences.getByRole("button", { name: "Done", exact: true }).click();
  const global = await samples(page);
  assert.ok(delta(global[0], normal[0]) > 10, "Global X-ray cuts away from sketch contents");
  preferences = await settings(page);
  await preferences.getByRole("checkbox", { name: "Global X-ray vision" }).uncheck();
  await preferences.getByRole("slider", { name: "Bleed", exact: true }).press("Home");
  await preferences.getByRole("slider", { name: "Radius", exact: true }).press("Home");
  await preferences.getByRole("button", { name: "Done", exact: true }).click();
  const local = await samples(page);
  await assertCachedXrayWork(page);
  console.log(name, { normal, global, local });
  assert.ok(delta(local[0], normal[0]) <= 2, "Outside aperture retains ordinary body");
  assert.ok(delta(local[1], global[1]) <= 2, "Inside sketch contents retains full X-ray cut");
  assert.ok(delta(local[2], normal[2]) <= 2, "Zero bleed leaves nearby exterior opaque");
  preferences = await settings(page);
  await slider(page, "Bleed", 20);
  await preferences.getByRole("button", { name: "Done", exact: true }).click();
  const expanded = await samples(page);
  assert.ok(delta(expanded[2], global[2]) <= 2, "Bleed dilates the content mask in screen pixels");
  preferences = await settings(page);
  await slider(page, "Bleed", 0);
  await slider(page, "Radius", 40);
  await preferences.getByRole("button", { name: "Done", exact: true }).click();
  const softened = await samples(page);
  assert.ok(
    delta(softened[2], normal[2]) > 2 && delta(softened[2], global[2]) > 2,
    "Radius blends the aperture edge",
  );
  await coarseMask(page, normal, global);
  await resizeAndPinch(page, normal, name);
  await chooseTool(page, "cross section", "cross-section");
  await chooseWidget(page, "XZ");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const explicit = await samples(page);
  assert.ok(
    delta(explicit[0], normal[0]) > 10,
    "Explicit Cross section stays global with local X-ray preferences",
  );
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: X-ray content aperture, bleed, blur, resize/pinch, exterior picking and explicit global cut passed`,
  );
});

async function resizeAndPinch(page, normal, name) {
  await page.setViewportSize({ width: 1100, height: 760 });
  const resized = await samples(page);
  assert.ok(delta(resized[0], normal[0]) < 6, "Resize keeps exterior opaque");
  const height = (await inspect(page)).camera.height;
  await page.mouse.move(950, 600);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -12);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height !== height,
    height,
  );
  // Pinch completion levels the captured camera after wheel input goes idle.
  // Project and pick only after that navigation intent and animation finish.
  await page.waitForFunction(() => {
    const camera = window.makeshiftInspect().camera;
    return !camera.navigationPending && !camera.moving;
  });
  const zoomed = await samples(page);
  assert.ok(
    delta(zoomed[0], normal[0]) < 6,
    "Pinch zoom retains opaque geometry outside the rebuilt mask",
  );
  const outside = await project(page, probes[0]);
  await page.mouse.move(outside.x, outside.y);
  assert.equal(
    (await inspect(page)).modelingHover,
    "face",
    "Outside aperture picks the normal front face",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-xray-vision.png` });
}

async function assertDefaults(page) {
  assert.equal(
    await (await settingsSurface(page, "View"))
      .getByRole("checkbox", { name: "Global X-ray vision" })
      .isChecked(),
    false,
  );
  for (const [name, value] of [
    ["X-ray front opacity", "80"],
    ["Bleed", "100"],
    ["Radius", "50"],
  ]) {
    assert.equal(
      await (await settingsSurface(page, "View"))
        .getByRole("slider", { name, exact: true })
        .inputValue(),
      value,
    );
  }
}
function delta(a, b) {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}
async function settings(page) {
  await page.getByRole("button", { name: "Application settings" }).click();
  return settingsSurface(page, "View");
}
async function slider(page, name, value) {
  const input = (await settingsSurface(page, "View")).getByRole("slider", { name, exact: true });
  await input.press("Home");
  for (let i = 0; i < value; i++) await input.press("ArrowRight");
}
async function samples(page) {
  await page.mouse.move(1050, 80);
  await inspect(page);
  const points = await Promise.all(probes.map((p) => project(page, p)));
  const png = await page.screenshot();
  return page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return points.map((p) =>
        [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data].slice(0, 3),
      );
    },
    { data: png.toString("base64"), points },
  );
}

async function coarseMask(page, normal, global) {
  await settings(page);
  await slider(page, "Bleed", 16);
  await slider(page, "Radius", 16);
  await (await settingsSurface(page, "View"))
    .getByRole("button", { name: "Done", exact: true })
    .click();
  const coarse = await samples(page);
  await assertCachedXrayWork(page, 8);
  assert.ok(delta(coarse[0], normal[0]) < 6, "Coarse mask retains opaque exterior");
  assert.ok(delta(coarse[1], global[1]) < 6, "Coarse mask retains cut interior");
}

async function prepareXray(page, name) {
  await emptyXrayRoute(page, name);
  await openDocument(page, {
    name: "xray.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
}
