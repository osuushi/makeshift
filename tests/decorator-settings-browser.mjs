import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { port: 0, watch: null, hmr: false },
});
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.resolvedUrls.local[0]}tests/preview-empty.html`);
      await page.evaluate(async () => {
        const { decoratorSettings } = await import("/src/preferences/decorator-settings.ts");
        document.body.append(decoratorSettings());
      });
      const mode = page.getByRole("combobox", { name: "Decorator preview detail" });
      await mode.selectOption("color-only");
      const opacity = page.getByRole("slider", { name: "Threads preview opacity" });
      await opacity.press("Home");
      let value = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("makeshift.decorator-display")),
      );
      assert.equal(value.types.threads.opacity, 0.2);
      await opacity.press("End");
      const color = page.getByRole("textbox", { name: "Threads preview hex color" });
      await color.fill("#a43d71");
      await color.press("Tab");
      value = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("makeshift.decorator-display")),
      );
      assert.equal(value.mode, "color-only");
      assert.equal(value.types.threads.color, "#a43d71");
      assert.equal(value.types.threads.opacity, 1);
      await color.fill("bad color");
      await color.press("Tab");
      assert.equal(await color.inputValue(), "#a43d71");
      await page.getByRole("button", { name: "Reset decorator display" }).click();
      assert.equal(await mode.inputValue(), "detailed");
      assert.equal(await opacity.inputValue(), "78");
      console.log(`${name}: real preference keyboard/color/slider and reset controls passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
