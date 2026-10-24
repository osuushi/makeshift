import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, settled } from "./ui-helpers.mjs";

// Escaped boundary: numeric settings previously rolled back with feedback only
// across the screen. A failed fit must keep the value and explain it in the panel.
export async function capturedPrintControls(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/gear-ring-pinion.json", "utf8"));
  await openDocument(page, {
    name: "gear-ring-pinion.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await settled(page);
  await orient(page, [0, -1, 0.7]);
  const groups = page.getByRole("region", { name: "Gear groups", exact: true });
  await groups.getByRole("button", { name: "Gears 2 · 1 gear", exact: true }).click();
  await groups.getByRole("button", { name: "Add selection to Gears 1", exact: true }).click();
  await settled(page);
  await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
  const panel = page.getByRole("region", { name: "Decorators", exact: true });
  const minimum = panel.getByRole("spinbutton", { name: "Minimum printable width", exact: true });
  const root = panel.getByRole("spinbutton", { name: "Tooth root clearance", exact: true });
  assert.equal(await panel.getByRole("spinbutton").count(), 4);
  assert.deepEqual(
    (await inspect(page)).document.decorators.map((d) => d.settings.teeth),
    [18, 36],
  );
  await minimum.fill("5");
  await minimum.press("Enter");
  await modalCompleted(page);
  assert.ok((await inspect(page)).document.decorators.every((d) => d.settings.minimumTooth === 5));
  assert.match(await panel.getByRole("status").textContent(), /Gear group cannot fit/);
  assert.equal(await minimum.inputValue(), "5");
  await root.fill("0.2");
  await minimum.click();
  await modalCompleted(page);
  assert.ok(
    (await inspect(page)).document.decorators.every((d) => d.settings.rootClearance === 0.2),
  );
  await minimum.fill("0.3");
  await minimum.press("Enter");
  await modalCompleted(page);
  assert.ok((await inspect(page)).document.decorators.every((d) => !d.problem));
  await minimum.fill("-1");
  await page.waitForFunction(() =>
    document
      .querySelector(".decorator-draft-feedback")
      ?.textContent?.includes("Minimum printable width"),
  );
  assert.ok(await panel.getByRole("status").isVisible());
  await minimum.press("Escape");
  assert.equal(await minimum.inputValue(), "0.3");
  await root.fill("0.15");
  await root.press("Enter");
  await modalCompleted(page);
  await minimum.fill("0.4");
  await minimum.press("Enter");
  await modalCompleted(page);
  await groups.getByRole("button", { name: "Gears 1 · 2 gears", exact: true }).click();
  await page.waitForFunction(() => {
    const status = document.querySelector(".decorator-preview-status");
    return (
      status instanceof HTMLElement &&
      status.dataset.busy === "false" &&
      window.makeshiftInspect().decoratorPreviewBounds.length > 0
    );
  });
  await page.screenshot({ path: `.cache/sketch-review/${name}-gear-printing.png` });
}
