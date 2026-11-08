import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileScript } from "../src/agent-cli/compile-script.js";
import { executeScript } from "../src/agent-cli/run-script.js";
import { DocumentOwner } from "../src/backend/document-owner.js";

async function script(source: string, run: (path: string, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-contract-"));
  try {
    const path = join(directory, "input.ts");
    await writeFile(path, source);
    await run(path, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("packaged public declarations compile and execute per-axis scaling with atomic Undo", async () => {
  await script(
    `
const sketch = await makeshift.createSketch({plane:"XY", curves:[{kind:"circle",center:{x:0,y:0},radius:2}]});
const solid = await makeshift.extrude({sources:sketch.profiles,distance:3,mode:"new"});
await freac.scale({kind:"solids",ids:[solid.bodies[0].id],faces:[],edges:[],pivot:[0,0,0],factor:1,factors:[2,3,4]});
`,
    async (path, directory) => {
      const entry = await compileScript(path, directory);
      const owner = new DocumentOwner();
      try {
        const before = owner.view.data;
        owner.beginScript("contract.ts");
        await executeScript(entry, [], async (action, operation) => {
          if (action === "poll") return {};
          assert.equal(action, "step");
          assert.ok(operation);
          return owner.scripts.step(operation);
        });
        assert.equal(owner.view.data, before);
        assert.ok(owner.scripts.finish());
        const accepted = owner.view.data;
        assert.ok(Math.abs((accepted.bodies?.[0].volume ?? 0) - 288 * Math.PI) < 1e-5);
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
        await owner.call({ kind: "redo" });
        assert.equal(owner.view.data, accepted);
      } finally {
        await owner.scripts.cancel();
        owner.close();
      }
    },
  );
});

for (const source of [
  'await makeshift.scale({kind:"sketches",ids:[],pivot:[0,0,0],factor:"large"});',
  'await makeshift.finishEdges({edges:[],mode:"fillet",size:2,limit:true});',
  'await makeshift.booleanBodies({ids:[],mode:"union",keepOriginals:false,experimentalTrimFiltering:true});',
])
  test(`script typechecking rejects unsupported public input: ${source}`, async () => {
    await script(source, async (path, directory) => {
      await assert.rejects(compileScript(path, directory), /Script typecheck failed/);
    });
  });

test("view declarations and the compatibility alias remain available in view mode", async () => {
  await script(
    'await makeshift.faces(); await freac.select([], "replace");',
    async (path, directory) => {
      await compileScript(path, directory, "view");
    },
  );
});
