import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function requireSuccessfulCheck(runs, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  // The query is limited to the newest main-push run of check-macos.yml.
  // Never fall back to an older success after a failed or pending rerun.
  const run = runs[0];
  assert.ok(
    run?.headSha === sha &&
      run.headBranch === "main" &&
      run.event === "push" &&
      run.status === "completed" &&
      run.conclusion === "success",
    `Release requires a successful Check run for ${sha}. Wait for Check to pass, then dispatch the release again.`,
  );
  return run.url;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sha = process.env.GITHUB_SHA;
  const repository = process.env.GITHUB_REPOSITORY;
  assert.ok(sha && repository, "GITHUB_SHA and GITHUB_REPOSITORY are required");
  const runs = JSON.parse(
    execFileSync(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repository,
        "--workflow",
        "check-macos.yml",
        "--commit",
        sha,
        "--branch",
        "main",
        "--event",
        "push",
        "--limit",
        "1",
        "--json",
        "headSha,headBranch,event,status,conclusion,url",
      ],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );
  console.log(`Required Check passed: ${requireSuccessfulCheck(runs, sha)}`);
}
