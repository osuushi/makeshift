import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { checkViewPrograms } from "./agent-view-programs.mjs";
import { queryBrowserInspection } from "./inspection-browser-query.mjs";
import { launchElectron } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect, settled } from "./ui-helpers.mjs";
import { orient, pick, readout } from "./ui-measurement.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const [name] = runtimeNames(undefined, ["electron"]);
let app,
  server,
  browser,
  page,
  workspace,
  counter = 0;
await mkdir(".cache/sketch-review", { recursive: true });
try {
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
  } else {
    server = await createServer({ server: { port: 0, watch: null, hmr: false } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    // Exercise the shared renderer contract; only the desktop supplies its native IPC adapter.
    await page.addInitScript(() => {
      window.makeshiftInspection = {
        onRequest: (callback) => {
          window.readInspection = callback;
          return () => {
            delete window.readInspection;
          };
        },
      };
    });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  await plate(page);
  if (app) {
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
  }
  await clearSelection(page);
  await orient(page, [0.4, -1, 0.7]);
  const chosen = await pick(page, [-5, -10, 4]);
  await readout(page, "Area", "200 mm²");
  const before = await unchanged();
  const selection = await query("selection");
  assert.deepEqual(selection.context.selection, chosen.modelingSelection);
  assert.equal(selection.targets[0].geometry.surface, "plane");
  assert(
    Math.abs(selection.measurement.properties.find((p) => p.label === "Area").value - 200) < 1e-6,
  );
  assert.equal(selection.measurementError, undefined);
  const overview = await query("inspect");
  assert.equal(overview.bodies.length, 1);
  assert(Math.abs(overview.bodies[0].volume - 4000) < 1e-6);
  overview.bodies[0].dimensions.forEach((d, i) => {
    assert(Math.abs(d - [20, 20, 10][i]) < 0.001);
  });
  const face = selection.targets[0].target.face;
  assert.equal((await query("inspect", face)).targets[0].geometry.id, face);
  await assert.rejects(() => query("inspect", "not-a-real-id"), /Unknown geometry ID/);
  const rendered = await query("render");
  assert.equal(rendered.clipping, null);
  assert.deepEqual(rendered.selection, selection.context.selection);
  assert(rendered.width > 200 && rendered.height > 200);
  const imagePath = `.cache/sketch-review/${name}-agent-viewport.png`;
  if (app) await copyFile(rendered.path, imagePath);
  else await writeFile(imagePath, Buffer.from(rendered.image.data.split(",")[1], "base64"));
  const png = await readFile(imagePath);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert(png.length > 5000, "Rendered geometry image must not be a blank thumbnail");
  assert.deepEqual(await unchanged(), before);

  assert.deepEqual((await query("select", "--clear")).context.selection, []);
  const faces = (await query("select", "--surface plane")).context.selection;
  assert.equal(faces.length, 6);
  await query("select", face);
  const second = faces.find((t) => t.face !== face);
  assert.deepEqual((await query("select", `--add ${second.face} ${face}`)).context.selection, [
    selection.targets[0].target,
    second,
  ]);
  await assert.rejects(() => query("select", `${face} missing-id`), /Unknown geometry ID/);
  assert.equal((await query("selection")).context.selection.length, 2);
  assert.deepEqual(
    (await query("select", `--remove ${second.face}`)).context.selection,
    selection.context.selection,
  );
  assert.deepEqual((await inspect(page)).document, before.document);
  assert.deepEqual((await query("selection")).context.camera, selection.context.camera);
  await (await relativeOffsetInput(page)).fill("1");
  const acceptedOffset = (await inspect(page)).preview;
  assert.deepEqual((await query("select", "--clear")).context.selection, []);
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual((await inspect(page)).document, acceptedOffset);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
  if (app) {
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("1");
    const preview = (await inspect(page)).preview;
    await writeFile(join(workspace, "modal-acquisition.ts"), "void makeshift.selection;\n");
    await query("run", "modal-acquisition.ts");
    assert.equal((await inspect(page)).interaction, null);
    assert.deepEqual((await inspect(page)).document, preview);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await settled(page);
  const body = await query("selection");
  assert.equal(body.targets.length, 1);
  assert.equal(body.targets[0].target.kind, "body");
  assert(Math.abs(body.targets[0].geometry.volume - 4000) < 1e-6);
  await clearSelection(page);
  assert.deepEqual((await query("selection")).targets, []);

  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const selectedSketch = await query("selection");
  const sketchGeometry = selectedSketch.targets[0].geometry;
  assert.equal(sketchGeometry.profiles.length, 1);
  assert.deepEqual(sketchGeometry.profiles, overview.sketches[0].profiles);
  assert.deepEqual(
    (await query("inspect", sketchGeometry.id)).targets[0].geometry.profiles,
    sketchGeometry.profiles,
  );
  if (app) {
    const source = `const sources = ${JSON.stringify(sketchGeometry.profiles)}; await makeshift.sweep({sources,path:[{kind:"line",a:[0,0,0],b:[0,0,5]}],mode:"new"});`;
    await writeFile(join(workspace, "inspect-profile-sweep.ts"), source);
    const initial = (await inspect(page)).document;
    await query("run", "inspect-profile-sweep.ts");
    assert.equal((await inspect(page)).document.bodies.length, initial.bodies.length + 1);
    assert.equal((await inspect(page)).document.sketches.length, initial.sketches.length);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, initial);
    console.log(
      "PASS actual CLI whole-sketch inspection to sweep, no replacement sketch, one Undo",
    );
  }
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.keyboard.press("Enter");
  await settled(page);
  await page.keyboard.press("l");
  await drag(page, [-4, 16], [6, 16]);
  const line = await query("selection");
  assert.equal(line.targets[0].target.kind, "curve");
  assert(Math.abs(line.targets[0].geometry.curve.length - 10) < 1e-6);
  const point = await at(page, -4, 16);
  await page.mouse.click(point.x, point.y);
  await settled(page);
  const endpoint = await query("selection");
  assert.equal(endpoint.targets[0].target.kind, "endpoint");
  assert.equal(endpoint.context.selectedPoints.length, 1);
  assert.deepEqual(endpoint.context.selectedPoints[0].position, [-4, 16, 0]);
  assert.equal(endpoint.measurement, null);
  assert.match(endpoint.targets[0].geometry.note, /Point target only/);
  const cutaway = await query("render");
  assert.equal(cutaway.clipping.kind, "visual");
  assert.equal(cutaway.clipping.equations.length, 1);
  await query("select", "--clear");
  const curveId = (await inspect(page)).document.sketches[0].curves[0].id;
  assert.equal((await query("select", curveId)).context.selection[0].kind, "curve");
  await assert.rejects(() => query("select", "--surface cylinder"), /Exit sketch editing/);
  await chooseTool(page, "return to modeling", "modeling");
  const edgeId = (await inspect(page)).document.bodies[0].edges[0].id;
  await query("select", edgeId);
  await page.getByRole("button", { name: "Fillet edges", exact: true }).click();
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("1");
  await settled(page);
  await page.getByRole("button", { name: "Accept fillet", exact: true }).click();
  await settled(page);
  const curved = (await inspect(page)).document;
  const cylinders = curved.bodies.flatMap((b) =>
    b.faces.filter((f) => f.cylinder).map((f) => ({ kind: "face", body: b.id, face: f.id })),
  );
  assert(cylinders.length > 0);
  await query("select", "--clear");
  assert.deepEqual((await query("select", "--surface other")).context.selection, []);
  const selectedCylinders = await query("select", "--surface cylinder");
  assert.deepEqual(selectedCylinders.context.selection, cylinders);
  assert.deepEqual((await inspect(page)).modelingSelection, cylinders);
  assert.deepEqual((await inspect(page)).document, curved);
  const faceRows = (await query("faces")).faces;
  const filtered = faceRows.filter((f) => f.surface === "cylinder" && f.cylinder.radius < 5);
  assert.equal(filtered.length, cylinders.length);
  assert(filtered.every((f) => Math.abs(f.cylinder.radius - 1) < 1e-6));
  assert.deepEqual((await query("context")).context.selection, cylinders);
  if (app) await checkViewPrograms({ page, workspace, query, unchanged, cylinders });
  await page.screenshot({ path: `.cache/sketch-review/${name}-agent-selected-cylinders.png` });
  await query("select", "--clear");
  await settled(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).modelingSelection, cylinders);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  assert.deepEqual((await inspect(page)).document, curved);
  console.log(
    `PASS ${name}: agent replace/add/remove/clear, cylinder filter, manual fillet, selection Undo/Redo; actual face/body/curve/point/empty selection, geometry/measurements, viewport and cutaway, busy rejection; inspection preserves geometry/history/camera/selection`,
  );
} catch (error) {
  await page
    ?.screenshot({ path: `.cache/sketch-review/${name}-agent-inspection-failure.png` })
    .catch(() => {});
  console.error(error);
  throw error;
} finally {
  if (app) {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
    await app.close();
  }
  await browser?.close();
  await server?.close();
}

async function unchanged() {
  const state = await inspect(page);
  return {
    document: state.document,
    camera: state.camera,
    targets: state.modelingSelection,
    points: state.selectionTargets,
    history: await page.evaluate(() => window.makeshiftHistory()),
  };
}
async function query(command, entity) {
  if (!app) return queryBrowserInspection(page, command, entity);
  const prefix = `query-${++counter}`;
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    `makeshift ${command}${entity ? ` ${entity}` : ""} > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
  );
  await page.keyboard.press("Enter");
  let exit;
  for (let i = 0; i < 600; i++) {
    try {
      exit = await readFile(join(workspace, `${prefix}.done`), "utf8");
      if (exit) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  assert(exit, "CLI did not finish");
  if (exit !== "0") throw new Error(await readFile(join(workspace, `${prefix}.err`), "utf8"));
  return JSON.parse(await readFile(join(workspace, `${prefix}.json`), "utf8"));
}
