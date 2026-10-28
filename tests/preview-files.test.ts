import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { previewPath, readPreviewData, writePreviewData } from "../src/host/preview-files.js";

test("preview data is script-readable and paths cannot escape through symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "preview-test-"));
  try {
    const app = join(root, "app");
    await mkdir(app);
    assert.deepEqual(await readPreviewData(app), {});
    await writePreviewData(app, { profile: [[1, 2]], note: "ready" });
    assert.deepEqual(JSON.parse(await readFile(join(app, "data.json"), "utf8")), {
      profile: [[1, 2]],
      note: "ready",
    });
    await writeFile(join(root, "private"), "secret");
    await symlink(join(root, "private"), join(app, "escape"));
    await assert.rejects(previewPath(app, "escape"), /inside/);
    await assert.rejects(previewPath(app, "../private"), /inside/);
    await assert.rejects(writePreviewData(app, "x".repeat(1024 * 1024)), /limit/);
    await writeFile(join(app, "data.json"), "bad JSON");
    await assert.rejects(readPreviewData(app));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
