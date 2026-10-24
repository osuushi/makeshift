import { existsSync } from "node:fs";
import { run } from "./apple-tools.mjs";

const archive = ".build/macos-package.tar";
const action = process.argv[2];
if (action === "restore") run("tar", ["-xf", archive]);
else if (action === "pack") {
  const paths = [".build/packages/Makeshift-darwin-arm64", ".build/release/build.json"];
  if (existsSync(".build/packages/make")) paths.push(".build/packages/make");
  run("tar", ["-cf", archive, ...paths]);
} else throw new Error("Choose pack or restore");
// Every handoff must retain the original identity and match this workflow's source.
await import("./macos-paths.mjs");
