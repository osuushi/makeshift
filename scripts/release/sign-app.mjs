import { cp, readFile } from "node:fs/promises";
import { signAsync } from "@electron/osx-sign";
import config from "../../forge.config.js";
import { run } from "./apple-tools.mjs";
import { app } from "./macos-paths.mjs";

if (process.env.MAKESHIFT_SIGN !== "1" || !config.packagerConfig.osxSign)
  throw new Error("Signing requires MAKESHIFT_SIGN=1 and a signing identity");
// Add updater configuration before signing; do not rebuild or repackage accepted bytes.
await cp("packaging/updates.json", `${app}/Contents/Resources/updates.json`);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await signAsync({
  ...config.packagerConfig.osxSign,
  app,
  platform: "darwin",
  version: pkg.devDependencies.electron,
});
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
