import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Reduced from bug-2026-11-16T19-52-04-119Z-1e75a8c2: retain the camera and
// coplanar XZ section. The model is irrelevant to the escaped GPU clipping error.
export async function sectionPlaneHover(page) {
  await openDocument(page, {
    name: "section-plane-hover.makeshift",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        document: {
          units: "mm",
          sketches: [
            {
              id: "source",
              plane: { origin: [0, 0, -110], u: [1, 0, 0], v: [0, 1, 0] },
              curves: [
                {
                  id: "circle",
                  kind: "circle",
                  construction: false,
                  center: { x: 0, y: 0 },
                  radius: 12,
                },
              ],
              constraints: [],
              groups: [],
            },
          ],
        },
        camera: {
          position: [-29.06021428330922, 847.9476743947025, 466.87879129886176],
          up: [0, 0.5673312355795961, -0.8234896897567867],
          target: [-29.06021428330922, 15.635526074326446, -106.53054869417176],
          height: 95.9253081038859,
        },
      }),
    ),
  });
  // Opening a saved camera retains plane hysteresis from the initial view.
  // Match the recording's visible XZ plane through the existing setting.
  await page.getByLabel("Plane switch angle", { exact: true }).evaluate((input) => {
    input.value = "45";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await chooseTool(page, "cross section", "cross-section");
  await page.mouse.click(400, 400);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.deepEqual((await inspect(page)).crossSection, {
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
  });
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "project", "project");
  await page.getByRole("button", { name: "Application settings" }).hover();
  const before = await inspect(page);
  const baseline = await pixels(page);
  await page.mouse.move(400, 400);
  const highlighted = await pixels(page);
  let gaps = 0;
  for (let i = 0; i < baseline.length; i += 4) if (baseline[i] - highlighted[i] < 30) gaps++;
  assert.equal(gaps, 0, "Every coplanar hover pixel is filled, without clipped stripes");
  await page.getByRole("button", { name: "Application settings" }).hover();
  assert.deepEqual(await pixels(page), baseline, "Leaving clears the entire reference highlight");
  assert.deepEqual((await inspect(page)).document, before.document);
  await page.keyboard.press("Escape");
  console.log("Coplanar projection hover: 90,000 pixels filled and cleared without geometry edits");
}

async function pixels(page) {
  // The document-page proxy's screenshot route captures a fresh on-demand frame.
  const png = await page.screenshot();
  return page.evaluate(async (data) => {
    const source = document.querySelector("canvas");
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = source.clientWidth;
    canvas.height = source.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return Array.from(ctx.getImageData(300, 250, 300, 300).data);
  }, png.toString("base64"));
}
