import { validId, validName } from "../security/text.js";
import type { SketchDocument } from "../sketch/document.js";

export interface BenchTab {
  readonly id: string;
  readonly name: string;
}

export interface Bench extends BenchTab {
  readonly document: SketchDocument;
}

export interface Drawing {
  readonly benches: readonly Bench[];
  readonly activeBench: string;
}

export type BenchEdit =
  | { action: "create" }
  | { action: "switch"; id: string }
  | { action: "rename"; id: string; name: string };

export const defaultBench: BenchTab = { id: "main", name: "Bench 1" };

export function singleBench(document: SketchDocument): Drawing {
  return { benches: [{ ...defaultBench, document }], activeBench: defaultBench.id };
}

export function validateBenchLayout(drawing: Drawing): void {
  if (!drawing || !Array.isArray(drawing.benches) || !drawing.benches.length)
    throw new Error("A drawing needs at least one bench");
  const ids = new Set<string>();
  for (const bench of drawing.benches) {
    if (
      !bench ||
      !validId(bench.id) ||
      !validName(bench.name) ||
      ids.has(bench.id) ||
      !bench.document ||
      typeof bench.document !== "object"
    )
      throw new Error("Invalid drawing bench");
    ids.add(bench.id);
  }
  if (!ids.has(drawing.activeBench)) throw new Error("The active drawing bench is missing");
}
