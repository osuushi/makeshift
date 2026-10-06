import assert from "node:assert/strict";
import test from "node:test";
import { ActiveInteraction } from "../src/sketch/active-interaction.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { type ToolAction, ToolCatalog } from "../src/tools/catalog.js";

function context() {
  const events: string[] = [];
  const interactions = new ActiveInteraction(() => events.push("released"));
  const editor = {
    interactions,
    blocked: false,
    isDragging: false,
    message: "",
    refresh: () => events.push("refresh"),
  };
  return {
    events,
    interactions,
    editor,
    catalog: new ToolCatalog(editor as unknown as SketchEditor),
  };
}
function action(run: ToolAction["run"], reason: ToolAction["reason"] = () => null): ToolAction {
  return { finishEdit: true, reason, run };
}

test("discovery borrows ownership; explicit switching accepts then resolves fresh prerequisites", async () => {
  const { events, interactions, catalog } = context();
  let geometry = "original";
  const lease = interactions.acquire(
    "face-offset",
    () => {},
    async () => {
      events.push("accept");
      await Promise.resolve();
      geometry = "accepted";
      lease?.release();
      return true;
    },
    { navigation: "when-released" },
  );
  const next = action(
    () => events.push(`run:${geometry}`),
    () => {
      events.push(`reason:${geometry}`);
      return geometry === "accepted" ? null : "Stale geometry";
    },
  );
  catalog.register({ ...next, id: "threads", label: "Threads", category: "Solid" });
  assert.equal(catalog.results()[0].unavailable, null);
  assert.equal(catalog.reason(next), null);
  assert.equal(interactions.current, lease);
  assert.equal(geometry, "original");
  assert.equal(await catalog.activate(next), true);
  assert.equal(interactions.current, null);
  assert.deepEqual(
    events.filter((event) => !["refresh", "released"].includes(event)),
    ["accept", "reason:accepted", "run:accepted"],
  );
});

test("invalid latest draft stays owned and cannot execute the requested action", async () => {
  const { editor, interactions, catalog } = context();
  let ran = false;
  const lease = interactions.acquire(
    "numeric",
    () => {},
    async () => {
      editor.message = "Invalid thread clearance";
      return false;
    },
    { navigation: "when-released" },
  );
  assert.equal(
    await catalog.activate(
      action(() => {
        ran = true;
      }),
    ),
    false,
  );
  assert.equal(ran, false);
  assert.equal(interactions.current, lease);
  assert.equal(editor.message, "Invalid thread clearance");
  assert.equal(catalog.switching, false);
});

test("acceptance failure, unreleased ownership and unavailable fresh targets block switching", async () => {
  for (const mode of ["false", "unreleased", "unavailable", "throw"] as const) {
    const { editor, interactions, catalog } = context();
    let ran = false;
    const lease = interactions.acquire(
      "face-offset",
      () => {},
      async () => {
        if (mode === "throw") throw new Error("Kernel rejected acceptance");
        if (mode === "false") return false;
        if (mode !== "unreleased") lease?.release();
        return true;
      },
      { navigation: "when-released" },
    );
    const next = action(
      () => {
        ran = true;
      },
      () => (mode === "unavailable" ? "Face no longer exists" : null),
    );
    assert.equal(await catalog.activate(next), false, mode);
    assert.equal(ran, false, mode);
    assert.equal(catalog.switching, false, mode);
    if (mode === "unavailable") assert.equal(editor.message, "Face no longer exists");
    if (mode === "throw") assert.equal(editor.message, "Kernel rejected acceptance");
  }
});

test("one awaited acceptance excludes duplicate activations", async () => {
  const { interactions, catalog } = context();
  let resolve!: (value: boolean) => void;
  let accepts = 0,
    runs = 0;
  const lease = interactions.acquire(
    "face-offset",
    () => {},
    async () => {
      accepts++;
      const accepted = await new Promise<boolean>((done) => {
        resolve = done;
      });
      lease?.release();
      return accepted;
    },
    { navigation: "when-released" },
  );
  const next = action(() => {
    runs++;
  });
  const first = catalog.activate(next);
  assert.equal(catalog.switching, true);
  assert.equal(await catalog.activate(next), false);
  resolve(true);
  assert.equal(await first, true);
  assert.equal(accepts, 1);
  assert.equal(runs, 1);
});

test("held gestures, calculations and unfinished owners retain their ordinary guards", async () => {
  for (const guard of ["drag", "busy", "unfinished"] as const) {
    const { editor, interactions, catalog } = context();
    let ran = false;
    if (guard === "drag") editor.isDragging = true;
    if (guard === "busy") editor.blocked = true;
    if (guard === "unfinished") interactions.acquire("projection", () => {});
    assert.ok(catalog.reason(action(() => {})), guard);
    assert.equal(
      await catalog.activate(
        action(() => {
          ran = true;
        }),
      ),
      false,
      guard,
    );
    assert.equal(ran, false, guard);
  }
});

test("same-controller local changes preserve ownership without accepting its preview", async () => {
  const { interactions, catalog } = context();
  let accepts = 0,
    runs = 0;
  const lease = interactions.acquire(
    "body-edge-finish",
    () => {},
    async () => {
      accepts++;
      return true;
    },
    { navigation: "when-released" },
  );
  const next = {
    ...action(() => {
      runs++;
    }),
    finishEdit: () => false,
  };
  assert.equal(await catalog.activate(next), true);
  assert.equal(interactions.current, lease);
  assert.equal(accepts, 0);
  assert.equal(runs, 1);
});

test("ordinary action rejection propagates to its calling control", async () => {
  const { catalog } = context();
  assert.equal(await catalog.activate(action(() => false)), false);
  assert.equal(catalog.switching, false);
});
