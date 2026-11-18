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
import {
  decoratorDigest,
  fingerprint,
  portableDigest,
  verified,
} from "../.build/host/security/signatures.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Exercise the actual modal used for signed prompts and click its decisions.
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
  const expected = await fingerprint(bob.key);
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
  assert.ok(app.windows().every((window) => !window.url().endsWith("/trust.html")));
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
  const firstPrompt = nextTrustPrompt(app);
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  const canceled = await checkedPrompt(
    await firstPrompt,
    "Use the included agent workspace?",
    expected,
  );
  await canceled.screenshot({ path: ".cache/sketch-review/signed-workspace-trust.png" });
  await canceled.keyboard.press("Escape").catch((error) => {
    if (!canceled.isClosed()) throw error;
  });
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
  const retry = nextTrustPrompt(app);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const approved = await checkedPrompt(await retry, "Use the included agent workspace?", expected);
  await approved.getByRole("button", { name: "Trust this version", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await archivedPreview.waitFor();
  const state = await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }));
  assert.equal(await readFile(join(state.workspace, "notes.txt"), "utf8"), "Fixture drawing notes");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[data-start]").disabled);
  assert.equal(
    (await page.evaluate(() => window.makeshiftDocument.command("save"))).error,
    undefined,
  );
  assert.deepEqual(readPortableArchive(await readFile(copy)).seals, { workspace, decorators });
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

function nextTrustPrompt(app) {
  return app.context().waitForEvent("page", {
    timeout: 12000,
    predicate: async (page) => {
      await page.waitForURL(/\/trust\.html$/, { timeout: 3000 }).catch(() => {});
      return page.url().endsWith("/trust.html");
    },
  });
}

async function checkedPrompt(page, title, expected) {
  await page.waitForURL(/\/trust\.html$/);
  const prompt = page.getByRole("dialog", { name: title });
  const picture = prompt.getByRole("img", { name: "Public key fingerprint" });
  await picture.waitFor();
  await picture.evaluate((img) => img.decode());
  const [image, text, actions] = await Promise.all([
    picture.boundingBox(),
    prompt.locator("code").boundingBox(),
    prompt.locator(".trust-actions").boundingBox(),
  ]);
  const height = await page.evaluate(() => innerHeight);
  assert.ok(image.width >= 120 && image.y + image.height <= height);
  assert.ok(text.y + text.height <= height && actions.y + actions.height <= height);
  if (expected) assert.equal(await prompt.locator("code").textContent(), expected);
  return page;
}

// The unsigned path also covers headless Linux environments without a protected key store.
async function verifyEndorsement(app, page, folder, path, oldSeal, decorators) {
  await writeFile(join(folder, "notes.txt"), "Reviewed fixture notes");
  await page.waitForFunction(async () => (await window.makeshiftDocument.status()).edited);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_w, options) => ({
      response: options.buttons.indexOf("Save unsigned"),
    });
  });
  const publication = nextTrustPrompt(app);
  const saving = page.evaluate(() => window.makeshiftDocument.command("save"));
  const prompt = await Promise.race([publication, saving.then(() => null)]);
  if (prompt) {
    await checkedPrompt(prompt, /^Sign the workspace as /);
    const detail = await prompt.locator(".trust-content p").textContent();
    assert.match(detail, /previous version was signed by Bob/);
    assert.match(detail, /personally vouch/);
    await prompt.getByRole("button", { name: "Sign with my key", exact: true }).click();
  }
  assert.equal((await saving).error, undefined);
  await page.waitForFunction(async () => !(await window.makeshiftDocument.status()).edited);
  const saved = readPortableArchive(await readFile(path));
  assert.deepEqual(saved.seals.decorators, decorators);
  if (!prompt) {
    assert.equal(saved.seals.workspace, undefined);
    console.log("PASS unsigned fallback with unavailable system key store");
  } else {
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
  const expected = await fingerprint(bob.key);
  const firstPrompt = nextTrustPrompt(app);
  const opening = openDocument(page, path);
  void opening.catch(() => {});
  const declined = await checkedPrompt(
    await firstPrompt,
    "Allow embedded custom decorators?",
    expected,
  );
  await declined.getByText(/Signed by Bob/).waitFor();
  await declined.getByRole("button", { name: "Cancel", exact: true }).click();
  await opening;
  const state = await page.evaluate(() => window.makeshiftModel({ kind: "read" }));
  assert.equal(state.view.decoratorSources.length, 0);
  const secondPrompt = nextTrustPrompt(app);
  const enabling = page.evaluate(
    ({ id, version }) =>
      window.makeshiftModel({ kind: "decorator-enable", id, version, enabled: true }),
    definition,
  );
  const approved = await checkedPrompt(
    await secondPrompt,
    "Allow embedded custom decorators?",
    expected,
  );
  await approved.getByRole("button", { name: "Trust this version", exact: true }).click();
  const accepted = await enabling;
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.view.decoratorSources[0].source, definition.source);
  console.log("PASS applied decorator stays disabled on decline and enables after trust");
}
