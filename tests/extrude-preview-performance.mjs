import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { electronSession, openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Opt-in real pointer benchmark. No CI timing thresholds. --before restores the
// pre-optimization client/refresh behavior in this isolated page, not production.
// Draw latency ends at WebGL submission, not compositor presentation or GPU completion.
const before = process.argv.includes("--before");
const profile = process.argv.includes("--profile");
const fixture = JSON.parse(await readFile("tests/fixtures/extrude-detailed-body.json", "utf8"));
const replacements = {
  "model-client.ts": [
    ["if (!changes.steps.length && encoded === this.sentSelection) return;", ""],
    ["await call(request, this.view.data)", "await call(request)"],
  ],
  "editor.ts": [["if (coalesce && this.isDragging)", "if (this.world.active && this.isDragging)"]],
  "move-destinations.ts": [
    ['if (this.root.style.display === "none") return;', ""],
    ["if (!circles.length) return;", ""],
  ],
  "markers.ts": [["if (!this.buttons.length) return;", ""]],
};

async function baseline(page) {
  for (const [file, edits] of Object.entries(replacements)) {
    await page.context().route(`**/${file}*`, async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      for (const [from, to] of edits) {
        assert.ok(body.includes(from), `Baseline transform missing: ${file}: ${from}`);
        body = body.replace(from, to);
      }
      await route.fulfill({ response, body });
    });
  }
}

async function instrumentation(page) {
  const cdp = await page.context().newCDPSession(
    electronSession(page)
      .app.windows()
      .find((p) => p.url() === page.url()),
  );
  const scripts = [];
  cdp.on("Debugger.scriptParsed", (script) => scripts.push(script.url));
  await cdp.send("Debugger.enable");
  const urls = ["model-client.ts", "visual-preview-view.ts", "frame-pacer.ts"].map((file) => {
    const url = scripts.find((url) => url.includes(`/${file}`));
    assert.ok(url, `Loaded module missing: ${file}`);
    return url;
  });
  await cdp.send("Debugger.disable");
  await page.evaluate(async ([clientUrl, visualUrl, pacerUrl]) => {
    const { ModelClient } = await import(clientUrl);
    const { VisualBodyDrawable } = await import(visualUrl);
    const { FramePacer } = await import(pacerUrl);
    window.previewPerf = { requests: [], draws: [], frames: [], input: 0 };
    const stats = window.previewPerf;
    const bodies = new WeakMap();
    let ready;
    document.addEventListener(
      "pointermove",
      (event) => {
        if (event.buttons === 1) stats.input = performance.now();
      },
      true,
    );
    const request = ModelClient.prototype.request;
    ModelClient.prototype.request = async function (input, ...args) {
      const start = performance.now(),
        pointer = stats.input;
      const result = await request.call(this, input, ...args);
      if (input.kind === "extrude" && input.presentation === "visual") {
        const sample = { start, pointer, ms: performance.now() - start, drawn: false };
        stats.requests.push(sample);
        for (const body of this.view.visualPreview?.bodies ?? []) bodies.set(body, sample);
      }
      return result;
    };
    const update = VisualBodyDrawable.prototype.update;
    VisualBodyDrawable.prototype.update = function (body, ...args) {
      update.call(this, body, ...args);
      const sample = bodies.get(body);
      if (sample && !sample.drawn) ready = sample;
    };
    const submit = FramePacer.prototype.request;
    FramePacer.prototype.request = function (render, ...args) {
      return submit.call(
        this,
        () => {
          render();
          if (ready && !ready.drawn) {
            const now = performance.now();
            ready.drawn = true;
            stats.draws.push({ request: now - ready.start, pointer: now - ready.pointer });
            ready = undefined;
          }
        },
        ...args,
      );
    };
    let previous = performance.now();
    const frame = (now) => {
      if (!window.previewPerf) return;
      stats.frames.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, urls);
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  return cdp;
}

function summarize(values) {
  const sorted = values.slice(4).sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}

await withUiRuntimes(
  async (page) => {
    if (before) await baseline(page);
    for (const label of ["empty", "populated", "distant"]) {
      const document = structuredClone(fixture.document);
      if (label === "empty") document.bodies = [];
      if (label === "distant") document.sketches[0].plane.origin[0] += 150;
      await openDocument(page, {
        name: `${label}.makeshift`,
        buffer: Buffer.from(
          JSON.stringify({
            format: "makeshift",
            version: 1,
            document,
            ...(label === "distant"
              ? {
                  camera: {
                    position: [140, -65, 65],
                    target: [75, 0, 0],
                    up: [0, 0, 1],
                    height: 150,
                  },
                }
              : {}),
          }),
        ),
      });
      const point = await project(page, document.sketches[0].plane.origin);
      await page.mouse.click(point.x, point.y);
      await page.keyboard.press("e");
      const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
      await handle.click();
      await page.getByRole("button", { name: "New body", exact: true }).click();
      const cdp = await instrumentation(page);
      const box = await handle.boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.keyboard.down("Shift");
      for (let i = 1; i <= 24; i++) {
        await page.mouse.move(x, y - 15 - i * 6);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const stats = await page.evaluate(() => {
        const stats = window.previewPerf;
        window.previewPerf = null;
        return stats;
      });
      assert.equal(stats.requests.length, 24, `${label}: each target must calculate`);
      assert.equal(stats.draws.length, 24, `${label}: each sampled mesh must reach a draw`);
      console.log(
        JSON.stringify({
          label,
          before,
          profiled: profile,
          requestMs: summarize(stats.requests.map((sample) => sample.ms)),
          requestToDrawMs: summarize(stats.draws.map((sample) => sample.request)),
          pointerToDrawMs: summarize(stats.draws.map((sample) => sample.pointer)),
          frameIntervalMs: summarize(stats.frames),
        }),
      );
      if (profile) {
        const { profile: cpu } = await cdp.send("Profiler.stop");
        await writeFile(`.cache/sketch-review/extrusion-${label}.cpuprofile`, JSON.stringify(cpu));
      }
      await cdp.detach();
      await page.screenshot({
        path: `.cache/sketch-review/extrusion-${label}-${before ? "before" : "after"}.png`,
      });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await inspect(page);
      await page.keyboard.press("Escape");
      await inspect(page);
    }
  },
  { allowed: ["electron"], timeout: 30000 },
);
