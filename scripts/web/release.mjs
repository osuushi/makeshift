import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inputCache, nativeInputs } from "../native-inputs.mjs";
import { occtArchive } from "../occt-source.mjs";
import { webNotices } from "./notices.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Release requires a clean committed tree");
const timestamp = new Date().toISOString();
const tag = `web-${timestamp.replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
const metadata = {
  tag,
  timestamp,
  commit: git("rev-parse", "HEAD"),
  repository: process.env.GITHUB_REPOSITORY ?? "osuushi/makeshift",
};
await webNotices(metadata);
await writeFile(".build/web/build.json", `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(".build/web/.nojekyll", "");
const assets = resolve(".build/web-release");
await mkdir(assets, { recursive: true });
await rm(resolve(assets, "makeshift-web.zip"), { force: true });
execFileSync("zip", ["-qr", resolve(assets, "makeshift-web.zip"), "."], {
  cwd: resolve(".build/web"),
});
const stage = resolve(".build/web-source-stage");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
execFileSync("git", [
  "archive",
  "--format=tar",
  "--output",
  resolve(stage, "source.tar"),
  metadata.commit,
]);
execFileSync("tar", ["-xf", resolve(stage, "source.tar"), "-C", stage]);
await rm(resolve(stage, "source.tar"));
await mkdir(resolve(stage, ".cache/release-inputs"), { recursive: true });
for (const input of Object.values(nativeInputs)) {
  const bytes = await readFile(resolve(inputCache, input.archive));
  if (createHash("sha256").update(bytes).digest("hex") !== input.sha256)
    throw new Error("Source hash mismatch");
  await writeFile(resolve(stage, ".cache/release-inputs", input.archive), bytes);
}
await mkdir(resolve(stage, ".cache/web"), { recursive: true });
await cp(await occtArchive(resolve(".cache/web")), resolve(stage, ".cache/web/occt.tar.gz"));
await cp(".cache/web/solver-source", resolve(stage, ".cache/web/solver-source"), {
  recursive: true,
});
await cp(".build/web/licenses", resolve(stage, "release-licenses"), { recursive: true });
await writeFile(resolve(stage, "RELEASE.json"), `${JSON.stringify(metadata, null, 2)}\n`);
execFileSync("tar", ["-czf", resolve(assets, "makeshift-web-sources.tar.gz"), "-C", stage, "."]);
await rm(stage, { recursive: true, force: true });
await writeFile(resolve(assets, "web-build.json"), `${JSON.stringify(metadata, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT)
  await writeFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`, { flag: "a" });
console.log(`Prepared ${tag}`);
