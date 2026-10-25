import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { GuideDiscovery } from "../src/guides/discovery.js";
import { hoverGuides } from "../src/guides/hover.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { prism, square } from "./body-edge-fixtures.js";
import { pickingEditor } from "./body-picking-fixtures.js";

test("guide discovery yields, coalesces current inputs and discards cancelled work", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const editor = pickingEditor([body]);
    Object.assign(editor, {
      modeling: new ModelSelection(),
      selectionOwners: new Set(),
      tool: "select",
    });
    const face = body.faces.find((face) => face.plane?.origin[2] === 10);
    assert.ok(face);
    editor.modeling.targets = [{ kind: "face", body: body.id, face: face.id }];
    const pointer = editor.world.project([10, 10, 10]);
    const tasks = new Set<() => void>();
    const tick = () => {
      const next = tasks.values().next().value;
      assert.ok(next);
      tasks.delete(next);
      next();
    };
    const flush = () => {
      let ticks = 0;
      while (tasks.size) {
        assert.ok(ticks++ < 100);
        tick();
      }
    };
    let published = 0;
    const discovery = new GuideDiscovery(
      editor,
      () => published++,
      (run) => {
        tasks.add(run);
        return () => tasks.delete(run);
      },
    );
    assert.deepEqual(discovery.update(pointer, true), []);
    assert.equal(published, 0, "Selection refresh must never perform discovery synchronously");
    tick();
    assert.equal(published, 0, "Discovery yields before filtering and destination probes");
    discovery.update(pointer, true);
    assert.equal(tasks.size, 1, "Unchanged redraws retain one pending job");
    flush();
    assert.equal(published, 1);
    const expected = hoverGuides(editor, pointer);
    assert.ok(expected.length);
    assert.deepEqual(discovery.update(pointer, true), expected);
    const elsewhere = { x: pointer.x + 10, y: pointer.y + 10 };
    assert.deepEqual(discovery.update(elsewhere, true), []);
    tick();
    editor.modeling.targets = [];
    discovery.update(elsewhere, true);
    flush();
    assert.equal(published, 2, "The superseded selection must not publish");
    assert.deepEqual(discovery.update(elsewhere, true), []);
    discovery.update(pointer, true);
    discovery.update(pointer, false);
    assert.equal(tasks.size, 0, "Tool entry cancels candidate work");
    discovery.update(pointer, true);
    discovery.dispose();
    assert.equal(tasks.size, 0, "Window disposal cancels queued discovery");
  } finally {
    owner.close();
  }
});
