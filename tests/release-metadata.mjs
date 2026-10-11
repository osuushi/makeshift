import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { meshInputs } from "../scripts/mesh-inputs.mjs";
import { requireSuccessfulCheck } from "../scripts/release/required-check.mjs";
import { updateFeed } from "../scripts/release/update-feed.mjs";
import { releaseVersion } from "../scripts/release/version.mjs";

test("release requires completed successful main-push Check at its exact commit", () => {
  const sha = "a".repeat(40);
  const run = {
    headSha: sha,
    headBranch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    url: "https://github.com/osuushi/makeshift/actions/runs/123",
  };
  assert.equal(requireSuccessfulCheck([run], sha), run.url);
  assert.throws(() => requireSuccessfulCheck([], sha), /requires a successful Check/);
  for (const change of [
    { headSha: "b".repeat(40) },
    { headBranch: "topic" },
    { event: "pull_request" },
    { status: "in_progress", conclusion: "" },
    { status: "queued", conclusion: "" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: "skipped" },
  ]) {
    // An earlier passing run cannot mask the latest run's result.
    assert.throws(() => requireSuccessfulCheck([{ ...run, ...change }, run], sha));
  }
  assert.throws(() => requireSuccessfulCheck([run], "main"));
});

test("static preview feed names the exact timestamped ZIP and packaged numeric version", () => {
  const metadata = {
    ...releaseVersion("2026-09-22T14:35:12Z"),
    architecture: "arm64",
    minimumMacOS: "14.0",
  };
  const feed = updateFeed(metadata, "osuushi/makeshift");
  assert.equal(feed.currentRelease, "2026.265.52512");
  assert.equal(feed.releases[0].version, feed.currentRelease);
  assert.equal(feed.releases[0].updateTo.version, feed.currentRelease);
  assert.equal(
    feed.releases[0].updateTo.url,
    "https://github.com/osuushi/makeshift/releases/download/20260922T143512Z/Makeshift-20260922T143512Z-arm64.zip",
  );
  for (const change of [
    { version: "0.2.0" },
    { tag: "latest" },
    { architecture: "x64" },
    { minimumMacOS: "15.0" },
  ])
    assert.throws(() => updateFeed({ ...metadata, ...change }, "osuushi/makeshift"));
  assert.throws(() => updateFeed(metadata, "https://elsewhere.test"));
});

test("release names preserve UTC seconds while Apple versions stay numeric", () => {
  const value = releaseVersion("2026-09-22T14:35:12Z");
  assert.equal(value.tag, "20260922T143512Z");
  assert.equal(value.timestamp, "2026-09-22T14:35:12Z");
  assert.equal(value.shortVersion, "2026.9.22");
  assert.equal(value.bundleVersion, "265.14.35");
  assert.equal(value.version, "2026.265.52512");
  assert.equal(releaseVersion("2028-12-31T23:59:59Z").bundleVersion, "366.23.59");
  for (const invalid of [
    "latest",
    "2026-02-30T00:00:00Z",
    "2026-09-22T14:35:12-03:00",
    "2026-09-22T14:35:12.100Z",
  ])
    assert.throws(() => releaseVersion(invalid));
});

test("runtime source and embedded terminal audits match the installed version pins", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const runtime = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
  assert.equal(pkg.devDependencies.electron, runtime.electronVersion);
  assert.equal(
    pkg.dependencies["ghostty-web"],
    "0.4.0",
    "Review embedded terminal notices on upgrade",
  );
  assert.equal(pkg.license, "LGPL-2.1-or-later");
  assert.equal(meshInputs.manifold.version, pkg.devDependencies["manifold-3d"]);
  for (const input of Object.values(meshInputs)) {
    assert.match(input.commit, /^[a-f0-9]{40}$/);
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
  }
  for (const input of runtime.archives) {
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(input.url).protocol, "https:");
  }
});
