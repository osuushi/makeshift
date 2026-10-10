import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { compilerCacheFlags } from "../scripts/native-build-cache.mjs";

const root = resolve(import.meta.dirname, "..");
test("explicit compiler launchers, including disabled caching, take precedence", () => {
  for (const launcher of ["", "/custom/compiler-cache;option=value"])
    assert.deepEqual(compilerCacheFlags(root, { CMAKE_CXX_COMPILER_LAUNCHER: launcher }), [
      `-DCMAKE_CXX_COMPILER_LAUNCHER=${launcher}`,
    ]);
});

test("missing optional ccache leaves native builds available", () => {
  assert.deepEqual(compilerCacheFlags(root, { PATH: "/nonexistent" }), []);
});

test("available ccache uses the common checkout cache and preserves overrides", (context) => {
  const flags = compilerCacheFlags(root);
  if (flags.length === 0 || process.env.CMAKE_CXX_COMPILER_LAUNCHER !== undefined) {
    context.skip("requires optional ccache and no explicit launcher");
    return;
  }
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.deepEqual(compilerCacheFlags(root, { PATH: process.env.PATH }), [
    `-DCMAKE_CXX_COMPILER_LAUNCHER=ccache;cache_dir=${resolve(dirname(common), ".cache/ccache")};base_dir=${root};max_size=2G`,
  ]);
  assert.deepEqual(
    compilerCacheFlags(root, {
      PATH: process.env.PATH,
      CCACHE_DIR: "/custom/cache",
      CCACHE_BASEDIR: "/custom/base",
      CCACHE_MAXSIZE: "4G",
    }),
    [
      "-DCMAKE_CXX_COMPILER_LAUNCHER=ccache;cache_dir=/custom/cache;base_dir=/custom/base;max_size=4G",
    ],
  );
});
