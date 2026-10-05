import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { roundBody } from "../.cache/sketch-tests/tests/decorator-domain-fixtures.js";

const owner = new DocumentOwner();
let document;
try {
  const faces = [];
  for (let i = 0; i < 2; i++) {
    const body = await roundBody(owner, [5], 20);
    const face = body.faces.find((candidate) => candidate.cylinder);
    assert.ok(face);
    faces.push({ body: body.id, face: face.id });
  }
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: { action: "apply", definition: "freac.threads", faces },
      })
    ).error,
    undefined,
  );
  document = owner.view.data;
  assert.equal(document.decorators.length, 2);
} finally {
  owner.close();
}

const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const requestedRate = Number(process.env.MAKESHIFT_PREVIEW_CPU_RATE ?? 1);
      const pressure = name === "chromium" && requestedRate > 1 ? requestedRate : 1;
      if (pressure > 1) {
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: pressure });
      }
      await page.goto(server.resolvedUrls.local[0]);
      const results = await page.evaluate(
        async ({ document, path, signaturePath, placementPath }) => {
          const { default: PreviewWorker } = await import(path);
          const { previewSignatures } = await import(signaturePath);
          const { placedDocument } = await import(placementPath);
          const worker = new PreviewWorker();
          const render = (snapshot, live) =>
            new Promise((resolve, reject) => {
              const started = performance.now();
              const timer = setTimeout(() => reject(new Error("Preview worker timeout")), 30000);
              worker.onmessage = (event) => {
                clearTimeout(timer);
                if (event.data.error) reject(new Error(event.data.error));
                else
                  resolve({
                    milliseconds: Math.round(performance.now() - started),
                    workerMs: Math.round(event.data.elapsedMs),
                    triangles: event.data.meshes.map(({ indices }) => indices.length / 3),
                    processedIds: event.data.processedIds,
                    samples: event.data.samples,
                  });
              };
              worker.onerror = (event) => {
                clearTimeout(timer);
                reject(new Error(event.message));
              };
              worker.postMessage({
                document: snapshot,
                sources: [],
                live,
                signatures: [...previewSignatures(snapshot, "[]")],
              });
            });
          try {
            const live = [await render(document, true)];
            const identical = await render(document, true);
            const edit = (ids, shift) => ({
              ids,
              pivot: [0, 0, 0],
              axis: [0, 0, 1],
              angle: 0,
              translation: [shift, 0, 0],
              duplicate: false,
            });
            const oneMoved = placedDocument(document, edit([document.bodies[0].id], 0.1));
            const unaffected = await render(oneMoved, true);
            for (let i = 1; i <= 3; i++) {
              const moved = placedDocument(
                document,
                edit(
                  document.bodies.map((body) => body.id),
                  i * 0.2,
                ),
              );
              live.push(await render(moved, true));
            }
            const settled = await render(document, false);
            const oneLiveFromSettled = await render(oneMoved, true);
            const repeatedOneLive = await render(oneMoved, true);
            const oneSettled = await render(oneMoved, false);
            return {
              live,
              identical,
              unaffected,
              settled,
              oneLiveFromSettled,
              repeatedOneLive,
              oneSettled,
            };
          } finally {
            worker.terminate();
          }
        },
        {
          document,
          path: `/@fs/${resolve("src/decorators/preview-worker.ts")}?worker`,
          signaturePath: `/@fs/${resolve("src/decorators/preview-signatures.ts")}`,
          placementPath: `/@fs/${resolve("src/model/body-placement.ts")}`,
        },
      );
      assert.equal(results.live[0].triangles.length, 2);
      assert.equal(results.identical.processedIds.length, 0);
      assert.equal(results.unaffected.processedIds.length, 1);
      assert.equal(results.oneLiveFromSettled.processedIds.length, 1);
      assert.equal(results.repeatedOneLive.processedIds.length, 0);
      assert.equal(results.oneSettled.processedIds.length, 1);
      assert.ok(
        results.live[0].triangles.every((count, i) => count < results.settled.triangles[i]),
        `${name}: first live preview should be cheaper than the settled preview`,
      );
      assert.ok(
        results.live.at(-1).triangles.every((count, i) => count >= results.live[0].triangles[i]),
        `${name}: measured headroom should raise live detail`,
      );
      console.log(
        `${name}: adaptive live and full-quality settled previews passed (requested page CPU throttle ${pressure}x; measured worker timing, not tester hardware)`,
        JSON.stringify(results),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
