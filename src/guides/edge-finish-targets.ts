import type { BodyEdgeFinish } from "../model/body.js";
import type { EdgeFinishFrame } from "../model/edge-finish-direction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { near } from "./geometry.js";
import type { GuideMoveCandidate } from "./move-target.js";
import { surfaceGuideTargets } from "./surface-targets.js";
import type { GuideSurfacePlan } from "./tool-path.js";

async function targets(editor: SketchEditor, operation: Omit<BodyEdgeFinish, "size">) {
  const candidates = surfaceGuideTargets(editor, () => 1);
  const unique = candidates.filter(
    (p, i) => candidates.findIndex((q) => near(p.point, q.point)) === i,
  );
  const sizes = await editor.store.edgeFinishTargets(
    operation,
    unique.map((p) => p.point),
  );
  return candidates.flatMap((candidate): GuideMoveCandidate[] => {
    const index = unique.findIndex((p) => near(p.point, candidate.point));
    const distance = sizes[index];
    return distance === null || distance === undefined ? [] : [{ ...candidate, distance }];
  });
}

export function edgeFinishSurfacePlan(
  editor: SketchEditor,
  frame: EdgeFinishFrame | null,
  mode: BodyEdgeFinish["mode"],
  settled: GuideSurfacePlan["settled"],
): GuideSurfacePlan | null {
  return frame
    ? {
        origin: frame.anchor,
        targets: targets(editor, { edges: frame.edges, mode }),
        settled,
      }
    : null;
}
