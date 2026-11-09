import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "../..");

/** Like the compiler cache, tool downloads belong to the common repository. */
export function bugToolCache(root, environment = process.env) {
  if (environment.MAKESHIFT_BUG_TOOL_CACHE) return resolve(environment.MAKESHIFT_BUG_TOOL_CACHE);
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return join(dirname(common), ".cache/bug-tools");
  } catch {
    // Source archives without Git still support ordinary local setup.
    return join(root, ".cache/bug-tools");
  }
}

export const toolCache = bugToolCache(projectRoot);
export const runtimeCache = join(toolCache, `${process.platform}-${process.arch}`);
export const legacyCache = join(projectRoot, ".cache/bug-tools");

/** Readers only see completed files, including when two cold setups overlap. */
export async function publishFile(target, write) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await write(temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export const copyCachedFile = (source, target) => publishFile(target, (path) => cp(source, path));
