import assert from "node:assert/strict";
import test from "node:test";
import { inspectionOverview, targetGeometry } from "../src/agent/inspection-geometry.js";
import type { InspectionView } from "../src/agent/inspection-protocol.js";
import { singleBench } from "../src/model/benches.js";
import { documentArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import type { Grant, TrustDevice, TrustPrompt } from "../src/security/content-trust.js";
import { DrawingTrust } from "../src/security/drawing-trust.js";
import { backup, createIdentity, restore, signContent } from "../src/security/identity.js";
import { decoratorDigest, portableDigest, verified } from "../src/security/signatures.js";
import { validName } from "../src/security/text.js";
import { planes } from "../src/sketch/planes.js";

const file = (value: string) => new TextEncoder().encode(value);
const files = {
  "workspace/notes": file("Drawing notes"),
  "conversations/codex/sessions/example.jsonl": file("{}"),
};
const doc = {
  units: "mm" as const,
  sketches: [],
  decoratorDefinitions: [
    { id: "test.pad", version: 1, name: "Pad", source: "/* inert fixture text */", fields: [] },
  ],
};
async function fixture() {
  const alice = await createIdentity("Alice"),
    bob = await createIdentity("Bob"),
    grants: Grant[] = [],
    prompts: TrustPrompt[] = [];
  let answer = 0;
  const device: TrustDevice = {
    identity: async () => alice,
    sign: (s, d, a) => signContent(alice, s, d, a),
    grants: async () => grants,
    grant: async (g) => {
      grants.push(g);
    },
    ask: async (p) => {
      prompts.push(p);
      return answer;
    },
  };
  const trust = new DrawingTrust(device);
  const digest = (await portableDigest(files))!,
    decorators = (await decoratorDigest(doc))!;
  const seals = {
    workspace: await signContent(bob, "workspace", digest, bob),
    decorators: await signContent(bob, "decorators", decorators, bob),
  };
  await trust.opened(doc, files, seals);
  return {
    trust,
    alice,
    bob,
    grants,
    prompts,
    digest,
    decorators,
    seals,
    answer: (n: number) => {
      answer = n;
    },
  };
}
test("geometry-only save and clean copy preserve the original component signatures silently", async () => {
  const f = await fixture(),
    changed = { ...doc, constructionPlanes: [{ id: "work", frame: planes.XZ }] };
  const publication = await f.trust.prepareSave(changed, files);
  const read = readPortableArchive(
    writePortableArchive(documentArchive(changed), files, publication.seals),
  );
  assert.deepEqual(read.seals, f.seals);
  assert.deepEqual(read.files, files);
  const clean = await f.trust.prepareSave(changed, {});
  assert.deepEqual(clean.seals, { decorators: f.seals.decorators });
  assert.equal(f.prompts.length, 0);
  await f.trust.opened(doc, files, {});
  assert.deepEqual((await f.trust.prepareSave(changed, files)).seals, {});
});
test("decorator signatures cover inactive benches and survive adding plain benches", async () => {
  const f = await fixture();
  const empty = { units: "mm" as const, sketches: [] };
  const other = { id: "second", name: "Bench 2", document: empty };
  const current = { activeBench: other.id, benches: [...singleBench(doc).benches, other] };
  assert.equal(await decoratorDigest(current), f.decorators);
  assert.deepEqual((await f.trust.prepareSave(current, files)).seals, f.seals);
  const all = { ...current, benches: [current.benches[0], { ...other, document: doc }] };
  assert.notEqual(await decoratorDigest(all), f.decorators);
  await f.trust.opened(all, files, f.seals);
  assert.equal(await f.trust.allowDecorators(all), false);
  assert.match(f.prompts.at(-1)?.message ?? "", /verification failed/);
});
test("changing a foreign workspace requires informed endorsement; changed paths and history invalidate exact trust", async () => {
  const f = await fixture();
  f.answer(1);
  assert.equal(await f.trust.authorize("workspace", f.digest), "allow");
  assert.equal(await f.trust.authorize("workspace", f.digest), "allow");
  assert.equal(f.prompts.length, 1);
  const changed = { ...files, "conversations/codex/sessions/example.jsonl": file("changed") };
  assert.notEqual(
    await portableDigest({ "workspace/other": files["workspace/notes"] }),
    await portableDigest({ "workspace/notes": files["workspace/notes"] }),
  );
  const next = await f.trust.prepareSave(doc, changed);
  assert.match(f.prompts.at(-1)!.detail, /previous version was signed by Bob/);
  assert.match(f.prompts.at(-1)!.detail, /personally vouch/);
  assert.equal(next.seals.workspace?.key, f.alice.key);
  assert(await verified("workspace", await portableDigest(changed), next.seals.workspace!));
  assert.deepEqual(next.seals.decorators, f.seals.decorators);
  f.answer(0);
  assert.equal((await f.trust.prepareSave(doc, changed)).seals.workspace, undefined);
  f.answer(2);
  await assert.rejects(f.trust.prepareSave(doc, changed), /cancelled/);
  assert.deepEqual((await f.trust.prepareSave(doc, files)).seals, f.seals);
});
test("author trust is capability-scoped and invalid signatures stay blocked even for a trusted signer", async () => {
  const f = await fixture();
  f.answer(2);
  assert.equal(await f.trust.authorize("workspace", f.digest), "allow");
  f.answer(0);
  assert.equal(await f.trust.allowDecorators(doc), false);
  const changed = { ...files, "workspace/notes": file("new") },
    digest = (await portableDigest(changed))!;
  await f.trust.opened(doc, changed, f.seals);
  assert.equal(await f.trust.authorize("workspace", digest), "deny");
  assert.match(f.prompts.at(-1)!.message, /failed/);
  const valid = await signContent(f.bob, "workspace", digest, f.bob);
  await f.trust.opened(doc, changed, { workspace: valid });
  assert.equal(await f.trust.authorize("workspace", digest), "allow");
  assert.equal(await verified("decorators", digest, valid), false);
  assert.equal(await verified("workspace", digest, { ...valid, name: "Alice" }), false);
});
test("normal inspection excludes dormant source, saved extension fields and unbounded entity names", () => {
  const sketch = {
    id: "sketch",
    plane: { ...planes.XY, extra: "opaque" },
    curves: [
      {
        kind: "circle" as const,
        id: "c",
        radius: 1,
        center: { x: 0, y: 0, extra: "opaque" },
        construction: false,
        extra: "opaque",
      },
    ],
    constraints: [],
    groups: [],
    extra: "opaque",
  };
  const model = { ...doc, sketches: [sketch] },
    view = { hidden: [], bodiesVisible: true } as unknown as InspectionView;
  assert.doesNotMatch(JSON.stringify(inspectionOverview(model, view)), /opaque|inert fixture/);
  assert.doesNotMatch(
    JSON.stringify(targetGeometry(model, { kind: "sketch", sketch: "sketch" })),
    /opaque/,
  );
  assert(validName("結".repeat(96)));
  assert(!validName("a".repeat(97)));
  assert(!validName("x\ny"));
  assert(!validName("x\u202ey"));
});
test("encrypted backup restores the same signing key and rejects the wrong passphrase", async () => {
  const identity = await createIdentity("Bob");
  const data = await backup(identity, "test backup passphrase");
  assert(!data.includes(identity.privateKey.d!));
  const recovered = await restore(data, "test backup passphrase");
  assert.equal(recovered.key, identity.key);
  await assert.rejects(restore(data, "wrong passphrase"));
});
