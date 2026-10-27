import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Integration regression: only the renderer can establish that a visual Boolean
// replaces its accepted operand while the captured handle owns pointer input.
const fixture = JSON.parse(await readFile("tests/fixtures/extrude-detailed-body.json", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "makeshift-extrusion-preview-"));
const file = join(directory, "detailed-body.makeshift");
await writeFile(
  file,
  JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
);
try {
  await withUiRuntimes(
    async (page, name) => {
      await openDocument(page, file);
      const original = (await inspect(page)).document;
      const point = await project(page, [0, 0, original.sketches[0].plane.origin[2]]);
      await page.mouse.click(point.x, point.y);
      assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
      await page.keyboard.press("e");
      const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
      const box = await handle.boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.keyboard.down("Shift"); // Keep the drag off nearby exact guide targets.
      await page.mouse.move(x, y - 70);
      try {
        await page.waitForFunction(() => !!window.makeshiftInspect().visualPreview);
        const visual = await inspect(page);
        assert.ok(visual.preview === null, "Visual drawing has no acceptable candidate");
        assert.deepEqual(visual.visualPreview.replaces, [original.bodies[0].id]);
        assert.ok(visual.document.bodies[0].brep === original.bodies[0].brep);
        assert.ok(
          visual.bodyRendering.faces
            .filter((face) => face.body === original.bodies[0].id)
            .every((face) => !face.visible),
          "Accepted operand is hidden behind the visual replacement",
        );
        await page.screenshot({ path: `.cache/sketch-review/${name}-detailed-extrude-visual.png` });
      } finally {
        await page.mouse.up();
        await page.keyboard.up("Shift");
      }
      await page.waitForFunction(() => !!window.makeshiftInspect().preview);
      await page.keyboard.press("Enter");
      await modalCompleted(page);
      const accepted = (await inspect(page)).document;
      assert.equal(accepted.bodies.length, 1);
      assert.ok(accepted.bodies[0].volume > original.bodies[0].volume);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, original);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, accepted);
      console.log(
        `${name}: captured circle pointer extrusion, visual union, release, acceptance and Undo/Redo passed`,
      );
    },
    { timeout: 30000 },
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
