import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { AgentProcess } from "../.build/host/host/agent-process.js";
import { agentMenuRoute } from "./agent-menu.mjs";
import { agentTouchRoute, observeAgentTerminal } from "./agent-touch.mjs";
import { corners, drag, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Browser rendering acceptance against a real PTY; Electron tests own the production bridge.
const root = await mkdtemp(join(tmpdir(), "makeshift-agent-web-"));
const pty = new AgentProcess();
let preferences = { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} };
const server = await createServer({
  server: { port: 0 },
  plugins: [
    {
      name: "agent-acceptance-host",
      configureServer(server) {
        server.middlewares.use("/__agent-test", async (req, res) => {
          try {
            const chunks = [];
            for await (const data of req) chunks.push(data);
            const request = JSON.parse(Buffer.concat(chunks).toString());
            let output = "";
            if (request.kind === "start")
              pty.start(
                preferences.executable,
                preferences.args,
                root,
                { TERM: "xterm-256color", PATH: "/usr/bin:/bin" },
                request.cols,
                request.rows,
              );
            if (request.kind === "write") pty.write(request.data);
            if (request.kind === "resize") pty.resize(request.cols, request.rows);
            if (request.kind === "read") {
              if (request.wait) await pty.waitForOutput();
              output = pty.read();
            }
            if (request.kind === "stop") await pty.stop();
            if (request.kind === "configure") preferences = request.preferences;
            res.end(
              JSON.stringify({
                ...pty.status,
                workspace: root,
                output,
                preferences,
                stateDirectory: root,
              }),
            );
          } catch (error) {
            res.end(JSON.stringify({ ...pty.status, workspace: root, error: String(error) }));
          }
        });
      },
    },
  ],
});
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        hasTouch: true,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.makeshiftAgent = {
          request: async (request) =>
            (
              await fetch("/__agent-test", { method: "POST", body: JSON.stringify(request) })
            ).json(),
        };
      });
      await page.goto(server.resolvedUrls.local[0]);
      await observeAgentTerminal(page);
      await page.getByRole("button", { name: "Open agent terminal" }).click();
      await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
      await agentTouchRoute(page, name);
      const input = page.locator(".agent-screen textarea");
      await input.focus();
      await page.keyboard.type(`printf '${name}' > ${name}.txt`);
      assert.equal(await page.evaluate(() => window.testTerminal.getViewportY()), 0);
      await page.keyboard.press("Enter");
      for (let i = 0; i < 100; i++) {
        try {
          if ((await readFile(join(root, `${name}.txt`), "utf8")) === name) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(await readFile(join(root, `${name}.txt`), "utf8"), name);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("r");
      await drag(page, [-10, -6], [10, 6]);
      pointEquals((await corners(page))[2], [10, 6]);
      await page.keyboard.press("Escape");
      const before = await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document));
      await input.focus();
      await page.keyboard.type("mrs");
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Meta+z");
      assert.equal(
        await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
        before,
      );
      await page.getByRole("button", { name: "Change agent dock position" }).click();
      await page.getByRole("button", { name: "Collapse agent terminal" }).click();
      assert(pty.status.running);
      await page.getByRole("button", { name: "Expand agent terminal" }).click();
      await agentMenuRoute(page);
      await page.screenshot({ path: `.cache/sketch-review/agent-terminal-${name}.png` });
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page.locator(".agent-status").filter({ hasText: "Exited" }).waitFor();
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${name}: Ghostty WASM/canvas, real PTY input, CAD drawing, keyboard isolation and docking`,
      );
    } finally {
      await pty.stop();
      await browser.close();
    }
  }
} finally {
  await pty.stop();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
