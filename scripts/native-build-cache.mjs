import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export function compilerCacheFlags(root, environment = process.env) {
  if (environment.CMAKE_CXX_COMPILER_LAUNCHER !== undefined)
    return [`-DCMAKE_CXX_COMPILER_LAUNCHER=${environment.CMAKE_CXX_COMPILER_LAUNCHER}`];
  if (spawnSync("ccache", ["--version"], { env: environment, stdio: "ignore" }).status !== 0)
    return [];
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const cache = environment.CCACHE_DIR || resolve(dirname(common), ".cache/ccache");
  const base = environment.CCACHE_BASEDIR || root;
  const size = environment.CCACHE_MAXSIZE || "2G";
  return [
    `-DCMAKE_CXX_COMPILER_LAUNCHER=ccache;cache_dir=${cache};base_dir=${base};max_size=${size}`,
  ];
}
