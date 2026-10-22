import { mkdir } from "node:fs/promises";
import { createDMG } from "electron-installer-dmg";
import config from "../../forge.config.js";
import { run } from "./apple-tools.mjs";
import { app, dmg } from "./macos-paths.mjs";

if (process.env.MAKESHIFT_SIGN !== "1" || !process.env.APPLE_SIGNING_IDENTITY)
  throw new Error("DMG signing requires MAKESHIFT_SIGN=1 and a signing identity");
await mkdir(".build/packages/make", { recursive: true });
await createDMG({ ...config.makers[0].config, appPath: app, dmgPath: dmg });
run("codesign", ["--force", "--sign", process.env.APPLE_SIGNING_IDENTITY, "--timestamp", dmg]);
run("codesign", ["--verify", "--strict", "--verbose=2", dmg]);
