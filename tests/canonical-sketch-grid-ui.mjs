import assert from "node:assert/strict";
import { inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await reset(page);
  for (const id of ["XY", "XZ", "YZ"]) {
    await chooseTool(page, `Sketch on ${id}`, `sketch-${id.toLowerCase()}`);
    await settled(page);
    assert.equal((await inspect(page)).activePlane, id);
    const counts = await page.evaluate(async () => {
      const image = new Image();
      image.src = document.querySelector("canvas").toDataURL();
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts = { XY: 0, XZ: 0, YZ: 0 };
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i],
          g = pixels[i + 1],
          b = pixels[i + 2];
        if (r > b + 15 && g > b + 10) counts.XY++;
        if (g > r + 10 && g > b + 10) counts.XZ++;
        if (r > g + 15 && b > g + 15) counts.YZ++;
      }
      return counts;
    });
    assert.ok(
      counts[id] > 3000,
      `${id} sketch grid renders its palette color (${counts[id]} pixels)`,
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-${id}-sketch-grid.png` });
    await chooseTool(page, "return to modeling", "modeling");
  }
  console.log(`${name}: XY/XZ/YZ sketch entry renders the canonical grid palette colors`);
});
