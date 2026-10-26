import { exportTolerance } from "../decorators/precision.js";
import type { SketchDocument } from "../sketch/document.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Refine an accepted snapshot; neither the owner document nor its history is changed. */
export async function exportGeometry(
  document: SketchDocument,
  kernel: SolidCalculator,
  bodyIds?: readonly string[],
): Promise<SketchDocument> {
  const selected = bodyIds ? new Set(bodyIds) : null;
  const scoped = selected
    ? {
        ...document,
        bodies: (document.bodies ?? []).filter((body) => selected.has(body.id)),
        decorators: document.decorators?.flatMap((instance) => {
          const faces = instance.faces.filter((face) => selected.has(face.body));
          return faces.length ? [{ ...instance, faces }] : [];
        }),
      }
    : document;
  const instances = scoped.decorators ?? [];
  if (!instances.length) return scoped;
  const unresolved = instances.find((d) => d.problem);
  if (unresolved) throw new Error(unresolved.problem);
  const ids = new Set(instances.flatMap((d) => d.faces.map((f) => f.body)));
  const bodies = scoped.bodies ?? [];
  const result = await kernel.calculate({
    kind: "inspect",
    bodies: bodies.filter((b) => ids.has(b.id)),
    deflection: exportTolerance(instances, scoped),
  });
  const refined = new Map(materialize([], result).map((b) => [b.id, b]));
  if (ids.size !== refined.size) throw new Error("Export geometry lost a decorated body");
  return {
    ...scoped,
    bodies: bodies.map((body) => {
      const sampled = refined.get(body.id);
      if (!sampled) return body;
      const faces = new Map(sampled.faces.map((face) => [face.id, face]));
      if (faces.size !== body.faces.length) throw new Error("Export geometry changed topology");
      return {
        ...body,
        faces: body.faces.map((face) => {
          const mesh = faces.get(face.id);
          if (!mesh) throw new Error("Export geometry lost a face");
          return { ...face, vertices: mesh.vertices, normals: mesh.normals };
        }),
      };
    }),
  };
}
