import { retryApple, run } from "./apple-tools.mjs";
import { app, dmg } from "./macos-paths.mjs";

const kind = process.argv[2];
if (!["app", "dmg"].includes(kind)) throw new Error("Choose app or dmg");
const file = kind === "app" ? app : dmg;
await retryApple(() => run("xcrun", ["stapler", "staple", file]));
await retryApple(() => run("xcrun", ["stapler", "validate", file]));
run("codesign", [
  "--verify",
  ...(kind === "app" ? ["--deep"] : []),
  "--strict",
  "--verbose=2",
  file,
]);
await retryApple(() =>
  run("spctl", [
    "--assess",
    "--type",
    kind === "app" ? "execute" : "open",
    ...(kind === "dmg" ? ["--context", "context:primary-signature"] : []),
    "--verbose=2",
    file,
  ]),
);
