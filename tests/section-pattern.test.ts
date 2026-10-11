import assert from "node:assert/strict";
import test from "node:test";
import { SectionPalettes, SectionStyleSeeds, sectionStyle } from "../src/model/section-pattern.js";

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

test("Colliding body hashes receive distinct palettes, stable through reorder and additions", () => {
  // IDs from the founder capture all independently selected the blue palette.
  const bodies = [
    "2d19e143-c29c-4223-a510-18c6a4670f3e",
    "3813f1c0-fbae-4881-9fc4-c615cb3ad925",
    "b816349f-fbd6-47cf-8dd6-e40f0996e858",
    "2868547e-082f-4f84-b88f-e1054b1847a3",
  ];
  assert.equal(new Set(bodies.map((id) => sectionStyle(id).colors)).size, 1);
  const palettes = new SectionPalettes();
  const first = new Map(palettes.forBodies(bodies));
  assert.equal(new Set(first.values()).size, 4);
  assert.deepEqual(new Map(palettes.forBodies([...bodies].reverse())), first);
  palettes.forBodies(bodies.slice(1));
  assert.deepEqual(new Map(palettes.forBodies(bodies)), first, "Visibility preserves colors");
  const extended = palettes.forBodies([...bodies, "extra-a", "extra-b", "extra-c"]);
  for (const id of bodies) assert.equal(extended.get(id), first.get(id));
  const counts = [...extended.values()].reduce((counts, palette) => {
    counts[palette] = (counts[palette] ?? 0) + 1;
    return counts;
  }, [] as number[]);
  assert.equal(Math.max(...counts) - Math.min(...counts), 1);
});
