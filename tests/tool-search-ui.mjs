import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await reset(page);
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Find a tool" });
  for (const query of ["cstr", "cnpl", "cp", "rfpl", "cope", "cole"]) {
    await input.fill(query);
    assert.equal(
      await page.locator('[data-command="construction-plane"]').getAttribute("aria-disabled"),
      "false",
      query,
    );
  }
  for (const [query, id] of [
    ["rect", "rectangle"],
    ["cstr", "construction-plane"],
    ["cope", "construction-plane"],
  ]) {
    await input.fill(query);
    assert.equal(
      await page.locator('[role="option"][aria-selected="true"]').getAttribute("data-command"),
      id,
      query,
    );
  }
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before, "Search does not edit geometry");
  await orient(page, [1, 1, 1]);
  await page.keyboard.press("Meta+f");
  await input.fill("cope");
  await page.keyboard.press("Enter");
  await pickPlane(page, "XY");
  await page.keyboard.press("Enter");
  const created = (await inspect(page)).document.constructionPlanes;
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].frame.origin, [0, 0, 0]);
  await page.keyboard.press("Escape");
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.constructionPlanes?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.constructionPlanes, created);
  await chooseTool(page, "sketch on xy", "sketch-xy");
  await page.keyboard.press("Meta+f");
  await input.fill("cstr");
  assert.equal(
    await page.locator('[data-command="construction-plane"]').getAttribute("aria-disabled"),
    "true",
    "Sparse matches remain visible when unavailable",
  );
  await page.keyboard.press("Escape");
  console.log(
    `${name}: ranked search, keyboard plane creation, Undo/Redo and disabled result pass`,
  );
});
