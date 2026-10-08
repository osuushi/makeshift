import { resolve } from "node:path";

/** Shared renderer inspection adapter for browser routes without the Electron CLI. */
export async function queryBrowserInspection(page, command, entity) {
  return page.evaluate(
    async ({ command, entity, modulePath }) => {
      const context = await window.readInspection(
        command === "render",
        false,
        command === "select" ? JSON.stringify(entity.split(" ")) : undefined,
      );
      if (command === "select" || command === "context") return { units: "mm", context };
      const document = window.makeshiftInspect().document;
      if (command === "faces") {
        const { queryFaces } = await import(
          modulePath.replace("inspection-geometry.ts", "face-query.ts")
        );
        return { units: "mm", faces: queryFaces(document, context) };
      }
      const { inspectionOverview, findInspectionTarget, targetGeometry, measurable } = await import(
        modulePath
      );
      if (command === "render")
        return { ...context, width: context.image.width, height: context.image.height };
      if (command === "inspect" && !entity)
        return { ...inspectionOverview(document, context), context };
      const targets = entity ? [findInspectionTarget(document, entity)] : context.selection;
      const wanted = measurable(targets);
      const reply = wanted.length
        ? await (
            await fetch("/sketch-api", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "measure", targets: wanted }),
            })
          ).json()
        : {};
      return {
        context,
        targets: targets.map((target) => ({
          target,
          geometry: targetGeometry(document, target),
        })),
        measurement: reply.measurement ?? null,
        measurementError: reply.error,
      };
    },
    { command, entity, modulePath: `/@fs/${resolve("src/agent/inspection-geometry.ts")}` },
  );
}
