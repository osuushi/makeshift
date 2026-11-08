import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { prepareDevBundle } from "../scripts/dev-bundle.mjs";
import { launchElectron } from "./native-documents.mjs";

if (process.platform !== "darwin") throw new Error("This test covers the macOS dev bundle");
const run = promisify(execFile);
const executablePath = await prepareDevBundle();
const bundle = resolve(dirname(executablePath), "../..");
const app = await launchElectron({
  executablePath,
  args: [],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
const directory = await mkdtemp(join(tmpdir(), "makeshift-dev-open-"));
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.makeshiftInspect);
  await page.locator("#startup").waitFor({ state: "detached" });
  const identity = await app.evaluate(({ app, systemPreferences }) => ({
    name: app.getName(),
    packaged: app.isPackaged,
    path: app.getAppPath(),
    microphone: systemPreferences.getMediaAccessStatus("microphone"),
  }));
  assert.equal(identity.name, "Makeshift Dev");
  assert.equal(
    identity.packaged,
    false,
    "Development runtime must retain local native executable paths",
  );
  assert.equal(identity.path, process.cwd());
  const snapshot = await page.evaluate(() => window.makeshiftInspect());
  const path = join(directory, "dev-open.makeshift");
  await writeFile(
    path,
    JSON.stringify({ format: "makeshift", version: 1, document: snapshot.document }),
  );
  await page.evaluate(() => {
    window.devOriginalPage = true;
  });
  // LaunchServices delivers the same open-file Apple event as dropping onto the app.
  await run("/usr/bin/open", ["-a", bundle, path]);
  const canonical = await realpath(path);
  let opened = false;
  for (let attempt = 0; attempt < 100 && !opened; attempt++) {
    for (const window of app.windows()) {
      if (
        await window.evaluate(
          async (path) => (await window.makeshiftDocument?.status())?.path === path,
          canonical,
        )
      )
        opened = true;
    }
    if (!opened) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!opened)
    console.log(
      await Promise.all(
        app.windows().map((window) => window.evaluate(() => window.makeshiftDocument?.status())),
      ),
    );
  assert.ok(opened, "Finder open-file must reach a development document window");
  await page.waitForFunction(() => !window.devOriginalPage && !!window.makeshiftInspect);
  await page.locator("#startup").waitFor({ state: "detached" });
  console.log("Signed dev identity and LaunchServices document opening passed", identity);
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
