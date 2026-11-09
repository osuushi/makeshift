import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bugToolCache, publishFile } from "../scripts/bugs/cache.mjs";

test("linked worktrees reuse the main checkout's bug tools, with an explicit override", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-bug-cache-"));
  const main = join(root, "main"),
    worktree = join(root, "worktree");
  const git = (args) => execFileSync("git", args, { stdio: "ignore" });
  try {
    git(["init", main]);
    git([
      "-C",
      main,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "fixture",
    ]);
    git(["-C", main, "worktree", "add", "--detach", worktree]);
    assert.equal(bugToolCache(worktree, {}), bugToolCache(main, {}));
    assert.equal(bugToolCache(worktree, {}), join(await realpath(main), ".cache/bug-tools"));
    assert.equal(bugToolCache(worktree, { MAKESHIFT_BUG_TOOL_CACHE: root }), root);
    assert.equal(bugToolCache(root, {}), join(root, ".cache/bug-tools"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("interrupted tool publication preserves the last complete cache entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-bug-publish-"));
  const path = join(root, "tool");
  try {
    await writeFile(path, "complete");
    await assert.rejects(
      publishFile(path, async (temporary) => {
        await writeFile(temporary, "partial");
        throw new Error("interrupted setup");
      }),
      /interrupted setup/,
    );
    assert.equal(await readFile(path, "utf8"), "complete");
    await publishFile(path, (temporary) => writeFile(temporary, "replacement"));
    assert.equal(await readFile(path, "utf8"), "replacement");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
