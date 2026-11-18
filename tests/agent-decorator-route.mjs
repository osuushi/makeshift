import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function agentDecoratorRoute(page, run, query) {
  const original = (await inspect(page)).document;
  const definition = JSON.parse(await readFile("examples/decorators/linked-pads.json", "utf8"));
  await run(`
const sketch = await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:5}]});
const solid = await makeshift.extrude({sources:sketch.profiles,distance:10,mode:"new"});
const body = solid.bodies[0];
const cylindrical: {body:string;face:string}[] = [];
const planar: {body:string;face:string}[] = [];
for (const face of body.faces) {
  const ref = {body:body.id,face};
  const checked = await makeshift.inspectDecorator({definition:"freac.threads",version:1,faces:[ref]});
  if (checked.reason === null) cylindrical.push(ref); else planar.push(ref);
}
if(cylindrical.length !== 1 || planar.length !== 2) throw new Error("Unexpected cylinder faces");
await makeshift.editDecorator({action:"apply",definition:"freac.threads",faces:cylindrical,settings:{pitch:1.5}});
await makeshift.editDecoratorDefinition({action:"install",definition:${JSON.stringify(definition)}});
const inert = await makeshift.decorators();
if(inert.definitions[0].enabled) throw new Error("Import enabled code");
await makeshift.enableDecorator({id:${JSON.stringify(definition.id)},version:1,enabled:true});
const applied = await makeshift.editDecorator({action:"apply",definition:${JSON.stringify(definition.id)},faces:[planar[0]]});
const pad = applied.instances.find(d => d.definition === ${JSON.stringify(definition.id)})!;
await makeshift.editDecorator({action:"continue",id:pad.id,faces:[planar[1]]});
await makeshift.editDecorator({action:"settings",ids:[pad.id],patch:{height:2}});
await makeshift.transformBodies({ids:[body.id],translation:[3,0,0],pivot:[0,0,0],axis:[0,0,1],angle:0,duplicate:false});
const current = await makeshift.decorators();
const moved = current.instances.find(d=>d.id===pad.id)!;
if(moved.problem || moved.faces.length!==2) throw new Error("Lost scripted continuation");
const validated = await makeshift.inspectDecorator({definition:moved.definition,version:moved.version,instanceId:moved.id,faces:[...moved.faces]});
if(validated.reason) throw new Error(validated.reason);
`);
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.decorators.length, 2);
  assert.equal(accepted.decoratorDefinitions[0].source, definition.source);
  const pad = accepted.decorators.find((d) => d.definition === definition.id);
  assert.equal(pad.faces.length, 2);
  assert.equal(pad.settings.height, 2);
  if (query) {
    const overview = await query("inspect");
    assert.deepEqual(
      overview.decorators,
      accepted.decorators.map(({ id, definition, version, faces }) => ({
        id,
        definition,
        version,
        faces,
      })),
    );
    assert.deepEqual(overview.decoratorDefinitions[0], {
      id: definition.id,
      name: definition.name,
      version: definition.version,
    });
    assert.ok(overview.builtinDecorators[0].fields.some((f) => f.key === "pitch"));
    const face = await query(`inspect ${pad.faces[0].face}`);
    assert.equal(face.targets[0].geometry.decorators[0].id, pad.id);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await assert.rejects(
    () =>
      run(`
await makeshift.enableDecorator({id:${JSON.stringify(definition.id)},version:1,enabled:false});
await makeshift.editDecorator({action:"settings",ids:[${JSON.stringify(pad.id)}],patch:{height:3}});
`),
    /Enable bundled code/,
  );
  assert.deepEqual((await inspect(page)).document, accepted);
  await run(`
const current = await makeshift.decorators();
if(!current.definitions[0].enabled) throw new Error("Failed script changed enablement");
`);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    "PASS agent decorator authoring, source enablement, threads, Continue, scripted transform, validation, Undo/Redo and rollback",
  );
}
