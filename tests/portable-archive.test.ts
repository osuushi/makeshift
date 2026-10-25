import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "three/addons/libs/fflate.module.js";
import { AgentWorkspace } from "../src/host/agent-workspace.js";
import { codexResumeArgs } from "../src/host/codex-workspace.js";
import { workspaceSnapshot } from "../src/host/workspace-files.js";
import { recoverWorkspaceFiles } from "../src/host/workspace-recovery.js";
import { documentArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";

const document = { units: "mm" as const, sketches: [] };
const model = documentArchive(document);

test("the former portable ZIP tag keeps attached files and conversation bytes", () => {
  const files = {
    "workspace/old-script.ts": strToU8("await freac.decorators();"),
    "conversations/codex/sessions/old.jsonl": strToU8('{"type":"session_meta"}\n'),
  };
  const legacy = zipSync({
    "model.json": strToU8(JSON.stringify({ format: "freac", version: 2, document })),
    ...files,
  });
  assert.deepEqual(readPortableArchive(legacy), { document, files });
});

test("portable ZIP and legacy archives retain model, binary files and conversations", () => {
  const files = {
    "workspace/notes.md": strToU8("Keep a 3 mm wall.\n"),
    "workspace/binary.dat": new Uint8Array([0, 255, 1, 128]),
    "conversations/codex/sessions/2026/09/20/rollout.jsonl": strToU8('{"type":"response_item"}\n'),
  };
  const archive = readPortableArchive(writePortableArchive(model, files));
  assert.deepEqual(archive.document, document);
  assert.deepEqual(archive.files, files);
  assert.deepEqual(readPortableArchive(strToU8(model)), { document, files: {} });
  const camera = {
    position: [10, 20, 30] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    height: 55,
  };
  assert.deepEqual(
    readPortableArchive(writePortableArchive(documentArchive(document, camera), files)).camera,
    camera,
  );
  const damaged = writePortableArchive(model, files);
  damaged[40] ^= 1;
  assert.throws(() => readPortableArchive(damaged), /Damaged archive/);
});

test("resume chooses the last active main conversation, not a newer subagent", () => {
  const entry = (id: string, created: string, active: string, source: unknown) =>
    strToU8(
      [
        JSON.stringify({ type: "session_meta", timestamp: created, payload: { id, source } }),
        JSON.stringify({ type: "event_msg", timestamp: active, payload: {} }),
      ].join("\n"),
    );
  const first = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const second = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
  const files = {
    "conversations/codex/sessions/older.jsonl": entry(first, "2026-09-19", "2026-09-21", "cli"),
    "conversations/codex/sessions/newer.jsonl": entry(second, "2026-09-20", "2026-09-20", "cli"),
    "conversations/codex/sessions/child.jsonl": entry(second, "2026-09-22", "2026-09-22", {
      subagent: "thread",
    }),
  };
  assert.deepEqual(codexResumeArgs(files, "/new"), ["resume", first, "--cd", "/new"]);
});

test("recovery imports a first-increment workspace and only its matching conversation", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-old-workspace-"));
  try {
    const old = join(root, "workspaces", "document-old"),
      home = join(root, "codex");
    await mkdir(old, { recursive: true });
    await mkdir(join(home, "sessions"), { recursive: true });
    await writeFile(join(old, "notes.md"), "old notes");
    for (const [name, cwd] of [
      ["matching", old],
      ["other", root],
    ])
      await writeFile(
        join(home, "sessions", `${name}.jsonl`),
        JSON.stringify({ type: "session_meta", payload: { cwd } }),
      );
    const files = await recoverWorkspaceFiles(old, home);
    assert.deepEqual(Object.keys(files).sort(), [
      "conversations/codex/sessions/matching.jsonl",
      "workspace/notes.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archives reject escapes, ambiguous names, private harness data, symlinks and oversized expansion", () => {
  for (const path of [
    "workspace/../escape",
    "workspace/\\escape",
    "workspace/C:bad",
    "workspace/NUL",
    "conversations/codex/auth.json",
  ]) {
    assert.throws(() =>
      readPortableArchive(
        zipSync({
          "model.json": strToU8('{"format":"makeshift","version":2,"document":{}}'),
          [path]: strToU8("x"),
        }),
      ),
    );
  }
  assert.throws(() =>
    writePortableArchive(model, { "workspace/A": strToU8("a"), "workspace/a": strToU8("b") }),
  );
  assert.throws(() =>
    writePortableArchive(model, { "workspace/a": strToU8("a"), "workspace/a/b": strToU8("b") }),
  );
  const zip = zipSync({ "model.json": strToU8("{}") });
  const view = new DataView(zip.buffer);
  const central = view.getUint32(zip.length - 6, true);
  view.setUint32(central + 38, 0xa000 << 16, true);
  assert.throws(() => readPortableArchive(zip), /regular files/);
  view.setUint32(central + 38, 0, true);
  view.setUint32(central + 24, 2 * 1024 * 1024 * 1024 + 1, true);
  assert.throws(() => readPortableArchive(zip), /2 GiB/);
});

test("workspace dirty state, extraction and conversation-only changes exclude machine data", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-portable-test-"));
  const workspace = new AgentWorkspace(root);
  try {
    await workspace.ensure();
    const cwd = workspace.cwd,
      home = workspace.codexHome;
    assert(cwd && home && workspace.root);
    await writeFile(join(cwd, "note.txt"), "hello");
    await writeFile(join(home, "auth.json"), "secret");
    await writeFile(join(home, "config.toml"), "secret");
    await mkdir(join(home, "sessions"));
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await writeFile(
      join(home, "sessions", "rollout.jsonl"),
      `${JSON.stringify({
        type: "session_meta",
        timestamp: "2026-09-20",
        payload: { id, cwd: "/old-machine", source: "cli" },
      })}\n`,
    );
    await workspace.refresh();
    assert.equal(workspace.dirty, true);
    const files = await workspace.snapshot();
    assert.deepEqual(Object.keys(files).sort(), [
      "conversations/codex/sessions/rollout.jsonl",
      "workspace/note.txt",
    ]);
    assert.deepEqual(codexResumeArgs(files, cwd), ["resume", id, "--cd", cwd]);
    workspace.saved(files);
    await workspace.refresh();
    assert.equal(workspace.dirty, false);
    await writeFile(join(home, "sessions", "rollout.jsonl"), "changed\n");
    await workspace.refresh();
    assert.equal(workspace.dirty, true);
    const restored = await workspace.prepare(files);
    assert.equal(await readFile(join(restored, "workspace", "note.txt"), "utf8"), "hello");
    if (process.platform !== "win32") {
      await symlink(join(root, "outside"), join(cwd, "link"));
      assert.equal((await workspaceSnapshot(workspace.root))["workspace/link"], undefined);
    }
  } finally {
    workspace.adopt(null, {});
    await rm(root, { recursive: true, force: true });
  }
});

test("archives round-trip beyond the former byte and file-count limits", () => {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < 4100; i++) files[`workspace/file-${i}`] = new Uint8Array();
  files["workspace/large.bin"] = new Uint8Array(65 * 1024 * 1024).fill(42);
  const archive = readPortableArchive(writePortableArchive(model, files));
  assert.deepEqual(archive.files, files);
  assert.deepEqual(archive.document, document);
});

test("local Python environments and links do not block saving or leave the workspace dirty", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-local-runtime-"));
  const workspace = new AgentWorkspace(root);
  try {
    await workspace.ensure();
    const cwd = workspace.cwd;
    assert(cwd);
    await mkdir(join(cwd, ".dxf-venv", "bin"), { recursive: true });
    await writeFile(join(cwd, ".dxf-venv", "pyvenv.cfg"), "home = /local/python\n");
    await writeFile(join(cwd, ".dxf-venv", "bin", "activate"), "local runtime");
    await writeFile(join(cwd, "drawing.dxf"), "project data");
    await writeFile(join(cwd, "requirements.txt"), "ezdxf\n");
    if (process.platform !== "win32") {
      await symlink("/missing/python", join(cwd, ".dxf-venv", "bin", "python"));
      await symlink(root, join(cwd, "outside"));
      await symlink("/missing/target", join(cwd, "dangling"));
    }
    const files = await workspace.snapshot();
    assert.deepEqual(Object.keys(files).sort(), [
      "workspace/drawing.dxf",
      "workspace/requirements.txt",
    ]);
    const archive = readPortableArchive(writePortableArchive(model, files));
    assert.deepEqual(archive.document, document);
    assert.deepEqual(
      archive.files,
      Object.fromEntries(
        Object.entries(files).map(([path, bytes]) => [path, new Uint8Array(bytes)]),
      ),
    );
    workspace.saved(files);
    await workspace.refresh();
    assert.equal(workspace.error, undefined);
    assert.equal(workspace.dirty, false);
    await writeFile(join(cwd, ".dxf-venv", "bin", "activate"), "changed local runtime");
    await workspace.refresh();
    assert.equal(workspace.dirty, false);
    assert.equal(
      await readFile(join(cwd, ".dxf-venv", "pyvenv.cfg"), "utf8"),
      "home = /local/python\n",
    );
    await writeFile(join(cwd, "drawing.dxf"), "edited project data");
    await workspace.refresh();
    assert.equal(workspace.dirty, true);
  } finally {
    workspace.adopt(null, {});
    await rm(root, { recursive: true, force: true });
  }
});
