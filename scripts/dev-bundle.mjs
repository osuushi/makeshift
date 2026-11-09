import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import electron from "electron";
import { devBootstrap, devBundleInfo } from "./dev-bundle-info.mjs";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registration =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/** A distinct, signed dev identity supports microphone TCC and Finder document drops. */
export async function prepareDevBundle() {
  if (process.platform !== "darwin") return electron;
  const directory = join(root, ".build/dev");
  const bundle = join(directory, "Makeshift Dev.app");
  const executable = join(bundle, "Contents/MacOS/Electron");
  const source = resolve(electron, "../../..");
  const identity = process.env.MAKESHIFT_DEV_SIGN_IDENTITY || "-";
  const sourceInfo = await readFile(join(source, "Contents/Info.plist"));
  const fingerprint = createHash("sha256").update(sourceInfo).update(root).update(identity);
  for (const path of [
    "scripts/dev-bundle.mjs",
    "scripts/dev-bundle-info.mjs",
    "package.json",
    "packaging/dev.entitlements.plist",
    "packaging/icons/makeshift.icns",
    "packaging/icons/makeshift-document.icns",
  ])
    fingerprint.update(await readFile(join(root, path)));
  const stamp = fingerprint.digest("hex");
  if ((await readFile(join(directory, "fingerprint"), "utf8").catch(() => "")) === stamp)
    return executable;
  await mkdir(directory, { recursive: true });
  const staging = join(directory, `staging-${process.pid}.app`);
  try {
    await cp(source, staging, { recursive: true, verbatimSymlinks: true });
    const plist = join(staging, "Contents/Info.plist");
    const { stdout } = await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist]);
    const info = JSON.parse(stdout);
    Object.assign(info, devBundleInfo());
    delete info.ElectronAsarIntegrity;
    await writeFile(plist, JSON.stringify(info));
    await run("/usr/bin/plutil", ["-convert", "xml1", plist]);
    const resources = join(staging, "Contents/Resources");
    await cp(join(root, "packaging/icons/makeshift.icns"), join(resources, "makeshift.icns"));
    await cp(
      join(root, "packaging/icons/makeshift-document.icns"),
      join(resources, "makeshift-document.icns"),
    );
    await mkdir(join(resources, "app"));
    const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    await writeFile(
      join(resources, "app/package.json"),
      JSON.stringify({
        name: "makeshift-dev",
        productName: "Makeshift Dev",
        version,
        main: "main.cjs",
      }),
    );
    await writeFile(join(resources, "app/main.cjs"), devBootstrap(root));
    await run(
      "/usr/bin/codesign",
      [
        "--force",
        "--deep",
        "--sign",
        identity,
        "--options",
        "runtime",
        "--entitlements",
        join(root, "packaging/dev.entitlements.plist"),
        staging,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staging]);
    await rm(bundle, { recursive: true, force: true });
    await rename(staging, bundle);
    await run(registration, ["-f", bundle]);
    await writeFile(join(directory, "fingerprint"), stamp);
    return executable;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await prepareDevBundle());
