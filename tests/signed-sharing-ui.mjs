import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentArchive } from "../.build/host/model/document-archive.js";
import {
  readPortableArchive,
  writePortableArchive,
} from "../.build/host/model/portable-archive.js";
import { createIdentity, signContent } from "../.build/host/security/identity.js";
import { decoratorDigest, portableDigest, verified } from "../.build/host/security/signatures.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The document window, menu, workspace, and file codec are real. Native dialogs return the specified user decision.
const directory = await mkdtemp(join(tmpdir(), "makeshift-trust-"));
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  const bob = await createIdentity("Bob"),
    doc = {
      units: "mm",
      sketches: [],
      decoratorDefinitions: [
        JSON.parse(await readFile("examples/decorators/raised-pad.json", "utf8")),
      ],
    };
  const encoder = new TextEncoder();
  const archivedPreview = page.getByRole("button", { name: "Archived preview", exact: true });
  const files = {
    "workspace/notes.txt": encoder.encode("Fixture drawing notes"),
    "workspace/preview/index.html": encoder.encode("<h1>Archived preview content</h1>"),
    "workspace/preview/.makeshift-pane.json": encoder.encode(
      JSON.stringify({ open: true, title: "Archived preview" }),
    ),
  };
  const workspace = await signContent(bob, "workspace", await portableDigest(files), bob);
  const decorators = await signContent(bob, "decorators", await decoratorDigest(doc), bob);
  const incoming = join(directory, "from-bob.makeshift"),
    copy = join(directory, "geometry-edit.makeshift"),
    clean = join(directory, "shared.makeshift");
  await writeFile(
    incoming,
    writePortableArchive(documentArchive(doc), files, { workspace, decorators }),
  );
  await app.evaluate(({ dialog }) => {
    globalThis.securityMessages = [];
    globalThis.securityIconSizes = [];
    dialog.showMessageBox = async (_w, options) => {
      globalThis.securityMessages.push(options.message);
      if (options.icon) globalThis.securityIconSizes.push(options.icon.getSize());
      if (
        options.message === "Use the included agent workspace?" &&
        globalThis.securityMessages.length === 1
      )
        return { response: 0 };
      return {
        response: options.buttons.includes("Trust this version")
          ? options.buttons.indexOf("Trust this version")
          : 0,
      };
    };
  });
  await openDocument(page, incoming);
  assert.equal(await archivedPreview.count(), 0);
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }))).workspace,
    null,
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [-10, -6], [10, 6]);
  await settled(page);
  await saveDocument(page, copy);
  const saved = readPortableArchive(await readFile(copy));
  assert.deepEqual(saved.seals, { workspace, decorators });
  assert.equal(saved.document.sketches.length, 1);
  assert.deepEqual(await app.evaluate(() => globalThis.securityMessages), []);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, clean);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export without agent workspace…" }).click();
  await page.waitForFunction(() => !window.makeshiftInspect().busy);
  const exported = readPortableArchive(await readFile(clean));
  assert.deepEqual(exported.files, {});
  assert.deepEqual(exported.seals, { decorators });
  assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).path, copy);
  // Use a harmless local harness in the isolated test profile.
  await page.evaluate(
    (executable) =>
      window.makeshiftAgent.request({
        kind: "configure",
        preferences: {
          preset: "custom",
          executable,
          args: executable === "cmd.exe" ? ["/d", "/q"] : [],
          env: {},
        },
      }),
    process.platform === "win32" ? "cmd.exe" : "/bin/cat",
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.getByText("The included agent workspace is disabled.", { exact: true }).waitFor();
  assert.equal(await archivedPreview.count(), 0);
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }))).workspace,
    null,
  );
  const entities = page.locator('[data-pane="Entities"] .entity-viewer');
  assert.ok(
    await entities.evaluate((list) => list.clientHeight === list.parentElement.clientHeight),
    "the Entities list fills its pane while the agent terminal is open",
  );
  assert.deepEqual(await app.evaluate(() => globalThis.securityIconSizes), [
    { width: 144, height: 144 },
  ]);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await archivedPreview.waitFor();
  const state = await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }));
  assert.equal(await readFile(join(state.workspace, "notes.txt"), "utf8"), "Fixture drawing notes");
  assert.deepEqual(await app.evaluate(() => globalThis.securityMessages), [
    "Use the included agent workspace?",
    "Use the included agent workspace?",
  ]);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[data-start]").disabled);
  assert.equal(
    (await page.evaluate(() => window.makeshiftDocument.command("save"))).error,
    undefined,
  );
  assert.deepEqual(readPortableArchive(await readFile(copy)).seals, { workspace, decorators });
  assert.deepEqual(await app.evaluate(() => globalThis.securityMessages), [
    "Use the included agent workspace?",
    "Use the included agent workspace?",
  ]);
  await verifyEndorsement(app, page, state.workspace, copy, workspace, decorators);
  await verifyUsedDecorators(app, page, bob, doc);
  console.log(
    "PASS signed shared drawing through geometry edit, Save As, clean export and delayed agent activation",
  );
} finally {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2 });
  });
  try {
    await app.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// The unsigned path also covers headless Linux environments without a protected key store.
async function verifyEndorsement(app, page, folder, path, oldSeal, decorators) {
  await writeFile(join(folder, "notes.txt"), "Reviewed fixture notes");
  await page.waitForFunction(async () => (await window.makeshiftDocument.status()).edited);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_w, options) => {
      globalThis.lastPublication = options;
      const label = options.buttons.includes("Sign with my key")
        ? "Sign with my key"
        : "Save unsigned";
      return { response: options.buttons.indexOf(label) };
    };
  });
  const result = await page.evaluate(() => window.makeshiftDocument.command("save"));
  assert.equal(result.error, undefined);
  await page.waitForFunction(async () => !(await window.makeshiftDocument.status()).edited);
  const saved = readPortableArchive(await readFile(path));
  const { message, detail } = await app.evaluate(() => ({
    message: globalThis.lastPublication.message,
    detail: globalThis.lastPublication.detail,
  }));
  assert.deepEqual(saved.seals.decorators, decorators);
  if (message === "Signing key unavailable") {
    assert.equal(saved.seals.workspace, undefined);
    console.log("PASS unsigned fallback with unavailable system key store");
  } else {
    assert.match(detail, /previous version was signed by Bob/);
    assert.match(detail, /personally vouch/);
    assert.notEqual(saved.seals.workspace.key, oldSeal.key);
    assert(await verified("workspace", await portableDigest(saved.files), saved.seals.workspace));
    console.log("PASS explicit endorsement and new verified workspace signer");
  }
}

async function verifyUsedDecorators(app, page, bob, doc) {
  const fixture = JSON.parse(await readFile("tests/fixtures/thread-flat-boundary.json", "utf8"));
  const body = fixture.document.bodies[0];
  const definition = doc.decoratorDefinitions[0];
  const model = {
    ...doc,
    bodies: [body],
    decorators: [
      {
        id: "applied-pad",
        definition: definition.id,
        version: definition.version,
        faces: [{ body: body.id, face: body.faces.find((f) => f.plane).id }],
        frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
        settings: { width: 2, height: 1 },
      },
    ],
  };
  const seal = await signContent(bob, "decorators", await decoratorDigest(model), bob);
  const path = join(directory, "applied.makeshift");
  await writeFile(path, writePortableArchive(documentArchive(model), {}, { decorators: seal }));
  await app.evaluate(({ dialog }) => {
    globalThis.questions = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.questions.push(options);
      return {
        response:
          globalThis.questions.length === 1 ? 0 : options.buttons.indexOf("Trust this version"),
      };
    };
  });
  await openDocument(page, path);
  const state = await page.evaluate(() => window.makeshiftModel({ kind: "read" }));
  const questions = await app.evaluate(() =>
    globalThis.questions.map((q) => [q.message, q.detail]),
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0][0], "Allow embedded custom decorators?");
  assert.match(questions[0][1], /Signed by Bob/);
  assert.equal(state.view.decoratorSources.length, 0);
  const accepted = await page.evaluate(
    ({ id, version }) =>
      window.makeshiftModel({ kind: "decorator-enable", id, version, enabled: true }),
    definition,
  );
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.view.decoratorSources[0].source, definition.source);
  console.log("PASS applied decorator stays disabled on decline and enables after trust");
}
