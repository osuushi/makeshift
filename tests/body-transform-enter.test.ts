import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { installBodyTransformEnter } from "../src/model/body-transform-enter.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { toolCatalog } from "../src/tools/catalog.js";
import { borrowToolFocus, restoreToolFocus } from "../src/tools/menu-focus.js";

class Surface {
  constructor(private kind: string) {}
  closest(selector: string): Surface | null {
    return selector
      .split(",")
      .map((part) => part.trim())
      .includes(this.kind)
      ? this
      : null;
  }
}
function globalSurface(t: TestContext, key: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else Reflect.deleteProperty(globalThis, key);
  });
}
function setup(t: TestContext) {
  const windowEvents = new EventTarget();
  let popover = false;
  globalSurface(t, "window", windowEvents);
  globalSurface(t, "Element", Surface);
  globalSurface(t, "HTMLElement", Surface);
  globalSurface(t, "document", {
    querySelector: () => (popover ? {} : null),
    activeElement: null,
  } as unknown as Document);
  const state = {
    world: { active: null as string | null },
    modeling: { targets: [{ kind: "body", body: "one" }] as ModelingTarget[] },
    interactions: { current: null as unknown },
    isDragging: false,
    blocked: false,
    message: "",
    refresh() {},
  };
  const editor = state as unknown as SketchEditor;
  const abort = new AbortController();
  let calls = 0;
  let reason: string | null = null;
  toolCatalog(editor).register({
    id: "transform",
    label: "Transform",
    category: "Transform",
    reason: () => reason,
    run: () => {
      calls++;
    },
  });
  installBodyTransformEnter(editor, abort.signal);
  async function key(extra: object = {}, target?: Surface) {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(
      event,
      {
        key: "Enter",
        repeat: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      extra,
    );
    if (target) Object.defineProperty(event, "target", { value: target });
    if ("claimed" in extra && extra.claimed) event.preventDefault();
    windowEvents.dispatchEvent(event);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return event;
  }
  return {
    state,
    abort,
    key,
    calls: () => calls,
    unavailable: (value: string) => {
      reason = value;
    },
    popover: () => {
      popover = true;
    },
  };
}

test("idle Enter invokes shared Transform for one or several whole bodies; disposal stops it", async (t) => {
  const route = setup(t);
  assert.equal((await route.key()).defaultPrevented, true);
  assert.equal(route.calls(), 1);
  route.state.modeling.targets.push({ kind: "body", body: "two" });
  await route.key();
  assert.equal(route.calls(), 2);
  route.abort.abort();
  assert.equal((await route.key()).defaultPrevented, false);
  assert.equal(route.calls(), 2);
});

test("Enter leaves other target kinds, modal/busy/captured states and modified/repeated keys to their owner", async (t) => {
  const route = setup(t);
  for (const targets of [
    [],
    [{ kind: "face", body: "one", face: "face" }],
    [{ kind: "sketch", sketch: "sketch" }],
    [
      { kind: "body", body: "one" },
      { kind: "edge", body: "one", edge: "edge" },
    ],
  ] as ModelingTarget[][]) {
    route.state.modeling.targets = targets;
    assert.equal((await route.key()).defaultPrevented, false);
  }
  route.state.modeling.targets = [{ kind: "body", body: "one" }];
  for (const flag of ["blocked", "isDragging"] as const) {
    route.state[flag] = true;
    assert.equal((await route.key()).defaultPrevented, false);
    route.state[flag] = false;
  }
  route.state.interactions.current = { kind: "shell" };
  assert.equal((await route.key()).defaultPrevented, false);
  route.state.interactions.current = null;
  route.state.world.active = "XY";
  assert.equal((await route.key()).defaultPrevented, false);
  route.state.world.active = null;
  for (const extra of [
    { key: "m" },
    { repeat: true },
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
  ])
    assert.equal((await route.key(extra)).defaultPrevented, false);
  assert.equal(route.calls(), 0);
});

test("fields, native controls, agent/dialog/menu focus and prior keyboard ownership never invoke Transform", async (t) => {
  const route = setup(t);
  for (const kind of [
    "input",
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable]",
    ".agent-dock",
    "dialog[open]",
  ])
    assert.equal((await route.key({}, new Surface(kind))).defaultPrevented, false, kind);
  assert.equal((await route.key({ claimed: true })).defaultPrevented, true);
  assert.equal(route.calls(), 0);
  borrowToolFocus();
  assert.equal((await route.key()).defaultPrevented, false);
  restoreToolFocus();
  route.popover();
  assert.equal((await route.key()).defaultPrevented, false);
  assert.equal(route.calls(), 0);
});

test("catalog rechecks availability; an unavailable Transform shows its reason without executing", async (t) => {
  const route = setup(t);
  route.unavailable("Select valid geometry");
  await route.key();
  assert.equal(route.calls(), 0);
  assert.equal(route.state.message, "Select valid geometry");
});
