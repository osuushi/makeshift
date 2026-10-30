import type { SketchDocument } from "../sketch/document.js";
import { knurlDefinition } from "./builtins.js";
import { cylinderFrame, resolveFaces } from "./cylinder.js";
import { partitionThreads, validateBuiltin } from "./edits.js";
import type { DecoratorInspection, DecoratorInspectionRequest } from "./inspection.js";
import { patchKnurlSettings } from "./knurl-settings.js";
import { threadInformation } from "./thread-information.js";
import { patchThreadSettings, threadDefaults } from "./thread-settings.js";

export function inspectThreads(
  document: SketchDocument,
  request: DecoratorInspectionRequest,
): DecoratorInspection {
  try {
    if (request.version !== 1) throw new Error("Unsupported decorator version");
    const existing = request.instanceId
      ? document.decorators?.find((d) => d.id === request.instanceId)
      : undefined;
    if (request.instanceId && (!existing || existing.definition !== request.definition))
      throw new Error("Select an existing decorator");
    if (
      document.decorators?.some(
        (d) =>
          !d.problem &&
          d.id !== existing?.id &&
          d.definition !== request.definition &&
          d.faces.some((f) => request.faces.some((r) => r.body === f.body && r.face === f.face)),
      )
    )
      throw new Error("Remove the existing decorator before applying another");
    const groups = partitionThreads(document, request.faces).map((faces) => ({ faces }));
    const diagnostics = groups.flatMap(({ faces }) => {
      const cylinder = resolveFaces(document.bodies ?? [], faces)[0].cylinder;
      const diameter = cylinder.radius * 2;
      const instance = {
        id: "inspection",
        definition: request.definition,
        version: 1,
        frame: cylinderFrame(cylinder),
        ...existing,
        faces,
        settings:
          request.definition === knurlDefinition
            ? patchKnurlSettings(existing?.settings ?? {}, request.settings ?? {})
            : patchThreadSettings(
                diameter,
                existing?.settings ?? threadDefaults(diameter, "fdm-fine", cylinder.outward),
                request.settings ?? {},
                cylinder.outward,
              ),
      };
      validateBuiltin(document, instance);
      if (request.definition === knurlDefinition) return [];
      return threadInformation(document.bodies ?? [], instance).warnings.map((w) => ({
        severity: "warning" as const,
        message: w.message,
        faces: [...w.faces],
      }));
    });
    return { reason: null, groups, diagnostics };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : String(error),
      groups: [],
      diagnostics: [],
    };
  }
}
