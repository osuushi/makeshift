import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** Reuse the former application's preferences and private agent workspace in place. */
export function configureApplicationIdentity(): void {
  const dev = process.env.MAKESHIFT_DEV_BUNDLE === "1";
  app.setName(dev ? "Makeshift Dev" : "Makeshift");
  if (app.commandLine.hasSwitch("user-data-dir")) return;
  if (dev) {
    app.setPath("userData", join(app.getPath("appData"), "Makeshift Dev"));
    return;
  }
  const current = app.getPath("userData");
  if (existsSync(current)) return;
  for (const name of ["Freac", "freac"]) {
    const legacy = join(app.getPath("appData"), name);
    if (existsSync(legacy)) {
      app.setPath("userData", legacy);
      return;
    }
  }
}
