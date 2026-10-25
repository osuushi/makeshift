import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { historyMenu, openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

async function holdCompletion(page) {
  await page.evaluate(async (url) => {
    const { DeferredPreview } = await import(url);
    const original = DeferredPreview.prototype.run;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    window.movementPresentation = {
      reached: false,
      timings: [],
      release,
      restore: () => {
        DeferredPreview.prototype.run = original;
      },
    };
    DeferredPreview.prototype.run = function (request, call, show) {
      const started = performance.now();
      return original.call(
        this,
        request,
        async (next) => {
          if (next.kind === "complete-preview" && !window.movementPresentation.reached) {
            window.movementPresentation.reached = true;
            await held;
            if (this.superseded) throw new Error("Preview superseded");
          }
          return call(next);
        },
        (reply) => {
          window.movementPresentation.timings.push(performance.now() - started);
          show(reply);
        },
      );
    };
  }, "/deferred-preview.ts");
}

async function route(page, name) {
  const fixture = JSON.parse(
    await readFile(new URL("fixtures/face-move-perforated.json", import.meta.url), "utf8"),
  );
  await openDocument(page, {
    name: "movement-preview.makeshift",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  const original = (await inspect(page)).document;
  await orient(page, [0, 0, 1]);
  await worldClick(page, [12, 0, 26.5]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    fixture.request.operation.faces[0].face,
  );
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move faces X", exact: true }).click();
  await inspect(page);
  await holdCompletion(page);
  try {
    const input = page.getByRole("textbox", { name: "Face translation X", exact: true });
    await input.fill("2");
    await page.waitForFunction(() => window.movementPresentation.reached);
    const early = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(early.solving, true);
    assert.equal(early.preview, null);
    assert.deepEqual(early.document, original);
    assert.ok(early.visualPreview?.bodies[0].faces.length);
    assert.ok(
      early.bodyRendering.faces.every((face) => !face.visible),
      "Accepted operand is hidden",
    );
    assert.equal(
      await page.getByRole("button", { name: "Accept face movement", exact: true }).isEnabled(),
      false,
    );
    await page.screenshot({ path: ".cache/sketch-review/movement-early-mesh.png" });
    await input.fill("4");
    await page.evaluate(() => window.movementPresentation.release());
    const latest = await inspect(page);
    assert.ok(latest.preview);
    assert.equal(latest.visualPreview, null);
    assert.ok(
      Math.abs(latest.preview.bodies[0].bounds[3] - original.bodies[0].bounds[3] - 4) < 1e-5,
    );
    const timings = await page.evaluate(() => window.movementPresentation.timings);
    console.log(`${name}: first mesh timings ${timings.map((n) => n.toFixed(1)).join(", ")} ms`);
    await input.press("Enter");
    await modalCompleted(page);
    const accepted = (await inspect(page)).document;
    assert.deepEqual(accepted.bodies, latest.preview.bodies);
    await historyMenu(page, "undo");
    await inspect(page);
    assert.deepEqual((await inspect(page)).document.bodies, original.bodies);
    await historyMenu(page, "redo");
    await inspect(page);
    assert.deepEqual((await inspect(page)).document.bodies, accepted.bodies);
  } finally {
    await page.evaluate(() => {
      window.movementPresentation.release();
      window.movementPresentation.restore();
      delete window.movementPresentation;
    });
  }
}

await withUiRuntimes(route, { defaults: ["electron"] });
