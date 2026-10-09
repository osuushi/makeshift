import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { failureContext } from "./ui-failure-context.mjs";
import { installProfilePickTrace } from "./ui-profile-pick-trace.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";

export function runtimeNames(
  allowed = ["chromium", "webkit", "electron"],
  defaults = allowed.includes("electron") ? ["electron"] : [allowed[0]],
) {
  const requested = process.env.MAKESHIFT_TEST_BROWSER;
  if (requested && !allowed.includes(requested))
    throw new Error(
      `Unsupported MAKESHIFT_TEST_BROWSER: ${requested}. Choose ${allowed.join(", ")}.`,
    );
  assert.ok(allowed.length, "A UI route must declare at least one supported runtime");
  assert.ok(
    defaults.length && defaults.every((name) => allowed.includes(name)),
    "UI defaults must be supported and nonempty",
  );
  // An ordinary invocation exercises one runtime. Cross-browser sweeps are explicit.
  return requested ? [requested] : [defaults.includes("electron") ? "electron" : defaults[0]];
}

/** Own the server, browser/app, isolated Electron profile and page for each route. */
export async function withUiRuntimes(
  route,
  {
    allowed,
    defaults,
    viewport = { width: 1280, height: 850 },
    timeout = 12000,
    hasTouch = false,
    deviceScaleFactor = 1,
  } = {},
) {
  const names = runtimeNames(allowed, defaults);
  await mkdir(".cache/sketch-review", { recursive: true });
  const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
  try {
    await server.listen();
    for (const name of names) {
      let browser, app;
      try {
        let page;
        if (name === "electron") {
          app = await launchElectron({
            args: ["."],
            env: {
              ...process.env,
              MAKESHIFT_TEST_HIDDEN: "1",
              MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
            },
          });
          page = await app.firstWindow();
          // Hidden windows can be clamped to the runner's display. Match the
          // browser viewport so adaptive grid spacing and pointer routes agree.
          await page.setViewportSize(viewport);
          assert.equal(
            await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
            false,
          );
        } else {
          browser = await { chromium, webkit }[name].launch({ headless: true });
          page = await browser.newPage({ viewport, hasTouch, deviceScaleFactor });
          await installTestFrames(page);
          await page.goto(server.resolvedUrls.local[0]);
        }
        page.setDefaultTimeout(timeout);
        const errors = [];
        page.on("dialog", (dialog) =>
          dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
        );
        page.on("console", (message) => {
          if (message.type() === "error") console.error(`${name}: ${message.text()}`);
        });
        page.on("pageerror", (error) => {
          errors.push(error.message);
          console.error(`${name}: renderer error`, error);
        });
        await page.waitForFunction(() => Boolean(window.makeshiftInspect));
        await installProfilePickTrace(page);
        try {
          await route(page, name);
          assert.deepEqual(errors, []);
        } catch (error) {
          console.error(`${name}: UI route failed`, error);
          console.error(
            `${name}: UI failure context`,
            JSON.stringify(await failureContext(page, errors), null, 2),
          );
          throw error;
        }
      } finally {
        await browser?.close();
        await app?.close();
      }
    }
  } finally {
    await server.close();
  }
}
