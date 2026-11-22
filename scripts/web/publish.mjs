import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repository = process.env.WEB_PAGES_REPOSITORY;
const key = process.env.WEB_PAGES_DEPLOY_KEY;
const demosOnly = process.argv.includes("--demos");
if (
  !repository ||
  !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
  repository === process.env.GITHUB_REPOSITORY
)
  throw new Error("Set WEB_PAGES_REPOSITORY to the separate static deployment repository");
if (!key)
  throw new Error("Missing WEB_PAGES_DEPLOY_KEY (write access to the deployment repository only)");
const credentials = await mkdtemp(resolve(tmpdir(), "makeshift-pages-"));
try {
  const identity = resolve(credentials, "identity");
  const hosts = resolve(credentials, "known_hosts");
  // Secret entry and shell substitution can strip OpenSSH's required final newline.
  await writeFile(identity, `${key.trim()}\n`, { mode: 0o600 });
  execFileSync("ssh-keygen", ["-y", "-f", identity], { stdio: "ignore" });
  // GitHub's published Ed25519 host key. Update it here if GitHub rotates it.
  // https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  await writeFile(
    hosts,
    "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n",
  );
  await publish({
    ...process.env,
    GIT_SSH_COMMAND: [
      `ssh -F /dev/null -i '${identity}'`,
      "-o IdentitiesOnly=yes -o StrictHostKeyChecking=yes",
      `-o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile='${hosts}'`,
    ].join(" "),
    GIT_TERMINAL_PROMPT: "0",
  });
} finally {
  await rm(credentials, { recursive: true, force: true });
}

async function publish(env) {
  const source = resolve(demosOnly ? "website/assets/demos" : ".build/web");
  const metadata = JSON.parse(await readFile(resolve(".build/web/build.json"), "utf8"));
  if (demosOnly) {
    const manifest = JSON.parse(await readFile(resolve(source, "manifest.json"), "utf8"));
    assert.equal(manifest.source, metadata.commit, "Demos must match the released web build");
    assert.equal(manifest.sourceDirty, false, "Only committed release demos can be deployed");
    assert.deepEqual(
      manifest,
      JSON.parse(await readFile(resolve(".build/web-release/website-demos.json"), "utf8")),
      "Deploy the verified packaged demo manifest",
    );
  }
  const destination = resolve(".build/web-publish");
  const git = (args) =>
    execFileSync("git", args, {
      cwd: destination,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const url = `git@github.com:${repository}.git`;
  const branch = git(["ls-remote", "--heads", url, "refs/heads/gh-pages"]);
  if (branch.trim())
    git(["clone", "--depth", "1", "--single-branch", "--branch", "gh-pages", url, "."]);
  else {
    git(["init", "-b", "gh-pages"]);
    git(["remote", "add", "origin", url]);
  }
  if (demosOnly) {
    // The landing repository owns its copy, download link and domain configuration.
    await cp(source, resolve(destination, "assets/demos"), { recursive: true });
  } else {
    // Preserve immutable asset URLs so existing tabs can lazy-load their calculators.
    for (const entry of await readdir(destination)) {
      if (entry === ".git" || entry === "assets" || entry === "CNAME") continue;
      await rm(resolve(destination, entry), { recursive: true, force: true });
    }
    await cp(source, destination, { recursive: true });
  }
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  git(["add", "--all"]);
  if (git(["status", "--porcelain"]).trim()) {
    git([
      "commit",
      "-m",
      `Deploy Makeshift ${demosOnly ? "demos " : ""}${metadata.tag} (${metadata.commit})`,
    ]);
    // Never force: a competing writer must fail visibly, not replace a newer deployment.
    git(["push", "origin", "HEAD:gh-pages"]);
  }
  console.log(`Published ${metadata.tag} to ${repository}:gh-pages`);
}
