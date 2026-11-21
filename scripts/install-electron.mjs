import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.MAKESHIFT_SKIP_ELECTRON_INSTALL !== "1") {
  const installer = fileURLToPath(new URL("../node_modules/electron/install.js", import.meta.url));
  const { error, status } = spawnSync(process.execPath, [installer], { stdio: "inherit" });
  if (error) throw error;
  process.exitCode = status ?? 1;
}
