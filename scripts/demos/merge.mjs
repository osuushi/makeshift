import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { recipes } from "./recipes.mjs";

/** Combine only complete recordings from the same source and capture configuration. */
export async function mergeDemos(input, output, source) {
  const ids = recipes.map(({ id }) => id);
  const directories = await readdir(input);
  assert.deepEqual(directories.sort(), ids.map((id) => `feature-demo-${id}`).sort());
  const manifests = await Promise.all(
    ids.map(async (id) => {
      const directory = path.join(input, `feature-demo-${id}`);
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      assert.equal(manifest.source, source, "Shard source must match this checkout");
      assert.equal(manifest.sourceDirty, false, "Shard source must be clean");
      assert.deepEqual(
        manifest.clips.map((clip) => clip.id),
        [id],
        "One matching clip per shard",
      );
      for (const extension of ["mp4", "jpg"])
        assert.ok((await readFile(path.join(directory, `${id}.${extension}`))).length > 1000);
      return manifest;
    }),
  );
  const { clips: _clips, ...configuration } = manifests[0];
  for (const { clips: _other, ...other } of manifests)
    assert.deepEqual(other, configuration, "Shard capture configurations must agree");
  const manifest = { ...configuration, clips: manifests.flatMap((item) => item.clips) };
  await mkdir(output, { recursive: true });
  for (const id of ids)
    for (const extension of ["mp4", "jpg"])
      await copyFile(
        path.join(input, `feature-demo-${id}`, `${id}.${extension}`),
        path.join(output, `${id}.${extension}`),
      );
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv[2] && process.argv[3], "Usage: merge.mjs INPUT SOURCE [OUTPUT]");
  await mergeDemos(process.argv[2], process.argv[4] ?? "website/assets/demos", process.argv[3]);
}
