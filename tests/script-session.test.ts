import assert from "node:assert/strict";
import test from "node:test";
import type { InspectionView } from "../src/agent/inspection-protocol.js";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { ScriptSession } from "../src/backend/script-session.js";

test("lost heartbeat cancels pending work and publishes its end only once", async () => {
  let rejectStep!: (error: Error) => void;
  const work = new Promise<never>((_, reject) => {
    rejectStep = reject;
  });
  const published: boolean[] = [];
  let reason = "";
  const owner = {
    beginScript() {},
    view: {},
    scripts: {
      step: () => work,
      cancel: async (error: string) => {
        if (!reason) reason = error;
        rejectStep(new Error("Script cancelled"));
      },
    },
  } as unknown as DocumentOwner;
  const session = new ScriptSession(
    owner,
    async () => ({ selection: [] }) as unknown as InspectionView,
    (running) => published.push(running),
    () => true,
    () => {},
  );
  const { token } = (await session.request({ action: "begin", name: "disconnect" }, "channel")) as {
    token: string;
  };
  const step = session.request(
    {
      action: "step",
      token,
      operation: {
        kind: "createSketch",
        input: { plane: "XY", curves: [] },
      },
    },
    "channel",
  );
  await assert.rejects(session.request({ action: "cancel", token }, "other"), /connection/);
  await assert.rejects(step, /cancelled/);
  assert.equal(reason, "Script runner disconnected");
  assert.equal(session.busy, false);
  assert.deepEqual(published, [true, false]);
});

test("script acquisition resolves modal work before backend ownership and excludes duplicate starts", async () => {
  const events: string[] = [];
  let ready!: (view: InspectionView) => void;
  const acquired = new Promise<InspectionView>((resolve) => {
    ready = resolve;
  });
  const owner = {
    beginScript: () => events.push("begin"),
    view: {},
    scripts: { finish: () => false, cancel: async () => {} },
  } as unknown as DocumentOwner;
  const session = new ScriptSession(
    owner,
    () => acquired,
    (running) => events.push(running ? "running" : "stopped"),
    () => true,
    () => {},
  );
  const beginning = session.request({ action: "begin", name: "after-modal" }, "channel");
  assert.equal(session.busy, true);
  assert.deepEqual(events, [], "No script ownership while the renderer resolves the modal");
  await assert.rejects(
    session.request({ action: "begin", name: "duplicate" }, "channel"),
    /current operation/,
  );
  ready({ selection: [] } as unknown as InspectionView);
  const { token } = (await beginning) as { token: string };
  assert.deepEqual(events, ["begin", "running"]);
  await session.request({ action: "finish", token }, "channel");
  assert.equal(session.busy, false);
});

test("cancel during modal acquisition cannot start a late script", async () => {
  let ready!: (view: InspectionView) => void;
  const acquired = new Promise<InspectionView>((resolve) => {
    ready = resolve;
  });
  let began = false;
  const owner = {
    beginScript: () => {
      began = true;
    },
    view: {},
  } as unknown as DocumentOwner;
  const states: boolean[] = [];
  const session = new ScriptSession(
    owner,
    () => acquired,
    (running) => states.push(running),
    () => true,
    () => {},
  );
  const beginning = session.request({ action: "begin", name: "cancelled" }, "channel");
  const rejection = assert.rejects(beginning, /cancelled before start/);
  await session.cancel();
  ready({ selection: [] } as unknown as InspectionView);
  await rejection;
  assert.equal(began, false);
  assert.equal(session.busy, false);
  assert.deepEqual(states, [false]);
});
