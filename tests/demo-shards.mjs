import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeDemos } from "../scripts/demos/merge.mjs";
import { recipes } from "../scripts/demos/recipes.mjs";

test("CI records every recipe exactly once and checks the assembled gallery", async () => {
  const workflow = await readFile(".github/workflows/check-macos.yml", "utf8");
  const matrix = workflow.match(/demo: \[([^\]]+)\]/)[1].split(", ");
  assert.deepEqual(
    matrix,
    recipes.map(({ id }) => id),
  );
  assert.match(workflow, /DEMO_ONLY: \$\{\{ matrix.demo \}\}/);
  assert.match(workflow, /feature-demos:\n {4}needs: feature-demo-record/);
  assert.match(workflow, /run: node tests\/website-gallery.mjs/);
});

test("shard assembly preserves recipe order and rejects incomplete or mixed recordings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "demo-shards-"));
  const output = path.join(directory, "output");
  const input = path.join(directory, "input");
  const manifestPath = (id) => path.join(input, `feature-demo-${id}`, "manifest.json");
  try {
    for (const { id } of recipes) {
      await mkdir(path.dirname(manifestPath(id)), { recursive: true });
      await writeFile(
        manifestPath(id),
        JSON.stringify({
          source: "commit",
          sourceDirty: false,
          backend: "native",
          viewport: { width: 960, height: 640 },
          clips: [{ id }],
        }),
      );
      for (const extension of ["mp4", "jpg"])
        await writeFile(
          path.join(path.dirname(manifestPath(id)), `${id}.${extension}`),
          Buffer.alloc(1001),
        );
    }
    await mergeDemos(input, output, "commit");
    const merged = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
    assert.deepEqual(
      merged.clips.map(({ id }) => id),
      recipes.map(({ id }) => id),
    );
    await assert.rejects(mergeDemos(input, output, "another-commit"), /Shard source/);
    const first = manifestPath(recipes[0].id);
    const manifest = JSON.parse(await readFile(first, "utf8"));
    await writeFile(first, JSON.stringify({ ...manifest, backend: "different" }));
    await assert.rejects(mergeDemos(input, output, "commit"), /configurations/);
    await writeFile(first, JSON.stringify({ ...manifest, clips: [] }));
    await assert.rejects(mergeDemos(input, output, "commit"), /One matching clip/);
    await rm(path.dirname(first), { recursive: true });
    await assert.rejects(mergeDemos(input, output, "commit"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
