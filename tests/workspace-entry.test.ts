import assert from "node:assert/strict";
import test from "node:test";
import { ActiveInteraction } from "../src/sketch/active-interaction.js";
import { emptySketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { WorkspaceEntry } from "../src/sketch/editor-workspace.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";

function entryFixture() {
  const interactions = new ActiveInteraction(() => {});
  const hidden = emptySketch(planes.XY),
    visible = emptySketch(planes.XY);
  const data = { units: "mm" as const, sketches: [hidden, visible] };
  const modeling = new ModelSelection();
  modeling.sync(data);
  modeling.targets = [{ kind: "sketch", sketch: visible.id }];
  const entered: NonNullable<World["workspace"]>[] = [];
  let busy = false;
  const editor = {
    interactions,
    modeling,
    get isDragging() {
      return interactions.dragging;
    },
    get blocked() {
      return busy || interactions.finishing;
    },
    store: { data },
    display: data,
    visibility: { visible: (id: string) => id !== hidden.id, show: () => {} },
    world: {
      enterWorkspace: (workspace: NonNullable<World["workspace"]>) => entered.push(workspace),
    },
    refresh: () => {},
  } as unknown as SketchEditor;
  return {
    entry: new WorkspaceEntry(editor),
    interactions,
    modeling,
    data,
    visible,
    entered,
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}

test("workspace entry rejects every active modeling lease independently of candidate validity", () => {
  const fixture = entryFixture();
  for (const kind of [
    "scale",
    "extrude",
    "revolve",
    "face-offset",
    "projection",
    "mirror",
  ] as const) {
    const lease = fixture.interactions.acquire(kind, () => {}, undefined, {
      navigation: "when-released",
    });
    assert.ok(lease);
    assert.equal(fixture.interactions.dragging, false, "released operation permits navigation");
    const selected = fixture.modeling.targets;
    for (const candidate of [null, fixture.data]) {
      lease.show(candidate);
      assert.ok(fixture.entry.reason());
      assert.equal(fixture.entry.canonical("XZ"), false);
      assert.equal(fixture.entry.selected(), false);
      assert.equal(fixture.entry.enter({ key: "saved plane", frame: planes.YZ }), false);
      assert.equal(lease.candidate, candidate);
      assert.equal(fixture.modeling.targets, selected);
    }
    lease.wait();
    assert.equal(fixture.entry.canonical("XY"), false);
    lease.release();
  }
  assert.equal(fixture.entered.length, 0);
  fixture.setBusy(true);
  assert.equal(fixture.entry.canonical("XY"), false);
  fixture.setBusy(false);
  assert.equal(fixture.entry.canonical("XY"), true);
  assert.equal(
    fixture.entered[0].sketchId,
    fixture.visible.id,
    "resume the first visible coplanar sketch",
  );
  assert.deepEqual(fixture.modeling.targets, []);
  assert.equal(fixture.data.sketches.length, 2, "view entry never saves an empty sketch");
});

test("navigation capability defaults to blocked and captured released tools block navigation", () => {
  const owner = new ActiveInteraction(() => {});
  const pointer = owner.acquire("pointer", () => {});
  assert.ok(pointer);
  assert.equal(owner.dragging, true);
  pointer.release();
  const scale = owner.acquire("scale", () => {}, undefined, { navigation: "when-released" });
  assert.ok(scale);
  const element = {
    addEventListener: () => {},
    setPointerCapture: () => {},
    hasPointerCapture: () => false,
  } as unknown as Element;
  scale.capture(element, 1);
  assert.equal(owner.dragging, true);
  scale.releaseCapture();
  assert.equal(owner.dragging, false);
  scale.release();
});

test("all plane entries reuse visible coplanar sketches even when requesting a new identity", () => {
  for (const key of ["Construction plane", "Face sketch", "New sketch"]) {
    const fixture = entryFixture();
    assert.equal(fixture.entry.enter({ key, frame: planes.XY, sketchId: "new-id" }), true);
    assert.equal(fixture.entered[0].sketchId, fixture.visible.id);
    assert.equal(fixture.data.sketches.length, 2);
  }
});

test("explicit selected sketch identity wins over another visible coplanar sketch", () => {
  const fixture = entryFixture();
  const second = emptySketch(planes.XY);
  fixture.data.sketches.push(second);
  fixture.modeling.targets = [{ kind: "sketch", sketch: second.id }];
  assert.equal(fixture.entry.selected(), true);
  assert.equal(fixture.entered[0].sketchId, second.id);
});

test("an unoccupied plane retains its frame without saving an empty sketch", () => {
  const fixture = entryFixture();
  assert.equal(fixture.entry.enter({ key: "saved", frame: planes.XZ }), true);
  assert.deepEqual(fixture.entered[0], { key: "saved", frame: planes.XZ });
  assert.equal(fixture.data.sketches.length, 2);
});
