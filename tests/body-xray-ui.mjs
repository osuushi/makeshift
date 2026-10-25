import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { lift, prism } from "../.cache/sketch-tests/tests/body-edge-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { closeSettings, settingsSurface } from "./settings-surface.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { continuousCameraRoute } from "./ui-camera-live.mjs";
import { cameraPacingRoute } from "./ui-camera-pacing.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let document;
try {
  await prism(owner, [
    [-25, -25],
    [25, -25],
    [25, 25],
    [-25, 25],
  ]);
  const curves = structuredClone(owner.view.data.sketches[0].curves);
  await lift(owner, { ...emptySketch({ ...planes.XY, origin: [0, 0, -20] }), curves });
  await prism(owner, [
    [-8, -8],
    [8, -8],
    [8, 8],
    [-8, 8],
  ]);
  const rear = owner.view.data.bodies[2];
  const moved = await owner.call({
    kind: "transform-bodies",
    transform: {
      ids: [rear.id],
      pivot: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 0,
      translation: [0, 0, -40],
      duplicate: false,
    },
  });
  assert.equal(moved.error, undefined);
  await owner.call({ kind: "accept" });
  document = {
    ...owner.view.data,
    sketches: [],
    bodyAppearances: owner.view.data.bodies.map((body, i) => ({
      body: body.id,
      color: ["#2677bb", "#bb3322", "#22bb44"][i],
      alpha: 1,
    })),
  };
} finally {
  owner.close();
}

await withUiRuntimes(async (page, name) => {
  await inspect(page);
  await openDocument(page, {
    name: "body-xray.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
  });
  await orient(page, [0, 0, 1]);
  const original = (await inspect(page)).document;
  const [front, middle, rear] = original.bodies;
  const click = async (point) => {
    const p = await project(page, point);
    await page.mouse.click(p.x, p.y);
    return (await inspect(page)).modelingSelection[0];
  };
  const toggle = (n) => page.getByRole("button", { name: `X-ray Body ${n}`, exact: true }).click();
  assert.equal((await click([0, 0, 0])).body, front.id);
  await toggle(1);
  assert.equal((await click([0, 0, 0])).body, middle.id);
  await toggle(2);
  assert.equal((await click([0, 0, 0])).body, rear.id);
  assert.equal((await click([-8, 0, 0])).kind, "edge");
  assert.equal((await inspect(page)).modelingSelection[0].body, rear.id);
  assert.equal((await click([18, 0, 0])).body, front.id, "X-ray layer retains depth picking");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "xray", "body-xray");
  assert.equal(
    await page
      .getByRole("button", { name: "X-ray Body 1", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await toggle(1);
  await page.keyboard.press("Escape");
  await settings(page, { opacity: 0, bleed: 0, radius: 0 });
  const local = await sample(page);
  await settings(page, { sketchOpacity: 15 });
  assert.deepEqual(await sample(page), local, "Sketch opacity does not change body X-ray");
  await settings(page, { global: true });
  const global = await sample(page);
  assert.ok(delta(local[0], global[0]) < 3, "Whole rear body is revealed inside its silhouette");
  assert.ok(delta(local[1], global[1]) > 10, "Outside body mask retains enclosing body");
  await settings(page, { global: false, bleed: 0, radius: 40 });
  const soft = await sample(page);
  assert.ok(
    delta(soft[1], local[1]) > 2 && delta(soft[1], global[1]) > 2,
    "Fuzzy halo softens whole-body aperture",
  );
  await settings(page, { radius: 0, bleed: 30 });
  const bleed = await sample(page);
  assert.ok(delta(bleed[1], global[1]) < 3, "Bleed expands the whole-body mask");
  await settings(page, { global: true, opacity: 100 });
  const opaque = await sample(page);
  assert.ok(delta(opaque[0], global[0]) > 10, "Front opacity is honored");
  await settings(page, { opacity: 50 });
  const half = await sample(page);
  const expected = opaque[0].map((value, i) => (value + global[0][i]) / 2);
  assert.ok(delta(half[0], expected) < 4, "Multiple x-ray bodies blend once as one layer");
  await page.setViewportSize({ width: 1100, height: 760 });
  const resized = await sample(page);
  assert.ok(delta(resized[0], half[0]) < 4, "Resize rebuilds the body captures");
  await settings(page, { global: false, opacity: 35, bleed: 20, radius: 35 });
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-xray.png` });
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "X-ray does not mutate accepted geometry",
  );
  console.log(
    `${name}: body X-ray controls, layer picking, silhouette, halo, bleed and opacity passed`,
  );
  await cameraPacingRoute(page, name);
  await continuousCameraRoute(page, name);
});

async function settings(page, values) {
  await page.getByRole("button", { name: "Application settings" }).click();
  const pane = await settingsSurface(page, "View");
  if (values.global !== undefined)
    await pane.getByRole("checkbox", { name: "Global X-ray vision" }).setChecked(values.global);
  for (const [key, label] of [
    ["opacity", "Body X-ray opacity"],
    ["sketchOpacity", "X-ray front opacity"],
    ["bleed", "Bleed"],
    ["radius", "Radius"],
  ]) {
    if (values[key] === undefined) continue;
    const slider = pane.getByRole("slider", { name: label, exact: true });
    await slider.press("Home");
    for (let i = 0; i < values[key]; i++) await slider.press("ArrowRight");
  }
  if (values.opacity === 35) {
    await pane.getByRole("button", { name: "Reset grid display", exact: true }).click();
    assert.equal(
      await pane.getByRole("slider", { name: "Body X-ray opacity", exact: true }).inputValue(),
      "35",
    );
    assert.equal(
      await pane.getByRole("slider", { name: "X-ray front opacity", exact: true }).inputValue(),
      "15",
    );
    assert.equal(
      await pane
        .page()
        .evaluate(() => JSON.parse(localStorage.getItem("makeshift.view-display")).bodyXrayOpacity),
      0.35,
    );
    await pane.screenshot({ path: ".cache/sketch-review/body-xray-settings.png" });
  }
  await closeSettings(pane);
}
async function sample(page) {
  await page.mouse.move(1100, 80);
  // Stay opposite the origin label and away from the coordinate axes at both sizes.
  const points = await Promise.all(
    [
      [-2.35, -3.37, 0],
      [8.7, -3.37, 0],
    ].map((p) => project(page, p)),
  );
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
function delta(a, b) {
  return Math.max(...a.map((value, i) => Math.abs(value - b[i])));
}
