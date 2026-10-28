import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { imagePage } from "../.build/host/agent-cli/preview.js";
import { launchElectron } from "./native-documents.mjs";

// Native child-view composition, preload IPC and hidden capture require Electron.
const root = await mkdtemp(join(tmpdir(), "preview-ui-"));
await mkdir(join(root, "app"));
await writeFile(
  join(root, "app/index.html"),
  `<!doctype html><style>body{background:rgb(20,120,200)}</style><label>Profile<input aria-label="Profile"></label><output></output><script>
const field=document.querySelector('input');field.onchange=async()=>{await preview.write({profile:field.value});document.querySelector('output').textContent='Saved'};
preview.onTrigger(async name=>{if(name==='data')field.value=(await preview.read()).profile});
</script>`,
);
await build({
  configFile: false,
  build: {
    outDir: ".cache/preview-ui",
    emptyOutDir: true,
    rollupOptions: { input: "tests/preview-fixture.html" },
  },
  base: "./",
});
const app = await launchElectron({
  args: ["tests/preview-fixture.mjs"],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", PREVIEW_TEST_ROOT: root },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.waitForSelector(".preview-pane", { state: "attached" });
  const command = (input) =>
    app.evaluate(
      async (_, { input, root }) => globalThis.previewTest.request(JSON.stringify(input), root),
      { input, root },
    );
  await command({ action: "open", directory: "app", title: "Profile editor" });
  await page.getByRole("button", { name: "Collapse preview", exact: true }).waitFor();
  const preview = app
    .context()
    .pages()
    .find((p) => p.url().startsWith("https://preview.local/"));
  assert.ok(preview);
  await preview.getByRole("textbox", { name: "Profile" }).fill("curved");
  await preview.getByRole("textbox", { name: "Profile" }).press("Tab");
  await preview.getByText("Saved", { exact: true }).waitFor();
  assert.deepEqual(JSON.parse(await readFile(join(root, "app/data.json"), "utf8")), {
    profile: "curved",
  });
  const scale = await preview.evaluate(() => devicePixelRatio);
  assert.deepEqual(await preview.evaluate(() => [innerWidth, innerHeight]), [640, 480]);
  const before = await command({ action: "screenshot" });
  assert.equal(before.width, 640 * scale);
  assert.equal(before.height, 480 * scale);
  await page.getByRole("button", { name: "Collapse preview", exact: true }).click();
  const collapsed = await command({ action: "screenshot" });
  assert.equal(collapsed.width, before.width);
  assert.equal(collapsed.height, before.height);
  assert.ok((await readFile(collapsed.path)).length > 1000);
  assert.equal(
    (await command({ action: "eval", code: 'document.querySelector("input").value' })).result,
    "curved",
  );
  await writeFile(join(root, "app/data.json"), JSON.stringify({ profile: "script update" }));
  await command({ action: "trigger", name: "data" });
  await preview.waitForFunction(() => document.querySelector("input").value === "script update");
  assert.equal(await preview.evaluate(() => typeof require), "undefined");
  assert.equal(await preview.evaluate(() => typeof makeshiftModel), "undefined");
  assert.equal(
    await preview.evaluate(async () => {
      try {
        await fetch("https://example.com");
        return true;
      } catch {
        return false;
      }
    }),
    false,
  );
  await page.getByRole("button", { name: "Expand preview", exact: true }).click();
  const header = page.locator(".preview-pane .preview-header");
  const box = await header.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 60);
  await page.mouse.up();
  assert.ok((await header.boundingBox()).x > box.x);
  const bounds = await page.locator(".preview-pane").boundingBox();
  await page.mouse.move(bounds.x + bounds.width - 3, bounds.y + bounds.height - 3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width + 50, bounds.y + bounds.height + 40);
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector(".preview-pane").getBoundingClientRect().width > 660,
  );
  const resized = await command({ action: "screenshot" });
  assert.ok(resized.width > before.width);
  assert.ok(resized.height > before.height);
  await command({ action: "reload" });
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  await assert.rejects(command({ action: "read" }), /Open a preview/);
  await writeFile(
    join(root, "app/image.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>',
  );
  await writeFile(join(root, "app/index.html"), imagePage(".svg", false));
  await command({ action: "open", directory: "app", title: "Fit image" });
  const imageView = app
    .context()
    .pages()
    .find((p) => p.url().startsWith("https://preview.local/"));
  await imageView.waitForFunction(() => document.querySelector("img")?.complete);
  const imageFit = await imageView.evaluate(() => {
    const image = document.querySelector("img"),
      rect = image.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fit: getComputedStyle(image).objectFit,
      viewport: [innerWidth, innerHeight],
    };
  });
  assert.equal(imageFit.fit, "contain");
  assert.equal(imageFit.x, 0);
  assert.equal(imageFit.y, 0);
  assert.deepEqual([imageFit.width, imageFit.height], imageFit.viewport);
  console.log(
    "Preview input, JSON, triggers, reload, isolation, dragging, resizing, close and collapsed screenshot passed",
  );
} finally {
  await app.close();
  await rm(root, { recursive: true, force: true });
}
