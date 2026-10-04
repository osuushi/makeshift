import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const recipeFiles = [
  "scripts/web/build-wasm.mjs",
  "scripts/web/sdk.mjs",
  "scripts/occt-source.mjs",
  "scripts/occt-recipe.json",
  "native/web/verify-sdk.cmake",
];
const digest = (data) => createHash("sha256").update(data).digest("hex");
export async function webRecipe() {
  let recipe = "";
  for (const path of recipeFiles) recipe += `${path}:${digest(await readFile(path))}\n`;
  return digest(recipe);
}
async function installedFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name.startsWith(".makeshift-") || entry.name === ".DS_Store") continue;
    if (entry.isDirectory()) result.push(...(await installedFiles(directory, path)));
    else result.push(path);
  }
  return result.sort();
}
export async function recordWebSdk(sdk) {
  let manifest = "";
  for (const path of await installedFiles(sdk))
    manifest += `${digest(await readFile(resolve(sdk, path)))}\t${path}\n`;
  await writeFile(resolve(sdk, ".makeshift-web-files"), manifest);
  await writeFile(
    resolve(sdk, ".makeshift-web-sdk"),
    `${await webRecipe()}\n${digest(manifest)}\n`,
  );
}
