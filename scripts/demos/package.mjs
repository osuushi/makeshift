import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recipes } from "./recipes.mjs";

const destination = path.resolve(process.argv[2] ?? ".build/website-release");
const manifest = JSON.parse(await readFile("website/assets/demos/manifest.json", "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(manifest.sourceDirty, false, "Regenerate release demos from a clean committed tree");
assert.equal(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  "",
  "Commit website changes before packaging",
);
assert.equal(manifest.source, commit, "Demos must match the packaged source");
assert.deepEqual(
  manifest.clips.map((clip) => clip.id),
  recipes.map((recipe) => recipe.id),
);
for (const clip of manifest.clips) {
  for (const extension of ["mp4", "jpg"]) {
    assert.ok((await readFile(`website/assets/demos/${clip.id}.${extension}`)).length > 1000);
  }
}
// Emit a complete deployable static site; generated media never enters Git.
await mkdir(destination, { recursive: true });
execFileSync("tar", [
  "-czf",
  path.join(destination, "Makeshift-website.tar.gz"),
  "-C",
  "website",
  "index.html",
  "style.css",
  "responsive.css",
  "gallery.css",
  "gallery.js",
  "assets/makeshift.png",
  "assets/demos/manifest.json",
  ...recipes.flatMap(({ id }) => [`assets/demos/${id}.mp4`, `assets/demos/${id}.jpg`]),
]);
await writeFile(
  path.join(destination, "website-demos.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Packaged current website and seven verified demos in ${destination}`);
