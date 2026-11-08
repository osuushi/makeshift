import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { sectionFaceSketch } from "./ui-section-face-sketch.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixtures = ["section-tangent-body", "section-top-ledge"];
for (const fixtureName of fixtures) {
  const fixture = JSON.parse(await readFile(`tests/fixtures/${fixtureName}.json`, "utf8"));
  const top = fixtureName === "section-top-ledge";

  // Escaped GPU boundary: clip padding kept a removed body's planar face and rim.
  // Native tests cannot verify that the actual body/cap passes stop painting it.
  await withUiRuntimes(async (page, name) => {
    await openDocument(page, {
      name: "section-tangent.makeshift",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    const original = (await inspect(page)).document;
    await orient(page, [0, -1, top ? 0.35 : -0.35]);
    const point = await project(page, [20, -5, top ? 1 : -1]);
    await page.mouse.click(point.x, point.y);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    await chooseTool(page, "cross section", "cross-section");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await chooseTool(page, "clear selection", "selection-clear");
    await page.getByRole("button", { name: "Flip side", exact: true }).click();
    const cut = await inspect(page);
    assert.equal(JSON.stringify(cut.crossSection), JSON.stringify(fixture.frame));
    await page.mouse.move(1100, 80);
    const cutPixel = await sample(page, point);
    await chooseTool(page, "hide bodies", "hide-bodies");
    const background = await sample(page, point);
    assert.deepEqual(cutPixel, background, "Removed planar remnant paints no surface or cap");
    await chooseTool(page, "show bodies", "show-bodies");
    await page.mouse.click(point.x, point.y);
    assert.deepEqual(
      (await inspect(page)).modelingSelection,
      [],
      "Removed face cannot be selected",
    );
    await page.mouse.move(1100, 80);
    await page.screenshot({ path: `.cache/sketch-review/${name}-${fixtureName}.png` });
    await page.getByRole("button", { name: "Adjust section", exact: true }).click();
    await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Plane translation Z", exact: true })
      .fill(top ? "-0.01" : "0.01");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.ok(
      (await sample(page, point)).some((value, i) => Math.abs(value - background[i]) > 20),
      "Moving into real material restores the thin slice",
    );
    await page.getByRole("button", { name: "Adjust section", exact: true }).click();
    await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Plane translation Z", exact: true })
      .fill(top ? "0.01" : "-0.01");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.deepEqual(
      await sample(page, point),
      background,
      "Returning to tangency hides the remnant again",
    );
    await page.getByRole("button", { name: "Flip side", exact: true }).click();
    const restored = await sample(page, point);
    assert.ok(
      restored.some((value, i) => Math.abs(value - background[i]) > 20),
      "Flip restores material",
    );
    await page.getByRole("button", { name: "Turn off section", exact: true }).click();
    await page.mouse.click(point.x, point.y);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    assert.deepEqual((await inspect(page)).document, original);
    if (top) await sectionFaceSketch(page);
    console.log(
      `${name}: captured tangent surface disappears, cannot be picked and restores on Flip/Off`,
    );
  });
}

async function sample(page, point) {
  const png = await page.screenshot({
    clip: { x: Math.round(point.x) - 3, y: Math.round(point.y) - 3, width: 6, height: 6 },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 6;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 6, 6).data];
  }, png.toString("base64"));
}
