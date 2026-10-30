import assert from "node:assert/strict";
import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { exportDocument, launchElectron, openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { previewReady } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";

// CPU geometry checks cannot catch worker/compositor occlusion: the old flat can
// hide grooves, while ignoring the whole flat exposes the thread's far side.
async function tealAt(page, world) {
  const point = await project(page, world);
  const png = await page.screenshot({
    clip: {
      x: Math.round(point.x) - 3,
      y: Math.round(point.y) - 3,
      width: 6,
      height: 6,
    },
  });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 6;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 6, 6).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 1] - pixels[i] > 25 && pixels[i + 2] - pixels[i] > 20) count++;
    return count;
  }, png.toString("base64"));
}

const { document } = JSON.parse(await readFile("tests/fixtures/thread-flat-boundary.json", "utf8"));
await mkdir(".cache/sketch-review", { recursive: true });
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 850 });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await openDocument(page, {
    name: "thread-flat-boundary.makeshift",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
  });
  await previewReady(page);
  await orient(page, [-Math.SQRT1_2, 0, -Math.SQRT1_2]);
  await page.mouse.move(100, 70);
  await page.screenshot({ path: ".cache/sketch-review/thread-flat-preview.png" });
  const frame = document.decorators[0].frame;
  const axis = [-Math.SQRT1_2, 0, Math.SQRT1_2];
  const z = 1.5 * (Math.atan2(4, 3) / (2 * Math.PI) + 0.5);
  const pointOnFlat = (y) =>
    frame.origin.map((n, i) => n + 4 * frame.v[i] + y * frame.u[i] + z * axis[i]);
  const groove = await tealAt(page, pointOnFlat(3));
  const center = await tealAt(page, pointOnFlat(0));
  assert.ok(groove > 0, `Groove visible through original flat: ${groove}`);
  assert.equal(center, 0, "The solid center of the flat hides the thread's far side");
  const point = await project(page, pointOnFlat(3));
  await page.mouse.click(point.x, point.y);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    "5f0f6107-e957-4888-87c7-2bc04ee5bceb",
  );
  await page.keyboard.press("Escape");
  const path = resolve(".cache/sketch-review/thread-flat-fixed.3mf");
  await exportDocument(page, "3mf", path);
  assert.ok((await stat(path)).size > 10000);
  const hole = JSON.parse(await readFile("tests/fixtures/thread-open-hole.json", "utf8")).document;
  await openDocument(page, {
    name: "thread-open-hole.makeshift",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document: hole })),
  });
  await previewReady(page);
  for (let index = 1; index <= 3; index++)
    await page.getByRole("button", { name: `Hide Sketch ${index}`, exact: true }).click();
  await orient(page, [0, -0.15, -1]);
  await worldClick(page, [0, -4, 3.5]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    "c4483f26-d217-41bd-ab44-b86dce55fd07",
  );
  const cut = page.getByRole("combobox", { name: "Cut into", exact: true });
  await cut.selectOption("hole");
  await inspect(page);
  await previewReady(page);
  assert.equal(
    await page.getByRole("button", { name: "Show affected faces", exact: true }).count(),
    0,
  );
  await page.mouse.move(100, 70);
  await page.screenshot({ path: ".cache/sketch-review/thread-hole-body-cut.png" });
  const holeGroove = await tealAt(page, [4.3, -4.75, 0]);
  const holeFlat = await tealAt(page, [6, -4.75, 0]);
  assert.ok(holeGroove > 0, `Hole groove visible through original flat: ${holeGroove}`);
  assert.equal(holeFlat, 0, "Remaining flat material hides the far side of the hole");
  await page.screenshot({ path: ".cache/sketch-review/thread-hole-body-cut.png" });
  await worldClick(page, [4.3, -4.75, 0]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    "51f05e36-1b23-43fc-b7e5-4129376daf51",
  );
  const holePath = resolve(".cache/sketch-review/thread-hole-body-cut.3mf");
  await exportDocument(page, "3mf", holePath);
  assert.ok((await stat(holePath)).size > 10000);
  console.log(
    "Captured hole: body-wide groove/flat occlusion, no warning, original picking and native export passed",
    { holeGroove, holeFlat },
  );
  assert.deepEqual(errors, []);
  console.log(
    "Captured rod: groove/flat occlusion, original flat picking and native 3MF export passed.",
    { groove, center },
  );
} finally {
  await app.close();
}
