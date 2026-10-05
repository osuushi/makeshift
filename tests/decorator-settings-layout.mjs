import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { uiScaleCss } from "../scripts/ui-scale-css.ts";
import { runtimeNames } from "./ui-runtime.mjs";

// Native-free layout check; geometry acceptance runs in decorator-display-ui.mjs.
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  css: { postcss: { plugins: [uiScaleCss()] } },
  server: { port: 0, watch: null, hmr: false },
});
await server.listen();
try {
  for (const name of runtimeNames(["chromium", "webkit"])) {
    const engine = { chromium, webkit }[name];
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.resolvedUrls.local[0]}tests/preview-empty.html`);
      await page.evaluate(async () => {
        await import("/src/sketch/style.css");
        const { installSettings } = await import("/src/preferences/settings.ts");
        document.body.innerHTML = "<main><header></header></main>";
        installSettings(
          {
            blocked: false,
            interactions: { current: null },
            world: { changed: new Set(), draw() {} },
          },
          document.querySelector("main"),
        );
      });
      for (const width of [390, 820]) {
        await page.setViewportSize({ width, height: 650 });
        for (const scale of [0.8, 1.5]) {
          await page.getByRole("button", { name: "Application settings" }).click();
          const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
          await dialog
            .getByRole("combobox", { name: "User interface scale" })
            .selectOption(String(scale));
          const layout = await dialog.evaluate((element) => ({
            width: element.clientWidth,
            scroll: element.scrollWidth,
            controls: [...element.querySelectorAll("label,input,select")].map((control) => ({
              label: control.getAttribute("aria-label") ?? control.textContent,
              x: control.getBoundingClientRect().x,
              width: control.getBoundingClientRect().width,
            })),
          }));
          assert.ok(layout.scroll <= layout.width, JSON.stringify({ name, width, scale, layout }));
          for (const label of ["Threads preview hex color", "Custom preview opacity"]) {
            const control = dialog.getByLabel(label);
            await control.scrollIntoViewIfNeeded();
            const bounds = await control.boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
            assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 650);
          }
          await dialog.getByRole("button", { name: "Done", exact: true }).click();
        }
      }
      console.log(`${name}: expanded shared Settings reachable at 390/820px and 80/150%`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
