import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";

// With no bodies, normal and X-ray presentations must be identical everywhere.
// Camera/grid freshness is a GPU integration property, independent of mask math.
export async function emptyXrayRoute(page, name) {
  await reset(page);
  const target = await findRaycastPoint(page, "XY");
  await page.mouse.dblclick(target.x, target.y);
  assert.equal((await inspect(page)).activePlane, "XY");
  await sameGrid(page, "Empty XY workspace");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [12, 0]);
  await page.keyboard.press("Escape");
  const document = (await inspect(page)).document;
  assert.equal(document.bodies?.length ?? 0, 0);
  assert.equal(document.sketches[0].curves[0].kind, "circle");
  await sameGrid(page, "Circle without bodies");
  await page.screenshot({ path: `.cache/sketch-review/${name}-xray-empty.png` });
}

async function sameGrid(page, label) {
  const local = await image(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("checkbox", { name: "Global X-ray vision" }).check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const global = await image(page);
  const difference = await page.evaluate(
    async ({ local, global }) => {
      const decode = async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0);
        return context.getImageData(350, 220, 800, 480).data;
      };
      const a = await decode(local),
        b = await decode(global);
      let different = 0;
      for (let i = 0; i < a.length; i += 4)
        if (Math.max(...[0, 1, 2].map((j) => Math.abs(a[i + j] - b[i + j]))) > 3) different++;
      return different;
    },
    { local, global },
  );
  assert.ok(difference < 20, `${label}: local/global grid differs at ${difference} pixels`);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("checkbox", { name: "Global X-ray vision" }).uncheck();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

async function image(page) {
  await page.mouse.move(1100, 80);
  await inspect(page);
  return (await page.screenshot({ scale: "css" })).toString("base64");
}
