import assert from "node:assert/strict";
import test from "node:test";
import { SectionStyleSeeds, sectionStyle } from "../src/model/section-pattern.js";

test("Section styles stay tied to body identity and vary across bodies", () => {
  const style = sectionStyle("body-123");
  assert.deepEqual(sectionStyle("body-123"), style);
  assert.notEqual(style.colors[0], style.colors[1]);
  const styles = Array.from({ length: 100 }, (_, i) => sectionStyle(`body-${i}`));
  assert.equal(new Set(styles.map((s) => s.pattern)).size, 4);
  assert.equal(new Set(styles.map((s) => s.colors.join())).size, 6);
});

test("New-body previews retain style through recomputation; accepted bodies use saved identity", () => {
  const seeds = new SectionStyleSeeds();
  assert.equal(seeds.forBody("extrude", 0, "candidate-a", false), "candidate-a");
  assert.equal(seeds.forBody("extrude", 0, "candidate-b", false), "candidate-a");
  assert.equal(seeds.forBody("extrude", 1, "second", false), "second");
  assert.equal(seeds.forBody("extrude", 2, "existing", true), "existing");
  assert.equal(seeds.forBody(null, 0, "candidate-b", true), "candidate-b");
  assert.equal(seeds.forBody("extrude", 0, "next", false), "next");
  assert.equal(seeds.forBody("revolve", 0, "revolved", false), "revolved");
});
