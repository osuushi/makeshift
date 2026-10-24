import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const app = resolve(".build/packages/Makeshift-darwin-arm64/Makeshift.app");
export const metadata = JSON.parse(await readFile(".build/release/build.json", "utf8"));
assert.equal(metadata.commit, process.env.GITHUB_SHA ?? metadata.commit);
assert.deepEqual(
  JSON.parse(await readFile(`${app}/Contents/Resources/build.json`, "utf8")),
  metadata,
);
export const dmg = resolve(`.build/packages/make/Makeshift-${metadata.tag}-arm64.dmg`);
