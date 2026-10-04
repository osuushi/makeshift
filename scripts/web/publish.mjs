import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repository = process.env.WEB_PAGES_REPOSITORY;
const key = process.env.WEB_PAGES_DEPLOY_KEY;
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
  await writeFile(identity, key, { mode: 0o600 });
  // Get GitHub's public host keys over authenticated HTTPS, rather than trusting ssh-keyscan.
  const response = await fetch("https://api.github.com/meta");
  if (!response.ok) throw new Error("Could not verify GitHub SSH host keys");
  const metadata = await response.json();
  if (!Array.isArray(metadata.ssh_keys) || !metadata.ssh_keys.length)
    throw new Error("Missing GitHub host keys");
  await writeFile(hosts, metadata.ssh_keys.map((host) => `github.com ${host}\n`).join(""));
  await publish({
    ...process.env,
    GIT_SSH_COMMAND: `ssh -F /dev/null -i '${identity}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile='${hosts}'`,
    GIT_TERMINAL_PROMPT: "0",
  });
} finally {
  await rm(credentials, { recursive: true, force: true });
}

async function publish(env) {
  const source = resolve(".build/web");
  const metadata = JSON.parse(await readFile(resolve(source, "build.json"), "utf8"));
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
  // Preserve immutable asset URLs so an already-open older tab can still lazy-load its calculators.
  for (const entry of await readdir(destination)) {
    if (entry === ".git" || entry === "assets" || entry === "CNAME") continue;
    await rm(resolve(destination, entry), { recursive: true, force: true });
  }
  await cp(source, destination, { recursive: true });
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  git(["add", "--all"]);
  if (git(["status", "--porcelain"]).trim()) {
    git(["commit", "-m", `Deploy Makeshift ${metadata.tag} (${metadata.commit})`]);
    // Never force: a competing writer must fail visibly, not replace a newer deployment.
    git(["push", "origin", "HEAD:gh-pages"]);
  }
  console.log(`Published ${metadata.tag} to ${repository}:gh-pages`);
}
