import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { at, click, inspect, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Targeted performance acceptance, outside the automatic UI inventory. The unit
// regression guards unrelated geometry evaluation; this route measures real gestures
// and proves the captured sketch still draws, selects, moves and accepts normally.
async function timedDrag(page, from, to, suppressAttachment) {
  const a = await at(page, ...from),
    b = await at(page, ...to);
  const started = performance.now();
  if (suppressAttachment === "gesture") await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (suppressAttachment === "target") await page.keyboard.down("Shift");
  await page.mouse.move(b.x, b.y, { steps: 20 });
  await page.mouse.up();
  if (suppressAttachment) await page.keyboard.up("Shift");
  await settled(page);
  return Math.round(performance.now() - started);
}

async function route(page, name) {
  const fixture = JSON.parse(
    await readFile(new URL("fixtures/populated-sketch.json", import.meta.url), "utf8"),
  );
  await openDocument(page, {
    name: "populated-sketch.makeshift",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, ...fixture })),
  });
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const original = (await inspect(page)).document.sketches[0];
  assert.equal(original.curves.length, 95);
  await page.keyboard.press("r");
  // The dense capture contains alignment targets near these coordinates. Shift
  // deliberately leaves the new geometry independent for exact movement checks.
  const rectangleMs = await timedDrag(page, [-25, -25], [-15, -15], "gesture");
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 99);
  const group = sketch.groups.at(-1);
  const corner = () => sketch.curves.find((curve) => curve.id === group.members[0]).a;
  assert.deepEqual(corner(), { x: -25, y: -25 });
  await page.keyboard.press("Escape");
  await click(page, -20, -20);
  const moveMs = await timedDrag(page, [-20, -20], [-22, -22]);
  sketch = (await inspect(page)).document.sketches[0];
  assert.ok(Math.hypot(corner().x + 27, corner().y + 27) < 1e-6);
  await page.keyboard.press("Escape");
  await chooseTool(page, "Line", "line");
  const lineMs = await timedDrag(page, [-25, -8], [-15, -2], "gesture");
  sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 100);
  const line = sketch.curves.at(-1);
  assert.equal(line.kind, "segment");
  assert.deepEqual(line.a, { x: -25, y: -8 });
  assert.deepEqual(line.b, { x: -15, y: -2 });
  assert.deepEqual(sketch.curves.slice(0, 95), original.curves);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 99);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 100);
  await page.keyboard.press("v");
  await click(page, -15, -2);
  assert.equal((await inspect(page)).selectionTargets[0].kind, "endpoint");
  const pointMs = await timedDrag(page, [-15, -2], [-17, -4], "target");
  sketch = (await inspect(page)).document.sketches[0];
  const edited = sketch.curves.find((curve) => curve.id === line.id);
  assert.deepEqual(edited.a, line.a);
  assert.ok(Math.hypot(edited.b.x + 17, edited.b.y + 4) < 1e-6);
  await page.screenshot({ path: `.cache/sketch-review/${name}-populated-sketch.png` });
  console.log(
    `${name}: rectangle ${rectangleMs} ms, line ${lineMs} ms, selected move ${moveMs} ms, endpoint ${pointMs} ms`,
  );
}

await withUiRuntimes(route, { timeout: 30000 });
