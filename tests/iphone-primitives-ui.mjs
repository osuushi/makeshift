import assert from "node:assert/strict";
import { inspect, modalCompleted, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Finger delivery and the window capture listener must reach primitive placement.
// Policy unit tests cannot catch a camera handler swallowing real touch events.
await withUiRuntimes(
  async (page, name) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
      // Desktop WebKit supports SDK touch delivery but reports zero touch points.
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5 });
    });
    await page.reload();
    await settled(page);
    const pointer = page.getByRole("button", { name: "Pointer", exact: true });
    const camera = page.getByRole("button", { name: "Camera", exact: true });
    assert.equal(await pointer.getAttribute("aria-pressed"), "true", "iPhone edits by default");
    for (const tool of ["cylinder", "sphere"]) {
      await phoneTool(page, tool);
      const before = await inspect(page);
      const canvas = await page.getByLabel("Modeling viewport").boundingBox();
      // The toolbox occupies the left side of a narrow screen.
      await page.touchscreen.tap(canvas.x + canvas.width * 0.77, canvas.y + canvas.height / 2);
      await page.waitForFunction(() => {
        const s = window.makeshiftInspect();
        return !s.busy && !!s.preview?.bodies?.length;
      });
      const placed = await inspect(page);
      assert.equal(placed.document.sketches.length, before.document.sketches.length + 1);
      assert.equal(placed.interaction.kind, tool === "sphere" ? "revolve" : "extrude");
      assert.ok(placed.preview.bodies[0].volume > 0, "Real kernel creates a solid preview");
      assert.deepEqual(placed.camera.position, before.camera.position, "Placement does not orbit");
      await page
        .getByRole("button", {
          name: tool === "sphere" ? "Accept revolution" : "Accept extrusion",
          exact: true,
        })
        .tap();
      await modalCompleted(page);
      assert.equal((await inspect(page)).document.bodies.length, 1);
      console.log(`${name}: finger ${tool} placement and solid acceptance passed`);
      // Use ordinary Undo to separate the overlapping primitives and their source sketches.
      for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: "File / Edit", exact: true }).tap();
        await page.locator('[data-command="undo"]').tap();
        await settled(page);
      }
    }
    await camera.tap();
    await page.reload();
    await settled(page);
    assert.equal(
      await camera.getAttribute("aria-pressed"),
      "true",
      "Explicit Camera survives reload",
    );
    await pointer.tap();
    await page.reload();
    await settled(page);
    assert.equal(
      await pointer.getAttribute("aria-pressed"),
      "true",
      "Explicit Pointer survives reload",
    );
    console.log(
      `${name}: iPhone finger Cylinder/Sphere placement, acceptance and saved controls passed`,
    );
  },
  {
    allowed: ["chromium", "webkit"],
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    timeout: 30000,
  },
);

async function phoneTool(page, id) {
  await page.getByRole("button", { name: "More tools", exact: true }).tap();
  await page.getByRole("combobox", { name: "Find a tool" }).fill(id);
  await page.locator(`[data-command="${id}"]`).tap();
  await settled(page);
}
