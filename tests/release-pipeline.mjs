import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { retryApple } from "../scripts/release/apple-tools.mjs";

const root = resolve(".");
const sha = "a".repeat(40);

test("Apple transport retries back off and preserve permanent failures", async () => {
  const delays = [];
  const options = { sleep: async (ms) => delays.push(ms), warn: () => {} };
  let calls = 0;
  assert.equal(
    await retryApple(() => {
      if (++calls < 3)
        throw new Error('NSURLErrorDomain Code=-1005 "The network connection was lost."');
      return "ticket";
    }, options),
    "ticket",
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5000, 15000]);
  for (const message of [
    "Invalid credentials",
    "Invalid credentials (HTTP 503)",
    "Notarization: Invalid",
    "Ticket does not match code signature",
    "xcrun failed (68)",
  ]) {
    let attempts = 0;
    await assert.rejects(
      retryApple(() => {
        attempts++;
        throw new Error(message);
      }, options),
      { message },
    );
    assert.equal(attempts, 1);
  }
  delays.length = 0;
  await assert.rejects(
    retryApple(() => {
      throw new Error("HTTP 503 Service Unavailable");
    }, options),
  );
  assert.deepEqual(delays, [5000, 15000, 45000]);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-release-stage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = join(directory, ".build/packages/Makeshift-darwin-arm64/Makeshift.app");
  const metadata = { tag: "20261022T000000Z", commit: sha, version: "2026.295.0" };
  for (const path of [
    ".build/release/build.json",
    ".build/packages/Makeshift-darwin-arm64/Makeshift.app/Contents/Resources/build.json",
  ]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), JSON.stringify(metadata));
  }
  const env = { ...process.env, GITHUB_SHA: sha };
  const execute = (script, args = [], extra = {}) =>
    spawnSync(process.execPath, [join(root, "scripts/release", script), ...args], {
      cwd: directory,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  return { directory, app, metadata, env, execute };
}

test("package handoff preserves framework symlinks, executable modes and original source identity", async (t) => {
  const f = await fixture(t);
  const binary = join(f.app, "Contents/Resources/calculator");
  await writeFile(binary, "accepted binary bytes", { mode: 0o755 });
  await symlink("calculator", join(f.app, "Contents/Resources/current"));
  assert.equal(f.execute("package-checkpoint.mjs", ["pack"]).status, 0);
  await rm(join(f.directory, ".build/packages"), { recursive: true });
  await rm(join(f.directory, ".build/release"), { recursive: true });
  const restored = f.execute("package-checkpoint.mjs", ["restore"]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(await readFile(binary, "utf8"), "accepted binary bytes");
  assert.ok((await stat(binary)).mode & 0o111);
  assert.equal(await readlink(join(f.app, "Contents/Resources/current")), "calculator");
  assert.deepEqual(
    JSON.parse(await readFile(join(f.directory, ".build/release/build.json"))),
    f.metadata,
  );
  assert.notEqual(
    f.execute("package-checkpoint.mjs", ["restore"], { GITHUB_SHA: "b".repeat(40) }).status,
    0,
  );
  await writeFile(
    join(f.app, "Contents/Resources/build.json"),
    JSON.stringify({ ...f.metadata, tag: "other" }),
  );
  assert.notEqual(f.execute("package-checkpoint.mjs", ["pack"]).status, 0);
});

async function appleFixture(t) {
  const f = await fixture(t);
  const bin = join(f.directory, "bin"),
    log = join(f.directory, "tools.jsonl");
  await mkdir(bin);
  const stub = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const tool=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(process.env.TEST_TOOL_LOG,JSON.stringify({tool,args})+'\\n');
if(tool==='xcrun'&&args[0]==='notarytool'&&args[1]==='submit') console.log(JSON.stringify({id:'submission',status:process.env.TEST_NOTARY_STATUS??'Accepted'}));
if(process.env.TEST_BAD_TICKET==='1'&&tool==='xcrun'&&args[0]==='stapler'){console.error('Ticket does not match code signature');process.exit(65);}
`;
  for (const tool of ["xcrun", "codesign", "spctl", "security", "ditto"]) {
    await writeFile(join(bin, tool), stub);
    await chmod(join(bin, tool), 0o755);
  }
  Object.assign(f.env, {
    PATH: `${bin}:${process.env.PATH}`,
    TEST_TOOL_LOG: log,
    APPLE_ID: "test@example.invalid",
    APPLE_TEAM_ID: "TESTTEAM",
    APPLE_APP_SPECIFIC_PASSWORD: "test-password",
  });
  return {
    ...f,
    tools: async () => (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse),
  };
}

test("notarization acceptance is separate from stapling and credentials stay out of submit", async (t) => {
  const f = await appleFixture(t);
  for (const kind of ["app", "dmg"]) {
    const result = f.execute("notarize.mjs", [kind]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Accepted .* notarization submission/);
  }
  const tools = await f.tools();
  const submits = tools.filter(({ tool, args }) => tool === "xcrun" && args[1] === "submit");
  assert.equal(submits.length, 2);
  for (const { args } of submits) {
    assert.ok(args.includes("--keychain-profile"));
    assert.ok(!args.includes("--password") && !args.includes("test-password"));
  }
  assert.ok(!tools.some(({ args }) => args[0] === "stapler"));
  assert.equal(
    tools.filter(({ tool, args }) => tool === "security" && args[0] === "delete-keychain").length,
    2,
  );
  const invalid = f.execute("notarize.mjs", ["dmg"], { TEST_NOTARY_STATUS: "Invalid" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Notarization submission: Invalid/);
});

test("ticket recovery does not sign or resubmit and invalid tickets never reach Gatekeeper", async (t) => {
  const f = await appleFixture(t);
  for (const kind of ["app", "dmg"]) {
    const result = f.execute("staple.mjs", [kind]);
    assert.equal(result.status, 0, result.stderr);
  }
  let tools = await f.tools();
  assert.equal(
    tools.filter(
      ({ tool, args }) => tool === "xcrun" && args[0] === "stapler" && args[1] === "validate",
    ).length,
    2,
  );
  assert.ok(tools.some(({ tool, args }) => tool === "spctl" && args.includes("execute")));
  assert.ok(
    tools.some(({ tool, args }) => tool === "spctl" && args.includes("context:primary-signature")),
  );
  assert.ok(!tools.some(({ args }) => args.includes("notarytool") || args.includes("--sign")));
  const before = tools.length;
  assert.notEqual(f.execute("staple.mjs", ["dmg"], { TEST_BAD_TICKET: "1" }).status, 0);
  tools = (await f.tools()).slice(before);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].tool, "xcrun");
});

test("macOS recovery graph isolates saved artifacts and keeps demos exclusively in web release", async () => {
  const read = async (name) => parse(await readFile(`.github/workflows/${name}.yml`, "utf8"));
  const release = await read("release-macos"),
    build = await read("release-macos-build"),
    publish = await read("release-macos-publish");
  assert.equal(release.jobs.sign.needs, "build");
  assert.equal(release.jobs["notarize-app"].needs, "sign");
  assert.equal(release.jobs["package-dmg"].needs, "notarize-app");
  assert.equal(release.jobs["notarize-dmg"].needs, "package-dmg");
  assert.equal(release.jobs["staple-dmg"].needs, "notarize-dmg");
  assert.deepEqual(release.jobs.publish.needs, ["build", "staple-dmg"]);
  const artifact = (job) =>
    job.steps.find((s) => s.uses === "./.github/actions/macos-release-stage").with.artifact;
  assert.equal(artifact(release.jobs.sign), "macos-unsigned");
  assert.equal(artifact(release.jobs["notarize-app"]), "macos-signed");
  assert.equal(artifact(release.jobs["package-dmg"]), "macos-signed");
  assert.equal(
    release.jobs["package-dmg"].steps.find(
      (s) => s.uses === "./.github/actions/macos-release-stage",
    ).with["dmg-tools"],
    "true",
  );
  assert.equal(artifact(release.jobs["notarize-dmg"]), "macos-notarized-package");
  assert.equal(artifact(release.jobs["staple-dmg"]), "macos-notarized-package");
  const commands = JSON.stringify([release, build, publish]);
  assert.doesNotMatch(commands, /demos:|playwright install|ffmpeg|electron-forge make/);
  assert.match(JSON.stringify(await read("release-web")), /demos:record -- --web/);
  assert.equal(publish.jobs["update-feed"].needs, "publish");
});
