import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { retryApple, run } from "./apple-tools.mjs";
import { app, dmg } from "./macos-paths.mjs";

const kind = process.argv[2];
if (!["app", "dmg"].includes(kind)) throw new Error("Choose app or dmg");
let file = dmg;
if (kind === "app") {
  file = resolve(".build/app-notarization.zip");
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, file]);
}
const directory = await mkdtemp(join(tmpdir(), "makeshift-notary-"));
const keychain = join(directory, "notary.keychain-db");
const password = randomUUID();
try {
  run("security", ["create-keychain", "-p", password, keychain]);
  run("security", ["set-keychain-settings", "-lut", "3600", keychain]);
  run("security", ["unlock-keychain", "-p", password, keychain]);
  // Keep the password out of submit's command line and out of all artifacts.
  await retryApple(() =>
    run("xcrun", [
      "notarytool",
      "store-credentials",
      "makeshift-notary",
      "--keychain",
      keychain,
      "--apple-id",
      process.env.APPLE_ID,
      "--team-id",
      process.env.APPLE_TEAM_ID,
      "--password",
      process.env.APPLE_APP_SPECIFIC_PASSWORD,
    ]),
  );
  const submission = await retryApple(() =>
    JSON.parse(
      run(
        "xcrun",
        [
          "notarytool",
          "submit",
          file,
          "--keychain-profile",
          "makeshift-notary",
          "--keychain",
          keychain,
          "--wait",
          "--timeout",
          "30m",
          "--output-format",
          "json",
        ],
        true,
      ),
    ),
  );
  if (submission.status !== "Accepted")
    throw new Error(`Notarization ${submission.id}: ${submission.status}`);
  console.log(`Accepted ${kind} notarization ${submission.id}`);
} finally {
  try {
    run("security", ["delete-keychain", keychain]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
