import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { attachAgentFile } from "../src/host/agent-attachments.js";
import { prepareAgentSkills } from "../src/host/agent-skills.js";
import { AgentWorkspace } from "../src/host/agent-workspace.js";

const reference = Buffer.from("arbitrary file bytes");

test("attachments preserve bytes, avoid overwrites and survive workspace reopening", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "makeshift-attachments-")));
  const workspace = new AgentWorkspace(root);
  const reopened = new AgentWorkspace(root);
  try {
    const first = await attachAgentFile(workspace, "photo one.png", reference.toString("base64"));
    const second = await attachAgentFile(workspace, "photo one.png", reference.toString("base64"));
    assert.equal(first, "attachments/photo one.png");
    assert.equal(second, "attachments/photo one (2).png");
    const third = await attachAgentFile(workspace, "PHOTO ONE.PNG", reference.toString("base64"));
    assert.equal(third, "attachments/PHOTO ONE (3).PNG");
    assert.equal(workspace.dirty, true);
    const files = await workspace.snapshot();
    assert.deepEqual(Buffer.from(files[`workspace/${first}`]), reference);
    reopened.adopt(await reopened.prepare(files), files);
    assert.equal(reopened.dirty, false);
    assert(reopened.cwd);
    assert.deepEqual(await readFile(join(reopened.cwd, first)), reference);
    await assert.rejects(attachAgentFile(workspace, "../escape.png", reference.toString("base64")));
    await assert.rejects(attachAgentFile(workspace, "sub/photo.png", reference.toString("base64")));
    await assert.rejects(attachAgentFile(workspace, "bad.png", "AAAA!"));
  } finally {
    workspace.adopt(null, {});
    reopened.adopt(null, {});
    await rm(root, { recursive: true, force: true });
  }
});

test("managed skill is available in the document Codex home without replacing user skills", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "makeshift-skills-")));
  try {
    await mkdir(join(root, "skills", "personal"), { recursive: true });
    await writeFile(join(root, "skills", "personal", "SKILL.md"), "keep");
    await prepareAgentSkills(root, resolve("."));
    const settingsSkill = await readFile(
      join(root, "skills", "makeshift-settings", "SKILL.md"),
      "utf8",
    );
    assert.match(settingsSkill, /name: makeshift-settings/);
    assert.match(settingsSkill, /makeshift settings/);
    const skill = join(root, "skills", "makeshift-mesh-recovery", "SKILL.md");
    assert.match(await readFile(skill, "utf8"), /name: mesh-recovery/);
    await writeFile(skill, "old generated version");
    await prepareAgentSkills(root, resolve("."));
    assert.match(await readFile(skill, "utf8"), /name: mesh-recovery/);
    assert.equal(await readFile(join(root, "skills", "personal", "SKILL.md"), "utf8"), "keep");
    if (process.platform !== "win32") {
      await rm(join(root, "skills", "makeshift-mesh-recovery"), { recursive: true });
      await symlink(
        join(root, "skills", "personal"),
        join(root, "skills", "makeshift-mesh-recovery"),
      );
      await assert.rejects(prepareAgentSkills(root, resolve(".")), /linked path/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
