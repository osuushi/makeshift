import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { agentDecoratorRoute } from "./agent-decorator-route.mjs";
import { agentModelingRoute } from "./agent-modeling-route.mjs";
import { agentPathRoute } from "./agent-path-route.mjs";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { agentSolidRoute } from "./agent-solid-route.mjs";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const [name] = runtimeNames(undefined, ["electron"]);
let app,
  web,
  page,
  workspace,
  counter = 0,
  scriptOutput = "";
const box = `const p = [{x:-10,y:-10},{x:10,y:-10},{x:10,y:10},{x:-10,y:10}];
const s = await makeshift.createSketch({plane:"XY",curves:p.map((a,i)=>({kind:"segment",a,b:p[(i+1)%4]}))});
await makeshift.extrude({sources:s.profiles,distance:10,mode:"new"});`;
try {
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    await page.evaluate(() =>
      window.makeshiftAgent.request({
        kind: "configure",
        preferences: {
          preset: "custom",
          executable: "/bin/sh",
          args: ["-i"],
          env: {},
        },
      }),
    );
    await page.getByRole("button", { name: "Open agent terminal" }).click();
    await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
    workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
      .workspace;
  } else {
    web = await scriptBrowser(name);
    ({ page, workspace } = web);
  }
  page.setDefaultTimeout(20000);
  await settled(page);
  const empty = (await inspect(page)).document;
  await run(
    'if (freac !== makeshift) throw new Error("Legacy scripting alias changed"); await freac.decorators();',
  );
  assert.deepEqual((await inspect(page)).document, empty);
  await assert.rejects(
    () => run('await makeshift.extrude({sources:[], distance:"bad", mode:"new"});'),
    /typecheck failed/,
  );
  assert.deepEqual((await inspect(page)).document, empty);
  const solidResult = await agentSolidRoute(page, run, name);
  await agentModelingRoute(page, run);
  const pathResult = await agentPathRoute(page, run, name);
  await agentDecoratorRoute(page, run);
  await run(box);
  const made = (await inspect(page)).document;
  assert.equal(made.sketches.length, 1);
  assert(Math.abs(made.bodies[0].volume - 4000) < 1e-6);
  assert.equal((await history()).filter((e) => e.state === "applied").length, 1);
  await undo();
  assert.deepEqual((await inspect(page)).document, empty);
  await redo();
  assert.deepEqual((await inspect(page)).document, made);

  await orient(page, [0.4, -1, 0.7]);
  const chosen = await pick(page, [-5, -10, 4]);
  assert.equal(chosen.modelingSelection[0].kind, "face");
  await run(`const faces = makeshift.selection.filter(t=>t.kind==="face");
if(faces.length!==1) throw new Error("Expected selected face");
await makeshift.offsetFaces({faces,distance:2});`);
  const offset = (await inspect(page)).document;
  assert(Math.abs(offset.bodies[0].volume - 4400) < 1e-6);
  await undo();
  assert.deepEqual((await inspect(page)).document, made);
  await redo();
  assert.deepEqual((await inspect(page)).document, offset);
  // The ordinary manual tool remains usable on the script's accepted result.
  await pick(page, [-5, -12, 4]);
  await page.getByRole("textbox", { name: "Face offset distance", exact: true }).fill("1");
  await settled(page);
  const preview = (await inspect(page)).preview;
  await run("void makeshift.selection;");
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual((await inspect(page)).document, preview);
  await settled(page);
  assert(Math.abs((await inspect(page)).document.bodies[0].volume - 4600) < 1e-6);
  await undo();
  assert.deepEqual((await inspect(page)).document, offset);
  const before = (await inspect(page)).document;
  assert((await history()).some((e) => e.state === "undone"));
  await assert.rejects(
    () => run(`${box}\nthrow new Error("deliberate failure");`),
    /deliberate failure/,
  );
  assert((await history()).some((e) => e.outcome === "failed" && e.error === "deliberate failure"));
  assert.deepEqual((await inspect(page)).document, before);
  assert((await history()).some((e) => e.state === "undone"));
  await assert.rejects(
    () => run(`${box}\nawait makeshift.offsetFaces({faces:[],distance:NaN});`),
    /Invalid script face offset/,
  );
  assert.deepEqual((await inspect(page)).document, before);
  const applied = (await history()).filter((e) => e.state === "applied").length;
  await run("void makeshift.selection;");
  assert.equal((await history()).filter((e) => e.state === "applied").length, applied);
  const waiting = run(`${box}\nconsole.error("candidate ready"); while (true) {}`);
  const cancellation = assert.rejects(() => waiting, /ended|closed|cancelled/);
  await page.getByRole("button", { name: "Cancel script", exact: true }).waitFor();
  await candidateReady();
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), before);
  const camera = await page.evaluate(() => window.makeshiftInspect().camera);
  const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(30, 25);
  await page.waitForFunction(
    (old) => JSON.stringify(window.makeshiftInspect().camera) !== JSON.stringify(old),
    camera,
  );
  await page.getByRole("button", { name: "Cancel script", exact: true }).click();
  await cancellation;
  assert.deepEqual((await inspect(page)).document, before);
  if (app) {
    const interrupted = run(`${box}\nconsole.error("candidate ready"); while (true) {}`);
    const rejected = assert.rejects(() => interrupted, /interrupted|exited/);
    await page.getByRole("button", { name: "Cancel script", exact: true }).waitFor();
    await candidateReady();
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.press("Control+c");
    await rejected;
    assert.deepEqual((await inspect(page)).document, before);
  }
  assert((await history()).some((e) => e.state === "undone"));
  await redo();
  assert(Math.abs((await inspect(page)).document.bodies[0].volume - 4600) < 1e-6);
  await mkdir(".cache/sketch-review", { recursive: true });
  await page.screenshot({ path: `.cache/sketch-review/${name}-agent-script.png` });
  if (app) {
    const file = resolve(".cache/sketch-review/agent-script.makeshift");
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" }));
    await saveDocument(page, file);
    const archive = readPortableArchive(await readFile(file));
    assert.equal(
      new TextDecoder().decode(
        Object.values(archive.files).find((data) => new TextDecoder().decode(data) === box),
      ),
      box,
    );
    await chooseTool(page, "new document", "new");
    await settled(page);
    await openDocument(page, file);
    assert(Math.abs((await inspect(page)).document.bodies[0].volume - 4600) < 1e-6);
    assert.equal((await inspect(page)).document.sketches[0].id, made.sketches[0].id);
  }
  await openDocument(page, pathResult.file);
  const restoredPath = (await inspect(page)).document.bodies[0];
  assert.equal(restoredPath.id, pathResult.accepted.bodies[0].id);
  assert.ok(Math.abs(restoredPath.volume - pathResult.accepted.bodies[0].volume) < 1e-6);
  assert.deepEqual(
    restoredPath.faces.map((f) => f.id),
    pathResult.accepted.bodies[0].faces.map((f) => f.id),
  );
  console.log(`PASS ${name}: saved nonplanar sweep reopens with stable topology`);
  await openDocument(page, solidResult.file);
  const restoredSolid = (await inspect(page)).document.bodies;
  assert.deepEqual(
    restoredSolid.map((b) => b.id),
    solidResult.accepted.bodies.map((b) => b.id),
  );
  for (let i = 0; i < restoredSolid.length; i++) {
    assert.ok(Math.abs(restoredSolid[i].volume - solidResult.accepted.bodies[i].volume) < 1e-6);
    assert.deepEqual(
      restoredSolid[i].faces.map((f) => f.id),
      solidResult.accepted.bodies[i].faces.map((f) => f.id),
    );
  }
  console.log(`PASS ${name}: saved agent solid tools reopen with stable topology`);
  console.log(
    `PASS ${name}: typed CLI creation and selected face edit, grouped Undo/Redo, manual re-edit, type/runtime error rollback, cancellation, no-op and preserved Redo`,
  );
} finally {
  if (app) {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
    await app.close();
  }
  await web?.close();
}
async function history() {
  return page.evaluate(() => window.makeshiftHistory());
}
async function undo() {
  await chooseTool(page, "undo", "undo");
  await settled(page);
}
async function redo() {
  await chooseTool(page, "redo", "redo");
  await settled(page);
}
async function run(source) {
  scriptOutput = "";
  const prefix = `script-${++counter}`;
  await writeFile(join(workspace, `${prefix}.ts`), source);
  if (web) {
    try {
      const pending = promisify(execFile)(web.env.MAKESHIFT_CLI, ["run", `${prefix}.ts`], {
        cwd: workspace,
        env: web.env,
        timeout: 30000,
      });
      pending.child.stderr.on("data", (data) => {
        scriptOutput += data;
      });
      const { stdout } = await pending;
      await page.waitForFunction(
        () => !document.querySelector(".calculation-progress:not([hidden])"),
      );
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(error.stderr || error.message);
    }
  }
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    `makeshift run ${prefix}.ts > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
  );
  await page.keyboard.press("Enter");
  for (let i = 0; i < 1000; i++) {
    let exit;
    try {
      exit = await readFile(join(workspace, `${prefix}.done`), "utf8");
    } catch {}
    if (exit) {
      if (exit !== "0") throw new Error(await readFile(join(workspace, `${prefix}.err`), "utf8"));
      return JSON.parse(await readFile(join(workspace, `${prefix}.json`), "utf8"));
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Script CLI did not finish");
}

async function candidateReady() {
  for (let i = 0; i < 400; i++) {
    const output = web
      ? scriptOutput
      : await readFile(join(workspace, `script-${counter}.err`), "utf8").catch(() => "");
    if (output.includes("candidate ready")) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Script did not reach its post-geometry loop");
}
