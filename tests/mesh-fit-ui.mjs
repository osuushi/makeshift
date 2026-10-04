import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { smoothShape } from "../.cache/sketch-tests/tests/mesh-fit-shapes.js";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixtures = [
  {
    name: "sphere",
    source: await readFile("docs/examples/mesh-fitting.ts", "utf8"),
    volume: (4000 * Math.PI) / 3,
    point: [3, -9, 2],
  },
  {
    name: "bend",
    source: `await makeshift.fitMesh(${JSON.stringify(smoothShape(([x, y, z]) => [6 * x + 12 * z * z, 6 * y, 20 * z], 4))});`,
    volume: (4 * Math.PI * 6 * 6 * 20) / 3,
    point: [2.08, -5.66, 4.71],
  },
];
await mkdir(".cache/mesh-fit-ui", { recursive: true });
for (const fixture of fixtures) for (const name of runtimeNames()) await runtime(name, fixture);

async function runtime(name, fixture) {
  let app, web, page, workspace;
  try {
    if (name === "electron") {
      app = await launchElectron({
        args: ["."],
        env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
      });
      page = await app.firstWindow();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      await page.setViewportSize({ width: 1280, height: 850 });
      await page.evaluate(() =>
        window.makeshiftAgent.request({
          kind: "configure",
          preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
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
    const context = { page, workspace, web };
    await route(context, `${name}-${fixture.name}`, fixture);
  } finally {
    if (app) {
      await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
      await app.close();
    }
    await web?.close();
  }
}

async function route(context, name, fixture) {
  const { source, volume, point } = fixture;
  const { page } = context;
  const original = (await inspect(page)).document;
  await run(context, source, "fit");
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  assert(accepted.bodies[0].faces.length < 100);
  assert(Math.abs(accepted.bodies[0].volume / volume - 1) < 0.035);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.keyboard.press("Escape");
  await orient(page, [0.3, -1, 0.35]);
  const selected = await pick(page, point);
  assert.equal(selected.modelingSelection[0]?.kind, "face");
  await page.keyboard.press("Escape");
  const again = await pick(page, point);
  assert.equal(again.modelingSelection[0]?.face, selected.modelingSelection[0].face);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("3");
  await page.keyboard.press("Enter");
  assert(
    Math.abs(
      (await inspect(page)).document.bodies[0].center[0] - accepted.bodies[0].center[0] - 3,
    ) < 1e-6,
  );
  await chooseTool(page, "undo", "undo");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.screenshot({ path: `.cache/mesh-fit-ui/${name}.png` });
  const archive = resolve(`.cache/mesh-fit-ui/${name}.makeshift`);
  await saveDocument(page, archive);
  await openDocument(page, archive);
  const reopened = (await inspect(page)).document;
  assert.equal(reopened.bodies[0].id, accepted.bodies[0].id);
  assert.deepEqual(
    reopened.bodies[0].faces.map((f) => f.id),
    accepted.bodies[0].faces.map((f) => f.id),
  );
  assert(Math.abs(reopened.bodies[0].volume - accepted.bodies[0].volume) < 1e-6);
  await rollback(context, reopened, source);
  console.log(
    `PASS ${name}: typed fitMesh, selection/reselection, movement, Undo/Redo, archive, rollback, cancellation and Delete/Undo`,
  );
}

async function rollback(context, reopened, source) {
  const { page } = context;
  // Failure must roll back the entire script, including a preceding successful fit.
  await assert.rejects(
    run(
      context,
      `${source}\nawait makeshift.fitMesh({mesh:{vertices:[],triangles:[]},layout:{vertices:[],quads:[]},tolerance:0.1});`,
      "reject",
    ),
    /mesh fitting|Mesh fitting/,
  );
  assert.deepEqual((await inspect(page)).document, reopened);
  const cancellation = run(context, source, "cancel").then(
    () => null,
    (error) => error,
  );
  await page.getByRole("button", { name: "Cancel script", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel script", exact: true }).click();
  assert(await cancellation, "Cancelled script must not report success");
  assert.deepEqual((await inspect(page)).document, reopened);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Backspace");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies[0].id, reopened.bodies[0].id);
}

async function run({ page, workspace, web }, text, name) {
  const prefix = `mesh-${name}`;
  await writeFile(join(workspace, `${prefix}.ts`), text);
  let error;
  if (web) {
    try {
      await promisify(execFile)(web.env.MAKESHIFT_CLI, ["run", `${prefix}.ts`], {
        cwd: workspace,
        env: web.env,
        timeout: 120000,
      });
    } catch (failure) {
      error = failure.stderr || failure.message;
    }
  } else {
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(
      `makeshift run ${prefix}.ts > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
    );
    await page.keyboard.press("Enter");
    let exit;
    for (let i = 0; i < 4000; i++) {
      try {
        exit = await readFile(join(workspace, `${prefix}.done`), "utf8");
      } catch {}
      if (exit) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert(exit, "Mesh fitting CLI timed out");
    if (exit !== "0") error = await readFile(join(workspace, `${prefix}.err`), "utf8");
  }
  await page.waitForFunction(() => !document.querySelector(".calculation-progress:not([hidden])"));
  await settled(page);
  if (error) throw new Error(error);
}
