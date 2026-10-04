import { pathToFileURL } from "node:url";
import type { ScriptApi, ScriptOperation } from "../agent-script/api.js";

let pending: { resolve(value: unknown): void; reject(error: Error): void } | null = null;
let failed = false;
process.on("disconnect", () => process.exit(1));
function call(operation: ScriptOperation): Promise<unknown> {
  if (pending || failed) {
    failed = true;
    return Promise.reject(
      new Error("Await each script operation; a failed call aborts the script"),
    );
  }
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    process.send?.({ kind: "operation", operation });
  });
}
process.on(
  "message",
  (message: {
    kind: string;
    value?: unknown;
    error?: string;
    selection?: ScriptApi["selection"];
  }) => {
    if (message.kind === "reply") {
      const waiting = pending;
      pending = null;
      if (message.error) {
        failed = true;
        waiting?.reject(new Error(message.error));
      } else waiting?.resolve(message.value);
    } else if (message.kind === "start") {
      const api: ScriptApi = {
        fitMesh: (input) => call({ kind: "fitMesh", input }) as ReturnType<ScriptApi["fitMesh"]>,
        taggedGroups: () =>
          call({ kind: "taggedGroups", input: {} }) as ReturnType<ScriptApi["taggedGroups"]>,
        editTaggedGroup: (input) =>
          call({ kind: "editTaggedGroup", input }) as ReturnType<ScriptApi["editTaggedGroup"]>,
        applyTaggedGroup: (input) =>
          call({ kind: "applyTaggedGroup", input }) as ReturnType<ScriptApi["applyTaggedGroup"]>,
        topology: (input) => call({ kind: "topology", input }) as ReturnType<ScriptApi["topology"]>,
        replaceFace: (input) =>
          call({ kind: "replaceFace", input }) as ReturnType<ScriptApi["replaceFace"]>,
        selection: structuredClone(message.selection ?? []),
        decorators: () =>
          call({ kind: "decorators", input: {} }) as ReturnType<ScriptApi["decorators"]>,
        editDecorator: (input) =>
          call({ kind: "editDecorator", input }) as ReturnType<ScriptApi["editDecorator"]>,
        editDecoratorDefinition: (input) =>
          call({ kind: "editDecoratorDefinition", input }) as ReturnType<
            ScriptApi["editDecoratorDefinition"]
          >,
        enableDecorator: (input) =>
          call({ kind: "enableDecorator", input }) as ReturnType<ScriptApi["enableDecorator"]>,
        inspectDecorator: (input) =>
          call({ kind: "inspectDecorator", input }) as ReturnType<ScriptApi["inspectDecorator"]>,
        booleanBodies: (input) =>
          call({ kind: "booleanBodies", input }) as ReturnType<ScriptApi["booleanBodies"]>,
        finishEdges: (input) =>
          call({ kind: "finishEdges", input }) as ReturnType<ScriptApi["finishEdges"]>,
        shell: (input) => call({ kind: "shell", input }) as ReturnType<ScriptApi["shell"]>,
        erode: (input) => call({ kind: "erode", input }) as ReturnType<ScriptApi["erode"]>,
        constructionPlane: (input) =>
          call({ kind: "constructionPlane", input }) as ReturnType<ScriptApi["constructionPlane"]>,
        deleteConstructionPlane: (input) =>
          call({ kind: "deleteConstructionPlane", input }) as ReturnType<
            ScriptApi["deleteConstructionPlane"]
          >,
        splitBody: (input) =>
          call({ kind: "splitBody", input }) as ReturnType<ScriptApi["splitBody"]>,
        imprint: (input) => call({ kind: "imprint", input }) as ReturnType<ScriptApi["imprint"]>,
        scale: (input) => call({ kind: "scale", input }) as ReturnType<ScriptApi["scale"]>,
        createSketch: (input) =>
          call({ kind: "createSketch", input }) as ReturnType<ScriptApi["createSketch"]>,
        extrude: (input) => call({ kind: "extrude", input }) as ReturnType<ScriptApi["extrude"]>,
        sweep: (input) => call({ kind: "sweep", input }) as ReturnType<ScriptApi["sweep"]>,
        loft: (input) => call({ kind: "loft", input }) as ReturnType<ScriptApi["loft"]>,
        revolve: (input) => call({ kind: "revolve", input }) as ReturnType<ScriptApi["revolve"]>,
        offsetFaces: (input) =>
          call({ kind: "offsetFaces", input }) as ReturnType<ScriptApi["offsetFaces"]>,
        moveFaces: (input) =>
          call({ kind: "moveFaces", input }) as ReturnType<ScriptApi["moveFaces"]>,
        transformBodies: (input) =>
          call({ kind: "transformBodies", input }) as ReturnType<ScriptApi["transformBodies"]>,
      };
      Object.defineProperty(globalThis, "makeshift", { value: Object.freeze(api) });
      Object.defineProperty(globalThis, "freac", { value: api });
      void execute();
    }
  },
);
async function execute(): Promise<void> {
  try {
    await import(pathToFileURL(process.argv[2]).href);
    if (pending || failed)
      throw new Error("Script ended with an unawaited or failed modeling call");
    process.send?.({ kind: "done" });
  } catch (error) {
    process.send?.({
      kind: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
